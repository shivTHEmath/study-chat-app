-- ============================================================
-- Engagement-weighted slot assignment. Replaces the uniform random
-- draw in 005_claim_slot_function.sql.
--
-- Motivation: by 2026-07-28 the pool had drifted badly. Twelve of the
-- twenty-five conditions had no participant who ever passed the 2-hour
-- engagement mark, while others already held 8-10h participants. A
-- uniform random draw over open slots cannot correct that -- it keeps
-- feeding the cells that are already healthy.
--
-- New behaviour: a signup is routed to the neediest condition that
-- still has an open slot, where "neediest" means no participant has
-- reached 2h of cumulative engaged time, ranked by weakest best
-- participant first (then lowest condition total). Within the winning
-- condition the slot is still picked at random, so slot identity stays
-- unpredictable.
--
-- Conditions whose slots are all claimed are skipped rather than
-- extended -- cell size stays at its designed n, so the balanced
-- design is preserved. (Conditions 9 and 23 fall in this bucket as of
-- this migration: under 2h across the board, but already at 3/3.)
--
-- Once every under-2h condition is either full or gone (i.e. someone
-- in each has crossed 2h), the function falls back to the original
-- uniform random draw over all remaining open slots.
--
-- The threshold is recomputed on every call, so a condition drops off
-- the priority list the moment one of its participants crosses 2h.
-- No list is frozen at migration time.
-- ============================================================

create or replace function claim_condition_slot(p_user_id uuid, p_username text)
returns table (
  slot_id int, condition_id int,
  as_value numeric, ad_base_c numeric, mcp_value numeric, sfr_value numeric
)
language plpgsql
security definer
as $$
declare
  v_slot int;
  v_cond int;
  -- 2 hours of cumulative engaged time, matching the assessment
  -- interval in 019_assessment_engagement_interval.sql.
  c_threshold_seconds constant numeric := 7200;
begin
  -- If this user already claimed a slot, return it (idempotent re-signup safety).
  select p.slot_id, p.condition_id into v_slot, v_cond
  from participants p where p.user_id = p_user_id;

  if v_slot is null then
    -- Priority pass: neediest under-threshold condition that has an open slot.
    -- FOR UPDATE OF s SKIP LOCKED still guarantees two concurrent signups can
    -- never take the same row; the loser falls through to the next-neediest.
    select s.slot_id into v_slot
    from condition_slots s
    join (
      select c.condition_id,
             coalesce(max(p.cumulative_engaged_seconds), 0) as max_secs,
             coalesce(sum(p.cumulative_engaged_seconds), 0) as total_secs
      from conditions c
      left join participants p on p.condition_id = c.condition_id
      group by c.condition_id
      having coalesce(max(p.cumulative_engaged_seconds), 0) < c_threshold_seconds
    ) need on need.condition_id = s.condition_id
    where s.claimed_by is null
    order by need.max_secs, need.total_secs, need.condition_id, random()
    for update of s skip locked
    limit 1;

    -- Fallback: no under-threshold condition has an open slot. Revert to the
    -- original uniform random draw so signups never hard-fail on a healthy pool.
    if v_slot is null then
      select s.slot_id into v_slot
      from condition_slots s
      where s.claimed_by is null
      order by random()
      for update skip locked
      limit 1;
    end if;

    if v_slot is null then
      raise exception 'STUDY_FULL: all condition slots are claimed';
    end if;

    update condition_slots
       set claimed_by = p_user_id, claimed_at = now()
     where condition_slots.slot_id = v_slot
    returning condition_slots.condition_id into v_cond;

    insert into participants (user_id, username, slot_id, condition_id)
    values (p_user_id, p_username, v_slot, v_cond);
  end if;

  return query
    select v_slot, v_cond, c.as_value, c.ad_base_c, c.mcp_value, c.sfr_value
    from conditions c where c.condition_id = v_cond;
end;
$$;
