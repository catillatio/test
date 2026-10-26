# Owner-observed production inventory and next checks

**Status update:** the owner subsequently completed the exact metadata installation
with both SQL hashes and all postchecks passing. Both catalogs are installed and
empty; no adoption/activation occurred. [Installation evidence](OWNER_INSTALLATION_RESULT.json)
and [next read-only validation / future registration plan](POST_INSTALL_VALIDATION_AND_REGISTRATION.md).
The absent-schema/role observations below are **pre-install history**. Do not
repeat installation or treat this status update as permission for another write.

Evidence source: the owner's read-only KingdomReleaseCopy production Console
inspection, reported on 2026-10-26. The exact server inspection timestamp and full
private name/OID listing were not supplied to this session. These are **owner
observations**, not new production queries performed by Codex.

| Observation | Owner-reported result | Retention consequence |
| --- | --- | --- |
| Total databases | 27 | Preserve all; identify the four outside the recovery-copy set privately. |
| Recovery-copy databases | 23 `kc_..._restore_test` databases | Names identify inventory candidates, not verified provenance or retirement eligibility. |
| Ownership | All owners displayed as `postgres` | No copy is adopted into restricted cleanup ownership. Do not transfer ownership. |
| Connections | All 23 had zero at inspection | Point-in-time observation only; no evidence of closure, inactivity between jobs, or safety to delete. |
| Combined recovery database size | Approximately 6.3 GB | Logical database storage; **not a reclaimable-space estimate**. |
| Largest / smallest recovery database | 495 MB / approximately 8 MB | Size proves neither successful restoration nor disposability. |
| Emergency OID 129180 | Exists, approximately 304 MB | Unconditionally protected. |
| Emergency OID 106971 | Exists, approximately 235 MB | Unconditionally protected. |
| Advertised volume capacity | 20 GB | Retain separately from GiB filesystem reporting. |
| Maintenance DB / version / current user | `Railway` (capital R) / PostgreSQL 18.6 / `postgres` | Owner confirmed the existing worker URL uses `Railway` exactly. |
| Cluster digest | Owner comparison matches retained report evidence | No raw fingerprint needs to be supplied or published. |
| Summary-only name comparison | 17 matched live names; six unmatched; 18 historical names not matched | Name association only; no original-OID attestation or retirement permission. |
| Schema / role checks | Neither schema nor any of the five expected roles exists | Fresh-install collision preconditions observed; not target or execution approval. |
| WAL | 960 MB | Included in filesystem used bytes; do not double-count. |
| Data directory | `/var/lib/postgresql/18/docker` | Owner-observed actual path. |
| Filesystem / mount | `/dev/zd28000` at `/var/lib/postgresql` | Data and pg_wal share this filesystem. |
| Filesystem snapshot | 18 GiB size; 7.1 GiB used; 11 GiB available; 41% | Rounded owner-observed values; no exact byte reconstruction. |
| `release_retention.copies` | `to_regclass` returned NULL | Absent in the connected database. No installed cleanup provenance there. |
| `release_observations.verified_copies` | `to_regclass` returned NULL | Absent in the connected database. No installed observation provenance there. |

**Current decision: 0 copies eligible under PR #25; all 23 remain protected.**
The two emergency sizes are part of the recovery-copy total, not additional
storage. No maximum reclaimable figure is inferred for the remaining 21 copies.
Current, pending, pinned, rollback/emergency and uncertain copies must remain
protected even after historical evidence is collected. The two newest verified
copies and minimum 24-hour hold remain mandatory.

The owner initially confirmed absence of both schemas and all five expected
roles in the inspected database/cluster, and supplied WAL and filesystem usage.
These checks are complete as owner observations; do not rerun them merely for
this report. The original read-only instructions below remain a reference for
later freshness checks. [Retained-evidence reconciliation](PROVENANCE_RECONCILIATION.md)
records 35 validated prepare manifests, exact run/attempt matching and the active
deployment reference. None records the worker maintenance name or original OID.
The owner subsequently completed the private digest and name comparison.
Six unmatched names, legacy original-OID evidence and external holds remain open.

