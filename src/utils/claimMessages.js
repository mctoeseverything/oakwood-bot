const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { slotCount } = require('./claimStore');

// ─── Role display config ────────────────────────────────────────────────────

const SLOT_META = {
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

function getLabel(key) {
  return SLOT_META[key]?.label ?? key;
}

// ─── Status line builder ────────────────────────────────────────────────────

/**
 * Builds the "> Role: claimed/unclaimed" status block for a session.
 */
function buildStatusLines(session) {
  const lines = [];

  // Host is always first
  lines.push(`> Host: <@${session.hostId}>`);

  for (const [key, slot] of Object.entries(session.slots)) {
    const label = getLabel(key);
    if (slot.max === 1) {
      lines.push(`> ${label}: ${slot.claimed ? `<@${slot.claimed}>` : 'Unclaimed'}`);
    } else {
      // Multi-slot: all on one line, comma-separated
      const entries = [];
      for (let i = 0; i < slot.max; i++) {
        entries.push(slot.claimed[i] ? `<@${slot.claimed[i]}>` : 'Unclaimed');
      }
      lines.push(`> ${label}: ${entries.join(', ')}`);
    }
  }

  return lines.join('\n');
}

// ─── Button row builder ─────────────────────────────────────────────────────

/**
 * Builds ActionRows of claim buttons, keeping related slots together visually.
 *
 * Layout strategy:
 *   Row 1: co-host | trainer-a | assistant-a | trainer-b | assistant-b  (5 max)
 *   Row 2: trainer-c | assistant-c | trainer-d | assistant-d | spectator (5 max)
 *   etc.
 *
 * We build an ordered list of "chunks" — each chunk is a logical group of
 * buttons that should stay together if possible:
 *   - co-host (1)
 *   - [trainer-X, assistant-X] per group (2 each)
 *   - spectator (1)
 *
 * We then greedily fill rows of 5, never splitting a chunk across rows unless
 * the chunk itself is larger than 5 (impossible with current slot design).
 */
function buildClaimRows(session) {
  // Build ordered chunks
  const chunks = [];

  // Co-host chunk
  chunks.push(['co-host']);

  // One chunk per group: [trainer-X, assistant-X]
  for (const g of session.groups) {
    const gl = g.toLowerCase();
    chunks.push([`trainer-${gl}`, `assistant-${gl}`]);
  }

  // Spectator chunk
  chunks.push(['spectator']);

  // Build button objects per slot key
  function makeButton(key) {
    const slot = session.slots[key];
    if (!slot) return null;
    const meta = SLOT_META[key] ?? { label: key, emoji: '🔘' };
    const full = slot.max === 1
      ? slot.claimed !== null
      : slot.claimed.length >= slot.max;

    return new ButtonBuilder()
      .setCustomId(`claim:take:${session.id}:${key}`)
      .setLabel(meta.label)
      .setEmoji(meta.emoji)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!session.open || full);
  }

  // Greedily pack chunks into rows of 5
  const rows = [];
  let currentRowButtons = [];

  for (const chunk of chunks) {
    const buttons = chunk.map(makeButton).filter(Boolean);
    if (buttons.length === 0) continue;

    // If adding this chunk would overflow the row, flush first
    if (currentRowButtons.length + buttons.length > 5) {
      if (currentRowButtons.length > 0) {
        rows.push(new ActionRowBuilder().addComponents(currentRowButtons));
        currentRowButtons = [];
      }
    }

    currentRowButtons.push(...buttons);

    // If row is exactly full, flush immediately
    if (currentRowButtons.length === 5) {
      rows.push(new ActionRowBuilder().addComponents(currentRowButtons));
      currentRowButtons = [];
    }

    // Discord hard limit: 5 rows
    if (rows.length >= 5) break;
  }

  // Flush any remaining buttons
  if (currentRowButtons.length > 0 && rows.length < 5) {
    rows.push(new ActionRowBuilder().addComponents(currentRowButtons));
  }

  return rows;
}

// ─── Main message builders ──────────────────────────────────────────────────

/**
 * Builds the initial /claim send announcement.
 * Returns { components, claimRows, flags }
 */
