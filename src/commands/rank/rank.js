const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
 * Returns [{ rank, name, id, memberCount }]
 */
async function fetchGroupRoles() {
  const res = await axios.get(
    `${OC_BASE}/groups/${ROBLOX_GROUP_ID}/roles`,
    { headers: ocHeaders() },
  );
  // Open Cloud returns { roles: [...] }
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
    // List memberships and filter — Open Cloud v2 uses GET /groups/{id}/memberships?filter=...
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
 * @param {string} membershipPath  e.g. "groups/12183130/memberships/..."
 * @param {string} rolePath        e.g. "groups/12183130/roles/..."
 */
async function updateMembership(membershipPath, rolePath) {
  await axios.patch(
    `${OC_BASE}/${membershipPath}`,
    { role: rolePath },
    {
      headers: { ...ocHeaders(), 'Content-Type': 'application/json' },
    },
  );
}

// ─── Permission helpers ──────────────────────────────────────────────────────

function hasRankManagerRole(member) {
  if (!Array.isArray(RANK_MANAGER_ROLE_IDS) || RANK_MANAGER_ROLE_IDS.length === 0) return false;
  return member.roles.cache.some(r => RANK_MANAGER_ROLE_IDS.includes(r.id));
}

/**
 * Returns the executor's current rank number (0 if not in group / not verified).
 */
async function getExecutorRank(interaction) {
  const record = await getMemberByDiscordId(interaction.user.id);
  if (!record?.roblox_id) return 0;
  const membership = await fetchMembership(record.roblox_id);
  if (!membership) return 0;
  // membership.role looks like "groups/xxx/roles/yyy" — we need the rank number
  // We fetch group roles and match by path
  const roles = await fetchGroupRoles();
  const rolePath = membership.role; // e.g. "groups/12183130/roles/12345678"
  const matched = roles.find(r => r.path === rolePath || String(r.id) === rolePath.split('/').pop());
  return matched?.rank ?? 0;
}

// ─── Shared rank-change logic ────────────────────────────────────────────────

/**
 * Core function: performs a rank change after all permission checks pass.
 * @param {object} opts
 * @param {import('discord.js').CommandInteraction} opts.interaction
 * @param {object} opts.targetRecord     memberStore record for the target user
 * @param {object} opts.targetUser       Discord User object
 * @param {object} opts.newRole          role object from fetchGroupRoles()
 * @param {object} opts.oldRole          role object from fetchGroupRoles() or null
 * @param {object} opts.membership       Open Cloud membership resource
 * @param {string} opts.actionLabel      e.g. "Promoted", "Demoted", "Rank Changed"
 * @param {import('discord.js').Client} opts.client
 */
async function applyRankChange({ interaction, targetRecord, targetUser, newRole, oldRole, membership, actionLabel, client }) {
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

// ─── Error reply helper ───────────────────────────────────────────────────────

async function errorReply(interaction, message) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`### ⚠️ Action Blocked\n${message}`));
  return interaction.editReply({ components: [container], flags: (1 << 15) });
}

// ─── /changerank pending store (for button confirmation) ────────────────────

// Map<interactionId, { targetUserId, newRoleRank, expiresAt }>
const pendingRankChanges = new Map();

