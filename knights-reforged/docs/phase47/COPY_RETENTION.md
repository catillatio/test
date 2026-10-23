# Independent verification-copy retention (review only)

This change is **not activated**. It does not change `production-release.yml`, the
controller, worker, release protocol/proofs, migrations, startup, backup storage,
or gameplay. No production inventory, deletion, deployment, or configuration
change was performed. The existing release process continues to retain copies.

[The minimum integration proposal](COPY_RETENTION_INTEGRATION.md) separates future
automatic registration, scheduled reporting and destructive authorization. The
current default-off tooling alone does not achieve automatic storage control.

## Findings and storage accounting

`worker.mjs` creates one `copyName(jobId)` database for each successful preparation.
Its `finally` removes local plaintext and the ephemeral age identity, but explicitly
retains databases and encrypted objects. `run.mjs` forwards the selected copy in
the signed production approval and `KINGDOM_RESTORE_TEST_DATABASE`. Both game
pre-deploy and later recovery/rollback procedures can still need that database.
The worker's session advisory lock is `61824087`.

PostgreSQL does not provide a trustworthy database creation timestamp. Existing
names, OIDs, filesystem modification times, and successful builds do not establish
creation date or verification success. Existing copies have no retention catalog.
**Every unregistered copy therefore remains protected**, including failed or
partially restored jobs. Never mass-adopt names from a listing.

The reported 2.33 GB used on the 5 GB volume is owner-supplied; it was not measured
here. A dry run measures `pg_database_size` for each database and the sum eligible
for removal. It separately reports WAL bytes from `pg_ls_waldir()` if the role
already has permission; otherwise `walBytes` is null. It never expands privileges
to obtain that number. Other files, volume-used bytes, free space, logs, tablespace
and filesystem accounting are explicitly unknown. Database size plus WAL is not
an exact volume accounting identity. Do not call the 2.33 GB reclaimable space.

An owner can separately collect `SELECT coalesce(sum(size),0) FROM pg_ls_waldir()`
in the verification cluster's trusted administrative channel and compare Railway's
volume metrics, database totals, tablespaces, replication-slot retention and log
usage. Do not expose raw filenames or credentials. If WAL dominates, investigate
stalled slots/archiving/checkpoint pressure with the owner; retention alone may not
bound storage. This PR changes no WAL settings, runs no VACUUM FULL, and never
removes PostgreSQL-managed files.

## Exact selection and authorization

New independent commands live in `deployment/release/retention/`. Nothing imports
or schedules them from the release path. They require explicit enablement.

* Keep at least two newest **present, successfully verified** registered copies,
  ordered by owner-verified worker completion time, then database name ascending
  for deterministic ties. A missing database does not consume a retained slot.
* Keep every copy observed in the preceding 24 hours. Imports always record a fresh
  database-server `first_observed_at`; importing an old manifest cannot backdate
  eligibility. Completion time and observation time have separate purposes.
* Always keep the current production recovery reference, every registered copy
  matching the live game commit, pins, pending copies,
  jobs not explicitly confirmed closed, and copies with any connection.
* Persistent pins are append-only catalog events. Omitting a pin from a later
  state file cannot remove it; unpinning requires a separate privileged, audited
  event. The runtime can neither pin/unpin nor rewrite pin history.
* Missing/corrupted provenance, mismatched cluster/service/owner/OID, failed
  verification evidence, and uncertain timestamps prevent selection.
* `--keep` accepts 2–100; `--min-age-hours` accepts 24–8760. Limits can only be
  made more conservative. Reducing these minimum safeguards needs another review.
* Cleanup checks the existing public `/healthz` over verified HTTPS and rejects a
  changed/unhealthy game commit. It protects all registered copies for that commit,
  conservatively covering ambiguity between rehearsals for the same SHA. Before
  every DROP it also checks fixed read-only GitHub APIs: all five active/pending
  workflow states must be empty, and the exact originating protected release
  run/attempt/SHA must be completed. Unavailable/denied/malformed evidence blocks
  deletion; no retries, dispatches, provider writes or response logging occur.
* Cleanup requires a separately registered database permit **and** a dedicated Ed25519 owner signature over the exact
  dry-run plan hash, current-state hash, scope and approval ID. Public-key DER
  fingerprints must match the configured retention key and differ from the release
  key. Private PEMs are rejected in verification configuration. The authorization
  expires in four minutes; state may be at most five minutes old. No release
  signing key, archive decryption key, S3 credential or production DB URL is used.
