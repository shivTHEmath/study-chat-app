-- Extend the questions table to capture the full chat exchange context.
-- All columns are nullable so existing rows are unaffected.

alter table questions
  add column if not exists student_message text,
  add column if not exists attempt_id      uuid references problem_attempts(id) on delete set null,
  add column if not exists phase           text,
  add column if not exists tokens_in       int,
  add column if not exists tokens_out      int;

-- Index for the two most common research queries:
--   1. All messages for a given attempt (conversation replay)
--   2. All messages for a given user ordered by time
create index if not exists idx_questions_attempt_id on questions (attempt_id);
create index if not exists idx_questions_user_created on questions (user_id, created_at);
