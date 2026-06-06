const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const axios = require('axios');
const { getMemberByDiscordId, getMemberById, getMemberByRobloxId } = require('../../utils/memberStore');
const { getFlagCount } = require('../../utils/flagStore');
const { ROBLOX_GROUP_ID } = require('../../utils/rolesConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verification commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Post the verification panel in this channel'))

    .addSubcommand(sub =>
      sub
        .setName('whois')
        .setDescription('Look up a verified member by Discord user, Member ID, or Roblox username')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('Discord user to look up'))
        .addStringOption(opt =>
          opt.setName('memberid')
            .setDescription('Member ID to look up (e.g. M-00001)'))
        .addStringOption(opt =>
          opt.setName('roblox_username')
            .setDescription('Roblox username to look up'))),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'panel') return handlePanel(interaction);
    if (sub === 'whois') return handleWhois(interaction);
  },

  async handleButton(interaction, client) {
    const parts  = interaction.customId.split(':');
    const action = parts[1];

    if (action === 'begin') {
      const baseUrl = process.env.VERIFY_URL || `http://localhost:${process.env.PORT || 3000}`;

      const url = `${baseUrl}/verify?token=${interaction.token}&appId=${client.user.id}`;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Open Session')
          .setEmoji('🔗')
          .setStyle(ButtonStyle.Link)
          .setURL(url),
        new ButtonBuilder()
          .setCustomId('verify:noop')
          .setLabel('Never share this link with someone else!')
          .setEmoji('⚠️')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true),
      );

      const container = new ContainerBuilder()
        .addTextDisplayComponents(t =>
          t.setContent(
            `### 🔵 Verification Session Active\nPlease click the button below to open your verification session. This link will expire in 10 minutes.`,
          ),
        )
        .addSeparatorComponents(s =>
          s.setDivider(true).setSpacing(SeparatorSpacingSize.Large),
        )
        .addActionRowComponents(() => row);

      return interaction.reply({
        components: [container],
        flags: (1 << 15) | (1 << 6),
      });
    }
  },
};

// ── Post the panel ────────────────────────────────────────────────────────────
async function handlePanel(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify:begin')
      .setLabel('Begin Verification')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setLabel('Help & Instructions')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Link)
      .setURL('https://discord.com/channels/1427496000137728032/1432571138894205090'),
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(t =>
      t.setContent(
        `### 🌐 Server Verification\nTo verify your identity and gain access to our server, please verify your Discord account and your Roblox account. We do not store sensitive information.`,
      ),
    )
    .addSeparatorComponents(s =>
      s.setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    )
    .addActionRowComponents(() => row);

  await interaction.channel.send({
    components: [container],
    flags: (1 << 15),
  });

  await interaction.reply({
    content: '✅ Verification panel posted.',
    flags: (1 << 6),
  });
}

