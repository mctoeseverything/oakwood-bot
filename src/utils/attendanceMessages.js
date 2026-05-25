const {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');

const ROLE_META = {
  'host':        { label: 'Host'        },
  'co-host':     { label: 'Co-Host'     },
  'trainer-a':   { label: 'Trainer A'   },
  'assistant-a': { label: 'Assistant A' },
  'trainer-b':   { label: 'Trainer B'   },
  'assistant-b': { label: 'Assistant B' },
  'trainer-c':   { label: 'Trainer C'   },
  'assistant-c': { label: 'Assistant C' },
  'trainer-d':   { label: 'Trainer D'   },
  'assistant-d': { label: 'Assistant D' },
  'spectator':   { label: 'Spectator'   },
};

function getRoleLabel(key) {
  return ROLE_META[key]?.label ?? key;
}

const STATUS_META = {
  present: { label: 'Present', emoji: '✅' },
  absent:  { label: 'Absent',  emoji: '❌' },
  late:    { label: 'Late',    emoji: '🕐' },
  excused: { label: 'Excused', emoji: '🟡' },
};

// Main panel — shows status list + Mark and Finalize buttons
function buildAttendanceMarkingMessage(attSession) {
  const allDone = attSession.attendees.every(a => a.status !== null);

  const statusLines = attSession.attendees.map(a => {
    const badge = a.status
      ? `${STATUS_META[a.status].emoji} ${STATUS_META[a.status].label}`
      : '⬜ Unmarked';
    return `> <@${a.userId}> — **${getRoleLabel(a.role)}** · ${badge}`;
  }).join('\n');

  const text = [
    `### 📋 Attendance — Session \`${attSession.sessionId}\``,
    `Click **Mark Attendance** to start marking. Each click marks one person.`,
    ``,
    statusLines,
  ].join('\n');

  // Find first unmarked attendee
  const nextUnmarked = attSession.attendees.find(a => a.status === null);

  const markBtn = new ButtonBuilder()
    .setCustomId(`attendance:mark_next:${attSession.sessionId}`)
    .setLabel(nextUnmarked ? `Mark ${getRoleLabel(nextUnmarked.role)}` : 'All Marked')
    .setEmoji('📝')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(attSession.finalized || !nextUnmarked);

  const finalizeBtn = new ButtonBuilder()
    .setCustomId(`attendance:finalize:${attSession.sessionId}`)
    .setLabel('Finalize Attendance')
    .setEmoji('📨')
    .setStyle(ButtonStyle.Success)
    .setDisabled(attSession.finalized || !allDone);

  return {
    components: [
      new TextDisplayBuilder().setContent(text),
      new ActionRowBuilder().addComponents(markBtn, finalizeBtn),
    ],
    flags: (1 << 15) | (1 << 6),
  };
}

// Marking panel for a single attendee — shown after clicking Mark
function buildSingleMarkMessage(attSession, attendee) {
  const text = [
    `### 📝 Mark Attendance`,
    `Session \`${attSession.sessionId}\` — select a status for <@${attendee.userId}> (**${getRoleLabel(attendee.role)}**)`,
  ].join('\n');

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`attendance:set_status:${attSession.sessionId}:${attendee.userId}`)
    .setPlaceholder('Select status...')
    .addOptions(
      Object.entries(STATUS_META).map(([key, meta]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(meta.label)
          .setValue(key)
          .setEmoji(meta.emoji)
          .setDefault(attendee.status === key),
      ),
    );

  return {
    components: [
      new TextDisplayBuilder().setContent(text),
      new ActionRowBuilder().addComponents(menu),
    ],
    flags: (1 << 15) | (1 << 6),
  };
}

function buildAttendanceLog(attSession) {
  const now = Math.floor(Date.now() / 1000);
  const groups = { present: [], late: [], excused: [], absent: [] };
  for (const a of attSession.attendees) {
    (groups[a.status] ?? groups.absent).push(a);
  }

  function fmt(emoji, label, entries) {
    if (!entries.length) return null;
    return [`**${emoji} ${label}**`, ...entries.map(a => `> <@${a.userId}> — ${getRoleLabel(a.role)}`)].join('\n');
  }

  const text = [
    `### 📋 Attendance Log — Session \`${attSession.sessionId}\``,
    `> **Host:** <@${attSession.hostId}>`,
    `> **Recorded:** <t:${now}:F>`,
    `> **Total:** ${attSession.attendees.length}`,
    ``,
    fmt('✅', 'Present', groups.present),
    fmt('🕐', 'Late',    groups.late),
    fmt('🟡', 'Excused', groups.excused),
    fmt('❌', 'Absent',  groups.absent),
  ].filter(Boolean).join('\n');

  return {
    components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(text))],
    flags: (1 << 15),
  };
}

module.exports = {
  buildAttendanceMarkingMessage,
  buildSingleMarkMessage,
  buildAttendanceLog,
  getRoleLabel,
};