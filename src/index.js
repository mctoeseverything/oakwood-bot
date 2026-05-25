require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');
const http = require('http');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();
client.cooldowns = new Collection();

// Keep-alive HTTP server for Render
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
});
server.listen(process.env.PORT || 3000);

(async () => {
  await loadCommands(client);
  await loadEvents(client);
  await client.login(process.env.BOT_TOKEN);
})();