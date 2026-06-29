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
  fullSolutionAllowed,
  secondsSinceProblemStarted,
  initialHintDelaySeconds,
  midProblemDelaySeconds,
  hintCount,
  metacognitivePromptDue,
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
- Current phase: ${isNewProblem ? 'active_socratic' : phase}
- Estimated problem difficulty: ${difficulty || 'unknown'}
- Hint allowed: ${canHint ? 'true' : 'false'}
- Full solution allowed: ${fullSolutionAllowed ? 'true' : 'false'}
- Seconds since problem started: ${Math.max(0, Math.round(secondsSinceProblemStarted || 0))}
- Initial hint delay required: ${initialHintDelaySeconds || 'not yet calculated'} seconds
- Mid-problem hint delay required: ${midProblemDelaySeconds || 'not yet calculated'} seconds
- Hint number already given: ${Math.max(0, Number(hintCount || 0))}
- Metacognitive prompt due: ${metacognitivePromptDue ? 'true' : 'false'}

Recent conversation:
${formatConversation(conversation)}

Instruction for this response:
${getTurnInstruction({ isNewProblem, hintAllowed: canHint })}
`.trim()
}

function getTurnInstruction({ isNewProblem, hintAllowed }) {
  if (isNewProblem) {
    return [
      'The student has submitted a new problem.',
      'First rewrite the submitted problem as a polished textbook-style math problem.',
      'Preserve the exact mathematical meaning and use LaTeX delimiters for all math.',
      'Estimate the difficulty from 1 to 5.',
      'Do not provide a concrete hint yet.',
      'Give a short Socratic response that helps the student identify what the problem is asking',
      'and choose a starting point.',
      'Return only valid JSON in this exact shape:',
      '{"displayProblem":"polished problem text","difficulty":3,"message":"student-facing tutor response"}.',
    ].join(' ')
  }

  if (hintAllowed) {
    return [
      'A concrete hint is now allowed.',
      'Give only the next useful hint, calibrated to the answer specificity level.',
      'Use LaTeX delimiters for all math.',
      'Do not give the final answer or full solution.',
    ].join(' ')
  }

  return [
    'Respond to the student within the current no-hint phase.',
    'Do not provide a concrete hint or final answer.',
    'Use Socratic guidance to help the student make progress independently.',
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
