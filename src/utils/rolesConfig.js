/**
 * ─────────────────────────────────────────────────────────────
 *  ROLE SYNC CONFIGURATION
 *  Edit this file to change the Roblox → Discord role mappings.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Discord role IDs for admin-only commands (/forcesync, /forceunverify, /verifyblacklist)
 * Any user with at least one of these roles can use admin commands.
 */
const ADMIN_ROLE_IDS = [
  '1511809393224843314',
  // '000000000000000000', // ← Add more roles if needed
];

/**
 * Discord role IDs that can use /rank promote, /rank demote, /rank change.
 * Any user with at least one of these roles can manage Roblox group ranks.
 * Rank changes are still limited to ranks strictly below the executor's own rank.
 */
const RANK_MANAGER_ROLE_IDS = [
  // '000000000000000000', // ← Replace with your rank manager role ID(s)
];

/**
 * Your Roblox group ID.
 * Found in your group's URL: roblox.com/groups/XXXXXXX/...
 */
const ROBLOX_GROUP_ID = '12183130';

/**
 * Maps Roblox group rank numbers to Discord role IDs.
 * Add, remove, or edit entries as needed.
 *
 * Format:
 *   robloxRank: 'discordRoleId',
 */
const RANK_TO_ROLE = {
  255: '1511479068971892758', // Owner    → @Owner
  254: '1511479347725209631', // Co-Owner → @Co-Owner
};

/**
 * These roles will be REMOVED if the user no longer qualifies for them.
 * Usually this should be all the role IDs from RANK_TO_ROLE above.
 * Add any extra roles here that should be cleaned up on sync.
 */
const MANAGED_ROLE_IDS = Object.values(RANK_TO_ROLE);

module.exports = { ROBLOX_GROUP_ID, RANK_TO_ROLE, MANAGED_ROLE_IDS, ADMIN_ROLE_IDS, RANK_MANAGER_ROLE_IDS };