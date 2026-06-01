const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', '..', '..', 'members.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    member_id    TEXT PRIMARY KEY,
    discord_id   TEXT UNIQUE NOT NULL,
    discord_name TEXT NOT NULL,
    joined_at    TEXT NOT NULL
  )
`);

function generateMemberId() {
  const count = db.prepare('SELECT COUNT(*) as c FROM members').get().c;
  return `M-${String(count + 1).padStart(5, '0')}`;
}

function addMember(discordId, discordName) {
  const existing = db.prepare('SELECT * FROM members WHERE discord_id = ?').get(discordId);
  if (existing) return { member: existing, isNew: false };

  const memberId = generateMemberId();
  db.prepare(`
    INSERT INTO members (member_id, discord_id, discord_name, joined_at)
    VALUES (?, ?, ?, ?)
  `).run(memberId, discordId, discordName, new Date().toISOString());

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

module.exports = { addMember, getMemberByDiscordId, getMemberById };