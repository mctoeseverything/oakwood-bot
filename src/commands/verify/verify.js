const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getMemberByDiscordId, getMemberById } = require('../../utils/memberStore');

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
        .setDescription('Look up a verified member by Discord user or Member ID')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('Discord user to look up'))
        .addStringOption(opt =>
          opt.setName('memberid')
            .setDescription('Member ID to look up (e.g. M-00001)'))),

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

      // Pass the interaction token so server.js can edit this message after OAuth2
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

  await interaction.reply({
    components: [container],
    flags: (1 << 15),
  });
}

// ── Whois lookup ──────────────────────────────────────────────────────────────
async function handleWhois(interaction) {
  const user     = interaction.options.getUser('user');
  const memberId = interaction.options.getString('memberid');

  if (!user && !memberId) {
    return interaction.reply({
      content: '⚠️ Please provide either a user or a Member ID.',
      flags: (1 << 6),
    });
  }

  let record;
  if (user)     record = getMemberByDiscordId(user.id);
  if (memberId) record = getMemberById(memberId.toUpperCase());

  if (!record) {
    return interaction.reply({
      content: `⚠️ No verified member found.`,
      flags: (1 << 6),
    });
  }

  await interaction.reply({
    content: [
      `### 🪪 Member Lookup`,
      `> **Member ID:** \`${record.member_id}\``,
      `> **Discord:** <@${record.discord_id}> (${record.discord_name})`,
      `> **Verified:** <t:${Math.floor(new Date(record.joined_at).getTime() / 1000)}:D>`,
    ].join('\n'),
    flags: (1 << 6),
  });
}