-- Tracks whether a metacognitive prompt is awaiting a student answer, and how
-- many times we've re-asked. Used to enforce that students engage with MCPs
-- (re-ask if ignored) without pushing more than 2–3 times if they're resistant.

ALTER TABLE problem_attempts
  ADD COLUMN IF NOT EXISTS mcp_awaiting_answer boolean NOT NULL DEFAULT false;

ALTER TABLE problem_attempts
  ADD COLUMN IF NOT EXISTS mcp_reask_count int NOT NULL DEFAULT 0;
