# Recovery retention: execution delivery

This is the operational guide for the GitHub-hosted coordinator replacing the
unavailable organization runner group. **Nothing in this change provisions,
deploys, enables or retires production resources.** Installation, credential
configuration, exact adoption and each deletion remain separate owner decisions.
No commands belong on the owner's Windows PC. The owner uses GitHub/Railway
web dashboards; the explicitly labelled Console commands run inside Railway.

The installed executor/authorizer, journal, keys, scope, restricted credentials
and handoff validation are complete. For the new, separately approved future-copy
privileged step, use [Future verified recovery-copy adoption](FUTURE_ADOPTION.md).
Its explicit `adopt` operation is distinct from the existing read-only
`adoption-review`; it keeps retirement execution disabled and reuses this delivery
architecture without repeating installation.

## Delivered path and trust boundaries

1. The existing protected `production` owner gate precedes job `retire`, which
   holds the same `kingdom-come-production` mutex as the protected release.
   Only `release/production`, this repository and attempt 1 are accepted.
2. The coordinator uploads **fixed allowlisted, exact-commit bundles** using the
   pinned Railway CLI 5.70.0. No input selects a command, image, host or file path.
   Authenticated GraphQL independently verifies each returned deployment ID.
3. Both private Railway workers boot unarmed. Their source/file digest, real
   project/environment/service/deployment identity and exact GitHub job must
   match before they report ready. The coordinator checks both identities before
   allowing private preparation. Neither service is a GitHub runner or server.
4. In the authorizer's private Railway Console, the owner prepares a fresh state
   attestation and explicitly chooses one actual eligible OID. `prepare.mjs`
   performs read-only checks, selects that one row and privately uploads the
   request. It cannot sign, install a permit, adopt or DROP a database.
5. The coordinator freezes the input digest and signs deployment-specific arms
   with a new **ephemeral delivery key** kept only in coordinator memory. This is
   separate from the persistent retirement key. A signer/handoff writer cannot
   replace the frozen input or arm another deployment.
6. The owner compares the Console digest with the coordinator's
   `RETENTION_REVIEW_COMMENT` and approves `retention-signing` with that exact
   comment. The isolated signing job has no Railway token or database credential.
   It verifies the arm and owner review, then calls the existing Ed25519 signer.
7. The separate authorizer verifies the same owner review, frozen input,
   signature, identity, live job and current eligibility before installing the
   existing append-only permit. Runtime cannot issue that permit.
8. The executor verifies the review/arm/signature/permit, locks the same maintenance
   database, journals to durable storage, and invokes the existing cleanup CLI.
   The final live coordinator check now follows the last external evidence read,
   closing the cancellation gap found by the delivery rehearsal.
9. Completion requires private receipts AND independently verified stopped/exited
   instances of the exact deployments. Lost acknowledgements are failures, not
   permission to repeat an upload, sign, permit, or DROP.

The initial retirement delivery is deliberately limited to **one exact target**.
The existing minimum two-newest/24-hour/emergency/current/pending/pinned/unknown
protections are unchanged. No `DROP ... FORCE` or session termination is added.
Registration, installed SQL, game migration head and encrypted recovery are unchanged.

The owner review token hashes only the strictly validated, non-credential
retirement plan/state. It contains no URL grants, passwords, tokens or signed
proofs. Those values never enter public logs, summaries, dispatch inputs or
Actions artifacts. The input itself stays private.

## Required resources (not created)

| Resource | Required settings |
| --- | --- |
| Railway `KingdomCopyRetention` | New empty service in the existing production environment; one replica in the recovery DB region; restart NEVER; no GitHub/image source or repo triggers; no public domain/TCP proxy; no cron, healthcheck, pre-deploy/build/start override; root directory unset; Dockerfile `Dockerfile`/default. |
| Railway `KingdomCopyAuthorizer` | Same private/stopped service settings, distinct service ID, **no volume**. No runtime, administrator or signing credential. |
| `retention-private-journals` | New dedicated volume mounted only on `KingdomCopyRetention` at `/run/kingdom-retention`. Never attach either PostgreSQL volume. Keep the volume after jobs stop. |
| Private handoff bucket | New dedicated Railway bucket, never the recovery ciphertext bucket. Full bucket credentials are held only by the two protected GitHub environments. Workers receive exact per-object, 15-minute HTTPS grants, not bucket keys. |
| GitHub `retention-execution` | Protected branch restriction `release/production`; coordinator credentials below. Existing `production` owner approval remains mandatory before it starts. |
| GitHub `retention-signing` | Protected branch restriction; required reviewer `catillatio`; retain the real approval review rather than admin bypass. Allow the owner to review their own dispatch if the owner is the sole reviewer. Never approve this environment before private preparation and digest comparison. |

