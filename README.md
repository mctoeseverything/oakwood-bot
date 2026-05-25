# 🛒 Oakwood Shopping — Discord Bot

All-in-one Discord bot for the **Oakwood Shopping** Roblox grocery store.

---

## Features

### ✅ Phase 1 (Included)
- **`/shift start`** — Announce a new shift or training session with a clean component-based message (no embeds)
- **`/shift end`** — Conclude a session and post a closing message with duration
- **`/shift status`** — See all currently running sessions

### 🔜 Planned Features
- Staff applications system
- Quota tracking
- Moderation tools (warn, kick, ban with logging)
- Welcome/leave messages
- Rank management integration

---

## Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- A Discord bot application — create one at https://discord.com/developers/applications

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```
Open `.env` and fill in:
- `BOT_TOKEN` — Your bot's token (Bot tab → Reset Token)
- `CLIENT_ID` — Your application's ID (OAuth2 tab)
- `GUILD_ID` — Your Discord server's ID (right-click server icon → Copy Server ID)

### 4. Enable Developer Mode in Discord
Go to **User Settings → Advanced → Developer Mode** and toggle it on.
This lets you right-click things to copy their IDs.

### 5. Invite the bot to your server
In the Discord Developer Portal:
1. Go to **OAuth2 → URL Generator**
2. Check **`bot`** and **`applications.commands`**
3. Under Bot Permissions, check:
   - Send Messages
   - Use Slash Commands
   - Mention Everyone (for role pings)
4. Copy the generated URL and open it to invite the bot

### 6. Deploy slash commands
```bash
npm run deploy
```

### 7. Start the bot
```bash
npm start
```

---

## Command Reference

### `/shift start`
| Option | Required | Description |
|---|---|---|
| `type` | ✅ | `Regular Shift` or `Training Session` |
| `host` | ✅ | The user hosting the session |
| `location` | ✅ | Where in the store (e.g. "Main Floor") |
| `cohost` | ❌ | Optional co-host |
| `notes` | ❌ | Extra info to show in the announcement |
| `promotional` | ❌ | Whether this is a promotional shift |
| `ping` | ❌ | Role to ping (defaults to @here) |

### `/shift end`
| Option | Required | Description |
|---|---|---|
| `host` | ❌ | Whose session to end (defaults to yourself) |

### `/shift status`
No options — shows all active sessions (visible only to you).

---

## Project Structure

```
oakwood-bot/
├── src/
│   ├── index.js              # Entry point
│   ├── commands/
│   │   └── shifts/
│   │       └── shift.js      # /shift command
│   ├── events/
│   │   ├── ready.js
│   │   └── interactionCreate.js
│   ├── handlers/
│   │   ├── commandHandler.js
│   │   └── eventHandler.js
│   └── utils/
│       └── messages.js       # Component message builders
├── scripts/
│   └── deploy.js             # Slash command deployment
├── .env.example
└── README.md
```

---

## Adding More Commands

1. Create a new folder under `src/commands/` (e.g. `src/commands/moderation/`)
2. Create a `.js` file with this shape:

```js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mycommand')
    .setDescription('Does something'),

  async execute(interaction, client) {
    await interaction.reply({ content: 'Hello!', ephemeral: true });
  },

  // Optional: handle buttons with customId starting with "mycommand:"
  async handleButton(interaction, client) { ... },

  // Optional: handle modals with customId starting with "mycommand:"
  async handleModal(interaction, client) { ... },
};
```

3. Run `npm run deploy` to register the new command.
