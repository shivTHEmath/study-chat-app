import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { TUTOR_SYSTEM_PROMPT } from '@/lib/tutor/systemPrompt'
import {
  buildRuntimeContext,
  calculateInitialDelaySeconds,
  calculateMidProblemDelaySeconds,
  calculateFadeMultiplier,
} from '@/lib/tutor/runtime'
import { shouldFireMetacognitivePrompt } from '@/lib/tutor/metacognitivePrompting'
import { resolveEngagementTick } from '@/lib/tutor/engagementClock'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null)

    if (!body?.problem || !body?.studentMessage) {
      return Response.json({ error: 'Missing problem or student message.' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return Response.json({ error: 'You must be logged in to chat.' }, { status: 401 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'Anthropic API key is not configured.' }, { status: 500 })
    }

    const admin = createAdminClient()
    const [condition, grade, participantCounters] = await Promise.all([
      loadParticipantCondition(admin, user.id),
      loadParticipantGrade(admin, user.id),
      loadParticipantCounters(admin, user.id),
    ])

    if (!condition) {
      return Response.json(
        { error: 'Your study condition is not assigned yet. Please complete signup again or contact the study administrator.' },
        { status: 409 }
      )
    }

    const phase = body.phase || 'follow_up'

    if (phase === 'new_problem') {
      return await handleNewProblem({ admin, body, condition, grade, participantCounters, userId: user.id })
    }

    return await handleFollowUp({ admin, body, condition, grade, participantCounters, userId: user.id })
  } catch (err) {
    console.error('[api/chat] failed:', err)
    return Response.json(
      { error: 'The tutor could not respond. Please try again.' },
      { status: 500 }
    )
  }
}

async function handleNewProblem({ admin, body, condition, grade, participantCounters, userId }) {
  const { deltaSeconds, updates: clockUpdates } = resolveEngagementTick(
    {
      ...participantCounters,
      pending_checkin_type: body.pendingCheckinType ?? participantCounters.pending_checkin_type,
    },
    body.studentMessage
  )
  const newCumulativeSeconds = await updateParticipantClock(
    admin, userId, participantCounters.cumulative_engaged_seconds, deltaSeconds, clockUpdates
  )

  // Apply SFR fade to AS and AD using the updated cumulative engaged time.
  // AS shrinks (×multiplier); AD's base grows (÷multiplier) — both per §3 of BUILD_DECISIONS_HANDOFF.md.
  const cumulativeEngagedHours = newCumulativeSeconds / 3600
  const fadeMultiplier = calculateFadeMultiplier(condition.sfr_value, cumulativeEngagedHours)
  const fadedCondition = {
    ...condition,
    as_value: condition.as_value * fadeMultiplier,
    ad_base_c: condition.ad_base_c / Math.max(fadeMultiplier, 1e-6),
  }

  const runtimeContext = buildRuntimeContext({
    condition: fadedCondition,
    grade,
    problem: body.problem,
    phase: 'new_problem',
    hintAllowed: false,
    fullSolutionAllowed: false,
    hintCount: 0,
    secondsSinceProblemStarted: 0,
    conversation: [],
  })

  const modelText = await askTutor(runtimeContext, body.studentMessage)
  const parsed = parseNewProblemResponse(modelText)
  const displayProblem = parsed?.displayProblem || body.problem
  const difficulty = clampDifficulty(parsed?.difficulty || 3)
  const tutorMessage = parsed?.message || modelText
  const initialHintDelaySeconds = calculateInitialDelaySeconds(fadedCondition.ad_base_c, difficulty)
  const midProblemDelaySeconds = calculateMidProblemDelaySeconds(fadedCondition.ad_base_c, difficulty)
  const attempt = await createProblemAttempt({
    admin,
    userId,
    condition,
    originalProblem: body.problem,
    displayProblem,
    difficulty,
  })

  await logQuestion(admin, userId, displayProblem, tutorMessage)

  return Response.json({
    attemptId: attempt?.id || null,
    displayProblem,
    hintAllowed: false,
    nextHintAvailableAt: toFutureIso(initialHintDelaySeconds),
    clockState: {
      cumulativeEngagedSeconds: newCumulativeSeconds,
      lastActivityAt: clockUpdates.last_activity_at,
      clockPausedAt: clockUpdates.clock_paused_at ?? null,
      pendingCheckinType: clockUpdates.pending_checkin_type ?? null,
    },
    runtime: {
      difficulty,
      initialHintDelaySeconds,
      midProblemDelaySeconds,
      hintCount: 0,
    },
    message: {
      role: 'tutor',
      text: tutorMessage,
    },
  })
}

