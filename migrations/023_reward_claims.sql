-- Reward claims: one per participant, created when they claim their 10-hour
-- completion reward (gift voucher + certificate). Fulfilled manually by the
-- study team: set fulfilled_at once the voucher/certificate has been sent.

create table if not exists reward_claims (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  parent_email text not null,
  parent_phone text not null,
  claimed_at   timestamptz default now(),
  fulfilled_at timestamptz
);

alter table reward_claims enable row level security;
create policy "Users can view own claim" on reward_claims
  for select using (auth.uid() = user_id);
