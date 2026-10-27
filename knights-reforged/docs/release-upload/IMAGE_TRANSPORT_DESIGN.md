# Protected immutable-image transport: implementation design

Status: **locally compatible; provider canary and protected implementation still
required**. No image was published, no Railway service/configuration was changed,
and no production recovery ran for this investigation. This is not an enabled
transport or an instruction to redeploy from the dashboard.

## Verified capabilities and limits

[Railway service documentation](https://docs.railway.com/services) confirms
prebuilt Docker images, including GHCR. Private registry images require Railway
Pro; private GHCR uses a classic PAT. Public package visibility is an owner
decision, not a safe default. Image auto-updates must remain disabled.

The authenticated GraphQL schema exposes:

| API | Important contract |
| --- | --- |
| `environmentStageChanges(environmentId, input, merge)` | Environment-scoped staged configuration |
| `ServiceSourceInput.image: String` | Image source input; schema alone does not prove digest syntax/receipt semantics |
| `environmentPatchCommitStaged(environmentId, skipDeploys: true)` | Returns a **workflow ID**, not a deployment ID |
| `serviceInstanceDeployV2(environmentId, serviceId, commitSha)` | Returns a deployment ID; exact target still needs independent verification |

The CLI's service-source connect uses service-global `serviceConnect`; do not
substitute it for an environment-scoped reviewed source change. Existing registrar
patch code is restricted to the worker's three variables and must not be repurposed.

The current Dockerfile already produces a non-root deployable game image with
required assets and the signed migration gate. The new offline probe verifies
those properties against CI's actual image. Its `localConfigDigest` is a Docker
configuration digest, **not** the registry manifest digest; the report deliberately
sets `registryManifestDigest: null` and `railwayDeploymentTested: false`.

Railway's generic image support does not establish its acceptance of
`ghcr.io/<approved-package>@sha256:<platform-manifest>` or the exact observable
runtime digest fields. No production target is available for safe experimentation.
A non-production canary must settle those two points before a transport PR can
authorize production image deployment. If digest references or exact digest
evidence cannot be verified, hold; do not fall back to a mutable tag.

## Dashboard-only preparation; zero recovery copies

Implement one manual GitHub Actions **image preparation** operation, independent
of prepare/promote. It must use the existing protected production branch checks,
production environment/owner approval and `kingdom-come-production` mutex. Keep
it disabled until the owner approves package visibility and registry access.
It receives no Railway, database, backup, restoration or signing credentials.

1. Require successful exact-production-commit push CI, exact checkout SHA, clean
   tracked inputs and no extra files/symlinks in Docker COPY sources. Use locked
   npm dependencies and the committed Dockerfile; record its digest, lockfile
   digest, base-image resolution and build-tool versions. Build linux/amd64 with
   the exact OCI revision label, without build secrets.
2. Run the actual-image preflight and existing disposable container/recovery tests
   before publishing. CI uses synthetic isolated data, not a production rehearsal.
3. Publish once to one owner-approved GHCR package using the workflow's minimally
   scoped `packages:write` token. Use a unique `<sha>-<run>-<attempt>` tag only for
   initial publication. No secret in argv, logs or artifacts; use password-stdin
   and a private temporary Docker credential directory, then remove it.
4. Resolve the registry's immutable **single-platform manifest** SHA-256, pull by
   that digest and recheck its config/revision/candidate digest. Reject an
   unexpected multi-platform index rather than confuse index, manifest and config
   digests. Retain an immutable candidate artifact containing exact Git SHA, image
   reference/digest, candidateDigest and build evidence. It is not deploy authority.

Separately authorize a disposable Railway image canary: a new isolated project/
service with no production variables, databases, volumes or domains. Use the
digest reference and override the start command to a read-only `candidateDigest`
probe; do not start the game or migrate. Verify it pulls without a source upload,
binds the returned deployment to the exact canary project/environment/service,
exposes adequate image-digest evidence, and preserves expected service settings.
Stop/remove only the disposable canary after evidence capture. No production
backup/restore is involved. Record actual provider contracts in fixture tests.

## Production transport implementation after the canary

Add a separately reviewed immutable image policy; keep source/private-job-v2
strict and unchanged until cutover. Do not infer image authority from a repo
variable, label, caller-supplied URL or successful build alone.

1. Revalidate the exact successful production SHA and retained image-candidate
   artifact from its expected repository/run/job. Pull the digest, verify all
   evidence and ensure no unrelated staged changes. Complete this **before** any
   production backup so image problems consume no recovery storage.
2. Acquire the existing owner-approved environment and shared production mutex.
   Run the existing encrypted backup, independent restoration, preservation and
   retained-ciphertext verification chain once. Registration/retention holds,
   schema pin, bot counts and independent encryption remain mandatory.
3. Introduce strict signed proof v3 for image releases: all v2 fields plus exact
   image reference, registry platform-manifest digest and image-candidate artifact
   identity/digest. Verify the signature, freshness, exact SHA/candidate, database
   and recovery binding before any live migration. Runtime must cross-check a
   static build identity and the reviewed image policy, not trust environment
   claims alone. Test wrong image/SHA, stale evidence, changed labels, schema,
   counts, signing key and missing restoration. No v3-to-v2 fallback.
4. Prepare only the exact game service's image source plus the existing approved
   release-proof variables in an environment-scoped patch. Preserve start/predeploy
   commands, health settings, root behavior and other services. Privately verify
   the complete patch allowlist, identity/revision and disabled autoupdates. Use an
   exclusive owner edit window, a fresh pre-commit read, and one
   `environmentPatchCommitStaged(...skipDeploys: true)` mutation. Authenticate its
   **server workflow receipt** and applied configuration; verify no deployment
   occurred. This is configuration preparation, not proof of deployment.
5. Revalidate the applied immutable image and proof, then make one
   `serviceInstanceDeployV2` call. Independently authenticate the exact returned
   deployment, target and provider image identity before waiting for SUCCESS,
   `/healthz`, exact release identity and all existing preservation checks.
   Never use newest/latest fallback. Lost mutation acknowledgment or unknown
   state means HOLD and read-only reconciliation, not automatic retry.

Railway's staging API has no demonstrated atomic compare-and-swap covering
read/commit/deploy. GitHub's mutex excludes our workflows but not dashboard
editors/other automation. The exclusive edit window, fresh reads and exact server
receipt reduce this race; they do not eliminate it. Any competing editor, revision
change or ambiguous image evidence must stop promotion. Owner acceptance of this
residual limitation is required; otherwise keep image deployment disabled.

## Failure and recovery policy

- Before configuration commit: leave production unchanged. Inspect unexpected
  pending changes privately; never auto-discard someone else's patch.
- After commit but before confirmed deployment: hold, reconcile receipt/applied
  config and old deployment; do not automatically restart the old worker/game.
- During/after deployment: use existing health and preservation gates. No automatic
  old-image redeploy after migrations. Retain encrypted recovery and prior image
  digest, assess schema compatibility, and prefer a reviewed forward correction.
  Destructive restoration or rollback remains a separately owner-approved operation.
- Registry outages, visibility/auth changes or image deletion fail closed. Retain
  approved digests and disable mutable-tag/autoupdate paths.

## Smallest remaining owner decisions

Approve package location/visibility (or private Pro/GHCR read access), authorize
the isolated canary, then review the focused protected image-transport implementation
against its actual results. No support contact is necessary. Until those conditions
are met, diagnostics are ready but immutable-image production promotion is not.
