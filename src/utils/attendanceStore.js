const attendanceSessions = new Map();

function buildAttendanceSession(claimSession) {
  const attendees = [];
  const seenUserIds = new Set();

  attendees.push({
    userId: claimSession.hostId,
    role: 'host',
    status: null,
  });
  seenUserIds.add(claimSession.hostId);

  for (const [key, slot] of Object.entries(claimSession.slots)) {
    if (slot.max === 1) {
      if (slot.claimed && !seenUserIds.has(slot.claimed)) {
        seenUserIds.add(slot.claimed);
        attendees.push({ userId: slot.claimed, role: key, status: null });
      }
    } else {
      for (const userId of slot.claimed) {
        if (!seenUserIds.has(userId)) {
          seenUserIds.add(userId);
          attendees.push({ userId, role: key, status: null });
        }
      }
    }
  }

  return {
    sessionId: claimSession.id,
    hostId: claimSession.hostId,
    attendees,
    finalized: false,
  };
}

function setAttendeeStatus(attSession, userId, status) {
  const attendee = attSession.attendees.find(a => a.userId === userId);
  if (!attendee) return false;
  attendee.status = status;
  return true;
}

function isComplete(attSession) {
  return attSession.attendees.every(a => a.status !== null);
}

module.exports = {
  attendanceSessions,
  buildAttendanceSession,
  setAttendeeStatus,
  isComplete,
};