Railway buckets are private authenticated object storage reached over HTTPS,
not private-network endpoints. The coordinator probes actual conditional-write
rejection before launching any operational worker. No public command endpoint,
SSH key, public PostgreSQL proxy or owner-PC installation is needed.

The payload is still a one-shot image. The hosted coordinator now provides the
previously missing launch, independent identity check, arm, completion and exact-ID
stop path. A GUI redeploy of an old invocation is not a supported retry.

## Configuration inventory

### Validate the completed handoff configuration with execution OFF

The owner has completed the two bucket secrets and four store variables in both
`retention-execution` and `retention-signing`. Do not request or rotate these
credentials again. Configuration presence does not establish that conditional
writes and authenticated reads work with the actual S3-compatible store.

Use the protected **`validate-handoff`** operation after this workflow change is
reviewed, merged into `release/production` and passes post-merge CI. This closes
the previous gap where the only store probe was inside the enabled coordinator.
It requires `KINGDOM_RETENTION_EXECUTION_APPROVED=0`, uses the existing production
approval and release mutex, and tests each protected environment separately. The
`retention-signing` reviewer gate still applies. It cannot enter the coordinator,
launch a worker, issue a signature/permit, adopt a copy or delete a database.

1. GitHub **Actions → Reviewed recovery copy retirement → Run workflow**.
2. Select `release/production`, operation `validate-handoff`, and a fresh request
   UUID. Approve the existing production gate and, when requested, the existing
   `retention-signing` environment gate. Do not change any enabled flags.
3. Require `RETENTION_HANDOFF: PASS` for **both** matrix jobs. A failed or skipped
   job is not acceptance. Do not rerun a failed attempt; preserve its fixed
   `RETENTION_HANDOFF_FAILURE` category and investigate first.

Each job receives only its environment's six store entries, with contents-read
permission. No Railway token, database URL, scope, persistent signing key or
backup-bucket credential is injected. The exact installed bucket's connection
metadata is pinned: `https://t3.storageapi.dev`, S3 region `auto`, actual bucket
`kingdom-retention-handoff-g6-jcd`, virtual-host addressing (`false` path style).
An incorrect bucket, endpoint, region or addressing mode fails before a request.

The check creates one small, non-sensitive JSON probe at a unique request-scoped
path, using the existing 15-minute signed grant and `If-None-Match: *`. It
requires a second conditional PUT to return HTTP 412, then verifies exact GET
readback. All requests are single-attempt and bounded; redirects are rejected.
It does not list, overwrite or delete existing objects. The two probe objects
remain as small readiness records; no bucket cleanup is authorized. Only PASS
or a fixed failure category is logged, never signed URLs or provider bodies.

This acceptance proves handoff connectivity and conditional-write behavior from
both protected environments. It does not grant execution, adoption, scheduling
or retirement authority. Both Railway workers stay disabled and stopped. The
next operational review still needs its explicit bounded authorization; final
retirement additionally requires the separate exact-target signed approval.

### Validate the saved installation token before installation

Use the existing workflow's **`inspect-installation`** operation. This is a
separate read-only job, using the actual `RAILWAY_TOKEN` injected from
`retention-execution`, not the Railway connector's separately authenticated
identity or the `production` environment's token. It requires neither installation
authorization nor handoff, SQL or signing credentials. Keep the repository
`KINGDOM_RETENTION_EXECUTION_APPROVED=0`; no flag needs to be enabled to inspect.

After this workflow change is reviewed, separately approved for merge, and passes
post-merge CI:

1. GitHub **Actions → Reviewed recovery copy retirement → Run workflow**.
2. Select **`release/production`**, operation **`inspect-installation`**, and a
   fresh request UUID. Do not rerun an earlier attempt or select an installation
   operation. Approve the existing protected **`production`** environment gate.
