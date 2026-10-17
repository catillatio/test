-- Additive: no changes to accounts, existing balances, or recreation-0.1 rules.
CREATE TABLE land_accounts (
  character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  pending_gold numeric(40,0) NOT NULL DEFAULT 0 CHECK (pending_gold >= 0)
);

-- Each purchase is a batch with its own full-hour clock and immutable rate
-- snapshot. A later purchase never earns for time before it was acquired.
CREATE TABLE land_holdings (
  id uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  property_id varchar(64) NOT NULL,
  property_name varchar(80) NOT NULL,
  ruleset_id text NOT NULL REFERENCES rulesets(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price integer NOT NULL CHECK (unit_price > 0),
  hourly_income integer NOT NULL CHECK (hourly_income >= 0),
  hourly_upkeep integer NOT NULL CHECK (hourly_upkeep BETWEEN 0 AND hourly_income),
  interval_seconds integer NOT NULL CHECK (interval_seconds BETWEEN 1 AND 86400),
  acquired_at timestamptz NOT NULL,
  accrued_through timestamptz NOT NULL,
  CHECK (accrued_through >= acquired_at)
);
CREATE INDEX land_holdings_character_idx ON land_holdings(character_id, acquired_at, id);

-- An offline catch-up may cover many hours in one row. Character/holding locks
-- serialize settlements; this key additionally rejects replay of a paid range.
CREATE TABLE land_income_settlements (
  holding_id uuid NOT NULL REFERENCES land_holdings(id) ON DELETE CASCADE,
  period_start_at timestamptz NOT NULL,
  period_end_at timestamptz NOT NULL,
  interval_count bigint NOT NULL CHECK (interval_count > 0),
  gross_gold numeric(40,0) NOT NULL CHECK (gross_gold >= 0),
  upkeep_gold numeric(40,0) NOT NULL CHECK (upkeep_gold >= 0),
  net_gold numeric(40,0) NOT NULL CHECK (net_gold = gross_gold - upkeep_gold AND net_gold >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(holding_id, period_start_at),
  CHECK (period_end_at > period_start_at)
);