// ─── Command definition ──────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Manage Roblox group ranks for verified members')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    // ── /rank promote ──────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('promote')
        .setDescription('Promote a verified member up by one rank')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The Discord user to promote')
            .setRequired(true)))

    // ── /rank demote ───────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('demote')
        .setDescription('Demote a verified member down by one rank')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The Discord user to demote')
            .setRequired(true)))

    // ── /rank change ───────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('change')
        .setDescription('Set a verified member to a specific rank')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The Discord user to rank')
            .setRequired(true))),

  // ─────────────────────────────────────────────────────────────
  async execute(interaction, client) {
    await interaction.deferReply({ flags: (1 << 6) });

    // ── Permission check ─────────────────────────────────────
    if (!hasRankManagerRole(interaction.member)) {
      return errorReply(interaction, '⛔ You do not have permission to use rank management commands.');
    }

    const sub = interaction.options.getSubcommand();
    if (sub === 'promote') return handlePromote(interaction, client);
    if (sub === 'demote')  return handleDemote(interaction, client);
    if (sub === 'change')  return handleChange(interaction, client);
  },

  // ─────────────────────────────────────────────────────────────
  async handleSelect(interaction, client) {
    const parts     = interaction.customId.split(':');
    const action    = parts[1]; // 'pick_rank'
    const targetId  = parts[2];

    if (action !== 'pick_rank') return;

    await interaction.deferUpdate();

    // Permission re-check
    if (!hasRankManagerRole(interaction.member)) {
      const container = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent('### ⚠️ Action Blocked\n⛔ You do not have permission to use rank management commands.'));
      return interaction.editReply({ components: [container], flags: (1 << 15) });
    }

    const selectedRank = parseInt(interaction.values[0], 10);

    let roles, targetRecord, targetMembership, executorRank;
    try {
      [roles, targetRecord, executorRank] = await Promise.all([
        fetchGroupRoles(),
        getMemberByDiscordId(targetId),
        getExecutorRank(interaction),
      ]);
    } catch (err) {
      console.error('[Rank] Fetch error:', err.message);
      const container = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent('### ❌ Error\nFailed to fetch data from Roblox. Please try again.'));
      return interaction.editReply({ components: [container], flags: (1 << 15) });
    }

    if (!targetRecord?.roblox_id) {
      const container = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent('### ⚠️ Action Blocked\nTarget user is not verified or has no linked Roblox account.'));
      return interaction.editReply({ components: [container], flags: (1 << 15) });
    }

    // Self-rank check
    if (targetRecord.discord_id === interaction.user.id) {
      const container = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent('### ⚠️ Action Blocked\nYou cannot change your own rank.'));
      return interaction.editReply({ components: [container], flags: (1 << 15) });
    }

    const newRole = roles.find(r => r.rank === selectedRank);
    if (!newRole) {
      const container = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent('### ⚠️ Action Blocked\nSelected rank no longer exists. Please try again.'));
      return interaction.editReply({ components: [container], flags: (1 << 15) });
    }

    // Cannot set to a rank >= executor's rank
    if (selectedRank >= executorRank) {
      const container = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(`### ⚠️ Action Blocked\nYou cannot set someone to a rank equal to or higher than your own (**${executorRank}**).`));
      return interaction.editReply({ components: [container], flags: (1 << 15) });
    }

    try {
      targetMembership = await fetchMembership(targetRecord.roblox_id);
    } catch (err) {
      console.error('[Rank] Membership fetch error:', err.message);
      const container = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent('### ❌ Error\nFailed to fetch target\'s group membership.'));
      return interaction.editReply({ components: [container], flags: (1 << 15) });
    }

    if (!targetMembership) {
      const container = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent('### ⚠️ Action Blocked\nThe target user is not in the Roblox group.'));
      return interaction.editReply({ components: [container], flags: (1 << 15) });
    }

    const currentRolePath = targetMembership.role;
    const oldRole = roles.find(r => r.path === currentRolePath || String(r.id) === currentRolePath.split('/').pop());

    // Cannot change rank of someone with rank >= executor's rank
    if (oldRole && oldRole.rank >= executorRank) {
      const container = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(`### ⚠️ Action Blocked\nYou cannot change the rank of someone whose rank (**${oldRole.rank} — ${oldRole.name}**) is equal to or higher than yours (**${executorRank}**).`));
      return interaction.editReply({ components: [container], flags: (1 << 15) });
    }

    const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);

    try {
      await applyRankChange({
        interaction,
        targetRecord,
        targetUser,
        newRole,
        oldRole: oldRole ?? null,
        membership: targetMembership,
        actionLabel: 'Rank Changed',
        client,
      });
    } catch (err) {
      console.error('[Rank] applyRankChange error:', err.response?.data ?? err.message);
      const container = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent('### ❌ Error\nFailed to update rank on Roblox. Make sure your Open Cloud key has group write access.'));
      return interaction.editReply({ components: [container], flags: (1 << 15) });
    }
  },
};

// ──────────────────────────────────────────────────────────────────────────
// SUBCOMMAND IMPLEMENTATIONS
// ──────────────────────────────────────────────────────────────────────────

async function handlePromote(interaction, client) {
  const targetUser = interaction.options.getUser('user');
  await _handleShift({ interaction, client, targetUser, direction: 'promote' });
}

async function handleDemote(interaction, client) {
  const targetUser = interaction.options.getUser('user');
  await _handleShift({ interaction, client, targetUser, direction: 'demote' });
}

/**
 * Shared logic for promote and demote (both shift by 1 rank).
 */
async function _handleShift({ interaction, client, targetUser, direction }) {
  // Self-rank check
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

  const currentRolePath = targetMembership.role;
  const currentRoleIndex = roles.findIndex(r => r.path === currentRolePath || String(r.id) === currentRolePath.split('/').pop());
  const oldRole = currentRoleIndex !== -1 ? roles[currentRoleIndex] : null;

  // Cannot affect someone at or above executor's rank
  if (oldRole && oldRole.rank >= executorRank) {
    return errorReply(
      interaction,
      `You cannot ${direction} **@${targetRecord.roblox_name}** — their current rank (**${oldRole.rank} — ${oldRole.name}**) is equal to or higher than yours (**${executorRank}**).`,
    );
  }

  // Find adjacent rank
  let newRole;
  if (direction === 'promote') {
    if (currentRoleIndex === -1 || currentRoleIndex >= roles.length - 1) {
      return errorReply(interaction, `**@${targetRecord.roblox_name}** is already at the highest rank or their rank could not be determined.`);
    }
    newRole = roles[currentRoleIndex + 1];

    // Cannot promote to a rank >= executor's rank
    if (newRole.rank >= executorRank) {
      return errorReply(
        interaction,
        `You cannot promote **@${targetRecord.roblox_name}** to **${newRole.rank} — ${newRole.name}** — that rank is equal to or higher than yours (**${executorRank}**).`,
      );
    }
  } else {
    // demote
    if (currentRoleIndex <= 0) {
      return errorReply(interaction, `**@${targetRecord.roblox_name}** is already at the lowest rank or their rank could not be determined.`);
    }
    newRole = roles[currentRoleIndex - 1];
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

  // Self-rank check
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

  // Discord select menus support max 25 options — truncate if needed
  const options = roles.slice(0, 25).map(r =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`${r.name}`)
      .setDescription(`Rank ${r.rank}`)
      .setValue(String(r.rank)),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`rank:pick_rank:${targetUser.id}`)
    .setPlaceholder('Select a rank...')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

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
    components: [container, row],
    flags: (1 << 15),
  });
}