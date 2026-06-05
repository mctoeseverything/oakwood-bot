const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} = require('discord.js');

const axios = require('axios');
const { getMemberByDiscordId } = require('../../utils/memberStore');
const { ROBLOX_GROUP_ID, RANK_MANAGER_ROLE_IDS } = require('../../utils/rolesConfig');
const { logRankChange } = require('../../utils/logger');

// ─── Open Cloud helpers ──────────────────────────────────────────────────────

const OC_BASE = 'https://apis.roblox.com/cloud/v2';

function ocHeaders() {
  return { 'x-api-key': process.env.ROBLOX_OPEN_CLOUD_KEY };
}

/**
 * Fetch all group roles sorted ascending by rank number.
 * Returns [{ rank, name, id, path, ... }]
 */
async function fetchGroupRoles() {
  const res = await axios.get(
    `${OC_BASE}/groups/${ROBLOX_GROUP_ID}/roles`,
    { headers: ocHeaders() },
  );
  const roles = res.data.roles ?? [];
  return roles
    .filter(r => r.rank !== 0) // exclude Guest (rank 0)
    .sort((a, b) => a.rank - b.rank);
}

/**
 * Fetch a user's current membership in the group.
 * Returns the membership resource or null if not in group.
 */
async function fetchMembership(robloxUserId) {
  try {
    const res = await axios.get(
      `${OC_BASE}/groups/${ROBLOX_GROUP_ID}/memberships`,
      {
        headers: ocHeaders(),
        params: { filter: `user == 'users/${robloxUserId}'` },
      },
    );
    const memberships = res.data.groupMemberships ?? [];
    return memberships[0] ?? null;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

/**
 * Update a user's rank in the group.
 */
async function updateMembership(membershipPath, rolePath) {
  await axios.patch(
    `${OC_BASE}/${membershipPath}`,
    { role: rolePath },
    { headers: { ...ocHeaders(), 'Content-Type': 'application/json' } },
  );
}

// ─── Permission helpers ──────────────────────────────────────────────────────

function hasRankManagerRole(member) {
  if (!Array.isArray(RANK_MANAGER_ROLE_IDS) || RANK_MANAGER_ROLE_IDS.length === 0) return false;
  return member.roles.cache.some(r => RANK_MANAGER_ROLE_IDS.includes(r.id));
}

/**
 * Returns the executor's current Roblox group rank number.
 * Returns 0 if not verified or not in the group.
 */
async function getExecutorRank(interaction) {
  const record = await getMemberByDiscordId(interaction.user.id);
  if (!record?.roblox_id) return 0;
  const membership = await fetchMembership(record.roblox_id);
  if (!membership) return 0;
  const roles = await fetchGroupRoles();
  const roleId = membership.role.split('/').pop();
  const matched = roles.find(r => String(r.id) === roleId);
  return matched?.rank ?? 0;
}

/**
 * Given a membership's role path, find the matching role object and its index
 * in the sorted roles array.
 */
function resolveCurrentRole(roles, membership) {
  const roleId = membership.role.split('/').pop();
  const index = roles.findIndex(r => String(r.id) === roleId);
  return { index, role: index !== -1 ? roles[index] : null };
}

// ─── Shared rank-change logic ────────────────────────────────────────────────

async function applyRankChange({ interaction, targetRecord, targetUser, newRole, oldRole, membership, actionLabel }) {
  await updateMembership(membership.path, newRole.path);

  const oldRankLine = oldRole ? `**${oldRole.rank}** — ${oldRole.name}` : 'Unknown';
  const newRankLine = `**${newRole.rank}** — ${newRole.name}`;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(t =>
      t.setContent(`### ✅ ${actionLabel}`),
    )
    .addSeparatorComponents(s =>
      s.setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    )
    .addTextDisplayComponents(t =>
      t.setContent([
        `> **Target:** <@${targetUser.id}> (@${targetRecord.roblox_name})`,
        `> **Previous Rank:** ${oldRankLine}`,
        `> **New Rank:** ${newRankLine}`,
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
    action: actionLabel,
  });

  return interaction.editReply({
    components: [container],
    flags: (1 << 15),
  });
}

// ─── Error reply helper ──────────────────────────────────────────────────────

async function errorReply(interaction, message) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`### ⚠️ Action Blocked\n${message}`));
  return interaction.editReply({ components: [container], flags: (1 << 15) });
}

