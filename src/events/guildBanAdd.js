const { Events, ContainerBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getMemberByDiscordId } = require('../utils/memberStore');
const { addFlag, getFlagCount } = require('../utils/flagStore');

module.exports = {
  name: Events.GuildBanAdd,
  async execute(ban, client) {
    const { user, guild } = ban;

    // Wait for audit log to populate
    await new Promise(r => setTimeout(r, 2000));

    let reason    = 'No reason provided';
    let moderator = null;

    try {
      const auditLogs = await guild.fetchAuditLogs({ type: 22, limit: 5 });
      const entry = auditLogs.entries.find(e => e.target.id === user.id);
      if (entry) {
        reason    = entry.reason ?? 'No reason provided';
        moderator = entry.executor;
      }
    } catch (err) {
      console.error('[BanAdd] Failed to fetch audit log:', err.message);
    }

    // ── Parse Sapphire reason format: [caseId] date @mod (duration): reason
    let caseId      = null;
    let duration    = null;
    let cleanReason = reason;

    const sapphireMatch = reason.match(/^\[([^\]]+)\]\s[\d\/]+ - [\d:]+ @\S+ \(([^)]+)\):\s(.+)$/);
    if (sapphireMatch) {
      caseId      = sapphireMatch[1];
      duration    = sapphireMatch[2];
      cleanReason = sapphireMatch[3];
    }

    // Build expires timestamp
    let expiresLine = '> Expires: Permanent';
    if (duration && duration.toLowerCase() !== 'permanent') {
      // Parse duration like "3 days", "1 hour", "7 days" into a future timestamp
      const match = duration.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?/i);
      if (match) {
        const amount = parseInt(match[1]);
        const unit   = match[2].toLowerCase();
        const ms = {
          second: 1000, minute: 60000, hour: 3600000,
          day: 86400000, week: 604800000, month: 2592000000, year: 31536000000,
        }[unit] ?? 0;
        if (ms > 0) {
          const unixSec = Math.floor((Date.now() + amount * ms) / 1000);
          expiresLine = `> Expires: <t:${unixSec}:F> (in ${duration})`;
        }
      } else {
        expiresLine = `> Expires: ${duration}`;
      }
    }

    // ── Build the DM components ───────────────────────────────────────────
    const caseBlock = [
      caseId ? `> Case ID: \`${caseId}\`` : null,
      `> Reason: ${cleanReason}`,
      expiresLine,
      moderator ? `> Moderator: ${moderator.username}` : null,
    ].filter(Boolean).join('\n');

    const container = new ContainerBuilder()
      .addTextDisplayComponents(t =>
        t.setContent(
          `### Amber Corporation Notice\nYou have been banned from the Amber Corporation Discord server. Some case details have been listed below.\n\n${caseBlock}\n\nYou were banned due to a severe and/or repeated offense of our regulations.`,
        ),
      )
      .addSeparatorComponents(s =>
        s.setDivider(true).setSpacing(SeparatorSpacingSize.Large),
      )
      .addTextDisplayComponents(t =>
        t.setContent(
          `### Appeals Process\nIf you feel this ban is false or would like to appeal, you are entitled to the opportunity. Our moderators reserve the full right to deny your appeal for any reason they see fit. Troll responses will be voided, and may result in an appeal blacklist.`,
        ),
      )
      .addSeparatorComponents(s =>
        s.setDivider(false).setSpacing(SeparatorSpacingSize.Small),
      )
      .addSeparatorComponents(s =>
        s.setDivider(false).setSpacing(SeparatorSpacingSize.Large),
      )
      .addActionRowComponents(() =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Send an Appeal')
            .setEmoji('🔗')
            .setStyle(ButtonStyle.Link)
            .setURL('https://appeal.gg/7NgHSzXMDq'),
          new ButtonBuilder()
            .setCustomId('ban:official_notice')
            .setLabel('This is an official Amber Corporation notice.')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        ),
      );

    // ── DM the user ───────────────────────────────────────────────────────
    try {
      await user.send({ components: [container], flags: (1 << 15) });
      console.log(`[BanAdd] Sent ban DM to ${user.username}`);
    } catch {
      console.log(`[BanAdd] Could not DM ${user.username} (DMs likely disabled)`);
    }

    // ── Flag the member in our system ─────────────────────────────────────
    try {
      const record = await getMemberByDiscordId(user.id);
      if (record) {
        await addFlag({
          memberId:    record.member_id,
          discordId:   user.id,
          type:        'ban',
          reason:      cleanReason,
          moderatorId: moderator?.id ?? null,
        });
        const totalFlags = await getFlagCount(record.member_id);
        console.log(`[BanAdd] Flagged member ${record.member_id} for ban (total flags: ${totalFlags})`);
      }
    } catch (err) {
      console.error('[BanAdd] Failed to add flag:', err.message);
    }
  },
};