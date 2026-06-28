-- Allow consent to be recorded before an account exists.
-- session_id is a temporary client-generated UUID (sessionStorage), captured at
-- consent time. user_id is filled in later once signup completes, linking the
-- anonymous session to the real account.

alter table consent_responses
  alter column user_id drop not null;

alter table consent_responses
  add column if not exists session_id uuid,
  add column if not exists parent_name text,
  add column if not exists relationship text,
  add column if not exists student_name text;

create index if not exists idx_consent_responses_session_id
  on consent_responses (session_id);

-- Same treatment for survey_responses, since survey also happens pre-account.
alter table survey_responses
  alter column user_id drop not null;

alter table survey_responses
  add column if not exists session_id uuid;

create index if not exists idx_survey_responses_session_id
  on survey_responses (session_id);

-- RLS: pre-account inserts happen via the service_role key (server-side API routes),
-- which bypasses RLS entirely, so the existing policies for authenticated users
-- remain correct and unaffected. No policy changes needed.
