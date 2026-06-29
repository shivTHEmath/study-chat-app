// lib/tutor/metacognitivePrompting.js
//
// Decides whether a metacognitive prompt (MCP) should fire on this turn.
// Per §8 of BUILD_DECISIONS_HANDOFF.md — simple proportional controller,
// not a strict scheduler.
//
// MCP rate values used in this study: {0.25, 0.5, 1, 2, 4} prompts/problem.
//   mcp_value >= 1 → treat as a per-problem quota (fire up to round(mcp) times).
//   mcp_value  < 1 → fractional rate; fire at most once per problem, only if
//                    the cumulative delivered rate is below the target rate.

/**
 * @param {object} params
 * @param {number} params.mcpValue              - The participant's assigned MCP rate.
 * @param {number} params.promptsOnCurrentProblem - MCP prompts already given on this problem.
 * @param {number} params.totalPromptsGiven     - Cumulative MCP prompts given across all problems.
 * @param {number} params.problemsCompleted     - Problems fully completed so far (not counting current).
 * @returns {boolean}
 */
export function shouldFireMetacognitivePrompt({
  mcpValue,
  promptsOnCurrentProblem,
  totalPromptsGiven,
  problemsCompleted,
}) {
  const mcp = Number(mcpValue)

  if (!Number.isFinite(mcp) || mcp <= 0) return false

  if (mcp >= 1) {
    // Per-problem quota: fire up to round(mcp_value) times per problem.
    return Number(promptsOnCurrentProblem) < Math.round(mcp)
  }

  // Fractional rate: never more than once per problem in this regime.
  if (Number(promptsOnCurrentProblem) >= 1) return false

  // Fire if the actual delivered rate is below target.
  // Target is mcp_value prompts per problem, measured over problems seen so far
  // (current problem counts as problem #(problemsCompleted + 1)).
  const problemsSeen = Number(problemsCompleted) + 1
  const targetTotal = problemsSeen * mcp
  return Number(totalPromptsGiven) < targetTotal
}