function buildClaimMessage(session) {
  const open = session.open;
  const header = open
    ? '### 🟢 Training Session Role Claiming Available'
    : '### 🔴 Training Session Role Claiming Unavailable';

  const pingLine = session.pingRoleId ? `<@&${session.pingRoleId}>` : '@here';

  const body = open
    ? `A training hosted by <@${session.hostId}> is now available for role claiming. Please select which role you would like by clicking the respective button below. Positions are first come first serve!\n\n**ONLY CLAIM A ROLE IF:** You meet all requirements for said position and are certain you will be available for the remainder of the session.`
    : `A training hosted by <@${session.hostId}> is no longer available for role claiming. The claiming period has either closed or all positions were claimed.`;

  const statusBlock = buildStatusLines(session);

  // Auto-close timestamp line
  let closeNote = '';
  if (open && session.closeAt) {
    const unixSec = Math.floor(session.closeAt / 1000);
    closeNote = `\n> Claiming closes <t:${unixSec}:R>`;
  }

  const textContent = `${header}\n${pingLine}\n\n${body}\n\n${statusBlock}${closeNote}`;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(textContent))
    .addSeparatorComponents(s =>
      s.setDivider(false).setSpacing(SeparatorSpacingSize.Small),
    );

  const sessionIdDisplay = new TextDisplayBuilder()
    .setContent(`Session ID: \`${session.id}\``);

  const claimRows = buildClaimRows(session);

  return {
    components: [container, sessionIdDisplay],
    claimRows,
    flags: (1 << 15), // IS_COMPONENTS_V2
  };
}

/**
 * Builds the notification message posted when /claim addgroup is run.
 */
function buildAddGroupNotification(session, groupLetter) {
  const pingLine = session.pingRoleId ? `<@&${session.pingRoleId}>` : '@here';

  const container = new ContainerBuilder()
    .addTextDisplayComponents(t =>
      t.setContent(
        `### ❗ Additional Roles Available\n${pingLine}\n\nThis session is available for an additional group to be claimed!\n\n**ONLY CLAIM A ROLE IF:** You meet all requirements for said position and are certain you will be available for the remainder of the session.`,
      ),
    )
    .addSeparatorComponents(s =>
      s.setDivider(false).setSpacing(SeparatorSpacingSize.Small),
    );

  const sessionIdDisplay = new TextDisplayBuilder()
    .setContent(`Session ID: \`${session.id}\``);

  return {
    components: [container, sessionIdDisplay],
    flags: (1 << 15),
  };
}

/**
 * Builds the log message for a claim event.
 */
function buildClaimLog(session, userId, slotKey) {
  const slot = session.slots[slotKey];
  const label = getLabel(slotKey);
  const current = slotCount(slot);
  const max = slot.max;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(t =>
      t.setContent(`<@${userId}> has claimed **${label}** (${current}/${max}) for session \`${session.id}\`.`),
    );

  return { components: [container], flags: (1 << 15) };
}

/**
 * Builds the log message for a session open/close/group/unclaim event.
 */
function buildSessionLog(session, event, ...extra) {
  let text;
  if (event === 'opened') {
    const closeNote = session.closeAt
      ? ` Auto-closes <t:${Math.floor(session.closeAt / 1000)}:R>.`
      : '';
    text = `📋 Claiming session \`${session.id}\` opened by <@${session.hostId}>.${closeNote}`;
  } else if (event === 'closed') {
    text = `🔒 Claiming session \`${session.id}\` closed by <@${session.hostId}>.`;
  } else if (event === 'autoclosed') {
    text = `⏰ Claiming session \`${session.id}\` automatically closed (scheduled timer expired).`;
  } else if (event === 'group_added') {
    text = `➕ Group ${extra[0]} added to session \`${session.id}\` by <@${session.hostId}>.`;
  } else if (event === 'unclaimed') {
    text = `↩️ <@${extra[0]}> was unclaimed from **${getLabel(extra[1])}** in session \`${session.id}\`.`;
  } else {
    text = `ℹ️ Session \`${session.id}\` event: ${event}.`;
  }

  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(text));

  return { components: [container], flags: (1 << 15) };
}

module.exports = {
  buildClaimMessage,
  buildAddGroupNotification,
  buildClaimLog,
  buildSessionLog,
  buildClaimRows,
  buildStatusLines,
  getLabel,
};