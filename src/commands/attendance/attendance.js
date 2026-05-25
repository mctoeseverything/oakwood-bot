const {
  SlashCommandBuilder,
  PermissionFlagsBits,
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
  buildAttendanceModal,
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

  // attendance:open_modal:<sessionId>:<page>
  // attendance:finalize:<sessionId>
  async handleButton(interaction, client) {
    const parts  = interaction.customId.split(':');
    const action = parts[1];

    if (action === 'open_modal') {
      const sessionId  = parts[2];
      const page       = parseInt(parts[3], 10);
      const attSession = attendanceSessions.get(sessionId);

      if (!attSession) return interaction.reply({ content: '⚠️ Session no longer exists.', ephemeral: true });
      if (attSession.hostId !== interaction.user.id) return interaction.reply({ content: '⚠️ Only the host can mark attendance.', ephemeral: true });

      const modal = buildAttendanceModal(attSession, page);
      return interaction.showModal(modal);
    }

    if (action === 'finalize') {
      const sessionId  = parts[2];
      const attSession = attendanceSessions.get(sessionId);

      if (!attSession) return interaction.reply({ content: '⚠️ Session no longer exists.', ephemeral: true });
      if (attSession.finalized) return interaction.reply({ content: '⚠️ Already finalized.', ephemeral: true });
      if (attSession.hostId !== interaction.user.id) return interaction.reply({ content: '⚠️ Only the host can finalize.', ephemeral: true });
      if (!isComplete(attSession)) return interaction.reply({ content: '⚠️ Not everyone has been marked yet.', ephemeral: true });

      attSession.finalized = true;
      await interaction.update(buildAttendanceMarkingMessage(attSession));
      await sendLog(client, buildAttendanceLog(attSession));
      attendanceSessions.delete(sessionId);
      console.log(`[Attendance] Session ${sessionId} finalized by ${interaction.user.tag}`);
    }
  },

  // attendance:submit:<sessionId>:<page>
  async handleModal(interaction, client) {
    const parts      = interaction.customId.split(':');
    const sessionId  = parts[2];
    const attSession = attendanceSessions.get(sessionId);

    if (!attSession) return interaction.reply({ content: '⚠️ Session no longer exists.', ephemeral: true });
    if (attSession.hostId !== interaction.user.id) return interaction.reply({ content: '⚠️ Only the host can submit attendance.', ephemeral: true });

    // Each field customId is att_<userId>
    for (const [customId, field] of interaction.fields.fields) {
      if (customId.startsWith('att_')) {
        const userId = customId.replace('att_', '');
        const status = field.value;
        setAttendeeStatus(attSession, userId, status);
      }
    }

    await interaction.update(buildAttendanceMarkingMessage(attSession));
  },
};

async function handleRecord(interaction, client) {
  const sessionId    = interaction.options.getString('session_id');
  const claimSession = sessions.get(sessionId);

  if (!claimSession) return interaction.reply({ content: `⚠️ No claim session found with ID \`${sessionId}\`.`, ephemeral: true });
  if (claimSession.hostId !== interaction.user.id) return interaction.reply({ content: '⚠️ Only the host can record attendance.', ephemeral: true });
  if (attendanceSessions.has(sessionId)) return interaction.reply({ content: `⚠️ Attendance panel for \`${sessionId}\` is already open.`, ephemeral: true });

  const attSession = buildAttendanceSession(claimSession);
  const panel      = buildAttendanceMarkingMessage(attSession);

  try {
    await interaction.reply(panel);
    attendanceSessions.set(sessionId, attSession);
    console.log(`[Attendance] Panel opened for session ${sessionId} by ${interaction.user.tag}`);
  } catch (err) {
    console.error('[Attendance] Failed to send panel:', err);
  }
}