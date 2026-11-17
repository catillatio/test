-- Exact existing achievement reconciliation predicate; no balances or receipts change.
-- Non-achievement history is intentionally absent from this small lookup index.
-- Never queue this DDL behind an active writer. The local 1.11m-row build was
-- 73–101ms; a 10s fail-closed ceiling leaves headroom without unbounded blocking.
-- Preserve any stricter existing statement timeout, and reset at transaction end.
-- Bound the whole lock-holding transaction too, including time spent in Node
-- after index creation. Read the GUC first to fail closed on unsupported servers.
-- Do not reset a stricter existing transaction timer by setting the same value.
SELECT pg_catalog.current_setting('transaction_timeout');
SELECT pg_catalog.set_config('transaction_timeout','15000',true)
 FROM pg_catalog.pg_settings WHERE name='transaction_timeout'
 AND (setting::bigint=0 OR setting::bigint>15000);
SELECT pg_catalog.set_config('statement_timeout',
 LEAST(COALESCE(NULLIF(setting::bigint,0),10000),10000)::text,true)
 FROM pg_catalog.pg_settings WHERE name='statement_timeout';
LOCK TABLE treasury_retained_events IN SHARE MODE NOWAIT;
CREATE INDEX achievement_gold_retained_lookup_idx
 ON treasury_retained_events(character_id,command_id) WHERE reason='achievement_gold';
