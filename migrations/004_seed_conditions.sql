-- ============================================================
-- RSM Math-Tutoring Study: conditions + slot pool
-- 25 conditions × 4 slots each = 100 pre-shuffled UNCLAIMED slots.
-- Shuffle seed=42 (reproducible).
-- Run AFTER 001_initial_schema.sql.
-- ============================================================

create table if not exists conditions (
  condition_id int primary key,
  as_coded int not null, ad_coded int not null,
  mcp_coded int not null, sfr_coded int not null,
  as_value numeric not null,   -- specificity score
  ad_base_c numeric not null,  -- base delay c (seconds)
  mcp_value numeric not null,  -- prompts per problem
  sfr_value numeric not null,  -- per-hour fade level
  is_center boolean not null default false
);

-- Each slot delivers one condition. claimed_by = auth user id (null = open).
create table if not exists condition_slots (
  slot_id      int primary key,
  condition_id int not null references conditions(condition_id),
  claimed_by   uuid references auth.users(id),  -- null = available
  claimed_at   timestamptz
);
create index if not exists idx_slots_open on condition_slots (slot_id) where claimed_by is null;

-- Add FK constraints to participants now that conditions/slots tables exist
alter table participants
  add column if not exists slot_id int references condition_slots(slot_id),
  add column if not exists condition_id int references conditions(condition_id);

-- ---- conditions (25) ----
insert into conditions values (1,0,0,0,0,30,70,1.0,0.08,true) on conflict (condition_id) do nothing;
insert into conditions values (2,-1,-1,-1,-1,18,53,0.5,0.0566,false) on conflict (condition_id) do nothing;
insert into conditions values (3,-1,-1,-1,1,18,53,0.5,0.113,false) on conflict (condition_id) do nothing;
insert into conditions values (4,-1,-1,1,-1,18,53,2.0,0.0566,false) on conflict (condition_id) do nothing;
insert into conditions values (5,-1,-1,1,1,18,53,2.0,0.113,false) on conflict (condition_id) do nothing;
insert into conditions values (6,-1,1,-1,-1,18,92,0.5,0.0566,false) on conflict (condition_id) do nothing;
insert into conditions values (7,-1,1,-1,1,18,92,0.5,0.113,false) on conflict (condition_id) do nothing;
insert into conditions values (8,-1,1,1,-1,18,92,2.0,0.0566,false) on conflict (condition_id) do nothing;
insert into conditions values (9,-1,1,1,1,18,92,2.0,0.113,false) on conflict (condition_id) do nothing;
insert into conditions values (10,1,-1,-1,-1,42,53,0.5,0.0566,false) on conflict (condition_id) do nothing;
insert into conditions values (11,1,-1,-1,1,42,53,0.5,0.113,false) on conflict (condition_id) do nothing;
insert into conditions values (12,1,-1,1,-1,42,53,2.0,0.0566,false) on conflict (condition_id) do nothing;
insert into conditions values (13,1,-1,1,1,42,53,2.0,0.113,false) on conflict (condition_id) do nothing;
insert into conditions values (14,1,1,-1,-1,42,92,0.5,0.0566,false) on conflict (condition_id) do nothing;
insert into conditions values (15,1,1,-1,1,42,92,0.5,0.113,false) on conflict (condition_id) do nothing;
insert into conditions values (16,1,1,1,-1,42,92,2.0,0.0566,false) on conflict (condition_id) do nothing;
insert into conditions values (17,1,1,1,1,42,92,2.0,0.113,false) on conflict (condition_id) do nothing;
insert into conditions values (18,-2,0,0,0,6,70,1.0,0.08,false) on conflict (condition_id) do nothing;
insert into conditions values (19,2,0,0,0,54,70,1.0,0.08,false) on conflict (condition_id) do nothing;
insert into conditions values (20,0,-2,0,0,30,40,1.0,0.08,false) on conflict (condition_id) do nothing;
insert into conditions values (21,0,2,0,0,30,121,1.0,0.08,false) on conflict (condition_id) do nothing;
insert into conditions values (22,0,0,-2,0,30,70,0.25,0.08,false) on conflict (condition_id) do nothing;
insert into conditions values (23,0,0,2,0,30,70,4.0,0.08,false) on conflict (condition_id) do nothing;
insert into conditions values (24,0,0,0,-2,30,70,1.0,0.04,false) on conflict (condition_id) do nothing;
insert into conditions values (25,0,0,0,2,30,70,1.0,0.16,false) on conflict (condition_id) do nothing;

-- ---- condition_slots (100, shuffled with seed=42, all unclaimed) ----
insert into condition_slots (slot_id, condition_id) values (1,6) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (2,6) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (3,23) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (4,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (5,14) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (6,9) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (7,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (8,16) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (9,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (10,18) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (11,17) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (12,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (13,11) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (14,11) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (15,16) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (16,7) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (17,8) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (18,23) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (19,18) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (20,5) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (21,2) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (22,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (23,3) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (24,24) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (25,19) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (26,9) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (27,20) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (28,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (29,21) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (30,3) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (31,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (32,8) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (33,12) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (34,13) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (35,17) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (36,7) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (37,25) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (38,10) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (39,21) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (40,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (41,4) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (42,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (43,5) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (44,6) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (45,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (46,14) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (47,13) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (48,12) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (49,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (50,4) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (51,25) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (52,8) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (53,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (54,9) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (55,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (56,5) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (57,12) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (58,15) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (59,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (60,13) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (61,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (62,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (63,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (64,15) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (65,20) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (66,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (67,19) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (68,7) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (69,22) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (70,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (71,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (72,24) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (73,11) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (74,23) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (75,10) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (76,22) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (77,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (78,16) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (79,20) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (80,18) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (81,14) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (82,2) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (83,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (84,22) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (85,25) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (86,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (87,10) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (88,17) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (89,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (90,15) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (91,21) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (92,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (93,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (94,2) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (95,3) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (96,4) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (97,24) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (98,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (99,1) on conflict (slot_id) do nothing;
insert into condition_slots (slot_id, condition_id) values (100,19) on conflict (slot_id) do nothing;