async function handleFollowUp({ admin, body, condition, grade, participantCounters, userId }) {
  // Tick the engagement clock on every student message, including hint-wait
  // short-circuits below — the student DID send a message either way.
  const { deltaSeconds, updates: clockUpdates } = resolveEngagementTick(
    {
      ...participantCounters,
      pending_checkin_type: body.pendingCheckinType ?? participantCounters.pending_checkin_type,
    },
    body.studentMessage
  )
  const newCumulativeSeconds = await updateParticipantClock(
    admin, userId, participantCounters.cumulative_engaged_seconds, deltaSeconds, clockUpdates
  )
  const clockState = {
    cumulativeEngagedSeconds: newCumulativeSeconds,
    lastActivityAt: clockUpdates.last_activity_at,
    clockPausedAt: clockUpdates.clock_paused_at ?? null,
    pendingCheckinType: clockUpdates.pending_checkin_type ?? null,
  }

  const attempt = body.attemptId
    ? await loadProblemAttempt(admin, userId, body.attemptId)
    : null
  const effectiveCondition = attempt ? conditionFromAttempt(attempt) : condition
  const difficulty = clampDifficulty(attempt?.difficulty || body.difficulty || 3)

  // Apply SFR fade to this follow-up turn using updated cumulative engaged time.
  const cumulativeEngagedHours = newCumulativeSeconds / 3600
  const fadeMultiplier = calculateFadeMultiplier(effectiveCondition.sfr_value, cumulativeEngagedHours)
  const fadedCondition = {
    ...effectiveCondition,
    as_value: effectiveCondition.as_value * fadeMultiplier,
    ad_base_c: effectiveCondition.ad_base_c / Math.max(fadeMultiplier, 1e-6),
    // mcp_value is intentionally NOT faded — per BUILD_DECISIONS_HANDOFF.md §4
  }

  const hintState = getHintState(attempt, fadedCondition, difficulty)
  const displayProblem = attempt?.display_problem || body.problem
  const requestedHint = isHintRequest(body.studentMessage)
  const requestedHintTime = isHintTimeRequest(body.studentMessage)

  // Hint was asked for (or timing asked about) but the access delay hasn't elapsed yet.
  // Instead of blocking, route to the AI with a flag to give a Socratic/metacognitive
  // response — no mention of time or delays.
  const hintRequestedButDelayed =
    (requestedHint || requestedHintTime) && !hintState.hintAllowed

  const metacognitivePromptDue = shouldFireMetacognitivePrompt({
    mcpValue: effectiveCondition.mcp_value, // mcp_value unfaded — intentional
    promptsOnCurrentProblem: attempt?.metacognitive_prompt_count || 0,
    totalPromptsGiven: participantCounters.total_metacognitive_prompts_given,
    problemsCompleted: participantCounters.problems_completed,
  })

  const runtimeContext = buildRuntimeContext({
    condition: fadedCondition,
    grade,
    problem: displayProblem,
    phase: 'follow_up',
    difficulty,
    hintAllowed: requestedHint && hintState.hintAllowed,
    hintRequestedButDelayed,
    fullSolutionAllowed: false,
    secondsSinceProblemStarted: hintState.secondsSinceStarted,
    initialHintDelaySeconds: hintState.initialHintDelaySeconds,
    midProblemDelaySeconds: hintState.midProblemDelaySeconds,
    hintCount: attempt?.hint_count || 0,
    maxHints: hintState.maxHints,
    hintsExhausted: hintState.hintsExhausted,
    metacognitivePromptDue,
    conversation: body.conversation,
  })

  const modelText = await askTutor(runtimeContext, body.studentMessage)
  const parsed = parseFollowUpResponse(modelText)
  const tutorMessage = parsed.message

  // ── Persist accurate counters based on model's self-reported flags ──────────

  if (attempt?.id && parsed.hintGiven) {
    await incrementHintCount(admin, attempt.id)
  }

  // Increment counter based on whether WE instructed an MCP this turn,
  // not on the AI's self-report. This prevents counter drift caused by
  // the AI misreporting the metacognitivePromptIncluded flag.
  if (attempt?.id && metacognitivePromptDue) {
    await incrementMcpCount(admin, attempt.id, userId)
  }

  // ── Problem completion ───────────────────────────────────────────────────────
  // When the model signals the student has arrived at the correct answer:
  //   • increment problems_completed on the participant row
  //   • reset per-problem metacognitive_prompt_count is implicit (the next
  //     attempt will start a fresh row); we just bump the participant counter.
  if (parsed.isProblemComplete && attempt?.id) {
    await completeProblem(admin, userId, participantCounters.problems_completed)
  }

  await logQuestion(admin, userId, displayProblem, tutorMessage)

  return Response.json({
    attemptId: attempt?.id || null,
    displayProblem,
    isProblemComplete: parsed.isProblemComplete,
    responseType: parsed.responseType,
    hintAllowed: hintState.hintAllowed,
    hintsExhausted: hintState.hintsExhausted,
    nextHintAvailableAt: hintState.nextHintAvailableAt,
    clockState,
    runtime: {
      difficulty,
      initialHintDelaySeconds: hintState.initialHintDelaySeconds,
      midProblemDelaySeconds: hintState.midProblemDelaySeconds,
      hintCount: attempt?.hint_count || 0,
      maxHints: hintState.maxHints,
      secondsSinceStarted: hintState.secondsSinceStarted,
      secondsUntilHint: hintState.secondsUntilHint,
    },
    message: {
      role: 'tutor',
      text: tutorMessage,
    },
  })
}

