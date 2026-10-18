-- Additive read models only. Old accounts, journals, rules, battles and tutorial
-- evidence are never rewritten. Serialize the one-time historical backfill with
-- gameplay writes so a battle/purchase cannot fall between backfill and triggers.
LOCK TABLE accounts,characters,development_bots,battles,bounty_kills,land_holdings IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE champion_standings (
 character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
 eligible boolean NOT NULL,
 battle_victories bigint NOT NULL DEFAULT 0 CHECK(battle_victories>=0),
 battle_defeats bigint NOT NULL DEFAULT 0 CHECK(battle_defeats>=0),
 bounty_claims bigint NOT NULL DEFAULT 0 CHECK(bounty_claims>=0),
 bounty_deaths bigint NOT NULL DEFAULT 0 CHECK(bounty_deaths>=0),
 land_value numeric(40,0) NOT NULL DEFAULT 0 CHECK(land_value>=0),
 attained_level integer NOT NULL,xp bigint NOT NULL,created_at timestamptz NOT NULL
);
INSERT INTO champion_standings(character_id,eligible,attained_level,xp,created_at)
 SELECT c.id,NOT a.login_disabled AND NOT EXISTS(SELECT 1 FROM development_bots d WHERE d.character_id=c.id),c.attained_level,c.xp,c.created_at
 FROM characters c JOIN accounts a ON a.id=c.account_id;
UPDATE champion_standings s SET battle_victories=w.n FROM (
 SELECT CASE WHEN outcome='attacker_win' THEN attacker_id ELSE defender_id END AS winner,count(*) AS n
 FROM battles GROUP BY 1) w WHERE s.character_id=w.winner;
UPDATE champion_standings s SET battle_defeats=l.n FROM (
 SELECT CASE WHEN outcome='attacker_win' THEN defender_id ELSE attacker_id END AS loser,count(*) AS n
 FROM battles GROUP BY 1) l WHERE s.character_id=l.loser;
UPDATE champion_standings s SET bounty_claims=k.n FROM (
 SELECT k.claimant_id,count(*) AS n FROM bounty_kills k JOIN bounties b ON b.id=k.bounty_id
 AND b.status='claimed' AND b.claimant_id=k.claimant_id AND b.target_id=k.target_id AND b.battle_id=k.battle_id GROUP BY 1
) k WHERE s.character_id=k.claimant_id;
UPDATE champion_standings s SET bounty_deaths=k.n FROM (
 SELECT k.target_id,count(*) AS n FROM bounty_kills k JOIN bounties b ON b.id=k.bounty_id
 AND b.status='claimed' AND b.claimant_id=k.claimant_id AND b.target_id=k.target_id AND b.battle_id=k.battle_id GROUP BY 1
) k WHERE s.character_id=k.target_id;
-- Portfolio value is the remaining quantity at each holding's recorded paid
-- unit price. It is neither a wallet nor a new currency; sold plots do not count.
UPDATE champion_standings s SET land_value=h.value FROM (
 SELECT character_id,sum(quantity::numeric*unit_price) AS value FROM land_holdings GROUP BY 1
) h WHERE s.character_id=h.character_id;
CREATE INDEX champions_victories ON champion_standings(battle_victories DESC,created_at,character_id) WHERE eligible AND battle_victories>0;
CREATE INDEX champions_bounties ON champion_standings(bounty_claims DESC,created_at,character_id) WHERE eligible AND bounty_claims>0;
CREATE INDEX champions_land ON champion_standings(land_value DESC,created_at,character_id) WHERE eligible AND land_value>0;
CREATE INDEX champions_level ON champion_standings(attained_level DESC,xp DESC,created_at,character_id) WHERE eligible;

CREATE TABLE rivalry_totals (
 low_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
 high_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
 low_wins bigint NOT NULL DEFAULT 0,high_wins bigint NOT NULL DEFAULT 0,
 low_gold bigint NOT NULL DEFAULT 0,high_gold bigint NOT NULL DEFAULT 0,
 unrecorded_gold bigint NOT NULL DEFAULT 0,
 low_bounties bigint NOT NULL DEFAULT 0,high_bounties bigint NOT NULL DEFAULT 0,
 last_at timestamptz NOT NULL,last_battle_id uuid NOT NULL,
 PRIMARY KEY(low_id,high_id),CHECK(low_id<high_id)
);
CREATE INDEX rivalry_low_recent ON rivalry_totals(low_id,last_at DESC,last_battle_id DESC);
CREATE INDEX rivalry_high_recent ON rivalry_totals(high_id,last_at DESC,last_battle_id DESC);
CREATE INDEX battles_rivalry_recent ON battles(LEAST(attacker_id,defender_id),GREATEST(attacker_id,defender_id),created_at DESC,id DESC);

