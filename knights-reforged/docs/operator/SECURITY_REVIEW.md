# PR #13 — hardening review

Scope: development and local synthetic verification only. This revision does not
authorize a merge, workflow activation, Railway provisioning, production inspection,
audit bootstrap, account correction or broadcast moderation. The PR remains draft.

## Findings corrected

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| The former runtime credential could own/replace its audit guards | Separate privileged bootstrap service/credential, NOLOGIN audit owner and non-owning runtime LOGIN | Actual restricted PostgreSQL connections cannot CREATE/ALTER/DROP objects, replace guards, change owners or disable triggers |
| Object names and a marker did not prove that guards were effective | Verify exact installed function body/security settings, trigger timing/events/bindings/conditions, object owners, catalog fingerprint and effective grants | Privileged synthetic replacement with a no-op function or AFTER trigger is detected; extra grants/memberships are rejected |
| PUBLIC TEMP could grant runtime DDL despite no direct grant | Preserve existing roles' effective TEMP explicitly, revoke PUBLIC TEMP before new roles are created, audit the previous ACL | Pre-existing TEMP access survives; new runtime cannot CREATE TEMP; unexpected PUBLIC schema CREATE causes complete transactional rollback |
| Node can derive a public key from private PEM supplied in a public field | Strict PUBLIC KEY PEM parsing and Ed25519 checks shared by controller and worker | Private operator PEM, private release PEM, wrong algorithm and wrong signing pair are rejected |
| Service UUID alone did not establish safe worker configuration | Authenticated posture checks before staging and before SQL | Repository triggers/source, public domains/TCP, command overrides, config overrides, replicas/restarts and missing metadata are rejected |
| Canceled runners could leave unbounded SQL work | Dedicated operator connection pool/session limits, transaction locks, signed expiry recheck and idempotent receipts | Concurrent applies commit once; wrong state or audit failure rejects/rolls back; container runs exercise actual runtime authentication |
| Reversal lacked an independently reviewed exact-target path | Fresh Gray restoration review/authorization linked to original immutable hide receipt | Wrong parent rejected; concurrent retries restore once and append a new operator/social audit |

No original release, backup, restore, promotion, migration, game-start, authentication
or gameplay implementation is changed. New operator helpers are not imported by
the game. Protocol v2 and the separate signing pair cannot satisfy release proofs.

## Database boundary

Bootstrap is a separately approved privileged database operation, not an ordinary
game migration. It creates two roles and two audit tables, transfers only the new
audit objects to the NOLOGIN owner, installs fixed grants and records bootstrap
source/run/actor plus prior database ACL details. Existing game objects retain
their owners. Existing player/bot/business rows are unchanged.

The runtime role is LOGIN/NOINHERIT, has no role memberships, owns no database,
schema, table or function, and cannot CREATE in the configured game database's
schemas or use its CREATE/TEMP privileges.
Its exact allowed SELECT/INSERT/column-UPDATE matrix is in [README](README.md).
Effective permission checks include PUBLIC and membership-derived access rather
than merely examining explicit ACL entries. A broader configured privilege makes
normal execution fail closed, even if a specific operation would not need it.

Runtime cannot update/delete/truncate audit history or alter its guards. A trusted
PostgreSQL superuser can still administer the installation. Append-only does not
mean cryptographic tamper resistance against that authority.

The runtime credential necessarily has INSERT on the action/social journals and
UPDATE on the permitted business columns. These grants are not row-level signed
capabilities: a stolen runtime credential could append false receipts or modify
other rows in those columns. Exact targets and owner approvals are enforced by
the fixed, signed worker. Credentials must remain private to that reviewed worker;
this PR does not claim resilience against a fully compromised worker/DB credential.
Bootstrap changes only the configured database's ACL; it does not rewrite PUBLIC
access on every other database in the cluster. Any other database's PUBLIC
CONNECT/TEMP defaults are a separate cluster-administration boundary, not an
additional permission to read or modify the game or its audits.

Only bootstrap handles the new runtime password. A standard salted SCRAM verifier
is generated locally; plaintext is not embedded in credential-utility SQL. No
password reset is performed on setup retry. The container regression uses real
SCRAM authentication, including rejection of a wrong runtime password.

## Railway permissions: unresolved provider-scope risk

Railway's documented project token is scoped to a project/environment, not one
service. No service-only permission was established for the existing token/CLI
contract. Read-only access alone cannot stage variables and upload a worker.

Minimum operations actually required:

| Component | Required capabilities |
| --- | --- |
| GitHub controller | Read exact project-token scope, service posture, deployment identity and deployment logs; set only the signed request variable on the selected private operator service without automatic deployment; upload/build that service |
| Bootstrap/runtime worker | Read token scope, its exact deployment identity and its private service posture; SQL using its own separately configured database role |

The worker code performs no Railway mutation, but the current project/environment
token can perform more operations than that code uses. It may read other service
variables or mutate other project services. Removing the admin database URL from
runtime's own variables does not eliminate this token's access to other services.
The PostgreSQL role separation therefore protects the database credential boundary,
but cannot by itself contain a stolen provider token.