async function askTutor(runtimeContext, studentMessage) {
  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    max_tokens: 400,
    temperature: 0.2,
    system: TUTOR_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${runtimeContext}\n\nStudent message:\n${studentMessage}`,
      },
    ],
  })

  return extractText(response)
}

async function loadParticipantCondition(admin, userId) {
  const { data, error } = await admin
    .from('participants')
    .select(
      `
        condition:conditions (
          condition_id,
          as_value,
          ad_base_c,
          mcp_value,
          sfr_value
        )
      `
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[api/chat] condition lookup failed:', error.message)
    return null
  }

  if (!isValidCondition(data?.condition)) {
    console.error('[api/chat] missing assigned condition for user:', userId)
    return null
  }

  return data.condition
}

// Fetches all participant counters needed by the clock and MCP logic.
async function loadParticipantCounters(admin, userId) {
  const { data, error } = await admin
    .from('participants')
    .select(
      'total_metacognitive_prompts_given, problems_completed, ' +
      'cumulative_engaged_seconds, last_activity_at, clock_paused_at, pending_checkin_type'
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[api/chat] participant counters lookup failed:', error.message)
  }

  return {
    total_metacognitive_prompts_given: Number(data?.total_metacognitive_prompts_given || 0),
    problems_completed: Number(data?.problems_completed || 0),
    cumulative_engaged_seconds: Number(data?.cumulative_engaged_seconds || 0),
    last_activity_at: data?.last_activity_at ?? null,
    clock_paused_at: data?.clock_paused_at ?? null,
    pending_checkin_type: data?.pending_checkin_type ?? null,
  }
}

// Persists the engagement-clock delta and field updates from resolveEngagementTick.
// Returns the new cumulative total.
async function updateParticipantClock(admin, userId, currentSeconds, deltaSeconds, clockUpdates) {
  const newTotal = Number(currentSeconds) + Number(deltaSeconds)
  const { error } = await admin
    .from('participants')
    .update({ cumulative_engaged_seconds: newTotal, ...clockUpdates })
    .eq('user_id', userId)

  if (error) {
    console.error('[api/chat] participant clock update failed:', error.message)
  }

  return newTotal
}

// Fetches the participant's grade from their survey response.
// Grade is stored as responses->>'grade' (e.g. "7th grade", "8th grade").
// Returns null if not found — buildRuntimeContext falls back to a generic label.
async function loadParticipantGrade(admin, userId) {
  const { data, error } = await admin
    .from('survey_responses')
    .select('responses')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[api/chat] grade lookup failed:', error.message)
    return null
  }

  return data?.responses?.grade ?? null
}

function isValidCondition(condition) {
  return (
    Number.isFinite(Number(condition?.condition_id)) &&
    Number.isFinite(Number(condition?.as_value)) &&
    Number.isFinite(Number(condition?.ad_base_c)) &&
    Number.isFinite(Number(condition?.mcp_value)) &&
    Number.isFinite(Number(condition?.sfr_value))
  )
}

async function createProblemAttempt({
  admin,
  userId,
  condition,
  originalProblem,
  displayProblem,
  difficulty,
}) {
  const { data, error } = await admin
    .from('problem_attempts')
    .insert({
      user_id: userId,
      condition_id: condition.condition_id,
      original_problem: originalProblem,
      display_problem: displayProblem,
      difficulty,
      as_value: condition.as_value,
      ad_base_c: condition.ad_base_c,
      mcp_value: condition.mcp_value,
      sfr_value: condition.sfr_value,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[api/chat] problem attempt insert failed:', error.message)
    return null
  }

  return data
}

async function loadProblemAttempt(admin, userId, attemptId) {
  const { data, error } = await admin
    .from('problem_attempts')
    .select('*')
    .eq('id', attemptId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[api/chat] problem attempt lookup failed:', error.message)
  }

  return data || null
}

async function incrementHintCount(admin, attemptId) {
  // Read then write in two calls. Supabase JS does not support
  // `hint_count = hint_count + 1` expressions directly; a true atomic
  // single-statement increment would require an RPC/migration. For this
  // study, simultaneous hint requests on the same attempt are not possible
  // (the UI is blocked while a request is in-flight), so two calls is safe.
  const { data, error: readError } = await admin
    .from('problem_attempts')
    .select('hint_count')
    .eq('id', attemptId)
    .single()

  if (readError) {
    console.error('[api/chat] hint count read failed:', readError.message)
    return
  }

  const { error: writeError } = await admin
    .from('problem_attempts')
    .update({
      hint_count: Number(data?.hint_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', attemptId)

  if (writeError) {
    console.error('[api/chat] hint count write failed:', writeError.message)
  }
}

// Increments metacognitive_prompt_count on the attempt AND
// total_metacognitive_prompts_given on the participant row.
async function incrementMcpCount(admin, attemptId, userId) {
  const { data, error: readError } = await admin
    .from('problem_attempts')
    .select('metacognitive_prompt_count')
    .eq('id', attemptId)
    .single()

  if (readError) {
    console.error('[api/chat] mcp count read failed:', readError.message)
    return
  }

  const newCount = Number(data?.metacognitive_prompt_count || 0) + 1

  const { error: attemptErr } = await admin
    .from('problem_attempts')
    .update({ metacognitive_prompt_count: newCount, updated_at: new Date().toISOString() })
    .eq('id', attemptId)

  if (attemptErr) console.error('[api/chat] mcp attempt update failed:', attemptErr.message)

  // Read-then-write for participant total (concurrent MCP requests on the same
  // problem are impossible since the UI blocks while a request is in-flight).
  const { data: p, error: pReadErr } = await admin
    .from('participants')
    .select('total_metacognitive_prompts_given')
    .eq('user_id', userId)
    .single()

  if (pReadErr) {
    console.error('[api/chat] mcp participant read failed:', pReadErr.message)
    return
  }

  const { error: pWriteErr } = await admin
    .from('participants')
    .update({ total_metacognitive_prompts_given: Number(p?.total_metacognitive_prompts_given || 0) + 1 })
    .eq('user_id', userId)

  if (pWriteErr) console.error('[api/chat] mcp participant update failed:', pWriteErr.message)
}

// Marks the current problem as solved: increments problems_completed on the
// participant row. The attempt itself is left open (no is_complete column
// needed) — the next new_problem call starts a fresh attempt row.
async function completeProblem(admin, userId, currentProblemsCompleted) {
  const { error } = await admin
    .from('participants')
    .update({ problems_completed: Number(currentProblemsCompleted || 0) + 1 })
    .eq('user_id', userId)

  if (error) {
    console.error('[api/chat] completeProblem update failed:', error.message)
  }
}

async function logQuestion(admin, userId, question, response) {
  const { error } = await admin.from('questions').insert({
    user_id: userId,
    question,
    response,
  })

  if (error) {
    console.error('[api/chat] question log failed:', error.message)
  }
}

function extractText(response) {
  return response.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()
}

// Parses the follow-up response format:
//   <prose message on one or more lines>
//   {"isProblemComplete":false,"hintGiven":false,"metacognitivePromptIncluded":false,"responseType":"Socratic"}
//
// Scans backwards for the last line that is a valid JSON object containing
// isProblemComplete. The message is everything before that line.
// Falls back to the old wrapper-JSON format if the model didn't follow instructions.
function parseFollowUpResponse(text) {
  const raw = String(text || '').trim()
  const lines = raw.split('\n')

  // Primary path: new format — prose + compact flags JSON as the last line
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line.startsWith('{')) continue
    try {
      const flags = JSON.parse(line)
      if ('isProblemComplete' in flags) {
        const message = lines.slice(0, i).join('\n').trim() || raw
        return {
          message,
          isProblemComplete: Boolean(flags.isProblemComplete),
          hintGiven: Boolean(flags.hintGiven),
          metacognitivePromptIncluded: Boolean(flags.metacognitivePromptIncluded),
          responseType: typeof flags.responseType === 'string' ? flags.responseType : null,
        }
      }
    } catch {}
  }

  // Fallback: old wrapper-JSON format {"message":"...","isProblemComplete":...}
  const stripped = stripCodeFence(raw)
  const parsed = tryParseJson(stripped)
  if (parsed && typeof parsed.message === 'string') {
    // Strip any [Label] suffix left over from the old format
    const message = parsed.message.replace(/\n\[[\w\s,]+\]\s*$/, '').trim()
    return {
      message,
      isProblemComplete: Boolean(parsed.isProblemComplete),
      hintGiven: Boolean(parsed.hintGiven),
      metacognitivePromptIncluded: Boolean(parsed.metacognitivePromptIncluded),
      responseType: null,
    }
  }

  // Final fallback: use raw text as-is
  return { message: raw, isProblemComplete: false, hintGiven: false, metacognitivePromptIncluded: false, responseType: null }
}

function parseNewProblemResponse(text) {
  const stripped = stripCodeFence(text)

  // Stage 1 — clean parse
  const parsed = tryParseJson(stripped)
  if (parsed && typeof parsed.displayProblem === 'string' && typeof parsed.message === 'string') {
    return {
      displayProblem: parsed.displayProblem.trim(),
      difficulty: clampDifficulty(parsed.difficulty),
      // Strip any old [Label] suffix the model may have included
      message: parsed.message.replace(/\n\[[\w\s,]+\]\s*$/, '').trim(),
    }
  }

  // Stage 2 — regex extraction of displayProblem + message
  const dpMatch = stripped.match(/"displayProblem"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/)
  const msgMatch = stripped.match(/"message"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/)
  if (dpMatch && msgMatch) {
    return {
      displayProblem: unescapeJsonString(dpMatch[1]).trim(),
      difficulty: clampDifficulty((stripped.match(/"difficulty"\s*:\s*(\d)/) || [])[1]),
      message: unescapeJsonString(msgMatch[1]).replace(/\n\[[\w\s,]+\]\s*$/, '').trim(),
    }
  }

  return null
}

// Attempts JSON.parse; returns null instead of throwing.
function tryParseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

// Re-applies the escape sequences a JSON parser would handle, so regex-
// extracted strings render correctly (\\n → newline, \\" → quote, etc.)
function unescapeJsonString(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

function conditionFromAttempt(attempt) {
  return {
    condition_id: attempt.condition_id,
    as_value: attempt.as_value,
    ad_base_c: attempt.ad_base_c,
    mcp_value: attempt.mcp_value,
    sfr_value: attempt.sfr_value,
  }
}

function getHintState(attempt, condition, difficulty) {
  const initialHintDelaySeconds = calculateInitialDelaySeconds(condition.ad_base_c, difficulty)
  const midProblemDelaySeconds = calculateMidProblemDelaySeconds(condition.ad_base_c, difficulty)
  const secondsSinceStarted = attempt?.started_at
    ? Math.max(0, Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000))
    : 0
  const hintCount = Number(attempt?.hint_count || 0)
  const hasGivenHint = hintCount > 0

  // 80% cap: hints stop once the cumulative AS% would exceed 80.
  // effectiveAS is already faded (stored in condition.as_value by the caller).
  // We round down (floor), minimum 1 so every student can get at least one hint.
  const effectiveAS = Number(condition.as_value) || 30
  const maxHints = Math.max(1, Math.floor(80 / effectiveAS))
  const hintsExhausted = hintCount >= maxHints

  const nextDelay = hasGivenHint
    ? midProblemDelaySeconds
    : initialHintDelaySeconds
  const referenceTime = hasGivenHint ? attempt?.updated_at : attempt?.started_at
  const secondsSinceReference = referenceTime
    ? Math.max(0, Math.floor((Date.now() - new Date(referenceTime).getTime()) / 1000))
    : 0
  // Hint is allowed only if the delay has elapsed AND the cap is not reached.
  const hintAllowed = !hintsExhausted && secondsSinceReference >= nextDelay
  const secondsUntilHint = hintAllowed ? 0 : Math.max(0, nextDelay - secondsSinceReference)

  return {
    hintAllowed,
    hintsExhausted,
    maxHints,
    initialHintDelaySeconds,
    midProblemDelaySeconds,
    secondsSinceStarted,
    secondsUntilHint,
    nextHintAvailableAt: hintAllowed ? null : toFutureIso(secondsUntilHint),
  }
}

function isHintRequest(message) {
  const text = String(message || '').toLowerCase()
  return /\bhint\b|\bclue\b/.test(text)
}

function isHintTimeRequest(message) {
  const text = String(message || '').toLowerCase()
  return (
    /\bhow long\b/.test(text) ||
    /\bhow much time\b/.test(text) ||
    /\bwait\b/.test(text) ||
    /\bwhen\b.*\bhint\b/.test(text) ||
    /\bhint\b.*\bwhen\b/.test(text)
  )
}

function formatRemainingTime(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(Number(totalSeconds || 0)))

  if (seconds < 60) {
    return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (remainingSeconds === 0) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  }

  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} and ${remainingSeconds} ${
    remainingSeconds === 1 ? 'second' : 'seconds'
  }`
}

function clampDifficulty(value) {
  const difficulty = Number(value)
  if (!Number.isFinite(difficulty)) return 3
  return Math.min(5, Math.max(1, Math.round(difficulty)))
}

function toFutureIso(secondsFromNow) {
  return new Date(Date.now() + Math.max(0, Number(secondsFromNow || 0)) * 1000).toISOString()
}

function stripCodeFence(text) {
  return String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
}
