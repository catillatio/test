-- Alpha-0.2 is registered alongside its immutable predecessor by migrate.ts.
-- Catalog entries use existing quantity inventory, loot and Land tables.
-- No character XP, levels, inventory, holdings, payment clocks or history rows
-- are rewritten. New level-milestone entitlements use their unique award IDs.
CREATE INDEX quest_runs_owner_time_idx ON quest_runs(character_id,created_at DESC);
CREATE INDEX inventory_transactions_owner_time_idx ON inventory_transactions(character_id,created_at DESC);
CREATE INDEX land_sales_owner_time_idx ON land_sales(character_id,created_at DESC);