The owner has now confirmed both the precise Console name and the existing
worker URL database component are **`Railway`**, with capital R. The name gate is
closed, and the subsequent owner summary confirms cluster equality and 17 live
name associations. The [completed comparison handoff](PRIVATE_COMPARISON_HANDOFF.md)
records the result without raw private identifiers. Six unmatched names, legacy
OID evidence and external holds remain unresolved.
No catalog installation is authorized by the name confirmation.

For interpreting the earlier result, NULL relation lookups alone do **not** prove
that schemas, partial objects or
cluster-wide role names are absent, or that another database has no catalog.
First confirm this is the worker's exact existing maintenance database. Do not
search by modifying databases or install a second catalog in a guessed location.

## Minimum remaining read-only checks

Use the existing authenticated private Console. No credential change, public
proxy, new service, deployment or feature flag is needed. Keep full names/OIDs,
paths, deployment references and manifests in a restricted private owner file,
not GitHub or public logs. Run each optional block separately; a denied optional
query remains unknown and does not justify additional privileges.

### 1. Database-name match and namespace/role checks owner-completed

Compare `maintenance_database` privately with the database component of the
verification worker's existing restore connection; do not print its connection
URL. Compare the cluster digest with retained recovery evidence. PostgreSQL roles
are cluster-wide; any matching role/schema means **stop fresh installation** and
review that existing object rather than reuse, alter or remove it.

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT clock_timestamp() AS observed_at,
       current_database() AS maintenance_database,
       (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS maintenance_oid,
       current_user AS observer,
       current_setting('server_version') AS server_version,
       encode(sha256(convert_to(system_identifier::text,'UTF8')),'hex') AS cluster_digest
FROM pg_control_system();
SELECT to_regnamespace('release_retention') AS retention_schema,
       to_regnamespace('release_observations') AS observation_schema,
       to_regclass('release_retention.copies') AS adopted_copies,
       to_regclass('release_observations.verified_copies') AS observed_copies;
SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
       rolreplication,rolbypassrls
FROM pg_roles
WHERE rolname IN ('kc_retention_owner','kc_release_copy_owner',
                 'kc_retention_runtime','kc_retention_authorizer','kc_copy_registrar')
ORDER BY rolname;
COMMIT;
```

This reads no passwords. The owner has already completed these SQL observations;
the worker-name match is now separately owner-confirmed. Private cluster
equality is now confirmed by the owner summary; no repeat is needed for this report.
If objects/roles exist at a later check, their definitions and grants
need a separate read-only review; fresh bootstrap is not a repair mechanism.

### 2. Preserve the missing exact name/OID map and complete database totals

If the full output of [inventory.sql](../../deployment/release/retention/inventory.sql)
was already privately retained with its timestamp/cluster, reuse it rather than
repeat it solely for documentation. Otherwise, run that read-only script: it
captures **all 27 databases**, actual OIDs, owners, per-database bytes and connection
counts, and the sum across all databases. It also marks both emergency OIDs.
Do not publish the full output. Refresh it again before any future authorization;
new releases can change counts, references, connections and sizes.

For the reconciliation worksheet, the minimum private columns are: cluster digest,
name, OID, current owner, measured bytes, observation time, original run/attempt,
release job ID, commit/candidate digest, worker deployment, retained manifest and
ciphertext/preservation hashes, verification/terminal status, active/pending/
rollback/pin references, and retain reason. Unknown fields stay explicitly unknown.

### 3. Obtain provenance and live references from existing evidence, not guessed SQL

Neither missing catalog can be queried for historical rows. No PostgreSQL query
can reconstruct the missing GitHub run, worker deployment or successful encrypted
recovery verification from a database name, OID ordering, size or zero connections.
PostgreSQL has no trustworthy database creation-time field.

Use existing protected GitHub release runs/attempts (including failures) and their
independently retained `backup-manifest.json` and encrypted recovery evidence.
Match `request.jobId`, `request.copy`, commit/candidate, actual cluster/service,
`report.workerDeploymentId`, passed backup/export/restore/migration/preservation
results and hashes. Check the exact `copyName(request.jobId)` mapping using the
existing release protocol; do not infer it from a run number alone or invent a
missing nonce. A failed promotion can still have a verified recovery copy; an
incomplete restore cannot be certified from its size.

Where a retained report contains `verifiedCopyIdentity`, require its exact OID,
maintenance DB and cluster to agree with the live inventory. Older reports may
lack that captured identity. Label those **legacy identity unverified** until an
owner-reviewed exact-copy reconciliation establishes the missing linkage; do not
rewrite old reports or present today's OID as one captured historically. Missing
or expired artifacts remain a blocker unless independently retained evidence
resolves them. Do not run another release/restore simply to obtain metadata.

Privately identify the recovery copy referenced by the **currently active** game
deployment and any staged/pending release, rollback, manual restore or owner hold.
Use existing deployment configuration and its signed recovery evidence; do not
expose full variables, signed proofs or credentials. A healthy commit or an
expired historical proof alone does not establish the current reference. Until
those references are complete, no actual retirement plan can be approved.

### 4. WAL and filesystem capacity — owner-completed snapshot

The owner measured 960 MB WAL and 11 GiB available on the shared data/WAL
filesystem. Do not repeat this solely for documentation. For a later freshness
check, run separately only where existing permission allows:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT coalesce(sum(size),0)::text AS wal_bytes FROM pg_ls_waldir();
SHOW data_directory;
SELECT spcname,pg_tablespace_location(oid) AS location FROM pg_tablespace ORDER BY spcname;
COMMIT;
```

The measured WAL is already part of filesystem usage. Do not add it to 7.1 GiB
used or subtract it again from 11 GiB available. Advertised 20 GB and rounded
18 GiB filesystem size use different units; neither is an exact byte value.

If a later WAL query is denied, roll back that block and obtain only the path metadata
through a separate read-only `SHOW data_directory` / tablespace query if permitted.
Do not grant monitoring/server-file roles. Default/global tablespaces have empty
location strings and live under the data directory; retain any explicit external
locations for capacity checks.

SQL database sizes and WAL still do not report usable filesystem free space.
In the **existing** private service shell, if available, use these read-only
commands only after confirming `$PGDATA` matches `SHOW data_directory`:

```sh
df -B1 -- "$PGDATA"
df -B1 -- "$PGDATA/pg_wal"
```

For any explicit external tablespace, run `df -B1 -- '<exact existing path>'`
privately too. If this Console is SQL-only, obtain current used/free metrics from
Railway's existing volume view instead. Do not add shell access, extensions,
`COPY PROGRAM` or SQL file-access workarounds. Preserve timestamp, filesystem/
mount identity and units; inspect the actual persistent volume, not an unrelated
container overlay. WAL may share that mount, so do not add duplicate `df` totals.

**Do not report 20 − 6.3 = 13.7 GB free.** Other databases, WAL, shared files,
logs, temporary files, tablespaces and filesystem overhead are not included in
that recovery-copy sum. Before a later release/cleanup approval, compare measured
available bytes with the next full restored-copy requirement plus WAL/temporary
working space and operating margin. The historical 495 MB maximum alone cannot
certify future restore headroom. WAL/slot diagnosis is additional work only if
these minimal measurements reveal material unexplained usage.

## Archived fresh-catalog installation procedure — COMPLETED BY OWNER, DO NOT REPEAT

The following is the preserved pre-install procedure, not a current instruction.
Its execution was subsequently authorized and completed by the owner; current
work is read-only validation, with registration/credentials/adoption still OFF.

The owner has now approved **preparation**, not production SQL execution. The
[exact Console installation plan](CATALOG_INSTALLATION_PLAN.md) records official
Railway service access, the unavailable private-SQL integration path, immutable
source hashes, copy/paste file staging, explicit local-socket target checks and
per-file failure handling. Its future execution block supersedes the earlier
generic connection commands; no credentials, release or new execution channel
is needed for preparation.

Both tables, both schemas and all five expected roles are owner-confirmed absent
in the inspected database/cluster. Fresh installation is the candidate path,
**conditional on separate owner installation approval**; the owner has now
confirmed both the `Railway` maintenance name and cluster match. Recheck freshness when later authorized. No installation is authorized now.
The existing [readiness guide](READINESS.md) retains all signing, job coordination,
private execution, ownership-risk and later activation gates.

1. Keep optional registration/retirement OFF and the workflow template outside
   `.github/workflows`. Reconcile and privately protect the current/emergency/
   pending/unknown set. Review current encrypted recovery readiness. Obtain
   separate owner authorization for this exact metadata-only installation;
   no ownership adoption, retirement, password change or deployment is included.
2. Pin the approved repository commit and SHA-256 of `bootstrap.sql` and
   `observations.sql`. Privately stage the exact reviewed files through the
   existing trusted Console/operator channel. No service redeployment is needed
   to carry SQL files. If file transfer is unavailable, the owner may paste the
   exact reviewed SQL only after separate authorization; do not invent a channel.
3. As the existing authorized privileged operator, install **only** in the
   confirmed worker maintenance database on KingdomReleaseCopy, never the game
   database, a restored copy or a newly created catalog database. Future commands:

   Use the [reviewed future execution block](CATALOG_INSTALLATION_PLAN.md) only
   after separate authorization. It pins the local socket, port, `postgres` and
   exact `Railway` database, checks the private cluster digest and freshness, and
   holds the shared release/restore session lock across both files and postchecks.

   Each file has its own transaction. If the first succeeds and the second
   fails, the first remains installed. Stop and inspect; do not rerun bootstrap,
   drop/recreate objects, repair grants or roll back by deleting schemas. A later
   continuation/upgrade requires review. Do not alter authentication on failure.
4. Verify installation with read-only queries: target/cluster unchanged; both
   schemas/tables exist with the reviewed NOLOGIN owner, exact functions/triggers
   and effective grants (the reviewed read-only checks in
   [checkCatalog](../../deployment/release/retention/retention.mjs) and
   [checkObservationCatalog](../../deployment/release/retention/observation.mjs)
   specify the exact installed definitions/privileges). Five catalog tables must
   initially be empty. Do not configure credentials just to invoke a validator in
   this installation step. Check all 27
   database name/OID/owner tuples against the private pre-install inventory.
   **All 23 existing recovery copies must still belong to `postgres`.** Bootstrap
   creates metadata/roles only, not adopted-copy rows or historical evidence.
   Verify `kc_release_copy_owner` owns no database. Emergency OIDs 106971 and 129180
   must retain their original identities/owners and remain excluded from adoption.
5. Preserve the private install transcript, exact commit/SQL hashes and before/
   after metadata. Keep runtime/registrar/authorizer credentials unconfigured and
   all features/workflow inactive. Secure credential setup, private job execution,
   optional observation enablement, exact-copy provenance import/ownership
   adoption and signed retirement are **separate later approvals**. Do not invoke
   any of them as a post-install check.

Future read-only post-install row checks (not applicable before installation):

```sql
BEGIN READ ONLY;
SELECT 'copies' AS relation,count(*) FROM release_retention.copies
UNION ALL SELECT 'pins',count(*) FROM release_retention.pins
UNION ALL SELECT 'permits',count(*) FROM release_retention.permits
UNION ALL SELECT 'audit',count(*) FROM release_retention.audit
UNION ALL SELECT 'observed_copies',count(*) FROM release_observations.verified_copies;
SELECT d.datname,d.oid::text,r.rolname AS owner
FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba
WHERE r.rolname='kc_release_copy_owner' OR d.oid IN (106971,129180)
ORDER BY d.oid;
COMMIT;
```

Installation alone confers **no deletion eligibility**. Newly imported legacy
provenance starts a fresh server-derived observation hold; no timestamp backfill.
Two newest verified copies, 24 hours, all active/pending/pinned/unknown references,
emergency OIDs and exact signed job/batch authorization remain mandatory.
