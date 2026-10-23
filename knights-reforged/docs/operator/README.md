# Targeted owner operator — hardened draft, inactive

Development and synthetic testing only. This PR grants no permission to merge,
provision services, enable workflows, inspect production, bootstrap roles/audits,
hide a message, restore it, or rename an account. PR #12 is independent.

The existing game/release Dockerfile, start commands, migrations and protected
release/backup/restore/promotion files are unchanged. The game schema head stays
`020_game_feel.sql`. No initialization, seed or bot-generation path is called.

## Two private service identities and two database authorities

The previous same-credential setup/runtime design is replaced:

| Job | Private Railway service | Database authority |
| --- | --- | --- |
| `setup-audit` | Separate empty **operator bootstrap** service | Privileged PostgreSQL bootstrap credential; setup mode only |
| Review / apply / verify / Gray reversal | Separate empty **operator runtime** service | `kc_operator_runtime`, never the game/admin credential |

Both services run the same one-shot image; the signed mode determines which
immutable service UUID is permitted. The worker independently checks authenticated
Railway metadata before opening PostgreSQL. A normal request sent to bootstrap,
or a setup request sent to runtime, fails closed.

`kc_operator_owner` is a separate **NOLOGIN** role owning the two audit tables and
the guard function. The existing game schema remains owned by its privileged
owner, never by runtime. Neither new role has superuser, replication, BYPASSRLS,
CREATEROLE, CREATEDB or inherited memberships. Runtime has a four-connection limit,
no schema/database CREATE, no TEMP and owns no schema, table or function.

Bootstrap requires the existing `public` game schema, creates roles once and never resets an existing password. It transfers
ownership of **only the new audit objects**. It does not transfer ownership of any
existing game table or modify any player record. Unknown existing roles or an
old/incompatible audit installation cause failure, never automatic adoption.

PostgreSQL normally grants TEMP through PUBLIC. To exclude the new runtime role,
bootstrap explicitly preserves every pre-existing role's effective TEMP privilege
with an individual grant, then revokes PUBLIC TEMP **before creating the new
roles**. The previous database ACL and preserved roles are recorded in the immutable
bootstrap marker. Existing game logins retain their effective access; future new
roles no longer inherit TEMP by default. This database-ACL change is part of the
separately approved bootstrap, not an ordinary deployment. Unexpected PUBLIC CREATE
or other grants that would give runtime DDL make bootstrap roll back completely.
Do not broadly revoke unrelated production privileges to force it through.

The bootstrap password is supplied privately as `KINGDOM_OPERATOR_RUNTIME_PASSWORD`
(base64url, 43–128 characters), generated on a trusted machine or password manager.
The bootstrap process generates a standard SCRAM verifier, so plaintext passwords
never appear in credential-utility SQL, CLI arguments, artifacts or logs. The
runtime connection is authenticated after setup; a wrong secret fails without
resetting the database role. Neither password nor admin URL is returned in reports.

## Effective runtime grants and audit verification

| Object | Allowed runtime access |
| --- | --- |
| accounts | SELECT id/username/login_disabled; UPDATE username only |
| characters | SELECT id/account_id/name; UPDATE name only |
| development_bots | SELECT character_id |
| realm_messages | SELECT (existing moderation helper needs the full row); UPDATE status only |
| social_moderation | INSERT; SELECT id/message_id/action/reason/created_at |
| owner_operator_schema | SELECT |
| owner_operator_actions | SELECT and INSERT |

There is no password-hash, session, wallet, Vault, inventory, Land or combat-data
access, no DELETE/TRUNCATE/TRIGGER grant and no audit UPDATE. Role grants are
column/table scoped; exact target rows are enforced by the signed private worker.
The credential is not a database-level row-restricted capability. PostgreSQL
superusers and the trusted bootstrap authority remain capable of administration.

Before any normal job—and again inside a mutation transaction—the implementation
checks effective privileges, including PUBLIC/inherited grants, object ownership,
role flags and memberships. Excess access or DDL fails closed. It verifies the
actual guard body, language, signature, owner and settings, all four trigger
bindings/events/enabled states/conditions, and a catalog fingerprint of audit
columns, defaults and constraints. Matching names or a marker alone are insufficient.