Activation is blocked until the owner reviews/accepts that residual scope and
explicitly sets the independent scope-acknowledgment flags. Account/workspace tokens
are not an acceptable substitute. A future separately consented OAuth
`project:viewer` credential may reduce worker permissions; it requires separate
OAuth provisioning/lifecycle and a validated identity path, not removal of existing
identity checks or an assumed drop-in CLI replacement.

Public references: [Railway API](https://docs.railway.com/guides/public-api),
[OAuth scopes](https://docs.railway.com/integrations/oauth/scopes-and-user-consent).
The service-query fields were checked against the locally available Railway CLI
v5.70 public schema. No authenticated production API call was made. Actual provider
configuration and token access remain unverified.

## Key, artifact and service isolation

- Operator Ed25519 private material belongs only in its protected GitHub secret.
  All operator public verification fields accept only a public Ed25519 PEM.
  Controller correspondence and separation from the release key are mandatory.
- Both jobs use the existing production owner/environment/branch/CI gate. There is
  no `push` trigger on the operator execution workflow. Check workflows contain
  no production secrets. Neither approval nor setup automatically applies a target.
- Two independent service UUIDs prevent a normal request from using bootstrap's
  database authority. Both are distinct from game, database and release services.
- Both services must have no source/autodeploy, no public networking, no command
  overrides, no pre-deploy command, one replica and restart Never. Configuration
  that is missing or unverifiable stops execution. No automatic repair occurs.
- Detailed reviews/results are age-encrypted in memory to the existing public
  recipient. No age private key is uploaded. Authenticated exact-deployment logs
  transport ciphertext with protocol identity, hashes and immutable IDs; they do
  not print database URLs, private PEMs, provider responses or exception messages.
- GitHub artifacts have 30-day retention. Their unencrypted JSON contains protocol
  metadata, hashes and IDs, not credentials or full reviewed names/message text.
  Retain/decrypt on a trusted owner device; operator artifacts are not backups and
  cannot authorize production promotion.
- Build trust uses an optional ephemeral BuildKit CA secret for the local session;
  no TLS bypass or copied session CA image layer is introduced.

## Failure recovery and activation hazards

GitHub cancellation does not prove that an uploaded Railway job stopped. A request
expires after 15 minutes and is rechecked after metadata/permission checks. SQL
connections, statements and locks are bounded. The role has four connections;
each pool permits two. Same authorization retries are transactional and idempotent.

A mutation can commit before its report is retained. Recover with the same review
artifact/authorization while valid, or its read-only verification operation. Never
issue a new action or automatic reversal because a report was lost. If original
artifact/code provenance cannot be satisfied, stop for a separately reviewed
read-only receipt inspection. See [interruption instructions](README.md#interrupted-jobs-recovery-and-backups).

The shared production concurrency group prevents normal overlapping releases,
but does not stop an already running remote worker when GitHub exits. Check its
completion before another owner/release action. Avoid multiple pending dispatches:
GitHub may replace an older pending run even with `cancel-in-progress: false`.

Merging repository changes could cause an unintended game deployment if a separate
Railway source/autodeploy connection is enabled. The owner must establish that it
is disabled before any separately authorized merge. Creating services/configuring
credentials can also queue Railway work: use new empty private services only,
never clone/reconfigure the game or apply unrelated pending changes. Enabling the
GitHub flag alone neither provisions nor deploys a worker. Every actual inspection
still requires an explicit dispatch and owner approval of the private worker job.

Logical recovery with the existing `--no-owner --no-acl` format preserves audit
rows/guards but not roles/ownership/grants. Raw restored data intentionally fails
operator readiness. A disaster recovery requires a separately authorized reviewed
permission rebind on a restored copy; bootstrap refuses to adopt/overwrite an
existing incompatible audit installation. Game recovery safeguards are unchanged.

## Separately approved Gray reversal

Reversal is prepared, not authorized or executed. A fresh `review-gray-restore`
requires the exact message UUID and original operator hide authorization. It
checks fixed Gray identity/content/timestamp, hidden status and the latest matching
moderation receipt. Deleted or subsequently re-moderated messages fail closed.

The owner must decrypt/review the warning that restoration republishes offensive
content, then approve the new exact confirmation and protected apply job. Restoration
appends `operator_restore` and a new immutable action referencing the original hide;
it never rewrites either audit. Development Knight is not a supported target.

## Readiness decision

Local hardening verification is recorded in [VERIFICATION.json](VERIFICATION.json).
There is no authority here to perform the following remaining steps:

1. Owner acceptance of provider-token scope and bootstrap ACL/role changes.
2. Separately authorized merge, private-service setup, keys and credentials.
3. Authenticated posture/permission validation and separately approved bootstrap.
4. Exact live-target inspection, owner review and individual mutation authorization.
5. Live name/session and All/Broadcasts visibility verification after any action.

None of these live checks is claimed complete. PR #13 remains draft and inactive.
