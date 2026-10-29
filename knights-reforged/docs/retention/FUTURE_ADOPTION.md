# Future verified recovery-copy adoption

This implements the missing privileged step using the existing `adoptObservedCopy`
transaction. It does not install resources, dispatch a workflow, connect production
administrator credentials, adopt a database or authorize retirement. The existing
`adoption-review` operation remains a read-only post-adoption check; the new
`adopt` operation performs one explicitly approved future-copy adoption.

## Preserved installation and production evidence

Reuse the installed executor, authorizer, journal, restricted logins, matching
Ed25519 keys, identical scope secrets and handoff bucket. Handoff acceptance is
complete: run **40928860386**, commit
`41952b93f747dfc42d94178fe82b6aeb77ba8602`, both `RETENTION_HANDOFF: PASS`,
execution disabled. Do not repeat these installation or connectivity operations.

Run **40758163475 remains protected** because its external hold is unknown. The
new input validator explicitly rejects it. The 23 historical copies and other
uncertain/observed-only copies are not adopted by this change. No new original
OID or historical baseline is inferred. No immediate historical space saving is
claimed. Future adoption records use a genuine baseline captured before mutation.

## Smallest remaining setup, after review and merge

1. Review the PR, merge only with separate owner authorization, and require green
   exact-head/post-merge CI. Keep repository
   `KINGDOM_RETENTION_EXECUTION_APPROVED=0`.
2. Separately authorize one empty, credential-free Railway service named
   **KingdomCopyAdopter**, in the existing private recovery project/environment.
   Do not create another project, volume, public domain, TCP proxy or database.
   Set `iad: 1` in `deploy.multiRegionConfig`, restart `NEVER`, and no source,
   repository trigger, cron, build/start/pre-deploy override or healthcheck. Root
   directory must be unset or `/`. Do not deploy it manually.
3. Configure exactly these three user variables, without deployment:

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `KINGDOM_RETENTION_ADOPTER_ENABLED` | `0` |
   | `RAILWAY_RUN_UID` | `1000` |

   Put the actual returned service ID in **retention-execution** as variable
   `KINGDOM_RETENTION_ADOPTER_SERVICE_ID`. No service ID is supplied or invented
   by this implementation. No scope rotation, signing-key change or password
   bootstrap is needed. Do not put administrator credentials in GitHub.
4. Leave repository `KINGDOM_RETENTION_ADOPTION_APPROVED` unset/`0` until the owner
   authorizes a bounded adoption. This separate flag cannot authorize retirement.
   The global retirement flag must remain `0` for `adopt`.

The service's authenticated Railway `Service.createdAt` is the future-copy cutoff.
Create this empty service **before the next normally needed protected recovery**.
Only an original successful protected recovery run, manifest and registrar
observation at/after that cutoff qualify. Do not manufacture recovery rehearsals
to populate the catalog. Artifact expiry or missing original evidence blocks
adoption; it is not permission to fabricate or backdate evidence.

The coordinator verifies both existing restricted services, the new distinct
service, no public networking/volume/trigger, exact disabled variables and no
pending changes before any launch. Explicit `iad: 1` is required even when
Railway returns `numReplicas: null`. All existing resource identities remain pinned.

## One owner-approved future adoption

Keep an exclusive owner edit window: do not change worker variables, sources or
network settings while this operation is running. Railway variable reads/writes
are not a transactional compare-and-swap; fresh reads and exact readbacks detect
drift but cannot eliminate a simultaneous dashboard edit between requests.

The owner must first resolve all current-recovery, rollback, pending-release,
manual-recovery and pin holds for the exact target. Unknown means protected.
Preserve two newest verified anchors and the separate retirement gate. Adoption
does not make the current recovery copy or active-release candidate eligible.

1. After explicit adoption authorization, enable only
   `KINGDOM_RETENTION_ADOPTION_APPROVED=1`, keep execution `0`, and dispatch
   **Actions → Reviewed recovery copy retirement → release/production** with
   operation **adopt** and a fresh UUID. Approve the existing **production** gate.
   Do not approve `retention-signing` yet. The coordinator uses the existing
   production mutex and rejects attempt numbers other than one.
2. Wait for `PRIVATE_PREPARATION_READY`. In the temporary **KingdomCopyAuthorizer
   Railway Console**, prepare the existing fresh private state attestation and
   the **unmodified original** `backup-manifest.json` from that successful
   protected recovery artifact. Obtain its original GitHub artifact ID. The
   following command runs inside that Console, not on an owner computer:

   ```bash
   node deployment/release/retention/delivery/prepare.mjs \
     --state /tmp/fresh-owner-state.json \
     --manifest /tmp/backup-manifest.json \
     --artifact-id ORIGINAL_GITHUB_ARTIFACT_ID \
     --owner-reviewed
   ```

   Substitute the actual artifact ID; these paths describe private files the
   owner supplies. The existing state contract requires `protocol: "kingdom-copy-retention-v1"`,
   `releaseQuiescent: true`, `observedAt`, `activeSha`,
   `currentRecoveryCopy`, `pendingCopies`, `pinnedCopies`, and `closedJobIds`.
   Scope/coordinator are bound from the authenticated running delivery frame.
   Use current evidence; never substitute empty arrays for unknown holds. The
   existing five-minute freshness deadline still applies, including approval,
   startup and mutation. Expiry fails closed rather than extending the attestation.
3. Privately compare the exact target and Console input digest with
   `ADOPTION_REVIEW_COMMENT: adoption <UUID> <digest>`. Approve the existing
   **retention-signing** gate with that exact comment, only when they match.
   This approval job receives no signing key, Railway token or SQL credential;
   it verifies the owner review and frozen coordinator-signed input. Do not
   approve the environment early or reuse a previous approval.