Audits are append-only for runtime. An audit failure rolls back both the target
change and the existing social moderation audit. A unique authorization receipt
makes simultaneous and retried execution idempotent. The source SHA/run/owner,
review digest, immutable target IDs, exact field and before/after states are retained.

## Railway token investigation and unresolved scope risk

Official references reviewed:

- https://docs.railway.com/guides/public-api — project tokens are environment scoped.
- https://docs.railway.com/integrations/oauth/scopes-and-user-consent — OAuth offers
  `project:viewer` and `project:member`, not documented service-only capabilities.

The **controller** must read project/environment, service configuration, deployments
and logs; stage `KINGDOM_OPERATOR_REQUEST` on the selected operator service; and
upload/build that service. A read-only token cannot perform the required staging
and upload operations. No service-only read token can support that whole workflow.
The existing project/environment token is the narrowest existing compatible
credential demonstrated by this mechanism; do not substitute account/workspace keys.

The **workers** issue only authenticated metadata reads, but currently use that
same project/environment token. Its provider permissions still include mutations
and may expose other services' variables, including administrative connection
references. PostgreSQL runtime grants do not contain a compromised Railway token.
This residual project/environment blast radius must be explicitly accepted before
activation using repository variable `KINGDOM_OPERATOR_RAILWAY_SCOPE_ACKNOWLEDGED=true`.
Each private service also requires `KINGDOM_OPERATOR_RAILWAY_SCOPE_ACKNOWLEDGED=1`.
These flags are unset during development; they are not permission grants by themselves.

A separately consented OAuth `project:viewer` credential is a possible future
worker-only reduction. It requires an OAuth app/token lifecycle and a separately
validated identity-verification path; it has not been provisioned or assumed to
support the CLI/project-token identity contract. Do not remove independent identity
verification or silently fall back to a broader token. This PR does not claim
service-only Railway least privilege or a live authorization test.

## Fail-closed private service posture

Authenticated API checks run before request staging/upload and again in the worker
before SQL. Both distinct operator services must have:

- Dockerfile builder, default/root upload directory, no config-file override.
- No repository trigger, repository source or image source; no GitHub autodeploy.
- No build/start override, pre-deploy command, cron or health check.
- Exactly one replica, restart **Never**, zero retries and sleeping disabled.
- No Railway domain, custom domain or TCP proxy.

Missing metadata is failure, not an inferred default. No automatic repair,
service creation, restart or configuration changes occur. The controller stages
only the signed request and deliberately uploads **only the chosen operator service**.
Even a read-only database review therefore deploys a private worker. Enabling a
GitHub variable alone does not deploy anything. A merge could trigger an existing
Railway source deployment if autodeploy were enabled: the owner must verify it is
disabled **before any separately authorized merge**, without applying unrelated
pending changes. Existing game/release services must not be cloned or edited.

## Separate signing and encrypted review

Protocol `kingdom-owner-operator-v2` cannot satisfy release/migration/backup proofs.
Use a NEW Ed25519 operator pair, never a release private key. Every declared public
verification field rejects private PEMs and non-Ed25519 keys. Controller matching
and separation checks remain mandatory. Only the private signing PEM belongs in a
GitHub production **secret**. Only a PUBLIC KEY PEM belongs in variables or Railway.

The existing public age recipient encrypts human-readable target details in memory.
No age private identity is uploaded. Exact-deployment authenticated logs carry only
an operator frame with ciphertext, IDs and hashes; failures print fixed categories.
GitHub retains `owner-operator-RUN-ATTEMPT` artifacts for 30 days. These are NOT
recovery backups and cannot authorize game promotion or production migration.

Reviews last 24 hours; signed job requests last 15 minutes and are rechecked after
provider operations. Apply/verify require the successful owner review's exact
workflow/run/attempt/artifact, code SHA, environment, digest and target. Source
changes require a new review. Preserve the artifact and audit reference.

## Fixed targets, reviews and independently approved mutations

Name target: `af025047-1c77-437a-8d5a-dd51eba71840`, exact `mosslikesbbc` → `mosslikesbb`.
`review-name` inspects BOTH `accounts.username` and `characters.name`. One matching
field is selected; if both match, review again with an explicit field. Only that
field can change. Replacement validation and uniqueness checks are authoritative.
Credentials, account/player UUIDs, sessions and all other records stay unchanged.

