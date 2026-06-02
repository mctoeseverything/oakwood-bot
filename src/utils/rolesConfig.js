/**
 * ─────────────────────────────────────────────────────────────
 *  ROLE SYNC CONFIGURATION
 *  Edit this file to change the Roblox → Discord role mappings.
 * ─────────────────────────────────────────────────────────────
 *
 *  HOW TO FIND YOUR ROBLOX RANK IDs:
 *  1. Go to your Roblox group page
 *  2. Click "..." → "Configure Group"
 *  3. Click "Roles" on the left
 *  4. Each role has a number in the URL when you click it — that's the rank ID
 *     (it's also the rank number shown next to the role name, e.g. rank 1, 50, 100)
 *
 *  HOW TO FIND YOUR DISCORD ROLE IDs:
 *  1. Enable Developer Mode (User Settings → Advanced → Developer Mode)
 *  2. Right-click a role in Server Settings → Roles → Copy Role ID
 */

const ROBLOX_GROUP_ID = '12183130'; // ← Replace with your Roblox group ID

/**
 * Maps Roblox group rank numbers to Discord role IDs.
 * Add, remove, or edit entries as needed.
 *
 * Format:
 *   robloxRank: 'discordRoleId',
 */
const RANK_TO_ROLE = {
  255: '1511479068971892758', // Owner       → @Owner
  254: '1511479347725209631', // Co-Owner    → @Co-Owner
};

/**
 * These roles will be REMOVED if the user no longer qualifies for them.
 * Usually this should be all the role IDs from RANK_TO_ROLE above.
 * Add any extra roles here that should be cleaned up on sync.
 */
const MANAGED_ROLE_IDS = Object.values(RANK_TO_ROLE);

module.exports = { ROBLOX_GROUP_ID, RANK_TO_ROLE, MANAGED_ROLE_IDS };