3. Read only the fixed `RETENTION_TOKEN_PROJECT`, `RETENTION_TOKEN_ENVIRONMENT`,
   `RETENTION_INSTALLATION_METADATA` and `RETENTION_INSTALLATION_INSPECTION` lines.
   A complete PASS requires MATCH for both token identities and valid nine-field
   target metadata. Failure reports only a fixed category; never share the token,
   provider body or secret values. On authentication/identity failure, stop. Do
   not install, rotate credentials automatically, or change the expected target
   to make a mismatched token pass.

The one authenticated query is `projectToken { projectId environmentId }`, using
Railway's project-token header and a fixed HTTPS endpoint. Expected identities
are pinned to project `41a664f1-06bb-492e-90ef-cfd9635fc67f` and environment
`8ced8aef-352e-4ea9-931d-8963ff352c1c`. The job compares these privately with
the environment variables, injected target metadata and server response. It does
not query variables or databases, commit the pending patch, invoke Railway CLI,
upload a worker, or grant installation/retirement authority. Output contains no
credentials, response bodies, credential lengths, fragments or credential hashes.
Transport, authorization, malformed responses and mismatched scopes fail closed;
there is one request and no retry.

An inspection PASS proves the injected secret's project/environment scope at
that moment, not mutation permissions, completion of resource installation, or
database provenance. Both actual installation operations independently recheck
the token before provider preflight, variable writes or uploads. Existing live
GitHub owner/job checks, resource preflight, disabled flags, exact-ID completion,
separate installation approval and production mutex remain mandatory.

As of preparation, the saved secret and metadata entries are owner-reported;
their actual injected values remain **UNVERIFIED until this protected run**.
Read-only Railway connector inspection still found patch
`4dccbea1-aef9-4aeb-b09a-587d0e37cadd` STAGED with exactly 15 changes, unchanged
since `2026-10-28T23:44:37.665Z`. These touch only the two new disabled workers,
dedicated journal volume and private handoff bucket; no existing service,
PostgreSQL volume, shared variable or networking toggle changes are staged.
This read does not authenticate the saved GitHub secret.

After successful inspection, the next phase remains an **owner-approved bounded
installation**, not automatic continuation: reconcile that exact patch afresh,
obtain explicit authorization for its deployment-free configuration commit, then
separately authorize `initialize-journal` and `install-disabled` as described
below. Current installation preflight correctly refuses the nonempty staged
patch and resources that exist only as staged creations. Do not use ordinary
Railway Deploy as a shortcut. Keep all recovery copies, emergency OIDs 106971
and 129180, adoption/retirement protections and signing isolation unchanged.

Repository variables (visible to the initial gate):

- `KINGDOM_RETENTION_INSTALLATION_APPROVED=0` initially. Later approve only the two
  installation operations with this flag; it cannot authorize `retire`.
- `KINGDOM_RETENTION_EXECUTION_APPROVED=0` or unset until all execution boundaries
  are validated. No schedule is included.

In GitHub **retention-execution**:

- Existing project-scoped `RAILWAY_TOKEN` secret, copied into this protected
  environment without broadening it to an account/workspace token.
- Variables `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`, using existing values.
- Secret `KINGDOM_RETENTION_INSTALL_TARGET`: JSON with exactly `projectId`,
  `environmentId`, `operatorServiceId`, `authorizerServiceId`, `journalVolumeId`,
  `gameServiceId`, `productionServiceId`, `verificationServiceId`,
  `verificationWorkerServiceId`. Use real installed resource IDs; do not invent
  them. No cluster or key evidence is manufactured for installation.
- Secret `KINGDOM_RETENTION_SCOPE`: existing reviewed retention scope, extended
  with `delivery: {protocol: "kingdom-retention-delivery-v1", authorizerServiceId,
  journalVolumeId}`. Preserve actual cluster digests, private hosts and `Railway`
  (capital R) for both maintenance database fields.
- Variables `KINGDOM_RETENTION_STORE_ENDPOINT`, `KINGDOM_RETENTION_STORE_REGION`,
  `KINGDOM_RETENTION_STORE_BUCKET` (actual S3 bucket name),
  `KINGDOM_RETENTION_STORE_PATH_STYLE` (`true` or `false` from the Credentials tab).
