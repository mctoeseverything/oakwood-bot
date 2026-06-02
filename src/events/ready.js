const { Events, ActivityType } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`\n✅ Oakwood Bot is online as ${client.user.tag}`);
    client.user.setActivity('Amber Corporation', { type: ActivityType.Watching });
  },
};
