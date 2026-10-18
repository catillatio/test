-- Deployment journal only. No existing player, catalog or financial row changes.
CREATE TABLE private_alpha_initializations (
 id text PRIMARY KEY,
 dev_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
 content_ruleset_id text NOT NULL REFERENCES rulesets(id),
 bot_catalog_id text NOT NULL REFERENCES rulesets(id),
 bot_count integer NOT NULL CHECK(bot_count=450),
 railway_service_id text NOT NULL,
 railway_environment_id text NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION preserve_private_alpha_initialization() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Private alpha initialization history is immutable';
END;
$$;
CREATE TRIGGER private_alpha_initializations_immutable
BEFORE UPDATE OR DELETE ON private_alpha_initializations
FOR EACH ROW EXECUTE FUNCTION preserve_private_alpha_initialization();