// ── Whois lookup ──────────────────────────────────────────────────────────────
async function handleWhois(interaction) {
  await interaction.deferReply({ flags: (1 << 6) });

  const user          = interaction.options.getUser('user');
  const memberId      = interaction.options.getString('memberid');
  const robloxUsername = interaction.options.getString('roblox_username');

  if (!user && !memberId && !robloxUsername) {
    return interaction.editReply({ content: '⚠️ Please provide a Discord user, Member ID, or Roblox username.' });
  }

  let record;

  if (user) {
    record = await getMemberByDiscordId(user.id);
  } else if (memberId) {
    record = await getMemberById(memberId.toUpperCase());
  } else if (robloxUsername) {
    // Resolve Roblox username → ID → DB record
    try {
      const res = await axios.post(
        'https://users.roblox.com/v1/usernames/users',
        { usernames: [robloxUsername.trim()], excludeBannedUsers: false },
      );
      const robloxUser = res.data.data?.[0];
      if (!robloxUser) {
        return interaction.editReply({ content: `⚠️ No Roblox user found with the username **${robloxUsername}**.` });
      }
      record = await getMemberByRobloxId(String(robloxUser.id));
      // If not in DB, build a minimal record so we can still show Roblox info
      if (!record) {
        return interaction.editReply({ content: `⚠️ No verified member found linked to Roblox user **@${robloxUser.name}**.` });
      }
    } catch (err) {
      console.error('[Whois] Roblox username lookup error:', err.message);
      return interaction.editReply({ content: '⚠️ Failed to look up that Roblox username. Please try again.' });
    }
  }

  if (!record) {
    return interaction.editReply({ content: '⚠️ No verified member found.' });
  }

  // Fetch Discord member info
  let discordMember = null;
  try {
    discordMember = await interaction.guild.members.fetch(record.discord_id);
  } catch {}

  const discordUser    = discordMember?.user ?? await interaction.client.users.fetch(record.discord_id).catch(() => null);
  const joinedDiscord  = discordUser?.createdAt   ? `<t:${Math.floor(discordUser.createdAt.getTime() / 1000)}:D>` : 'Unknown';
  const joinedServer   = discordMember?.joinedAt   ? `<t:${Math.floor(discordMember.joinedAt.getTime() / 1000)}:D>` : 'Not in server';

  // Fetch Roblox info
  let robloxCreated    = 'Unknown';
  let groupRole        = 'Not in group';
  let robloxProfileUrl = record.roblox_id ? `https://www.roblox.com/users/${record.roblox_id}/profile` : null;

  if (record.roblox_id) {
    try {
      const [userRes, groupRes] = await Promise.all([
        axios.get(`https://users.roblox.com/v1/users/${record.roblox_id}`),
        axios.get(`https://groups.roblox.com/v2/users/${record.roblox_id}/groups/roles`),
      ]);

      if (userRes.data.created) {
        robloxCreated = `<t:${Math.floor(new Date(userRes.data.created).getTime() / 1000)}:D>`;
      }

      const groupEntry = groupRes.data.data?.find(g => String(g.group.id) === String(ROBLOX_GROUP_ID));
      if (groupEntry) {
        groupRole = groupEntry.role.name;
      }
    } catch (err) {
      console.error('[Whois] Roblox fetch error:', err.message);
    }
  }

  const verifiedDate   = `<t:${Math.floor(new Date(record.joined_at).getTime() / 1000)}:D>`;
  const flagCount      = await getFlagCount(record.member_id);
  const verifiedStatus = !record.verified ? 'Unverified' : record.roblox_id ? 'Verified' : 'Partially Verified (Discord only)';

  const lines = [
    record.roblox_name
      ? `• Linked Roblox Account: @${record.roblox_name} (ID: ${record.roblox_id})`
      : `• Linked Roblox Account: Not linked`,
    record.roblox_id ? `• Joined Roblox: ${robloxCreated}` : null,
    record.roblox_id ? `• Current Group Role: ${groupRole}` : null,
    `• Linked Discord Account: <@${record.discord_id}> (ID: ${record.discord_id})`,
    `• Joined Discord: ${joinedDiscord}`,
    `• Joined Server: ${joinedServer}`,
    `• Verification Status: ${verifiedStatus}`,
    flagCount > 0 ? `• ⚠️ Moderation Flags: ${flagCount}` : null,
    `• Verified Date: ${verifiedDate}`,
    `• Assigned Member ID: ${record.member_id}`,
  ].filter(Boolean).join('\n');

  const targetUsername = record.roblox_name ?? record.discord_name;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(t =>
      t.setContent(`### 🔍 About User @${targetUsername}\n`),
    )
    .addSeparatorComponents(s =>
      s.setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    )
    .addTextDisplayComponents(t =>
      t.setContent(lines),
    )
    .addSeparatorComponents(s =>
      s.setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    );

  if (robloxProfileUrl) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Visit Roblox Profile')
        .setEmoji('🔗')
        .setStyle(ButtonStyle.Link)
        .setURL(robloxProfileUrl),
    );
    container.addActionRowComponents(() => row);
  }

  return interaction.editReply({
    components: [container],
    flags: (1 << 15),
  });
}