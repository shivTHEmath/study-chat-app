// lib/tutor/engagementClock.js
//
// Engagement-clock logic per §7 of BUILD_DECISIONS_HANDOFF.md.
//
// All functions here are pure (no DB access). The caller (api/chat/route.js and
// the chat UI) is responsible for persisting the returned updates and driving
// the check-in polling.
//
// DB columns this module reads/writes (all on the `participants` table):
//   cumulative_engaged_seconds  — total engaged time; never resets.
//   last_activity_at            — timestamp of the last real student message.
//   clock_paused_at             — non-null when the clock is paused (no response to check-in).
//   pending_checkin_type        — 'mid_problem' | 'between_problems' | null.

export const IDLE_CHECKIN_THRESHOLD_SECONDS = 5 * 60 // 5 minutes

// ---------------------------------------------------------------------------
// Server-side: called at the start of every /api/chat handler.
// ---------------------------------------------------------------------------

/**
 * Computes how many seconds to add to cumulative_engaged_seconds and what
 * DB fields to update, given the incoming student message.
 *
 * @param {object} participant   - Current row from `participants`.
 * @param {string} message       - The raw student message text.
 * @param {Date}   [now]         - Injection point for the current time (defaults to Date.now()).
 * @returns {{ deltaSeconds: number, updates: object }}
 *   deltaSeconds — seconds to add to cumulative_engaged_seconds.
 *   updates      — partial `participants` row to write back.
 */
export function resolveEngagementTick(participant, message, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now)
  const lastActivityMs = participant.last_activity_at
    ? new Date(participant.last_activity_at).getTime()
    : nowMs
  const gapSeconds = Math.max(0, Math.floor((nowMs - lastActivityMs) / 1000))

  // Base updates always written regardless of branch.
  const baseUpdates = {
    last_activity_at: new Date(nowMs).toISOString(),
    pending_checkin_type: null,
    clock_paused_at: null,
  }

  // ── Branch 1: clock was paused (student was idle; no check-in response) ──
  // A new real message restarts the clock from now; the idle gap is not counted.
  if (participant.clock_paused_at) {
    return { deltaSeconds: 0, updates: baseUpdates }
  }

  // ── Branch 2: a check-in is in flight ──
  if (participant.pending_checkin_type) {
    if (isAffirmative(message)) {
      // Student confirmed they're still working — count the gap (capped at threshold
      // so we don't accidentally award time for a very long silent period).
      const delta = Math.min(gapSeconds, IDLE_CHECKIN_THRESHOLD_SECONDS * 2)
      return { deltaSeconds: delta, updates: baseUpdates }
    }

    if (
      participant.pending_checkin_type === 'between_problems' &&
      isNegative(message)
    ) {
      // Student said they're not working — pause the clock, don't count the gap.
      return {
        deltaSeconds: 0,
        updates: { ...baseUpdates, clock_paused_at: new Date(nowMs).toISOString() },
      }
    }

    // Any other response during a mid-problem check-in (or ambiguous response):
    // treat as engagement confirmed, count up to one threshold window.
    const delta = Math.min(gapSeconds, IDLE_CHECKIN_THRESHOLD_SECONDS)
    return { deltaSeconds: delta, updates: baseUpdates }
  }

  // ── Branch 3: normal tick ──
  // Cap the countable gap at the idle threshold — we don't know whether time
  // beyond that was genuinely engaged.
  const delta = Math.min(gapSeconds, IDLE_CHECKIN_THRESHOLD_SECONDS)
  return { deltaSeconds: delta, updates: baseUpdates }
}

// ---------------------------------------------------------------------------
// Frontend-side: called from a setInterval in the chat UI (~every 30 s).
// ---------------------------------------------------------------------------

/**
 * Returns true when the UI should display a check-in prompt.
 * Only fires when the clock is running and no check-in is already pending.
 *
 * @param {object}  participant      - Current row from `participants` (or a lightweight subset).
 * @param {boolean} hasActiveProblem - Whether the student has an in-progress problem.
 * @param {Date}    [now]
 * @returns {boolean}
 */
export function shouldTriggerCheckin(participant, hasActiveProblem, now = new Date()) {
  // Don't fire if the clock is already paused or a check-in is pending.
  if (participant.clock_paused_at) return false
  if (participant.pending_checkin_type) return false

  const nowMs = now instanceof Date ? now.getTime() : Number(now)
  const lastActivityMs = participant.last_activity_at
    ? new Date(participant.last_activity_at).getTime()
    : nowMs

  const idleSeconds = Math.floor((nowMs - lastActivityMs) / 1000)
  return idleSeconds >= IDLE_CHECKIN_THRESHOLD_SECONDS
}

/**
 * Returns the check-in message to show the student.
 * The caller should also set pending_checkin_type on the participant row.
 *
 * @param {boolean} hasActiveProblem
 * @returns {{ type: string, message: string }}
 *   type    — 'mid_problem' | 'between_problems' (write to pending_checkin_type).
 *   message — The text to display in the chat UI.
 */
export function checkinMessageFor(hasActiveProblem) {
  if (hasActiveProblem) {
    return {
      type: 'mid_problem',
      message: "Are you still there? Take as long as you need — I'll be here when you're ready.",
    }
  }
  return {
    type: 'between_problems',
    message: 'Are you working on a problem right now? (Reply Yes or No)',
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for use in the chat route and tests).
// ---------------------------------------------------------------------------

const AFFIRMATIVE = /^\s*(y(es|ep|eah)?|sure|ok(ay)?|still\s+here|i('?m)?\s+here|yup)\s*$/i

/**
 * Returns true if the message is an affirmative check-in reply.
 * Intentionally strict — a student mid-sentence response to a math question
 * should not accidentally confirm a check-in.
 */
export function isAffirmative(message) {
  return AFFIRMATIVE.test(String(message || '').trim())
}

const NEGATIVE = /^\s*(no(pe|t\s+really)?|n)\s*$/i

/**
 * Returns true if the message is a negative reply to a between-problems check-in.
 */
export function isNegative(message) {
  return NEGATIVE.test(String(message || '').trim())
}
