const {
  ContainerBuilder,
  SeparatorSpacingSize,
} = require('discord.js');

let _client = null;

function setClient(client) {
  _client = client;
}

async function sendLog(fields) {
  const logChannelId = process.env.VERIFY_LOG_CHANNEL_ID;
  if (!logChannelId || !_client) return;

  try {
    const channel = await _client.channels.fetch(logChannelId);
    if (!channel?.isTextBased()) return;

    const now = Math.floor(Date.now() / 1000);

    const header = `### ${fields.emoji ?? 'ℹ️'} ${fields.title}`;
    const meta   = `> <t:${now}:F>`;
    const body   = fields.lines.map(l => `> ${l}`).join('\n');

    const container = new ContainerBuilder()
      .addTextDisplayComponents(t =>
        t.setContent(`${header}\n${meta}`),
      )
      .addSeparatorComponents(s =>
        s.setDivider(true).setSpacing(SeparatorSpacingSize.Large),
      )
      .addTextDisplayComponents(t =>
        t.setContent(body),
      );

    await channel.send({ components: [container], flags: (1 << 15) });
  } catch (err) {
    console.error('[Logger] Failed to send log:', err.message);
  }
}

// ── Prebuilt log types ────────────────────────────────────────────────────────

function logVerified({ discordId, discordName, robloxId, robloxName, memberId }) {
  return sendLog({
    emoji: '✅',
    title: 'User Verified',
    lines: [
      `**Member ID:** \`${memberId}\``,
      `**Discord:** <@${discordId}> (${discordName})`,
      `**Roblox:** @${robloxName} (ID: \`${robloxId}\`)`,
    ],
  });
}

function logUnverified({ discordId, discordName, memberId, by }) {
  const self = by === discordId;
  return sendLog({
    emoji: '🔴',
    title: self ? 'User Unverified' : 'User Force Unverified',
    lines: [
      `**Member ID:** \`${memberId}\``,
      `**Discord:** <@${discordId}> (${discordName})`,
      ...(self ? [] : [`**By:** <@${by}>`]),
    ],
  });
}

function logForceUnverified({ discordId, discordName, memberId, by, reason }) {
  return sendLog({
    emoji: '🔴',
    title: 'Force Unverified',
    lines: [
      `**Member ID:** \`${memberId}\``,
      `**Discord:** <@${discordId}> (${discordName})`,
      `**By:** <@${by}>`,
      `**Reason:** ${reason}`,
    ],
  });
}

function logForceSync({ discordId, robloxName, memberId, by, addedRoles, removedRoles }) {
  const changes = [];
  for (const id of addedRoles)   changes.push(`➕ <@&${id}>`);
  for (const id of removedRoles) changes.push(`➖ <@&${id}>`);
  if (changes.length === 0) changes.push('*No role changes*');

  return sendLog({
    emoji: '🔄',
    title: 'Force Sync',
    lines: [
      `**Member ID:** \`${memberId}\``,
      `**Discord:** <@${discordId}>`,
      `**Roblox:** @${robloxName}`,
      `**By:** <@${by}>`,
      `**Changes:** ${changes.join(', ')}`,
    ],
  });
}

function logSyncRoles({ discordId, robloxName, memberId, addedRoles, removedRoles }) {
  const changes = [];
  for (const id of addedRoles)   changes.push(`➕ <@&${id}>`);
  for (const id of removedRoles) changes.push(`➖ <@&${id}>`);
  if (changes.length === 0) changes.push('*No role changes*');

  return sendLog({
    emoji: '🔄',
    title: 'Role Sync',
    lines: [
      `**Member ID:** \`${memberId}\``,
      `**Discord:** <@${discordId}>`,
      `**Roblox:** @${robloxName}`,
      `**Changes:** ${changes.join(', ')}`,
    ],
  });
}

function logBlacklistAdd({ type, accountId, by }) {
  return sendLog({
    emoji: '🚫',
    title: 'Blacklist Added',
    lines: [
      `**Type:** ${type === 'discord' ? 'Discord' : 'Roblox'} ID`,
      `**Account ID:** \`${accountId}\``,
      `**By:** <@${by}>`,
    ],
  });
}

function logBlacklistRemove({ type, accountId, by }) {
  return sendLog({
    emoji: '✏️',
    title: 'Blacklist Removed',
    lines: [
      `**Type:** ${type === 'discord' ? 'Discord' : 'Roblox'} ID`,
      `**Account ID:** \`${accountId}\``,
      `**By:** <@${by}>`,
    ],
  });
}

function logBlacklistBlocked({ type, accountId }) {
  return sendLog({
    emoji: '⛔',
    title: 'Verification Blocked (Blacklisted)',
    lines: [
      `**Type:** ${type === 'discord' ? 'Discord' : 'Roblox'} ID`,
      `**Account ID:** \`${accountId}\``,
    ],
  });
}

/**
 * Logs a Roblox group rank change (promote / demote / changerank).
 */
function logRankChange({ discordId, robloxName, memberId, by, oldRank, newRank, action, reason }) {
  return sendLog({
    emoji: action === 'Promoted' ? '⬆️' : action === 'Demoted' ? '⬇️' : '🔢',
    title: `Rank ${action}`,
    lines: [
      `**Member ID:** \`${memberId}\``,
      `**Discord:** <@${discordId}>`,
      `**Roblox:** @${robloxName}`,
      `**By:** <@${by}>`,
      `**Previous Rank:** ${oldRank}`,
      `**New Rank:** ${newRank}`,
      `**Reason:** ${reason}`,   // ← add
    ],
  });
}

module.exports = {
  setClient,
  logVerified,
  logUnverified,
  logForceUnverified,
  logForceSync,
  logSyncRoles,
  logBlacklistAdd,
  logBlacklistRemove,
  logBlacklistBlocked,
  logRankChange,
};