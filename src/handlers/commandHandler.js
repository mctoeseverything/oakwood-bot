const fs = require('fs');
const path = require('path');

async function loadCommands(client) {
  const commandsPath = path.join(__dirname, '..', 'commands');
  const folders = fs.readdirSync(commandsPath);

  for (const folder of folders) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const command = require(path.join(folderPath, file));
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`[Commands] Loaded: /${command.data.name}`);
      }
    }
  }
}

module.exports = { loadCommands };
