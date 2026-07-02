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

  if (!data) return null

  // Self-heal: an open assessment must have all its problems. If a prior
  // generation failed and left it problemless (or short), it's unusable — it
  // would block new assessments and show an empty test. Delete it and report
  // "no open assessment" so a fresh, complete one gets built.
  const { count } = await admin
    .from('assessment_items')
    .select('id', { count: 'exact', head: true })
    .eq('assessment_id', data.id)

  if (Number(count || 0) !== ASSESSMENT_ITEM_COUNT) {
    console.error(`[assessments] deleting incomplete assessment ${data.id} (${count ?? 0} items)`)
    await admin.from('assessments').delete().eq('id', data.id)
    return null
  }

  return data
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

ANSWER FORMAT — this is the most important rule:
- Almost every problem MUST be short-answer: it has ONE unambiguous, objectively checkable final answer — a number, an expression, a set of solutions, a coordinate, a ratio, etc. Examples of good asks: "Solve for x: 2x = 4", "Evaluate ...", "Factor ...", "Find the value of ...", "What is the slope of ...". Set answerFormat to "short_answer" for these.
- The point is that grading must be objective: a grader should be able to mark it right or wrong by comparing the student's final answer to the answer key, with zero subjective judgement.
- Do NOT write "explain", "describe", "why", "justify", or "show your reasoning" prompts. Do NOT write open-ended prompts that could have many acceptable phrasings.
- The ONLY exception: if the student's prior questions below are themselves genuinely proof-based or explanation-based, you may write matching proof problems — set answerFormat to "proof" for those, and keep them rare. If the source work is ordinary computation/algebra, use ZERO proof problems.

STYLE:
- No multi-part questions. One ask per problem.
- Keep every prompt to 3 sentences or fewer.

CONTENT requirements:
- Create exactly ${ASSESSMENT_ITEM_COUNT} problems.
- Each problem must be solvable within the student's apparent current knowledge and difficulty level.
- Prefer creative cross-topic transfer when safe. Use paraphrase next. Use number changes only as a last resort.
- Run these checks silently for every item: current-knowledge solvable, suitable difficulty, UNIQUE unambiguous answer, mathematical correctness, 3 sentences or fewer.
- Avoid long story problems. Avoid requiring facts not contained in the prompt or ordinary school knowledge.
- Use the student's prior questions below as the source data.

For expectedAnswer, give the exact final answer only (e.g. "x = 2", "{-3, 3}", "y = 2x + 1"). For rubric, state the acceptable equivalent forms (e.g. "accept 0.5, 1/2, or ½").

Return only JSON with this shape:
{
  "strategySummary": "one sentence",
  "items": [
    {
      "prompt": "student-facing problem",
      "expectedAnswer": "the exact final answer only",
      "rubric": "acceptable equivalent forms of the answer",
      "answerFormat": "short_answer|proof",
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
      prompt: `Solve this problem and give only the final answer: ${source.question}`,
      expectedAnswer: 'The correct final answer to the original problem.',
      rubric: 'Mark correct if the final answer matches the original problem\'s solution; accept mathematically equivalent forms.',
      answerFormat: 'short_answer',
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
        answerFormat: item.answerFormat === 'proof' ? 'proof' : 'short_answer',
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
      answer_format: item.answerFormat === 'proof' ? 'proof' : 'short_answer',
      transfer_type: item.transferType,
      source_question: source?.question || null,
      source_response: source?.response || null,
      source_asked_at: source?.asked_at || null,
    }
  })

  const { data: items, error: itemsError } = await admin
    .from('assessment_items')
    .insert(itemRows)
    .select('id, assessment_id, position, prompt, transfer_type, created_at')

  // If the items failed to insert (or came back short), do NOT leave a
  // problemless assessment behind — it would block new ones and can't be
  // submitted. Delete it and report the failure so the caller can reschedule.
  if (itemsError || !items || items.length !== ASSESSMENT_ITEM_COUNT) {
    console.error(
      '[assessments] item insert failed:',
      itemsError?.message || `expected ${ASSESSMENT_ITEM_COUNT}, got ${items?.length ?? 0}`
    )
    await admin.from('assessments').delete().eq('id', assessment.id)
    return { assessment: null, items: [], unavailableReason: 'items_insert_failed' }
  }

  return { assessment, items }
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