* Although live health/SHA and run completion are independently checked, the
  owner-attested state must accurately identify the current **active deployment**
  reference, all staged/pending references, pins, and terminal release jobs. An
  expired release proof alone does not establish what the active game references.
  Unknown state blocks cleanup; an empty or absent current reference is rejected.
* PostgreSQL advisory locks are **database-local**: `adminDatabase` must equal
  `workerAdminDatabase`, the maintenance database in the existing worker restore
  connection. Do not create a separate catalog database or connect to a restored
  copy for this purpose. The registry is only a separate schema in that maintenance
  database. The command holds the same PostgreSQL session advisory lock as the worker for
  its entire inspection/cleanup. It fails immediately if a verification holds it.
  It rechecks identity, connections, provenance, retained count, age and approval
  before each DROP. PostgreSQL itself rejects a connection race: no FORCE,
  connection termination, disabling connections or filesystem deletion is used.

**Coordination is a required external precondition**, not something a Boolean can
prove: the owner must reserve the existing `kingdom-come-production` GitHub
concurrency group (or establish an exclusive, trusted maintenance window covering
all release/restore entry points) and verify that there is no running, waiting,
queued or approval-pending protected release, or unrelated manual restore. Keep it
reserved until cleanup exits. `releaseQuiescent` and the signed
`releaseConcurrencyHeld` are explicit owner attestations of that review. The
GitHub read guards reject observed active/pending protected runs. The cluster lock
covers cooperating verification workers; those observations do not reserve a
future scheduling window or coordinate an idle connection-free manual restore.
**Unattended scheduling is not authorized or ready until this coordination and
fresh reference collection have an authenticated implementation.** This deliberately
avoids pretending the existing API supplies a complete lifecycle registry.

## Roles and one-time setup — separately authorized, never a release migration

Use only a trusted private operator channel in the correct Railway project and
environment. There is no public endpoint, public database proxy, new Railway
service, SSH workaround, or automatic infrastructure provisioning in this PR.
These commands are deliberately absent from the existing game and release-worker
image allowlists. An approved private execution channel needs the exact reviewed
repository snapshot and locked Node/pg dependencies, installed before credentials
are exposed. Do not hot-patch a running game container.
If that channel is unavailable, stop: do not improvise connectivity or repurpose
the production release workflow. Creating an execution channel needs owner review.

1. Record exact project, environment, game service, production PostgreSQL service,
   verification worker, private operator execution service and verification
   PostgreSQL service IDs from authenticated Railway metadata. Confirm both private
   hosts, and SHA-256 of each cluster's `pg_control_system().system_identifier`.
   Confirm the hosts refer to those services, not just similarly named services.
   The source and verification cluster digests and hosts must differ. The command
   checks platform-injected execution IDs, the configured verification service ID/worker maintenance database,
   exact private hostname/admin database and the actual connected cluster digest.
2. On `KingdomReleaseCopy` only, a privileged owner identifies the existing
   maintenance database in the worker's `KINGDOM_RESTORE_DATABASE_URL`, then explicitly installs
   `deployment/release/retention/bootstrap.sql` in that same maintenance database with `psql -X -v ON_ERROR_STOP=1`.
   Confirm its target before executing. Installation is transactional and refuses
   an existing installation instead of silently replacing guards. It is not
   idempotent bootstrap; reruns require inspection. No game DB is touched.
3. Set separate `kc_retention_runtime` and `kc_retention_authorizer` passwords
   through the trusted channel's secure
   password facility. Grant no server-file, superuser, CREATEDB, CREATEROLE,
   replication, bypass-RLS, pg_monitor or broad data-reader roles. Use a separate
   privileged bootstrap/import credential, never the runtime password for setup.
4. `kc_retention_owner` owns the catalog, append-only tables and functions;
   runtime cannot own, replace, alter, truncate or rewrite them. The separate
   `kc_retention_authorizer` is also non-owning: it may SELECT metadata and INSERT
   only permit input columns; it cannot DROP databases, modify audit rows,
   register provenance, pin/unpin, change guards or set registration actor/time.
   The runtime can
   SELECT metadata and execute only the append-event function. The command verifies
   installed guard bodies, owners, trigger flags and effective role/table/schema
   privileges before use.
5. `kc_release_copy_owner` is a NOLOGIN, nonprivileged role. PostgreSQL has no
   per-database DROP-only grant: runtime inherits this role's database ownership,
   which also permits other owner-level operations **on those verification copies**.
   This residual permission must be accepted. It grants no production database
   ownership. Never grant membership in the worker's existing administrative role.
