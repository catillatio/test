-- Additive: retain every existing character, allocation, holding, session and journal.
ALTER TABLE characters ADD COLUMN calling_changed_at timestamptz;
ALTER TABLE accounts ADD COLUMN login_disabled boolean NOT NULL DEFAULT false;
CREATE TABLE calling_changes (
 id uuid PRIMARY KEY,character_id uuid NOT NULL REFERENCES characters(id),
 old_calling varchar(24) NOT NULL,new_calling varchar(24) NOT NULL,
 gold_cost integer NOT NULL CHECK(gold_cost>=0),command_id uuid NOT NULL,
 ruleset_id text NOT NULL REFERENCES rulesets(id),created_at timestamptz NOT NULL,
 UNIQUE(character_id,command_id)
);
CREATE TABLE development_bots (
 character_id uuid PRIMARY KEY REFERENCES characters(id),
 population_key text NOT NULL UNIQUE,population_version text NOT NULL,
 tier text NOT NULL CHECK(tier IN ('green','seasoned','elite')),
 active boolean NOT NULL DEFAULT true,refilled_at timestamptz NOT NULL,recovered_at timestamptz NOT NULL,
 ruleset_id text NOT NULL REFERENCES rulesets(id)
);
CREATE TABLE development_accounts (
 account_id uuid PRIMARY KEY REFERENCES accounts(id),purpose text NOT NULL UNIQUE CHECK(purpose='persistent-dev'),
 baseline_version text NOT NULL,initialized_at timestamptz NOT NULL,reset_at timestamptz NOT NULL
);
CREATE TABLE development_bot_events (
 id uuid PRIMARY KEY,character_id uuid NOT NULL REFERENCES development_bots(character_id),
 kind text NOT NULL CHECK(kind IN ('provision','refresh','recovery')),details jsonb NOT NULL,created_at timestamptz NOT NULL
);
CREATE TABLE development_account_resets (
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES development_accounts(account_id),
 ruleset_id text NOT NULL REFERENCES rulesets(id),gold_before integer NOT NULL,gold_after integer NOT NULL,
 army_before integer NOT NULL,army_after integer NOT NULL,created_at timestamptz NOT NULL
);
CREATE TABLE bounties (
 id uuid PRIMARY KEY,sponsor_id uuid NOT NULL REFERENCES characters(id),target_id uuid NOT NULL REFERENCES characters(id),
 amount integer NOT NULL CHECK(amount BETWEEN 100 AND 10000),fee integer NOT NULL CHECK(fee>=10),
 status varchar(12) NOT NULL CHECK(status IN ('active','claimed','expired','canceled')),
 ruleset_id text NOT NULL REFERENCES rulesets(id),command_id uuid NOT NULL,
 created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,settled_at timestamptz,
 claimant_id uuid REFERENCES characters(id),battle_id uuid REFERENCES battles(id),
 CHECK(sponsor_id<>target_id),CHECK(expires_at>created_at),
 CHECK((status='active' AND settled_at IS NULL AND claimant_id IS NULL AND battle_id IS NULL)
    OR (status='claimed' AND settled_at IS NOT NULL AND claimant_id IS NOT NULL AND battle_id IS NOT NULL AND claimant_id<>sponsor_id AND claimant_id<>target_id)
    OR (status IN ('expired','canceled') AND settled_at IS NOT NULL AND claimant_id IS NULL AND battle_id IS NULL)),
 UNIQUE(sponsor_id,command_id)
);
CREATE UNIQUE INDEX bounties_one_active_target ON bounties(target_id) WHERE status='active';
CREATE INDEX bounties_expiry ON bounties(expires_at) WHERE status='active';
CREATE INDEX bounties_sponsor_history ON bounties(sponsor_id,created_at);
CREATE INDEX bounties_target_history ON bounties(target_id,created_at);
CREATE INDEX bounties_claimant_history ON bounties(claimant_id,settled_at) WHERE status='claimed';
CREATE TABLE bounty_events (
 id uuid PRIMARY KEY,bounty_id uuid NOT NULL REFERENCES bounties(id),
 kind varchar(12) NOT NULL CHECK(kind IN ('placed','claimed','expired','canceled')),
 character_id uuid NOT NULL REFERENCES characters(id),amount integer NOT NULL CHECK(amount>0),
 command_id uuid,created_at timestamptz NOT NULL,UNIQUE(bounty_id,kind)
);
