# Targeted owner operator — preparation for review

This change prepares a private mechanism. It grants no permission to provision a Railway service, inspect production records, install audit tables or execute either correction. Those are future, separately authorized steps. Nothing in this change runs on normal game startup or deployment.

This branch is based on production `b305fa011d9428b7e00e68a7cc38026e0bcdb256`. It does not merge the Phase 4.9 gameplay branch or change draft PR #12.

## Scope and current unknowns

| Action | Fixed player UUID | Allowed change |
| --- | --- | --- |
| Name correction | `af025047-1c77-437a-8d5a-dd51eba71840` | Exactly one reviewed field: `mosslikesbbc` → `mosslikesbb` |
| Gray broadcast | `aff9d7b2-5044-4002-907a-60a9a273d375` | One exact matching broadcast: `visible` → `hidden` |

Neither live target has been inspected during development. The account UUID, actual unwanted-name field, replacement availability, Gray message UUID, timestamp and current visibility remain **unverified** until an authorized review. The Gray content is compared against the exact owner-specified UTF-8 message digest, without printing it in Actions logs. No approximate age, display-name search or fuzzy content matching authorizes a write.

The current player UI's **Reported for review** state records a report; it does not confer moderation rights or hide another author's message. This tool reuses the existing trusted moderation transaction instead of changing account permissions or turning a player report into an automatic deletion.

Development Knight's already-removed message is outside the action whitelist. There is no arbitrary player ID, replacement name, SQL, deletion, role-change or restore input.

## Architecture and separation

1. A manually dispatched GitHub workflow checks the exact protected production commit, sole owner identity, environment protection and successful game/operator CI.
2. GitHub's existing protected **production** environment requires owner approval before Railway credentials and a **new, separate operator signing key** become available.
3. The controller signs a 15-minute request for one action and one private operator service. Only that request is staged; game/release/database service variables are never changed.
4. Railway builds a small allowlisted source bundle and runs a one-shot worker in its private network. There is no HTTP listener, public endpoint, SSH connection, migration runner or initialization command.
5. The controller and worker independently authenticate the project/environment-scoped token and verify deployment identity through Railway's authenticated metadata API. A deployment ID alone is insufficient.
6. A review uses an explicit PostgreSQL `REPEATABLE READ READ ONLY` transaction, without normal game reads that can settle income or advance tutorial state.
7. Human-readable target details are encrypted in memory to the owner's existing public age recipient. Authenticated exact-deployment logs carry only an operator report frame with ciphertext, IDs and hashes. Provider output and exceptions are captured, not echoed.
8. GitHub retains `owner-operator-<run>-<attempt>` artifacts. These are **not recovery backups**. They cannot satisfy release, migration, backup or promotion proofs.

The protocol domain is `kingdom-owner-operator-v1`. It imports no release protocol, store or controller. Its Ed25519 public key must differ from the release key. No release signing secret, recovery-store credential or PostgreSQL connection string is placed in the operator GitHub job. Only the existing public age recipient and public release key are reused, the latter solely to reject key reuse.

The existing production concurrency group is shared to prevent operator/release overlap; release files and behavior are unchanged. Requests expire and the service must use **Never** restart with one replica, no cron, no automatic source deployment and no public networking.

## One-time setup — only after separate owner authorization

Do not perform this setup merely because the development PR exists. Review the PR and synthetic test evidence first. Neither this guide nor a passing CI run authorizes a merge, service creation or production database access.

### GitHub, including Android web UI

After an explicitly authorized merge to `release/production`:

1. In the repository web UI, open **Settings → Environments → production**. Retain sole reviewer `catillatio`, administrator bypass disabled, and deployment access restricted to `release/production`. Do not weaken protection to make a job start.
2. Under **Settings → Secrets and variables → Actions → Variables**, add repository variables `KINGDOM_OPERATOR_OWNER=catillatio` and, **only when production operator use has separately been authorized**, `KINGDOM_OPERATOR_ENABLED=true`. The default is disabled: unset or any other value stops the workflow.
3. Using a trusted offline machine, generate a distinct operator Ed25519 pair. Do not rotate or reuse release keys:

   ```sh
   umask 077
   openssl genpkey -algorithm Ed25519 -out kingdom-operator-private.pem
   openssl pkey -in kingdom-operator-private.pem -pubout -out kingdom-operator-public.pem
   ```

