const {
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorSpacingSize,
} = require('discord.js');
const { getMemberByDiscordId } = require('../../utils/memberStore');
const { syncRoles } = require('../../utils/syncRolesUtil');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('syncroles')
    .setDescription('Sync your Discord roles with your Roblox group rank'),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: (1 << 6) });

    const record = await getMemberByDiscordId(interaction.user.id);
    if (!record || !record.roblox_id) {
      return interaction.editReply({
        content: '⚠️ You need to verify your Roblox account first before syncing roles.',
      });
    }

    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const { addedRoles, removedRoles, inGroup, hasBinding, rankName } =
        await syncRoles(member, record.roblox_id);

      // Build result text
      const lines = [];
      if (!inGroup) {
        lines.push(`*You are not in the Roblox group. No roles were assigned.*`);
        if (removedRoles.length > 0) {
          lines.push('');
          for (const id of removedRoles) lines.push(`➖ <@&${id}>`);
        }
      } else if (!hasBinding) {
        lines.push(`*No role binding exists for your current group rank (${rankName}). Please contact an administrator.*`);
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

      // Set nickname to Roblox username
      await member.setNickname(record.roblox_name).catch(() => {});

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