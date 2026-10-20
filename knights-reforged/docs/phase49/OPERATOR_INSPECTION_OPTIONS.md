# Broadcast identification without an operator shell

**HISTORICAL / INACTIVE:** owner comment [6303697572](https://github.com/catillatio/test/pull/12#issuecomment-6303697572) closes Gray moderation following his voluntary removal and drops the username correction. Do not execute or activate the proposals below. PR #13 remains separate, paused and draft; no operator infrastructure belongs in Phase 4.9.

**Scope update:** only Gray’s exact reported broadcast remains in scope. The owner reports Development Knight already removed through the UI; do not touch it again. The earlier two-message proposal below is historical investigation, not current moderation authorization. [Current single-record procedure](BROADCAST_REVIEW.md) supersedes all two-record cleanup instructions. No operator workflow has been implemented.

## Confirmed read-only investigation, 2026-10-20

The owner does not currently have an authenticated game-service operator shell. No production SQL or Railway operation was performed during this investigation. No broadcast record is claimed identified, hidden or removed.

GitHub currently registers five workflows: Kingdom Come checks, Owner approved Railway release, Railway authorization diagnostic, Protected offline release checks, and Release configuration diagnostic. **None is an existing broadcast inspection or moderation workflow.** The production environment has one required reviewer and permits deployments only from `release/production`. These settings were inspected, not changed. The integration cannot list production environment secret metadata (HTTP 403), so current secret presence/readiness is unverified here; earlier successful release runs do not grant this workspace access to those secrets.

Source evidence:

- `.github/workflows/railway-authorization-diagnostic.yml` uses the protected production environment and existing scoped `RAILWAY_TOKEN`, but `diagnose-railway.mjs` issues only fixed Railway project/environment/service metadata queries. It neither connects to PostgreSQL nor lists application records.
- `deployment/release/run.mjs` accepts only `prepare` and `promote`. `protocol.mjs` accepts worker modes only `prepare` and `verify`; arbitrary commands or SQL are not permitted.
- `worker.mjs` `verify` returns aggregate schema/account/bot status, not message records. `prepare` also performs backup/restore verification; dispatching it just to inspect messages would add unrelated operations and still not return the desired records.
- `deployment/moderate.mjs broadcasts` and `review-broadcasts` already perform the desired SELECT-only inspection, but require a trusted authenticated private-alpha operator execution context that is not presently available.
- The worker image has no HTTP/SSH operator endpoint and its start command is a fixed release verifier. The existing release protocol must not be relaxed or fed an arbitrary command to make moderation possible.

**Therefore there is no existing strict read-only operator workflow to run with a set of new inputs.** Do not dispatch a release, change a game pre-deploy command/start command, apply service variables, or deploy the game to obtain an inspection shell. Do not revive unattended SSH with unverified host keys or expose PostgreSQL publicly. `railway run` is not a private remote SQL shell; injecting private database variables locally does not make the private network reachable.

## Existing signed-in feed: useful, but not strict database read-only

There is an existing authenticated application route, **`GET /api/v1/feed?feed=broadcasts`**, in `src/app.ts`; it is not a new administrative endpoint. `src/feeds.ts` returns visible entries with:

```text
entry.id
entry.kind              (must be broadcast)
entry.createdAt
entry.data.authorId
entry.data.authorName
entry.data.body
```

It requires the player's normal session. It does not modify broadcast records or expose database credentials. The usual rendering contains the same public message data, immutable article IDs and profile links.

However, the route first calls `getState()`: normal income/recovery/bounty settlement may run; authentication can also update the session's last-seen time. **It is not an all-database-read-only administrative inspection.** No request was made against production under the current restriction.

If the owner separately chooses ordinary signed-in game viewing, Android instructions are:

1. Open the existing game domain and sign in normally. Never share cookies, passwords or session headers.
2. In that same browser, change only the path to `/api/v1/feed?feed=broadcasts`.
3. Find the two intended `broadcast` entries. Review the six fields above and share only those public records. If names differ or multiple messages are candidates, report the ambiguity rather than selecting automatically.
4. If necessary, open `/api/v1/feed?feed=broadcasts&after=ENCODED_NEXT_CURSOR`, using the returned `nextCursor` URL-encoded as one query value. Do not repeatedly load the same page or call a mutation endpoint.
5. Stop after identification. Ordinary Report/Remove controls are **not** substitutes for the separately approved, reversible operator hide of the exact two records.

This option needs no new credentials or production configuration, but the owner must accept normal game-read side effects. It cannot be represented as the strict read-only operator job requested.

## Smallest strict operator-only proposal — not implemented or authorized to execute

Prepare a **separate manually triggered broadcast-inspection workflow/job**, reusing the existing protected `production` approval, allowed release branch, exact-commit checks, scoped Railway token and private network. Keep the production release workflow/controller/proof protocol and all recovery/promotion checks unchanged.

1. One allowlisted operation: `inspect-broadcasts`; no arbitrary SQL, shell command, account mutation, hide, seed, migrate, release or promotion input. First output is a bounded page of visible broadcasts, not automatic name-based selection. A subsequent exact-one-ID review must validate the remaining Gray record, still without hiding anything. The old two-ID helper is not applicable to this authorization.
2. Execute inside a short-lived private operator worker. Reuse the existing verification worker service only if a separate approved implementation guarantees serialization with release jobs, exact project/environment/service/deployment identity, no recurring execution, and a separate entrypoint/protocol. Otherwise a separate isolated operator service requires its own explicit setup approval. Neither option should replace or restart the game service.
3. Source credentials stay inside Railway's private worker environment. No database URL or password is downloaded to GitHub, logged or supplied in user inputs. Existing project-scoped Railway authentication establishes the exact target; no broadly scoped personal token or public PostgreSQL access.
4. Execute only a fixed bounded SELECT in an explicit `REPEATABLE READ READ ONLY` transaction, with timeouts and rollback. Do not call `getState()`, the game server, migrations, initialization or provisioning. Test that write attempts fail in this transaction. Read only message ID, immutable author ID/displayed name, full message, status and creation time; no passwords, sessions, wallets or Vaults.
5. Bind the job/report to a unique expiring request, exact reviewed code SHA, project, environment, service and independently verified worker deployment ID. Use a **distinct operator protocol and artifact namespace**. An operator report must be rejected by every release backup/recovery/approval validator and cannot satisfy promotion requirements.
6. Use the existing owner public age recipient for an encrypted review artifact if owner-only output is required. Keep private decryption keys offline. Logs show fixed status categories only; never echo provider responses, connection strings, presigned URLs or untrusted message bodies into workflow logs. Preserve artifact checksum/provenance and authenticated retrieval using the existing capability-restricted transport pattern.
7. Require synthetic tests for exact scope, expiry, bounded queries, PostgreSQL read-only enforcement, hostile message text, artifact sanitization and operator/release protocol isolation. Validate Actions YAML. No production execution until the separate code and exact operator operation receive owner approval.

**Important limitation:** starting a new private worker job necessarily involves a worker deployment/control-plane operation and may stage a short-lived request in worker variables. It is not “zero production configuration operations,” even though its database transaction is read-only. A new workflow also changes release-adjacent infrastructure. These changes are **not** authorized by this investigation and have not been implemented. If absolutely no worker/service/configuration operation is allowed, strict live inspection remains blocked until trusted read-only operator access is provided. An existing verified backup can be inspected offline, but cannot prove the current live moderation state.

For the current task, publish only the verified Gray record. The owner already authorizes hiding that exact record once conclusively identified. Use the existing single-record reversible audited operator mechanism, followed by verification in both All and Broadcasts and preservation of unrelated activity. Development Knight is excluded. Execution through any newly introduced operator job still requires its separate approval. See [BROADCAST_REVIEW.md](BROADCAST_REVIEW.md). No new inspection workflow should also perform the cleanup implicitly.
