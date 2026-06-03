const {
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getMemberByDiscordId, removeMember } = require('../../utils/memberStore');
const { logUnverified } = require('../../utils/logger');
const { MANAGED_ROLE_IDS } = require('../../utils/rolesConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unverify')
    .setDescription('Revoke your verification status'),

  async execute(interaction, client) {
    const record = await getMemberByDiscordId(interaction.user.id);

    if (!record) {
      return interaction.reply({
        content: '⚠️ You are not currently verified.',
        flags: (1 << 6),
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('unverify:confirm')
        .setLabel('Yes, continue')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('unverify:cancel')
        .setLabel('No, cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    const container = new ContainerBuilder()
      .addTextDisplayComponents(t =>
        t.setContent(
          `### ⚠️ Are you sure you want to unverify?\nThis will revoke your verification status and cannot be undone until you complete verification again.`,
        ),
      )
      .addSeparatorComponents(s =>
        s.setDivider(true).setSpacing(SeparatorSpacingSize.Large),
      )
      .addActionRowComponents(() => row);

    return interaction.reply({
      components: [container],
      flags: (1 << 15) | (1 << 6),
    });
  },

  async handleButton(interaction, client) {
    const action = interaction.customId.split(':')[1];

    if (action === 'cancel') {
      const container = new ContainerBuilder()
        .addTextDisplayComponents(t =>
          t.setContent(`### ✅ Unverification Cancelled\nYour verification status has not been changed.`),
        );

      return interaction.update({
        components: [container],
        flags: (1 << 15) | (1 << 6),
      });
    }

    if (action === 'confirm') {
      const record = await getMemberByDiscordId(interaction.user.id);
      if (!record || !record.verified) {
        return interaction.update({
          components: [],
          content: '⚠️ You are not currently verified.',
          flags: (1 << 6),
        });
      }

      // Remove from DB
      await removeMember(interaction.user.id);

      // Remove verified role + rank roles, add unverified role, reset nickname
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const rolesToRemove = [];

        if (process.env.VERIFIED_ROLE_ID) rolesToRemove.push(process.env.VERIFIED_ROLE_ID);
        for (const roleId of MANAGED_ROLE_IDS) {
          if (member.roles.cache.has(roleId)) rolesToRemove.push(roleId);
        }

        if (rolesToRemove.length > 0) await member.roles.remove(rolesToRemove);
        if (process.env.UNVERIFIED_ROLE_ID) await member.roles.add(process.env.UNVERIFIED_ROLE_ID);

        // Reset nickname
        await member.setNickname(null).catch(() => {});
      } catch (err) {
        console.error('[Unverify] Failed to update roles/nickname:', err.message);
      }

      const container = new ContainerBuilder()
        .addTextDisplayComponents(t =>
          t.setContent(`### 🔴 Unverified\nYour verification status has been revoked. You can verify again at any time.`),
        );

      await logUnverified({ discordId: interaction.user.id, discordName: interaction.user.username, memberId: record.member_id, by: interaction.user.id });

      return interaction.update({
        components: [container],
        flags: (1 << 15) | (1 << 6),
      });
    }
  },
};