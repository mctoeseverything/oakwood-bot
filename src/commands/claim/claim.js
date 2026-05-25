const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const {
  sessions,
  generateSessionId,
  parseDuration,
  buildSlots,
  addGroupToSession,
  getUserClaim,
  claimSlot,
  unclaimSlot,
  slotCount,
} = require('../../utils/claimStore');

const {
  buildClaimMessage,
  buildAddGroupNotification,
  buildClaimLog,
  buildSessionLog,
  buildClaimRows,
  getLabel,
} = require('../../utils/claimMessages');

// ─── Required Discord role IDs per claimable position ─────────────────────
function getRequiredRoleId(slotKey) {
  if (slotKey === 'co-host')                            return process.env.COHOST_ROLE_ID;
  if (slotKey.startsWith('trainer-'))                   return process.env.TRAINER_ROLE_ID;
  if (slotKey.startsWith('assistant-'))                 return process.env.ASSISTANT_ROLE_ID;
  if (slotKey === 'spectator')                          return process.env.SPECTATOR_ROLE_ID;
  return null;
}

// ─── Log helper ────────────────────────────────────────────────────────────
async function sendLog(client, payload) {
  const logChannelId = process.env.LOG_CHANNEL_ID;
  if (!logChannelId) return;
  try {
    const ch = await client.channels.fetch(logChannelId);
    if (ch?.isTextBased()) await ch.send(payload);
  } catch (err) {
    console.error('[Claim] Failed to send log:', err);
  }
}

// ─── Edit the original claiming message ───────────────────────────────────
async function refreshClaimMessage(client, session) {
  try {
    const channel = await client.channels.fetch(session.channelId);
    const msg = await channel.messages.fetch(session.messageId);
    const { components, claimRows, flags } = buildClaimMessage(session);
    await msg.edit({ components: [...components, ...claimRows], flags });
  } catch (err) {
    console.error('[Claim] Failed to refresh claim message:', err);
  }
}

// ─── Auto-close a session when its timer fires ─────────────────────────────
async function autoCloseSession(client, session) {
  if (!session.open) return; // already manually closed

  session.open = false;
  session.closeTimer = null;

  await refreshClaimMessage(client, session);
  await sendLog(client, buildSessionLog(session, 'autoclosed'));

  console.log(`[Claim] Session ${session.id} auto-closed by scheduled timer`);
}

// ─── Schedule the auto-close timer ────────────────────────────────────────
function scheduleAutoClose(client, session, delayMs) {
  // Clear any existing timer (safety)
  if (session.closeTimer) clearTimeout(session.closeTimer);

  session.closeAt = Date.now() + delayMs;
  session.closeTimer = setTimeout(() => autoCloseSession(client, session), delayMs);
}

