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

// ─── Log helper ─────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────────────

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
  // SELECT MENU HANDLER
  // attendance:mark:<sessionId>:<userId>
  // ─────────────────────────────────────────────────────────────
async handleSelect(interaction, client) {
  const parts     = interaction.customId.split(':');
  const action    = parts[1];
  const sessionId = parts[2];

  const attSession = attendanceSessions.get(sessionId);
  if (!attSession) return interaction.reply({ content: '⚠️ Session no longer exists.', ephemeral: true });
  if (attSession.finalized) return interaction.reply({ content: '⚠️ Already finalized.', ephemeral: true });
  if (attSession.hostId !== interaction.user.id) return interaction.reply({ content: '⚠️ Only the host can mark attendance.', ephemeral: true });

  if (action === 'pick_person') {
    attSession._pendingUserId = interaction.values[0];
    await interaction.deferUpdate();
    return;
  }

  if (action === 'pick_status') {
    const targetId = attSession._pendingUserId;
    if (!targetId) {
      return interaction.reply({ content: '⚠️ Pick a person first using the first dropdown.', ephemeral: true });
    }
    const status = interaction.values[0];
    setAttendeeStatus(attSession, targetId, status);
    attSession._pendingUserId = null;
    const updated = buildAttendanceMarkingMessage(attSession);
    await interaction.update(updated);
  }
},

  // ─────────────────────────────────────────────────────────────
  // BUTTON HANDLER
  // attendance:finalize:<sessionId>
  // ─────────────────────────────────────────────────────────────
  async handleButton(interaction, client) {
    const parts  = interaction.customId.split(':');
    const action = parts[1];

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

      const updatedPanel = buildAttendanceMarkingMessage(attSession);
      await interaction.update(updatedPanel);

      const logPayload = buildAttendanceLog(attSession);
      await sendLog(client, logPayload);

      attendanceSessions.delete(sessionId);

      console.log(`[Attendance] Session ${sessionId} finalized by ${interaction.user.tag}`);
    }
  },
};

// ────────────────────────────────────────────────────────────────────────────

async function handleRecord(interaction, client) {
  const sessionId    = interaction.options.getString('session_id');
  const claimSession = sessions.get(sessionId);

  if (!claimSession) {
    return interaction.reply({
      content: `⚠️ No claim session found with ID \`${sessionId}\`. The session must still be in memory.`,
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