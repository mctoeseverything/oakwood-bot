const {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  LabelBuilder,
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

// Pages of 5 attendees per modal (Discord max 5 rows)
function getPage(attSession, page) {
  return attSession.attendees.slice(page * 5, page * 5 + 5);
}

function totalPages(attSession) {
  return Math.ceil(attSession.attendees.length / 5);
}

// Main panel message
function buildAttendanceMarkingMessage(attSession) {
  const allDone = attSession.attendees.every(a => a.status !== null);
  const pages   = totalPages(attSession);

  const statusLines = attSession.attendees.map(a => {
    const badge = a.status
      ? `${STATUS_META[a.status].emoji} ${STATUS_META[a.status].label}`
      : '⬜ Unmarked';
    return `> <@${a.userId}> — **${getRoleLabel(a.role)}** · ${badge}`;
  }).join('\n');

  const text = [
    `### 📋 Attendance — Session \`${attSession.sessionId}\``,
    `Click the button(s) below to open the marking form.`,
    ``,
    statusLines,
  ].join('\n');

  const buttons = [];
  for (let i = 0; i < pages; i++) {
    const pageAttendees = getPage(attSession, i);
    const label = pages === 1
      ? 'Mark Attendance'
      : `Mark Page ${i + 1} (${pageAttendees.map(a => getRoleLabel(a.role)).join(', ')})`;
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`attendance:open_modal:${attSession.sessionId}:${i}`)
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

  return {
    components: [new TextDisplayBuilder().setContent(text), ...rows],
    flags: (1 << 15) | (1 << 6),
  };
}

// Modal with LabelBuilder + select menu per attendee
function buildAttendanceModal(attSession, page) {
  const pageAttendees = getPage(attSession, page);
  const pages         = totalPages(attSession);
  const title         = pages === 1 ? 'Mark Attendance' : `Mark Attendance (Page ${page + 1}/${pages})`;

  const modal = new ModalBuilder()
    .setCustomId(`attendance:submit:${attSession.sessionId}:${page}`)
    .setTitle(title);

  for (const a of pageAttendees) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new LabelBuilder()
          .setLabel(getRoleLabel(a.role))
          .setDescription(`<@${a.userId}>`)
          .setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
              .setCustomId(`att_${a.userId}`)
              .setPlaceholder(a.status ? STATUS_META[a.status].label : 'Select status...')
              .addOptions(
                Object.entries(STATUS_META).map(([key, meta]) =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(meta.label)
                    .setValue(key)
                    .setEmoji(meta.emoji)
                    .setDefault(a.status === key),
                ),
              ),
          ),
      ),
    );
  }

  return modal;
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
  buildAttendanceModal,
  buildAttendanceLog,
  getRoleLabel,
};