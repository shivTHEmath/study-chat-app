import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { TUTOR_SYSTEM_PROMPT } from '@/lib/tutor/systemPrompt'
import {
  buildRuntimeContext,
  calculateInitialDelaySeconds,
  calculateMidProblemDelaySeconds,
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

  const runtimeContext = buildRuntimeContext({
    condition,
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
  const initialHintDelaySeconds = calculateInitialDelaySeconds(condition.ad_base_c, difficulty)
  const midProblemDelaySeconds = calculateMidProblemDelaySeconds(condition.ad_base_c, difficulty)
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
  const hintState = getHintState(attempt, effectiveCondition, difficulty)
  const displayProblem = attempt?.display_problem || body.problem
  const requestedHint = isHintRequest(body.studentMessage)
  const requestedHintTime = isHintTimeRequest(body.studentMessage)

  if (requestedHintTime || (requestedHint && !hintState.hintAllowed)) {
    const tutorMessage = buildWaitMessage(hintState)
    await logQuestion(admin, userId, displayProblem, tutorMessage)

    return Response.json({
      isWaitMessage: true,
      attemptId: attempt?.id || null,
      displayProblem,
      hintAllowed: hintState.hintAllowed,
      nextHintAvailableAt: hintState.nextHintAvailableAt,
      clockState,
      runtime: {
        difficulty,
        initialHintDelaySeconds: hintState.initialHintDelaySeconds,
        midProblemDelaySeconds: hintState.midProblemDelaySeconds,
        hintCount: attempt?.hint_count || 0,
        secondsSinceStarted: hintState.secondsSinceStarted,
        secondsUntilHint: hintState.secondsUntilHint,
      },
      message: {
        role: 'tutor',
        text: tutorMessage,
      },
    })
  }

  const metacognitivePromptDue = shouldFireMetacognitivePrompt({
    mcpValue: effectiveCondition.mcp_value,
    promptsOnCurrentProblem: attempt?.metacognitive_prompt_count || 0,
    totalPromptsGiven: participantCounters.total_metacognitive_prompts_given,
    problemsCompleted: participantCounters.problems_completed,
  })

  const runtimeContext = buildRuntimeContext({
    condition: effectiveCondition,
    grade,
    problem: displayProblem,
    phase: 'follow_up',
    difficulty,
    hintAllowed: requestedHint && hintState.hintAllowed,
    fullSolutionAllowed: false,
    secondsSinceProblemStarted: hintState.secondsSinceStarted,
    initialHintDelaySeconds: hintState.initialHintDelaySeconds,
    midProblemDelaySeconds: hintState.midProblemDelaySeconds,
    hintCount: attempt?.hint_count || 0,
    metacognitivePromptDue,
    conversation: body.conversation,
  })

  const tutorMessage = await askTutor(runtimeContext, body.studentMessage)

  if (attempt?.id && requestedHint && hintState.hintAllowed) {
    await incrementHintCount(admin, attempt.id)
  }

  await logQuestion(admin, userId, displayProblem, tutorMessage)

  return Response.json({
    attemptId: attempt?.id || null,
    displayProblem,
    hintAllowed: hintState.hintAllowed,
    nextHintAvailableAt: hintState.nextHintAvailableAt,
    clockState,
    runtime: {
      difficulty,
      initialHintDelaySeconds: hintState.initialHintDelaySeconds,
      midProblemDelaySeconds: hintState.midProblemDelaySeconds,
      hintCount: attempt?.hint_count || 0,
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
    max_tokens: 500,
    temperature: 0.4,
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
    .order('created_at', { ascending: false })
    .limit(1)
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

function parseNewProblemResponse(text) {
  try {
    const parsed = JSON.parse(stripCodeFence(text))
    if (
      typeof parsed?.displayProblem === 'string' &&
      typeof parsed?.message === 'string'
    ) {
      return {
        displayProblem: parsed.displayProblem.trim(),
        difficulty: clampDifficulty(parsed.difficulty),
        message: parsed.message.trim(),
      }
    }
  } catch {
    return null
  }

  return null
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
  const hasGivenHint = Number(attempt?.hint_count || 0) > 0
  const nextDelay = hasGivenHint
    ? midProblemDelaySeconds
    : initialHintDelaySeconds
  const referenceTime = hasGivenHint ? attempt?.updated_at : attempt?.started_at
  const secondsSinceReference = referenceTime
    ? Math.max(0, Math.floor((Date.now() - new Date(referenceTime).getTime()) / 1000))
    : 0
  const hintAllowed = secondsSinceReference >= nextDelay
  const secondsUntilHint = hintAllowed ? 0 : Math.max(0, nextDelay - secondsSinceReference)

  return {
    hintAllowed,
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

function buildWaitMessage(hintState) {
  if (hintState.hintAllowed) {
    return 'You can ask for the next hint now.'
  }

  return `You can get the next hint in ${formatRemainingTime(hintState.secondsUntilHint)}.`
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
