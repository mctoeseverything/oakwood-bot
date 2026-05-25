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

function buildAttendanceMarkingMessage(attSession) {
  const allDone = attSession.attendees.every(a => a.status !== null);

  const statusLines = attSession.attendees.map(a => {
    const badge = a.status
      ? `${STATUS_META[a.status].emoji} ${STATUS_META[a.status].label}`
      : '⬜ Unmarked';
    return `> <@${a.userId}> — **${getRoleLabel(a.role)}** · ${badge}`;
  }).join('\n');

  const headerText = [
    `### 📋 Attendance — Session \`${attSession.sessionId}\``,
    `Use the dropdowns below to mark each person.`,
    ``,
    statusLines,
  ].join('\n');

  // Person picker
  const personMenu = new StringSelectMenuBuilder()
    .setCustomId(`attendance:pick_person:${attSession.sessionId}`)
    .setPlaceholder('1️⃣ Select a person to mark...')
    .setDisabled(attSession.finalized)
    .addOptions(
      attSession.attendees.map(a =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${getRoleLabel(a.role)}`)
          .setDescription(`<@${a.userId}>`.slice(0, 50))
          .setValue(a.userId)
          .setEmoji(a.status ? STATUS_META[a.status].emoji : '⬜'),
      ),
    );

  // Status picker
  const statusMenu = new StringSelectMenuBuilder()
    .setCustomId(`attendance:pick_status:${attSession.sessionId}`)
    .setPlaceholder('2️⃣ Select their status...')
    .setDisabled(attSession.finalized)
    .addOptions(
      Object.entries(STATUS_META).map(([key, meta]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(meta.label)
          .setValue(key)
          .setEmoji(meta.emoji),
      ),
    );

  const finalizeBtn = new ButtonBuilder()
    .setCustomId(`attendance:finalize:${attSession.sessionId}`)
    .setLabel('Finalize Attendance')
    .setEmoji('📨')
    .setStyle(ButtonStyle.Success)
    .setDisabled(attSession.finalized || !allDone);

  return {
    components: [
      new TextDisplayBuilder().setContent(headerText),
      new ActionRowBuilder().addComponents(personMenu),
      new ActionRowBuilder().addComponents(statusMenu),
      new ActionRowBuilder().addComponents(finalizeBtn),
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

module.exports = { buildAttendanceMarkingMessage, buildAttendanceLog, getRoleLabel };