-- OWNER-RUN ONLY in the EXISTING worker maintenance database on KingdomReleaseCopy.
-- Never run from migrations, game startup, or the release worker.
BEGIN;
CREATE ROLE kc_retention_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE kc_release_copy_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE kc_retention_runtime LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE kc_retention_authorizer LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
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
-- Only the separate authorizer can register the result of Ed25519 validation.
-- PostgreSQL does not itself validate that signature. The retained envelope,
-- plan and state allow an independent auditor to verify it after expiry.
CREATE TABLE release_retention.permits (
 approval_id text PRIMARY KEY CHECK (approval_id ~ '^[a-f0-9-]{36}$'),
 registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 registered_by name NOT NULL DEFAULT session_user,
 expires_at timestamptz NOT NULL CHECK (expires_at > registered_at AND expires_at <= registered_at + interval '5 minutes'),
 plan_sha256 text NOT NULL CHECK (plan_sha256 ~ '^[a-f0-9]{64}$'),
 state_sha256 text NOT NULL CHECK (state_sha256 ~ '^[a-f0-9]{64}$'),
 encoded_approval text NOT NULL CHECK (length(encoded_approval) BETWEEN 1 AND 16000),
 plan jsonb NOT NULL CHECK (jsonb_typeof(plan)='object'),
 state jsonb NOT NULL CHECK (jsonb_typeof(state)='object'),
 cluster_identifier text NOT NULL,
 maintenance_database name NOT NULL
);
CREATE TABLE release_retention.audit (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor name NOT NULL DEFAULT session_user,
 backend_pid integer NOT NULL DEFAULT pg_backend_pid(),
 approval_id text NOT NULL CHECK (approval_id ~ '^[a-f0-9-]{36}$'),
 plan_sha256 text NOT NULL CHECK (plan_sha256 ~ '^[a-f0-9]{64}$'),
 name text NOT NULL REFERENCES release_retention.copies(name),
 database_oid oid NOT NULL,
 event text NOT NULL CHECK (event IN ('intent','deleted','absent','refused')),
 measured_bytes bigint NOT NULL CHECK (measured_bytes >= 0),
 UNIQUE (approval_id,name,event),
 FOREIGN KEY(approval_id) REFERENCES release_retention.permits(approval_id),
 CHECK (event IN ('intent','deleted') OR measured_bytes=0)
);
CREATE UNIQUE INDEX audit_one_outcome ON release_retention.audit(approval_id,name) WHERE event<>'intent';
CREATE UNIQUE INDEX audit_single_deletion_credit ON release_retention.audit(database_oid) WHERE event='deleted';
CREATE FUNCTION release_retention.no_rewrite() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$ BEGIN RAISE EXCEPTION 'Retention history is append-only'; END $$;
CREATE TRIGGER copies_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON release_retention.copies FOR EACH STATEMENT EXECUTE FUNCTION release_retention.no_rewrite();
CREATE TRIGGER pins_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON release_retention.pins FOR EACH STATEMENT EXECUTE FUNCTION release_retention.no_rewrite();
CREATE TRIGGER permits_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON release_retention.permits FOR EACH STATEMENT EXECUTE FUNCTION release_retention.no_rewrite();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON release_retention.audit FOR EACH STATEMENT EXECUTE FUNCTION release_retention.no_rewrite();
-- State observations, not proof of which process issued DROP or physical bytes
-- reclaimed. Native database ownership cannot be constrained by this function.
CREATE FUNCTION release_retention.record_event(a text,p text,n text,o oid,e text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE permit record; target jsonb; intended record; outcome record; amount bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=61824087 AND objsubid=1 AND mode='ExclusiveLock' AND pid=pg_backend_pid() AND granted)
 THEN RAISE EXCEPTION 'Retention session lock required'; END IF;
 SELECT g.* INTO permit FROM release_retention.permits g WHERE g.approval_id=a FOR UPDATE;
 SELECT item.value INTO target FROM jsonb_array_elements(permit.plan->'rows') AS item(value)
 WHERE item.value->>'name'=n AND item.value->>'oid'=o::text AND item.value->'eligible'='true'::jsonb;
 IF target IS NULL OR permit IS NULL OR permit.plan_sha256<>p
 OR permit.maintenance_database<>current_database()
 OR permit.cluster_identifier<>(SELECT system_identifier::text FROM pg_control_system())
 OR NOT EXISTS(SELECT 1 FROM release_retention.copies c WHERE c.name=n AND c.database_oid=o AND c.evidence_sha256=target->>'evidenceSha256')
 OR e NOT IN ('intent','deleted','absent','refused')
 THEN RAISE EXCEPTION 'Registered retention permit required'; END IF;
 SELECT h.* INTO intended FROM release_retention.audit h WHERE h.approval_id=a AND h.name=n AND h.event='intent';
 SELECT h.* INTO outcome FROM release_retention.audit h WHERE h.approval_id=a AND h.name=n AND h.event<>'intent';
 IF outcome IS NOT NULL THEN
  IF (e=outcome.event OR (e='absent' AND outcome.event IN ('deleted','absent')))
  AND ((outcome.event='refused' AND EXISTS(SELECT 1 FROM pg_database WHERE datname=n AND oid=o))
    OR (outcome.event<>'refused' AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=n OR oid=o)))
  THEN RETURN outcome.measured_bytes; END IF;
  RAISE EXCEPTION 'Retention outcome is terminal';
 END IF;
 IF e='intent' THEN
  IF permit.expires_at<=clock_timestamp()
   OR NOT EXISTS(SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=n AND d.oid=o AND NOT d.datistemplate AND r.rolname='kc_release_copy_owner')
   OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE datid=o)
   OR coalesce((SELECT h.pinned FROM release_retention.pins h WHERE h.name=n ORDER BY h.sequence DESC LIMIT 1),false)
   OR permit.state->>'currentRecoveryCopy'=n
   OR permit.state->'pinnedCopies' ? n OR permit.state->'pendingCopies' ? n
  THEN RAISE EXCEPTION 'Retention intent is not eligible'; END IF;
  IF intended IS NOT NULL THEN RETURN intended.measured_bytes; END IF;
  amount:=pg_database_size(o); -- Never accept caller-supplied byte figures.
 ELSE
  IF intended IS NULL THEN RAISE EXCEPTION 'A durable intent must precede an outcome'; END IF;
  IF e IN ('deleted','absent') THEN
   -- A rename, replacement, or still-existing database is not a deletion.
   IF EXISTS(SELECT 1 FROM pg_database WHERE datname=n OR oid=o) THEN RAISE EXCEPTION 'Database absence not established'; END IF;
   IF e='deleted' AND EXISTS(SELECT 1 FROM release_retention.audit WHERE database_oid=o AND event='deleted')
   THEN RAISE EXCEPTION 'Deletion credit already recorded; reconcile absence instead'; END IF;
   amount:=CASE WHEN e='deleted' THEN intended.measured_bytes ELSE 0 END;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=n AND oid=o) THEN RAISE EXCEPTION 'Refusal state not established'; END IF;
   amount:=0;
  END IF;
 END IF;
 INSERT INTO release_retention.audit(approval_id,plan_sha256,name,database_oid,event,measured_bytes)
 VALUES(a,p,n,o,e,amount);
 RETURN amount;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA release_retention FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA release_retention FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA release_retention FROM PUBLIC;
GRANT USAGE ON SCHEMA release_retention TO kc_retention_runtime;
GRANT SELECT ON release_retention.copies,release_retention.pins,release_retention.audit,release_retention.permits TO kc_retention_runtime;
GRANT USAGE ON SCHEMA release_retention TO kc_retention_authorizer;
GRANT SELECT ON ALL TABLES IN SCHEMA release_retention TO kc_retention_authorizer;
GRANT INSERT(approval_id,expires_at,plan_sha256,state_sha256,encoded_approval,plan,state,cluster_identifier,maintenance_database) ON release_retention.permits TO kc_retention_authorizer;
GRANT EXECUTE ON FUNCTION release_retention.record_event(text,text,text,oid,text) TO kc_retention_runtime;
RESET ROLE;
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO kc_retention_runtime,kc_retention_authorizer',current_database()); END $$;
GRANT EXECUTE ON FUNCTION pg_control_system() TO kc_retention_runtime,kc_retention_authorizer,kc_retention_owner;
COMMIT;
