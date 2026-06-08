const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  SeparatorSpacingSize,
} = require('discord.js');

const { ANNOUNCER_ROLE_IDS } = require('../../utils/rolesConfig');
const { getMemberByDiscordId } = require('../../utils/memberStore');

// ── Age group config ──────────────────────────────────────────────────────────
const AGE_GROUPS = {
  '9to12':  { label: '9 to 12',  eligibility: 'under 16'    },
  '13to15': { label: '13 to 15', eligibility: '9 to 17'     },
  '16to17': { label: '16 to 17', eligibility: '13 to 20'    },
  '18to20': { label: '18 to 20', eligibility: '16 and older' },
  '21plus': { label: '21+',      eligibility: '18 and older' },
};

function parseDuration(str) {
  if (!str) return null;
  const clean = str.trim().toLowerCase();
  const match = clean.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  if (!match || (!match[1] && !match[2])) return null;
  const hours = parseInt(match[1] ?? '0', 10);
  const mins  = parseInt(match[2] ?? '0', 10);
  const ms    = (hours * 60 + mins) * 60 * 1000;
  return ms > 0 ? ms : null;
}

function hasAnnouncerRole(member) {
  if (!Array.isArray(ANNOUNCER_ROLE_IDS) || ANNOUNCER_ROLE_IDS.length === 0) return false;
  return member.roles.cache.some(r => ANNOUNCER_ROLE_IDS.includes(r.id));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Announce an upcoming training session')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(opt =>
      opt.setName('age_group')
        .setDescription('Your age group as the host (determines who can communicate in session)')
        .setRequired(true)
        .addChoices(
          { name: '9 to 12',  value: '9to12'  },
          { name: '13 to 15', value: '13to15' },
          { name: '16 to 17', value: '16to17' },
          { name: '18 to 20', value: '18to20' },
          { name: '21+',      value: '21plus' },
        ))
    .addStringOption(opt =>
      opt.setName('closein')
        .setDescription('When does the server close? (e.g. 30m, 1h, 1h30m)')
        .setRequired(true))
    .addRoleOption(opt =>
      opt.setName('ping')
        .setDescription('Role to ping (defaults to @here)')),

  async execute(interaction, client) {
    if (!hasAnnouncerRole(interaction.member)) {
      return interaction.reply({
        content: '⛔ You do not have permission to post announcements.',
        flags: (1 << 6),
      });
    }

    const ageGroupKey = interaction.options.getString('age_group');
    const closeInStr  = interaction.options.getString('closein');
    const pingRole    = interaction.options.getRole('ping');
    const ageGroup    = AGE_GROUPS[ageGroupKey];

    const delayMs = parseDuration(closeInStr);
    if (!delayMs) {
      return interaction.reply({
        content: `⚠️ Couldn't understand \`${closeInStr}\` as a duration. Use formats like \`30m\`, \`1h\`, or \`1h30m\`.`,
        flags: (1 << 6),
      });
    }

    const closeAtUnix = Math.floor((Date.now() + delayMs) / 1000);
    const pingLine    = pingRole ? `<@&${pingRole.id}>` : '@here';

    const record   = await getMemberByDiscordId(interaction.user.id);
    const hostedBy = record?.roblox_name ? `@${record.roblox_name}` : `<@${interaction.user.id}>`;

    const text = [
      `### Training Session Commencement`,
      `${pingLine}`,
      ``,
      `A training session for ages **${ageGroup.eligibility}** will commence shortly.`,
      `> This session is restricted via age groups to ensure seamless communication. If you are not in this verified age range, you will not be permitted to join.`,
      ``,
      `Join now to ensure you secure a spot in the session!`,
      `> The server will close at <t:${closeAtUnix}:t> (<t:${closeAtUnix}:R>)`,
      ``,
      `Good luck to all attending!`,
    ].join('\n');

    const container = new ContainerBuilder()
      .addTextDisplayComponents(t => t.setContent(text))
      .addSeparatorComponents(s =>
        s.setDivider(true).setSpacing(SeparatorSpacingSize.Large),
      )
      .addTextDisplayComponents(t =>
        t.setContent(`Hosted by **${hostedBy}**`),
      );

    await interaction.channel.send({
      components: [container],
      flags: (1 << 15),
    });

    await interaction.reply({
      content: '✅ Announcement posted.',
      flags: (1 << 6),
    });

    console.log(`[Announce] Session announced by ${interaction.user.tag} — age group: ${ageGroup.label}, closes in ${closeInStr}`);
  },
};