// True if the student has at least one logged question to build a transfer test
// from. Cheap head-count query; no rows returned.
async function hasSourceQuestions(admin, userId) {
  const { count } = await admin
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  return Number(count || 0) > 0
}

// Boundary-aware gate. An assessment should block the student ONLY when:
//   • it is due (time elapsed or an open one exists), AND
//   • it can actually be built (an open assessment exists, or there are prior
//     questions to generate from).
// If it's due but there's nothing to build a test from yet, we push the schedule
// out so the student is never stuck with a due-but-ungenerable assessment.
// This is called only at problem boundaries (starting/finishing a problem), so a
// due assessment never interrupts a student mid-problem.
async function assessmentGateStatus(admin, userId, participant, now = new Date()) {
  const { due, open, nextDueAt } = await isAssessmentDue(admin, userId, participant, now)
  if (!due) return { block: false, open: null, nextDueAt }
  if (open) return { block: true, open, nextDueAt }

  if (await hasSourceQuestions(admin, userId)) {
    return { block: true, open: null, nextDueAt }
  }

  // Due but nothing to generate from — reschedule instead of blocking.
  const rescheduled = await scheduleNextAssessment(admin, userId, now)
  return { block: false, open: null, nextDueAt: rescheduled }
}

async function maybeCreateDueAssessment(admin, userId, participant, now = new Date()) {
  const open = await fetchOpenAssessment(admin, userId)
  if (open) {
    const items = await fetchAssessmentItems(admin, open.id)
    // A healthy open assessment has all its problems — reuse it.
    if (items.length === ASSESSMENT_ITEM_COUNT) {
      return { assessment: open, items }
    }
    // Otherwise it's a stuck/empty assessment from an earlier failed generation.
    // Delete it so we can build a fresh, complete one below.
    console.error(`[assessments] clearing incomplete open assessment ${open.id} (${items.length} items)`)
    await admin.from('assessments').delete().eq('id', open.id)
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
      answer_format: item.answer_format || 'short_answer',
      student_answer: response?.answer || '',
    }
  })

  return `Grade this math assessment objectively. Each item has an answer_format.

For answer_format = "short_answer":
- Grade STRICTLY right or wrong. correctness MUST be exactly 1 or exactly 0. Never award partial credit.
- Give 1 only if the student's FINAL answer equals the expected_answer, allowing mathematically equivalent forms (e.g. 1/2 = 0.5 = 0.50, x=2 same as "2", {-3,3} same as "3, -3", unsimplified equivalents). Otherwise give 0.
- Judge ONLY the final answer. Ignore wording, presentation, and whether they showed work. A blank or missing answer is 0.

For answer_format = "proof":
- Use the rubric; correctness may be any value from 0 to 1.

Return only JSON:
{
  "results": [
    { "itemId": "uuid", "correctness": 1, "feedback": "brief note" }
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
      const item = items.find((i) => i.id === studentResponse.itemId)
      let correctness = normalizeCorrectness(result?.correctness)
      // Short-answer items are strictly binary — snap to 0 or 1 so grading has
      // zero partial-credit subjectivity, even if the model returned a fraction.
      if ((item?.answer_format || 'short_answer') !== 'proof') {
        correctness = correctness >= 0.5 ? 1 : 0
      }
      return {
        itemId: studentResponse.itemId,
        correctness,
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
  assessmentGateStatus,
  expireAssessment,
  fetchAssessmentItems,
  fetchOpenAssessment,
  hasSourceQuestions,
  isAssessmentDue,
  maybeCreateDueAssessment,
  publicAssessment,
  scheduleNextAssessment,
  startAssessment,
  submitAssessment,
}
