const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  SeparatorSpacingSize,
} = require('discord.js');
const { ADMIN_ROLE_IDS } = require('../../utils/rolesConfig');
const { getMemberByDiscordId } = require('../../utils/memberStore');
const { syncRoles } = require('../../utils/syncRolesUtil');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forcesync')
    .setDescription('Force sync a user\'s roles and nickname with their Roblox group rank')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user to sync')
        .setRequired(true)),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: (1 << 6) });

    // Check admin role
    const hasAdminRole = Array.isArray(ADMIN_ROLE_IDS) && ADMIN_ROLE_IDS.length > 0 && interaction.member.roles.cache.some(r => ADMIN_ROLE_IDS.includes(r.id));
    if (!hasAdminRole) {
      return interaction.editReply({ content: '⛔ You do not have permission to use this command.' });
    }

    const target = interaction.options.getUser('user');
    const record = await getMemberByDiscordId(target.id);

    if (!record || !record.verified || !record.roblox_id) {
      return interaction.editReply({
        content: `⚠️ <@${target.id}> is not verified or has no linked Roblox account.`,
      });
    }

    try {
      const member = await interaction.guild.members.fetch(target.id);
      const { addedRoles, removedRoles, inGroup, hasBinding, rankName } =
        await syncRoles(member, record.roblox_id);

      // Set nickname to Roblox username
      await member.setNickname(record.roblox_name).catch(() => {});

      const lines = [];
      if (!inGroup) {
        lines.push(`*Not in the Roblox group. No rank roles assigned.*`);
        if (removedRoles.length > 0) for (const id of removedRoles) lines.push(`➖ <@&${id}>`);
      } else if (!hasBinding) {
        lines.push(`*No role binding for rank (${rankName}).*`);
        if (removedRoles.length > 0) for (const id of removedRoles) lines.push(`➖ <@&${id}>`);
      } else if (addedRoles.length === 0 && removedRoles.length === 0) {
        lines.push('*No changes — roles already up to date.*');
      } else {
        for (const id of addedRoles)   lines.push(`➕ <@&${id}>`);
        for (const id of removedRoles) lines.push(`➖ <@&${id}>`);
      }

      const container = new ContainerBuilder()
        .addTextDisplayComponents(t =>
          t.setContent(`### 🔄 Force Sync — <@${target.id}>\nSynced **@${record.roblox_name}** (${record.member_id})`),
        )
        .addSeparatorComponents(s =>
          s.setDivider(true).setSpacing(SeparatorSpacingSize.Large),
        )
        .addTextDisplayComponents(t =>
          t.setContent(lines.join('\n')),
        );

      return interaction.editReply({ components: [container], flags: (1 << 15) });

    } catch (err) {
      console.error('[ForceSync] Error:', err.message);
      return interaction.editReply({ content: '❌ Something went wrong while syncing.' });
    }
  },
};