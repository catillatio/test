-- Widen only; never normalize or rewrite an existing player's display name.
ALTER TABLE characters ALTER COLUMN name TYPE varchar(96);

-- Acceptance notifications start at installation, independently of 021's
-- attack/comment baseline. Prior acceptance events never become unread.
CREATE TABLE army_attention_starts (
 character_id uuid PRIMARY KEY REFERENCES notification_state(character_id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO army_attention_starts(character_id) SELECT character_id FROM notification_state;
CREATE FUNCTION start_army_acceptance_attention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO army_attention_starts(character_id) VALUES(NEW.character_id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER army_acceptance_attention_start AFTER INSERT ON notification_state
 FOR EACH ROW EXECUTE FUNCTION start_army_acceptance_attention();
ALTER TABLE notification_reads DROP CONSTRAINT notification_reads_kind_check;
ALTER TABLE notification_reads ADD CONSTRAINT notification_reads_kind_check
 CHECK(kind IN ('attack','comment','army_accepted'));
CREATE INDEX army_accepted_attention ON army_events(target_id,created_at,id) WHERE kind='accepted';

-- Only rejection metadata is retained: no rejected message/name/password,
-- profanity specimen, credentials or public moderation endpoint.
CREATE TABLE content_policy_rejections (
 id uuid PRIMARY KEY,
 character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
 scope text NOT NULL CHECK(scope IN ('name','comment','broadcast')),
 policy_id text NOT NULL CHECK(policy_id='realm-content-1'),
 rule_id text NOT NULL CHECK(rule_id IN ('blocked_language','reserved_identity')),
 command_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX content_policy_retry_identity ON content_policy_rejections(character_id,command_id,scope)
 WHERE command_id IS NOT NULL;
CREATE INDEX content_policy_review ON content_policy_rejections(created_at,id);
