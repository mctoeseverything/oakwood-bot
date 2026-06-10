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
  '1512630272015994930',
  // '000000000000000000', // ← Add more roles if needed
];

const ANNOUNCER_ROLE_IDS = [
  '1508516366314115132', //This is the co host role for temporary use  // ← your role ID here
];

/**
 * Discord role IDs that can use /rank promote, /rank demote, /rank change.
 * Any user with at least one of these roles can manage Roblox group ranks.
 * Rank changes are still limited to ranks strictly below the executor's own rank.
 */
const RANK_MANAGER_ROLE_IDS = [
   '1512630229166981170', // ← Replace with your rank manager role ID(s)
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
  24: '1511479068971892758', // Chairman
  23: '1511479347725209631', // Vice Chairman
  22: '1512547883340009475', // Development Contributor
  21: '1512547929414570196', // Company President
  20: '1512548523881660558', // Company Vice President
  19: '1512548659290701825', // Chief Executive Officer
  18: '1512548774097191075', // Corporate Operations Executive
  17: '1512548924748075099', // Board of Directors
  16: '1512549034827452426', // Corporate Executive
  15: '1512549127852920873', // Senior Corporate
  14: '1512549222816284692', // Corporate Associate
  13: '1512549374826254467', // Store Manager
  12: '1512549444149711008', // Assistant Store Manager
  11: '1512549563381317975', // Department Supervisor
  10: '1512549653420310659', // Management Assistant
  9: '1512549758454075402', // Senior Team Associate
  8: '1512549791484088390', // Team Associate
  7: '1512549966923567185', // Junior Team Associate
  6: '1512550082694877286', // Trainee
  5: '1512550171601539172', // Affiliate Representative
  4: '1512550268372254850', // Noted Customer
  3: '1512551859221434480', // Customer

};

/**
 * These roles will be REMOVED if the user no longer qualifies for them.
 * Usually this should be all the role IDs from RANK_TO_ROLE above.
 * Add any extra roles here that should be cleaned up on sync.
 */
const MANAGED_ROLE_IDS = Object.values(RANK_TO_ROLE);

module.exports = { ROBLOX_GROUP_ID, RANK_TO_ROLE, MANAGED_ROLE_IDS, ADMIN_ROLE_IDS, RANK_MANAGER_ROLE_IDS, ANNOUNCER_ROLE_IDS };
