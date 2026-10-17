-- Additive cutover. Never rewrite old battle, wallet, holding, settlement or
-- bounty records. Live estate clocks are adopted lazily under character locks.
CREATE TABLE income_cycles (
 character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
 next_payment_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Exact numerator remainders avoid losing gold across partial first periods.
ALTER TABLE land_holdings ADD COLUMN income_remainder bigint NOT NULL DEFAULT 0 CHECK(income_remainder BETWEEN 0 AND 3599999),
 ADD COLUMN upkeep_remainder bigint NOT NULL DEFAULT 0 CHECK(upkeep_remainder BETWEEN 0 AND 3599999);
CREATE TABLE land_partial_settlements (
 holding_id uuid NOT NULL REFERENCES land_holdings(id),
 period_start_at timestamptz NOT NULL,period_end_at timestamptz NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0),
 gross_gold numeric(40,0) NOT NULL CHECK(gross_gold>=0),upkeep_gold numeric(40,0) NOT NULL CHECK(upkeep_gold>=0),
 net_gold numeric(40,0) NOT NULL CHECK(net_gold=gross_gold-upkeep_gold AND net_gold>=0),
 income_remainder bigint NOT NULL,upkeep_remainder bigint NOT NULL,
 reason text NOT NULL CHECK(reason IN ('shared_cycle','sale')),
 ruleset_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(holding_id,period_start_at),CHECK(period_end_at>period_start_at)
);
CREATE TABLE legacy_casualty_statistics (
 character_id uuid PRIMARY KEY REFERENCES characters(id),
 historical_knockouts integer NOT NULL,historical_bounty_deaths integer NOT NULL,
 reconciled_at timestamptz NOT NULL DEFAULT now(),
 description text NOT NULL DEFAULT 'Archived knockout-derived counter, not a bounty Death statistic. Battle and bounty journals remain authoritative and unchanged.'
);
INSERT INTO legacy_casualty_statistics(character_id,historical_knockouts,historical_bounty_deaths)
 SELECT c.id,(SELECT count(*) FROM battles b WHERE
 (b.defender_id=c.id AND b.result->'defenderHealthAfter'='0'::jsonb) OR
 (b.attacker_id=c.id AND COALESCE(b.result->'attackerHealthAfterDamage',b.result->'attackerHealthAfter')='0'::jsonb)),
 (SELECT count(*) FROM bounty_kills k WHERE k.target_id=c.id) FROM characters c;
-- Variants preserve the original 150 identities; two new peers of each tier
-- fill each level. No original player or bot ID is replaced.
ALTER TABLE development_bots ADD COLUMN variant smallint NOT NULL DEFAULT 0 CHECK(variant BETWEEN 0 AND 2);
CREATE UNIQUE INDEX development_bots_identity_idx ON development_bots(population_key);
