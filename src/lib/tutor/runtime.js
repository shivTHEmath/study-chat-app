const CENTER_CONDITION = {
  condition_id: 1,
  as_value: 30,
  ad_base_c: 70,
  mcp_value: 1,
  sfr_value: 0.08,
}

export function getCenterCondition() {
  return CENTER_CONDITION
}

export function calculateInitialDelaySeconds(adBaseC, difficulty) {
  const a = Math.log(3) / 4
  return Math.round(Number(adBaseC) * Math.exp(a * (Number(difficulty) - 1)))
}

export function calculateMidProblemDelaySeconds(adBaseC, difficulty) {
  const a = Math.log(3) / 4
  return Math.round((Number(adBaseC) / 2) * Math.exp((a / 2) * (Number(difficulty) - 1)))
}

export function calculateFadeMultiplier(sfrValue, engagedHours = 0) {
  const completedHourlySteps = Math.max(0, Math.floor(Number(engagedHours)))
  const perStepRetention = 1 - Number(sfrValue)
  return Math.max(0, perStepRetention ** completedHourlySteps)
}

export function buildRuntimeContext({
  condition,
  grade,
  problem,
  phase,
  difficulty,
  hintAllowed,
  hintRequestedButDelayed,
  fullSolutionAllowed,
  secondsSinceProblemStarted,
  initialHintDelaySeconds,
  midProblemDelaySeconds,
  hintCount,
  maxHints,
  hintsExhausted,
  mcpAllowedThisTurn,
  mcpTarget,
  mcpGiven,
  mcpRemaining,
  mcpAwaitingAnswer,
  mcpReaskCount,
  conversation,
}) {
  const safeCondition = condition || CENTER_CONDITION
  const isNewProblem = phase === 'new_problem'
  const canHint = Boolean(hintAllowed)

  return `
Runtime tutoring context:

Student:
- Grade: ${grade || 'unknown middle-school grade'}
- Language preference: infer from the student's message

Current problem:
${problem}

Experiment condition:
- Answer specificity level: ${safeCondition.as_value}
- Base access delay: ${safeCondition.ad_base_c} seconds
- Metacognitive prompting rate: ${safeCondition.mcp_value} prompts per problem
- Scaffolding fade rate: ${safeCondition.sfr_value} per hour

Runtime state:
- Current phase: ${isNewProblem ? 'active' : phase}
- Estimated problem difficulty: ${difficulty || 'unknown'}
- Hint allowed this turn: ${canHint ? 'true' : 'false'}
- Hints given so far: ${Math.max(0, Number(hintCount || 0))}
- Max hints for this problem (80% cap): ${maxHints ?? 'not yet calculated'}
- All hints exhausted: ${hintsExhausted ? 'true' : 'false'}
- Full solution allowed: ${fullSolutionAllowed ? 'true' : 'false'}
- Seconds since problem started: ${Math.max(0, Math.round(secondsSinceProblemStarted || 0))}
- Initial hint delay required: ${initialHintDelaySeconds || 'not yet calculated'} seconds
- Mid-problem hint delay required: ${midProblemDelaySeconds || 'not yet calculated'} seconds
- Metacognitive prompts on this problem: ${Math.max(0, Number(mcpGiven || 0))} given, target ${mcpTarget ?? 0} total, ${Math.max(0, Number(mcpRemaining || 0))} remaining
- Metacognitive prompt allowed this turn: ${mcpAllowedThisTurn ? 'true' : 'false'}
- Awaiting answer to a previous metacognitive prompt: ${mcpAwaitingAnswer ? 'true' : 'false'}

Recent conversation:
${formatConversation(conversation)}

Instruction for this response:
${getTurnInstruction({ isNewProblem, hintAllowed: canHint, hintRequestedButDelayed: Boolean(hintRequestedButDelayed), hintsExhausted: Boolean(hintsExhausted), mcpAllowedThisTurn: Boolean(mcpAllowedThisTurn), mcpTarget: Number(mcpTarget || 0), mcpGiven: Number(mcpGiven || 0), mcpRemaining: Number(mcpRemaining || 0), difficulty: Number(difficulty || 3), mcpAwaitingAnswer: Boolean(mcpAwaitingAnswer), mcpReaskCount: Number(mcpReaskCount || 0) })}
`.trim()
}

