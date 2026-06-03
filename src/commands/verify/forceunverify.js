const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { getMemberByDiscordId, removeMember } = require('../../utils/memberStore');
const { MANAGED_ROLE_IDS, ADMIN_ROLE_IDS } = require('../../utils/rolesConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forceunverify')
    .setDescription('Force unverify a user, removing their roles and verification status')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user to unverify')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for forced unverification (optional)')),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: (1 << 6) });

    // Check admin role
    const hasAdminRole = Array.isArray(ADMIN_ROLE_IDS) && ADMIN_ROLE_IDS.length > 0 && interaction.member.roles.cache.some(r => ADMIN_ROLE_IDS.includes(r.id));
    if (!hasAdminRole) {
      return interaction.editReply({ content: '⛔ You do not have permission to use this command.' });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const record = await getMemberByDiscordId(target.id);

    if (!record || !record.verified) {
      return interaction.editReply({
        content: `⚠️ <@${target.id}> is not currently verified.`,
      });
    }

    // Clear verification in DB
    await removeMember(target.id);

    // Remove roles + add unverified role + reset nickname
    try {
      const member = await interaction.guild.members.fetch(target.id);
      const rolesToRemove = [];

      if (process.env.VERIFIED_ROLE_ID) rolesToRemove.push(process.env.VERIFIED_ROLE_ID);
      for (const roleId of MANAGED_ROLE_IDS) {
        if (member.roles.cache.has(roleId)) rolesToRemove.push(roleId);
      }

      if (rolesToRemove.length > 0) await member.roles.remove(rolesToRemove);
      if (process.env.UNVERIFIED_ROLE_ID) await member.roles.add(process.env.UNVERIFIED_ROLE_ID);
      await member.setNickname(null).catch(() => {});
    } catch (err) {
      console.error('[ForceUnverify] Failed to update roles/nickname:', err.message);
    }

    return interaction.editReply({
      content: [
        `### ✅ Force Unverified`,
        `> **User:** <@${target.id}>`,
        `> **Member ID:** \`${record.member_id}\` *(preserved)*`,
        `> **Reason:** ${reason}`,
        `> **By:** <@${interaction.user.id}>`,
      ].join('\n'),
    });
  },
};