4. Add the complete multiline private PEM as **production environment secret** `KINGDOM_OPERATOR_SIGNING_KEY`. Add the complete public PEM as **production environment variable** `KINGDOM_OPERATOR_VERIFY_KEY`. Preserve actual line breaks; do not substitute literal `\n` text. Never paste the private key into chat, workflow inputs or the repository.
5. Add production environment variable `RAILWAY_OPERATOR_SERVICE_ID` after the separately authorized private-service setup below.
6. Keep existing production environment bindings: `RAILWAY_TOKEN` secret; variables `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_GAME_SERVICE_ID`, `RAILWAY_PG_SERVICE_ID`, `RAILWAY_RELEASE_WORKER_SERVICE_ID`, `RAILWAY_VERIFY_PG_SERVICE_ID`, `KINGDOM_DATABASE_HOST`, `KINGDOM_DATABASE_NAME`, `KINGDOM_BACKUP_RECIPIENT` and `KINGDOM_RELEASE_VERIFY_KEY`. The last two are public keys. Do not copy a database URL or release private signing key into this workflow.
7. Both **Kingdom Come checks** and **Targeted operator checks** must pass for the exact current production push commit. The controller checks these again after environment approval. A changed production commit requires a new review; it cannot consume an older code candidate's approval.

On Android, **Actions → Owner approved targeted operator → Run workflow** exposes operation and review fields. Selecting **Run workflow** is not the environment approval: review the pending job under **Review deployments** and approve production separately. Stop if the exact intended branch, commit, action or approval gate is absent.

### Dedicated private Railway service

In the existing project and production environment, create a **separate empty private service**, for example `KingdomOwnerOperator`. This must not be the game, PostgreSQL, release worker or verification PostgreSQL service. Do not attach a GitHub repository or enable automatic deployment. Do not use `railway run` as a remote shell.

Configure only the new service:

| Setting | Required value |
| --- | --- |
| Builder | Dockerfile; uploaded bundle root; no game root-directory setting |
| Start | Image CMD: `node deployment/operator/worker.mjs` |
| Pre-deploy / health check / cron | None |
| Replicas / restart | One / Never |
| Public domain / TCP proxy | None |
| `NODE_ENV` | `production` |
| `KINGDOM_PRIVATE_ALPHA` | `1` |
| `KINGDOM_OPERATOR_WORKER` | `1` |
| `DATABASE_URL` | Reference to the existing PostgreSQL service's **private** URL, exact configured source database |
| `RAILWAY_TOKEN` | Existing project/environment-scoped token, stored privately; used for authenticated read-only identity checks |
| `KINGDOM_OPERATOR_VERIFY_KEY` | New public operator PEM, matching GitHub's operator signing secret |

Railway supplies actual project/environment/service/deployment IDs. The worker compares them to the signed context and authenticated metadata. The private URL must have the expected `*.railway.internal` hostname, exact database name, port 5432/default and no query overrides. Do not expose PostgreSQL publicly or copy its URL into Actions.

Do not set initialization, seed, release-worker, migration or release-backup-proof variables on the operator service. No signing private key or age private identity belongs there. `KINGDOM_OPERATOR_REQUEST` is staged automatically only after all workflow approvals. Avoid applying unrelated pending service changes; leave the game and existing verification services unchanged.

This design reuses the existing database user and project token. It does not create or broaden account permissions. The provider credential is project/environment scoped, **not service-only**; signed target restrictions, checked service identity, protected code and owner approval supply the narrower application-level boundary. Treat that token and database user as sensitive operator credentials.

## Audit support — explicit schema-only approval

The game's release verifier pins schema head `020_game_feel.sql`. Adding an automatic game migration would conflict with that safeguard. Consequently `deployment/operator/audit.sql` is deliberately **outside** the game's migrations list. Ordinary startup, upgrades, review and verification never install it.

An independently approved `setup-audit` operation creates only:

- `owner_operator_schema`: definition hash and installer/code/run/timestamp marker.
- `owner_operator_actions`: immutable authorization receipt with player/account/message IDs, exact field, before/after values, owner, code SHA and GitHub run identity.
- Append-only update/delete/truncate triggers on both tables.