// ─── Command definition ──────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Manage Roblox group ranks for verified members')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    .addSubcommand(sub =>
      sub
        .setName('promote')
        .setDescription('Promote a verified member up by one rank')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The Discord user to promote')
            .setRequired(true)))

    .addSubcommand(sub =>
      sub
        .setName('demote')
        .setDescription('Demote a verified member down by one rank')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The Discord user to demote')
            .setRequired(true)))

    .addSubcommand(sub =>
      sub
        .setName('change')
        .setDescription('Set a verified member to a specific rank')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The Discord user to rank')
            .setRequired(true))),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: (1 << 6) });

    if (!hasRankManagerRole(interaction.member)) {
      return errorReply(interaction, '⛔ You do not have permission to use rank management commands.');
    }

    const sub = interaction.options.getSubcommand();
    if (sub === 'promote') return handlePromote(interaction, client);
    if (sub === 'demote')  return handleDemote(interaction, client);
    if (sub === 'change')  return handleChange(interaction, client);
  },

  async handleSelect(interaction, client) {
    const parts    = interaction.customId.split(':');
    const action   = parts[1];
    const targetId = parts[2];

    if (action !== 'pick_rank') return;

    await interaction.deferUpdate();

    if (!hasRankManagerRole(interaction.member)) {
      return errorReply(interaction, '⛔ You do not have permission to use rank management commands.');
    }

    const selectedRank = parseInt(interaction.values[0], 10);

    let roles, targetRecord, executorRank;
    try {
      [roles, targetRecord, executorRank] = await Promise.all([
        fetchGroupRoles(),
        getMemberByDiscordId(targetId),
        getExecutorRank(interaction),
      ]);
    } catch (err) {
      console.error('[Rank] Fetch error:', err.message);
      return errorReply(interaction, 'Failed to fetch data from Roblox. Please try again.');
    }

    if (!targetRecord?.roblox_id) {
      return errorReply(interaction, 'Target user is not verified or has no linked Roblox account.');
    }

    if (targetRecord.discord_id === interaction.user.id) {
      return errorReply(interaction, 'You cannot change your own rank.');
    }

    const newRole = roles.find(r => r.rank === selectedRank);
    if (!newRole) {
      return errorReply(interaction, 'Selected rank no longer exists. Please try again.');
    }

    if (selectedRank >= executorRank) {
      return errorReply(interaction, `You cannot set someone to a rank equal to or higher than your own (**${executorRank}**).`);
    }

    let targetMembership;
    try {
      targetMembership = await fetchMembership(targetRecord.roblox_id);
    } catch (err) {
      console.error('[Rank] Membership fetch error:', err.message);
      return errorReply(interaction, 'Failed to fetch the target\'s group membership.');
    }

    if (!targetMembership) {
      return errorReply(interaction, 'The target user is not in the Roblox group.');
    }

    const { role: oldRole } = resolveCurrentRole(roles, targetMembership);

    if (oldRole && oldRole.rank >= executorRank) {
      return errorReply(interaction, `You cannot change the rank of someone whose rank (**${oldRole.rank} — ${oldRole.name}**) is equal to or higher than yours (**${executorRank}**).`);
    }

    const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);

    try {
      await applyRankChange({
        interaction,
        targetRecord,
        targetUser,
        newRole,
        oldRole,
        membership: targetMembership,
        actionLabel: 'Rank Changed',
        client,
      });
    } catch (err) {
      console.error('[Rank] applyRankChange error:', err.response?.data ?? err.message);
      return errorReply(interaction, 'Failed to update rank on Roblox. Make sure your Open Cloud key has group write access.');
    }
  },
};

// ─── Subcommand implementations ──────────────────────────────────────────────

async function handlePromote(interaction, client) {
  return _handleShift({ interaction, client, targetUser: interaction.options.getUser('user'), direction: 'promote' });
}

async function handleDemote(interaction, client) {
  return _handleShift({ interaction, client, targetUser: interaction.options.getUser('user'), direction: 'demote' });
}

