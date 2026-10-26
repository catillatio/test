# Phase 2 — future verified-copy registration

Status: implementation/review candidate; **not enabled, merged or deployed**.
No catalog installation, credential change, registration, adoption, deletion or
scheduling is performed by this work. Preserve all 23 owner-observed recovery
copies, emergency OIDs **106971 / 129180**, and every subsequently created copy.

## Confirmed source and deployed state

- PR #25 merged to `release/production` as
  `9ae9a15ba7f9bdca4dcb3a161ba883891df5fb46`. Post-merge
  [CI 40364094133](https://github.com/catillatio/test/actions/runs/40364094133)
  passed all 10 jobs. This branch starts at that exact merge.
- Read-only live game `/healthz` returned HTTP 200, ready, commit
  `d48ab91d14639252be847670caad8ec0bfdcb62a`. That source predates PR #25;
  GitHub's comparison shows the observation implementation was added afterward.
- Railway's active game deployment is `83d7ac3f-2859-4997-9563-2337bea837bc`,
  created **26 October 2026, 00:45:15 EDT**. The latest verification-worker
  deployment is `ccd3f1b1-c1ba-4f47-9613-352c0b972304`, created
  **26 October 2026, 00:48:38 EDT**, before the PR's **12:57:34 EDT** merge.
- OAuth deployment metadata contains no CLI-upload source commit hash. The worker
  image/files cannot be independently inspected through the exposed integration.
  Do not claim a newly attested worker SHA or treat this worker as a reviewed
  merged-code deployment. The prior retained release index associates the last
  protected release with `d48ab91`; this session did not freshly authenticate its
  archive bytes. Current game SHA is independently confirmed by live health.
- No registration variable names were listed on game, worker or copy service;
  values were not requested. There were no staged service changes. These are
  control-plane observations, not a dump or attestation of process environments.
- Copy service still uses `postgres:18-bookworm`, its 20,000 MB volume and no public
  PostgreSQL proxy. Catalog installation and full permission validation are the
  owner's completed [recorded evidence](../OWNER_CATALOG_VALIDATION_RESULT.json),
  not SQL executed again by Codex. No original-OID provenance is invented.

**Conclusion:** merge/CI is complete for PR #25; registration delivery and
activation are not established. Use only the existing protected exact-candidate
release for any later delivery. Do not enable against the old/unattested worker.
The official integration permits metadata reads but exposes no private SQL,
Console/SSH execution or credential values. No credentials or new private access
channel were obtained. No direct Railway redeploy is a substitute for release.

## Implementation and safeguards

The merged worker already captures actual copy identity only after independent
backup encryption/export/round-trip, isolated restore, migration replay and
preservation checks. It validates and uploads the mandatory successful report
**before** calling the separate registrar. Exact candidate/release/job/run/attempt/
worker deployment, name/OID/owner, distinct clusters and evidence hashes bind the
31-field sanitized observation. It records server timestamps, not guessed database
creation time. Verify jobs do not register copies.

This phase adds a **non-writing registrar preflight** and strengthens the existing
runtime check: LOGIN/NOINHERIT restricted actor, NOLOGIN catalog owner, no PUBLIC
CREATE or direct write/REFERENCE/MAINTAIN privileges, logged table, no RLS and
exact valid nonpartial unique name/OID/job indexes. Guard bodies/owners/triggers
remain checked. The already-installed SQL and its hashes are unchanged; no DDL,
new role, grant or migration is required.

`inspect-registrar.mjs` accepts only a disabled/unset registration flag, the
restricted registrar URL, exact existing worker platform identity, reviewed scope
and explicit private expected host. It rejects source/restore-admin URLs and job
grants, uses a READ ONLY connection/transaction, rolls back, takes no release lock
and calls no catalog writer. Its only success output is:

```text
REGISTRAR_PREFLIGHT: PASS
REGISTRAR_CLUSTER_CHECK: DEFERRED_TO_VERIFIED_WRITE
```

Preflight intentionally does not require `pg_control_system()`. Its existing
effective access can vary with PostgreSQL defaults and database policy; do not
grant that permission to make preflight attest cluster identity. Preflight verifies
connection identity, database and effective privileges; **PASS does not certify
cluster equality, recovery, release approval or enablement**. The existing owner
cluster validation/private host review supplies preparation evidence, and the
installed SECURITY DEFINER writer independently checks actual cluster equality
against each genuine verified report before it may append. Errors print only
`REGISTRAR_PREFLIGHT: FAIL`. No values/provider errors are logged.

Actual registration still rechecks guards before each append. Its per-copy
transaction lock and unique identities make concurrent/restarted identical calls
idempotent. Conflicting/reused identities fail closed. Failures cannot create
permits/adoption rows, sign release proofs or bypass mandatory backup/report gates.
A failed optional registration leaves the genuine recovery result and copy
protected. No unrestricted credential is used for registrar connections.

## Exact future enablement sequence — separate approval required

1. **Owner review and delivery authorization.** Review this draft and final exact-
   head CI, then separately authorize merge and the normal protected release of
   that resulting production SHA. Keep registration unset/0 during delivery.
   Do not dispatch a release solely to fill metadata. The existing workflow must
   retain backup/export, independently retained encrypted recovery, isolated
   restore, signatures, schema/population/preservation and exact deployment gates.
   Verify delivered candidate/report/worker identities through that procedure;
   the current OAuth metadata limitation is not permission to waive a guard.
2. **Private credential authorization.** After separate approval, use the existing
   KingdomReleaseCopy Console to set **only** the existing `kc_copy_registrar`
   password using psql's interactive `\password kc_copy_registrar`. Use the owner's
   private secret manager; never paste a credential/URL into chat, GitHub, shell
   arguments, files in this repository or shared logs. Do not create roles,
   broaden grants, change HBA/authentication or give registrar database ownership.
   Read-only setup validation is complete; do not repeat bootstrap/observations.
3. **Prepare exact private settings, still disabled.** Separately authorize only
   the existing worker's registrar URL and eight-field scope. URL must use
   `kc_copy_registrar`, the confirmed private copy-service host, port 5432 and
   exact database `Railway`, with no query overrides. Scope keys are:
   `projectId`, `environmentId`, `gameServiceId`, `workerServiceId`,
   `verificationDatabaseServiceId`, `maintenanceDatabase`, `clusterDigest`,
   `sourceClusterDigest`. Bind the existing service UUIDs and owner's privately
   confirmed distinct cluster digests; do not publish values. Use sealed/private
   settings through the existing approved operator channel. Stage with the
   reviewed no-deploy mechanism (`--skip-deploys`) where available. Railway setting
   changes may cause deployment; any application/deployment needs separate
   approval. Never manually redeploy an old job request to apply variables.
4. **Optional private preflight, no new channel.** If an existing trusted worker
   Console/operator execution channel is available after reviewed delivery, run
   the command below with registration still unset/0. The `env -u` removals are
   process-local; do not delete the service's backup credentials. Use actual
   worker platform identity; do not spoof it from the game/PG service. If the
   worker's one-shot runtime is not available, report that limitation; do not
   change its start command, add a runner, expose SQL or deploy a diagnostic.
   The standalone preflight is not a new mandatory release gate: every genuine
   append already performs its own restricted actor/guard checks. The owner may
   separately approve first observation under those built-in checks when no
   private shell is available, rather than inventing an execution channel.
5. **Explicit observation enablement authorization.** Only after reviewed code/
   scope/credential preparation, separately authorize
   `KINGDOM_COPY_REGISTRATION_ENABLED=1` on the **existing verification worker**.
   Do not add registrar variables to GitHub, game, source or cleanup services.
   Include pause/revert and configuration-triggered deployment effects in that
   approval. Keep runtime/authorizer credentials, retirement and scheduling OFF.
   Staged settings must take effect only through the next separately approved,
   already-needed protected prepare with a fresh exact job request.
6. **First genuine observation.** Before that approved canary, privately snapshot
   the current name/OID/owner tuples of the original 23 and all later protected
   copies. This is a future preservation baseline, not backfilled historical
   creation/OID evidence. The worker must complete normal independent recovery,
   report validation and upload before the restricted append. Review fixed
   `COPY_REGISTRATION: PASS|FAIL` without disclosing provider errors or metadata.
7. **Read-only acceptance.** Use the exact independently retained manifest from
   that run/attempt and its verified file/archive hashes. Privately compute
   `observationPayload(manifest)` with the existing pure helper and validate its
   report first; never take expected hashes from the observation itself. Supply
   that JSON and the pre-canary inventory privately to
   [VERIFY_FIRST_OBSERVATION.sql](VERIFY_FIRST_OBSERVATION.sql). Never put them in
   GitHub inputs/public logs. Require all observed comparison/preservation flags
   true, baseline count at least 23, both emergency OIDs present, exactly one
   matching job observation, server timestamps/registrar actor correct and no
   cleanup catalog/ownership changes. A new verified copy may increase the live
   count; preserve every baseline tuple, not merely its count.

Future optional preflight command, **not executed in production here**:

```sh
env -u DATABASE_URL -u KINGDOM_RESTORE_DATABASE_URL -u KINGDOM_RELEASE_JOB_REQUEST \
  node deployment/release/retention/inspect-registrar.mjs \
    --expected-host '<OWNER-REVIEWED-PRIVATE-COPY-HOST>.railway.internal'
```

It requires the already separately authorized registrar URL/scope, actual worker
identity and registration unset/0. Never temporarily set enablement=1 merely to
run this command. Do not copy administrative URLs into its process environment.

## First-observation acceptance and failure handling

- Private receipt must match exact original release SHA/candidate, job/run/attempt,
  worker deployment, database name/OID/owner, cluster and evidence. Metadata-only
  replay must preserve the original receipt/timestamps, including after restarts.
  A one-record synthetic test baseline is explicitly not the 23-copy live baseline.
- The read-only verifier's false retirement field is a constant, not an executed
  eligibility test. Observation never adopts ownership or authorizes deletion.
- On optional failure, keep the successful mandatory report and retained copy.
  Do not repeat prepare/restore to register metadata. If a manifest captured exact
  original identity and a trusted private worker channel exists, a separately
  approved `register-verified.mjs` replay can retry only that metadata. No identity
  capture means protection and review, never guessing a legacy OID.
- A lost acknowledgement can be retried idempotently; conflicts, changed OID,
  cluster/owner/scope, missing guards, permission drift or expired mandatory
  release evidence fail closed. Historical metadata replay does not renew release
  evidence or authorize promotion.
- Any approved pause/revert changes only the optional registration setting through
  the reviewed no-deploy/next-job procedure; it does not erase observations, alter
  copies or weaken mandatory release checks. Do not execute that write now.
- All existing 23 copies and emergency OIDs stay protected. No legacy adoption,
  cleanup, scheduling or automatic retirement is part of Phase 2. The two-newest
  minimum, 24-hour hold, current/pending/pinned/unknown protections remain intact.

## Verification

All 125 focused local registration/retention/worker-ordering checks pass. New PostgreSQL tests cover
read-only preflight, denial of direct cluster access, exact first-receipt binding,
index/persistence/role/MAINTAIN drift, concurrency, rollback, retries, 900-bot
metadata and populated preservation. The disposable encrypted recovery fixture
also runs disabled preflight before its existing real opt-in registration/replay.
The local workspace has no Docker storage headroom and uses sparse files/linked
dependencies, so the PostgreSQL/container rehearsals and clean-checkout packaging
checks run in normal GitHub CI. Final exact-head CI and evidence links are in the
draft PR. No protected production workflow is dispatched for testing.