It modifies no existing business rows or migration records, runs no seeding or bot provisioning, and requires the populated realm, exactly 450 existing bots and unchanged schema head. A repeated setup verifies the installed definition/protections and adds nothing. Partial or incompatible setup fails closed.

For that operation alone, enter this schema-only confirmation, substituting reviewed non-secret IDs:

```text
INSTALL_OPERATOR_AUDIT_V1/<full-production-SHA>/<project-UUID>/<environment-UUID>
```

It authorizes no username or broadcast change. Read-only target reviews can run before setup; mutation requests fail without verified audit support. Trigger protections are enforced for ordinary SQL but cannot resist a database owner deliberately disabling or replacing them; no such capability is exposed through this operator protocol.

## Review each exact target

Only after explicit production-inspection authorization, dispatch **review-name**, using `field=auto` initially. Both `accounts.username` and `characters.name` are inspected through the fixed player UUID. One match selects that field; two matches produce an ineligible review requiring another owner-selected field. Neither match, missing/disabled/bot account or unavailable replacement stops application. The two fields will never be silently changed together.

Dispatch **review-gray** separately. The query is bounded to at most 50 broadcasts from Gray's fixed player UUID and requires one exact content match. A truncated or ambiguous result fails closed. An optional exact broadcast UUID can disambiguate, but it must still pass author/channel/content checks. Hidden or deleted messages cannot receive a new hide authorization.

For each successful review:

1. Download its `owner-operator-<run>-<attempt>` artifact. Retain the run ID, attempt and artifact ID.
2. `review.json` contains hashes and immutable IDs, not full names/message text. `review.age` contains the actual human-readable review. Decrypt on the owner's trusted machine using the existing offline age identity:

   ```sh
   umask 077
   age --decrypt --identity /trusted/offline-owner.agekey --output reviewed-target.json review.age
   ```

3. Review `details`, `review`, `reviewSha256`, `eligible` and `confirmation`. Do not approve a digest without inspecting the decrypted target. Do not post the private identity, encrypted artifact's signed download URL or private configuration in chat.
4. For the name, confirm the player/account UUID mapping, **both current name values**, selected field and replacement availability. Changing the login handle changes future login text, not the password or existing sessions; changing only the public name leaves login unchanged.
5. For Gray, confirm message UUID, fixed author UUID, author name, exact full body, six-digit UTC creation timestamp and `visible` status. Development Knight is never a target.

Reviews last 24 hours. Job requests last 15 minutes. Exact code SHA, project/environment, private source identity and operator-service identity must still match. A code update requires a new review, not a guard override.

## Two independent mutation approvals

Development approval does **not** authorize these dispatches. Obtain explicit owner authorization for the reviewed name field and, separately, the exact reviewed Gray UUID.

For **apply-name**, fill its original review run ID, artifact ID, SHA-256 digest and exact confirmation from the decrypted review:

```text
name_correction/af025047-1c77-437a-8d5a-dd51eba71840/<reviewed-field>/<full-review-digest>
```

Review the pending production job and approve it. **apply-gray** is a different dispatch and different environment approval, using its own artifact/digest/phrase:

```text
gray_broadcast_hide/aff9d7b2-5044-4002-907a-60a9a273d375/<exact-message-UUID>/message_status/<full-review-digest>
```

The artifact must originate in the successful owner workflow, at the same exact production commit, by the same owner. Unrelated/release artifacts and failed/expired review artifacts are rejected. There is no automatic apply after review, no combined mutation option and no automatic follow-up to the other action.

The transaction locks the exact account/player and, for Gray, exact message; rechecks reviewed names/content/time/status; performs one field update or existing reversible moderation action; appends audit; verifies resulting state; then commits. Uniqueness constraints and timeouts remain authoritative. Unexpected changes roll back everything. No wallet, inventory, session, password, army, recruitment, property, battle, tutorial, achievement or bot row is rewritten.

## Success, retries and interrupted reports

A worker can commit and then lose its encrypted report. A failed workflow therefore does **not** prove that no change occurred. Never authorize a different message or a new guessed target to recover.

