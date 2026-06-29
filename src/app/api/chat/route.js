import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { TUTOR_SYSTEM_PROMPT } from '@/lib/tutor/systemPrompt'
import {
  buildRuntimeContext,
  calculateInitialDelaySeconds,
  calculateMidProblemDelaySeconds,
} from '@/lib/tutor/runtime'

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
    const condition = await loadParticipantCondition(admin, user.id)

    if (!condition) {
      return Response.json(
        { error: 'Your study condition is not assigned yet. Please complete signup again or contact the study administrator.' },
        { status: 409 }
      )
    }

    const phase = body.phase || 'follow_up'

    if (phase === 'new_problem') {
      return await handleNewProblem({ admin, body, condition, userId: user.id })
    }

    return await handleFollowUp({ admin, body, condition, userId: user.id })
  } catch (err) {
    console.error('[api/chat] failed:', err)
    return Response.json(
      { error: 'The tutor could not respond. Please try again.' },
      { status: 500 }
    )
  }
}

async function handleNewProblem({ admin, body, condition, userId }) {
  const runtimeContext = buildRuntimeContext({
    condition,
    grade: body.grade,
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

async function handleFollowUp({ admin, body, condition, userId }) {
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
      attemptId: attempt?.id || null,
      displayProblem,
      hintAllowed: hintState.hintAllowed,
      nextHintAvailableAt: hintState.nextHintAvailableAt,
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

  const runtimeContext = buildRuntimeContext({
    condition: effectiveCondition,
    grade: body.grade,
    problem: displayProblem,
    phase: 'follow_up',
    difficulty,
    hintAllowed: requestedHint && hintState.hintAllowed,
    fullSolutionAllowed: false,
    secondsSinceProblemStarted: hintState.secondsSinceStarted,
    initialHintDelaySeconds: hintState.initialHintDelaySeconds,
    midProblemDelaySeconds: hintState.midProblemDelaySeconds,
    hintCount: attempt?.hint_count || 0,
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
  const { error } = await admin
    .from('problem_attempts')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', attemptId)

  if (error) {
    console.error('[api/chat] problem attempt update failed:', error.message)
    return
  }

  const { data: current, error: lookupError } = await admin
    .from('problem_attempts')
    .select('hint_count')
    .eq('id', attemptId)
    .single()

  if (lookupError) {
    console.error('[api/chat] problem attempt hint lookup failed:', lookupError.message)
    return
  }

  const { error: countError } = await admin
    .from('problem_attempts')
    .update({
      hint_count: Number(current?.hint_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', attemptId)

  if (countError) {
    console.error('[api/chat] problem attempt hint update failed:', countError.message)
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