// ──────────────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Manage training session role claiming')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    // ── /claim send ──────────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('send')
        .setDescription('Open a new role claiming session for a training')
        .addRoleOption(opt =>
          opt.setName('ping')
            .setDescription('Role to ping (defaults to @here)'))
        .addStringOption(opt =>
          opt.setName('closein')
            .setDescription('Auto-close claiming after this duration (e.g. 30m, 1h, 1h30m)')))

    // ── /claim close ─────────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('close')
        .setDescription('Close claiming for a session')
        .addStringOption(opt =>
          opt.setName('session_id')
            .setDescription('Session ID to close')
            .setRequired(true)))

    // ── /claim addgroup ──────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('addgroup')
        .setDescription('Add an additional group to an active claiming session')
        .addStringOption(opt =>
          opt.setName('session_id')
            .setDescription('Session ID')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('group')
            .setDescription('Group letter to add (e.g. C)')
            .setRequired(true)
            .addChoices(
              { name: 'C', value: 'C' },
              { name: 'D', value: 'D' },
              { name: 'E', value: 'E' },
            )))

    // ── /claim unclaim ───────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('unclaim')
        .setDescription('Remove a staff member from their claimed role (host only)')
        .addStringOption(opt =>
          opt.setName('session_id')
            .setDescription('Session ID')
            .setRequired(true))
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to unclaim')
            .setRequired(true))),

  // ─────────────────────────────────────────────────────────────
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'send')     return handleSend(interaction, client);
    if (sub === 'close')    return handleClose(interaction, client);
    if (sub === 'addgroup') return handleAddGroup(interaction, client);
    if (sub === 'unclaim')  return handleUnclaim(interaction, client);
  },

  // ─────────────────────────────────────────────────────────────
  // BUTTON HANDLER — claim:take:<sessionId>:<slotKey>
  // ─────────────────────────────────────────────────────────────
  async handleButton(interaction, client) {
    const parts = interaction.customId.split(':');
    const sessionId = parts[2];
    const slotKey   = parts[3];

    const session = sessions.get(sessionId);

    if (!session) {
      return interaction.reply({
        content: '⚠️ This claiming session no longer exists.',
        ephemeral: true,
      });
    }

    if (!session.open) {
      return interaction.reply({
        content: '🔴 Claiming for this session is now closed.',
        ephemeral: true,
      });
    }

    // ── Check required Discord role ──────────────────────────
    const requiredRoleId = getRequiredRoleId(slotKey);
    if (requiredRoleId) {
      const member = interaction.member;
      if (!member.roles.cache.has(requiredRoleId)) {
        return interaction.reply({
          content: `⚠️ You don't have the required role to claim **${getLabel(slotKey)}**.`,
          ephemeral: true,
        });
      }
    }

    // ── Attempt claim ────────────────────────────────────────
    const result = claimSlot(session, slotKey, interaction.user.id);

    if (!result.ok) {
      if (result.reason === 'already_claimed') {
        return interaction.reply({
          content: `⚠️ You've already claimed **${getLabel(result.existing)}** in this session. Ask the host to unclaim you first.`,
          ephemeral: true,
        });
      }
      if (result.reason === 'slot_full') {
        return interaction.reply({
          content: `⚠️ **${getLabel(slotKey)}** is already full.`,
          ephemeral: true,
        });
      }
      return interaction.reply({
        content: '⚠️ Something went wrong claiming that role.',
        ephemeral: true,
      });
    }

    // ── Update the original claiming message ─────────────────
    await refreshClaimMessage(client, session);

    // ── Confirm to user ───────────────────────────────────────
    await interaction.reply({
      content: `✅ You've claimed **${getLabel(slotKey)}** for session \`${sessionId}\`!`,
      ephemeral: true,
    });

    // ── Log ───────────────────────────────────────────────────
    const logPayload = buildClaimLog(session, interaction.user.id, slotKey);
    await sendLog(client, logPayload);
  },
};

// ──────────────────────────────────────────────────────────────────────────
// SUBCOMMAND IMPLEMENTATIONS
// ──────────────────────────────────────────────────────────────────────────

async function handleSend(interaction, client) {
  const pingRole   = interaction.options.getRole('ping');
  const closeInStr = interaction.options.getString('closein');

  // Parse closein duration if provided
  let delayMs = null;
  if (closeInStr) {
    delayMs = parseDuration(closeInStr);
    if (!delayMs) {
      return interaction.reply({
        content: `⚠️ Couldn't understand \`${closeInStr}\` as a duration. Use formats like \`30m\`, \`1h\`, or \`1h30m\`.`,
        ephemeral: true,
      });
    }
  }

  const id = generateSessionId();
  const session = {
    id,
    hostId:      interaction.user.id,
    pingRoleId:  pingRole?.id ?? null,
    channelId:   interaction.channelId,
    messageId:   null,
    open:        true,
    closeAt:     null,
    closeTimer:  null,
    groups:      ['A', 'B'],
    slots:       buildSlots(['A', 'B']),
  };

  sessions.set(id, session);

  // Schedule auto-close before building the message so closeAt is set
  if (delayMs) {
    scheduleAutoClose(client, session, delayMs);
  }

  const { components, claimRows, flags } = buildClaimMessage(session);

  const msg = await interaction.reply({
    components: [...components, ...claimRows],
    flags,
    fetchReply: true,
  });

  session.messageId = msg.id;

  // Log session opened
  await sendLog(client, buildSessionLog(session, 'opened'));

  console.log(`[Claim] Session ${id} opened by ${interaction.user.tag}${delayMs ? ` (auto-closes in ${closeInStr})` : ''}`);
}