- Retry with the **same original review artifact and authorization** while it remains valid. One unique receipt makes concurrent/retried calls return `already-applied`; they cannot duplicate the change or audit.
- Or dispatch **verify-name** / **verify-gray** with the original review artifact, run and digest. This is an explicit read-only transaction and can inspect an expired review, provided its retained artifact, code and environment still match. It cannot execute or reverse a mutation.
- Download/decrypt the encrypted result to inspect the exact current values and audit reference. Provider failures print fixed categories only. Do not disable validation to obtain a report.
- Once an artifact expires (30 days), or production code changes, this exact-artifact path stops. Preserve the downloaded audit reference; request a separately reviewed compatible audit inspection rather than bypassing same-code checks.

For the name, the result verifies the selected new value, untouched other name and same account/player UUID. Password/session preservation is proven in synthetic tests without inspecting production password hashes. The account owner can confirm ordinary login or an existing session after a separately authorized live action.

For Gray, verification requires the same UUID/author/body/time, hidden status, and corresponding existing `social_moderation.operator_hide` audit. After the authorized action, owner UI verification must confirm absence from **Recent Activity → All** and **Broadcasts**, with unrelated activity intact. Ordinary game page reads may settle income normally; the operator's read-only checks do not. Until the live checks occur, cleanup remains unresolved.

Reversal is possible because the message is retained. The existing trusted `deployment/moderate.mjs restore <message-UUID> <reason>` procedure requires its own authorization and trusted operator access; **this narrow job intentionally has no restore input**. A username reversal likewise needs a new separately reviewed correction and audit, never deletion of the original receipt.

## Security review and limits

Verified locally:

- Distinct Ed25519 protocol/key domain; exact candidate, owner, deployment and service binding; action-specific confirmations and expiry; separate approvals; no release-proof interoperability.
- No public routes or changes to game authentication, CSRF, Origin, logout, startup, release workflow, backup/restore code or database connection configuration.
- Read-only reviews cannot settle income or write tutorial/session state. Wrong target, stale names/content/time, disabled accounts, duplicates and unavailable metadata stop safely.
- Atomic single-field changes and reversible hide; append-only audit; concurrent replay protection; induced audit failure rolls back the target and social audit together.
- Populated synthetic fixtures preserve 450 bots and unrelated rows, password authentication and existing sessions; isolated backup/restore retains both operator audit records and trigger protections.
- No private keys, database URLs, signed URLs, exception details or raw provider responses are logged. Review content is age encrypted; malformed worker requests emit only a fixed failure label.

Unverified until separately authorized setup/use:

- Actual new Railway service configuration, token access, private connectivity, operator key correspondence and provider log transport behavior. Synthetic tests substitute authenticated metadata; they do not claim a successful live deployment.
- The two live target identities/states, replacement availability and feed removal. No production records were inspected or mutated during development.
- Future changes to GitHub/Railway APIs, network availability and provider retention. These cause a closed failure, not a reason to weaken assertions.

The mechanism is narrow trusted-owner tooling, not a general administration system or proof of production security. The existing Phase 4.7 encrypted recovery, independent restore, signed approval and promotion gates remain unchanged. Operator artifacts never substitute for a recovery artifact, and no release is dispatched by these workflows.

## Reproducible verification

Run only against a local disposable `*_test` PostgreSQL database, with **no production credentials**:

```sh
npm ci --no-audit --no-fund
npm run typecheck
npm run build
npm run check:static
node --test tests/owner-operator.test.mjs
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55488/phase48_test npx tsx --test --test-concurrency=1 tests/owner-actions.test.ts
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55488/phase48_test npm test
node scripts/test-owner-operator.mjs
```

From repository root, validate both new workflow files with actionlint. The private-worker fixture builds the dedicated image, creates a fresh local PostgreSQL 18 container, provisions only synthetic accounts/bots, substitutes Railway metadata with a test-only harness, exercises actual age encryption/decryption, restores a synthetic dump, then removes its disposable resources. The harness is never bundled into the production worker. `KINGDOM_OPERATOR_TEST_NODE_IMAGE` is a local test-only CA image override; production uses the Dockerfile's ordinary Node base with TLS verification intact.

See [VERIFICATION.json](VERIFICATION.json) for the recorded results and limitations. No production workflow has been executed as part of this preparation.
