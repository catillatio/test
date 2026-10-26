# Recovery-copy retention — owner review

This revision resumes PR #25 from `cf22204`, integrating the current protected
production baseline (`d48ab91`, schema 026 and exact 450/900 population evidence).
No gameplay changes, production SQL, deletion, installation, workflow dispatch,
volume/configuration/credential change, PR merge or deployment was performed.

## Implemented and inactive

- Optional verified-copy registration remains **OFF** unless separately enabled.
  It observes actual OID/cluster/owner/run/attempt/deployment after successful
  independent restore and report upload. It does not adopt ownership. The current
  900-bot report must match the installed immutable population definition, including
  identical restored population evidence. Only constrained scalars and a sanitized
  population evidence digest enter registration; no URLs/secrets/raw reports.
- Read-only inventory enumerates actual names, OIDs, owners, sizes and connections;
  joins installed adopted/observed provenance; optionally measures WAL with existing
  permission. Missing catalog means protected uncertainty, not invented eligibility.
- Planner retains current/active-SHA, pending, durable/owner-pinned, unclosed,
  connected, unknown/mismatched and observed-only copies. At least **two newest
  present verified copies and 24 hours since first server observation** remain.
- Emergency OIDs **106971 and 129180** are unconditional exclusions in planning,
  privileged provenance import, cleanup and the installed SQL event guard. This
  revision has **no override**. Future replacement needs separate reviewed code,
  exact identity evidence and explicit owner authorization.
- Exact short-lived Ed25519 batch authorization, separate non-destructive permit
  registration, runtime guard-definition/ownership/grant checks and durable intent
  before non-FORCE DROP remain mandatory. SQL also independently checks age,
  newest-copy minimum and closed/active references before accepting an intent.
- Cleanup binds the signed plan/state to an exact repository/workflow/run/attempt/
  job/head SHA. Fixed read-only GitHub APIs verify that job is running and its
  owner gate succeeded; local GitHub context must agree. This supplements the
  original-release completion/health checks. A signed lock Boolean alone fails.
- The **inactive** [workflow template](../../deployment/release/retention/workflow.yml)
  places owner approval **before** the execution job acquires the existing
  `kingdom-come-production` concurrency group. The production release already holds
  that same repository group for safety, prepare, restore, artifacts, promotion
  and post-deployment verification. No change to that workflow is required.
- A bounded private handoff (180 seconds, within a five-minute job) allows fresh
  inventory/signature/permit preparation after the execution mutex is held. A
  separate authorizer publishes `ready.json` last; it contains SHA-256 of the four
  exact private input files. Expiry/queue delays fail; no automatic re-signing.
- The PostgreSQL session lock `61824087` in the **same maintenance database** is
  held throughout execution. Cooperating manual restores must acquire it too.
  No FORCE, connection termination, database connection disabling, filesystem
  deletion, backup-object deletion or automatic unpinning is implemented.
- `cli.mjs reconcile` handles interrupted jobs without issuing DROP: original
  permit/signature is independently validated, only an existing durable intent's
  actual name **and** OID absence can append `absent`, with zero reclaimed bytes.
  Present identities require a fresh approved plan; reused/renamed identities fail.
  It may reconcile an expired original authorization but can never renew it or
  start/resume a deletion. Current owner-approved job coordination is still needed.

## Actual inventory status: UNVERIFIED

Read-only authenticated Railway metadata confirms project `merry-patience`,
production service `KingdomReleaseCopy`, live/successful deployment, **20,000 MB
volume capacity**, and no public PostgreSQL TCP proxy. No credential values were
retrieved. The available connector has no private Console/SQL execution method.
Consequently **no actual database listing, OIDs, owners, sizes, live recovery
references, WAL usage, free space or production retirement candidates are
certified by this revision**. Earlier 5 GB / 2.33 GB figures are historical,
owner-supplied measurements and must not be substituted for current inventory.

The smallest next step is the owner's **existing authenticated private Console**
for KingdomReleaseCopy. No new service/proxy/credentials are needed for that read.
Open its existing PostgreSQL session, or use its existing local authentication:

