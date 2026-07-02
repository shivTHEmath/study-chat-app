-- Each assessment item is either a short-answer problem (single unambiguous
-- answer, graded strictly correct/incorrect) or a deliberate proof/explanation
-- problem (graded against the rubric). Short-answer is the default and the vast
-- majority; proof is reserved for genuinely proof-based source material.

alter table assessment_items
  add column if not exists answer_format text not null default 'short_answer'
    check (answer_format in ('short_answer', 'proof'));