- Secrets `KINGDOM_RETENTION_STORE_ACCESS_KEY_ID`,
  `KINGDOM_RETENTION_STORE_SECRET_ACCESS_KEY` for the new handoff bucket only.

In GitHub **retention-signing**:

- The identical scope secret, store variables and store secrets above.
- Secret `KINGDOM_RETENTION_SIGNING_KEY`: dedicated Ed25519 private PEM.
- Variable `KINGDOM_RETENTION_VERIFY_KEY`: matching public PEM. Its SPKI SHA-256
  must equal scope `approvalKeyDigest`, distinct from the release key digest.
- **No** Railway token, SQL URL, bootstrap credential or release signing key.

On both new Railway services:

- `NODE_ENV=production`, `KINGDOM_RETENTION_ENABLED=0` initially.
- After separately approved credential setup: public `KINGDOM_RETENTION_VERIFY_KEY`,
  `KINGDOM_RETENTION_PG_SERVICE_ID` = recovery PostgreSQL service ID,
  `KINGDOM_RETENTION_WORKER_ADMIN_DATABASE=Railway`.
- Executor only: `KINGDOM_RETENTION_DATABASE_URL`, username
  `kc_retention_runtime`, exact private copy host and maintenance database.
- Authorizer only: `KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL`, username
  `kc_retention_authorizer`, same private host/database.
- Railway supplies actual `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`,
  `RAILWAY_SERVICE_ID`, `RAILWAY_DEPLOYMENT_ID`; never impersonate another service.
- Railway supplies executor volume mount/name. The name must not suggest either
  PostgreSQL volume. No generic `DATABASE_URL`, `PG*` overrides, bootstrap URL,
  signing key, Railway token or bucket credentials on either worker.

The coordinator alone writes the short-lived `KINGDOM_RETENTION_JOB` frame using
`variableCollectionUpsert(skipDeploys:true)`, then uploads the exact bundle once.
It does not commit an environment staged patch. Unrelated pending changes,
public networking, active old workers and unsafe service settings block execution.
An exclusive owner edit window is required: the provider has no CAS combining
that read, frame update and source upload. Platform/project administrators remain
trusted. No weaker isolation claim is made.

## Confirmed Dockerfile blocker and reset state

