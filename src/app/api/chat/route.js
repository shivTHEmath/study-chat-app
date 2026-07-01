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
import { metacognitiveTargetForProblem } from '@/lib/tutor/metacognitivePrompting'
import { resolveEngagementTick } from '@/lib/tutor/engagementClock'
import { maybeCreateDueAssessment } from '@/lib/assessments'

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

    let phase = body.phase || 'follow_up'

    // 'auto' — the client has an active problem but doesn't know whether this
    // message is a new problem or a follow-up. Classify it; if we're not
    // confident (>80%), bounce back and let the UI ask the student.
    if (phase === 'auto') {
      const { intent, confidence } = await classifyIntent(
        body.problem,
        body.conversation,
        body.studentMessage
      )
      if (confidence < 0.8) {
        return Response.json({
          needsIntentConfirmation: true,
          intentGuess: intent,
          intentConfidence: confidence,
        })
      }
      if (intent === 'new_problem') {
        // The student's message IS the new problem — override body.problem so
        // the new-problem handler treats it as the problem text, not the old one.
        return await handleNewProblem({
          admin,
          body: { ...body, problem: body.studentMessage },
          condition, grade, participantCounters, userId: user.id, intent: 'new_problem',
        })
      }
      return await handleFollowUp({ admin, body, condition, grade, participantCounters, userId: user.id, intent: 'follow_up' })
    }

    if (phase === 'new_problem') {
      return await handleNewProblem({ admin, body, condition, grade, participantCounters, userId: user.id, intent: 'new_problem' })
    }

    return await handleFollowUp({ admin, body, condition, grade, participantCounters, userId: user.id, intent: 'follow_up' })
  } catch (err) {
    console.error('[api/chat] failed:', err)
    return Response.json(
      { error: 'The tutor could not respond. Please try again.' },
      { status: 500 }
    )
  }
}

async function handleNewProblem({ admin, body, condition, grade, participantCounters, userId, intent }) {
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

  const { text: modelText, usage } = await askTutor(runtimeContext, body.studentMessage)
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

  await logQuestion(admin, userId, {
    question: displayProblem,
    response: tutorMessage,
    studentMessage: body.studentMessage,
    attemptId: attempt?.id || null,
    phase: 'new_problem',
    tokensIn: usage?.input ?? null,
    tokensOut: usage?.output ?? null,
  })

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
      asValue: fadedCondition.as_value,
      initialHintDelaySeconds,
      midProblemDelaySeconds,
      hintCount: 0,
    },
    intent: intent ?? 'new_problem',
    message: {
      role: 'tutor',
      text: tutorMessage,
      tokens: usage,
    },
  })
}

