const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  SeparatorSpacingSize,
} = require('discord.js');

const { getRankban } = require('../../utils/rankbanStore');
const axios = require('axios');
const { getMemberByRobloxId } = require('../../utils/memberStore');
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

async function resolveRobloxUser(username) {
  const res = await axios.post(
    'https://users.roblox.com/v1/usernames/users',
    { usernames: [username], excludeBannedUsers: false },
  );
  const user = res.data.data?.[0];
  if (!user) return null;
  return { id: String(user.id), name: user.name };
}

function hasRankManagerRole(member) {
  if (!Array.isArray(RANK_MANAGER_ROLE_IDS) || RANK_MANAGER_ROLE_IDS.length === 0) return false;
  return member.roles.cache.some(r => RANK_MANAGER_ROLE_IDS.includes(r.id));
}

async function getExecutorRank(interaction, roles) {
  // Look up executor's Roblox ID via their DB record
  const { getMemberByDiscordId } = require('../../utils/memberStore');
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
    .setName('promote')
    .setDescription('Promote a Roblox user up by one rank')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(opt =>
      opt.setName('roblox_username')
        .setDescription('The Roblox username to promote')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for this promotion')
        .setRequired(true)),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: (1 << 6) });

    if (!hasRankManagerRole(interaction.member)) {
      return errorReply(interaction, '⛔ You do not have permission to use rank management commands.');
    }

    const username = interaction.options.getString('roblox_username').trim();
    const reason   = interaction.options.getString('reason');

    // Resolve Roblox username → ID
    let robloxUser;
    try {
      robloxUser = await resolveRobloxUser(username);
    } catch (err) {
      console.error('[Promote] Roblox username lookup error:', err.message);
      return errorReply(interaction, 'Failed to look up that Roblox username. Please try again.');
    }

    if (!robloxUser) {
      return errorReply(interaction, `No Roblox user found with the username **${username}**.`);
    }
const rankban = await getRankban(robloxUser.id);
if (rankban) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t =>
      t.setContent(
        '### 🔒 Rank Change Failed\nThe person you are trying to change has a rankban active. Ask a member of Corporate for assistance.',
      ),
    );
  return interaction.editReply({ components: [container], flags: (1 << 15) });
}
    // Fetch roles + executor rank + target membership in parallel
    let roles, executorRank, targetMembership;
    try {
      roles = await fetchGroupRoles();
      [executorRank, targetMembership] = await Promise.all([
        getExecutorRank(interaction, roles),
        fetchMembership(robloxUser.id),
      ]);
    } catch (err) {
      console.error('[Promote] Fetch error:', err.message);
      return errorReply(interaction, 'Failed to fetch data from Roblox. Please try again.');
    }

    if (!targetMembership) {
      return errorReply(interaction, `**@${robloxUser.name}** is not in the Roblox group.`);
    }

    // Block self-promotion (if executor's Roblox account matches target)
    const { getMemberByDiscordId } = require('../../utils/memberStore');
    const executorRecord = await getMemberByDiscordId(interaction.user.id);
    if (executorRecord?.roblox_id === robloxUser.id) {
      return errorReply(interaction, 'You cannot change your own rank.');
    }

    const { index: currentIndex, role: oldRole } = resolveCurrentRole(roles, targetMembership);

    if (oldRole && oldRole.rank >= executorRank) {
      return errorReply(interaction, `You cannot promote **@${robloxUser.name}** — their current rank (**${oldRole.rank} — ${oldRole.name}**) is equal to or higher than yours (**${executorRank}**).`);
    }

    if (currentIndex === -1 || currentIndex >= roles.length - 1) {
      return errorReply(interaction, `**@${robloxUser.name}** is already at the highest rank or their rank could not be determined.`);
    }

    const newRole = roles[currentIndex + 1];

    if (newRole.rank >= executorRank) {
      return errorReply(interaction, `You cannot promote **@${robloxUser.name}** to **${newRole.rank} — ${newRole.name}** — that rank is equal to or higher than yours (**${executorRank}**).`);
    }

    try {
      await updateMembership(targetMembership.path, newRole.path);
    } catch (err) {
      console.error('[Promote] Update error:', err.response?.data ?? err.message);
      return errorReply(interaction, 'Failed to update rank on Roblox. Make sure your Open Cloud key has group write access.');
    }

    // Check if this Roblox user is linked to a DB member and in the server
    const dbRecord = await getMemberByRobloxId(robloxUser.id);
    let discordLine = '> **Discord:** Not assigned';
    let memberId = 'Not assigned';

    if (dbRecord) {
      memberId = dbRecord.member_id;
      try {
        await interaction.guild.members.fetch(dbRecord.discord_id);
        discordLine = `> **Discord:** <@${dbRecord.discord_id}>`;
      } catch {
        discordLine = `> **Discord:** ${dbRecord.discord_name} *(not in server)*`;
      }
    }

    const container = new ContainerBuilder()
      .addTextDisplayComponents(t => t.setContent('### ⬆️ Promoted'))
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
      .addTextDisplayComponents(t =>
        t.setContent([
          `> **Roblox:** @${robloxUser.name}`,
          discordLine,
          `> **Member ID:** ${memberId}`,
          `> **Previous Rank:** **${oldRole?.rank ?? '?'}** — ${oldRole?.name ?? 'Unknown'}`,
          `> **New Rank:** **${newRole.rank}** — ${newRole.name}`,
          `> **Reason:** ${reason}`,
          `> **By:** <@${interaction.user.id}>`,
        ].join('\n')),
      );

    await logRankChange({
      robloxName: robloxUser.name,
      memberId,
      discordId: dbRecord?.discord_id ?? null,
      by: interaction.user.id,
      oldRank: oldRole ? `${oldRole.rank} — ${oldRole.name}` : 'Unknown',
      newRank: `${newRole.rank} — ${newRole.name}`,
      action: 'Promoted',
      reason,
    });

    return interaction.editReply({ components: [container], flags: (1 << 15) });
  },
};