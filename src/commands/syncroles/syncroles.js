const {
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorSpacingSize,
} = require('discord.js');
const axios = require('axios');
const { getMemberByDiscordId } = require('../../utils/memberStore');
const { ROBLOX_GROUP_ID, RANK_TO_ROLE, MANAGED_ROLE_IDS } = require('../../utils/rolesConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('syncroles')
    .setDescription('Sync your Discord roles with your Roblox group rank'),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: (1 << 6) });

    // Check they're verified
    const record = getMemberByDiscordId(interaction.user.id);
    if (!record || !record.roblox_id) {
      return interaction.editReply({
        content: '⚠️ You need to verify your Roblox account first before syncing roles.',
      });
    }

    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);

      // Fetch their rank in the Roblox group
      const groupRes = await axios.get(
        `https://groups.roblox.com/v2/users/${record.roblox_id}/groups/roles`,
      );

      const groupData = groupRes.data.data;
      const groupEntry = groupData.find(g => String(g.group.id) === String(ROBLOX_GROUP_ID));
      const rankNumber = groupEntry?.role?.rank ?? 0;

      // Check if user is in the group at all
      const inGroup = !!groupEntry;

      // Work out which roles to add and remove
      const addedRoles   = [];
      const removedRoles = [];

      for (const [rank, discordRoleId] of Object.entries(RANK_TO_ROLE)) {
        const hasRole    = member.roles.cache.has(discordRoleId);
        const shouldHave = inGroup && String(rankNumber) === String(rank);

        if (shouldHave && !hasRole) {
          await member.roles.add(discordRoleId);
          addedRoles.push(discordRoleId);
        } else if (!shouldHave && hasRole && MANAGED_ROLE_IDS.includes(discordRoleId)) {
          await member.roles.remove(discordRoleId);
          removedRoles.push(discordRoleId);
        }
      }

      // Build result text
      const lines = [];

      if (!inGroup) {
        // Not in the group at all
        lines.push(`*You are not in the Roblox group. No roles were assigned.*`);
        if (removedRoles.length > 0) {
          lines.push('');
          for (const id of removedRoles) lines.push(`➖ <@&${id}>`);
        }
      } else if (!RANK_TO_ROLE[rankNumber]) {
        // In the group but no role binding exists for their rank
        lines.push(`*No role binding exists for your current group rank (${groupEntry.role.name}). Please contact an administrator.*`);
        if (removedRoles.length > 0) {
          lines.push('');
          for (const id of removedRoles) lines.push(`➖ <@&${id}>`);
        }
      } else if (addedRoles.length === 0 && removedRoles.length === 0) {
        lines.push('*No changes — your roles are already up to date.*');
      } else {
        for (const id of addedRoles)   lines.push(`➕ <@&${id}>`);
        for (const id of removedRoles) lines.push(`➖ <@&${id}>`);
      }

      const container = new ContainerBuilder()
        .addTextDisplayComponents(t =>
          t.setContent(
            `### 🔄 Roles Synced\nYour Discord roles were synced with your group rank and any gamepasses/badges you may own. If you believe your assigned roles are incorrect or still outdated, please contact support.`,
          ),
        )
        .addSeparatorComponents(s =>
          s.setDivider(true).setSpacing(SeparatorSpacingSize.Large),
        )
        .addTextDisplayComponents(t =>
          t.setContent(lines.join('\n')),
        )
        .addSeparatorComponents(s =>
          s.setDivider(true).setSpacing(SeparatorSpacingSize.Large),
        )
        .addTextDisplayComponents(t =>
          t.setContent(
            `Synced Roblox Account: **@${record.roblox_name}**　　Member ID: \`${record.member_id}\``,
          ),
        );

      return interaction.editReply({
        components: [container],
        flags: (1 << 15),
      });

    } catch (err) {
      console.error('[SyncRoles] Error:', err.response?.data ?? err.message);
      return interaction.editReply({
        content: '❌ Something went wrong while syncing your roles. Please try again.',
      });
    }
  },
};