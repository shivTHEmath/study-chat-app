import OpenAI from 'openai'

// Assessments recur every 7200 seconds (2 hours) of ENGAGEMENT — i.e. accrued
// cumulative_engaged_seconds — not wall-clock time. Overridable for testing.
const ASSESSMENT_INTERVAL_SECONDS = Number(process.env.ASSESSMENT_INTERVAL_SECONDS) || 7200
const ASSESSMENT_DURATION_MINUTES = 30
const ASSESSMENT_ITEM_COUNT = 10
const ASSESSMENT_MODEL =
  process.env.OPENAI_ASSESSMENT_MODEL ||
  process.env.OPENAI_MODEL ||
  'gpt-5.4-mini'

// Lazy singleton: the OpenAI SDK throws at construction when the key is
// missing, which would break the build during page-data collection.
let _openai = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

async function currentEngagedSeconds(admin, userId) {
  const { data } = await admin
    .from('participants')
    .select('cumulative_engaged_seconds')
    .eq('user_id', userId)
    .maybeSingle()
  return Number(data?.cumulative_engaged_seconds || 0)
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function extractText(response) {
  return (response.choices?.[0]?.message?.content ?? '').trim()
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

// Sets the engagement threshold at which the next assessment comes due.
// Thresholds are a FIXED LADDER of clean multiples of the interval — 7200,
// 14400, 21600, ... — anchored at 0 engaged seconds, not "current + interval".
// This snaps forward to the next rung on the ladder even if the student
// overshot the previous threshold (the gate is only checked at problem
// boundaries, so a long problem can carry them past it) — e.g. crossing 7200
// while at 7300 still schedules the next assessment at exactly 14400, not
// 14500. If a single boundary-free stretch overshoots by more than one whole
// interval, only the next rung is scheduled — a skipped interval is not
// retroactively assessed.
async function scheduleNextAssessment(admin, userId, cumulativeEngagedSeconds = 0) {
  const engaged = Number(cumulativeEngagedSeconds || 0)
  const nextDueSeconds =
    (Math.floor(engaged / ASSESSMENT_INTERVAL_SECONDS) + 1) * ASSESSMENT_INTERVAL_SECONDS
  await admin
    .from('participants')
    .update({ next_assessment_due_seconds: nextDueSeconds })
    .eq('user_id', userId)

  return nextDueSeconds
}

async function ensureAssessmentSchedule(admin, userId, participant) {
  if (participant?.next_assessment_due_seconds != null) {
    return Number(participant.next_assessment_due_seconds)
  }
  return scheduleNextAssessment(admin, userId, participant?.cumulative_engaged_seconds)
}

async function fetchSourceQuestions(admin, userId) {
  const { data } = await admin
    .from('questions')
    .select('question, response, asked_at')
    .eq('user_id', userId)
    .eq('phase', 'new_problem')
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

// Generous output budget: reasoning tokens count against this limit, and a
// starved budget truncates the JSON mid-item — the root cause of silent
// fallback assessments (10 items + rubrics at high reasoning need headroom).
const ASSESSMENT_GENERATION_MAX_TOKENS = 16000

function normalizeGeneratedItem(item) {
  return {
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
  }
}

// One generation round-trip. Returns however many complete, valid items the
// model produced (possibly fewer than requested if the output was truncated).
async function requestGeneratedItems(userPrompt) {
  const response = await getOpenAI().chat.completions.create({
    model: ASSESSMENT_MODEL,
    max_completion_tokens: ASSESSMENT_GENERATION_MAX_TOKENS,
    reasoning_effort: 'high',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You write mathematically correct student assessments. Output only valid JSON.' },
      { role: 'user', content: userPrompt },
    ],
  })

  const parsed = safeJsonParse(extractText(response))
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : []
  return {
    items: rawItems.filter((item) => item?.prompt && item?.expectedAnswer && item?.rubric),
    strategySummary: typeof parsed?.strategySummary === 'string' ? parsed.strategySummary : '',
  }
}

function buildTopUpPrompt({ sourceQuestions, grade, existingItems, missingCount }) {
  return `${buildGenerationPrompt({ sourceQuestions, grade })}

IMPORTANT ADJUSTMENT: A previous call already produced ${existingItems.length} of the ${ASSESSMENT_ITEM_COUNT} problems. Create exactly ${missingCount} NEW problems that do not duplicate or closely resemble any of these existing ones:

${JSON.stringify(existingItems.map((item) => item.prompt), null, 2)}

Return only JSON in the same shape, with exactly ${missingCount} items.`
}

async function generateAssessmentItems({ sourceQuestions, grade }) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      strategySummary: 'FALLBACK: paraphrases generated because OpenAI is not configured.',
      items: fallbackItems(sourceQuestions),
      usedFallback: true,
    }
  }

  try {
    // Round 1 — ask for the full set. Keep whatever valid items came back.
    const first = await requestGeneratedItems(buildGenerationPrompt({ sourceQuestions, grade }))
    let items = first.items.slice(0, ASSESSMENT_ITEM_COUNT)
    let toppedUp = false

    // Round 2 (salvage + top-up) — if short, keep the valid items and request
    // only the missing count, telling the model what already exists so it
    // doesn't duplicate. A smaller request also needs far fewer tokens, so it
    // is unlikely to hit the same truncation that shorted round 1.
    if (items.length < ASSESSMENT_ITEM_COUNT) {
      const missingCount = ASSESSMENT_ITEM_COUNT - items.length
      console.error(
        `[assessments] generation round 1 returned ${items.length}/${ASSESSMENT_ITEM_COUNT} items; requesting ${missingCount} more`
      )
      const topUp = await requestGeneratedItems(
        buildTopUpPrompt({ sourceQuestions, grade, existingItems: items, missingCount })
      )
      items = items.concat(topUp.items).slice(0, ASSESSMENT_ITEM_COUNT)
      toppedUp = true
    }

    if (items.length !== ASSESSMENT_ITEM_COUNT) {
      throw new Error(
        `invalid assessment item count after top-up: ${items.length}/${ASSESSMENT_ITEM_COUNT}`
      )
    }

    const summary = first.strategySummary || 'Generated from prior student questions.'
    return {
      strategySummary: toppedUp ? `${summary} (completed via top-up retry)` : summary,
      items: items.map(normalizeGeneratedItem),
      usedFallback: false,
    }
  } catch (err) {
    console.error('[assessments] generation failed (after top-up retry):', err)
    return {
      strategySummary: 'FALLBACK: verbatim source questions used because AI generation failed twice. Review this assessment before including it in analysis.',
      items: fallbackItems(sourceQuestions),
      usedFallback: true,
    }
  }
}

