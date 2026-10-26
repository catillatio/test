-- Storage compatibility only. The active purchase cap remains 1,000; no
-- quantities, FIFO costs, characters, policies or existing business rows change.
ALTER TABLE inventory_entries DROP CONSTRAINT inventory_entries_quantity_check;
ALTER TABLE inventory_entries ADD CONSTRAINT inventory_entries_quantity_check CHECK(quantity BETWEEN 0 AND 5000);
CREATE INDEX inventory_lots_fifo_live ON inventory_lots(inventory_entry_id,acquired_at,id) WHERE remaining_quantity>0;
CREATE INDEX army_links_low_status ON army_links(low_id,status,high_id);
CREATE INDEX army_links_high_status ON army_links(high_id,status,low_id);

-- Empty at installation. Future explicit cutover freezes an existing current
-- transition; no earned levels/XP/skill points or resource timers are rewritten.
CREATE TABLE character_progression_epochs (
 character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
 policy_id text NOT NULL CHECK(policy_id IN ('xp-legacy-1','xp-post50-150-1')),
 boundary_level integer NOT NULL CHECK(boundary_level>0),
 boundary_requirement integer NOT NULL CHECK(boundary_requirement>0),
 starting_progress integer NOT NULL CHECK(starting_progress>=0 AND starting_progress<boundary_requirement),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION preserve_progression_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Progression compatibility metadata is immutable';
END $$;
CREATE TRIGGER immutable_progression_epoch BEFORE UPDATE ON character_progression_epochs
 FOR EACH ROW EXECUTE FUNCTION preserve_progression_epoch();
