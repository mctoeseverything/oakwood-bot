const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  SeparatorSpacingSize,
} = require('discord.js');
const { getMemberByDiscordId, getMemberById } = require('../../utils/memberStore');
const { getFlagsByMemberId } = require('../../utils/flagStore');
const { ADMIN_ROLE_IDS } = require('../../utils/rolesConfig');

const TYPE_EMOJI = { ban: '🔨', kick: '👢', warn: '⚠️', note: '📝' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('flags')
    .setDescription('View moderation flag history for a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Discord user to look up'))
    .addStringOption(opt =>
      opt.setName('memberid')
        .setDescription('Member ID to look up (e.g. ABC123)')),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: (1 << 6) });

    const hasAdminRole = Array.isArray(ADMIN_ROLE_IDS) && ADMIN_ROLE_IDS.length > 0
      && interaction.member.roles.cache.some(r => ADMIN_ROLE_IDS.includes(r.id));
    if (!hasAdminRole) {
      return interaction.editReply({ content: '⛔ You do not have permission to use this command.' });
    }

    const user     = interaction.options.getUser('user');
    const memberId = interaction.options.getString('memberid');

    if (!user && !memberId) {
      return interaction.editReply({ content: '⚠️ Please provide a user or Member ID.' });
    }

    let record;
    if (user)     record = await getMemberByDiscordId(user.id);
    if (memberId) record = await getMemberById(memberId.toUpperCase());

    if (!record) {
      return interaction.editReply({ content: '⚠️ No member found.' });
    }

    const flags = await getFlagsByMemberId(record.member_id);

    const headerText = [
      `### 🚩 Flag History — \`${record.member_id}\``,
      `> **Discord:** <@${record.discord_id}> (${record.discord_name})`,
      record.roblox_name ? `> **Roblox:** @${record.roblox_name}` : null,
      `> **Total Flags:** ${flags.length}`,
    ].filter(Boolean).join('\n');

    if (flags.length === 0) {
      const container = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(headerText))
        .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
        .addTextDisplayComponents(t => t.setContent('*No flags on record.*'));

      return interaction.editReply({ components: [container], flags: (1 << 15) });
    }

    const flagLines = flags.map(f => {
      const emoji = TYPE_EMOJI[f.type] ?? '🚩';
      const time  = `<t:${Math.floor(new Date(f.created_at).getTime() / 1000)}:D>`;
      const mod   = f.moderator_id ? ` — by <@${f.moderator_id}>` : '';
      return `${emoji} **${f.type.toUpperCase()}** on ${time}${mod}\n> ${f.reason}`;
    }).join('\n\n');

    const container = new ContainerBuilder()
      .addTextDisplayComponents(t => t.setContent(headerText))
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
      .addTextDisplayComponents(t => t.setContent(flagLines));

    return interaction.editReply({ components: [container], flags: (1 << 15) });
  },
};