6. A privileged owner may transfer **only independently reviewed exact copies** to
   `kc_release_copy_owner`, recording the target/OID and ownership change in the
   operator audit trail. Example SQL template, never a wildcard loop:
   `ALTER DATABASE "<reviewed exact kc_..._restore_test name>" OWNER TO kc_release_copy_owner;`.
   Do not transfer the administrative database, templates, production DB, or an
   in-use/pending copy. Copy ownership is an additional opt-in gate; importing a
   manifest does not change it automatically.
7. Import each reviewed manifest with the privileged importer below. Independently
   verify its retained artifact/hash, exact worker deployment and successful
   completion time, identity/cluster hashes and preserved realm counts. This is an
   owner trust boundary: public manifests are not intrinsically signed storage
   provenance. Do not import merely because a filename or JSON claims success.
   Failed/unverifiable jobs stay unregistered and protected. Each import is
   immutable, OID-bound and records database-server time and session identity.
8. Create a **new retention-only** Ed25519 key on the owner's offline workstation.
   Keep its private PEM offline. Put only its public PEM in the execution channel
   as `KINGDOM_RETENTION_VERIFY_KEY`. Do not rotate or reuse release signing keys.
   Record full DER SHA-256 fingerprints for retention and existing release keys
   in the reviewed scope file. No token/key values go into git or chat.

The importer is explicit and idempotent for identical evidence/OID/completion time;
state differences fail. It never changes ownership or writes gameplay rows:

```bash
node deployment/release/retention/register.mjs \
  --scope scope.json --manifest retained-backup-manifest.json \
  --verified-at '<verified worker completion ISO time>' \
  --expected-oid '<independently reviewed database OID>' --owner-reviewed
```

Its separately supplied `KINGDOM_RETENTION_BOOTSTRAP_DATABASE_URL` must target the
same private admin database and cluster. The import credential must be authorized
to `SET ROLE kc_retention_owner`. Revoke/withhold it from normal runtime. Retain
original evidence and operator ownership-change audit separately. For a registered
copy, a separately authorized privileged operator can append a durable pin:

```sql
INSERT INTO release_retention.pins(name,pinned,reason)
VALUES ('<reviewed exact copy name>',true,'<owner-reviewed reason>');
```

Unpinning is another explicitly reviewed INSERT with `pinned=false`, never UPDATE
or DELETE. Both events retain database-server time and operator identity. Fresh
state-file pins are additional protections, not replacements for this catalog.

## Scope, fresh state and commands

