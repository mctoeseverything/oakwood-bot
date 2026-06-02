const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', '..', '..', 'members.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    member_id      TEXT PRIMARY KEY,
    discord_id     TEXT UNIQUE NOT NULL,
    discord_name   TEXT NOT NULL,
    roblox_id      TEXT,
    roblox_name    TEXT,
    joined_at      TEXT NOT NULL
  )
`);

// Add roblox columns if upgrading from old schema
try {
  db.exec(`ALTER TABLE members ADD COLUMN roblox_id TEXT`);
  db.exec(`ALTER TABLE members ADD COLUMN roblox_name TEXT`);
} catch {}

function generateMemberId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id;
  do {
    id = '';
    for (let i = 0; i < 6; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (db.prepare('SELECT 1 FROM members WHERE member_id = ?').get(id));
  return id;
}

function addMember(discordId, discordName, robloxId = null, robloxName = null) {
  const existing = db.prepare('SELECT * FROM members WHERE discord_id = ?').get(discordId);

  if (existing) {
    // Update Roblox info if provided
    if (robloxId) {
      db.prepare(`
        UPDATE members SET roblox_id = ?, roblox_name = ? WHERE discord_id = ?
      `).run(robloxId, robloxName, discordId);
    }
    return {
      member: db.prepare('SELECT * FROM members WHERE discord_id = ?').get(discordId),
      isNew: false,
    };
  }

  const memberId = generateMemberId();
  db.prepare(`
    INSERT INTO members (member_id, discord_id, discord_name, roblox_id, roblox_name, joined_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(memberId, discordId, discordName, robloxId, robloxName, new Date().toISOString());

  return {
    member: db.prepare('SELECT * FROM members WHERE discord_id = ?').get(discordId),
    isNew: true,
  };
}

function getMemberByDiscordId(discordId) {
  return db.prepare('SELECT * FROM members WHERE discord_id = ?').get(discordId);
}

function getMemberById(memberId) {
  return db.prepare('SELECT * FROM members WHERE member_id = ?').get(memberId);
}

function getMemberByRobloxId(robloxId) {
  return db.prepare('SELECT * FROM members WHERE roblox_id = ?').get(robloxId);
}

function removeMember(discordId) {
  db.prepare('DELETE FROM members WHERE discord_id = ?').run(discordId);
}

module.exports = { addMember, getMemberByDiscordId, getMemberById, getMemberByRobloxId, removeMember };