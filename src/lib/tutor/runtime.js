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
  mcpAllowedThisTurn,
  mcpTarget,
  mcpGiven,
  mcpRemaining,
  mcpAwaitingAnswer,
  mcpReaskCount,
  conversation,
  verifiedAnswer,
  verifiedSolution,
}) {
  const safeCondition = condition || CENTER_CONDITION
  const isNewProblem = phase === 'new_problem'
  const canHint = Boolean(hintAllowed)

  // Ground-truth block: present only on follow-up turns for attempts that have
  // a stored answer (older attempts predate the column and fall back to the
  // model's own judgment).
  const verifiedAnswerBlock =
    !isNewProblem && verifiedAnswer
      ? `
Verified correct final answer (SERVER-SIDE GROUND TRUTH — NEVER reveal, quote, or state it to the student):
${verifiedAnswer}
${verifiedSolution ? `
Reference worked solution (SERVER-SIDE GROUND TRUTH — NEVER reveal, quote, or walk the student through it):
${verifiedSolution}
` : ''}
Use the verified answer${verifiedSolution ? ' and reference solution' : ''} SILENTLY, as your private reference. Never reveal, quote, or hint at ${verifiedSolution ? 'them' : 'it'}.

Hint-consistency rule — every hint MUST agree with this ground truth:
- Sanity-check any hint, strategy, or claim against it before you write it. Never suggest an approach or assert a property that contradicts it (e.g. do not suggest integer factoring or say the roots "look rational" when the verified answer is irrational; do not claim a nice closed form the verified answer lacks).
- If a technique would dead-end short of the verified answer, do not recommend it.

Step-verification rule — how to judge a step, method, or claim the student states:
- A student's step is CORRECT if it is mathematically valid AND consistent with eventually reaching the verified answer. This INCLUDES valid alternate methods that do not appear in the reference solution — judge the mathematics directly; never mark a correct step wrong just because it takes a different path than the reference.
- A student's step is INCORRECT if it is mathematically invalid or cannot lead to the verified answer. Explain the flaw in THEIR step specifically.

Final-answer judging rule — this overrides your own re-derivation:
- Do NOT re-solve the problem to decide whether their FINAL answer is right. Compare the student's final answer against the verified answer above.
- Accept mathematically equivalent forms (e.g. 1/2 = 0.5, x log x = \\(x\\log x\\), unsimplified but equal expressions, reordered solution sets).
- If the student's final answer matches: confirm it warmly, set isProblemComplete to true, and STOP tutoring this problem — no further questions, steps, or guidance beyond what the runtime instruction for this turn explicitly requires.
- If it does not match: they are incorrect, even if your own working suggests otherwise.
`
      : ''

  return `
Runtime tutoring context:

Student:
- Grade: ${grade || 'unknown middle-school grade'}
- Language preference: infer from the student's message

Current problem:
${problem}
${verifiedAnswerBlock}
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
- Hint reveal cap: none — hints escalate toward the answer but NEVER state the final answer or the last decisive step
- All hints exhausted: false (hints never run out; keep giving the next, closer one)
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
${getTurnInstruction({ isNewProblem, hintAllowed: canHint, hintRequestedButDelayed: Boolean(hintRequestedButDelayed), mcpAllowedThisTurn: Boolean(mcpAllowedThisTurn), mcpTarget: Number(mcpTarget || 0), mcpGiven: Number(mcpGiven || 0), mcpRemaining: Number(mcpRemaining || 0), difficulty: Number(difficulty || 3), mcpAwaitingAnswer: Boolean(mcpAwaitingAnswer), mcpReaskCount: Number(mcpReaskCount || 0) })}
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

function getTurnInstruction({ isNewProblem, hintAllowed, hintRequestedButDelayed, mcpAllowedThisTurn, mcpTarget, mcpGiven, mcpRemaining, difficulty, mcpAwaitingAnswer, mcpReaskCount }) {
  if (isNewProblem) {
    return [
      'The student has submitted a new problem.',
      'FIRST, judge whether the submission is genuinely a mathematics problem or mathematics topic.',
      'If it is NOT mathematics (trivia, another school subject, general chit-chat, anything else): set isMath to false, set displayProblem and expectedAnswer to empty strings, set difficulty to 1, and write a brief, warm message saying you can only help with mathematics here and inviting them to bring a math question instead (e.g. percentages, geometry, equations). Do not answer the non-math question, and do not comment on its content. All rules below apply only when isMath is true.',
      'First rewrite the submitted problem as a polished textbook-style math problem.',
      'Preserve the exact mathematical meaning and use LaTeX delimiters for all math.',
      'Estimate the difficulty from 1 to 5.',
      'Solve the problem internally (per Step 0 of your instructions) and put the exact final answer in expectedAnswer — the answer only (e.g. "x = 2", "x\\\\log x", "{-3, 3}"), no working. It is stored server-side as the ground truth for judging the student and is NEVER shown to them.',
      'Also put your concise, correct, step-by-step worked solution in the "solution" field — the key steps and results that lead to expectedAnswer (use LaTeX for math). This is stored server-side as the reference used to verify the student\'s steps on later turns; it is NEVER shown to the student. Make it correct and complete, not padded.',
      'THIS IS THE PRODUCTIVE FAILURE PERIOD.',
      'Do NOT give any hints, guidance, strategies, starting points, or directions of ANY kind.',
      'This is the strictest rule of this turn: your message must contain ZERO mathematical direction.',
      'Forbidden — do not say any of these or anything like them: "test small values", "look for a pattern", "try a few cases", "start by...", "think about...", "consider...", "notice...", naming any technique, concept, operation, or the variable structure.',
      'If your message would help the student even slightly decide HOW to begin, it is wrong. Remove it.',
      'Your message must be brief (1–2 sentences), warm, and purely a send-off to work independently — nothing more.',
      'Good (zero direction): "Nice problem! Give it a real try on your own first, then come back with what you find and we\'ll dig in together."',
      'Bad (contains direction): "Give it a try — test small values and see what patterns emerge." (this names a strategy — forbidden)',
      'Return only valid JSON in this exact shape:',
      '{"isMath":true,"displayProblem":"polished problem text","difficulty":3,"expectedAnswer":"exact final answer","solution":"concise correct step-by-step worked solution","message":"student-facing tutor response"}.',
    ].join(' ')
  }

  // Standalone Socratic questioning is disabled. The hint system now carries
  // the gentle, question-shaped guidance role; outside an allowed hint the
  // tutor only acknowledges and encourages. Exception: after telling a student a
  // step is wrong, a brief "what else could we try?" redirect is allowed (it
  // does not supply the next move) — see VERIFICATION_RULE.
  const NO_SOCRATIC = 'Do NOT ask any Socratic questions this turn. Do not ask the student what they have tried, where they are stuck, or any open-ended process question. (You MAY end a wrong-step correction with a brief invitation to consider a different approach, as long as you do not name the approach.)'

  // Verification is ALWAYS permitted, on every follow-up turn, independent of
  // whether a hint is allowed — telling the student whether their own step is
  // right or wrong is knowledge of results, not a hint. This is what lets the
  // tutor verify during the access delay without ever supplying the next move.
  const VERIFICATION_RULE = [
    'ALWAYS-ON VERIFICATION (independent of any hint permission this turn, including during the access delay):',
    'Check whether the student\'s message states a step, method, claim, or answer. If it does, tell them plainly whether it is CORRECT or INCORRECT, judged per the step-verification and final-answer rules in the ground-truth block.',
    'If INCORRECT: say clearly that it is not right and explain WHY their specific step fails, then you may briefly invite them to consider a different approach — but do NOT name the approach, technique, or next move.',
    'If CORRECT: affirm it warmly and encourage them to keep going in that direction — but do NOT reveal the next step.',
    'Verification is NOT a hint: it never supplies the next move, only judges the move the student already made. Set hintGiven to false for a verification unless this turn also independently permits and gives a hint.',
    'If the message contains no checkable step/claim/answer, do not force a verdict.',
  ].join(' ')

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
      'Even while waiting for the reflection, if their message states a step or answer you may still tell them whether it is correct or incorrect per the rule below — that is not "help", it is verification.',
      VERIFICATION_RULE,
      'Append the flags JSON as the final line. In addition to the usual fields, include "mcpAnswered": true/false and "mcpDropped": true/false.',
      FLAGS_NOTE,
    ].join(' ')
  }

  if (hintRequestedButDelayed) {
    return [
      'The student has asked for a hint, but they need to keep working independently right now.',
      'Do NOT give a hint, any concrete guidance, or mention anything about time or when a hint will be available.',
      'You MAY still verify a step or answer they stated (right/wrong + why) per the rule below — verification is not a hint.',
      'Otherwise respond with a brief, warm message telling them to keep working.',
      NO_SOCRATIC,
      VERIFICATION_RULE,
      mcpGuidance,
      FLAGS_NOTE,
    ].join(' ')
  }

  if (hintAllowed) {
    return [
      'First, apply the always-on verification rule below to any step or answer the student stated.',
      'Then, unless their message was purely an answer submission / request to check their work, a concrete hint is also allowed this turn and is your DEFAULT next move — the student does not need to have asked for one. Give only the next useful hint, calibrated to the answer specificity level, and set hintGiven to true. (If the message was purely a verification, do not add a proactive hint; set hintGiven to false.)',
      'VERIFY BEFORE HINTING: silently work the solution far enough to confirm your hint is mathematically true and actually leads to the verified ground-truth answer. Never assert a property of the problem (e.g. "it factors into integers", "the roots are rational", "the answer is a whole number") unless you have confirmed it from your own worked solution AND it is consistent with the ground truth. A hint that misstates the mathematics is worse than no hint.',
      'Use LaTeX delimiters for all math.',
      'Do not give the final answer or full solution.',
      'If the student has reached the correct final answer, set isProblemComplete to true.',
      'PRECEDENCE: if the metacognitive pacing below leads you to deliver a metacognitive prompt this turn, deliver that reflection INSTEAD of a concrete hint (set hintGiven to false and metacognitivePromptIncluded to true) — the hint can wait for a later turn. (Verification still happens either way.)',
      NO_SOCRATIC,
      VERIFICATION_RULE,
      mcpGuidance,
      FLAGS_NOTE,
    ].join(' ')
  }

  return [
    'A hint is NOT allowed this turn: do not provide a concrete hint, the next step, a strategy, the method to use, or the final answer — nothing that supplies the student\'s next move.',
    'But you MUST still verify: if the student stated a step or answer, tell them whether it is correct or incorrect (and why) per the rule below. This applies even during the access delay — verification is knowledge of results, not a hint.',
    'Beyond any verification, acknowledge their message warmly and encourage continued effort, without supplying the next move.',
    'If the student has stated the correct FINAL answer to the problem, set isProblemComplete to true.',
    NO_SOCRATIC,
    VERIFICATION_RULE,
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
