function buildAttendanceMarkingMessage(attSession) {
  const allDone = attSession.attendees.every(a => a.status !== null);

  const components = [];

  // Status text as a single TextDisplayBuilder
  const headerText = [
    `### 📋 Attendance — Session \`${attSession.sessionId}\``,
    `Mark each person's status. Hit **Finalize** when all are marked.`,
    ``,
    ...attSession.attendees.map(a => {
      const statusBadge = a.status
        ? `${STATUS_META[a.status].emoji} ${STATUS_META[a.status].label}`
        : '⬜ Unmarked';
      return `> <@${a.userId}> — **${getRoleLabel(a.role)}** · ${statusBadge}`;
    }),
  ].join('\n');

  components.push(new TextDisplayBuilder().setContent(headerText));

  // One select menu per attendee, max 4 (row 5 reserved for finalize)
  for (const a of attSession.attendees) {
    if (components.length >= 5) break;

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`attendance:mark:${attSession.sessionId}:${a.userId}`)
      .setPlaceholder(`${getRoleLabel(a.role)} — ${a.status ? STATUS_META[a.status].label : 'Select status...'}`)
      .setDisabled(attSession.finalized)
      .addOptions(
        Object.entries(STATUS_META).map(([statusKey, meta]) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(meta.label)
            .setValue(statusKey)
            .setEmoji(meta.emoji)
            .setDefault(a.status === statusKey),
        ),
      );

    components.push(new ActionRowBuilder().addComponents(menu));
  }

  // Finalize button
  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`attendance:finalize:${attSession.sessionId}`)
        .setLabel('Finalize Attendance')
        .setEmoji('📨')
        .setStyle(ButtonStyle.Success)
        .setDisabled(attSession.finalized || !allDone),
    ),
  );

  return {
    components,
    flags: (1 << 15) | (1 << 6),
  };
}