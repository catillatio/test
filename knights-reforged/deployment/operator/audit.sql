-- Separately approved operator setup only; NOT a game migration.
-- No existing account, gameplay, moderation or schema_migrations row is modified.
CREATE TABLE owner_operator_schema (
 id integer PRIMARY KEY CHECK(id=1), definition_sha256 text NOT NULL CHECK(definition_sha256 ~ '^[a-f0-9]{64}$'),
 installed_by varchar(80) NOT NULL, source_sha text NOT NULL, github_run_id text NOT NULL,
 installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE owner_operator_actions (
 authorization_id uuid PRIMARY KEY,
 operation text NOT NULL CHECK(operation IN ('name_correction','gray_broadcast_hide')),
 review_sha256 text NOT NULL UNIQUE CHECK(review_sha256 ~ '^[a-f0-9]{64}$'),
 character_id uuid NOT NULL REFERENCES characters(id),
 account_id uuid NOT NULL REFERENCES accounts(id),
 message_id uuid REFERENCES realm_messages(id),
 field text NOT NULL CHECK(field IN ('account_username','character_name','message_status')),
 before_state jsonb NOT NULL,
 after_state jsonb NOT NULL,
 operator_label varchar(80) NOT NULL,
 source_sha text NOT NULL CHECK(source_sha ~ '^[a-f0-9]{40}$'),
 github_run_id text NOT NULL CHECK(github_run_id ~ '^[0-9]{1,20}$'),
 github_run_attempt integer NOT NULL CHECK(github_run_attempt>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((operation='name_correction' AND message_id IS NULL AND field IN ('account_username','character_name')) OR
       (operation='gray_broadcast_hide' AND message_id IS NOT NULL AND field='message_status'))
);
CREATE FUNCTION preserve_owner_operator_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Owner operator audit is append-only'; END;
$$;
CREATE TRIGGER owner_operator_actions_immutable BEFORE UPDATE OR DELETE ON owner_operator_actions
 FOR EACH ROW EXECUTE FUNCTION preserve_owner_operator_audit();
CREATE TRIGGER owner_operator_actions_no_truncate BEFORE TRUNCATE ON owner_operator_actions
 FOR EACH STATEMENT EXECUTE FUNCTION preserve_owner_operator_audit();

CREATE TRIGGER owner_operator_schema_immutable BEFORE UPDATE OR DELETE ON owner_operator_schema
 FOR EACH ROW EXECUTE FUNCTION preserve_owner_operator_audit();
CREATE TRIGGER owner_operator_schema_no_truncate BEFORE TRUNCATE ON owner_operator_schema
 FOR EACH STATEMENT EXECUTE FUNCTION preserve_owner_operator_audit();
