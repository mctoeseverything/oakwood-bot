const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
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

  const text = [
    `### 📋 Attendance — Session \`${attSession.sessionId}\``,
    `Click **Mark Attendance** to open the marking form.`,
    ``,
    statusLines,
  ].join('\n');

  const pages = Math.ceil(attSession.attendees.length / 5);
  const buttons = [];

  for (let i = 0; i < pages; i++) {
    const slice = attSession.attendees.slice(i * 5, i * 5 + 5);
    const label = pages === 1
      ? 'Mark Attendance'
      : `Mark Page ${i + 1} (${slice.map(a => getRoleLabel(a.role)).join(', ')})`;
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`attendance:open_form:${attSession.sessionId}:${i}`)
        .setLabel(label)
        .setEmoji('📝')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(attSession.finalized),
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(`attendance:finalize:${attSession.sessionId}`)
      .setLabel('Finalize Attendance')
      .setEmoji('📨')
      .setStyle(ButtonStyle.Success)
      .setDisabled(attSession.finalized || !allDone),
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  // buildAttendanceMarkingMessage — remove the ephemeral flag
return {
  components: [new TextDisplayBuilder().setContent(text), ...rows],
  flags: (1 << 15), // IS_COMPONENTS_V2 only, NOT ephemeral
};
}

function buildAttendanceFormMessage(attSession, page) {
  const pageAttendees = attSession.attendees.slice(page * 5, page * 5 + 5);
  const pages         = Math.ceil(attSession.attendees.length / 5);
  const title         = pages === 1
    ? '📝 **Mark Attendance**'
    : `📝 **Mark Attendance — Page ${page + 1}/${pages}**`;

  const lines = [
    title,
    `Session \`${attSession.sessionId}\` — select a status for each person below.`,
    '',
    ...pageAttendees.map(a => {
      const badge = a.status ? `${STATUS_META[a.status].emoji} ${STATUS_META[a.status].label}` : '⬜ Unmarked';
      return `**${getRoleLabel(a.role)}** — <@${a.userId}> · ${badge}`;
    }),
  ];

  const textDisplay = new TextDisplayBuilder().setContent(lines.join('\n'));

  const selectRows = pageAttendees.map(a =>
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`attendance:set_status:${attSession.sessionId}:${a.userId}`)
        .setPlaceholder(`${getRoleLabel(a.role)} — select status...`)
        .addOptions(
          Object.entries(STATUS_META).map(([key, meta]) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(`${meta.emoji} ${meta.label}`)
              .setValue(key)
              .setDefault(a.status === key),
          ),
        ),
    )
  );

  const doneRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`attendance:close_form:${attSession.sessionId}`)
      .setLabel('Done')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
  );

  return {
    components: [textDisplay, ...selectRows, doneRow],
    flags: (1 << 15) | (1 << 6),
  };
}

function buildAttendanceLog(attSession) {
  const now    = Math.floor(Date.now() / 1000);
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
  buildAttendanceFormMessage,
  buildAttendanceLog,
  getRoleLabel,
};