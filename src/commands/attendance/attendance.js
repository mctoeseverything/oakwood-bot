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
  buildSingleMarkMessage,
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

  async handleButton(interaction, client) {
    const parts  = interaction.customId.split(':');
    const action = parts[1];

    // Open the single-person marking dropdown
    if (action === 'mark_next') {
      const sessionId  = parts[2];
      const attSession = attendanceSessions.get(sessionId);

      if (!attSession) return interaction.reply({ content: '⚠️ Session no longer exists.', ephemeral: true });
      if (attSession.hostId !== interaction.user.id) return interaction.reply({ content: '⚠️ Only the host can mark attendance.', ephemeral: true });

      const nextUnmarked = attSession.attendees.find(a => a.status === null);
      if (!nextUnmarked) return interaction.reply({ content: '⚠️ Everyone is already marked.', ephemeral: true });

      const markMsg = buildSingleMarkMessage(attSession, nextUnmarked);
      return interaction.reply(markMsg);
    }

    if (action === 'finalize') {
      const sessionId  = parts[2];
      const attSession = attendanceSessions.get(sessionId);

      if (!attSession) return interaction.reply({ content: '⚠️ Session no longer exists.', ephemeral: true });
      if (attSession.finalized) return interaction.reply({ content: '⚠️ Already finalized.', ephemeral: true });
      if (attSession.hostId !== interaction.user.id) return interaction.reply({ content: '⚠️ Only the host can finalize.', ephemeral: true });
      if (!isComplete(attSession)) return interaction.reply({ content: '⚠️ Not everyone has been marked yet.', ephemeral: true });

      attSession.finalized = true;
      const updatedPanel = buildAttendanceMarkingMessage(attSession);
      await interaction.update(updatedPanel);

      await sendLog(client, buildAttendanceLog(attSession));
      attendanceSessions.delete(sessionId);
      console.log(`[Attendance] Session ${sessionId} finalized by ${interaction.user.tag}`);
    }
  },

  // attendance:set_status:<sessionId>:<userId>
  async handleSelect(interaction, client) {
    const parts     = interaction.customId.split(':');
    const action    = parts[1];
    const sessionId = parts[2];
    const userId    = parts[3];
    const status    = interaction.values[0];

    if (action !== 'set_status') return;

    const attSession = attendanceSessions.get(sessionId);
    if (!attSession) return interaction.reply({ content: '⚠️ Session no longer exists.', ephemeral: true });
    if (attSession.hostId !== interaction.user.id) return interaction.reply({ content: '⚠️ Only the host can mark attendance.', ephemeral: true });

    setAttendeeStatus(attSession, userId, status);

    // Update this ephemeral message to show confirmation
    const nextUnmarked = attSession.attendees.find(a => a.status === null);
    const confirmText  = nextUnmarked
      ? `✅ Marked. Click **Mark ${getRoleLabel(nextUnmarked.role)}** on the panel for the next person.`
      : `✅ All attendees marked! Click **Finalize Attendance** on the panel.`;

    await interaction.update({
      components: [],
      flags: (1 << 15) | (1 << 6),
    });

    // Also update the main panel
    // We need to find and edit the original panel message
    // For simplicity, follow up with confirmation and let them see updated panel
    await interaction.followUp({
      content: confirmText,
      flags: (1 << 6),
    });
  },
};

// Need getRoleLabel in this file too
const { getRoleLabel } = require('../../utils/attendanceMessages');

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