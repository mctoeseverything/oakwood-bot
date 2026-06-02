const axios = require('axios');
const { ROBLOX_GROUP_ID, RANK_TO_ROLE, MANAGED_ROLE_IDS } = require('./rolesConfig');

/**
 * Syncs a Discord member's roles based on their Roblox group rank.
 * Returns { addedRoles, removedRoles, inGroup, hasBinding, rankName }
 */
async function syncRoles(member, robloxId) {
  // Fetch their rank in the Roblox group
  const groupRes = await axios.get(
    `https://groups.roblox.com/v2/users/${robloxId}/groups/roles`,
  );

  const groupData  = groupRes.data.data;
  const groupEntry = groupData.find(g => String(g.group.id) === String(ROBLOX_GROUP_ID));
  const rankNumber = groupEntry?.role?.rank ?? 0;
  const inGroup    = !!groupEntry;
  const hasBinding = inGroup && !!RANK_TO_ROLE[rankNumber];

  const addedRoles   = [];
  const removedRoles = [];

  for (const [rank, discordRoleId] of Object.entries(RANK_TO_ROLE)) {
    const hasRole    = member.roles.cache.has(discordRoleId);
    const shouldHave = inGroup && String(rankNumber) === String(rank);

    if (shouldHave && !hasRole) {
      await member.roles.add(discordRoleId);
      addedRoles.push(discordRoleId);
    } else if (!shouldHave && hasRole && MANAGED_ROLE_IDS.includes(discordRoleId)) {
      await member.roles.remove(discordRoleId);
      removedRoles.push(discordRoleId);
    }
  }

  return {
    addedRoles,
    removedRoles,
    inGroup,
    hasBinding,
    rankName: groupEntry?.role?.name ?? null,
  };
}

module.exports = { syncRoles };