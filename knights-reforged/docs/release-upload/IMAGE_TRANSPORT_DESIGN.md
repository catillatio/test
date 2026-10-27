# Protected immutable-image transport

Status: **implemented for review, disabled pending owner setup and release approval**.
The isolated private-image canary succeeded. No game image has been published,
no production setting changed, and no production recovery or deployment ran for
this implementation. Source transport remains the default.

## Authenticated canary result

Railway deployment `ecdd7e95-cf3b-4055-be0f-b1173684f829` succeeded with:

```
ghcr.io/catillatio/kingdom-come-deploy-canary@sha256:b49d4df2ca6e4959dcdaf1235d8705d1b2f012380d5a2991fce414ac2acda000
```

An independent, authenticated GitHub registry pull reconciled the raw manifest
bytes, registry digest header, configuration bytes and executed identity. The
configuration digest is `sha256:4eee41c0a59aef69fa373485c2043c85c009027f35e90a1d8024e06c852fd689`;
it is **not** the manifest digest. The runtime matched linux/amd64, UID 65532,
expected nonce/source fingerprint and 120-second maximum lifetime. Evidence:
[registry reconciliation run](https://github.com/catillatio/test/actions/runs/40584403458),
[authenticated summary](canary-evidence.json), [raw manifest](canary-manifest.json)
and [raw configuration](canary-config.json).

The per-deployment authenticated `meta.image` is the exact pinned reference.
Railway did not expose a separate typed resolved-manifest field. Registry-byte
verification and the matching executed identity corroborate that reference;
a source/configuration echo alone would be insufficient. Image deployments can
have a non-null internal `snapshotId`; this is not a CLI source upload.

Private visibility and restricted Railway pull credentials were owner-observed.
The first publisher uploaded once, then failed its package metadata permission
check; the image was not republished. The fresh read-only reconciliation succeeded.
The owner deleted `kingdom-image-canary`; a subsequent authenticated lookup of its
environment returned NOT_FOUND. Project-list deletion metadata may persist. The
private synthetic image is retained as evidence; no canary compute remains.

## Registry and immutable identities

The owner-approved game location is the **existing Private**
`ghcr.io/catillatio/kingdom-come-deploy-canary` package, preserving its original
synthetic image/tag as evidence. The owner confirmed Private and existing
`catillatio/test` Admin Actions access (which includes Write) on 2026-10-27.
This approval does not enable publication or deployment.
There is no new-package creation or public fallback. The `kingdom-come` synthetic
bootstrap became Public despite the documented default, so that creation method
is not a verified private path. See [investigation](GHCR_PRIVACY_FINDINGS.md) and
[owner procedure](IMAGE_OPERATIONS.md). No game image has been published.

`image-prepare` builds the committed Dockerfile for linux/amd64, with locked npm
inputs, an exact OCI revision label and a static, read-only image identity.
`checkBuildTree` verifies Git blob bytes, executable bits, completeness and absence
of extra/untracked/symlink inputs in every runtime/build source directory. The
actual compiled payload must match the host candidate digest. The source tree
cannot supply dependencies or temporary files inside those directories.

Publication uses only the job's ephemeral `packages:write` GITHUB_TOKEN and one
unique SHA/run/attempt tag. The tag is never deployment authority. The controller
resolves, hashes and pulls the **single-platform manifest digest**; indexes are
rejected. The immutable preparation artifact contains only `candidate.json` and
raw `manifest.json`, with commit, candidate digest, manifest/configuration digests,
platform and preparation-run identity. It contains no credentials or signed proof.

A separate classic `read:packages` token privately checks package visibility and
pulls. This is needed because the canary's GITHUB_TOKEN could pull its package but
could not read the package metadata endpoint. Railway receives its own owner-saved
restricted pull credential, never a token through workflow arguments or artifacts.
Docker credentials live in a private temporary directory and are removed finally.

## Protected execution

Both operations use the existing manual protected workflow, owner-reviewed
production environment, exact-production-commit CI check and shared
`kingdom-come-production` mutex. Image preparation has no Railway, signing, backup
or PostgreSQL credentials. All new capability flags default to unset/disabled.

1. `image-prepare`, promotion OFF, validates/builds/probes/publishes one image and
   retains its candidate artifact. It does not deploy or create a recovery copy.
2. `image-release` requires explicit artifact/run/digest selectors and an exclusive
   owner edit window. Before the first backup, authenticate the successful exact-
   commit preparation run/job, immutable artifact ZIP digest and two-file layout,
   current private registry manifest, pulled configuration and actual isolated
   runtime payload. Unknown/expired evidence, index/tag substitution, wrong source,
   secret-bearing image configuration or platform mismatch fail closed.
3. Read-only Railway preflight validates exact production target, stable running
   deployment, required migration/start/health settings and no pending changes.
   Bind the pre-backup parent configuration/deployment digest to this job for at
   most 45 minutes. Missing registry readiness also fails before recovery.
4. Run the existing encrypted backup, independently retained ciphertext check,
   isolated restore, preservation, strict schema/bot checks and recovery proof
   chain unchanged. The recovery worker still uses `private-job-v2` source upload;
   only the game switches to image transport.
5. Sign v3 proof containing every existing v2 recovery/commit/target binding plus
   exact image candidate and preparation artifact identity/digest. The runtime
   checks the Ed25519 signature, freshness, private database separation, candidate
   payload and static identity before migration. A static image cannot be
   downgraded by disabling automated approvals or requesting a v2/source proof.
6. Revalidate registry and target. Stage only the game source `{image: <digest>,
   repo: null}` and seven existing/new release variables. Merge preserves competing
   edits so the strict scope validator rejects them. Privately compare the fresh
   revision and complete sensitive patch immediately before one commit using
   `skipDeploys: true`. Never hash the signed proof or credentials into a public
   approval digest. Authenticate the server workflow receipt, committed patch,
   applied source and unchanged running deployment. No implicit deploy is accepted.
7. After one more read, call `serviceInstanceDeployV2` once. Authenticate the exact
   returned deployment/target and `meta.image`; no latest-deployment lookup or tag
   fallback. Existing exact-release health, restored-copy preservation and login
   checks still decide success. Recheck the image reference after health success.

A registry digest cannot be embedded inside its own image. Static source/candidate
identity, the externally signed image approval and authenticated deployment digest
reference provide the binding instead. Mutable labels or environment claims alone
never authorize deployment.

## Race, failure and recovery boundaries

Railway staging has no demonstrated atomic compare-and-swap across read, commit
and deploy. GitHub's mutex does not exclude dashboard editors or other automation.
The mandatory owner-exclusive edit window, fresh reads, revision equality, strict
patch scope and authenticated receipt reduce this residual TOCTOU risk; they do
not eliminate it. The owner must accept and enforce the edit window before enabling
image release. Otherwise leave the capability disabled.

Every stage/commit/deploy mutation has one attempt. A lost acknowledgment means
HOLD and private read-only reconciliation, never automatic retry, discard or
source fallback. Unexpected pending data, API shapes, implicit restarts or changed
parent identity stop the process. A committed configuration may remain applied
without a deployment after failure; do not rerun blindly.

No automatic old-image rollback follows migration. Retain approved images and
independent encrypted recovery evidence; assess schema compatibility and prefer
an owner-reviewed forward correction. Database restoration, code rollback and
any source-transport reset require separate review/authorization. No retention,
registration, schema, game, economy or recovery-storage policy changes are included.

## Verification

Focused tests cover artifact provenance/ZIP tampering and bounds, real Git build
input checks, registry/configuration distinctions, dormant source compatibility,
signed v3 proof/downgrade rejection, committed/empty staging placeholders,
concurrency, exact deployment identity and lost mutation acknowledgments. Actual
network-disabled container tests exercise accepted/rejected signed proofs and
migration rejection before PostgreSQL access. The complete existing CI additionally
retains its database shards, browser, container and encrypted 900-bot recovery,
strict schema and retention-regression checks. Final exact-head results belong in
the PR; a canary success is not a production release authorization.