async function handleFollowUp({ admin, body, condition, grade, participantCounters, userId, intent }) {
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
  // Instead of blocking, route to the AI with a flag to give brief encouragement
  // to keep working — no hint, no open question, no mention of time or delays.
  const hintRequestedButDelayed =
    (requestedHint || requestedHintTime) && !hintState.hintAllowed

  // Is a previous metacognitive prompt still awaiting an answer this turn?
  const mcpAwaitingAnswer = Boolean(attempt?.mcp_awaiting_answer)
  const mcpReaskCount = Number(attempt?.mcp_reask_count || 0)

  // Per-problem MCP budget. The server sets the ceiling; the AI decides WHEN to
  // spend it across the conversation (see mcpGuidance in runtime.js).
  const mcpGiven = Number(attempt?.metacognitive_prompt_count || 0)
  const mcpTarget = metacognitiveTargetForProblem({
    mcpValue: effectiveCondition.mcp_value, // mcp_value unfaded — intentional
    totalPromptsGiven: participantCounters.total_metacognitive_prompts_given,
    problemsCompleted: participantCounters.problems_completed,
  })
  const mcpRemaining = Math.max(0, mcpTarget - mcpGiven)
  // Not allowed while awaiting an answer to a prior prompt (no stacking).
  const mcpAllowedThisTurn = !mcpAwaitingAnswer && mcpRemaining > 0

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
    mcpAllowedThisTurn,
    mcpTarget,
    mcpGiven,
    mcpRemaining,
    mcpAwaitingAnswer,
    mcpReaskCount,
    conversation: body.conversation,
  })

  const { text: modelText, usage } = await askTutor(runtimeContext, body.studentMessage)
  const parsed = parseFollowUpResponse(modelText)
  let tutorMessage = parsed.message

  // Guard: never surface an empty bubble. If parsing yielded nothing (e.g. a
  // truncated or malformed response), log the raw text and fall back.
  if (!tutorMessage || !tutorMessage.trim()) {
    console.error('[api/chat] empty tutor message. raw model text:', JSON.stringify(modelText).slice(0, 500))
    tutorMessage = 'Sorry — I lost my train of thought there. Could you say that again?'
  }

  // ── Persist accurate counters based on model's self-reported flags ──────────

  if (attempt?.id && parsed.hintGiven) {
    await incrementHintCount(admin, attempt.id)
  }

  // A metacognitive prompt counts only if it was ALLOWED this turn (budget > 0,
  // not awaiting) AND the AI actually included one. The budget gate caps the
  // count at the target so it can never exceed the assigned rate.
  const mcpDelivered = mcpAllowedThisTurn && parsed.metacognitivePromptIncluded

  if (attempt?.id && mcpDelivered) {
    await incrementMcpCount(admin, attempt.id, userId)
  }

  // ── Metacognitive-prompt answer tracking ────────────────────────────────────
  let resultAwaiting = mcpAwaitingAnswer
  let resultReask = mcpReaskCount
  if (attempt?.id) {
    if (mcpAwaitingAnswer) {
      // We were waiting for the student to answer a previous MCP.
      if (parsed.mcpAnswered || parsed.mcpDropped) {
        // Answered, or we backed off — stop waiting and reset the counter.
        resultAwaiting = false
        resultReask = 0
      } else {
        // Still unanswered — re-asked this turn. After 3 attempts, give up.
        resultReask = mcpReaskCount + 1
        resultAwaiting = resultReask < 3
      }
      await updateMcpAwaitState(admin, attempt.id, resultAwaiting, resultReask)
    } else if (mcpDelivered) {
      // A fresh MCP was delivered this turn — start awaiting its answer.
      resultAwaiting = true
      resultReask = 0
      await updateMcpAwaitState(admin, attempt.id, true, 0)
    }
  }

  // Current MCP counts (including this turn's delivery, if any) for the debug panel.
  const mcpCountNow = mcpGiven + (mcpDelivered ? 1 : 0)
  const mcpTotalNow = Number(participantCounters.total_metacognitive_prompts_given || 0) + (mcpDelivered ? 1 : 0)

  // ── Problem completion ───────────────────────────────────────────────────────
  // When the model signals the student has arrived at the correct answer:
  //   • increment problems_completed on the participant row
  //   • reset per-problem metacognitive_prompt_count is implicit (the next
  //     attempt will start a fresh row); we just bump the participant counter.
  let assessmentAvailable = false
  if (parsed.isProblemComplete && attempt?.id) {
    await completeProblem(admin, userId, participantCounters.problems_completed, attempt.id)
    const assessmentResult = await maybeCreateDueAssessment(admin, userId, {
      ...participantCounters,
      grade,
      problems_completed: Number(participantCounters.problems_completed || 0) + 1,
    })
    assessmentAvailable = Boolean(assessmentResult.assessment)
  }

  await logQuestion(admin, userId, {
    question: displayProblem,
    response: tutorMessage,
    studentMessage: body.studentMessage,
    attemptId: attempt?.id || null,
    phase: 'follow_up',
    tokensIn: usage?.input ?? null,
    tokensOut: usage?.output ?? null,
  })

  return Response.json({
    attemptId: attempt?.id || null,
    displayProblem,
    isProblemComplete: parsed.isProblemComplete,
    assessmentAvailable,
    responseType: parsed.responseType,
    hintAllowed: hintState.hintAllowed,
    hintsExhausted: hintState.hintsExhausted,
    nextHintAvailableAt: hintState.nextHintAvailableAt,
    clockState,
    runtime: {
      difficulty,
      asValue: fadedCondition.as_value,
      initialHintDelaySeconds: hintState.initialHintDelaySeconds,
      midProblemDelaySeconds: hintState.midProblemDelaySeconds,
      hintCount: attempt?.hint_count || 0,
      maxHints: hintState.maxHints,
      secondsSinceStarted: hintState.secondsSinceStarted,
      secondsUntilHint: hintState.secondsUntilHint,
    },
    debug: {
      attemptFound: Boolean(attempt),
      conditionId: effectiveCondition.condition_id,
      conditionSource: attempt ? 'attempt' : 'participant',
      baseAS: effectiveCondition.as_value,
      sfrValue: effectiveCondition.sfr_value,
      fadeMultiplier,
      engagedHours: cumulativeEngagedHours,
      mcpCount: mcpCountNow,
      mcpTotal: mcpTotalNow,
      mcpTarget,
      mcpRemaining: Math.max(0, mcpTarget - mcpCountNow),
      mcpAwaiting: resultAwaiting,
      mcpReask: resultReask,
    },
    intent: intent ?? 'follow_up',
    message: {
      role: 'tutor',
      text: tutorMessage,
      tokens: usage,
    },
  })
}

// Classifies whether an incoming message starts a NEW problem or is a FOLLOW-UP
// to the active one. Uses a fast, cheap model. Returns { intent, confidence }.
// On any failure, returns confidence 0 so the UI asks the student to choose.
const CLASSIFIER_MODEL = process.env.ANTHROPIC_CLASSIFIER_MODEL || 'claude-haiku-4-5-20251001'

