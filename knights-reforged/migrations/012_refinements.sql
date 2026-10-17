-- New placements can be 1–10,000 gold. Completed and active historical rows
-- retain their actual amounts, fees, expiry clocks and recorded placement rules.
ALTER TABLE bounties DROP CONSTRAINT bounties_amount_check;
ALTER TABLE bounties ADD CONSTRAINT bounties_amount_check CHECK(amount BETWEEN 1 AND 10000);
ALTER TABLE bounties DROP CONSTRAINT bounties_fee_check;
ALTER TABLE bounties ADD CONSTRAINT bounties_fee_check CHECK(fee>=1);

-- Preserve the old displayed health-knockout statistic without continuing to
-- label ordinary knockouts as Kills. No battle, character or financial rewrite.
CREATE TABLE legacy_field_statistics (
 character_id uuid PRIMARY KEY REFERENCES characters(id),
 health_knockouts integer NOT NULL CHECK(health_knockouts>=0),
 captured_at timestamptz NOT NULL DEFAULT now(),policy text NOT NULL DEFAULT 'pre-phase-4.1-health-knockouts'
);
INSERT INTO legacy_field_statistics(character_id,health_knockouts)
 SELECT c.id,(SELECT count(*)::int FROM battles b WHERE
   (b.attacker_id=c.id AND b.result->'defenderHealthAfter'='0'::jsonb) OR
   (b.defender_id=c.id AND COALESCE(b.result->'attackerHealthAfterDamage',b.result->'attackerHealthAfter')='0'::jsonb))
 FROM characters c;

CREATE TABLE bounty_kills (
 bounty_id uuid PRIMARY KEY REFERENCES bounties(id),battle_id uuid NOT NULL UNIQUE REFERENCES battles(id),
 claimant_id uuid NOT NULL REFERENCES characters(id),target_id uuid NOT NULL REFERENCES characters(id),
 ruleset_id text NOT NULL REFERENCES rulesets(id),
 source text NOT NULL CHECK(source IN ('legacy_claim','finishing_claim')),
 awarded_at timestamptz NOT NULL,CHECK(claimant_id<>target_id)
);
CREATE INDEX bounty_kills_claimant ON bounty_kills(claimant_id,awarded_at DESC);
-- Previously concluded bounties remain concluded under their historical
-- conditions; one explicit legacy claim credit each, not invented new battles.
INSERT INTO bounty_kills(bounty_id,battle_id,claimant_id,target_id,ruleset_id,source,awarded_at)
 SELECT id,battle_id,claimant_id,target_id,ruleset_id,'legacy_claim',settled_at FROM bounties WHERE status='claimed';

-- The existing partial unique index bounties_one_active_target remains intact.
-- No character cooldown/resource clocks, holdings, sessions, catalog or wallet
-- values are reset. NPC catalog upgrades are an explicit guarded dev operation.

CREATE INDEX bounties_sponsor_expiry ON bounties(sponsor_id,expires_at) WHERE status='active';
