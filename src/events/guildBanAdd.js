const { Events, AuditLogEvent } = require('discord.js');
const { getMemberByDiscordId } = require('../utils/memberStore');
const { addFlag, getFlagCount } = require('../utils/flagStore');

module.exports = {
  name: Events.GuildAuditLogEntryCreate,
  async execute(auditEntry, guild) {
    if (auditEntry.action !== AuditLogEvent.MemberBanAdd) return;

    const user      = auditEntry.target;
    const moderator = auditEntry.executor;
    const reason    = auditEntry.reason ?? 'No reason provided';

    // Parse Sapphire reason format: [caseId] date @mod (duration): reason
    let cleanReason = reason;
    const sapphireMatch = reason.match(/^\[([^\]]+)\]\s[\d\/]+ - [\d:]+ @\S+ \(([^)]+)\):\s(.+)$/);
    if (sapphireMatch) cleanReason = sapphireMatch[3];

    // Flag the member in our system
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