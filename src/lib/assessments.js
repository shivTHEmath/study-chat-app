import Anthropic from '@anthropic-ai/sdk'

const ASSESSMENT_INTERVAL_MS = 10 * 60 * 1000
const ASSESSMENT_DURATION_MINUTES = 30
const ASSESSMENT_ITEM_COUNT = 10
const ASSESSMENT_MODEL =
  process.env.ANTHROPIC_ASSESSMENT_MODEL ||
  process.env.ANTHROPIC_MODEL ||
  'claude-sonnet-4-6'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

function addMs(date, ms) {
  return new Date(date.getTime() + ms)
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function extractText(response) {
  return response.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()
}

function stripCodeFence(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()
}

function safeJsonParse(text) {
  try {
    return JSON.parse(stripCodeFence(text))
  } catch {
    return null
  }
}

function normalizeCorrectness(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function publicAssessment(assessment, items = []) {
  if (!assessment) return null

  return {
    id: assessment.id,
    status: assessment.status,
    availableAt: assessment.available_at,
    startedAt: assessment.started_at,
    dueAt: assessment.due_at,
    completedAt: assessment.completed_at,
    score: assessment.score,
    meanConfidence: assessment.mean_confidence,
    calibrationError: assessment.calibration_error,
    itemCount: items.length || ASSESSMENT_ITEM_COUNT,
    durationMinutes: ASSESSMENT_DURATION_MINUTES,
    items: items.map((item) => ({
      id: item.id,
      position: item.position,
      prompt: item.prompt,
      transferType: item.transfer_type,
    })),
  }
}

async function fetchOpenAssessment(admin, userId) {
  const { data } = await admin
    .from('assessments')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data || null
}

async function fetchAssessmentItems(admin, assessmentId, includeAnswers = false) {
  const columns = includeAnswers
    ? '*'
    : 'id, assessment_id, position, prompt, transfer_type, created_at'

  const { data } = await admin
    .from('assessment_items')
    .select(columns)
    .eq('assessment_id', assessmentId)
    .order('position', { ascending: true })

  return data || []
}

async function scheduleNextAssessment(admin, userId, now = new Date()) {
  const nextDueAt = addMs(now, ASSESSMENT_INTERVAL_MS).toISOString()
  await admin
    .from('participants')
    .update({ next_assessment_due_at: nextDueAt })
    .eq('user_id', userId)

  return nextDueAt
}

async function ensureAssessmentSchedule(admin, userId, participant, now = new Date()) {
  if (participant?.next_assessment_due_at) return participant.next_assessment_due_at
  return scheduleNextAssessment(admin, userId, now)
}

async function fetchSourceQuestions(admin, userId) {
  const { data } = await admin
    .from('questions')
    .select('question, response, asked_at')
    .eq('user_id', userId)
    .order('asked_at', { ascending: true })

  return (data || []).filter((row) => row.question && row.question.trim())
}

function buildGenerationPrompt({ sourceQuestions, grade }) {
  const history = sourceQuestions.map((row, index) => ({
    index: index + 1,
    question: row.question,
    tutor_response: row.response || '',
    asked_at: row.asked_at,
  }))

  return `You are writing a short math test for a student, in the style of a school exam.

Student grade: ${grade || 'unknown'}.

STYLE — write it like a real school test:
- Default to short-answer questions: each one should have a single concrete answer — a number, an expression, a set of solutions, a coordinate, etc. ("Solve for x: ...", "Evaluate ...", "Factor ...", "Find the value of ...").
- Do NOT write "explain", "describe", "why", or "justify" prompts, and do NOT ask the student to write out reasoning or proofs — UNLESS the student's prior questions below are themselves predominantly proof-based or explanation-based. Only then should the test match that style.
- No multi-part questions. One ask per problem.

CONTENT requirements:
- Create exactly ${ASSESSMENT_ITEM_COUNT} problems.
- Each problem must be solvable within the student's apparent current knowledge and difficulty level.
- Prefer creative cross-topic transfer when safe. Use paraphrase next. Use number changes only as a last resort.
- Run these checks silently for every item: current-knowledge solvable, suitable difficulty, unique solution, mathematical correctness, 3 sentences or fewer.
- Avoid long story problems. Avoid requiring facts not contained in the prompt or ordinary school knowledge.
- Use the student's prior questions below as the source data.

Return only JSON with this shape:
{
  "strategySummary": "one sentence",
  "items": [
    {
      "prompt": "student-facing problem",
      "expectedAnswer": "concise answer key",
      "rubric": "how to judge correctness, including acceptable equivalent forms",
      "transferType": "cross_topic_transfer|paraphrase|number_change",
      "sourceIndex": 1
    }
  ]
}

Prior questions:
${JSON.stringify(history, null, 2)}`
}

function fallbackItems(sourceQuestions) {
  const usable = sourceQuestions.length ? sourceQuestions : [{ question: 'Solve 2x + 5 = 17.' }]
  return Array.from({ length: ASSESSMENT_ITEM_COUNT }, (_, index) => {
    const source = usable[index % usable.length]
    return {
      prompt: `Solve a similar problem, showing your reasoning: ${source.question}`,
      expectedAnswer: 'Equivalent to the original problem solution.',
      rubric: 'Award full credit for a mathematically correct answer with valid reasoning; accept equivalent forms.',
      transferType: 'paraphrase',
      sourceIndex: (index % usable.length) + 1,
    }
  })
}

async function generateAssessmentItems({ sourceQuestions, grade }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      strategySummary: 'Fallback paraphrases generated because Anthropic is not configured.',
      items: fallbackItems(sourceQuestions),
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: ASSESSMENT_MODEL,
      max_tokens: 5000,
      system: 'You write mathematically correct student assessments. Output only valid JSON.',
      messages: [{ role: 'user', content: buildGenerationPrompt({ sourceQuestions, grade }) }],
    })

    const parsed = safeJsonParse(extractText(response))
    const rawItems = Array.isArray(parsed?.items) ? parsed.items : []
    const validItems = rawItems
      .filter((item) => item?.prompt && item?.expectedAnswer && item?.rubric)
      .slice(0, ASSESSMENT_ITEM_COUNT)

    if (validItems.length !== ASSESSMENT_ITEM_COUNT) {
      throw new Error('invalid assessment item count')
    }

    return {
      strategySummary: parsed.strategySummary || 'Generated from prior student questions.',
      items: validItems.map((item) => ({
        prompt: item.prompt,
        expectedAnswer: item.expectedAnswer,
        rubric: item.rubric,
        transferType: ['cross_topic_transfer', 'paraphrase', 'number_change'].includes(
          item.transferType
        )
          ? item.transferType
          : 'paraphrase',
        sourceIndex: Number(item.sourceIndex) || 1,
      })),
    }
  } catch (err) {
    console.error('[assessments] generation failed:', err)
    return {
      strategySummary: 'Fallback paraphrases generated because assessment generation failed.',
      items: fallbackItems(sourceQuestions),
    }
  }
}