```sh
psql -X --no-password -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Paste [inventory.sql](../../deployment/release/retention/inventory.sql). If local
existing authentication is unavailable, stop; do not reset passwords or expose a
proxy. Run the optional WAL SELECT separately only if existing permission allows.
Keep full output private (restricted owner file, directory 0700/file 0600). Match
its actual maintenance DB/cluster to the worker's existing restore connection,
then collect catalog rows and retained public backup manifests through existing
trusted channels. PostgreSQL has no reliable database creation timestamp.

For installed catalogs, read-only provenance queries in that same session are:

```sql
BEGIN READ ONLY;
SELECT to_regclass('release_retention.copies'),
       to_regclass('release_observations.verified_copies');
COMMIT;
-- Only if the corresponding table exists and existing access permits:
SELECT name,database_oid::text,owner_name,verified_at,first_observed_at,
       evidence_sha256,evidence->'request'->>'jobId' AS release_job
FROM release_retention.copies ORDER BY name;
SELECT name,database_oid::text,observed_owner,cluster_digest,job_id,
       worker_deployment_id,evidence_sha256,first_observed_at
FROM release_observations.verified_copies ORDER BY name;
```

Every missing/failed/ambiguous reconciliation remains protected. The inventory's
logical database total and WAL do **not** establish filesystem free space or
physical reclaimable bytes. No database is eligible merely from its `kc_` name.

## Dry-run evidence

[Reproducible synthetic report](SYNTHETIC_DRY_RUN.json) is explicitly **not a
production plan or authorization**. Regenerate with:

```sh
node scripts/retention-dry-run.mjs
```

Eight synthetic copies illustrate one eligible older verified copy (1 MiB) and
seven retained: emergency OID, pending, pinned, unknown, recent observation and
two newest/current references. Actual PostgreSQL tests additionally measure real
disposable database sizes/OIDs, validate both catalog-installed and no-catalog
inventory, and prove that inventory creates no audit events/deletion permission.
No live reclaimable-space estimate is reported without live evidence.

## Minimum production setup, in order — NOT authorized here

1. Obtain the existing Console inventory above and reconcile **each exact OID**
   with retained release manifests/run attempts/deployments and independently
   retained encrypted recovery evidence. Verify current **active and staged**
   deployment recovery references and pending/manual recovery work. Pin ambiguous
   copies. Independently verify current capacity/free space for the next restore.
2. Review the finalized code/CI. Owner approval to merge is separate. A separately
   approved normal protected release may deploy only the non-destructive optional
   registration helpers; registration remains OFF. Never dispatch a release for
   cleanup or repurpose the verification worker for arbitrary SQL.
3. Separately review/install `bootstrap.sql`, then `observations.sql` in the exact
   existing worker maintenance DB on the independent copy cluster. These are
   **not game migrations** and do not alter schema 026. Fresh bootstrap refuses an
   existing installation. If any earlier draft was installed, first obtain its
   definitions/grants and prepare a separately reviewed upgrade; do not overwrite
   installed guards automatically. SQL and JavaScript must match exactly.
4. Separately supply registrar, runtime and authorizer credentials to their
   respective isolated execution boundaries. Bootstrap/catalog ownership remains
   privileged and withheld from all three. No release private key, archive key,
   production DB URL or Railway API token belongs on the retention executor.
   Review effective grants, installed guards and runtime native-ownership risk.
5. Review **non-destructive ownership adoption**, individually by exact OID, with
   full provenance and operator audit. Never bulk-transfer names. Emergency,
   active, pending, unknown and pinned copies must not be transferred. A transfer
   and provenance import must finish before the executor is permitted to run;
   runtime refuses any owned database missing an exact catalog identity. Start
   the 24-hour observation hold at import, never backdate it. Observation alone
   continues to protect all newly created copies. Automated ownership adoption
   is deliberately not enabled or inferred from registration.
6. If later approving private job execution, provide a dedicated **ephemeral**
   private-network runner in the reviewed operator Railway service; verify its
   platform service/project/environment IDs against scope. Its GitHub runner group
   must allow **only** the reviewed retention workflow at the protected production
   ref, never PRs/arbitrary workflows. Use short-lived runner registration and
   repository token. Keep bootstrap, authorizer and signing secrets outside that
   runner. A private broker stages immutable input files without sharing those
   credentials. No such runner/service is provisioned by this PR; absent this
   trusted channel, destructive execution stays blocked.
7. Separately approve copying the template to its exact expected workflow path,
   `.github/workflows/recovery-copy-retention.yml`. Review the existing protected
   production environment owner reviewers/prevent-self-review and branch policy,
   runner-group restrictions and shared mutex. Test against disposable PostgreSQL
   first. There is no schedule and default runtime enablement remains OFF.
8. Enable optional observation separately, then review a first **private dry run**.
   Confirm emergency protection and retained/current/pending references. Arrange
   all prerequisites before an exact cleanup authorization; retain offline owner
   signing-key separation. No standing/unattended deletion approval is introduced.
9. For an explicitly approved manual job, dispatch only that reviewed workflow,
   approve its owner gate, then while its execution job holds the shared mutex:
   prepare fresh state/plan, sign exact targets, install the permit through the
   isolated authorizer, privately stage mode-0600 files and publish the raw-file
   SHA-256 `ready.json` last (`permit.mjs --ready-out /private/ready.json`
    creates this only after permit COMMIT; its four input files must match the
    private spool bytes). State has a maximum five-minute age; signature four
   minutes. Bounded private handoff/queue expiry requires a new reviewed state/
   plan/signature, **never** extended evidence. No secrets/plans in GitHub inputs,
   logs, chat or artifacts. The sole dispatch input is a request UUID.
10. Verify private durable audit, surviving two newest/current/emergency copies,
    independent recovery and measured storage after the first separately approved
    execution. Decide future monitoring/cadence and automatic adoption/authorization
    policy separately; **no unattended schedule or deletion is approved/installed**.

This ordering is an installation/execution guide, not a request to perform it now.
Steps 1, 3–10 require separate production-access/installation/action authorization.

## Recovery, concurrency and privilege limits

A DROP is not transactional with its durable audit; it is irreversible. Retained
encrypted archives are never deleted. If a retired old copy is needed, restore its
verified archive to a **new**, separately authorized database; do not guess a
replacement OID or edit old signed evidence. Unexpected identity, signature,
installed-guard, permission, API or connection states stop the batch.

A failed attempt may have deleted a prefix of its signed batch. Read the journal
before retrying. Within the same original execution/validity window, identical
retries are idempotent; terminal refusals require a new approval. After a crash
and expiry, a separately owner-approved coordinated job may run:

```sh
node deployment/release/retention/cli.mjs reconcile \
  --scope scope.json --state fresh-state.json \
  --prior-approval '<original approval UUID>' --out reconciliation.json
