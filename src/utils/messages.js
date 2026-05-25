const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

/**
 * Oakwood Shopping brand colors & formatting helpers.
 * All announcements use plain content + components — no embeds.
 */

const BRAND = {
  name: 'Oakwood Shopping',
  emoji: {
    store:    '🛒',
    shift:    '🟢',
    shiftEnd: '🔴',
    training: '📋',
    host:     '👤',
    cohost:   '👥',
    time:     '🕐',
    check:    '✅',
    warn:     '⚠️',
    pin:      '📌',
    staff:    '🎯',
    divider:  '▬',
  },
};

/**
 * Repeating divider line for visual separation.
 */
function divider(length = 32) {
  return BRAND.emoji.divider.repeat(length);
}

/**
 * Builds a shift announcement message (content + components, no embed).
 * @param {object} opts
 * @param {'shift'|'training'} opts.type
 * @param {string} opts.hostId          Discord user ID
 * @param {string|null} opts.cohostId   Discord user ID or null
 * @param {string} opts.location        e.g. "Main Store Floor"
 * @param {string|null} opts.notes      Optional extra info
 * @param {boolean} opts.isPromo        Whether this is a promotional shift
 * @param {string} opts.pingRole        Role ID to ping
 * @returns {{ content: string, components: ActionRowBuilder[] }}
 */
function buildShiftAnnouncement(opts) {
  const { type, hostId, cohostId, location, notes, isPromo, pingRole } = opts;
  const isTraining = type === 'training';

  const typeLabel  = isTraining ? 'Training Session' : 'Shift';
  const typeEmoji  = isTraining ? BRAND.emoji.training : BRAND.emoji.shift;
  const rolePing   = pingRole ? `<@&${pingRole}>` : '@here';

  const lines = [
    `${rolePing}`,
    ``,
    `${typeEmoji} **A ${typeLabel} is now being hosted at ${BRAND.name}!**`,
    divider(28),
    `${BRAND.emoji.host} **Host:** <@${hostId}>`,
    cohostId ? `${BRAND.emoji.cohost} **Co-Host:** <@${cohostId}>` : null,
    `${BRAND.emoji.pin} **Location:** ${location}`,
    `${BRAND.emoji.store} **Promotional:** ${isPromo ? 'Yes' : 'No'}`,
    notes ? `${BRAND.emoji.staff} **Notes:** ${notes}` : null,
    divider(28),
    `*Click **Join Session** below to get the server link!*`,
  ].filter(l => l !== null);

  const content = lines.join('\n');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`shift:join:${hostId}`)
      .setLabel('Join Session')
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`shift:info:${hostId}`)
      .setLabel('Session Info')
      .setEmoji('ℹ️')
      .setStyle(ButtonStyle.Secondary),
  );

  return { content, components: [row] };
}

/**
 * Builds a shift-ended message.
 */
function buildShiftEndedMessage(opts) {
  const { hostId, location, duration } = opts;

  const lines = [
    `${BRAND.emoji.shiftEnd} **Shift Concluded at ${BRAND.name}**`,
    divider(28),
    `${BRAND.emoji.host} **Host:** <@${hostId}>`,
    `${BRAND.emoji.pin} **Location:** ${location}`,
    duration ? `${BRAND.emoji.time} **Duration:** ${duration}` : null,
    divider(28),
    `*Thanks to everyone who attended!*`,
  ].filter(l => l !== null);

  return { content: lines.join('\n'), components: [] };
}

module.exports = { BRAND, divider, buildShiftAnnouncement, buildShiftEndedMessage };
