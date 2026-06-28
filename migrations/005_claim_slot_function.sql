-- ============================================================
-- Atomic, race-safe slot claim. Run AFTER 004_seed_conditions.sql.
-- Returns the claimed slot + that slot's condition parameters,
-- or raises if the pool is exhausted (all 100 slots taken).
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
begin
  -- If this user already claimed a slot, return it (idempotent re-signup safety).
  select p.slot_id, p.condition_id into v_slot, v_cond
  from participants p where p.user_id = p_user_id;

  if v_slot is null then
    -- Grab ONE random open slot. FOR UPDATE SKIP LOCKED = concurrent
    -- signups can never grab the same row; the loser skips to the next.
    select s.slot_id into v_slot
    from condition_slots s
    where s.claimed_by is null
    order by random()
    for update skip locked
    limit 1;

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
