-- Separate OWNER-RUN opt-in bootstrap in the EXISTING verification maintenance DB.
-- Requires bootstrap.sql; never executed by the worker, migrations or startup.
BEGIN;
CREATE ROLE kc_copy_registrar LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA release_observations AUTHORIZATION kc_retention_owner;
REVOKE ALL ON SCHEMA release_observations FROM PUBLIC;
SET LOCAL ROLE kc_retention_owner;
CREATE TABLE release_observations.verified_copies (
 name text PRIMARY KEY CHECK (name ~ '^kc_[a-f0-9]{32}_restore_test$'),
 database_oid oid NOT NULL UNIQUE,
 observed_owner name NOT NULL,
 cluster_digest text NOT NULL CHECK (cluster_digest ~ '^[a-f0-9]{64}$'),
 job_id text NOT NULL UNIQUE CHECK (job_id ~ '^gh_[0-9]{1,20}_[0-9]{1,5}_[a-f0-9]{32}$'),
 github_run_id text NOT NULL,
 github_run_attempt integer NOT NULL,
 worker_deployment_id uuid NOT NULL,
 evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
 details jsonb NOT NULL,
 first_observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 registered_by name NOT NULL DEFAULT session_user
);
CREATE FUNCTION release_observations.no_rewrite() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$ BEGIN RAISE EXCEPTION 'Copy observations are append-only'; END $$;
CREATE TRIGGER observations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON release_observations.verified_copies FOR EACH STATEMENT EXECUTE FUNCTION release_observations.no_rewrite();
-- A trusted registration-only caller asserts successful report verification.
-- This records observations; it cannot certify recovery, adopt ownership or DROP.
CREATE FUNCTION release_observations.record_verified_copy(p jsonb) RETURNS TABLE(database_oid oid,first_observed_at timestamptz,verified_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE d record; old record; observed timestamptz; cluster text; k text;
BEGIN
 IF jsonb_typeof(p)<>'object' OR p IS NULL THEN RAISE EXCEPTION 'Invalid copy observation'; END IF;
 -- No arbitrary JSON, URLs or provider payloads are retained, including through
 -- direct function calls. Every accepted field has a constrained scalar shape.
 IF (SELECT count(*) FROM jsonb_object_keys(p))<>31 THEN RAISE EXCEPTION 'Invalid observation fields'; END IF;
 FOR k IN SELECT jsonb_object_keys(p) LOOP
  IF k NOT IN ('name','oid','owner','maintenanceDatabase','clusterDigest','sourceClusterDigest','jobId','workerDeploymentId',
   'projectId','environmentId','gameServiceId','workerServiceId','sha','candidateDigest','sourceHost','sourceDatabase','restoreHost',
   'createdAt','expiresAt','backupSha256','encryptedSha256','preservationSha256','reportSha256','evidenceSha256',
   'populationSha256','accounts','bots','existingTablesVerified','passed','migrationReplay','liveDatabaseConnected') OR p->k='null'::jsonb
  THEN RAISE EXCEPTION 'Invalid observation fields'; END IF;
 END LOOP;
 FOR k IN SELECT unnest(ARRAY['clusterDigest','sourceClusterDigest','candidateDigest','backupSha256','encryptedSha256','preservationSha256','reportSha256','evidenceSha256','populationSha256']) LOOP
  IF (p->>k) !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid observation digest'; END IF;
 END LOOP;
 FOR k IN SELECT unnest(ARRAY['projectId','environmentId','gameServiceId','workerServiceId','workerDeploymentId']) LOOP
  PERFORM (p->>k)::uuid;
 END LOOP;
 IF p->>'name' !~ '^kc_[a-f0-9]{32}_restore_test$' OR p->>'oid' !~ '^[1-9][0-9]{0,9}$'
 OR p->>'name'<>'kc_'||substr(encode(sha256(convert_to(p->>'jobId','UTF8')),'hex'),1,32)||'_restore_test'
 OR p->>'jobId' !~ '^gh_[0-9]{1,20}_[0-9]{1,5}_[a-f0-9]{32}$' OR p->>'sha' !~ '^[a-f0-9]{40}$'
 OR p->>'owner' !~ '^[a-zA-Z_][a-zA-Z0-9_$-]{0,62}$'
 OR p->>'sourceDatabase' !~ '^[a-zA-Z0-9_-]{1,63}$' OR p->>'sourceDatabase' LIKE '%\_restore\_test'
 OR p->>'sourceHost' !~ '^[a-z0-9.-]+\.railway\.internal$' OR p->>'restoreHost' !~ '^[a-z0-9.-]+\.railway\.internal$'
 OR p->>'sourceHost'=p->>'restoreHost' OR p->>'sourceClusterDigest'=p->>'clusterDigest'
 OR p->>'maintenanceDatabase'<>current_database()
 OR p->'passed'<>'true'::jsonb OR p->'liveDatabaseConnected'<>'false'::jsonb OR p->>'migrationReplay'<>'unchanged'
 OR (p->>'bots')::int NOT IN (450,900) OR (p->>'accounts')::int<(p->>'bots')::int+1 OR (p->>'existingTablesVerified')::int<60
 OR p->>'createdAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
 OR p->>'expiresAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
 OR (p->>'expiresAt')::timestamptz<=(p->>'createdAt')::timestamptz
 OR (p->>'expiresAt')::timestamptz>(p->>'createdAt')::timestamptz+interval '1 hour'
 OR (p->>'createdAt')::timestamptz>clock_timestamp()+interval '1 minute'
 THEN RAISE EXCEPTION 'Invalid verified-copy observation'; END IF;
 cluster:=encode(sha256(convert_to((SELECT system_identifier::text FROM pg_control_system()),'UTF8')),'hex');
 IF cluster<>p->>'clusterDigest' THEN RAISE EXCEPTION 'Observation cluster mismatch'; END IF;
 -- Registration does not acquire the worker's lock on a second connection.
 -- A separate per-copy transaction lock serializes this append-only operation.
 PERFORM pg_advisory_xact_lock(61824089,hashtext(p->>'name'));
 SELECT c.oid,r.rolname AS owner,c.datistemplate INTO d FROM pg_database c JOIN pg_roles r ON r.oid=c.datdba WHERE c.datname=p->>'name';
 IF d IS NULL OR d.oid<>(p->>'oid')::oid OR d.owner<>p->>'owner' OR d.datistemplate THEN RAISE EXCEPTION 'Observation database identity mismatch'; END IF;
 SELECT c.* INTO old FROM release_observations.verified_copies c WHERE c.name=p->>'name';
 IF old IS NOT NULL THEN
  IF old.details<>p OR old.database_oid<>d.oid THEN RAISE EXCEPTION 'Conflicting copy observation'; END IF;
  RETURN QUERY SELECT old.database_oid,old.first_observed_at,old.verified_at; RETURN;
 END IF;
 IF d.owner='kc_release_copy_owner' OR EXISTS(SELECT 1 FROM release_retention.copies c WHERE c.name=p->>'name' OR c.database_oid=d.oid)
 THEN RAISE EXCEPTION 'New observations must be separate from cleanup adoption'; END IF;
 observed:=clock_timestamp();
 INSERT INTO release_observations.verified_copies(name,database_oid,observed_owner,cluster_digest,job_id,github_run_id,github_run_attempt,worker_deployment_id,evidence_sha256,details,first_observed_at,verified_at)
 VALUES(p->>'name',d.oid,d.owner,cluster,p->>'jobId',split_part(p->>'jobId','_',2),split_part(p->>'jobId','_',3)::int,(p->>'workerDeploymentId')::uuid,p->>'evidenceSha256',p,observed,observed);
 RETURN QUERY SELECT d.oid,observed,observed;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA release_observations FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA release_observations FROM PUBLIC;
GRANT USAGE ON SCHEMA release_observations TO kc_copy_registrar;
GRANT EXECUTE ON FUNCTION release_observations.record_verified_copy(jsonb) TO kc_copy_registrar;
GRANT USAGE ON SCHEMA release_observations TO kc_retention_runtime,kc_retention_authorizer;
GRANT SELECT ON release_observations.verified_copies TO kc_retention_runtime,kc_retention_authorizer;
RESET ROLE;
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO kc_copy_registrar',current_database()); END $$;
COMMIT;
