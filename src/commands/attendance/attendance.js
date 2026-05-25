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
  buildAttendanceLog,
} = require('../../utils/attendanceMessages');

// ─── Log helper (mirrors claim.js) ─────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'record') return handleRecord(interaction, client);
  },

  // ─────────────────────────────────────────────────────────────
  // BUTTON HANDLER
  // attendance:mark:<sessionId>:<userId>:<status>
  // attendance:finalize:<sessionId>
  // ─────────────────────────────────────────────────────────────
  async handleButton(interaction, client) {
    const parts  = interaction.customId.split(':');
    const action = parts[1];

    if (action === 'mark') {
      const sessionId = parts[2];
      const targetId  = parts[3];
      const status    = parts[4];

      const attSession = attendanceSessions.get(sessionId);
      if (!attSession) {
        return interaction.reply({
          content: '⚠️ This attendance session no longer exists.',
          ephemeral: true,
        });
      }

      if (attSession.finalized) {
        return interaction.reply({
          content: '⚠️ This attendance session has already been finalized.',
          ephemeral: true,
        });
      }

      if (attSession.hostId !== interaction.user.id) {
        return interaction.reply({
          content: '⚠️ Only the host can mark attendance.',
          ephemeral: true,
        });
      }

      setAttendeeStatus(attSession, targetId, status);

      // Refresh the ephemeral panel
      const updated = buildAttendanceMarkingMessage(attSession);
      await interaction.update(updated);
      return;
    }

    if (action === 'finalize') {
      const sessionId  = parts[2];
      const attSession = attendanceSessions.get(sessionId);

      if (!attSession) {
        return interaction.reply({
          content: '⚠️ This attendance session no longer exists.',
          ephemeral: true,
        });
      }

      if (attSession.finalized) {
        return interaction.reply({
          content: '⚠️ Already finalized.',
          ephemeral: true,
        });
      }

      if (attSession.hostId !== interaction.user.id) {
        return interaction.reply({
          content: '⚠️ Only the host can finalize attendance.',
          ephemeral: true,
        });
      }

      if (!isComplete(attSession)) {
        return interaction.reply({
          content: '⚠️ Not everyone has been marked yet. Please mark all attendees before finalizing.',
          ephemeral: true,
        });
      }

      attSession.finalized = true;

      // Update the panel to show finalized state
      const updatedPanel = buildAttendanceMarkingMessage(attSession);
      await interaction.update(updatedPanel);

      // Send the log
      const logPayload = buildAttendanceLog(attSession);
      await sendLog(client, logPayload);

      // Clean up
      attendanceSessions.delete(sessionId);

      console.log(`[Attendance] Session ${sessionId} finalized by ${interaction.user.tag}`);
      return;
    }
  },
};

// ──────────────────────────────────────────────────────────────────────────

async function handleRecord(interaction, client) {
  const sessionId  = interaction.options.getString('session_id');
  const claimSession = sessions.get(sessionId);

  if (!claimSession) {
    return interaction.reply({
      content: `⚠️ No claim session found with ID \`${sessionId}\`. The session must still be in memory — make sure you're recording attendance before restarting the bot.`,
      ephemeral: true,
    });
  }

  if (claimSession.hostId !== interaction.user.id) {
    return interaction.reply({
      content: '⚠️ Only the host of this session can record attendance.',
      ephemeral: true,
    });
  }

  if (attendanceSessions.has(sessionId)) {
    return interaction.reply({
      content: `⚠️ An attendance panel for session \`${sessionId}\` is already open.`,
      ephemeral: true,
    });
  }

  // Build and store the attendance session
  const attSession = buildAttendanceSession(claimSession);
  attendanceSessions.set(sessionId, attSession);

  const panel = buildAttendanceMarkingMessage(attSession);
  await interaction.reply(panel);

  console.log(`[Attendance] Panel opened for session ${sessionId} by ${interaction.user.tag}`);
}