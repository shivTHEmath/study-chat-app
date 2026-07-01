-- Testing cadence: make assessments recur every 10 minutes instead of 2 hours.
-- This updates already-migrated Supabase databases where 012 may have set the
-- original two-hour default.

alter table participants
  alter column next_assessment_due_at set default (now() + interval '10 minutes');

update participants
set next_assessment_due_at = least(
  coalesce(next_assessment_due_at, now() + interval '10 minutes'),
  now() + interval '10 minutes'
);
