-- Ground-truth WORKED SOLUTION for the tutoring loop.
-- Alongside expected_answer (the final answer), the strong solver produces a
-- concise step-by-step solution at problem start, stored here. Follow-up turns
-- use it SILENTLY as the reference for step-level verification — telling the
-- student whether a proposed step/method is correct or incorrect (and why),
-- without re-deriving from scratch on the weaker follow-up model.
-- Never sent to the browser; never revealed to the student.

alter table problem_attempts
  add column if not exists expected_solution text;
