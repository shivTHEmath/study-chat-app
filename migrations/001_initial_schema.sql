-- participants
create table if not exists participants (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz default now()
);
alter table participants enable row level security;
create policy "Users can view own row" on participants
  for select using (auth.uid() = id);

-- consent_responses
create table if not exists consent_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  consent_given boolean not null,
  consent_text_version text not null default 'v1',
  parent_name text,
  relationship text,
  student_name text,
  created_at timestamptz default now()
);
alter table consent_responses enable row level security;
create index if not exists idx_consent_responses_session_id on consent_responses (session_id);

-- survey_responses
create table if not exists survey_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  responses jsonb not null,
  created_at timestamptz default now()
);
alter table survey_responses enable row level security;
create index if not exists idx_survey_responses_session_id on survey_responses (session_id);

-- questions (chat messages log)
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  question text not null,
  response text,
  created_at timestamptz default now()
);
alter table questions enable row level security;
create policy "Users can view own questions" on questions
  for select using (auth.uid() = user_id);
create policy "Users can insert own questions" on questions
  for insert with check (auth.uid() = user_id);
