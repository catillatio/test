-- Empty on ordinary upgrade; no seed, activation, grants or old-row rewrites.
CREATE TABLE expansion_bot_cohorts (
 manifest_id text PRIMARY KEY REFERENCES rulesets(id) CHECK(manifest_id='level100-rivals-1'),
 manifest_digest char(64) NOT NULL,approval_digest char(64) NOT NULL,legacy_digest char(64) NOT NULL,
 legacy_identities jsonb NOT NULL CHECK(jsonb_array_length(legacy_identities)=450),
 capital bigint NOT NULL CHECK(capital>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE expansion_bot_members (
 character_id uuid PRIMARY KEY REFERENCES development_bots(character_id),
 manifest_id text NOT NULL REFERENCES expansion_bot_cohorts(manifest_id),
 account_id uuid NOT NULL UNIQUE REFERENCES accounts(id),members integer NOT NULL CHECK(members BETWEEN 1 AND 2499),
 initial_capital integer NOT NULL CHECK(initial_capital>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE expansion_bot_activations (
 manifest_id text PRIMARY KEY REFERENCES expansion_bot_cohorts(manifest_id),
 approval_digest char(64) NOT NULL,economy_policy text NOT NULL REFERENCES rulesets(id),combat_policy text NOT NULL REFERENCES rulesets(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_expansion_cohort BEFORE UPDATE OR DELETE ON expansion_bot_cohorts FOR EACH ROW EXECUTE FUNCTION immutable_expansion_record();
CREATE TRIGGER immutable_expansion_members BEFORE UPDATE OR DELETE ON expansion_bot_members FOR EACH ROW EXECUTE FUNCTION immutable_expansion_record();
CREATE TRIGGER immutable_expansion_bot_activation BEFORE UPDATE OR DELETE ON expansion_bot_activations FOR EACH ROW EXECUTE FUNCTION immutable_expansion_record();
CREATE TABLE expansion_bot_autonomy_events (
 id uuid PRIMARY KEY,sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,manifest_id text NOT NULL REFERENCES expansion_bot_cohorts(manifest_id),
 mode text NOT NULL CHECK(mode IN ('paused','purchases-only','enabled')),
 policy_digest char(64) NOT NULL,approval_digest char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX expansion_bot_autonomy_latest ON expansion_bot_autonomy_events(sequence DESC);
CREATE TRIGGER immutable_expansion_autonomy BEFORE UPDATE OR DELETE ON expansion_bot_autonomy_events FOR EACH ROW EXECUTE FUNCTION immutable_expansion_record();
-- An older compatible human-expansion binary is not population-compatible.
CREATE FUNCTION require_population_writer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM expansion_bot_cohorts) AND current_setting('kingdom.population_writer',true) IS DISTINCT FROM 'level100-cohort-engine-1' THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='A population-compatible writer is required';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
DO $$ DECLARE target text;BEGIN
 FOREACH target IN ARRAY ARRAY['characters','wallets','vault_accounts','inventory_entries','inventory_lots','land_holdings','maintenance_accounts','army_links','battles','quest_runs','bounties','economy_transactions'] LOOP
  EXECUTE format('CREATE TRIGGER population_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION require_population_writer()',target);
 END LOOP;
END $$;
