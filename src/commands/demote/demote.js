const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  SeparatorSpacingSize,
} = require('discord.js');

const axios = require('axios');
const { getMemberByDiscordId } = require('../../utils/memberStore');
const { ROBLOX_GROUP_ID, RANK_MANAGER_ROLE_IDS } = require('../../utils/rolesConfig');
const { logRankChange } = require('../../utils/logger');

const OC_BASE = 'https://apis.roblox.com/cloud/v2';

function ocHeaders() {
  return { 'x-api-key': process.env.ROBLOX_OPEN_CLOUD_KEY };
}

async function fetchGroupRoles() {
  let allRoles = [];
  let nextPageToken = null;

  do {
    const params = { maxPageSize: 20 };
    if (nextPageToken) params.pageToken = nextPageToken;

    const res = await axios.get(
      `${OC_BASE}/groups/${ROBLOX_GROUP_ID}/roles`,
      { headers: ocHeaders(), params },
    );

    allRoles = allRoles.concat(res.data.groupRoles ?? []);
    nextPageToken = res.data.nextPageToken ?? null;
  } while (nextPageToken);

  return allRoles
    .filter(r => r.rank !== 0)
    .map(r => ({ ...r, name: r.displayName ?? r.name ?? String(r.rank) }))
    .sort((a, b) => a.rank - b.rank);
}

async function fetchMembership(robloxUserId) {
  try {
    const res = await axios.get(
      `${OC_BASE}/groups/${ROBLOX_GROUP_ID}/memberships`,
      {
        headers: ocHeaders(),
        params: { filter: `user == 'users/${robloxUserId}'` },
      },
    );
    return (res.data.groupMemberships ?? [])[0] ?? null;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

async function updateMembership(membershipPath, rolePath) {
  await axios.patch(
    `${OC_BASE}/${membershipPath}`,
    { role: rolePath },
    { headers: { ...ocHeaders(), 'Content-Type': 'application/json' } },
  );
}

function hasRankManagerRole(member) {
  if (!Array.isArray(RANK_MANAGER_ROLE_IDS) || RANK_MANAGER_ROLE_IDS.length === 0) return false;
  return member.roles.cache.some(r => RANK_MANAGER_ROLE_IDS.includes(r.id));
}

async function getExecutorRank(interaction, roles) {
  const record = await getMemberByDiscordId(interaction.user.id);
  if (!record?.roblox_id) return 0;
  const membership = await fetchMembership(record.roblox_id);
  if (!membership) return 0;
  const roleId = membership.role.split('/').pop();
  return roles.find(r => String(r.id) === roleId)?.rank ?? 0;
}

function resolveCurrentRole(roles, membership) {
  const roleId = membership.role.split('/').pop();
  const index = roles.findIndex(r => String(r.id) === roleId);
  return { index, role: index !== -1 ? roles[index] : null };
}

async function errorReply(interaction, message) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`### ⚠️ Action Blocked\n${message}`));
  return interaction.editReply({ components: [container], flags: (1 << 15) });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('demote')
    .setDescription('Demote a verified member down by one rank')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The Discord user to demote')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for this demotion')
        .setRequired(true)),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: (1 << 6) });

    if (!hasRankManagerRole(interaction.member)) {
      return errorReply(interaction, '⛔ You do not have permission to use rank management commands.');
    }

    const targetUser = interaction.options.getUser('user');
    const reason     = interaction.options.getString('reason');

    if (targetUser.id === interaction.user.id) {
      return errorReply(interaction, 'You cannot change your own rank.');
    }

    let roles, targetRecord, executorRank;
    try {
      roles = await fetchGroupRoles();
      [targetRecord, executorRank] = await Promise.all([
        getMemberByDiscordId(targetUser.id),
        getExecutorRank(interaction, roles),
      ]);
    } catch (err) {
      console.error('[Demote] Fetch error:', err.message);
      return errorReply(interaction, 'Failed to fetch data from Roblox. Please try again.');
    }

    if (!targetRecord?.roblox_id) {
      return errorReply(interaction, `<@${targetUser.id}> is not verified or has no linked Roblox account.`);
    }

    let targetMembership;
    try {
      targetMembership = await fetchMembership(targetRecord.roblox_id);
    } catch (err) {
      console.error('[Demote] Membership fetch error:', err.message);
      return errorReply(interaction, 'Failed to fetch the target\'s group membership.');
    }

    if (!targetMembership) {
      return errorReply(interaction, `**@${targetRecord.roblox_name}** is not in the Roblox group.`);
    }

    const { index: currentIndex, role: oldRole } = resolveCurrentRole(roles, targetMembership);

    if (oldRole && oldRole.rank >= executorRank) {
      return errorReply(interaction, `You cannot demote **@${targetRecord.roblox_name}** — their current rank (**${oldRole.rank} — ${oldRole.name}**) is equal to or higher than yours (**${executorRank}**).`);
    }

    if (currentIndex <= 0) {
      return errorReply(interaction, `**@${targetRecord.roblox_name}** is already at the lowest rank or their rank could not be determined.`);
    }

    const newRole = roles[currentIndex - 1];

    try {
      await updateMembership(targetMembership.path, newRole.path);
    } catch (err) {
      console.error('[Demote] Update error:', err.response?.data ?? err.message);
      return errorReply(interaction, 'Failed to update rank on Roblox. Make sure your Open Cloud key has group write access.');
    }

    const container = new ContainerBuilder()
      .addTextDisplayComponents(t => t.setContent('### ⬇️ Demoted'))
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
      .addTextDisplayComponents(t =>
        t.setContent([
          `> **Target:** <@${targetUser.id}> (@${targetRecord.roblox_name})`,
          `> **Previous Rank:** **${oldRole?.rank ?? '?'}** — ${oldRole?.name ?? 'Unknown'}`,
          `> **New Rank:** **${newRole.rank}** — ${newRole.name}`,
          `> **Reason:** ${reason}`,
          `> **By:** <@${interaction.user.id}>`,
        ].join('\n')),
      );

    await logRankChange({
      discordId: targetUser.id,
      robloxName: targetRecord.roblox_name,
      memberId: targetRecord.member_id,
      by: interaction.user.id,
      oldRank: oldRole ? `${oldRole.rank} — ${oldRole.name}` : 'Unknown',
      newRank: `${newRole.rank} — ${newRole.name}`,
      action: 'Demoted',
      reason,
    });

    return interaction.editReply({ components: [container], flags: (1 << 15) });
  },
};