const mongoose = require('mongoose');

let connected = false;
async function connect() {
  if (connected || mongoose.connection.readyState === 1) { connected = true; return; }
  await mongoose.connect(process.env.MONGODB_URI);
  connected = true;
}

const rankbanSchema = new mongoose.Schema({
  roblox_username: { type: String, required: true, unique: true },
  roblox_id:       { type: String, required: true },
  reason:          { type: String, required: true },
  banned_by:       { type: String, required: true }, // Discord ID
  banned_at:       { type: String, required: true },
});

const Rankban = mongoose.models.Rankban || mongoose.model('Rankban', rankbanSchema);

async function addRankban(robloxUsername, robloxId, reason, bannedBy) {
  await connect();
  await Rankban.updateOne(
    { roblox_id: robloxId },
    { $set: { roblox_username: robloxUsername, roblox_id: robloxId, reason, banned_by: bannedBy, banned_at: new Date().toISOString() } },
    { upsert: true },
  );
}

async function removeRankban(robloxId) {
  await connect();
  const result = await Rankban.deleteOne({ roblox_id: robloxId });
  return result.deletedCount > 0;
}

async function getRankban(robloxId) {
  await connect();
  const doc = await Rankban.findOne({ roblox_id: robloxId });
  return doc ? doc.toObject() : null;
}

module.exports = { addRankban, removeRankban, getRankban };