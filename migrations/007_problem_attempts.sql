-- Problem-level state for the tutoring runtime.
-- This supports server-enforced hint delays, difficulty storage, and later MCP/fade logic.

create table if not exists problem_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  condition_id int references conditions(condition_id),
  original_problem text not null,
  display_problem text not null,
  difficulty int not null check (difficulty between 1 and 5),
  as_value numeric not null,
  ad_base_c numeric not null,
  mcp_value numeric not null,
  sfr_value numeric not null,
  hint_count int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table problem_attempts enable row level security;

create policy "Users can view own problem attempts" on problem_attempts
  for select using (auth.uid() = user_id);

create index if not exists idx_problem_attempts_user_created
  on problem_attempts (user_id, created_at desc);
