const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  TextDisplayBuilder,
} = require('discord.js');

const { sessions } = require('../../utils/claimStore');
const {
  attendanceSessions,
  buildAttendanceSession,
  setAttendeeStatus,
  isComplete,
} = require('../../utils/attendanceStore');
const {
  buildAttendanceMarkingMessage,
  buildAttendanceFormMessage,
  buildAttendanceLog,
} = require('../../utils/attendanceMessages');

async function sendLog(client, payload) {
  const logChannelId = process.env.LOG_CHANNEL_ID;
  if (!logChannelId) return;
  try {
    const ch = await client.channels.fetch(logChannelId);
    if (ch?.isTextBased()) await ch.send(payload);
  } catch (err) {
    console.error('[Attendance] Failed to send log:', err);
  }
}

async function refreshAttendancePanel(client, attSession) {
  try {
    const channel = await client.channels.fetch(attSession.channelId);
    const msg = await channel.messages.fetch(attSession.messageId);
    await msg.edit(buildAttendanceMarkingMessage(attSession));
  } catch (err) {
    console.error('[Attendance] Failed to refresh panel:', err);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('attendance')
    .setDescription('Record attendance for a completed training session')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub
        .setName('record')
        .setDescription('Open the attendance marking panel for a session')
        .addStringOption(opt =>
          opt.setName('session_id')
            .setDescription('The claim session ID to record attendance for')
            .setRequired(true))),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'record') return handleRecord(interaction, client);
  },

  async handleButton(interaction, client) {
    const parts  = interaction.customId.split(':');
    const action = parts[1];

    if (action === 'open_form') {
      const sessionId  = parts[2];
      const page       = parseInt(parts[3], 10);
      const attSession = attendanceSessions.get(sessionId);

      if (!attSession) return interaction.reply({ content: '⚠️ Session no longer exists.', flags: (1 << 6) });
      if (attSession.hostId !== interaction.user.id) return interaction.reply({ content: '⚠️ Only the host can mark attendance.', flags: (1 << 6) });

      return interaction.reply(buildAttendanceFormMessage(attSession, page));
    }

    if (action === 'close_form') {
  return interaction.update({
    components: [
      new TextDisplayBuilder().setContent('✅ Done! You can dismiss this message.'),
    ],
    flags: (1 << 15) | (1 << 6),
  });
}

    if (action === 'finalize') {
      const sessionId  = parts[2];
      const attSession = attendanceSessions.get(sessionId);

      if (!attSession) return interaction.reply({ content: '⚠️ Session no longer exists.', flags: (1 << 6) });
      if (attSession.finalized) return interaction.reply({ content: '⚠️ Already finalized.', flags: (1 << 6) });
      if (attSession.hostId !== interaction.user.id) return interaction.reply({ content: '⚠️ Only the host can finalize.', flags: (1 << 6) });
      if (!isComplete(attSession)) return interaction.reply({ content: '⚠️ Not everyone has been marked yet.', flags: (1 << 6) });

      attSession.finalized = true;
      await interaction.update(buildAttendanceMarkingMessage(attSession));
      await sendLog(client, buildAttendanceLog(attSession));
      attendanceSessions.delete(sessionId);
      console.log(`[Attendance] Session ${sessionId} finalized by ${interaction.user.tag}`);
    }
  },

  async handleSelect(interaction, client) {
  const parts     = interaction.customId.split(':');
  const action    = parts[1];
  const sessionId = parts[2];
  const userId    = parts[3];
  const status    = interaction.values[0];

  if (action !== 'set_status') return;

  const attSession = attendanceSessions.get(sessionId);
  if (!attSession) return interaction.reply({ content: '⚠️ Session no longer exists.', flags: (1 << 6) });
  if (attSession.hostId !== interaction.user.id) return interaction.reply({ content: '⚠️ Only the host can mark attendance.', flags: (1 << 6) });

  setAttendeeStatus(attSession, userId, status);

  const page = attSession.attendees.findIndex(a => a.userId === userId);
  const pageNum = Math.floor(page / 5);

  // Update the ephemeral form and refresh the main panel simultaneously
  await Promise.all([
    interaction.update(buildAttendanceFormMessage(attSession, pageNum)),
    refreshAttendancePanel(client, attSession),
  ]);
},
};

async function handleRecord(interaction, client) {
  const sessionId    = interaction.options.getString('session_id');
  const claimSession = sessions.get(sessionId);

  if (!claimSession) return interaction.reply({ content: `⚠️ No claim session found with ID \`${sessionId}\`.`, flags: (1 << 6) });
  if (claimSession.hostId !== interaction.user.id) return interaction.reply({ content: '⚠️ Only the host can record attendance.', flags: (1 << 6) });
  if (attendanceSessions.has(sessionId)) return interaction.reply({ content: `⚠️ Attendance panel for \`${sessionId}\` is already open.`, flags: (1 << 6) });

  const attSession = buildAttendanceSession(claimSession);

  try {
    const msg = await interaction.reply({ ...buildAttendanceMarkingMessage(attSession), fetchReply: true });
    attSession.channelId = msg.channelId;
    attSession.messageId = msg.id;
    attendanceSessions.set(sessionId, attSession);
    console.log(`[Attendance] Panel opened for session ${sessionId} by ${interaction.user.tag}`);
  } catch (err) {
    console.error('[Attendance] Failed to send panel:', err);
  }
}