-- Only post-PvP-economy records explicitly establish attacking-only ordinary
-- transfers. Earlier ambiguous loot stays unknown, never invented or repriced.
CREATE FUNCTION rivalry_recorded_gold(data jsonb) RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN data ? 'pvpRulesetId' AND jsonb_typeof(data->'loot')='number'
 AND data->>'loot' ~ '^[0-9]{1,10}$' THEN (data->>'loot')::bigint ELSE NULL END
$$;
INSERT INTO rivalry_totals(low_id,high_id,low_wins,high_wins,low_gold,high_gold,unrecorded_gold,last_at,last_battle_id)
 SELECT LEAST(b.attacker_id,b.defender_id),GREATEST(b.attacker_id,b.defender_id),
 count(*) FILTER(WHERE (b.outcome='attacker_win' AND b.attacker_id<b.defender_id) OR (b.outcome='defender_win' AND b.defender_id<b.attacker_id)),
 count(*) FILTER(WHERE (b.outcome='attacker_win' AND b.attacker_id>b.defender_id) OR (b.outcome='defender_win' AND b.defender_id>b.attacker_id)),
 COALESCE(sum(rivalry_recorded_gold(b.result)) FILTER(WHERE b.outcome='attacker_win' AND b.attacker_id<b.defender_id),0),
 COALESCE(sum(rivalry_recorded_gold(b.result)) FILTER(WHERE b.outcome='attacker_win' AND b.attacker_id>b.defender_id),0),
 count(*) FILTER(WHERE rivalry_recorded_gold(b.result) IS NULL),max(b.created_at),
 (array_agg(b.id ORDER BY b.created_at DESC,b.id DESC))[1]
 FROM battles b WHERE NOT EXISTS(SELECT 1 FROM development_bots d WHERE d.character_id IN(b.attacker_id,b.defender_id)) GROUP BY 1,2;
UPDATE rivalry_totals r SET low_bounties=k.lo,high_bounties=k.hi FROM (
 SELECT LEAST(k.claimant_id,k.target_id) AS low_id,GREATEST(k.claimant_id,k.target_id) AS high_id,
 count(*) FILTER(WHERE k.claimant_id<k.target_id) AS lo,count(*) FILTER(WHERE k.claimant_id>k.target_id) AS hi
 FROM bounty_kills k JOIN bounties b ON b.id=k.bounty_id AND b.status='claimed'
 AND b.claimant_id=k.claimant_id AND b.target_id=k.target_id AND b.battle_id=k.battle_id GROUP BY 1,2
) k WHERE r.low_id=k.low_id AND r.high_id=k.high_id;

CREATE FUNCTION champions_character_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO champion_standings(character_id,eligible,attained_level,xp,created_at)
 VALUES(NEW.id,NOT (SELECT login_disabled FROM accounts WHERE id=NEW.account_id)
 AND NOT EXISTS(SELECT 1 FROM development_bots WHERE character_id=NEW.id),NEW.attained_level,NEW.xp,NEW.created_at)
 ON CONFLICT(character_id) DO UPDATE SET attained_level=EXCLUDED.attained_level,xp=EXCLUDED.xp;
 RETURN NEW;
END $$;
CREATE TRIGGER champions_character_created AFTER INSERT ON characters FOR EACH ROW EXECUTE FUNCTION champions_character_changed();
CREATE TRIGGER champions_character_level AFTER UPDATE OF attained_level,xp ON characters FOR EACH ROW
 WHEN(OLD.attained_level IS DISTINCT FROM NEW.attained_level OR OLD.xp IS DISTINCT FROM NEW.xp) EXECUTE FUNCTION champions_character_changed();
CREATE FUNCTION champions_account_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE champion_standings s SET eligible=NOT NEW.login_disabled AND NOT EXISTS(SELECT 1 FROM development_bots d WHERE d.character_id=s.character_id)
 WHERE s.character_id IN(SELECT id FROM characters WHERE account_id=NEW.id);RETURN NEW;
END $$;
CREATE TRIGGER champions_account_visibility AFTER UPDATE OF login_disabled ON accounts FOR EACH ROW EXECUTE FUNCTION champions_account_changed();
CREATE FUNCTION champions_bot_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE champion_standings s SET eligible=NOT a.login_disabled AND NOT EXISTS(SELECT 1 FROM development_bots d WHERE d.character_id=c.id)
 FROM characters c JOIN accounts a ON a.id=c.account_id WHERE s.character_id=c.id AND c.id=COALESCE(NEW.character_id,OLD.character_id);
 RETURN NULL;
