/**\
 * ─────────────────────────────────────────────────────────────
 *  ROLE SYNC CONFIGURATION
 *  Edit this file to change the Roblox → Discord role mappings.
 * ─────────────────────────────────────────────────────────────
\**/


const ADMIN_ROLE_IDS = [
  '1511809393224843314', // ← Replace with your admin role ID
  // '000000000000000000', // ← Add more roles if needed
];


const ROBLOX_GROUP_ID = '12183130'; // ← Replace with your Roblox group ID

/**\
 * Maps Roblox group rank numbers to Discord role IDs.
 * Add, remove, or edit entries as needed.
 * Format: robloxRank: 'discordRoleId',
 \**/

const RANK_TO_ROLE = {
  255: '1511479068971892758', // Owner       → @Owner
  254: '1511479347725209631', // Co-Owner    → @Co-Owner
};

/**\
 * These roles will be REMOVED if the user no longer qualifies for them.
 * Usually this should be all the role IDs from RANK_TO_ROLE above.
 * Add any extra roles here that should be cleaned up on sync.
\**/

const MANAGED_ROLE_IDS = Object.values(RANK_TO_ROLE);

module.exports = { ROBLOX_GROUP_ID, RANK_TO_ROLE, MANAGED_ROLE_IDS };