```

The original signed plan/permit is fetched from immutable catalog history, not
re-signed, renewed or modified. Present copies remain intact. A new destructive
attempt always requires fresh eligibility, exact signed authorization and permit.

GitHub API observations do not themselves create a mutex. Exclusivity rests on
the reviewed immutable workflow definition plus GitHub's shared repository group,
verified exact current job, and the live PostgreSQL session lock. The runtime also
checks originating release completion and no queued/running/waiting releases;
this is conservative and may abort cleanup rather than delay a release. Manual
restore tools/operators must use the same maintenance-database lock for their
**whole** operation. Superusers that ignore this contract cannot be constrained
by advisory locks. Cancelling a job must terminate its private executor and close
its PostgreSQL session; do not forcibly release locks or assume GitHub cancellation
proves a private process exited. The worker's lock refuses a still-running cleanup.

PostgreSQL has no DROP-only permission. `kc_retention_runtime` inherits native
ownership **only of explicitly adopted copies**, not catalog objects or source
production. It can bypass an application wrapper for databases it owns. Emergency
OIDs must never be assigned to that role; the runtime refuses any such privilege
and any owned unknown/reused identity. SQL guards and the reviewed executor protect
normal execution, but cannot make a compromised native database owner obey the
wrapper. Owner acceptance of that residual authority is required before setup;
otherwise hold execution for a separately reviewed constrained broker. Do not
claim least privilege means protection against PostgreSQL superusers/native owners.

The audit is append-only against runtime/authorizer/registrar, with server times,
actors, exact permit/target and measured intent size. It observes database state,
not incontrovertible DROP causality or physical volume reclamation. Privileged
catalog owners/superusers remain able to alter it. Independent review of retained
signed envelopes and external owner/operator evidence remains necessary.

## Verification checkpoint

Focused tests cover exact identities, actual PostgreSQL read-only inventory,
unknown observations, emergency OIDs, freshest two and age guard, mutex/job/owner
proofs, cancellation/malformed/denied APIs, permission loss/guard replacement,
concurrent permit and registration retries, rollback, connection races,
interrupted outcome recovery, name reuse and populated 900-bot plus human record
preservation. Final exact-head CI also includes existing browser, schema-026,
900-bot preservation, encrypted backup/isolated restoration and container checks.
The final PR body links the exact candidate CI and reports its actual outcome.
