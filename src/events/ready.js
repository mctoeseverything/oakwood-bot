const { Events, ActivityType } = require('discord.js');
const { setClient } = require('../utils/logger');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`\n✅ Atlas is online as ${client.user.tag}`);
    client.user.setActivity('Amber Corporation', { type: ActivityType.Watching });
    setClient(client);
  },
};