async function classifyIntent(currentProblem, conversation, studentMessage) {
  try {
    const convText = Array.isArray(conversation)
      ? conversation
          .slice(-6)
          .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${String(m.text || '').trim()}`)
          .join('\n')
      : ''

    const prompt = [
      'You classify a single student message in a math tutoring chat.',
      'Decide which of these it is:',
      '- "new_problem": the student is introducing a NEW math problem or question to start working on, distinct from the current one.',
      '- "follow_up": the message concerns the CURRENT problem — an answer attempt, a question about it, a request for a hint, a clarification, or general chat about it.',
      '',
      `Current problem: ${currentProblem || '(none)'}`,
      convText ? `Recent conversation:\n${convText}` : '',
      `New student message: ${studentMessage}`,
      '',
      'Output ONLY compact JSON: {"intent":"new_problem"|"follow_up","confidence":0.0-1.0}',
      'confidence = how certain you are of the chosen intent (1.0 = fully certain).',
    ]
      .filter(Boolean)
      .join('\n')

    const resp = await anthropic.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 60,
      system: 'You are a precise intent classifier. Output only the requested JSON, nothing else.',
      messages: [{ role: 'user', content: prompt }],
    })

    const parsed = tryParseJson(stripCodeFence(extractText(resp))) || {}
    const intent = parsed.intent === 'new_problem' ? 'new_problem' : 'follow_up'
    let confidence = Number(parsed.confidence)
    if (!Number.isFinite(confidence)) confidence = 0
    confidence = Math.max(0, Math.min(1, confidence))
    return { intent, confidence }
  } catch (err) {
    console.error('[api/chat] intent classification failed:', err)
    return { intent: 'follow_up', confidence: 0 }
  }
}

async function askTutor(runtimeContext, studentMessage) {
  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: TUTOR_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${runtimeContext}\n\nStudent message:\n${studentMessage}`,
      },
    ],
  })

  return {
    text: extractText(response),
    usage: {
      input: response.usage?.input_tokens ?? null,
      output: response.usage?.output_tokens ?? null,
    },
  }
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
      'cumulative_engaged_seconds, last_activity_at, clock_paused_at, pending_checkin_type, ' +
      'next_assessment_due_at'
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
    next_assessment_due_at: data?.next_assessment_due_at ?? null,
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

// Persists whether the attempt is awaiting an answer to a metacognitive prompt,
// and how many times it has been re-asked.
async function updateMcpAwaitState(admin, attemptId, awaiting, reaskCount) {
  const { error } = await admin
    .from('problem_attempts')
    .update({
      mcp_awaiting_answer: Boolean(awaiting),
      mcp_reask_count: Number(reaskCount || 0),
      updated_at: new Date().toISOString(),
    })
    .eq('id', attemptId)

  if (error) {
    console.error('[api/chat] mcp await-state update failed:', error.message)
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
// participant row and closes the current attempt so assessments can appear
// only between problems.
async function completeProblem(admin, userId, currentProblemsCompleted, attemptId) {
  const nowIso = new Date().toISOString()
  const { error } = await admin
    .from('participants')
    .update({ problems_completed: Number(currentProblemsCompleted || 0) + 1 })
    .eq('user_id', userId)

  if (error) {
    console.error('[api/chat] completeProblem update failed:', error.message)
  }

  const { error: attemptError } = await admin
    .from('problem_attempts')
    .update({ completed_at: nowIso, updated_at: nowIso })
    .eq('id', attemptId)
    .eq('user_id', userId)

  if (attemptError) {
    console.error('[api/chat] problem attempt completion update failed:', attemptError.message)
  }
}

async function logQuestion(admin, userId, { question, response, studentMessage, attemptId, phase, tokensIn, tokensOut }) {
  const { error } = await admin.from('questions').insert({
    user_id: userId,
    question,
    response,
    student_message: studentMessage ?? null,
    attempt_id: attemptId ?? null,
    phase: phase ?? null,
    tokens_in: tokensIn ?? null,
    tokens_out: tokensOut ?? null,
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
//   {"isProblemComplete":false,"hintGiven":false,"metacognitivePromptIncluded":false,"responseType":"Hint"}
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
          mcpAnswered: Boolean(flags.mcpAnswered),
          mcpDropped: Boolean(flags.mcpDropped),
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
      mcpAnswered: Boolean(parsed.mcpAnswered),
      mcpDropped: Boolean(parsed.mcpDropped),
    }
  }

  // Final fallback: use raw text as-is
  return { message: raw, isProblemComplete: false, hintGiven: false, metacognitivePromptIncluded: false, responseType: null, mcpAnswered: false, mcpDropped: false }
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
