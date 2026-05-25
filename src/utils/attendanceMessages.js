const {
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ContainerBuilder,
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

// ─── Attendance marking message ─────────────────────────────────────────────

function buildAttendanceMarkingMessage(attSession) {
  const allDone = attSession.attendees.every(a => a.status !== null);
  const components = [];

  const headerText = [
    `### 📋 Attendance — Session \`${attSession.sessionId}\``,
    `Mark each person's status. Hit **Finalize** when all are marked.`,
    ``,
    ...attSession.attendees.map(a => {
      const statusBadge = a.status
        ? `${STATUS_META[a.status].emoji} ${STATUS_META[a.status].label}`
        : '⬜ Unmarked';
      return `> <@${a.userId}> — **${getRoleLabel(a.role)}** · ${statusBadge}`;
    }),
  ].join('\n');

  components.push(new TextDisplayBuilder().setContent(headerText));

  for (const a of attSession.attendees) {
    if (components.length >= 5) break;

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`attendance:mark:${attSession.sessionId}:${a.userId}`)
      .setPlaceholder(`${getRoleLabel(a.role)} — ${a.status ? STATUS_META[a.status].label : 'Select status...'}`)
      .setDisabled(attSession.finalized)
      .addOptions(
        Object.entries(STATUS_META).map(([statusKey, meta]) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(meta.label)
            .setValue(statusKey)
            .setEmoji(meta.emoji)
            .setDefault(a.status === statusKey),
        ),
      );

    components.push(new ActionRowBuilder().addComponents(menu));
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`attendance:finalize:${attSession.sessionId}`)
        .setLabel('Finalize Attendance')
        .setEmoji('📨')
        .setStyle(ButtonStyle.Success)
        .setDisabled(attSession.finalized || !allDone),
    ),
  );

  return {
    components,
    flags: (1 << 15) | (1 << 6),
  };
}

// ─── Attendance log message ─────────────────────────────────────────────────

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
    flags: (1 << 15),
  };
}

module.exports = {
  buildAttendanceMarkingMessage,
  buildAttendanceLog,
  getRoleLabel,
};