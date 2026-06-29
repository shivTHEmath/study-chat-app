-- Adds the per-problem metacognitive prompt counter that was missing from 007.
-- Also adds the total counter on participants used by shouldFireMetacognitivePrompt.

ALTER TABLE problem_attempts
  ADD COLUMN IF NOT EXISTS metacognitive_prompt_count int NOT NULL DEFAULT 0;

ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS total_metacognitive_prompts_given int NOT NULL DEFAULT 0;
