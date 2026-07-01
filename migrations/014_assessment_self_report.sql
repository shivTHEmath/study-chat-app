-- Move calibration from per-problem confidence to a single end-of-test self-report.
-- Students now estimate their overall score once, and rate their learning and the
-- test's difficulty. Per-item confidence is no longer collected.

alter table assessments
  add column if not exists self_estimated_score numeric,   -- fraction 0..1 they believe they got
  add column if not exists self_rated_learning int
    check (self_rated_learning between 1 and 5),            -- 1 = not at all, 5 = very well
  add column if not exists self_rated_difficulty int
    check (self_rated_difficulty between 1 and 3);          -- 1 = easy, 2 = medium, 3 = hard

-- Per-item confidence is optional now (kept for historical rows). The existing
-- "between 0 and 100" check still passes for NULL.
alter table assessment_responses
  alter column confidence drop not null;