async function createPendingAssessment(admin, userId, participant, now = new Date()) {
  const sourceQuestions = await fetchSourceQuestions(admin, userId)
  if (sourceQuestions.length === 0) {
    // Nothing to build a transfer test from yet — skip this cycle instead of
    // leaving the student permanently "due" (which would block the chat).
    const nextDueAt = await scheduleNextAssessment(admin, userId, now)
    return { assessment: null, items: [], unavailableReason: 'no_source_questions', nextDueAt }
  }

  const generated = await generateAssessmentItems({
    sourceQuestions,
    grade: participant?.grade,
  })

  const { data: assessment, error } = await admin
    .from('assessments')
    .insert({
      user_id: userId,
      status: 'pending',
      available_at: now.toISOString(),
      source_question_count: sourceQuestions.length,
      generation_model: ASSESSMENT_MODEL,
      generation_strategy_summary: generated.strategySummary,
    })
    .select('*')
    .single()

  if (error || !assessment) {
    const open = await fetchOpenAssessment(admin, userId)
    if (!open) return { assessment: null, items: [], unavailableReason: 'insert_failed' }
    return { assessment: open, items: await fetchAssessmentItems(admin, open.id) }
  }

  const itemRows = generated.items.map((item, index) => {
    const sourceIndex = Math.max(0, Math.min(sourceQuestions.length - 1, item.sourceIndex - 1))
    const source = sourceQuestions[sourceIndex]
    return {
      assessment_id: assessment.id,
      position: index + 1,
      prompt: item.prompt,
      expected_answer: item.expectedAnswer,
      rubric: item.rubric,
      transfer_type: item.transferType,
      source_question: source?.question || null,
      source_response: source?.response || null,
      source_asked_at: source?.asked_at || null,
    }
  })

  const { data: items } = await admin
    .from('assessment_items')
    .insert(itemRows)
    .select('id, assessment_id, position, prompt, transfer_type, created_at')

  return { assessment, items: items || [] }
}