Gray author: `aff9d7b2-5044-4002-907a-60a9a273d375`. `review-gray` requires one exact
owner-specified content digest among at most 50 broadcasts, or an explicit UUID
that still matches author/channel/content. Truncation/ambiguity fails. Inspect the
decrypted UUID, author, full body, six-digit UTC timestamp and visible status.
Development Knight is never a target. **Reported for review** is only a player report,
not a permission to remove someone else's message.

Decryption on the owner's trusted machine (never paste credentials into chat):

```sh
umask 077
age --decrypt --identity /trusted/offline-owner.agekey --output reviewed-target.json review.age
```

Only after reviewing actual details—not just a digest—may the owner authorize:

```text
name_correction/af025047-1c77-437a-8d5a-dd51eba71840/<selected-field>/<review-digest>
gray_broadcast_hide/aff9d7b2-5044-4002-907a-60a9a273d375/<message-UUID>/message_status/<review-digest>
```

Each apply is a DIFFERENT dispatch and production-environment approval. There is
no combined mutation or automatic apply after review. Exact account/name state,
message author/body/time/status, authentication-disabled status and bot exclusion
are revalidated under locks. All mutations are transactional and auditable.

## Gray reversal: separate fresh review, never automatic

Prepared operations `review-gray-restore`, `apply-gray-restore`, `verify-gray-restore`
apply ONLY to the same fixed Gray identity/content and a hide completed by this
operator. Review requires the exact message UUID AND original hide authorization
UUID. It verifies the immutable hide receipt, matching message/time/body, hidden
status and latest matching `operator_hide` social audit. Author-deleted messages,
later unrelated moderation and Development Knight cannot be restored.

Decrypt the fresh restoration review, including its warning that the offensive
message will become publicly visible. Restoration requires a NEW owner authorization,
review digest and environment approval:

```text
gray_broadcast_restore/aff9d7b2-5044-4002-907a-60a9a273d375/<message-UUID>/<original-hide-authorization-UUID>/message_status/<new-review-digest>
```

The restore adds an `operator_restore` social audit and a NEW append-only operator
receipt linked to the hide. A unique parent reference and normal idempotency prevent
duplicate reversals. Neither original audit is rewritten or deleted. No hide or
restore has been performed in production during development.

## Minimum FUTURE owner setup order (not authorized now)

1. Review this hardening revision, residual Railway scope and test evidence. Keep
   PR #13 draft/inactive until separately approved. No merge or dispatch is implied.
2. Before a separately authorized merge, verify existing game/release autodeploy
   is disabled and no unrelated pending Railway changes will be applied. Merge
   only after explicit approval; require both exact-commit push CI workflows.
3. Create TWO separate empty private services after explicit setup authorization.
   Configure the posture above; neither is the game, PostgreSQL, release worker
   or verification PostgreSQL. Do not connect a repository or clone the game.
4. Generate a distinct operator Ed25519 pair on a trusted machine. In GitHub web
   **Settings → Environments → production**, retain sole reviewer `catillatio`,
   no administrator bypass and only `release/production`. Add secret
   `KINGDOM_OPERATOR_SIGNING_KEY` and PUBLIC variable `KINGDOM_OPERATOR_VERIFY_KEY`.
   Preserve existing release keys. Never put a private PEM in a variable.
5. Add environment variables `RAILWAY_OPERATOR_SERVICE_ID` and
   `RAILWAY_OPERATOR_BOOTSTRAP_SERVICE_ID`. Reuse existing project/environment,
   game/PG/verifier IDs, private host/database name, public age recipient and
   public release verification key. Keep `RAILWAY_TOKEN` only in its protected
   GitHub secret. Repository flags are `KINGDOM_OPERATOR_OWNER=catillatio`,
   `KINGDOM_OPERATOR_ENABLED` and the separately reviewed scope acknowledgment.
