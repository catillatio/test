-- No memberships or balance updates are installed by this migration.
CREATE TABLE npc_army_adjustments(command_id uuid PRIMARY KEY,character_id uuid NOT NULL REFERENCES characters(id),policy_id text NOT NULL,plan_digest text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL);
CREATE TABLE npc_army_memberships(id uuid PRIMARY KEY,character_id uuid NOT NULL REFERENCES characters(id),command_id uuid NOT NULL REFERENCES npc_army_adjustments(command_id),quantity integer NOT NULL CHECK(quantity>0),unit_cost integer NOT NULL CHECK(unit_cost>0),gold_cost bigint NOT NULL CHECK(gold_cost=quantity::bigint*unit_cost),created_at timestamptz NOT NULL);
CREATE INDEX npc_army_memberships_character ON npc_army_memberships(character_id);
CREATE FUNCTION preserve_npc_army_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'NPC funded army receipts are immutable'; END $$;
CREATE TRIGGER npc_army_adjustment_immutable BEFORE UPDATE OR DELETE ON npc_army_adjustments FOR EACH ROW EXECUTE FUNCTION preserve_npc_army_receipt();
CREATE TRIGGER npc_army_membership_immutable BEFORE UPDATE OR DELETE ON npc_army_memberships FOR EACH ROW EXECUTE FUNCTION preserve_npc_army_receipt();
