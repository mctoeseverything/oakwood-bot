const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { addToBlacklist, removeFromBlacklist } = require('../../utils/blacklistStore');
const { logBlacklistAdd, logBlacklistRemove } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verifyblacklist')
    .setDescription('Manage the verification blacklist')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add an account to the verification blacklist')
        .addStringOption(opt =>
          opt.setName('type')
            .setDescription('Account type to blacklist')
            .setRequired(true)
            .addChoices(
              { name: 'Discord ID', value: 'discord' },
              { name: 'Roblox ID',  value: 'roblox'  },
            ))
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('The account ID to blacklist')
            .setRequired(true)))

    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove an account from the verification blacklist')
        .addStringOption(opt =>
          opt.setName('type')
            .setDescription('Account type')
            .setRequired(true)
            .addChoices(
              { name: 'Discord ID', value: 'discord' },
              { name: 'Roblox ID',  value: 'roblox'  },
            ))
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('The account ID to remove')
            .setRequired(true))),

  async execute(interaction, client) {
    const sub       = interaction.options.getSubcommand();
    const type      = interaction.options.getString('type');
    const accountId = interaction.options.getString('id');

    if (sub === 'add') {
      await addToBlacklist(type, accountId, interaction.user.id);
      await logBlacklistAdd({ type, accountId, by: interaction.user.id });
      return interaction.reply({
        content: `✅ Blacklisted **${type} ID** \`${accountId}\`. They will not be able to verify.`,
        flags: (1 << 6),
      });
    }

    if (sub === 'remove') {
      await removeFromBlacklist(type, accountId);
      await logBlacklistRemove({ type, accountId, by: interaction.user.id });
      return interaction.reply({
        content: `✅ Removed **${type} ID** \`${accountId}\` from the blacklist.`,
        flags: (1 << 6),
      });
    }
  },
};