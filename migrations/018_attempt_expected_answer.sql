-- Ground-truth answer for the tutoring loop.
-- The model solves each problem once at problem start and the exact final
-- answer is stored here. Every follow-up turn judges the student's answer by
-- comparing against this stored value (accepting equivalent forms), instead of
-- silently re-deriving the whole problem on every turn — which caused correct
-- answers to be marked wrong and completed problems to be re-opened.
-- Never sent to the browser.

alter table problem_attempts
  add column if not exists expected_answer text;
