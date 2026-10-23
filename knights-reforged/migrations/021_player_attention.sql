-- Additive UX state only. Never rewrite gameplay, messages, battles or preferences.
CREATE TABLE notification_state (
 character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- A returning realm starts observing now, not at the beginning of its history.
INSERT INTO notification_state(character_id) SELECT id FROM characters;
CREATE FUNCTION start_character_attention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO notification_state(character_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER character_attention_start AFTER INSERT ON characters
 FOR EACH ROW EXECUTE FUNCTION start_character_attention();
CREATE TABLE notification_reads (
 character_id uuid NOT NULL REFERENCES notification_state(character_id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('attack','comment')),
 event_id uuid NOT NULL,read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(character_id,kind,event_id)
);
CREATE INDEX realm_comments_attention ON realm_messages(profile_id,created_at,id)
 WHERE channel='comment' AND status='visible';
CREATE INDEX army_pending_attention_low ON army_links(low_id) WHERE status='pending';
CREATE INDEX army_pending_attention_high ON army_links(high_id) WHERE status='pending';
CREATE INDEX characters_level_identity ON characters(attained_level,id);
