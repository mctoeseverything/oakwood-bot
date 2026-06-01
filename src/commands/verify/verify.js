const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getMemberByDiscordId, getMemberById } = require('../../utils/memberStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verification commands')

    // /verify link — sends the user their verification link
    .addSubcommand(sub =>
      sub
        .setName('link')
        .setDescription('Get your verification link to link your Discord account'))

    // /verify whois — look up a verified member
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

    if (sub === 'link') return handleLink(interaction);
    if (sub === 'whois') return handleWhois(interaction);
  },
};

async function handleLink(interaction) {
  const baseUrl = process.env.VERIFY_URL || `http://localhost:${process.env.PORT || 3000}`;
  const url = `${baseUrl}/verify`;

  await interaction.reply({
    content: [
      `### 🔐 Verify Your Account`,
      `Click the link below to verify your Discord account and receive your Member ID.`,
      ``,
      `> **${url}**`,
      ``,
      `*This links your Discord account to the Oakwood Shopping member system.*`,
    ].join('\n'),
    ephemeral: true,
  });
}

async function handleWhois(interaction) {
  const user     = interaction.options.getUser('user');
  const memberId = interaction.options.getString('memberid');

  if (!user && !memberId) {
    return interaction.reply({
      content: '⚠️ Please provide either a user or a Member ID.',
      ephemeral: true,
    });
  }

  let record;
  if (user)     record = getMemberByDiscordId(user.id);
  if (memberId) record = getMemberById(memberId.toUpperCase());

  if (!record) {
    return interaction.reply({
      content: `⚠️ No verified member found.`,
      ephemeral: true,
    });
  }

  await interaction.reply({
    content: [
      `### 🪪 Member Lookup`,
      `> **Member ID:** \`${record.member_id}\``,
      `> **Discord:** <@${record.discord_id}> (${record.discord_name})`,
      `> **Verified:** <t:${Math.floor(new Date(record.joined_at).getTime() / 1000)}:D>`,
    ].join('\n'),
    ephemeral: true,
  });
}