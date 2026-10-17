-- Existing early-alpha events remain intact. Unknown old event rates are left
-- NULL; new events explicitly record their immutable ruleset and accrual rate.
ALTER TABLE maintenance_events ADD COLUMN hourly_rate integer CHECK(hourly_rate>=0);
ALTER TABLE maintenance_events ADD COLUMN ruleset_id text REFERENCES rulesets(id);
CREATE TABLE maintenance_rate_events (
  id uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  previous_rate integer NOT NULL CHECK(previous_rate>=0),
  hourly_rate integer NOT NULL CHECK(hourly_rate>=0),
  paused_after boolean NOT NULL,
  reserve_after numeric(40,0) NOT NULL CHECK(reserve_after>=0),
  ruleset_id text NOT NULL REFERENCES rulesets(id),
  command_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(character_id,command_id)
);
