-- Assessment cadence is now measured in ENGAGEMENT time, not wall-clock time.
-- An assessment becomes due once the participant has accrued another 7200
-- seconds (2 hours) of cumulative_engaged_seconds — see src/lib/assessments.js.
--
-- Replaces the old wall-clock `next_assessment_due_at` timestamp with a
-- `next_assessment_due_seconds` threshold compared against
-- cumulative_engaged_seconds. The old column is left in place (unused) so this
-- migration is non-destructive and reversible.

alter table participants
  add column if not exists next_assessment_due_seconds bigint not null default 7200;

-- Seed existing rows so nobody is instantly due: the next assessment lands
-- 7200 engaged seconds from wherever each participant is right now.
update participants
set next_assessment_due_seconds = coalesce(cumulative_engaged_seconds, 0) + 7200;
