const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const { buildShiftAnnouncement, buildShiftEndedMessage, BRAND } = require('../../utils/messages');

// In-memory store for active sessions (keyed by hostId)
// In production, swap this for a database (SQLite, MongoDB, etc.)
const activeSessions = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shift')
    .setDescription('Manage store shifts and training sessions at Oakwood Shopping')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    // ── /shift start ───────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('start')
        .setDescription('Announce a new shift or training session')
        .addStringOption(opt =>
          opt.setName('type')
            .setDescription('What kind of session is this?')
            .setRequired(true)
            .addChoices(
              { name: '🟢 Regular Shift', value: 'shift' },
              { name: '📋 Training Session', value: 'training' },
            ))
        .addUserOption(opt =>
          opt.setName('host')
            .setDescription('Who is hosting this session?')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('location')
            .setDescription('Where in the store? (e.g. Main Floor, Bakery, Warehouse)')
            .setRequired(true))
        .addUserOption(opt =>
          opt.setName('cohost')
            .setDescription('Co-host for this session (optional)'))
        .addStringOption(opt =>
          opt.setName('notes')
            .setDescription('Any extra info to include in the announcement'))
        .addBooleanOption(opt =>
          opt.setName('promotional')
            .setDescription('Is this a promotional shift?'))
        .addRoleOption(opt =>
          opt.setName('ping')
            .setDescription('Role to ping with the announcement (defaults to @here)')))

    // ── /shift end ─────────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('end')
        .setDescription('Conclude an active shift and post a closing message')
        .addUserOption(opt =>
          opt.setName('host')
            .setDescription('Host whose shift is ending (defaults to yourself)')))

    // ── /shift status ──────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Show all currently active shifts')),

  // ─────────────────────────────────────────────────────────────
  // EXECUTE — route subcommands
  // ─────────────────────────────────────────────────────────────
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'start')  return handleStart(interaction);
    if (sub === 'end')    return handleEnd(interaction);
    if (sub === 'status') return handleStatus(interaction);
  },

  // ─────────────────────────────────────────────────────────────
  // BUTTON HANDLER
  // ─────────────────────────────────────────────────────────────
  async handleButton(interaction) {
    const [, action, hostId] = interaction.customId.split(':');

    if (action === 'join') {
      const session = activeSessions.get(hostId);
      if (!session) {
        return interaction.reply({
          content: `${BRAND.emoji.warn} This session is no longer active.`,
          ephemeral: true,
        });
      }
      return interaction.reply({
        content: [
          `${BRAND.emoji.store} **Oakwood Shopping — Session Link**`,
          `> Head to the Roblox game to join <@${hostId}>'s session!`,
          `> **Location:** ${session.location}`,
          session.gameLink ? `> **Game Link:** ${session.gameLink}` : `> *(No direct link set — join via the group page)*`,
        ].join('\n'),
        ephemeral: true,
      });
    }

    if (action === 'info') {
      const session = activeSessions.get(hostId);
      if (!session) {
        return interaction.reply({
          content: `${BRAND.emoji.warn} This session has ended.`,
          ephemeral: true,
        });
      }
      const elapsed = Math.floor((Date.now() - session.startedAt) / 60000);
      return interaction.reply({
        content: [
          `${BRAND.emoji.pin} **Session Details**`,
          `> **Host:** <@${hostId}>`,
          session.cohostId ? `> **Co-Host:** <@${session.cohostId}>` : null,
          `> **Type:** ${session.type === 'training' ? '📋 Training' : '🟢 Shift'}`,
          `> **Location:** ${session.location}`,
          `> **Running for:** ${elapsed} minute${elapsed !== 1 ? 's' : ''}`,
          session.notes ? `> **Notes:** ${session.notes}` : null,
        ].filter(Boolean).join('\n'),
        ephemeral: true,
      });
    }
  },
};

// ─────────────────────────────────────────────────────────────
// SUBCOMMAND IMPLEMENTATIONS
// ─────────────────────────────────────────────────────────────

async function handleStart(interaction) {
  const type       = interaction.options.getString('type');
  const host       = interaction.options.getUser('host');
  const cohost     = interaction.options.getUser('cohost');
  const location   = interaction.options.getString('location');
  const notes      = interaction.options.getString('notes');
  const isPromo    = interaction.options.getBoolean('promotional') ?? false;
  const pingRole   = interaction.options.getRole('ping');

  // Check if host already has an active session
  if (activeSessions.has(host.id)) {
    return interaction.reply({
      content: `${BRAND.emoji.warn} <@${host.id}> already has an active session running! End it first with \`/shift end\`.`,
      ephemeral: true,
    });
  }

  // Store the session
  activeSessions.set(host.id, {
    type,
    hostId: host.id,
    cohostId: cohost?.id ?? null,
    location,
    notes,
    isPromo,
    channelId: interaction.channelId,
    startedAt: Date.now(),
  });

  const { content, components } = buildShiftAnnouncement({
    type,
    hostId: host.id,
    cohostId: cohost?.id ?? null,
    location,
    notes,
    isPromo,
    pingRole: pingRole?.id ?? null,
  });

  // Send the announcement
  const msg = await interaction.reply({ content, components, fetchReply: true });

  // Store message ID so we can edit it when the shift ends
  const session = activeSessions.get(host.id);
  session.messageId = msg.id;

  console.log(`[Shifts] Session started by ${host.tag} in #${interaction.channel.name}`);
}

async function handleEnd(interaction) {
  const targetUser = interaction.options.getUser('host') ?? interaction.user;
  const session    = activeSessions.get(targetUser.id);

  if (!session) {
    return interaction.reply({
      content: `${BRAND.emoji.warn} No active session found for <@${targetUser.id}>.`,
      ephemeral: true,
    });
  }

  const durationMs  = Date.now() - session.startedAt;
  const minutes     = Math.floor(durationMs / 60000);
  const hours       = Math.floor(minutes / 60);
  const mins        = minutes % 60;
  const duration    = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  activeSessions.delete(targetUser.id);

  const { content } = buildShiftEndedMessage({
    hostId: targetUser.id,
    location: session.location,
    duration,
  });

  await interaction.reply({ content, components: [] });
  console.log(`[Shifts] Session ended for ${targetUser.tag} — Duration: ${duration}`);
}

async function handleStatus(interaction) {
  if (activeSessions.size === 0) {
    return interaction.reply({
      content: `${BRAND.emoji.store} **No active sessions at Oakwood Shopping right now.**\nUse \`/shift start\` to kick one off!`,
      ephemeral: true,
    });
  }

  const lines = [
    `${BRAND.emoji.store} **Active Sessions at ${BRAND.name}** — ${activeSessions.size} running`,
    ``,
  ];

  for (const [hostId, s] of activeSessions) {
    const elapsed = Math.floor((Date.now() - s.startedAt) / 60000);
    const typeTag = s.type === 'training' ? '📋 Training' : '🟢 Shift';
    lines.push(`${typeTag} · <@${hostId}> · **${s.location}** · ${elapsed}m ago`);
  }

  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}
