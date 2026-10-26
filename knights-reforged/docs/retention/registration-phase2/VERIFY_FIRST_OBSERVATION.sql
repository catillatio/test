-- Future owner-run verification only, after separately authorized registration.
-- Private psql inputs: expected_observation from observationPayload(authenticated
-- retained manifest), and before_inventory from the pre-canary live inventory.
-- Neither input belongs in chat, GitHub, shared logs or public artifacts.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path=pg_catalog,pg_temp;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='2s';
WITH input AS (
 SELECT :'expected_observation'::jsonb AS expected,:'before_inventory'::jsonb AS baseline
), observed AS (
 SELECT o.* FROM release_observations.verified_copies o,input i
 WHERE o.job_id=i.expected->>'jobId'
), prior AS (
 SELECT b.* FROM input i,LATERAL jsonb_to_recordset(i.baseline) AS b(name text,oid text,owner text)
)
SELECT jsonb_build_object(
 'kind','read-only-first-observation-review-not-authorization',
 'read_only',current_setting('transaction_read_only')='on',
 'maintenance_matches',(SELECT expected->>'maintenanceDatabase'=current_database() FROM input),
 'exactly_one_observation',(SELECT count(*)=1 FROM observed),
 'exact_manifest_binding',coalesce((SELECT bool_and(
  o.details=i.expected AND o.name=i.expected->>'name'
  AND o.database_oid::text=i.expected->>'oid'
  AND o.observed_owner=i.expected->>'owner'
  AND o.cluster_digest=i.expected->>'clusterDigest'
  AND o.evidence_sha256=i.expected->>'evidenceSha256'
  AND o.worker_deployment_id=(i.expected->>'workerDeploymentId')::uuid
  AND o.github_run_id=split_part(i.expected->>'jobId','_',2)
  AND o.github_run_attempt=split_part(i.expected->>'jobId','_',3)::int
 ) FROM observed o CROSS JOIN input i),false),
 'live_identity_matches',coalesce((SELECT bool_and(
  d.oid=o.database_oid AND r.rolname=o.observed_owner AND NOT d.datistemplate
 ) FROM observed o LEFT JOIN pg_database d ON d.datname=o.name
 LEFT JOIN pg_roles r ON r.oid=d.datdba),false),
 'server_receipt_matches',coalesce((SELECT bool_and(
  registered_by='kc_copy_registrar' AND first_observed_at=verified_at
  AND first_observed_at<=clock_timestamp()) FROM observed),false),
 'baseline_count',(SELECT count(*) FROM prior),
 'baseline_minimum_present',(SELECT count(*)>=23 FROM prior),
 'baseline_identities_unique',(SELECT count(*)=count(DISTINCT name) AND count(*)=count(DISTINCT oid) FROM prior),
 'baseline_identities_preserved',NOT EXISTS(
  SELECT 1 FROM prior p LEFT JOIN pg_database d ON d.datname=p.name AND d.oid::text=p.oid
  LEFT JOIN pg_roles r ON r.oid=d.datdba
  WHERE d.oid IS NULL OR r.rolname IS DISTINCT FROM p.owner
 ),
 'emergency_106971_present',EXISTS(SELECT 1 FROM pg_database WHERE oid=106971),
 'emergency_129180_present',EXISTS(SELECT 1 FROM pg_database WHERE oid=129180),
 'no_cleanup_catalog_writes',(SELECT count(*) FROM release_retention.copies)
  +(SELECT count(*) FROM release_retention.pins)+(SELECT count(*) FROM release_retention.permits)
  +(SELECT count(*) FROM release_retention.audit)=0,
 'no_managed_role_owns_database',NOT EXISTS(
  SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba
  WHERE r.rolname IN ('kc_retention_owner','kc_release_copy_owner','kc_retention_runtime','kc_retention_authorizer','kc_copy_registrar')
 ),
 'retirement_authorized',false
) AS owner_summary;
ROLLBACK;
