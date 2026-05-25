/**
 * In-memory store for active claiming sessions.
 * Key: sessionId (e.g. "un183av")
 * Value: session object (see schema below)
 *
 * Session schema:
 * {
 *   id: string,
 *   hostId: string,
 *   pingRoleId: string|null,
 *   channelId: string,
 *   messageId: string,          // original /claim send message
 *   open: boolean,
 *   closeAt: number|null,       // Unix timestamp (ms) for auto-close, or null
 *   closeTimer: Timeout|null,   // setTimeout handle for cancellation
 *   groups: ['A', 'B', ...],    // active groups
 *   slots: {
 *     'co-host':      { claimed: string|null, max: 1 },
 *     'trainer-a':    { claimed: string|null, max: 1 },
 *     'assistant-a':  { claimed: string[], max: 2 },
 *     'trainer-b':    { claimed: string|null, max: 1 },
 *     'assistant-b':  { claimed: string[], max: 2 },
 *     'trainer-c':    { claimed: string|null, max: 1 },   // added dynamically
 *     ...
 *     'spectator':    { claimed: string[], max: 4 },
 *   }
 * }
 */

const sessions = new Map();

/**
 * Generate a short random session ID like "un183av"
 */
function generateSessionId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 7; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Parse a duration string like "30m", "1h", "1h30m" into milliseconds.
 * Returns null if the string is invalid or results in 0ms.
 */
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

/**
 * Build the default slots for a set of groups.
 * Always includes co-host + spectator; adds trainer/assistant per group letter.
 */
function buildSlots(groups = ['A', 'B']) {
  const slots = {
    'co-host': { claimed: null, max: 1 },
  };
  for (const g of groups) {
    const gl = g.toLowerCase();
    slots[`trainer-${gl}`]   = { claimed: null, max: 1 };
    slots[`assistant-${gl}`] = { claimed: [], max: 2 };
  }
  slots['spectator'] = { claimed: [], max: 4 };
  return slots;
}

/**
 * Add a new group to an existing session's slots (e.g. group C).
 * Preserves existing slot data, inserts new trainer/assistant before spectator.
 */
function addGroupToSession(session, groupLetter) {
  const gl = groupLetter.toLowerCase();
  const newSlots = {};

  // Re-insert everything except spectator
  for (const [key, val] of Object.entries(session.slots)) {
    if (key === 'spectator') continue;
    newSlots[key] = val;
  }

  // Add new group
  newSlots[`trainer-${gl}`]   = { claimed: null, max: 1 };
  newSlots[`assistant-${gl}`] = { claimed: [], max: 2 };

  // Re-add spectator at end
  newSlots['spectator'] = session.slots['spectator'];

  session.slots = newSlots;
  session.groups.push(groupLetter.toUpperCase());
}

/**
 * Check if a user has already claimed any role in this session.
 */
function getUserClaim(session, userId) {
  for (const [key, slot] of Object.entries(session.slots)) {
    if (slot.max === 1 && slot.claimed === userId) return key;
    if (Array.isArray(slot.claimed) && slot.claimed.includes(userId)) return key;
  }
  return null;
}

/**
 * Claim a slot for a user. Returns { ok, reason }.
 */
function claimSlot(session, slotKey, userId) {
  const slot = session.slots[slotKey];
  if (!slot) return { ok: false, reason: 'unknown_slot' };

  // Already claimed by this user
  const existing = getUserClaim(session, userId);
  if (existing) return { ok: false, reason: 'already_claimed', existing };

  // Slot full
  const isFull = slot.max === 1
    ? slot.claimed !== null
    : slot.claimed.length >= slot.max;
  if (isFull) return { ok: false, reason: 'slot_full' };

  // Claim it
  if (slot.max === 1) {
    slot.claimed = userId;
  } else {
    slot.claimed.push(userId);
  }

  return { ok: true };
}

/**
 * Unclaim a specific slot for a user (host-only action).
 * Returns { ok, reason }.
 */
function unclaimSlot(session, userId) {
  for (const [key, slot] of Object.entries(session.slots)) {
    if (slot.max === 1 && slot.claimed === userId) {
      slot.claimed = null;
      return { ok: true, key };
    }
    if (Array.isArray(slot.claimed) && slot.claimed.includes(userId)) {
      slot.claimed = slot.claimed.filter(id => id !== userId);
      return { ok: true, key };
    }
  }
  return { ok: false, reason: 'not_found' };
}

/**
 * Get current fill count for a slot.
 */
function slotCount(slot) {
  if (slot.max === 1) return slot.claimed ? 1 : 0;
  return slot.claimed.length;
}

module.exports = {
  sessions,
  generateSessionId,
  parseDuration,
  buildSlots,
  addGroupToSession,
  getUserClaim,
  claimSlot,
  unclaimSlot,
  slotCount,
};