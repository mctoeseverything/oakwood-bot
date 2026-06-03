const mongoose = require('mongoose');

let connected = false;
async function connect() {
  if (connected || mongoose.connection.readyState === 1) { connected = true; return; }
  await mongoose.connect(process.env.MONGODB_URI);
  connected = true;
}

const flagSchema = new mongoose.Schema({
  member_id:   { type: String, required: true }, // Atlas member ID
  discord_id:  { type: String, required: true }, // for quick lookup
  type:        { type: String, enum: ['ban', 'kick', 'warn', 'note'], required: true },
  reason:      { type: String, default: 'No reason provided' },
  moderator_id:{ type: String },
  created_at:  { type: String, required: true },
});

const Flag = mongoose.models.Flag || mongoose.model('Flag', flagSchema);

async function addFlag({ memberId, discordId, type, reason, moderatorId }) {
  await connect();
  return Flag.create({
    member_id:    memberId,
    discord_id:   discordId,
    type,
    reason,
    moderator_id: moderatorId,
    created_at:   new Date().toISOString(),
  });
}

async function getFlagsByMemberId(memberId) {
  await connect();
  return Flag.find({ member_id: memberId }).sort({ created_at: -1 });
}

async function getFlagsByDiscordId(discordId) {
  await connect();
  return Flag.find({ discord_id: discordId }).sort({ created_at: -1 });
}

async function getFlagCount(memberId) {
  await connect();
  return Flag.countDocuments({ member_id: memberId });
}

module.exports = { addFlag, getFlagsByMemberId, getFlagsByDiscordId, getFlagCount };