async function handleClose(interaction, client) {
  const sessionId = interaction.options.getString('session_id');
  const session   = sessions.get(sessionId);

  if (!session) {
    return interaction.reply({
      content: `⚠️ No session found with ID \`${sessionId}\`.`,
      ephemeral: true,
    });
  }

  if (session.hostId !== interaction.user.id) {
    return interaction.reply({
      content: '⚠️ Only the host of this session can close it.',
      ephemeral: true,
    });
  }

  if (!session.open) {
    return interaction.reply({
      content: `⚠️ Session \`${sessionId}\` is already closed.`,
      ephemeral: true,
    });
  }

  // Cancel any pending auto-close timer
  if (session.closeTimer) {
    clearTimeout(session.closeTimer);
    session.closeTimer = null;
  }

  session.open = false;

  await refreshClaimMessage(client, session);

  await interaction.reply({
    content: `🔒 Claiming closed for session \`${sessionId}\`.`,
    ephemeral: true,
  });

  await sendLog(client, buildSessionLog(session, 'closed'));

  console.log(`[Claim] Session ${sessionId} closed by ${interaction.user.tag}`);
}

async function handleAddGroup(interaction, client) {
  const sessionId   = interaction.options.getString('session_id');
  const groupLetter = interaction.options.getString('group').toUpperCase();
  const session     = sessions.get(sessionId);

  if (!session) {
    return interaction.reply({
      content: `⚠️ No session found with ID \`${sessionId}\`.`,
      ephemeral: true,
    });
  }

  if (session.hostId !== interaction.user.id) {
    return interaction.reply({
      content: '⚠️ Only the host of this session can add groups.',
      ephemeral: true,
    });
  }

  if (!session.open) {
    return interaction.reply({
      content: `⚠️ Session \`${sessionId}\` is closed — you can't add groups to a closed session.`,
      ephemeral: true,
    });
  }

  if (session.groups.includes(groupLetter)) {
    return interaction.reply({
      content: `⚠️ Group ${groupLetter} already exists in session \`${sessionId}\`.`,
      ephemeral: true,
    });
  }

  addGroupToSession(session, groupLetter);

  await refreshClaimMessage(client, session);

  try {
    const channel = await client.channels.fetch(session.channelId);
    const originalMsg = await channel.messages.fetch(session.messageId);
    const notif = buildAddGroupNotification(session, groupLetter);
    await originalMsg.reply({ ...notif });
  } catch (err) {
    console.error('[Claim] Could not reply to original message:', err);
  }

  await interaction.reply({
    content: `✅ Group ${groupLetter} added to session \`${sessionId}\`.`,
    ephemeral: true,
  });

  await sendLog(client, buildSessionLog(session, 'group_added', groupLetter));

  console.log(`[Claim] Group ${groupLetter} added to session ${sessionId}`);
}

async function handleUnclaim(interaction, client) {
  const sessionId  = interaction.options.getString('session_id');
  const targetUser = interaction.options.getUser('user');
  const session    = sessions.get(sessionId);

  if (!session) {
    return interaction.reply({
      content: `⚠️ No session found with ID \`${sessionId}\`.`,
      ephemeral: true,
    });
  }

  if (session.hostId !== interaction.user.id) {
    return interaction.reply({
      content: '⚠️ Only the host of this session can unclaim roles.',
      ephemeral: true,
    });
  }

  const result = unclaimSlot(session, targetUser.id);

  if (!result.ok) {
    return interaction.reply({
      content: `⚠️ <@${targetUser.id}> hasn't claimed any role in session \`${sessionId}\`.`,
      ephemeral: true,
    });
  }

  await refreshClaimMessage(client, session);

  await interaction.reply({
    content: `↩️ <@${targetUser.id}> has been unclaimed from **${getLabel(result.key)}** in session \`${sessionId}\`.`,
    ephemeral: true,
  });

  await sendLog(client, buildSessionLog(session, 'unclaimed', targetUser.id, result.key));

  console.log(`[Claim] ${targetUser.tag} unclaimed from ${result.key} in session ${sessionId}`);
}