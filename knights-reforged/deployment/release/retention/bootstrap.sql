-- OWNER-RUN ONLY in the EXISTING worker maintenance database on KingdomReleaseCopy.
-- Never run from migrations, game startup, or the release worker.
BEGIN;
CREATE ROLE kc_retention_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE kc_release_copy_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE kc_retention_runtime LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT kc_release_copy_owner TO kc_retention_runtime;
CREATE SCHEMA release_retention AUTHORIZATION kc_retention_owner;
REVOKE ALL ON SCHEMA release_retention FROM PUBLIC;
SET LOCAL ROLE kc_retention_owner;
CREATE TABLE release_retention.copies (
 name text PRIMARY KEY CHECK (name ~ '^kc_[a-f0-9]{32}_restore_test$'),
 database_oid oid NOT NULL UNIQUE,
 registered_by name NOT NULL DEFAULT session_user,
 owner_name text NOT NULL CHECK (owner_name = 'kc_release_copy_owner'),
 verified_at timestamptz NOT NULL,
 first_observed_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (verified_at <= first_observed_at),
 evidence jsonb NOT NULL,
 evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE TABLE release_retention.pins (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor name NOT NULL DEFAULT session_user,
 name text NOT NULL REFERENCES release_retention.copies(name),
 pinned boolean NOT NULL,
 reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500)
);
CREATE INDEX pins_latest ON release_retention.pins(name,sequence DESC);
CREATE TABLE release_retention.audit (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor name NOT NULL DEFAULT session_user,
 approval_id text NOT NULL CHECK (approval_id ~ '^[a-f0-9-]{36}$'),
 plan_sha256 text NOT NULL CHECK (plan_sha256 ~ '^[a-f0-9]{64}$'),
 name text NOT NULL REFERENCES release_retention.copies(name),
 database_oid oid NOT NULL,
 event text NOT NULL CHECK (event IN ('intent','deleted','absent','refused')),
 measured_bytes bigint NOT NULL CHECK (measured_bytes >= 0),
 UNIQUE (approval_id,name,event)
);
CREATE FUNCTION release_retention.no_rewrite() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Retention history is append-only'; END $$;
CREATE TRIGGER copies_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON release_retention.copies FOR EACH STATEMENT EXECUTE FUNCTION release_retention.no_rewrite();
CREATE TRIGGER pins_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON release_retention.pins FOR EACH STATEMENT EXECUTE FUNCTION release_retention.no_rewrite();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON release_retention.audit FOR EACH STATEMENT EXECUTE FUNCTION release_retention.no_rewrite();
CREATE FUNCTION release_retention.record_event(a text,p text,n text,o oid,e text,b bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM release_retention.copies WHERE name=n AND database_oid=o)
 OR EXISTS (SELECT 1 FROM release_retention.audit WHERE approval_id=a AND (plan_sha256<>p OR (name=n AND database_oid<>o)))
 THEN RAISE EXCEPTION 'Retention journal identity mismatch'; END IF;
 INSERT INTO release_retention.audit(approval_id,plan_sha256,name,database_oid,event,measured_bytes)
 VALUES(a,p,n,o,e,b) ON CONFLICT (approval_id,name,event) DO NOTHING;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA release_retention FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA release_retention FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA release_retention FROM PUBLIC;
GRANT USAGE ON SCHEMA release_retention TO kc_retention_runtime;
GRANT SELECT ON release_retention.copies,release_retention.pins,release_retention.audit TO kc_retention_runtime;
GRANT EXECUTE ON FUNCTION release_retention.record_event(text,text,text,oid,text,bigint) TO kc_retention_runtime;
RESET ROLE;
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO kc_retention_runtime',current_database()); END $$;
GRANT EXECUTE ON FUNCTION pg_control_system() TO kc_retention_runtime;
COMMIT;
