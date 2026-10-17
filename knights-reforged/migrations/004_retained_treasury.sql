-- Sales and rewards share Land's existing overflow-safe treasury. Preserve all
-- existing retained gold and journal subsequent changes without changing wallets.
CREATE TABLE treasury_retained_events (
  id uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  amount numeric(40,0) NOT NULL CHECK(amount<>0),
  balance_after numeric(40,0) NOT NULL CHECK(balance_after>=0),
  reason text NOT NULL,
  command_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO treasury_retained_events(id,character_id,amount,balance_after,reason)
  SELECT md5(character_id::text||':alpha-retained-opening')::uuid,character_id,pending_gold,pending_gold,'legacy_opening'
  FROM land_accounts WHERE pending_gold>0;
