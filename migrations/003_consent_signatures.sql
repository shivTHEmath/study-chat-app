-- Capture the additional consent-form fields: the child's name (kept separate
-- from research data, deleted on a set schedule) and typed signatures from the
-- parent/guardian and the student.

alter table consent_responses
  add column if not exists child_name text,
  add column if not exists parent_signature text,
  add column if not exists student_signature text;
