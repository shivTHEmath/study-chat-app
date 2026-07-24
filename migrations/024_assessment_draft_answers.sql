-- Server-side draft of in-progress assessment answers.
-- Answers previously lived only in browser state and reached the server just
-- once, at submit. If the tab closed / disconnected / slept before the deadline,
-- the timer auto-submit never fired and everything typed was lost — the
-- assessment expired with zero saved responses.
-- This holds a debounced autosave of the student's in-progress answers,
-- keyed by item id ({ "<itemId>": "answer text", ... }), so a reopened
-- assessment can be restored. Cleared on submit. Purely a recovery/resume aid:
-- grading still runs only on submit from assessment_responses.
-- Never used for scoring.

alter table assessments
  add column if not exists draft_answers jsonb;
