-- Install definitions/infrastructure only. Every control/entitlement table is
-- EMPTY on installation. No existing account, item, currency or XP is updated.
CREATE TABLE realm_expansion_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), id uuid NOT NULL UNIQUE,
 policy_id text NOT NULL REFERENCES rulesets(id),catalog_id text NOT NULL REFERENCES rulesets(id),
 catalog_digest char(64) NOT NULL,writer_version text NOT NULL CHECK(writer_version='level100-engine-1'),
 rarity_policy_id text REFERENCES rulesets(id),artwork_digest char(64) NOT NULL,
 approval_digest char(64) NOT NULL,activated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE realm_expansion_events (
 id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('activate','hudson_grant')),
 manifest_id text NOT NULL,approval_digest char(64) NOT NULL,details jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE hudson_equipment_grants (
 id uuid PRIMARY KEY,manifest_id text NOT NULL UNIQUE CHECK(manifest_id='hudson-equipment-grant-1'),
 manifest_digest char(64) NOT NULL,approval_digest char(64) NOT NULL,
 character_id uuid NOT NULL REFERENCES characters(id) CHECK(character_id='55742e75-70c9-4792-8136-fe6ead2b83e0'),
 account_id uuid NOT NULL REFERENCES accounts(id),result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE equipment_upkeep_entitlements (
 character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
 item_id text NOT NULL CHECK(item_id IN ('king-hudsons-sword','king-hudsons-shield','king-hudsons-meteor-shower')),
 grant_id uuid NOT NULL REFERENCES hudson_equipment_grants(id),effective_at timestamptz NOT NULL,
 PRIMARY KEY(character_id,item_id),CHECK(character_id='55742e75-70c9-4792-8136-fe6ead2b83e0')
);
CREATE TABLE inventory_acquisition_events (
 id uuid PRIMARY KEY,character_id uuid NOT NULL REFERENCES characters(id),
 inventory_entry_id uuid NOT NULL REFERENCES inventory_entries(id),lot_id uuid NOT NULL UNIQUE REFERENCES inventory_lots(id),
 item_id text NOT NULL,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 15),unit_cost integer NOT NULL CHECK(unit_cost=0),
 source_kind text NOT NULL CHECK(source_kind IN ('quest_drop','hudson_grant')),source_id uuid NOT NULL,
 command_id uuid NOT NULL,ruleset_id text NOT NULL REFERENCES rulesets(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(character_id,source_kind,source_id,item_id)
);
CREATE INDEX inventory_acquisition_owner_history ON inventory_acquisition_events(character_id,created_at DESC,id DESC) WHERE source_kind='quest_drop';
CREATE TABLE quest_equipment_outcomes (
 quest_run_id uuid NOT NULL REFERENCES quest_runs(id),character_id uuid NOT NULL REFERENCES characters(id),item_id text NOT NULL,
 policy_id text NOT NULL REFERENCES rulesets(id),roll integer NOT NULL CHECK(roll BETWEEN 0 AND 999999),
 probability_ppm integer NOT NULL CHECK(probability_ppm BETWEEN 1 AND 10000),
 outcome text NOT NULL CHECK(outcome IN ('miss','awarded','inventory_full')),acquisition_id uuid REFERENCES inventory_acquisition_events(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(quest_run_id,item_id),
 CHECK((outcome='awarded')=(acquisition_id IS NOT NULL))
);
CREATE INDEX quest_equipment_owner_history ON quest_equipment_outcomes(character_id,created_at DESC,quest_run_id) WHERE outcome='awarded';

-- New non-shop acquisitions have zero paid cost, not invented sale value.
ALTER TABLE inventory_transactions DROP CONSTRAINT inventory_transactions_kind_check;
ALTER TABLE inventory_transactions ALTER COLUMN kind TYPE varchar(16);
ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_kind_check CHECK(kind IN ('buy','sell','quest_drop','hudson_grant'));

CREATE FUNCTION immutable_expansion_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Expansion authorization and acquisition evidence is immutable'; END $$;
CREATE TRIGGER immutable_realm_expansion BEFORE UPDATE OR DELETE ON realm_expansion_state FOR EACH ROW EXECUTE FUNCTION immutable_expansion_record();
CREATE TRIGGER immutable_expansion_event BEFORE UPDATE OR DELETE ON realm_expansion_events FOR EACH ROW EXECUTE FUNCTION immutable_expansion_record();
CREATE TRIGGER immutable_hudson_grant BEFORE UPDATE OR DELETE ON hudson_equipment_grants FOR EACH ROW EXECUTE FUNCTION immutable_expansion_record();
CREATE TRIGGER immutable_quest_equipment BEFORE UPDATE OR DELETE ON quest_equipment_outcomes FOR EACH ROW EXECUTE FUNCTION immutable_expansion_record();
CREATE TRIGGER immutable_inventory_acquisition BEFORE UPDATE OR DELETE ON inventory_acquisition_events FOR EACH ROW EXECUTE FUNCTION immutable_expansion_record();
CREATE TRIGGER immutable_equipment_entitlement BEFORE UPDATE OR DELETE ON equipment_upkeep_entitlements FOR EACH ROW EXECUTE FUNCTION immutable_expansion_record();

-- A compatible transaction takes the shared lock BEFORE character locks. An
-- old writer cannot block the cutover while waiting for the shared lock: abort
-- it with a retryable serialization error instead. Once active, old writers
-- fail closed even if a stale process is accidentally returned to service.
CREATE FUNCTION require_expansion_writer() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
BEGIN
 IF NOT pg_try_advisory_xact_lock_shared(61824051) THEN
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Expansion cutover is busy; retry this transaction';
 END IF;
 IF EXISTS(SELECT 1 FROM realm_expansion_state) AND current_setting('kingdom.expansion_writer',true) IS DISTINCT FROM 'level100-engine-1' THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='A compatible expansion writer is required';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
DO $$ DECLARE target text;BEGIN
 FOREACH target IN ARRAY ARRAY['characters','wallets','vault_accounts','inventory_entries','inventory_lots','land_holdings','maintenance_accounts','army_links','battles','quest_runs','bounties','economy_transactions'] LOOP
  EXECUTE format('CREATE TRIGGER expansion_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION require_expansion_writer()',target);
 END LOOP;
END $$;
