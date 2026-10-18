-- Additive only. No account, balance, inventory, tutorial or historical edits.
CREATE TABLE sound_preferences (
 character_id uuid PRIMARY KEY REFERENCES characters(id),
 enabled boolean NOT NULL DEFAULT false,
 volume integer NOT NULL DEFAULT 55 CHECK(volume BETWEEN 0 AND 100),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX bot_income_due ON income_cycles(next_payment_at,character_id);
-- Bounded latest-payment UI pointer; no scanning a growing financial journal.
CREATE TABLE character_income_feedback (
 character_id uuid PRIMARY KEY REFERENCES characters(id),
 transaction_id uuid NOT NULL REFERENCES economy_transactions(id),
 gold integer NOT NULL CHECK(gold>0),created_at timestamptz NOT NULL
);
CREATE FUNCTION remember_land_payment_sound() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.amount>0 AND EXISTS(SELECT 1 FROM economy_transactions WHERE id=NEW.transaction_id AND reason='land_income') THEN
  INSERT INTO character_income_feedback(character_id,transaction_id,gold,created_at)
   SELECT NEW.character_id,t.id,NEW.amount,t.created_at FROM economy_transactions t WHERE t.id=NEW.transaction_id
   ON CONFLICT(character_id) DO UPDATE SET transaction_id=EXCLUDED.transaction_id,gold=EXCLUDED.gold,created_at=EXCLUDED.created_at;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER land_payment_feedback AFTER INSERT ON economy_entries FOR EACH ROW EXECUTE FUNCTION remember_land_payment_sound();