// Cheap "is an assessment due right now?" check — no LLM generation, no writes
// beyond lazily seeding the schedule. Use this on hot paths (chat turns, status
// polling) to decide whether to surface the banner. Actual generation of the 10
// problems is deferred to startAssessment(), which only runs when the student
// opens the assessment.
async function isAssessmentDue(admin, userId, participant, now = new Date()) {
  const open = await fetchOpenAssessment(admin, userId)
  if (open) {
    return { due: true, open, nextDueAt: participant?.next_assessment_due_at ?? null }
  }

  const nextDueAt = await ensureAssessmentSchedule(admin, userId, participant, now)
  return {
    due: new Date(nextDueAt).getTime() <= now.getTime(),
    open: null,
    nextDueAt,
  }
}

async function maybeCreateDueAssessment(admin, userId, participant, now = new Date()) {
  const open = await fetchOpenAssessment(admin, userId)
  if (open) {
    return { assessment: open, items: await fetchAssessmentItems(admin, open.id) }
  }

  const nextDueAt = await ensureAssessmentSchedule(admin, userId, participant, now)
  if (new Date(nextDueAt).getTime() > now.getTime()) {
    return { assessment: null, items: [], nextDueAt }
  }

  return createPendingAssessment(admin, userId, participant, now)
}

async function startAssessment(admin, assessment, now = new Date()) {
  if (assessment.status === 'in_progress') {
    return assessment
  }

  const startedAt = now.toISOString()
  const dueAt = addMinutes(now, ASSESSMENT_DURATION_MINUTES).toISOString()

  const { data } = await admin
    .from('assessments')
    .update({
      status: 'in_progress',
      started_at: startedAt,
      due_at: dueAt,
      updated_at: startedAt,
    })
    .eq('id', assessment.id)
    .select('*')
    .single()

  return data || { ...assessment, status: 'in_progress', started_at: startedAt, due_at: dueAt }
}

async function expireAssessment(admin, assessment, now = new Date()) {
  if (assessment.status !== 'in_progress' || !assessment.due_at) return assessment
  if (new Date(assessment.due_at).getTime() >= now.getTime()) return assessment

  const nowIso = now.toISOString()
  const { data } = await admin
    .from('assessments')
    .update({ status: 'expired', completed_at: nowIso, updated_at: nowIso })
    .eq('id', assessment.id)
    .select('*')
    .single()

  await scheduleNextAssessment(admin, assessment.user_id, now)
  return data || { ...assessment, status: 'expired', completed_at: nowIso }
}

function buildEvaluationPrompt({ items, responses }) {
  const payload = items.map((item) => {
    const response = responses.find((r) => r.itemId === item.id)
    return {
      item_id: item.id,
      prompt: item.prompt,
      expected_answer: item.expected_answer,
      rubric: item.rubric,
      student_answer: response?.answer || '',
    }
  })

  return `Evaluate this assessment. For each item, assign correctness from 0 to 1.
Use the rubric and accept equivalent mathematical forms. Return only JSON:
{
  "results": [
    { "itemId": "uuid", "correctness": 0.75, "feedback": "brief evaluator note" }
  ]
}

Items:
${JSON.stringify(payload, null, 2)}`
}

async function evaluateResponses({ items, responses }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return responses.map((response) => ({
      itemId: response.itemId,
      correctness: 0,
      feedback: 'Not evaluated because Anthropic is not configured.',
    }))
  }

  try {
    const response = await anthropic.messages.create({
      model: ASSESSMENT_MODEL,
      max_tokens: 3000,
      system: 'You grade short math assessment answers. Output only valid JSON.',
      messages: [{ role: 'user', content: buildEvaluationPrompt({ items, responses }) }],
    })

    const parsed = safeJsonParse(extractText(response))
    const results = Array.isArray(parsed?.results) ? parsed.results : []

    return responses.map((studentResponse) => {
      const result = results.find((r) => r.itemId === studentResponse.itemId)
      return {
        itemId: studentResponse.itemId,
        correctness: normalizeCorrectness(result?.correctness),
        feedback: result?.feedback || '',
      }
    })
  } catch (err) {
    console.error('[assessments] evaluation failed:', err)
    return responses.map((response) => ({
      itemId: response.itemId,
      correctness: 0,
      feedback: 'Could not evaluate this response automatically.',
    }))
  }
}

