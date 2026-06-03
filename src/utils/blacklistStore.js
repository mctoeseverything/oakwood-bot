const mongoose = require('mongoose');

let connected = false;
async function connect() {
  if (connected || mongoose.connection.readyState === 1) { connected = true; return; }
  await mongoose.connect(process.env.MONGODB_URI);
  connected = true;
}

const blacklistSchema = new mongoose.Schema({
  type:       { type: String, enum: ['discord', 'roblox'], required: true },
  account_id: { type: String, required: true },
  added_by:   { type: String, required: true },
  added_at:   { type: String, required: true },
});

blacklistSchema.index({ type: 1, account_id: 1 }, { unique: true });

const Blacklist = mongoose.models.Blacklist || mongoose.model('Blacklist', blacklistSchema);

async function addToBlacklist(type, accountId, addedBy) {
  await connect();
  await Blacklist.updateOne(
    { type, account_id: accountId },
    { $setOnInsert: { type, account_id: accountId, added_by: addedBy, added_at: new Date().toISOString() } },
    { upsert: true }
  );
}

async function removeFromBlacklist(type, accountId) {
  await connect();
  await Blacklist.deleteOne({ type, account_id: accountId });
}

async function isBlacklisted(type, accountId) {
  await connect();
  return !!(await Blacklist.exists({ type, account_id: accountId }));
}

module.exports = { addToBlacklist, removeFromBlacklist, isBlacklisted };