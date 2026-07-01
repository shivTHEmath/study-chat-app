alter table questions rename column created_at to asked_at;

-- Recreate the index to match the renamed column.
drop index if exists idx_questions_user_created;
create index if not exists idx_questions_user_asked on questions (user_id, asked_at);
