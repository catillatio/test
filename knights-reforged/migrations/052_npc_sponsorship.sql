-- Empty evidence/hold tables only. No placement or scheduler is enabled.
CREATE TABLE npc_sponsorship_windows(decision_window bigint PRIMARY KEY,command_id uuid NOT NULL UNIQUE,status text NOT NULL,bounty_id uuid REFERENCES bounties(id),created_at timestamptz NOT NULL);
CREATE TABLE npc_sponsored_bounties(bounty_id uuid PRIMARY KEY REFERENCES bounties(id),decision_window bigint NOT NULL UNIQUE REFERENCES npc_sponsorship_windows(decision_window) DEFERRABLE INITIALLY DEFERRED,policy_id text NOT NULL,sponsor_id uuid NOT NULL REFERENCES characters(id),target_id uuid NOT NULL REFERENCES characters(id),created_at timestamptz NOT NULL);
CREATE INDEX npc_sponsored_target ON npc_sponsored_bounties(target_id,created_at DESC);
CREATE TABLE npc_sponsorship_holds(character_id uuid PRIMARY KEY REFERENCES characters(id),until_at timestamptz NOT NULL);
CREATE FUNCTION preserve_npc_sponsorship_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'NPC sponsorship decisions are immutable'; END $$;
CREATE TRIGGER npc_sponsorship_window_immutable BEFORE UPDATE OR DELETE ON npc_sponsorship_windows FOR EACH ROW EXECUTE FUNCTION preserve_npc_sponsorship_receipt();
CREATE TRIGGER npc_sponsorship_origin_immutable BEFORE UPDATE OR DELETE ON npc_sponsored_bounties FOR EACH ROW EXECUTE FUNCTION preserve_npc_sponsorship_receipt();