`scope.json` is owner-reviewed configuration. See the fixture in
`tests/fixtures/release-retention.mjs` for its exact shape: protocol
`kingdom-copy-retention-v1`, seven UUID fields (`projectId`, `environmentId`, `operatorServiceId`,
`verificationServiceId`, `productionServiceId`, `gameServiceId`,
`verificationWorkerServiceId`), distinct cluster digests, the exact production HTTPS `origin`,
`host`/`sourceHost`, `adminDatabase`/`workerAdminDatabase` (must match the worker's actual maintenance database), `approvalKeyDigest` and `releaseKeyDigest`.
All fingerprints are complete SHA-256 hex values. UUID values must identify real,
independently checked resources at activation. Do not copy synthetic fixture IDs.

`state.json` contains `protocol`, identical `scope`, fresh ISO `observedAt`,
`releaseQuiescent: true`, `activeSha` (current healthy game commit), `currentRecoveryCopy`, `pinnedCopies`, `pendingCopies`,
and `closedJobIds`. All arrays must be explicit, unique and exhaustive for their
purpose. Only terminal jobs independently checked through GitHub/Railway belong
in `closedJobIds`. Do not infer closure from elapsed time or a missing connection.
Keep failed-release copies pinned unless their successful restore evidence and
terminal lifecycle are separately reviewed. Retain any rollback-referenced copy.

The clean runtime environment supplies `NODE_ENV=production`,
`KINGDOM_RETENTION_ENABLED=1`, `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`,
`RAILWAY_SERVICE_ID`, `KINGDOM_RETENTION_PG_SERVICE_ID`,
`KINGDOM_RETENTION_WORKER_ADMIN_DATABASE`,
`KINGDOM_RETENTION_DATABASE_URL` (private admin database, `kc_retention_runtime`),
and the retention public key. Runtime rejects both bootstrap and authorizer
connection variables. Cleanup also requires an ephemeral `GH_TOKEN` with
read-only Actions access to this repository; it is sent only to fixed GitHub
read endpoints, never to the public health endpoint. No Railway API token is
needed by retention. No `DATABASE_URL`, release signing secret, restore
URL, release request, PG connection overrides or provisioning flag may be present. Keep credentials out of
command arguments, output and artifacts. This is separate from existing release
variables; do not change the game's or worker's configuration to run it.

Within the reserved exclusive window:

```bash
node deployment/release/retention/cli.mjs dry-run \
  --scope scope.json --state state.json --out dry-run.json
```

Optional limits: `--keep 3 --min-age-hours 48`. This command writes no PostgreSQL
metadata or database content. It takes a session advisory lock and releases it
when the connection closes. Review every row's name, OID, reason and measured size.
Extract `dry-run.json`'s `plan` unchanged to `approved-plan.json`. On the owner's
trusted offline workstation, after reviewing exact targets and reserved window:

```bash
node deployment/release/retention/authorize.mjs \
  --scope scope.json --state state.json --plan approved-plan.json \
  --private-key /secure/offline/retention-private.pem \
  --release-lock-held --out approval.txt
```

Transfer only the short-lived approval and public metadata through the trusted
channel. **Before runtime cleanup**, a separately isolated, trusted authorizer
session uses only `KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL` (private maintenance
database, login `kc_retention_authorizer`), the public verification key and the
same scope/execution identity variables. It must receive neither runtime nor
bootstrap credentials, release/owner signing keys, or source database URLs:

```bash
node deployment/release/retention/permit.mjs \
  --scope scope.json --state state.json --plan approved-plan.json \
  --approval approval.txt
```

This command validates the signature before connecting and again before COMMIT.
It registers permissions only; it never changes database ownership or drops a
database. Do not place its credential on the cleanup service/runner and merely
remove an environment variable in the child: the isolation must be real. Withhold
that credential from normal runtime. If no trusted separate channel is available,
stop and keep cleanup inactive. Then, in the runtime-only session and before the
same state/signature expires (arrange approvals/execution readiness before signing;
never extend the validity window to accommodate provisioning or queue delays):

```bash
node deployment/release/retention/cli.mjs cleanup \
  --scope scope.json --state state.json --plan approved-plan.json \
  --approval approval.txt --out cleanup-result.json
```

Output files are exclusive-create, mode 0600. The console emits only fixed
PASS/FAIL labels; exceptions, SQL/provider details, keys and connection strings
are suppressed. Database names/sizes/reasons are in the restricted JSON report.
Changing the plan/state requires a new owner approval. This signature cannot
satisfy any release/backup/recovery/promotion gate.

## Audit hardening and its limits

At `99d2eaa`, runtime could call `record_event` with arbitrary approval IDs,
`deleted`/`absent` outcomes and byte figures, without a signature or intent. The
rows were append-only but were not authenticated deletion evidence. This revision
closes that path with an additional **non-destructive permit registration** step:

* A separate restricted authorizer validates the exact Ed25519 signature and scope
  in `permit.mjs`, rechecks current target eligibility and inserts immutable
  permits with their exact target plans transactionally. Concurrent identical
  registrations are idempotent; mismatches roll back. The normal runtime cannot insert, edit, extend
  or replace these permits. Registration actors/times are database defaults.
* The permit stores the complete signed envelope, canonical plan/state hashes,
  original plan/state, actual cluster identifier, maintenance database, expiry,
  exact names/OIDs and evidence hashes. An auditor can independently validate the
  retained signature and target bindings after expiry. Do not publish these
  short-lived capabilities or private operator reports.
* SQL requires a registered exact permit/target and the same maintenance-database
  exclusive advisory lock (a shared lock is rejected). Guard functions explicitly put
  `pg_catalog` before `pg_temp`; temporary catalog shadows cannot fake locks or
  database absence. New intents require an unexpired grant, the exact existing
  owner/name/OID, no connections and no durable/current/pending pin. Outcomes require a
  preceding durable intent. Only one terminal outcome is permitted per target;
  conflicting or out-of-order events fail. A refusal is terminal: a fresh owner
  authorization is required to attempt again.
* `deleted`/`absent` are accepted only when **both** the original OID and name are
  absent. Rename/replacement/still-existing cases fail. A refused outcome requires
  the original database to remain present. Repeated compatible terminal requests
  return the stored observation without adding rows or new reclaimed-byte credit.
  The same original database OID may receive deletion credit only once across all
  approvals; competing old intents must reconcile as zero-byte absence.
* The byte argument has been removed. PostgreSQL measures `pg_database_size` at
  intent; `deleted` carries that recorded measurement, and `absent`/`refused` carry
  zero. Input plan estimates cannot become audit byte figures. SQL outcomes may
  finish observing an existing intent after expiry; they cannot start a new one.
  The normal CLI independently enforces current signature/state freshness.

This is still a **database-state observation journal**, not complete proof of
causality, execution of the approved application path, or physical volume bytes
reclaimed. `refused` records a caller-reported abandonment/failure with the database
still present, not independent proof that PostgreSQL rejected DROP. PostgreSQL
without an added cryptographic verifier does not check Ed25519 inside SQL: the
separate authorizer is trusted to validate it. A compromised authorizer could
insert invalid grants; their stored envelopes would fail independent signature
validation. Bootstrap/database superusers can also alter guard definitions and
are outside the restricted-runtime threat boundary.

Most importantly, runtime still inherits **native database ownership**. It can
issue DROP directly on any database owned by `kc_release_copy_owner`, bypassing
this CLI, permit check and journal. Append-only SQL cannot compel database owners
to use a wrapper, and DROP DATABASE cannot be executed inside a transactional
security-definer function. This patch does not claim otherwise. Do not automatically
grant it ownership of every new/pending/current copy. Owner acceptance of this
residual risk is required; if unacceptable, remove ownership from the ordinary
runtime and design a separate constrained privileged executor/broker. That is an
additional architecture review, not implemented here. Existing player/source
cluster access and release/backup authorities are not granted to either role.

## Retry, recovery and space reporting

An autocommitted intent is written **before** each PostgreSQL DROP, followed by an
immutable outcome. DROP DATABASE is not transactional with the journal. No claim
of transactional rollback or undelete is made. If a process dies after DROP but
before its outcome, retry within the same authorization window and registered
permit reconciles only an absent database with a matching exact-plan/OID intent. It records `absent` and
reports zero newly measured reclaimed bytes. A completed terminal event is never
replaced by a second outcome. A reappeared/different-OID database
fails closed. If authorization expires, stop and inspect the journal before
requesting a fresh reviewed plan; never extend or bypass a signature.

`measuredDatabaseBytesRemoved` is the measured pre-DROP database size for confirmed
deletions in this invocation, not a promise of an equal instant reduction in
Railway volume usage. WAL/checkpoints/logging may temporarily offset reclaimed
space. No estimate is invented for interrupted/externally removed copies.

Backup objects and GitHub artifacts are never deleted. If a deliberately removed
old copy is needed again, restore its retained encrypted archive into a fresh,
separately authorized verification database; never rewrite a signed release proof
or point production at a guessed replacement.

## Verification and monitoring

Focused tests cover selection, conservative limits/age, public manifest evidence,
exact key/plan/state scope, active connections, failed/unclosed jobs, unknown
metadata, adversarial PostgreSQL grants/guard replacement, wrong cluster,
exclusive versus shared locks, temporary-catalog spoofing, unregistered/forged
permits, ordered terminal outcomes, server-measured bytes, duplicate-credit
rejection, isolated authorizer grants, transaction rollback, late-connection DROP
refusal, lost permissions, interrupted DROP/outcome retry, and source preservation (450 synthetic bots plus two humans,
saved wallets, Vault, sessions, holdings and history). Existing comprehensive CI
also runs the real populated-game migration/replay, encrypted backup, independent
restore, release/controller, browser and container regressions.

For activation, start with an owner-reviewed dry run and retain the JSON report and
operator journal. Monitor verification-volume used/free bytes, database count and
size, WAL size where authorized, protected/unknown-copy count, unsuccessful
retention runs, and reclaimed database bytes. Alert before 70/85/95% volume usage;
ensure the next source restore plus WAL and temporary space can fit. Owner review
is needed if unverified copies accumulate; never auto-delete uncertainty.

Safe scheduling progression: manual explicit approval first; then a separate
protected, default-disabled workflow sharing `kingdom-come-production`, collecting
fresh authenticated active/pending/live-reference evidence and executing through
an approved private channel with restricted credentials. Keep it independent of
release success and never use `always()` cleanup in the release job. No schedule,
new execution service, workflow dispatch or automatic cleanup is included here.
Automatic provenance collection/finalization, shared-concurrency execution and
unattended deletion require a
separately reviewed integration; current release behavior remains untouched.

The catalog format changed during draft review. If a previous review version was
installed in any test environment, use a fresh disposable fixture or prepare a
separately reviewed catalog upgrade. Do not rerun bootstrap over an existing
installation or replace guards in production as part of ordinary deployment.

Older append-only rows from the pre-hardening review format must not be relabeled
as authenticated observations. Preserve their original trust classification if
an upgrade is ever reviewed. Arrange private execution readiness and approvals
before signing; do not extend expiration windows to accommodate job setup.
