-- Derived competitive facts and separately authorized rarity only. Never rewrite
-- an account, battle, wallet, inventory, activation record or historical receipt.
LOCK TABLE characters,battles,bounties,bounty_kills,bounty_events IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE competitive_statistics (
 character_id uuid PRIMARY KEY REFERENCES characters(id),
 player_kills bigint NOT NULL DEFAULT 0 CHECK(player_kills>=0),
 player_deaths bigint NOT NULL DEFAULT 0 CHECK(player_deaths>=0),
 bounties_received bigint NOT NULL DEFAULT 0 CHECK(bounties_received>=0)
);
INSERT INTO competitive_statistics(character_id) SELECT id FROM characters;
CREATE FUNCTION start_competitive_statistics() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO competitive_statistics(character_id) VALUES(NEW.id);RETURN NEW;END $$;
CREATE TRIGGER phase6_character_statistics AFTER INSERT ON characters FOR EACH ROW EXECUTE FUNCTION start_competitive_statistics();

CREATE TABLE competitive_deaths (
 battle_id uuid PRIMARY KEY REFERENCES battles(id),
 bounty_id uuid NOT NULL UNIQUE REFERENCES bounties(id),
 killer_id uuid NOT NULL REFERENCES characters(id),victim_id uuid NOT NULL REFERENCES characters(id),
 created_at timestamptz NOT NULL,source text NOT NULL DEFAULT 'verified_bounty_finisher' CHECK(source='verified_bounty_finisher'),
 CHECK(killer_id<>victim_id)
);
CREATE FUNCTION verified_competitive_death(battle uuid,bounty uuid,killer uuid,victim uuid,at_time timestamptz)
 RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM bounty_kills k JOIN bounties b ON b.id=k.bounty_id JOIN battles f ON f.id=k.battle_id
 WHERE k.battle_id=battle AND k.bounty_id=bounty AND k.claimant_id=killer AND k.target_id=victim
 AND k.source='finishing_claim' AND k.awarded_at=at_time
 AND b.status='claimed' AND b.claimant_id=killer AND b.target_id=victim AND b.battle_id=battle
 AND f.attacker_id=killer AND f.defender_id=victim AND f.created_at>=b.created_at AND f.created_at<b.expires_at
 AND f.result->'defenderHealthAfter'='0'::jsonb AND CASE WHEN f.result->>'defenderHealthBefore' ~ '^[0-9]{1,9}$' THEN (f.result->>'defenderHealthBefore')::int>0 ELSE false END
 AND CASE WHEN f.result->>'spiritSpent' ~ '^[0-9]{1,9}$' THEN (f.result->>'spiritSpent')::int>0 ELSE false END
 AND NOT EXISTS(SELECT 1 FROM development_bots d WHERE d.character_id IN(killer,victim)))
$$;
CREATE FUNCTION guard_competitive_death() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Competitive death evidence is append-only';END IF;
 IF NOT verified_competitive_death(NEW.battle_id,NEW.bounty_id,NEW.killer_id,NEW.victim_id,NEW.created_at)
 THEN RAISE EXCEPTION 'Verified human bounty finishing evidence required';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER competitive_death_guard BEFORE INSERT OR UPDATE OR DELETE ON competitive_deaths FOR EACH ROW EXECUTE FUNCTION guard_competitive_death();
CREATE FUNCTION count_competitive_death() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE competitive_statistics SET player_kills=player_kills+1 WHERE character_id=NEW.killer_id;
 UPDATE competitive_statistics SET player_deaths=player_deaths+1 WHERE character_id=NEW.victim_id;
 RETURN NEW;
