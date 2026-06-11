const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  SeparatorSpacingSize,
} = require('discord.js');

const axios = require('axios');
const { removeRankban, getRankban } = require('../../utils/rankbanStore');
const { ADMIN_ROLE_IDS } = require('../../utils/rolesConfig');

async function resolveRobloxUser(username) {
  const res = await axios.post(
    'https://users.roblox.com/v1/usernames/users',
    { usernames: [username], excludeBannedUsers: false },
  );
  const user = res.data.data?.[0];
  if (!user) return null;
  return { id: String(user.id), name: user.name };
}

function hasAdminRole(member) {
  if (!Array.isArray(ADMIN_ROLE_IDS) || ADMIN_ROLE_IDS.length === 0) return false;
  return member.roles.cache.some(r => ADMIN_ROLE_IDS.includes(r.id));
}

async function errorReply(interaction, message) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`### ⚠️ Action Blocked\n${message}`));
  return interaction.editReply({ components: [container], flags: (1 << 15) });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unrankban')
    .setDescription('Remove a rank ban from a Roblox user')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('roblox_username')
        .setDescription('The Roblox username to remove the rank ban from')
        .setRequired(true)),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: (1 << 6) });

    if (!hasAdminRole(interaction.member)) {
      return errorReply(interaction, '⛔ You do not have permission to use this command.');
    }

    const username = interaction.options.getString('roblox_username').trim();

    let robloxUser;
    try {
      robloxUser = await resolveRobloxUser(username);
    } catch (err) {
      console.error('[Unrankban] Roblox lookup error:', err.message);
      return errorReply(interaction, 'Failed to look up that Roblox username. Please try again.');
    }

    if (!robloxUser) {
      return errorReply(interaction, `No Roblox user found with the username **${username}**.`);
    }

    const existing = await getRankban(robloxUser.id);
    if (!existing) {
      return errorReply(interaction, `**@${robloxUser.name}** does not have an active rank ban.`);
    }

    await removeRankban(robloxUser.id);

    const bannedAt = `<t:${Math.floor(new Date(existing.banned_at).getTime() / 1000)}:D>`;

    const container = new ContainerBuilder()
      .addTextDisplayComponents(t => t.setContent('### 🔓 Rank Ban Removed'))
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
      .addTextDisplayComponents(t =>
        t.setContent([
          `> **Roblox:** @${robloxUser.name}`,
          `> **Original Reason:** ${existing.reason}`,
          `> **Originally Banned:** ${bannedAt} by <@${existing.banned_by}>`,
          `> **Removed By:** <@${interaction.user.id}>`,
        ].join('\n')),
      );

    console.log(`[Unrankban] @${robloxUser.name} rank ban removed by ${interaction.user.tag}`);

    return interaction.editReply({ components: [container], flags: (1 << 15) });
  },
};