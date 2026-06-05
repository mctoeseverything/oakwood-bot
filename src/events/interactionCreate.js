const { Events } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    // ── Autocomplete ────────────────────────────────────────────
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.handleAutocomplete) {
        try {
          await command.handleAutocomplete(interaction, client);
        } catch (err) {
          console.error(`[Error] Autocomplete ${interaction.commandName}:`, err);
        }
      }
      return;
    }

    // ── Slash Commands ──────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[Error] /${interaction.commandName}:`, err);
        const msg = { content: '❌ Something went wrong running that command.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg);
        } else {
          await interaction.reply(msg);
        }
      }
      return;
    }

    // ── Button Interactions ─────────────────────────────────────
    if (interaction.isButton()) {
      const [commandName] = interaction.customId.split(':');
      const command = client.commands.get(commandName);
      if (command?.handleButton) {
        try {
          await command.handleButton(interaction, client);
        } catch (err) {
          console.error(`[Error] Button ${interaction.customId}:`, err);
        }
      }
      return;
    }

    // ── Select Menu Interactions ────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const [commandName] = interaction.customId.split(':');
      const command = client.commands.get(commandName);
      if (command?.handleSelect) {
        try {
          await command.handleSelect(interaction, client);
        } catch (err) {
          console.error(`[Error] Select ${interaction.customId}:`, err);
        }
      }
      return;
    }

    // ── Modal Submissions ───────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const [commandName] = interaction.customId.split(':');
      const command = client.commands.get(commandName);
      if (command?.handleModal) {
        try {
          await command.handleModal(interaction, client);
        } catch (err) {
          console.error(`[Error] Modal ${interaction.customId}:`, err);
        }
      }
      return;
    }
  },
};