// Flags JSON template appended as the absolute last line of every follow-up response.
// The model writes its prose message first, then this JSON on its own final line.
const FLAGS_TEMPLATE =
  '{"isProblemComplete":false,"hintGiven":false,"metacognitivePromptIncluded":false,"responseType":"Hint"}'

// Instruction appended to every follow-up turn telling the model the output format.
const FLAGS_NOTE = [
  'IMPORTANT: Write your student-facing response as normal prose.',
  'Then, on a NEW FINAL LINE (no text before or after it on that line), write ONLY this compact JSON',
  `(replace boolean values and responseType as appropriate): ${FLAGS_TEMPLATE}`,
  'responseType must be one of: "ProductiveFailure", "Hint", "Metacognitive", "Confirmation", "Redirect",',
  'or a comma-separated combination when multiple genuinely apply.',
  'The JSON line is consumed by the research system and never shown to the student.',
].join(' ')

function getTurnInstruction({ isNewProblem, hintAllowed, hintRequestedButDelayed, hintsExhausted, mcpAllowedThisTurn, mcpTarget, mcpGiven, mcpRemaining, difficulty, mcpAwaitingAnswer, mcpReaskCount }) {
  if (isNewProblem) {
    return [
      'The student has submitted a new problem.',
      'First rewrite the submitted problem as a polished textbook-style math problem.',
      'Preserve the exact mathematical meaning and use LaTeX delimiters for all math.',
      'Estimate the difficulty from 1 to 5.',
      'THIS IS THE PRODUCTIVE FAILURE PERIOD.',
      'Do NOT give any hints, guidance, strategies, starting points, or directions of ANY kind.',
      'This is the strictest rule of this turn: your message must contain ZERO mathematical direction.',
      'Forbidden — do not say any of these or anything like them: "test small values", "look for a pattern", "try a few cases", "start by...", "think about...", "consider...", "notice...", naming any technique, concept, operation, or the variable structure.',
      'If your message would help the student even slightly decide HOW to begin, it is wrong. Remove it.',
      'Your message must be brief (1–2 sentences), warm, and purely a send-off to work independently — nothing more.',
      'Good (zero direction): "Nice problem! Give it a real try on your own first, then come back with what you find and we\'ll dig in together."',
      'Bad (contains direction): "Give it a try — test small values and see what patterns emerge." (this names a strategy — forbidden)',
      'Return only valid JSON in this exact shape:',
      '{"displayProblem":"polished problem text","difficulty":3,"message":"student-facing tutor response"}.',
    ].join(' ')
  }

  // Standalone Socratic questioning is disabled. The hint system now carries
  // the gentle, question-shaped guidance role; outside an allowed hint the
  // tutor only acknowledges and encourages.
  const NO_SOCRATIC = 'Do NOT ask any Socratic questions this turn. Do not ask the student what they have tried, where they are stuck, or any open-ended process question.'

  // Metacognitive prompt pacing. The server enforces the budget (mcpRemaining
  // can never exceed the assigned rate), but the AI chooses WHEN to place the
  // remaining prompts — predicting how much longer the conversation will run
  // and spreading them so the delivered count lands on the target, evenly.
  const mcpGuidance = mcpAllowedThisTurn
    ? [
        `METACOGNITIVE PACING: You have ${mcpRemaining} metacognitive prompt(s) left to deliver on this problem (target ${mcpTarget} total for the whole problem; ${mcpGiven} already given).`,
        `Predict how much longer this conversation is likely to last from the problem's difficulty (${difficulty}/5) and how the student is progressing, then decide whether NOW is the right moment for one so that your remaining prompts end up spread evenly across the rest of the conversation — not clustered at the start or all at once.`,
        'You MUST deliver every remaining prompt before the problem is finished: if the student looks close to the final answer or the problem is about to wrap up, deliver the remaining prompt(s) now (an Answer/Solution Justification prompt fits well at the end).',
        'If you include a metacognitive prompt this turn, weave it in naturally and set metacognitivePromptIncluded to true; if the timing is not right yet, set it to false.',
        `Never deliver more than ${mcpRemaining} this turn, and never exceed the per-problem target of ${mcpTarget}.`,
      ].join(' ')
    : 'Do NOT include a metacognitive prompt this turn. Set metacognitivePromptIncluded to false.'

  // Highest priority: a metacognitive prompt from a previous turn is still
  // unanswered. Withhold further support until the student engages with it —
  // but back off if they are resistant, and never push more than ~3 times.
  if (mcpAwaitingAnswer) {
    const nearingLimit = Number(mcpReaskCount || 0) >= 2
    return [
      'A metacognitive prompt was asked on a previous turn and has NOT yet been answered.',
      'First, judge whether the student\'s current message genuinely answers that metacognitive prompt (a real attempt to reflect, even a brief one, counts as answered).',
      'If it DOES answer it: acknowledge their reflection warmly in one sentence, set mcpAnswered to true, and then continue helping with whatever they need this turn.',
      'If it does NOT answer it (they ignored it, changed the subject, or asked for something else): do NOT provide any hint, solution, or other help this turn.',
      'Instead, gently but firmly tell them you need them to answer the reflection question before you can support them further, and restate the question briefly. Set mcpAnswered to false.',
      nearingLimit
        ? 'IMPORTANT: You have already asked more than once. If the student seems uncomfortable, resistant, or unable to answer, do NOT push again — let it go, set mcpDropped to true, briefly reassure them, and continue helping normally this turn.'
        : 'If the student explicitly says they are not comfortable answering or cannot answer, do not force it — set mcpDropped to true, reassure them briefly, and continue helping this turn.',
      'Keep your message short and warm, never scolding.',
      'Append the flags JSON as the final line. In addition to the usual fields, include "mcpAnswered": true/false and "mcpDropped": true/false.',
      FLAGS_NOTE,
    ].join(' ')
  }

  if (hintRequestedButDelayed) {
    return [
      'The student has asked for a hint, but they need to keep working independently right now.',
      'Do NOT give a hint, any concrete guidance, or mention anything about time or when a hint will be available.',
      'Respond with a brief, warm message telling them to keep working.',
      NO_SOCRATIC,
      mcpGuidance,
      FLAGS_NOTE,
    ].join(' ')
  }

  if (hintsExhausted) {
    return [
      'All hints for this problem have been given (80% solution cap reached).',
      'Do NOT provide any further hints.',
      'Respond with brief, warm encouragement only.',
      'If the student has now arrived at the correct answer, set isProblemComplete to true.',
      NO_SOCRATIC,
      mcpGuidance,
      FLAGS_NOTE,
    ].join(' ')
  }

  if (hintAllowed) {
    return [
      'A concrete hint is now allowed.',
      'Give only the next useful hint, calibrated to the answer specificity level.',
      'Use LaTeX delimiters for all math.',
      'Do not give the final answer or full solution. Set hintGiven to true.',
      'If this hint leads the student to the correct answer, set isProblemComplete to true.',
      NO_SOCRATIC,
      mcpGuidance,
      FLAGS_NOTE,
    ].join(' ')
  }

  return [
    'Respond to the student. Do not provide a concrete hint or final answer.',
    'Acknowledge their message and encourage continued effort.',
    'If the student has now arrived at the correct answer, set isProblemComplete to true.',
    NO_SOCRATIC,
    mcpGuidance,
    FLAGS_NOTE,
  ].join(' ')
}

function formatConversation(conversation = []) {
  if (!Array.isArray(conversation) || conversation.length === 0) {
    return '(none yet)'
  }

  return conversation
    .slice(-8)
    .map((message) => {
      const role = message.role === 'user' ? 'Student' : 'Tutor'
      return `${role}: ${String(message.text || '').trim()}`
    })
    .join('\n')
}