END $$;
CREATE TRIGGER champions_bot_visibility AFTER INSERT OR DELETE ON development_bots FOR EACH ROW EXECUTE FUNCTION champions_bot_changed();
CREATE FUNCTION champions_land_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN UPDATE champion_standings SET land_value=land_value-OLD.quantity::numeric*OLD.unit_price WHERE character_id=OLD.character_id;END IF;
 IF TG_OP<>'DELETE' THEN UPDATE champion_standings SET land_value=land_value+NEW.quantity::numeric*NEW.unit_price WHERE character_id=NEW.character_id;END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER champions_land_insert AFTER INSERT OR DELETE ON land_holdings FOR EACH ROW EXECUTE FUNCTION champions_land_changed();
CREATE TRIGGER champions_land_update AFTER UPDATE OF quantity,unit_price,character_id ON land_holdings FOR EACH ROW
 WHEN(OLD.quantity IS DISTINCT FROM NEW.quantity OR OLD.unit_price IS DISTINCT FROM NEW.unit_price OR OLD.character_id IS DISTINCT FROM NEW.character_id) EXECUTE FUNCTION champions_land_changed();

CREATE FUNCTION champions_battle_committed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lo uuid;hi uuid;winner uuid;gold bigint;
BEGIN
 winner:=CASE WHEN NEW.outcome='attacker_win' THEN NEW.attacker_id ELSE NEW.defender_id END;
 UPDATE champion_standings SET battle_victories=battle_victories+1 WHERE character_id=winner;
 UPDATE champion_standings SET battle_defeats=battle_defeats+1 WHERE character_id=CASE WHEN winner=NEW.attacker_id THEN NEW.defender_id ELSE NEW.attacker_id END;
 IF EXISTS(SELECT 1 FROM development_bots WHERE character_id IN(NEW.attacker_id,NEW.defender_id)) THEN RETURN NEW;END IF;
 lo:=LEAST(NEW.attacker_id,NEW.defender_id);hi:=GREATEST(NEW.attacker_id,NEW.defender_id);gold:=rivalry_recorded_gold(NEW.result);
 INSERT INTO rivalry_totals(low_id,high_id,low_wins,high_wins,low_gold,high_gold,unrecorded_gold,last_at,last_battle_id)
 VALUES(lo,hi,(winner=lo)::int,(winner=hi)::int,
 CASE WHEN NEW.outcome='attacker_win' AND NEW.attacker_id=lo THEN COALESCE(gold,0) ELSE 0 END,
 CASE WHEN NEW.outcome='attacker_win' AND NEW.attacker_id=hi THEN COALESCE(gold,0) ELSE 0 END,
 (gold IS NULL)::int,NEW.created_at,NEW.id)
 ON CONFLICT(low_id,high_id) DO UPDATE SET low_wins=rivalry_totals.low_wins+EXCLUDED.low_wins,high_wins=rivalry_totals.high_wins+EXCLUDED.high_wins,
 low_gold=rivalry_totals.low_gold+EXCLUDED.low_gold,high_gold=rivalry_totals.high_gold+EXCLUDED.high_gold,unrecorded_gold=rivalry_totals.unrecorded_gold+EXCLUDED.unrecorded_gold,
 last_battle_id=CASE WHEN (EXCLUDED.last_at,EXCLUDED.last_battle_id)>(rivalry_totals.last_at,rivalry_totals.last_battle_id) THEN EXCLUDED.last_battle_id ELSE rivalry_totals.last_battle_id END,
 last_at=GREATEST(rivalry_totals.last_at,EXCLUDED.last_at);
 RETURN NEW;
END $$;
CREATE TRIGGER champions_battle_insert AFTER INSERT ON battles FOR EACH ROW EXECUTE FUNCTION champions_battle_committed();
CREATE FUNCTION champions_bounty_committed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM bounties b WHERE b.id=NEW.bounty_id AND b.status='claimed' AND b.claimant_id=NEW.claimant_id AND b.target_id=NEW.target_id AND b.battle_id=NEW.battle_id) THEN RETURN NEW;END IF;
 UPDATE champion_standings SET bounty_claims=bounty_claims+1 WHERE character_id=NEW.claimant_id;
 UPDATE champion_standings SET bounty_deaths=bounty_deaths+1 WHERE character_id=NEW.target_id;
 UPDATE rivalry_totals SET low_bounties=low_bounties+(NEW.claimant_id=low_id)::int,high_bounties=high_bounties+(NEW.claimant_id=high_id)::int
 WHERE low_id=LEAST(NEW.claimant_id,NEW.target_id) AND high_id=GREATEST(NEW.claimant_id,NEW.target_id);
 RETURN NEW;
END $$;
CREATE TRIGGER champions_bounty_insert AFTER INSERT ON bounty_kills FOR EACH ROW EXECUTE FUNCTION champions_bounty_committed();

-- Presentation cursor only; old tutorial_steps and permanent completion remain.
CREATE TABLE tutorial_guides (
 character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
 step_index smallint NOT NULL DEFAULT 1 CHECK(step_index BETWEEN 1 AND 8),
 replaying boolean NOT NULL DEFAULT false,
 completed_at timestamptz,updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