Run [40804816542](https://github.com/catillatio/test/actions/runs/40804816542)
passed preflight and uploaded executor deployment
`2a6a86b8-25a6-453d-9fd4-52601b0b1a31`. Railway rejected the optional
`RUN --mount=type=secret,id=proxy_ca` at Dockerfile line 5; its parser supports
only cache mounts. Source ingestion succeeded, but no runtime started. No
initializer filesystem writes occurred. The journal volume was not directly
inspected; this is not independent filesystem-integrity verification.

Both worker Dockerfiles now use ordinary
`RUN npm ci --ignore-scripts --omit=dev --no-audit --no-fund`. Lockfile enforcement,
normal TLS verification, non-root runtime, role-specific files/commands and
disabled defaults remain unchanged. Existing CI previously supplied no
`proxy_ca` build secret. No game Dockerfile or build configuration changes.

**Owner-observed dashboard evidence:** after that failure, the owner confirmed
`KINGDOM_RETENTION_ENABLED=0`, `RAILWAY_RUN_UID=1000`, and empty/unset
`KINGDOM_RETENTION_INITIALIZE_JOURNAL`, `KINGDOM_RETENTION_CONSOLE_SETUP` and
`KINGDOM_RETENTION_JOB`. All five checks passed. The connected OAuth API exposes
names only; these values were not independently read through it. Do not ask the
owner to repeat the completed checks.

Standard Docker CI builds both images and checks their disabled, network-isolated
runtime, UID, role and private manifest permissions. Successful Docker CI does
not establish a successful Railway build or deployment. At that point, no journal
initialization success or installed workers had been established. Keep execution approval at
`0`, retention disabled and all recovery databases protected.

Only after review, separately approved merge and green post-merge CI may a fresh
protected `initialize-journal` attempt be considered. Never reuse failed request
`b2720373-34ae-4ac4-8e11-17f00129ab64` or rerun the failed attempt. This correction
removes the confirmed parser blocker; all remaining installation checks still
apply. This change does not dispatch initialization or `install-disabled`.

## Initialized journal and partial disabled installation

Journal initialization subsequently succeeded in protected run
[40809415014](https://github.com/catillatio/test/actions/runs/40809415014), commit
`0ee6b29f5862a8314dcab63766a9f5118b490184`, request
`21c19db0-7263-46cc-9820-8fd27ca64558`. **Do not initialize it again.**

Disabled installation run
[40810334002](https://github.com/catillatio/test/actions/runs/40810334002) failed
at the coordinator. Its exact executor deployment
`fad35532-3b7e-49e6-8f8b-7316b2b31ba9` subsequently started successfully and logged
`RETENTION_DELIVERY_WORKER: DISABLED` and
`RETENTION_INSTALLATION_CONSOLE: READY — disabled; no database access`.
Those paths verified the existing marker, permissions and write probe as non-root;
initialization was not repeated. The authorizer was never deployed. Independent
Railway inspection after the bounded session reports the same deployment as
`SUCCESS`, zero running replicas and zero crashed replicas; the provider retains
the successful deployment record after the one-shot process exits. There is no
pending work. Existing game/database deployments are unchanged. No adoption,
database retirement or retention activation occurred. The original exception was
discarded; its exact first rejected assertion remains unproven.

Two lifecycle defects were reproduced independently: startup rejected a valid
queued/building deployment with no instances, and cleanup interpreted its empty
instance list as proof it could never start. The corrected handling is bounded:

- Startup polls the **same exact deployment**, project, environment and service
  for at most ten minutes (or the caller's shorter deadline). Valid pre-start
  states may have `deploymentStopped=true` and no instances. Readiness requires
  `SUCCESS`, `deploymentStopped=false` and exactly one `RUNNING` instance. Failed,
  crashed, skipped, removed, removing or already-exited workers cannot be ready.
- Cleanup has an independent thirty-second budget, including its API calls. A
  queued/building or otherwise ambiguous empty-instance deployment is cancelled
  once by exact ID, then observed until permanent terminal-and-stopped evidence
  exists. A successful completed one-shot requires an actual `EXITED` instance;
  `SUCCESS` with an empty list is insufficient. Already-removing deployments are
  observed without another mutation. Identity/instance substitutions, unknown
  states, ambiguous acknowledgments, cancellation or timeout fail closed. No
  latest-deployment selection, service-wide stop or automatic mutation retry is
  added. Cleanup is attempted for every acknowledged deployment even if one
  exact-ID cleanup fails.
- Primary startup cancellation does not cancel the independent cleanup budget.
  Polls and requests honor cancellation/deadlines; a lost mutation acknowledgment
  never authorizes another mutation or a success claim.

Failures emit only fixed `RETENTION_DELIVERY_FAILURE` categories. `STARTUP_*`
and `CLEANUP_*` distinguish configuration, API, identity, state, deadline and
cancellation failures; startup also distinguishes terminal/exited workers, and
cleanup distinguishes unconfirmed acknowledgments. Installation stages use fixed
`INSTALLATION_*` categories. The primary category is logged before cleanup, so a
later cleanup failure cannot erase it. Unknown exceptions become `UNCLASSIFIED`.
No provider error, response body, credential, identifier, dynamic assertion value
or exception cause is printed. These diagnostics do not authorize a retry.

Next: review the lifecycle correction, merge only after exact-head CI passes,
and verify green post-merge CI. Independently reconcile that neither worker is
running and that pending changes remain empty immediately before a separately
protected, fresh-request `install-disabled` dispatch. Never rerun attempt 1 or
reuse failed request `8162d089-40ff-4346-8f3b-5de8e3ba02ab`. Keep
`KINGDOM_RETENTION_EXECUTION_APPROVED=0`, both workers disabled and all recovery
copies (including emergency OIDs 106971 and 129180) protected.

## Dashboard-only installation sequence

These describe the complete setup sequence. Steps 1–3 are already complete for
the current installation; resume at step 4 only after the lifecycle correction
and reconciliation above. Do not repeat journal initialization.

1. Review exact-head CI and separately approve merge. Approve creation of only
   the two empty private services, dedicated journal volume and private handoff
   bucket. In Railway use New/Empty Service, configure the settings above, and
   commit only these approved resources/settings. Do not connect a GitHub source.
2. In GitHub Settings → Environments, configure `retention-execution` and its
   initial token/project/installation-target settings. Keep execution OFF.
   Authorize installation by setting only the installation repository flag to 1.
3. In Actions → Reviewed recovery copy retirement, select `release/production`,
   `operation=initialize-journal`, and a fresh request UUID. Approve the existing
   production gate. This fixed operation requires BOTH services to have enabled=0
   and no SQL/signing credentials; it temporarily runs only the executor's volume
   initializer as root. It touches only the new volume, creates a scoped marker,
   fsyncs it, assigns UID/GID 1000 and private permissions, then exits.
   The controller restores UID 1000 and clears initialization flags without a
   redeploy. If acknowledgement/reset fails, inspect before retrying; never
   automatically rerun initialization on a nonempty volume.
4. Dispatch `operation=install-disabled` under the same gate. Both exact images
   start as non-root, disabled, credential-free, bounded 15-minute Console sessions.
   The executor verifies the actual mount and initialization marker. Inspect the
   two fixed `DISABLED` / `RETENTION_INSTALLATION_CONSOLE: READY` log messages.
   These sessions have no database access or public listener.
5. Prepare the dedicated retention key in an approved private cloud boundary.
   The disabled authorizer's Console already has Node. If used for key creation,
   do it **before** configuring any SQL credential. Store private PEM only in the
   protected GitHub signing secret, erase temporary key files, and stop/recreate
   that setup container before configuring its restricted database credential.
   Never paste the key into chat, workflow inputs, artifacts or deploy logs.
6. Approve restricted credential configuration separately. Reuse existing
   `kc_retention_runtime` and `kc_retention_authorizer` roles; do not reinstall
   roles/catalogs or change grants. In the existing maintenance Console, owner
   password setup may use psql's hidden-input `\password <exact-role>` command.
   Enter URLs privately into their respective new service only. Keep enabled=0.
   Clear `KINGDOM_RETENTION_CONSOLE_SETUP` and all initialization flags before
   applying credentials; keep `RAILWAY_RUN_UID=1000` or remove that override.
7. Set the identical reviewed scope and public key in the required boundaries;
   configure handoff credentials only in GitHub. Confirm role/schema/host checks,
   source bindings, private networking, journal persistence and stop behavior.
   Reuse prior catalog validation; do not reinstall or repeat historical surveys.
8. Only after separate approval, set the two worker enabled flags and the GitHub
   execution flag to 1. This permits reviewed jobs, **not an unsigned deletion**.
   Leave installation authorization OFF after setup. There is no schedule.

GitHub and Railway setup deployments require explicit owner authorization. No
step starts a recovery rehearsal, changes the game service or grants native
ownership of a production recovery database.

## First adoption and exact retirement

The accepted run-62 copy remains observed-only. Its original manifest/identity is
available, but exact live identity and current/rollback/pending/pin review must be
fresh. The existing privileged `register.mjs` tool still needs a separately
approved isolated cloud operator session. Never put its bootstrap credential on
either new worker. It uses the real original manifest hash/OID, live owner-gated
job and atomic ownership/provenance transaction. No pre-transfer or backdate.

For a separately approved adoption, dispatch `adoption-review`; while its `retire`
job holds the release mutex, perform the reviewed privileged adoption, then use
the authorizer Console's `prepare.mjs --state <private-file> --manifest
<authenticated-original-file> --owner-reviewed`. This only publishes inputs for
the executor's read-only adoption verification. The new 24-hour hold and newest/
current protections still prevent retirement.

For a genuinely obsolete future copy, wait until at least two newer present
adopted verified anchors and the minimum hold exist. Use ordinary future recoveries;
do not manufacture copies to fill slots. Verify references/holds and both emergency
OIDs. Dispatch `retire` with a new request UUID and approve the production gate.
After `PRIVATE_PREPARATION_READY`, use **Railway's authorizer Console only**:

```sh
node deployment/release/retention/delivery/prepare.mjs \
  --state /tmp/owner-reviewed-state.json --oid EXACT_REVIEWED_OID --owner-reviewed
```

The private state file contains the existing protocol, a genuinely fresh
`observedAt`, `releaseQuiescent`, actual `currentRecoveryCopy` and `activeSha`, and
verified `pinnedCopies`, `pendingCopies`, `closedJobIds`. Scope/job context is
bound by the frame; it does not invent these operational facts. Unknown arrays
must not be filled with guesses or empty defaults. No password belongs in this file.

Compare its digest to `RETENTION_REVIEW_COMMENT`. Approve `retention-signing` with
that **exact comment**. Signer, permit issuer AND executor require GitHub's actual
owner review record for this request/digest; admin bypass or another user's
approval does not satisfy it. Preparing input or uploading a signature alone
cannot authorize another target. If the five-minute state/four-minute signature
window expires, stop and prepare a fresh request; do not extend/backdate evidence.

Success requires private postchecks plus exact exited instances. Compare physical
free/used space on the actual PostgreSQL volume separately; logical removed bytes
are not filesystem relief. All 23 historical copies and OIDs 106971/129180 remain
protected. No historical deletion eligibility is established here.

## Cancellation, interruption and lost acknowledgement

The coordinator stops/verifies only exact known deployments on exit; it never
uses `railway down`/latest. Workers independently recheck the live GitHub job,
owner gate and deadline every five seconds. The final external evidence read is
followed by another coordination check before deletion/adoption authority returns.
Cancellation closes the child/session; PostgreSQL's shared lock protects overlap
with recovery. An already executing SQL statement can finish before shutdown;
never infer rollback or absence from a cancelled GitHub job.

The original fsynced before-journal and completed result remain on the dedicated
volume across container removal. A lost acknowledgement never launches another
job automatically. Reconcile original audit/journal/identity first. A new
`reconcile` operation takes the real original before-journal and prior approval
UUID through private preparation, uses absence-only reconciliation and credits
no new reclaimed bytes. It does not issue a new signature or DROP anything.
Do not reconstruct a missing original baseline. Missing/ambiguous evidence means
HOLD. Keep journals and the private bucket; do not delete either as "cleanup".

Native database ownership still allows a compromised runtime to bypass the CLI;
PostgreSQL has no DROP-only privilege. Superusers/platform admins remain trusted.
Conditional writes do not make the private bucket object-locked or admin-proof.
These are existing explicit authority limits, not relaxed cryptographic checks.

## Verification and expected additional cost

`test-retention-delivery.mjs` exercises the actual controller, pinned provider API/
CLI contract, SDK-generated HTTPS grants, two real role-separated containers,
separate signer and PostgreSQL 18. It verifies a real one-copy retirement,
wrong GitHub/service identity, cancellation, missing/expired signatures, lost
acknowledgement, durable baseline survival and non-destructive reconciliation.
Six synthetic copies contain 900 bots and two humans; untouched business rows
are compared exactly. Privileged age seeding is test-only, with immutable guards
restored. The GitHub/Railway control APIs are fixtures: this is not a claim that a
production/disposable Railway service was deployed or a protected workflow run.
A first owner-approved platform setup check is still required.

The sanitized [local verification record](EXECUTION_DELIVERY_TEST_RESULT.json)
records eight delivery scenarios, 121 focused tests, 33 PostgreSQL integration
tests, two built-executor checks, successful type/build checks and 99 static
checks (77 render fixtures). The draft PR links the final exact-head CI; local
results are not a substitute for that run.

Based on Railway's published container rates, two workers averaging 0.25 GB RAM
and 0.25 vCPU each for 20 minutes cost approximately **$0.00694 per operation**;
30 such operations are about **$0.21/month** compute. This is a sizing assumption,
not measured production billing. A full 5 GB journal volume would add $0.75/month
($0.15/GB-month used); 0.1 GB of private handoff objects adds about $0.0015/month
($0.015/GB-month). Small service egress is additional. Existing plan fees/credits
are separate. No always-on signer/runner VM is required; setup sessions and jobs
are bounded. Actual usage may differ and must be checked after approved setup.

Sources: [container pricing](https://docs.railway.com/pricing/plans),
[volume behavior](https://docs.railway.com/volumes/reference),
[private bucket pricing/limits](https://docs.railway.com/storage-buckets),
[GitHub review-history API](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run).
