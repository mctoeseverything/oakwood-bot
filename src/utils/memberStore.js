const mongoose = require('mongoose');

// ── Connect ──────────────────────────────────────────────────────────────────
let connected = false;
async function connect() {
  if (connected) return;
  await mongoose.connect(process.env.MONGODB_URI);
  connected = true;
  console.log('[DB] Connected to MongoDB');
}

// ── Schema ───────────────────────────────────────────────────────────────────
const memberSchema = new mongoose.Schema({
  member_id:    { type: String, required: true, unique: true },
  discord_id:   { type: String, required: true, unique: true },
  discord_name: { type: String, required: true },
  roblox_id:    { type: String, default: null },
  roblox_name:  { type: String, default: null },
  joined_at:    { type: String, required: true },
});

const Member = mongoose.models.Member || mongoose.model('Member', memberSchema);

// ── ID Generator ─────────────────────────────────────────────────────────────
async function generateUniqueMemberId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id;
  do {
    id = '';
    for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  } while (await Member.exists({ member_id: id }));
  return id;
}

// ── Functions ─────────────────────────────────────────────────────────────────
async function addMember(discordId, discordName, robloxId = null, robloxName = null) {
  await connect();
  const existing = await Member.findOne({ discord_id: discordId });

  if (existing) {
    if (robloxId) {
      existing.roblox_id   = robloxId;
      existing.roblox_name = robloxName;
      await existing.save();
    }
    return { member: existing.toObject(), isNew: false };
  }

  const memberId = await generateUniqueMemberId();
  const member = await Member.create({
    member_id:    memberId,
    discord_id:   discordId,
    discord_name: discordName,
    roblox_id:    robloxId,
    roblox_name:  robloxName,
    joined_at:    new Date().toISOString(),
  });

  return { member: member.toObject(), isNew: true };
}

async function getMemberByDiscordId(discordId) {
  await connect();
  const m = await Member.findOne({ discord_id: discordId });
  return m ? m.toObject() : null;
}

async function getMemberById(memberId) {
  await connect();
  const m = await Member.findOne({ member_id: memberId });
  return m ? m.toObject() : null;
}

async function getMemberByRobloxId(robloxId) {
  await connect();
  const m = await Member.findOne({ roblox_id: robloxId });
  return m ? m.toObject() : null;
}

async function removeMember(discordId) {
  await connect();
  await Member.deleteOne({ discord_id: discordId });
}

module.exports = {
  addMember,
  getMemberByDiscordId,
  getMemberById,
  getMemberByRobloxId,
  removeMember,
};