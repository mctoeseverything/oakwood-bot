const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

// ─── Role label helper ──────────────────────────────────────────────────────

const ROLE_META = {
  'host':        { label: 'Host',        emoji: '👑' },
  'co-host':     { label: 'Co-Host',     emoji: '👔' },
  'trainer-a':   { label: 'Trainer A',   emoji: '🅰️' },
  'assistant-a': { label: 'Assistant A', emoji: '🅰️' },
  'trainer-b':   { label: 'Trainer B',   emoji: '🅱️' },
  'assistant-b': { label: 'Assistant B', emoji: '🅱️' },
  'trainer-c':   { label: 'Trainer C',   emoji: '🇨'  },
  'assistant-c': { label: 'Assistant C', emoji: '🇨'  },
  'trainer-d':   { label: 'Trainer D',   emoji: '🇩'  },
  'assistant-d': { label: 'Assistant D', emoji: '🇩'  },
  'spectator':   { label: 'Spectator',   emoji: '🕶️' },
};

function getRoleLabel(key) {
  return ROLE_META[key]?.label ?? key;
}

// ─── Status config ──────────────────────────────────────────────────────────

const STATUS_META = {
  present: { label: 'Present', emoji: '✅', style: ButtonStyle.Success  },
  absent:  { label: 'Absent',  emoji: '❌', style: ButtonStyle.Danger   },
  late:    { label: 'Late',    emoji: '🕐', style: ButtonStyle.Primary  },
  excused: { label: 'Excused', emoji: '🟡', style: ButtonStyle.Secondary },
};

// ─── Interactive marking message ────────────────────────────────────────────

/**
 * Builds the ephemeral attendance marking message.
 * One section per attendee showing their current status + 4 status buttons.
 */
function buildAttendanceMarkingMessage(attSession) {
  const allDone = attSession.attendees.every(a => a.status !== null);

  // Header container
  const headerText = [
    `### 📋 Attendance — Session \`${attSession.sessionId}\``,
    `Mark each person's status below. Hit **Finalize** when done.`,
  ].join('\n');

  const components = [];

  const headerContainer = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(headerText))
    .addSeparatorComponents(s =>
      s.setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

  components.push(headerContainer);

  // One row per attendee: their name/role + status buttons
  // Discord limits us to 5 ActionRows per message, so we batch into containers
  // and keep the button rows outside (components v2 allows mixing)
  const attendeeLines = attSession.attendees.map(a => {
    const roleLabel   = getRoleLabel(a.role);
    const statusBadge = a.status
      ? `${STATUS_META[a.status].emoji} ${STATUS_META[a.status].label}`
      : '⬜ Unmarked';
    return `> <@${a.userId}> — **${roleLabel}** · ${statusBadge}`;
  }).join('\n');

  const statusContainer = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(attendeeLines));

  components.push(statusContainer);

  // Button rows — up to 5, one per attendee (Discord hard limit)
  // If there are more than 5 attendees we still render the first 5 rows of buttons;
  // additional attendees show in the status list but host must use /attendance mark
  // to set them individually (edge case for large sessions).
  const buttonRows = [];
  for (const a of attSession.attendees) {
    if (buttonRows.length >= 4) break; // reserve last row for Finalize

    const row = new ActionRowBuilder().addComponents(
      ...Object.entries(STATUS_META).map(([statusKey, meta]) =>
        new ButtonBuilder()
          .setCustomId(`attendance:mark:${attSession.sessionId}:${a.userId}:${statusKey}`)
          .setLabel(`${a.userId.slice(-4)} · ${meta.label}`)
          .setEmoji(meta.emoji)
          .setStyle(a.status === statusKey ? ButtonStyle.Primary : meta.style)
          .setDisabled(attSession.finalized),
      ),
    );
    buttonRows.push(row);
  }

  // Finalize row
  const finalizeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`attendance:finalize:${attSession.sessionId}`)
      .setLabel('Finalize Attendance')
      .setEmoji('📨')
      .setStyle(ButtonStyle.Success)
      .setDisabled(attSession.finalized || !allDone),
  );
  buttonRows.push(finalizeRow);

  return {
    components: [...components, ...buttonRows],
    flags: (1 << 15) | (1 << 6), // IS_COMPONENTS_V2 | EPHEMERAL
  };
}

// ─── Final log message ──────────────────────────────────────────────────────

/**
 * Builds the attendance log posted to LOG_CHANNEL_ID after finalization.
 */
function buildAttendanceLog(attSession) {
  const now = Math.floor(Date.now() / 1000);

  const statusGroups = {
    present: [],
    late:    [],
    excused: [],
    absent:  [],
  };

  for (const a of attSession.attendees) {
    const bucket = statusGroups[a.status] ?? statusGroups.absent;
    bucket.push({ userId: a.userId, role: a.role });
  }

  function formatGroup(label, emoji, entries) {
    if (entries.length === 0) return null;
    const lines = entries.map(e => `> <@${e.userId}> — ${getRoleLabel(e.role)}`);
    return [`**${emoji} ${label}**`, ...lines].join('\n');
  }

  const sections = [
    `### 📋 Attendance Log — Session \`${attSession.sessionId}\``,
    `> **Host:** <@${attSession.hostId}>`,
    `> **Recorded:** <t:${now}:F>`,
    `> **Total Attendees:** ${attSession.attendees.length}`,
    ``,
    formatGroup('Present',  STATUS_META.present.emoji,  statusGroups.present),
    formatGroup('Late',     STATUS_META.late.emoji,     statusGroups.late),
    formatGroup('Excused',  STATUS_META.excused.emoji,  statusGroups.excused),
    formatGroup('Absent',   STATUS_META.absent.emoji,   statusGroups.absent),
  ].filter(Boolean);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(sections.join('\n')));

  return {
    components: [container],
    flags: (1 << 15), // IS_COMPONENTS_V2
  };
}

module.exports = {
  buildAttendanceMarkingMessage,
  buildAttendanceLog,
  getRoleLabel,
};