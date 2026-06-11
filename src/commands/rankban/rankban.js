const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  SeparatorSpacingSize,
} = require('discord.js');

const axios = require('axios');
const { addRankban } = require('../../utils/rankbanStore');
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
    .setName('rankban')
    .setDescription('Prevent a Roblox user from having their rank changed')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('roblox_username')
        .setDescription('The Roblox username to rank ban')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for the rank ban')
        .setRequired(true)),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: (1 << 6) });

    if (!hasAdminRole(interaction.member)) {
      return errorReply(interaction, '⛔ You do not have permission to use this command.');
    }

    const username = interaction.options.getString('roblox_username').trim();
    const reason   = interaction.options.getString('reason');

    let robloxUser;
    try {
      robloxUser = await resolveRobloxUser(username);
    } catch (err) {
      console.error('[Rankban] Roblox lookup error:', err.message);
      return errorReply(interaction, 'Failed to look up that Roblox username. Please try again.');
    }

    if (!robloxUser) {
      return errorReply(interaction, `No Roblox user found with the username **${username}**.`);
    }

    await addRankban(robloxUser.name, robloxUser.id, reason, interaction.user.id);

    const container = new ContainerBuilder()
      .addTextDisplayComponents(t => t.setContent('### 🔒 Rank Ban Applied'))
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
      .addTextDisplayComponents(t =>
        t.setContent([
          `> **Roblox:** @${robloxUser.name}`,
          `> **Reason:** ${reason}`,
          `> **By:** <@${interaction.user.id}>`,
        ].join('\n')),
      );

    console.log(`[Rankban] @${robloxUser.name} rank banned by ${interaction.user.tag} — ${reason}`);

    return interaction.editReply({ components: [container], flags: (1 << 15) });
  },
};