async function createPendingAssessment(admin, userId, participant, now = new Date()) {
  const sourceQuestions = await fetchSourceQuestions(admin, userId)
  if (sourceQuestions.length === 0) {
    // Nothing to build a transfer test from yet — skip this cycle instead of
    // leaving the student permanently "due" (which would block the chat).
    const nextDueSeconds = await scheduleNextAssessment(
      admin, userId, participant?.cumulative_engaged_seconds
    )
    return { assessment: null, items: [], unavailableReason: 'no_source_questions', nextDueSeconds }
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
// polling) to decide whether to surface the banner. Due-ness is measured against
// ENGAGEMENT: the student must have accrued cumulative_engaged_seconds up to the
// next_assessment_due_seconds threshold. Actual generation of the 10 problems is
// deferred to startAssessment(), which only runs when the student opens it.
async function isAssessmentDue(admin, userId, participant) {
  const open = await fetchOpenAssessment(admin, userId)
  if (open) {
    return { due: true, open, nextDueSeconds: participant?.next_assessment_due_seconds ?? null }
  }

  const nextDueSeconds = await ensureAssessmentSchedule(admin, userId, participant)
  const engaged = Number(participant?.cumulative_engaged_seconds || 0)
  return {
    due: engaged >= nextDueSeconds,
    open: null,
    nextDueSeconds,
  }
}

// True if the student has at least one genuine tutored problem (phase =
// new_problem) to build a transfer test from. General-inquiry exchanges and
// declined non-math requests don't count — they aren't problems the student
// worked through, so they shouldn't seed assessment questions. Cheap
// head-count query; no rows returned.
async function hasSourceQuestions(admin, userId) {
  const { count } = await admin
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('phase', 'new_problem')

  return Number(count || 0) > 0
}

// Boundary-aware gate. An assessment should block the student ONLY when:
//   • it is due (enough engaged time accrued, or an open one exists), AND
//   • it can actually be built (an open assessment exists, or there are prior
//     questions to generate from).
// If it's due but there's nothing to build a test from yet, we push the schedule
// out so the student is never stuck with a due-but-ungenerable assessment.
// This is called only at problem boundaries (starting/finishing a problem), so a
// due assessment never interrupts a student mid-problem.
async function assessmentGateStatus(admin, userId, participant) {
  const { due, open, nextDueSeconds } = await isAssessmentDue(admin, userId, participant)
  if (!due) return { block: false, open: null, nextDueSeconds }
  if (open) return { block: true, open, nextDueSeconds }

  if (await hasSourceQuestions(admin, userId)) {
    return { block: true, open: null, nextDueSeconds }
  }

  // Due but nothing to generate from — reschedule instead of blocking.
  const rescheduled = await scheduleNextAssessment(admin, userId, participant?.cumulative_engaged_seconds)
  return { block: false, open: null, nextDueSeconds: rescheduled }
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

  const nextDueSeconds = await ensureAssessmentSchedule(admin, userId, participant)
  const engaged = Number(participant?.cumulative_engaged_seconds || 0)
  if (engaged < nextDueSeconds) {
    return { assessment: null, items: [], nextDueSeconds }
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

  await scheduleNextAssessment(
    admin, assessment.user_id, await currentEngagedSeconds(admin, assessment.user_id)
  )
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
  if (!process.env.OPENAI_API_KEY) {
    return responses.map((response) => ({
      itemId: response.itemId,
      correctness: 0,
      feedback: 'Not evaluated because OpenAI is not configured.',
    }))
  }

  try {
    const response = await getOpenAI().chat.completions.create({
      model: ASSESSMENT_MODEL,
      max_completion_tokens: 10000,
      reasoning_effort: 'high',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You grade short math assessment answers. Output only valid JSON.' },
        { role: 'user', content: buildEvaluationPrompt({ items, responses }) },
      ],
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

  const nextDueSeconds = await scheduleNextAssessment(
    admin, userId, await currentEngagedSeconds(admin, userId)
  )

  return {
    assessment: updated || assessment,
    score,
    selfEstimatedScore,
    selfRatedLearning,
    selfRatedDifficulty,
    calibrationError,
    submittedLate,
    nextDueSeconds,
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
