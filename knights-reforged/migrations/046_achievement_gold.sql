-- New proposal only; no historical achievement or balance is rewritten.
CREATE TABLE achievement_gold_state(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO achievement_gold_state(singleton,enabled) VALUES(true,false);
CREATE TABLE achievement_gold_receipts(
 character_id uuid NOT NULL REFERENCES characters(id),achievement_id text NOT NULL,
 reward_policy_id text NOT NULL,command_id uuid NOT NULL UNIQUE,amount bigint NOT NULL CHECK(amount>0),
 credited_gold bigint NOT NULL CHECK(credited_gold>=0),retained_gold numeric NOT NULL CHECK(retained_gold>=0),
 created_at timestamptz NOT NULL,PRIMARY KEY(character_id,achievement_id),CHECK(credited_gold+retained_gold=amount));
CREATE FUNCTION preserve_achievement_gold_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Achievement payment receipts are immutable'; END $$;
CREATE TRIGGER achievement_gold_receipt_immutable BEFORE UPDATE OR DELETE ON achievement_gold_receipts FOR EACH ROW EXECUTE FUNCTION preserve_achievement_gold_receipt();
