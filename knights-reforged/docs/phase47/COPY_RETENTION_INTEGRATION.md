# Verified-copy registration — implementation and activation status

PR #25 now implements the **non-destructive observation integration** proposed at
`aff9142`. It is default-OFF and has not been installed or activated. Automatic
registration does not reclaim space. Scheduled reporting, cleanup execution and
exclusive release/restore coordination remain separate authorization boundaries.
Job-scoped execution and interruption reconciliation are now implemented as
inactive tooling: see [current readiness](../retention/READINESS.md). Scheduling and
unattended authorization remain unimplemented and disabled.

## Owner-observed production catalog status

The owner directly checked KingdomReleaseCopy: both `release_retention.copies`
and `release_observations.verified_copies` returned NULL in the connected
maintenance database. None of its 23 recovery copies is cleanup-adopted; all
owners displayed as `postgres`. No production eligibility is established.
[Read-only follow-up and prepared fresh-install procedure](../retention/OWNER_INVENTORY_FOLLOWUP.md)
record completed owner observations: exact Console DB `Railway`, PostgreSQL
18.6, neither schema nor any of the five roles present, 960 MB WAL and 11 GiB
available. The owner has now confirmed the existing worker restore URL names
`Railway` exactly, matching the Console. No credential was fetched by Codex.
[Existing manifest/deployment evidence](../retention/PROVENANCE_RECONCILIATION.md)
contains no maintenance-name/OID capture. The name is now owner-confirmed; the
[private cluster comparison](../retention/PRIVATE_COMPARISON_HANDOFF.md) and
separate owner authorization remain installation gates. Live identity reconciliation and external
holds remain additional gates before any ownership adoption or retirement.
The inventory does not enable registration, ownership adoption or cleanup.

## Completed integration

For a `prepare` job only, after mandatory encryption, independent round-trip,
restoration, migration/replay and preservation succeed, the opt-in worker captures
the copy's actual name/OID, observed owner, maintenance database and verified
cluster digest through its existing locked verification connection. It adds
`verifiedCopyIdentity` to the normal successful report. All existing report checks
and successful report upload must then finish **before** registration begins.

Registration uses a separate `kc_copy_registrar` login to the **same private
verification maintenance database**. It appends to
`release_observations.verified_copies`, owned by the existing NOLOGIN catalog owner
`kc_retention_owner`. It neither changes ownership nor writes to
`release_retention.copies`, permits, pins or cleanup history. The cleanup
planner treats observations alone as observed-only/unadopted and protects them.
A first observation is rejected if its database is already cleanup-owned/adopted.
The optional identity read uses a short read-only transaction with local 5-second
statement and 2-second lock limits; rollback preserves the existing session lock.

Recorded metadata:

* Exact name, actual database OID and observed owner, actual cluster digest and
  maintenance database. "Observed owner" is not inferred historical ownership.
* Exact release SHA/candidate digest, project/environment/game/worker identities,
  original worker deployment ID, release job ID and derived GitHub run/attempt.
* Validated passed result, account/bot counts, migration replay/preservation facts,
  plaintext/ciphertext/preservation hashes, canonical public report/evidence hashes.
* PostgreSQL-derived `first_observed_at` and `verified_at`, plus session identity.
  Both times describe **server observation of a verified report**, not an invented
  database creation time or backdated worker-completion time. Original request
  timestamps are explicitly request evidence and never set those server columns.

Only 31 constrained scalar fields (including the sanitized population-evidence digest) are retained. No raw request/report, presigned
URLs, arbitrary JSON, credentials or private keys are stored. The canonical
whitelisted public evidence hash is independently reproducible; it is not a
signature or a substitute for retained-artifact authentication.

The helper verifies installed guard bodies, owners, trigger state and effective
registrar privileges. SQL rechecks actual cluster/name/OID/owner, forbids arbitrary
fields, serializes same-copy writes and inserts atomically. Identical concurrent
or restarted requests return the original timestamps. Conflicting identity,
metadata, replacement database or ownership changes fail closed. Registration
uses a distinct per-copy transaction lock, never a second attempt to acquire the
worker's already-held session lock on another connection.

## Mandatory gates and optional failures

Unset or `0` `KINGDOM_COPY_REGISTRATION_ENABLED` causes **no** identity queries,
registrar connection or metadata writes, and requires no retention catalog.
Only the explicit value `1` enables recording. Invalid nonempty enablement fails
the optional boundary.

Failure during OID capture emits fixed `COPY_REGISTRATION: FAIL` on stderr; the
mandatory report still follows its original checks/upload. Failure after upload
also emits that fixed category and preserves the already verified recovery.
Success emits `COPY_REGISTRATION: PASS`. Neither prints exception/provider details.
Monitor that fixed failure category during any later activation; no alerting
infrastructure or polling is provisioned here.

All optional catches are narrow. Failed backup, migration, preservation or report
upload still fails the worker and cannot register success. Post-deployment
`verify` jobs never register a copy. Optional registration cannot supply a backup
proof, signing authorization, retained artifact or promotion gate. The private
registrar has 5-second connection/query/statement limits, a 2-second lock limit and
a 20-second overall connection bound. Registrar credentials are removed from
backup/age/migration subprocess environments.

## Required separately authorized setup — not performed

1. Through an already trusted private administrative channel, verify the existing
   verification PostgreSQL service, actual independent cluster and **exact worker
   maintenance database**. Never install in the game/source database or a copy.
2. Review/install the existing `retention/bootstrap.sql` catalog if not already
   installed. Then separately review/install `retention/observations.sql` in that
   same maintenance database. Neither file is a game migration or startup command.
   Do not rerun either bootstrap over an existing installation. A previously
   installed review format requires its own reviewed upgrade procedure.
