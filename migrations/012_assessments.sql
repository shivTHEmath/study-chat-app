-- Assessments: 10 generated transfer/calibration problems every 2 hours.
-- Assessments become available only between problems. Starting one opens a
-- 30-minute window; submissions store both performance and confidence.

alter table participants
  add column if not exists next_assessment_due_at timestamptz
    default (now() + interval '2 hours');

update participants
set next_assessment_due_at = now() + interval '2 hours'
where next_assessment_due_at is null;

create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'submitted', 'expired')),
  available_at timestamptz not null default now(),
  started_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  submitted_late boolean not null default false,
  source_question_count int not null default 0,
  generation_model text,
  generation_strategy_summary text,
  score numeric,
  mean_confidence numeric,
  calibration_error numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_assessments_one_open_per_user
  on assessments (user_id)
  where status in ('pending', 'in_progress');

create index if not exists idx_assessments_user_created
  on assessments (user_id, created_at desc);

alter table assessments enable row level security;

create policy "Users manage own assessments" on assessments
  for all using (auth.uid() = user_id);

create table if not exists assessment_items (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  position int not null check (position between 1 and 10),
  prompt text not null,
  expected_answer text not null,
  rubric text not null,
  transfer_type text not null
    check (transfer_type in ('cross_topic_transfer', 'paraphrase', 'number_change')),
  source_question text,
  source_response text,
  source_asked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assessment_id, position)
);

create index if not exists idx_assessment_items_assessment_position
  on assessment_items (assessment_id, position);

alter table assessment_items enable row level security;

create policy "Users manage own assessment items" on assessment_items
  for all using (
    exists (
      select 1 from assessments
      where assessments.id = assessment_items.assessment_id
        and assessments.user_id = auth.uid()
    )
  );

create table if not exists assessment_responses (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  item_id uuid not null references assessment_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer text not null,
  confidence int not null check (confidence between 0 and 100),
  correctness numeric check (correctness between 0 and 1),
  evaluator_feedback text,
  created_at timestamptz not null default now(),
  unique (assessment_id, item_id)
);

create index if not exists idx_assessment_responses_user_created
  on assessment_responses (user_id, created_at desc);

alter table assessment_responses enable row level security;

create policy "Users manage own assessment responses" on assessment_responses
  for all using (auth.uid() = user_id);
