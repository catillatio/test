-- Additive Phase 3 cutover. Historical rulesets, XP, records, IDs, and Land rates
-- are retained. New definitions are registered by the same migration transaction.
ALTER TABLE characters
  ADD COLUMN max_health integer NOT NULL DEFAULT 100 CHECK (max_health BETWEEN 100 AND 5000),
  ADD COLUMN mana integer NOT NULL DEFAULT 20,
  ADD COLUMN max_mana integer NOT NULL DEFAULT 20 CHECK (max_mana BETWEEN 20 AND 500),
  ADD COLUMN spirit integer NOT NULL DEFAULT 3,
  ADD COLUMN max_spirit integer NOT NULL DEFAULT 3 CHECK (max_spirit BETWEEN 3 AND 100),
  ADD COLUMN mana_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN spirit_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN attained_level integer NOT NULL DEFAULT 1 CHECK (attained_level > 0),
  ADD COLUMN level_xp integer NOT NULL DEFAULT 0 CHECK (level_xp >= 0),
  ADD COLUMN skill_points integer NOT NULL DEFAULT 0 CHECK (skill_points >= 0),
  ADD COLUMN legacy_army_floor integer NOT NULL DEFAULT 1 CHECK (legacy_army_floor BETWEEN 1 AND 101),
  ADD COLUMN profile_class varchar(24) NOT NULL DEFAULT 'Freeblade' CHECK (profile_class IN ('Freeblade','Warden','Spellward')),
  ADD CHECK (mana BETWEEN 0 AND max_mana),
  ADD CHECK (spirit BETWEEN 0 AND max_spirit);
ALTER TABLE characters DROP CONSTRAINT characters_health_check;
ALTER TABLE characters ADD CHECK (health BETWEEN 0 AND max_health);

-- Materialize old recovery at cutover; preserve its fractional tick as a
-- fraction of the new recovery interval. The added Mana capacity is filled.
WITH stamp AS MATERIALIZED (SELECT clock_timestamp() AS at), legacy AS (
  SELECT c.id, stamp.at, floor(c.xp/50.0)::integer+1 AS lvl,
    LEAST(10,c.energy+GREATEST(0,floor(extract(epoch FROM stamp.at-c.energy_updated_at)/30))::integer) AS recovered_energy,
    LEAST(100,c.health+2*GREATEST(0,floor(extract(epoch FROM stamp.at-c.health_updated_at)/30))::integer) AS recovered_health,
    GREATEST(0,extract(epoch FROM stamp.at-c.energy_updated_at)) AS mana_elapsed,
    GREATEST(0,extract(epoch FROM stamp.at-c.health_updated_at)) AS health_elapsed
  FROM characters c CROSS JOIN stamp
)
UPDATE characters c SET attained_level=l.lvl,
  level_xp=floor((c.xp%50)/50.0 * CASE l.lvl WHEN 1 THEN 12 WHEN 2 THEN 18 WHEN 3 THEN 30 WHEN 4 THEN 45 WHEN 5 THEN 60 WHEN 6 THEN 80 WHEN 7 THEN 105 WHEN 8 THEN 135 WHEN 9 THEN 165 ELSE 200+(l.lvl-10)*45 END)::integer,
  skill_points=l.lvl-1, mana=l.recovered_energy+10, health=l.recovered_health,
  mana_updated_at=CASE WHEN l.recovered_energy=10 THEN l.at ELSE l.at-(mod(l.mana_elapsed,30)*10)*interval '1 second' END,
  health_updated_at=CASE WHEN l.recovered_health=100 THEN l.at ELSE l.at-(mod(l.health_elapsed,30)*6)*interval '1 second' END,
  spirit_updated_at=l.at,
  legacy_army_floor=LEAST(101,1+COALESCE((SELECT SUM(quantity) FROM army_stacks WHERE character_id=c.id),0))
FROM legacy l WHERE c.id=l.id;