END $$;
CREATE TRIGGER competitive_death_count AFTER INSERT ON competitive_deaths FOR EACH ROW EXECUTE FUNCTION count_competitive_death();
CREATE FUNCTION record_competitive_death() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF verified_competitive_death(NEW.battle_id,NEW.bounty_id,NEW.claimant_id,NEW.target_id,NEW.awarded_at) THEN
  INSERT INTO competitive_deaths(battle_id,bounty_id,killer_id,victim_id,created_at)
  VALUES(NEW.battle_id,NEW.bounty_id,NEW.claimant_id,NEW.target_id,NEW.awarded_at);
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER phase6_bounty_death AFTER INSERT ON bounty_kills FOR EACH ROW EXECUTE FUNCTION record_competitive_death();
-- Legacy claims without explicit finishing Health evidence remain historical
-- claims. They are not silently invented as new competitive deaths.
INSERT INTO competitive_deaths(battle_id,bounty_id,killer_id,victim_id,created_at)
 SELECT k.battle_id,k.bounty_id,k.claimant_id,k.target_id,k.awarded_at FROM bounty_kills k
 WHERE verified_competitive_death(k.battle_id,k.bounty_id,k.claimant_id,k.target_id,k.awarded_at);
UPDATE competitive_statistics s SET bounties_received=x.n FROM (SELECT target_id,count(*) AS n FROM bounties GROUP BY target_id) x WHERE s.character_id=x.target_id;
CREATE FUNCTION count_received_bounty() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE competitive_statistics SET bounties_received=bounties_received+1 WHERE character_id=NEW.target_id;RETURN NEW;END $$;
CREATE TRIGGER phase6_bounty_received AFTER INSERT ON bounties FOR EACH ROW EXECUTE FUNCTION count_received_bounty();
CREATE INDEX competitive_kills ON competitive_statistics(player_kills DESC,character_id) WHERE player_kills>0;
CREATE INDEX competitive_kd ON competitive_statistics(((player_kills::numeric)/NULLIF(player_deaths,0)) DESC,character_id) WHERE player_kills>0 AND player_deaths>0;
CREATE INDEX competitive_deaths_killer ON competitive_deaths(killer_id,created_at DESC,battle_id DESC);
CREATE INDEX competitive_deaths_victim ON competitive_deaths(victim_id,created_at DESC,battle_id DESC);
CREATE INDEX bounty_events_attention ON bounty_events(bounty_id,created_at,id) WHERE kind IN ('placed','claimed');
CREATE INDEX bot_economy_recent ON command_receipts(created_at,account_id) WHERE kind='bot_economy';

-- New unread kinds begin now; old acceptance/attack/comment markers are intact.
CREATE TABLE competitive_attention_starts (
 character_id uuid PRIMARY KEY REFERENCES notification_state(character_id),started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO competitive_attention_starts(character_id) SELECT character_id FROM notification_state;
CREATE FUNCTION start_competitive_attention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO competitive_attention_starts(character_id) VALUES(NEW.character_id);RETURN NEW;END $$;
CREATE TRIGGER phase6_attention_start AFTER INSERT ON notification_state FOR EACH ROW EXECUTE FUNCTION start_competitive_attention();
ALTER TABLE notification_reads DROP CONSTRAINT notification_reads_kind_check;
ALTER TABLE notification_reads ADD CONSTRAINT notification_reads_kind_check CHECK(kind IN ('attack','comment','army_accepted','bounty_placed','bounty_claimed'));

-- A separate append-only approval journal: never rerun expansion activation or
-- overwrite its immutable record merely to adopt/pause the reviewed drop rate.
CREATE TABLE rare_equipment_authorizations (
 id uuid PRIMARY KEY,sequence bigserial UNIQUE NOT NULL,enabled boolean NOT NULL,
 policy_id text NOT NULL REFERENCES rulesets(id),policy_digest text NOT NULL CHECK(policy_digest~'^[a-f0-9]{64}$'),
 probability_ppm integer NOT NULL CHECK(probability_ppm BETWEEN 1 AND 10000),
 approval_digest text NOT NULL CHECK(approval_digest~'^[a-f0-9]{64}$'),
 recovery jsonb NOT NULL,target jsonb NOT NULL,plan jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION guard_rarity_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Rarity authorizations are append-only';END $$;
CREATE TRIGGER rarity_authorization_guard BEFORE UPDATE OR DELETE ON rare_equipment_authorizations FOR EACH ROW EXECUTE FUNCTION guard_rarity_authorization();