4. Require `RETENTION_ADOPTION_REVIEW: PASS`, `RETENTION_ADOPTER: PASS` and final
   `RETENTION_DELIVERY: ADOPTION_PASS`. Success also requires both restricted
   postchecks, exact deployment shutdown and configuration cleanup. Turn the
   adoption approval flag back to `0` after the bounded operation. Retirement
   remains disabled throughout.

The coordinator authenticates the original closed successful GitHub run/attempt,
workflow/ref/head, artifact identity, archive SHA-256 and exact raw manifest bytes.
It downloads only the existing encrypted archive into private temporary cloud
storage and deletes that local copy; it neither decrypts nor creates a backup.
The original manifest's OID/owner/cluster must match the immutable registrar row
and live PostgreSQL identity. No name-only eligibility is accepted.

## Privileged boundary and durable verification

Only after exact owner approval and a conditional, durable `adoption-intent.json`
does the coordinator attach these **native Railway reference expressions** to
the separate adopter using `variableCollectionUpsert`, `skipDeploys: true`:

| Temporary adopter variable | Existing private reference |
| --- | --- |
| `KINGDOM_RETENTION_ADOPTER_DB_HOST` | `${{KingdomReleaseCopy.RAILWAY_PRIVATE_DOMAIN}}` |
| `KINGDOM_RETENTION_ADOPTER_DB_USER` | `${{KingdomReleaseCopy.POSTGRES_USER}}` |
| `KINGDOM_RETENTION_ADOPTER_DB_PASSWORD` | `${{KingdomReleaseCopy.POSTGRES_PASSWORD}}` |
| `KINGDOM_RETENTION_ADOPTER_DB_NAME` | `${{KingdomReleaseCopy.POSTGRES_DB}}` |

These are references, not retrieved credential values. The coordinator reads them
back with Railway's supported `unrendered: true` contract. The connection URL is
constructed only in adopter memory, with percent-escaped components; private
host and database must match the existing scope. No administrator URL/password
enters GitHub, approval digests, handoff objects or existing workers. The existing
executor/authorizer/signer explicitly reject the new privileged variable names.

The exact-commit, non-root, default-OFF image has one fixed adoption entrypoint.
It has no server, signing or retirement command. An enabled instance is bounded
by the request deadline, cancellation polling and an independent 15-minute hard
exit. Fixed failure categories replace dynamic provider/credential errors.

Inside the existing guarded transaction, the adopter captures all live database
name/OID/owner/template identities, stores the private baseline durably, reads it
back, and waits for a deployment-specific signed acknowledgment of that baseline.
Both emergency OIDs must be present. Fresh owner/job/health/hold checks, catalog
definitions, restricted owner-role attributes, connection counts and every
untargeted identity are rechecked immediately before `ALTER DATABASE`. PostgreSQL
statistics snapshots are explicitly refreshed after the external acknowledgment.
The existing advisory locks, atomic ownership/catalog write, original observation
binding, immutable audit records and rollback behavior remain in force.

After the transaction, the coordinator stops the exact privileged deployment.
The existing restricted executor independently verifies the adopted row and
all untargeted tuples against the genuine pre-mutation baseline. The authorizer
performs its separate check without issuing a retirement permit. Private receipts
are bound to the frozen input, baseline, code and exact deployment IDs.

Cleanup independently verifies stopped instances and restores the adopter's exact
three-variable disabled baseline with `replace: true, skipDeploys: true`, removing
the credential references and job frame. Existing workers have only their
operation's enabled/job fields reset; their installed restricted credentials are
preserved. Competing edits block cleanup instead of being overwritten. No journal
or recovery database is deleted.

**Residual trust and failure handling:** the adopter temporarily has PostgreSQL
superuser authority, as explicitly acknowledged by the owner. Railway may retain
encrypted historical deployment configuration/reference metadata; clearing the
current configuration does not promise erasure of provider history or revoke the
unchanged database password. No automatic credential rotation is performed. A
lost upload/commit/completion/stop/reset acknowledgment is a failed operation,
not authority to retry. Do not rerun a job or GUI-redeploy an old invocation.
Preserve its request-scoped intent/baseline/results and reconcile actual catalog,
ownership, deployment and configuration state read-only before any new approval.
An already committed adoption cannot be repeated to restart its hold.

## First retirement remains a separate decision

Each adoption starts a **new server-derived minimum 24-hour hold**. Existing
two-newest verified-anchor protection remains unchanged. A first ordinary
retirement normally needs at least three adopted, present verified copies, so
one obsolete copy can be considered while two newer anchors remain protected.
Current recovery/active release, emergency OIDs, unresolved holds, pins, pending
jobs and connected/uncertain copies are still excluded even after 24 hours.

When one exact copy genuinely qualifies, use the existing fresh dry-run and
separately owner-approved Ed25519 retirement permit/workflow. Adoption approval
never enables that operation. No scheduler or unattended deletion is introduced.
Report measured logical database bytes separately from estimated filesystem
reclamation; adoption itself reclaims **zero bytes**.

## Test evidence

Unit fixtures exercise owner review, original-artifact authentication, future
cutoff/OID/hold checks, native-reference isolation, cleanup drift, lost
acknowledgments and no retry. Disposable PostgreSQL 18 tests exercise the existing
atomic transaction, both emergency OIDs, advisory locks, cancellation, ownership
rollback, new connections/role drift during approval, lost COMMIT acknowledgment,
restricted postchecks and the retention hold. The recovery CI job additionally
builds the actual non-root adopter image and runs it against isolated PG18/TLS
fixtures for successful adoption and cancellation, while preserving six populated
902-account/900-bot fixture realms. These are synthetic cloud tests, not a
production adoption or recovery rehearsal.