function clampInt(value, min, max) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return null
  return Math.max(min, Math.min(max, n))
}

async function submitAssessment(
  admin,
  userId,
  assessmentId,
  responses,
  { allowPartial = false, selfReport = {}, now = new Date() } = {}
) {
  const { data: assessment } = await admin
    .from('assessments')
    .select('*')
    .eq('id', assessmentId)
    .eq('user_id', userId)
    .in('status', ['pending', 'in_progress'])
    .maybeSingle()

  if (!assessment) {
    return { error: 'Assessment not found.', status: 404 }
  }

  const items = await fetchAssessmentItems(admin, assessment.id, true)
  if (items.length !== ASSESSMENT_ITEM_COUNT) {
    return { error: 'Assessment is missing items.', status: 409 }
  }

  const normalizedResponses = items.map((item) => {
    const response = responses.find((r) => r.itemId === item.id)
    return {
      itemId: item.id,
      answer: String(response?.answer || '').trim(),
    }
  })

  // On a manual submit we require every problem answered. On a timeout auto-submit
  // (allowPartial) we accept blanks — an unanswered item simply scores 0, so the
  // transfer/calibration data from the answered items is still captured.
  if (!allowPartial && normalizedResponses.some((response) => !response.answer)) {
    return { error: 'Please answer every assessment problem before submitting.', status: 400 }
  }

  const evaluation = await evaluateResponses({ items, responses: normalizedResponses })
  const responseRows = normalizedResponses.map((response) => {
    const result = evaluation.find((r) => r.itemId === response.itemId)
    return {
      assessment_id: assessment.id,
      item_id: response.itemId,
      user_id: userId,
      answer: response.answer,
      correctness: result?.correctness ?? 0,
      evaluator_feedback: result?.feedback || '',
    }
  })

  await admin.from('assessment_responses').upsert(responseRows, {
    onConflict: 'assessment_id,item_id',
  })

  const score =
    responseRows.reduce((sum, row) => sum + Number(row.correctness || 0), 0) /
    ASSESSMENT_ITEM_COUNT

  // Self-report: one overall self-estimated score (how many of the 10 they think
  // they got), plus learning and difficulty ratings. Calibration is now the gap
  // between what they predicted and what they actually scored.
  const selfEstimatedCorrect = clampInt(selfReport.selfEstimatedCorrect, 0, ASSESSMENT_ITEM_COUNT)
  const selfEstimatedScore =
    selfEstimatedCorrect === null ? null : selfEstimatedCorrect / ASSESSMENT_ITEM_COUNT
  const selfRatedLearning = clampInt(selfReport.selfRatedLearning, 1, 5)
  const selfRatedDifficulty = clampInt(selfReport.selfRatedDifficulty, 1, 3)
  const calibrationError =
    selfEstimatedScore === null ? null : Math.abs(selfEstimatedScore - score)

  const nowIso = now.toISOString()
  const submittedLate = assessment.due_at
    ? new Date(assessment.due_at).getTime() < now.getTime()
    : false

  const { data: updated } = await admin
    .from('assessments')
    .update({
      status: 'submitted',
      completed_at: nowIso,
      submitted_late: submittedLate,
      score,
      self_estimated_score: selfEstimatedScore,
      self_rated_learning: selfRatedLearning,
      self_rated_difficulty: selfRatedDifficulty,
      calibration_error: calibrationError,
      updated_at: nowIso,
    })
    .eq('id', assessment.id)
    .select('*')
    .single()

  const nextDueAt = await scheduleNextAssessment(admin, userId, now)

  return {
    assessment: updated || assessment,
    score,
    selfEstimatedScore,
    selfRatedLearning,
    selfRatedDifficulty,
    calibrationError,
    submittedLate,
    nextDueAt,
    responses: responseRows.map((row) => ({
      itemId: row.item_id,
      correctness: row.correctness,
      feedback: row.evaluator_feedback,
    })),
  }
}

export {
  ASSESSMENT_DURATION_MINUTES,
  ASSESSMENT_ITEM_COUNT,
  expireAssessment,
  fetchAssessmentItems,
  fetchOpenAssessment,
  isAssessmentDue,
  maybeCreateDueAssessment,
  publicAssessment,
  scheduleNextAssessment,
  startAssessment,
  submitAssessment,
}
