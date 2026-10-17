-- Additive only: no character, wallet, historical battle or escrow rewrite.
-- A sequence begins with the first NEW qualifying victory, not an old battle.
CREATE TABLE pvp_loot_sequences (
 attacker_id uuid NOT NULL REFERENCES characters(id),defender_id uuid NOT NULL REFERENCES characters(id),
 window_started_at timestamptz NOT NULL,victories bigint NOT NULL CHECK(victories>0),
 ruleset_id text NOT NULL REFERENCES rulesets(id),
 PRIMARY KEY(attacker_id,defender_id),CHECK(attacker_id<>defender_id)
);
CREATE TABLE vault_accounts (
 character_id uuid PRIMARY KEY REFERENCES characters(id),
 balance integer NOT NULL DEFAULT 0 CHECK(balance>=0)
);
CREATE TABLE vault_entries (
 id uuid PRIMARY KEY,character_id uuid NOT NULL REFERENCES characters(id),command_id uuid,
 amount integer NOT NULL CHECK(amount<>0),balance_after integer NOT NULL CHECK(balance_after>=0),
 reason text NOT NULL CHECK(reason IN ('deposit','withdrawal','development_endowment')),
 ruleset_id text NOT NULL REFERENCES rulesets(id),created_at timestamptz NOT NULL,
 UNIQUE(character_id,command_id)
);
CREATE INDEX vault_entries_history ON vault_entries(character_id,created_at DESC,id DESC);
-- Record explicitly endowed, versioned NPC estates separately from normal
-- purchases. Acquisitions still use the real inventory/land and income tables.
CREATE TABLE development_bot_estates (
 character_id uuid NOT NULL REFERENCES development_bots(character_id),
 population_version text NOT NULL,property_id text NOT NULL,quantity integer NOT NULL CHECK(quantity>0),
 PRIMARY KEY(character_id,population_version,property_id)
);