async function _handleShift({ interaction, client, targetUser, direction }) {
  if (targetUser.id === interaction.user.id) {
    return errorReply(interaction, 'You cannot change your own rank.');
  }

  let roles, targetRecord, executorRank;
  try {
    [roles, targetRecord, executorRank] = await Promise.all([
      fetchGroupRoles(),
      getMemberByDiscordId(targetUser.id),
      getExecutorRank(interaction),
    ]);
  } catch (err) {
    console.error('[Rank] Fetch error:', err.message);
    return errorReply(interaction, 'Failed to fetch data from Roblox. Please try again.');
  }

  if (!targetRecord?.roblox_id) {
    return errorReply(interaction, `<@${targetUser.id}> is not verified or has no linked Roblox account.`);
  }

  let targetMembership;
  try {
    targetMembership = await fetchMembership(targetRecord.roblox_id);
  } catch (err) {
    console.error('[Rank] Membership fetch error:', err.message);
    return errorReply(interaction, 'Failed to fetch the target\'s group membership.');
  }

  if (!targetMembership) {
    return errorReply(interaction, `**@${targetRecord.roblox_name}** is not in the Roblox group.`);
  }

  const { index: currentIndex, role: oldRole } = resolveCurrentRole(roles, targetMembership);

  const { index: currentIndex, role: oldRole } = resolveCurrentRole(roles, targetMembership);
  
console.log('[Rank Debug] membership.role:', targetMembership.role);
console.log('[Rank Debug] extracted roleId:', targetMembership.role.split('/').pop());
console.log('[Rank Debug] roles list:', roles.map(r => ({ id: r.id, rank: r.rank, name: r.name })));

  if (oldRole && oldRole.rank >= executorRank) {
    return errorReply(
      interaction,
      `You cannot ${direction} **@${targetRecord.roblox_name}** — their current rank (**${oldRole.rank} — ${oldRole.name}**) is equal to or higher than yours (**${executorRank}**).`,
    );
  }

  let newRole;
  if (direction === 'promote') {
    if (currentIndex === -1 || currentIndex >= roles.length - 1) {
      return errorReply(interaction, `**@${targetRecord.roblox_name}** is already at the highest rank or their rank could not be determined.`);
    }
    newRole = roles[currentIndex + 1];
    if (newRole.rank >= executorRank) {
      return errorReply(
        interaction,
        `You cannot promote **@${targetRecord.roblox_name}** to **${newRole.rank} — ${newRole.name}** — that rank is equal to or higher than yours (**${executorRank}**).`,
      );
    }
  } else {
    if (currentIndex <= 0) {
      return errorReply(interaction, `**@${targetRecord.roblox_name}** is already at the lowest rank or their rank could not be determined.`);
    }
    newRole = roles[currentIndex - 1];
  }

  try {
    await applyRankChange({
      interaction,
      targetRecord,
      targetUser,
      newRole,
      oldRole,
      membership: targetMembership,
      actionLabel: direction === 'promote' ? 'Promoted' : 'Demoted',
      client,
    });
  } catch (err) {
    console.error('[Rank] applyRankChange error:', err.response?.data ?? err.message);
    return errorReply(interaction, 'Failed to update rank on Roblox. Make sure your Open Cloud key has group write access.');
  }
}

async function handleChange(interaction, client) {
  const targetUser = interaction.options.getUser('user');

  if (targetUser.id === interaction.user.id) {
    return errorReply(interaction, 'You cannot change your own rank.');
  }

  const targetRecord = await getMemberByDiscordId(targetUser.id);
  if (!targetRecord?.roblox_id) {
    return errorReply(interaction, `<@${targetUser.id}> is not verified or has no linked Roblox account.`);
  }

  let roles;
  try {
    roles = await fetchGroupRoles();
  } catch (err) {
    console.error('[Rank] Fetch roles error:', err.message);
    return errorReply(interaction, 'Failed to fetch group roles from Roblox. Please try again.');
  }

  if (roles.length === 0) {
    return errorReply(interaction, 'No group roles found. Check your Open Cloud key and group ID.');
  }

  // Discord select menus support max 25 options
  const options = roles.slice(0, 25).map(r =>
    new StringSelectMenuOptionBuilder()
      .setLabel(r.name)
      .setDescription(`Rank ${r.rank}`)
      .setValue(String(r.rank)),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`rank:pick_rank:${targetUser.id}`)
    .setPlaceholder('Select a rank...')
    .addOptions(options);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(t =>
      t.setContent(
        `### 🔢 Select New Rank\nChoose a rank to assign to <@${targetUser.id}> (@${targetRecord.roblox_name}).\n*Permission checks will be enforced on selection.*`,
      ),
    )
    .addSeparatorComponents(s =>
      s.setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    );

  return interaction.editReply({
    components: [container, new ActionRowBuilder().addComponents(select)],
    flags: (1 << 15),
  });
}