CREATE TABLE progression_awards (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  award_id varchar(80) NOT NULL,
  points integer NOT NULL CHECK (points >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(character_id,award_id)
);
INSERT INTO progression_awards(character_id,award_id,points)
  SELECT id,'legacy-levels',skill_points FROM characters;
INSERT INTO progression_awards(character_id,award_id,points)
  SELECT c.id,'quests-10',1 FROM characters c
  WHERE (SELECT COALESCE(SUM(completions),0) FROM character_quest_progress p WHERE p.character_id=c.id)>=10;
INSERT INTO progression_awards(character_id,award_id,points)
  SELECT id,'level-5',1 FROM characters WHERE attained_level>=5;
UPDATE characters c SET skill_points=skill_points+(SELECT COALESCE(SUM(points),0) FROM progression_awards p WHERE p.character_id=c.id AND p.award_id<>'legacy-levels');

CREATE TABLE skill_allocations (
  id uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  command_id uuid NOT NULL,
  resource varchar(12) NOT NULL CHECK(resource IN ('health','mana','spirit')),
  points integer NOT NULL CHECK(points>0),
  capacity_added integer NOT NULL CHECK(capacity_added>0),
  capacity_after integer NOT NULL CHECK(capacity_after>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(character_id,command_id)
);

ALTER TABLE inventory_entries ADD COLUMN quantity integer NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 0 AND 1000);
CREATE TABLE inventory_lots (
  id uuid PRIMARY KEY,
  inventory_entry_id uuid NOT NULL,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  ruleset_id text NOT NULL REFERENCES rulesets(id),
  acquired_quantity integer NOT NULL CHECK(acquired_quantity>0),
  remaining_quantity integer NOT NULL CHECK(remaining_quantity BETWEEN 0 AND acquired_quantity),
  unit_cost integer NOT NULL CHECK(unit_cost>=0),
  command_id uuid,
  acquired_at timestamptz NOT NULL,
  FOREIGN KEY(inventory_entry_id,character_id) REFERENCES inventory_entries(id,character_id) ON DELETE CASCADE
);
-- The old schema only implemented its ruleset's single weapon. Reject unknown
-- legacy data transactionally rather than silently backfilling a fake price.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM inventory_entries i JOIN rulesets r ON r.id=i.ruleset_id
    WHERE r.definition#>>'{weapon,id}' IS DISTINCT FROM i.item_definition_id
      OR r.definition#>>'{weapon,goldCost}' IS NULL) THEN
    RAISE EXCEPTION 'Legacy inventory requires a verified acquisition-price mapping before alpha migration';
  END IF;
END $$;
INSERT INTO inventory_lots(id,inventory_entry_id,character_id,ruleset_id,acquired_quantity,remaining_quantity,unit_cost,acquired_at)
  SELECT i.id,i.id,i.character_id,i.ruleset_id,1,1,(r.definition#>>'{weapon,goldCost}')::integer,i.acquired_at
  FROM inventory_entries i JOIN rulesets r ON r.id=i.ruleset_id;
CREATE INDEX inventory_lots_owner_idx ON inventory_lots(character_id,acquired_at,id);
CREATE TABLE inventory_transactions (
  id uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  kind varchar(8) NOT NULL CHECK(kind IN ('buy','sell','grant')),
  quantity integer NOT NULL CHECK(quantity>0),
  gold_amount integer NOT NULL CHECK(gold_amount>=0),
  ruleset_id text NOT NULL REFERENCES rulesets(id),
  command_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(character_id,command_id,item_id,kind)
);
CREATE TABLE character_loot (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  loot_id varchar(64) NOT NULL,
  name varchar(80) NOT NULL,
  source_quest text NOT NULL,
  ruleset_id text NOT NULL REFERENCES rulesets(id),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(character_id,loot_id)
);
ALTER TABLE quest_runs ADD COLUMN reward_details jsonb NOT NULL DEFAULT '{}';

CREATE TABLE maintenance_accounts (
  character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  hourly_rate integer NOT NULL DEFAULT 0 CHECK(hourly_rate>=0),
  reserve_gold numeric(40,0) NOT NULL DEFAULT 0 CHECK(reserve_gold>=0),
  arrears_gold numeric(40,0) NOT NULL DEFAULT 0 CHECK(arrears_gold>=0),
  remainder bigint NOT NULL DEFAULT 0 CHECK(remainder BETWEEN 0 AND 3599999),
  paused boolean NOT NULL DEFAULT false,
  settled_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO maintenance_accounts(character_id) SELECT id FROM characters;
CREATE TABLE maintenance_events (
  id uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  reason varchar(20) NOT NULL,
  period_start_at timestamptz NOT NULL,
  period_end_at timestamptz NOT NULL,
  charged_gold numeric(40,0) NOT NULL CHECK(charged_gold>=0),
  waived_gold numeric(40,0) NOT NULL DEFAULT 0 CHECK(waived_gold>=0),
  reserve_after numeric(40,0) NOT NULL CHECK(reserve_after>=0),
  arrears_after numeric(40,0) NOT NULL CHECK(arrears_after>=0),
  command_id uuid,
  UNIQUE(character_id,period_start_at,period_end_at,reason)
);

ALTER TABLE land_holdings DROP CONSTRAINT land_holdings_quantity_check;
ALTER TABLE land_holdings ADD CHECK(quantity>=0);
ALTER TABLE land_holdings ADD COLUMN original_quantity integer NOT NULL DEFAULT 0;
ALTER TABLE land_holdings ADD COLUMN closed_at timestamptz;
UPDATE land_holdings SET original_quantity=quantity;
ALTER TABLE land_holdings ADD UNIQUE(id,character_id);
CREATE TABLE land_sales (
  id uuid PRIMARY KEY,
  holding_id uuid NOT NULL,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK(quantity>0),
  unit_refund integer NOT NULL CHECK(unit_refund>=0),
  ruleset_id text NOT NULL REFERENCES rulesets(id),
  command_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  FOREIGN KEY(holding_id,character_id) REFERENCES land_holdings(id,character_id)
);
CREATE TABLE army_links (
  low_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  high_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  status varchar(12) NOT NULL CHECK(status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(low_id,high_id),
  CHECK(low_id<high_id),
  CHECK(inviter_id IN (low_id,high_id))
);
CREATE INDEX army_links_status_idx ON army_links(status);
ALTER TABLE battles ADD COLUMN rewarded boolean NOT NULL DEFAULT true;
CREATE INDEX battles_pair_rewards_idx ON battles(attacker_id,defender_id,created_at DESC) WHERE rewarded;
