-- ============================================================
-- PRODUCTION RESET — run ONCE in the Supabase SQL editor before launch.
-- Wipes all test participant data, reopens condition slots, and sets the
-- assessment cadence to 2 hours. Preserves the experiment design
-- (conditions + condition_slots).
--
-- NOTE: auth.users lives in the `auth` schema; the truncate below does NOT
-- touch it, so it is deleted separately at the end.
-- ============================================================

begin;

-- 1. Wipe test participant data (children first; cascade covers the rest).
truncate table
  assessment_responses,
  assessment_items,
  assessments,
  problem_attempts,
  questions,
  survey_responses,
  consent_responses,
  participants
restart identity cascade;

-- 2. Reopen every condition slot (do NOT truncate conditions/condition_slots).
update condition_slots set claimed_by = null, claimed_at = null;

-- 3. Production assessment cadence: every 2 hours (was 10 minutes for testing).
alter table participants
  alter column next_assessment_due_at set default (now() + interval '2 hours');

commit;

-- 4. Remove test auth users (separate schema — not covered by truncate above).
delete from auth.users;

-- ── Verification (run after the above) ──────────────────────────────────────
-- select count(*) from auth.users;          -- expect 0
-- select count(*) from participants;         -- expect 0
-- select count(*) from conditions;           -- expect 25
-- select count(*) from condition_slots;      -- expect 100
-- select count(*) from condition_slots where claimed_by is not null;  -- expect 0
