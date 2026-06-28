-- ============================================================
-- Run this ONE file to fix everything in one shot.
-- Handles: old participants schema (id → user_id rename),
-- creates conditions + condition_slots tables, seeds them,
-- and creates the claim_condition_slot() function.
-- Safe to re-run (idempotent).
-- ============================================================

-- 1. Rename participants.id → user_id if the old schema is in place
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participants' AND column_name = 'id'
  ) THEN
    ALTER TABLE participants RENAME COLUMN id TO user_id;
  END IF;
END $$;

-- 2. Add missing columns to participants (slot/condition/consented_at)
ALTER TABLE participants ADD COLUMN IF NOT EXISTS consented_at timestamptz;

-- 3. Create conditions table
CREATE TABLE IF NOT EXISTS conditions (
  condition_id int PRIMARY KEY,
  as_coded int NOT NULL, ad_coded int NOT NULL,
  mcp_coded int NOT NULL, sfr_coded int NOT NULL,
  as_value numeric NOT NULL,
  ad_base_c numeric NOT NULL,
  mcp_value numeric NOT NULL,
  sfr_value numeric NOT NULL,
  is_center boolean NOT NULL DEFAULT false
);

-- 4. Create condition_slots table
CREATE TABLE IF NOT EXISTS condition_slots (
  slot_id      int PRIMARY KEY,
  condition_id int NOT NULL REFERENCES conditions(condition_id),
  claimed_by   uuid REFERENCES auth.users(id),
  claimed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_slots_open ON condition_slots (slot_id) WHERE claimed_by IS NULL;

-- 5. Add FK columns to participants now that conditions/slots exist
ALTER TABLE participants ADD COLUMN IF NOT EXISTS slot_id int REFERENCES condition_slots(slot_id);
ALTER TABLE participants ADD COLUMN IF NOT EXISTS condition_id int REFERENCES conditions(condition_id);

-- 6. Seed conditions (25)
INSERT INTO conditions VALUES (1,0,0,0,0,30,70,1.0,0.08,true) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (2,-1,-1,-1,-1,18,53,0.5,0.0566,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (3,-1,-1,-1,1,18,53,0.5,0.113,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (4,-1,-1,1,-1,18,53,2.0,0.0566,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (5,-1,-1,1,1,18,53,2.0,0.113,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (6,-1,1,-1,-1,18,92,0.5,0.0566,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (7,-1,1,-1,1,18,92,0.5,0.113,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (8,-1,1,1,-1,18,92,2.0,0.0566,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (9,-1,1,1,1,18,92,2.0,0.113,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (10,1,-1,-1,-1,42,53,0.5,0.0566,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (11,1,-1,-1,1,42,53,0.5,0.113,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (12,1,-1,1,-1,42,53,2.0,0.0566,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (13,1,-1,1,1,42,53,2.0,0.113,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (14,1,1,-1,-1,42,92,0.5,0.0566,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (15,1,1,-1,1,42,92,0.5,0.113,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (16,1,1,1,-1,42,92,2.0,0.0566,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (17,1,1,1,1,42,92,2.0,0.113,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (18,-2,0,0,0,6,70,1.0,0.08,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (19,2,0,0,0,54,70,1.0,0.08,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (20,0,-2,0,0,30,40,1.0,0.08,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (21,0,2,0,0,30,121,1.0,0.08,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (22,0,0,-2,0,30,70,0.25,0.08,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (23,0,0,2,0,30,70,4.0,0.08,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (24,0,0,0,-2,30,70,1.0,0.04,false) ON CONFLICT DO NOTHING;
INSERT INTO conditions VALUES (25,0,0,0,2,30,70,1.0,0.16,false) ON CONFLICT DO NOTHING;

-- 7. Seed condition_slots (100, shuffled, seed=42)
INSERT INTO condition_slots (slot_id, condition_id) VALUES (1,6) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (2,6) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (3,23) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (4,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (5,14) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (6,9) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (7,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (8,16) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (9,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (10,18) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (11,17) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (12,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (13,11) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (14,11) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (15,16) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (16,7) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (17,8) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (18,23) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (19,18) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (20,5) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (21,2) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (22,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (23,3) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (24,24) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (25,19) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (26,9) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (27,20) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (28,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (29,21) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (30,3) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (31,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (32,8) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (33,12) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (34,13) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (35,17) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (36,7) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (37,25) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (38,10) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (39,21) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (40,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (41,4) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (42,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (43,5) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (44,6) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (45,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (46,14) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (47,13) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (48,12) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (49,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (50,4) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (51,25) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (52,8) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (53,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (54,9) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (55,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (56,5) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (57,12) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (58,15) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (59,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (60,13) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (61,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (62,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (63,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (64,15) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (65,20) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (66,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (67,19) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (68,7) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (69,22) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (70,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (71,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (72,24) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (73,11) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (74,23) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (75,10) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (76,22) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (77,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (78,16) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (79,20) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (80,18) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (81,14) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (82,2) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (83,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (84,22) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (85,25) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (86,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (87,10) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (88,17) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (89,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (90,15) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (91,21) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (92,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (93,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (94,2) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (95,3) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (96,4) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (97,24) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (98,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (99,1) ON CONFLICT DO NOTHING;
INSERT INTO condition_slots (slot_id, condition_id) VALUES (100,19) ON CONFLICT DO NOTHING;

-- 8. Create the atomic slot-claim function
CREATE OR REPLACE FUNCTION claim_condition_slot(p_user_id uuid, p_username text)
RETURNS TABLE (
  slot_id int, condition_id int,
  as_value numeric, ad_base_c numeric, mcp_value numeric, sfr_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slot int;
  v_cond int;
BEGIN
  -- Idempotent: if user already has a slot, return it
  SELECT p.slot_id, p.condition_id INTO v_slot, v_cond
  FROM participants p WHERE p.user_id = p_user_id;

  IF v_slot IS NULL THEN
    -- Race-safe: FOR UPDATE SKIP LOCKED ensures concurrent signups never grab the same row
    SELECT s.slot_id INTO v_slot
    FROM condition_slots s
    WHERE s.claimed_by IS NULL
    ORDER BY random()
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_slot IS NULL THEN
      RAISE EXCEPTION 'STUDY_FULL: all condition slots are claimed';
    END IF;

    UPDATE condition_slots
       SET claimed_by = p_user_id, claimed_at = now()
     WHERE condition_slots.slot_id = v_slot
    RETURNING condition_slots.condition_id INTO v_cond;

    INSERT INTO participants (user_id, username, slot_id, condition_id)
    VALUES (p_user_id, p_username, v_slot, v_cond);
  END IF;

  RETURN QUERY
    SELECT v_slot, v_cond, c.as_value, c.ad_base_c, c.mcp_value, c.sfr_value
    FROM conditions c WHERE c.condition_id = v_cond;
END;
$$;
