CREATE TABLE rulesets (
  id text PRIMARY KEY,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  username varchar(24) NOT NULL UNIQUE CHECK (username = lower(username)),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE characters (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  name varchar(28) NOT NULL,
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  health integer NOT NULL DEFAULT 100 CHECK (health BETWEEN 0 AND 100),
  energy integer NOT NULL DEFAULT 10 CHECK (energy BETWEEN 0 AND 10),
  health_updated_at timestamptz NOT NULL DEFAULT now(),
  energy_updated_at timestamptz NOT NULL DEFAULT now(),
  attack_ready_at timestamptz NOT NULL DEFAULT now(),
  state_version integer NOT NULL DEFAULT 1 CHECK (state_version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  csrf_token char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_account_idx ON sessions(account_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE wallets (
  character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0)
);

CREATE TABLE army_stacks (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  unit_definition_id text NOT NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity BETWEEN 0 AND 20),
  PRIMARY KEY(character_id, unit_definition_id)
);

CREATE TABLE inventory_entries (
  id uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_definition_id text NOT NULL,
  ruleset_id text NOT NULL REFERENCES rulesets(id),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(character_id, item_definition_id),
  UNIQUE(id, character_id)
);

CREATE TABLE equipment_slots (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot text NOT NULL CHECK (slot = 'weapon'),
  inventory_entry_id uuid NOT NULL UNIQUE,
  PRIMARY KEY(character_id, slot),
  FOREIGN KEY(inventory_entry_id, character_id)
    REFERENCES inventory_entries(id, character_id) ON DELETE CASCADE
);

CREATE TABLE command_receipts (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  command_id uuid NOT NULL,
  kind text NOT NULL,
  intent_hash char(64) NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id, command_id)
);

CREATE TABLE quest_runs (
  id uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quest_id text NOT NULL,
  ruleset_id text NOT NULL REFERENCES rulesets(id),
  energy_spent integer NOT NULL CHECK (energy_spent > 0),
  gold_reward integer NOT NULL CHECK (gold_reward >= 0),
  xp_reward integer NOT NULL CHECK (xp_reward >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE character_quest_progress (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quest_id text NOT NULL,
  completions integer NOT NULL DEFAULT 0 CHECK (completions >= 0),
  PRIMARY KEY(character_id, quest_id)
);

CREATE TABLE battles (
  id uuid PRIMARY KEY,
  attacker_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  defender_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  ruleset_id text NOT NULL REFERENCES rulesets(id),
  outcome text NOT NULL CHECK(outcome IN ('attacker_win', 'defender_win')),
  snapshot jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(attacker_id <> defender_id)
);
CREATE INDEX battles_attacker_idx ON battles(attacker_id, created_at DESC);
CREATE INDEX battles_defender_idx ON battles(defender_id, created_at DESC);

CREATE TABLE economy_transactions (
  id uuid PRIMARY KEY,
  command_id uuid,
  reason text NOT NULL,
  ruleset_id text NOT NULL REFERENCES rulesets(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE economy_entries (
  id uuid PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES economy_transactions(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount <> 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  UNIQUE(transaction_id, character_id)
);
CREATE INDEX economy_character_idx ON economy_entries(character_id);
