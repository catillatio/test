-- Additive only. Never recompute historical XP, levels, balances or receipts.
CREATE TABLE pvp_xp_events (
 battle_id uuid PRIMARY KEY REFERENCES battles(id) DEFERRABLE INITIALLY DEFERRED,
 recipient_account_id uuid NOT NULL REFERENCES accounts(id),
 opponent_account_id uuid NOT NULL REFERENCES accounts(id),
 recipient_id uuid NOT NULL REFERENCES characters(id),
 role text NOT NULL CHECK (role IN ('attacker','defender')),
 policy_id text NOT NULL REFERENCES rulesets(id),
 recipient_level integer NOT NULL CHECK (recipient_level>0),
 baseline_xp integer NOT NULL CHECK (baseline_xp>=1),
 bonus_xp integer NOT NULL CHECK (bonus_xp BETWEEN 0 AND 200),
 budget_units integer NOT NULL CHECK (budget_units BETWEEN 0 AND 10000),
 created_at timestamptz NOT NULL,
 CHECK (recipient_account_id<>opponent_account_id),
 CHECK ((bonus_xp=0)=(budget_units=0))
);
CREATE INDEX pvp_xp_recipient_window ON pvp_xp_events(recipient_account_id,created_at);
CREATE INDEX pvp_xp_pair_window ON pvp_xp_events(recipient_account_id,opponent_account_id,created_at);
