require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, '..', 'src', 'commands');

function loadFromDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadFromDir(fullPath);
    } else if (entry.name.endsWith('.js')) {
      const cmd = require(fullPath);
      if (cmd.data) {
        commands.push(cmd.data.toJSON());
        console.log(`  Queued: /${cmd.data.name}`);
      }
    }
  }
}

console.log('\n📦 Loading commands...');
loadFromDir(commandsPath);

const rest = new REST().setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log(`\n🚀 Deploying ${commands.length} command(s) to guild ${process.env.GUILD_ID}...`);
    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );
    console.log(`✅ Successfully deployed ${data.length} command(s)!\n`);
  } catch (err) {
    console.error('❌ Deploy failed:', err);
  }
})();