3. Set a dedicated strong `kc_copy_registrar` password through the trusted channel.
   The role receives CONNECT, USAGE on `release_observations`, and EXECUTE on its
   guarded append function only. It has no role memberships, DDL, table writes,
   audit/permit access, database ownership, CREATEDB or DROP authority. Do not grant
   it privileges on source, game tables, restored-copy business tables or cleanup.
4. Independently review the installed owner/functions/triggers/permissions. The
   existing worker already needs administrative access to create/restore the
   independent copies; this change does not broaden that pre-existing authority.
   Privileged catalog owners/database superusers can still alter metadata/guards.
   The registrar's declaration of report verification is trusted; SQL does not
   independently download reports or authenticate GitHub. Observations alone
   never make a copy eligible for cleanup.
5. On the **existing private verification worker only**, separately approve the
   following future variables; do not add any to GitHub, game or source services:

   * `KINGDOM_COPY_REGISTRATION_DATABASE_URL`: private verification URL, exact
     maintenance DB, login `kc_copy_registrar`; no query overrides. Never print it.
   * `KINGDOM_COPY_REGISTRATION_SCOPE`: JSON with exactly `projectId`,
     `environmentId`, `gameServiceId`, `workerServiceId`,
     `verificationDatabaseServiceId`, `maintenanceDatabase`, `clusterDigest`,
     `sourceClusterDigest`. Review authenticated resource identities/private host
     mapping and actual cluster digests; this helper does not call Railway APIs
     to discover services. Source and restore clusters must differ.
   * `KINGDOM_COPY_REGISTRATION_ENABLED=1`: enable **last**, after setup review.

   No cleanup/bootstrap credential, retention/release private signing key or
   additional Railway token belongs in this registration configuration. Persistent
   worker variables are not forwarded by GitHub or stored in the image. Applying
   Railway variables can trigger deployments: installation/activation must have
   separate owner approval and use the established controlled procedure.
6. During separately approved testing, verify the fixed outcome and private row,
   exact OID, unchanged ownership, empty cleanup adoption and preserved source.
   Disabling registration affects only future observations; existing immutable
   records remain. This PR runs no protected release or activation workflow.

## Retry without another backup or restore

If identity capture and report upload succeeded but registration failed, use the
**independently retained** `backup-manifest.json`, which includes
`report.verifiedCopyIdentity`. Never rerun `prepare` merely to register metadata.
After verifying the exact retained artifact/hash, successful original worker
identity and verification result, the owner may authorize registration-only replay
through an already trusted private worker execution channel:

```sh
node deployment/release/retention/register-verified.mjs \
  --owner-reviewed \
  --manifest /private/backup-manifest.json \
  --expected-sha256 '<independently verified SHA-256 of this exact manifest file>'
```

Use only the restricted registrar credential and reviewed registration scope,
production-mode worker identity and explicit enablement. Replay requires no source
or restore-admin connection, S3 access, private signing key, archive plaintext,
backup or restore. It may run under a later worker deployment; the **original**
report deployment/run/attempt remains recorded. No new execution channel is
provisioned by this PR. If none exists, replay is operationally blocked until its
private execution is separately approved; do not improvise SSH trust or a public
endpoint.

Old successful evidence may be replayed after its request expiry because it is
historical provenance, not fresh release authorization. Its exact OID must still
exist with the expected owner/cluster. No name/OID guessing or overwriting is
allowed. If capture never succeeded or the retained manifest lacks identity, this
command refuses; retain protection and arrange separately reviewed manual evidence
reconciliation. A lost response can be retried with the same manifest, and a
transaction interrupted before commit leaves no partial row. Outputs are fixed
`COPY_REGISTRATION_REPLAY: PASS|FAIL`; all errors remain non-sensitive.

## Still required for storage control

* **Ownership adoption:** a separate privileged, audited, exact-OID review before
  inserting into the cleanup registry. Never automatically transfer fresh,
  current, pending, pinned or unknown copies. Observation does not authorize
  adoption, reuse a signature, age a copy into eligibility, or relax the 24-hour
  hold, newest-copy rules or protected live-commit references.
* **Inventory/report scheduling:** a separately reviewed bounded private read-only
  observer, fresh active/staged references and exact terminal run/attempt evidence,
  with no DROP ownership, permit INSERT or signing key. Missing evidence blocks
  cleanup. Alerts/review cadence are necessary: registration alone permits storage
  to grow indefinitely.
* **Destructive execution:** retain manual exact-batch signatures and isolated
  authorizer/runtime credentials. Before unattended cleanup, review and test
  exclusive `kingdom-come-production` coordination across the **entire** release
  lifecycle, staging, verification, promotion and all manual restores; no
  cancellation or indefinite lock reservation while awaiting approval. The
  worker-local lock alone is insufficient between jobs. Require fresh references
  and exact service/cluster identity through a reviewed private execution channel.
* No FORCE, connection termination, archive/artifact deletion, automatic unpin,
  ownership mass-transfer or proof/signature substitution. Native database-owner
  bypass remains documented in `COPY_RETENTION.md` and needs owner risk acceptance
  or a future constrained executor review.

Registration integration is implemented and tested, pending code review, merge
approval and separately authorized installation/activation. An inactive, manually dispatched job template has been implemented; it is not
installed in `.github/workflows`. No schedule, unattended deletion or production
infrastructure is enabled/provisioned. Its exact owner-gated shared-mutex and
private execution requirements are documented in the current readiness guide.
