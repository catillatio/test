-- Exact existing achievement reconciliation predicate; no balances or receipts change.
-- Non-achievement history is intentionally absent from this small lookup index.
CREATE INDEX achievement_gold_retained_lookup_idx
 ON treasury_retained_events(character_id,command_id) WHERE reason='achievement_gold';
