/**
 * In-memory store for active attendance-marking sessions.
 * Key: sessionId (matches claim session ID)
 * Value: attendance session object
 *
 * Attendance session schema:
 * {
 *   sessionId: string,          // claim session ID this is based on
 *   hostId: string,
 *   interactionChannelId: string,
 *   attendees: [
 *     {
 *       userId: string,
 *       role: string,           // e.g. "co-host", "trainer-a", "host"
 *       status: string|null,    // "present"|"absent"|"late"|"excused"|null
 *     }
 *   ],
 *   finalized: boolean,
 * }
 */

const attendanceSessions = new Map();

/**
 * Build an attendance session from a claim session.
 * Pulls host + all claimed slots into a flat attendee list.
 */
function buildAttendanceSession(claimSession) {
  const attendees = [];

  // Host is always first
  attendees.push({
    userId: claimSession.hostId,
    role: 'host',
    status: null,
  });

  // All claimed slots
  for (const [key, slot] of Object.entries(claimSession.slots)) {
    if (slot.max === 1) {
      if (slot.claimed) {
        attendees.push({ userId: slot.claimed, role: key, status: null });
      }
    } else {
      for (const userId of slot.claimed) {
        attendees.push({ userId, role: key, status: null });
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

/**
 * Set the status for a specific attendee (by userId) in an attendance session.
 */
function setAttendeeStatus(attSession, userId, status) {
  const attendee = attSession.attendees.find(a => a.userId === userId);
  if (!attendee) return false;
  attendee.status = status;
  return true;
}

/**
 * Check if all attendees have been marked.
 */
function isComplete(attSession) {
  return attSession.attendees.every(a => a.status !== null);
}

module.exports = {
  attendanceSessions,
  buildAttendanceSession,
  setAttendeeStatus,
  isComplete,
};