6. Privately configure bootstrap only: `NODE_ENV=production`,
   `KINGDOM_PRIVATE_ALPHA=1`, `KINGDOM_OPERATOR_WORKER=1`,
   `KINGDOM_OPERATOR_BOOTSTRAP=1`, scope acknowledgment `1`, scoped provider token,
   public operator key, privileged private `DATABASE_URL` and random runtime
   password. Bootstrap's image CMD is the worker, not a game/migration command.
7. Confirm a current recovery backup using the established independent recovery
   procedure before privileged bootstrap. The operator neither creates backups
   nor consumes release approvals. Only after separate authorization enable the owner workflow and approve
   **setup-audit** with its schema/role/ACL-specific confirmation:

   ```text
   INSTALL_OPERATOR_AUDIT_V2_PRESERVE_EXISTING_ACL/<full-SHA>/<project-UUID>/<environment-UUID>
   ```

   This authorizes no account/message action. Review the encrypted setup report.
   If it fails, do not reset the database or edit the marker to force acceptance.
8. Configure runtime only with the new `kc_operator_runtime` private URL, same
   public operator key/scoped metadata token and normal worker/private-alpha flags.
   It must have NO bootstrap flag, runtime-password variable or admin connection.
   Secure/remove bootstrap-service credential references when no longer needed;
   coordinate future setup separately and do not rotate the game's credential.
   Existing provider deployment snapshots and project-token access are privileged
   residual risks, not erased by removing a current variable.
9. Approve read-only name/Gray reviews, download/decrypt and verify exact targets.
   Then—and only with separate exact-target authorization—approve each apply.
   Verify the selected name and Gray absence from Recent Activity → All and
   Broadcasts, with unrelated activity intact. Keep operator disabled when unused.

Android: **Actions → Owner approved targeted operator → Run workflow**, select
`release/production` and the exact intended operation. **Review deployments** is a
separate owner approval. Do not approve a different branch/commit or bypass a gate.
The two live account mappings and exact Gray UUID/state remain uninspected here.

## Interrupted jobs, recovery and backups

A canceled/timed-out GitHub runner does not cancel an already queued Railway job.
The request remains usable only until its signed expiry; the worker rechecks it
before DB work. Operator-only sessions have 5s connection/lock limits, 15s normal
statement limits (bootstrap requests 30s), 20s idle-transaction/client-query limits, two client connections and a
four-connection role cap. Existing game timeout/start configuration is unchanged.

A transaction may commit before report upload fails. Retry the SAME review artifact
and authorization while valid, or run the corresponding read-only `verify-*` job.
Do not generate a new authorization merely because reporting failed. Never auto
restore, restart services or dispatch a game release to recover a report. Confirm
worker completion and current receipt before another administrative/release action.
The shared production concurrency group also serializes with releases; Actions can
replace an older pending run, so avoid stacking dispatches. A stopped runner alone
is not proof of a stopped worker.

If the original artifact expires, the production SHA changes, or metadata/permissions
are unavailable, this exact-artifact path stops. Request a separately reviewed
read-only audit inspection; do not weaken same-code or provenance checks.

Existing encrypted recovery and independent restore gates are unchanged. Logical
backups preserve audit rows and trigger definitions, but the established
`--no-owner --no-acl` recovery format does NOT reproduce PostgreSQL roles/ownership/
grants. A raw restored database therefore deliberately fails operator readiness.
Keep operator disabled after a disaster restore until a separately authorized,
reviewed ownership/permission rebind and runtime credential provisioning has passed
on a restored COPY. Do not blindly rerun bootstrap or overwrite existing audit
history. No automatic permission repair is included in ordinary game deployment.

## Verification and limitations

See [VERIFICATION.json](VERIFICATION.json) and [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
Tests use populated synthetic realms with all 450 bots, actual restricted PostgreSQL
logins, adversarial DDL/grants/guard replacement, rollback, races, SCRAM authentication,
actual age encryption/decryption and no production network access. Fixture metadata
is mocked outside the allowlisted worker bundle. Local build CA trust is supplied
as an ephemeral BuildKit secret; TLS is never disabled and the session CA is not
copied into image layers.

The provider's actual configuration, live key/credential correspondence, target
records and moderation results remain unverified until separately authorized.
This is controlled owner tooling with explicit residual provider-token risk,
not a claim of service-level confinement or tamper resistance against PostgreSQL
superusers/Railway project administrators.
