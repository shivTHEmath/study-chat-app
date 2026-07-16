-- Durable login tracking.
-- The project's auth audit logs are not being written to the database
-- (dashboard setting), so login counts were unmeasurable: auth.sessions rows
-- are deleted on sign-out/idle-logout, and auth.users.last_sign_in_at only
-- keeps the most recent login. This table records one row per sign-in via a
-- trigger on auth.sessions inserts, and nothing ever deletes from it.
-- Service-role access only; never exposed to the browser.

create table if not exists login_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  logged_in_at timestamptz not null default now()
);

alter table login_events enable row level security;
-- No policies: anon/authenticated get nothing; service role bypasses RLS.

create index if not exists login_events_user_idx on login_events (user_id, logged_in_at);

create or replace function log_login_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into login_events (user_id, logged_in_at) values (new.user_id, new.created_at);
  return new;
end;
$$;

drop trigger if exists on_auth_session_created on auth.sessions;
create trigger on_auth_session_created
  after insert on auth.sessions
  for each row execute function log_login_event();
