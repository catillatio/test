# Owner procedure: private immutable-image releases

This procedure separates completed owner setup from future release authorization.
The owner has approved the alternate existing registry, verified it is Private and
confirmed `catillatio/test` already has Admin Actions access (which includes Write).
The image transport remains inactive. Do not dispatch a protected
workflow, publish a game image or change production configuration as part of PR
review. No local CLI/software or Windows access is required.

## One-time prerequisites, after review and separate authorization

1. Merge the reviewed implementation only after exact-head CI and owner approval;
   wait for successful exact-production-commit push CI. Preserve existing required
   owner review, administrator-bypass prohibition, branch rule, autodeploy-disabled
   setting and production mutex.
2. Completed owner decision: permanent image location is the **existing Private**
   `ghcr.io/catillatio/kingdom-come-deploy-canary` package. Despite its historical
   name, the private package can hold separately tagged game images; preserve the
   original canary digest and tags. On 2026-10-27 the owner confirmed Private and
   existing `catillatio/test` **Admin** Actions access. Admin includes Write; do
   not recreate or downgrade this access for the registry correction. This is
   namespace/access approval only, not publication/deployment authorization. The
   publisher requires authenticated metadata to confirm this exact existing package is
   Private before any push. Missing/unreadable/public metadata is HOLD; never
   bootstrap, restore or substitute another namespace. The failed Public
   `kingdom-come` bootstrap is being deleted by the owner; do not republish it.
3. Completed owner setup: protected GitHub production environment secret
   `KINGDOM_IMAGE_REGISTRY_READ_TOKEN` is configured. It must be a restricted,
   short-lived classic PAT with only `read:packages` for this package; never send
   it through chat or workflow inputs. The publishing step uses its separate ephemeral GITHUB_TOKEN, whose
   existing package access is already sufficient. Never supply a permanent write PAT.
   If this read secret is already configured, do not rotate/recreate it without
   a separate need. Secret presence alone does not prove scope or access.
   Leave all four image capability flags unset/disabled; saving this secret does
   not authorize image preparation, publication, release or recovery.
4. First-time Railway credential installation happens **inside the later protected
   image promotion**. The GitHub-source service has no Registry Credentials field;
   do not disconnect GitHub, switch sources, click Deploy, call a direct update,
   or create a setup deployment to reveal it. The protected workflow now has
   `image_install_registry_credentials`, OFF by default. On the first separately
   approved **real image release**, select it to authorize copying the existing
   protected `read:packages` token into Railway's game-only registry credentials.
   No extra credential is entered in chat, workflow inputs or a Railway variable.
   The token's OAuth scopes must be exactly `read:packages`; missing/extra scopes
   fail before recovery. This option requires promotion ON and the original
   GitHub source, and is forbidden for preparation, rehearsals and later image
   updates. Keep `KINGDOM_GAME_IMAGE_REGISTRY_READY` unset/false for this first
   transition; an explicit, verified handoff supplies its credential prerequisite.
5. Review/accept the [exclusive-window/TOCTOU limitation](IMAGE_TRANSPORT_DESIGN.md).
   Ensure no other Railway editor or automation can change the environment until
   each protected release completes. Reuse the current recovery/signing/database
   evidence; do not reinstall catalogs, alter credentials or run a rehearsal merely
   to validate the registry.

## Authorization scope

Image publication flags remain in GitHub's protected **production environment**;
do not duplicate them as repository variables. The unprotected safety job checks
request shape, branch/ref, commit, attempt and input separation. It is not a
publication approval. Once the protected job starts after owner review, its steps
resolve the environment variables and enforce full authorization before building
or publishing. Operational validators continue checking these flags.

[Run #72 root cause and corrected owner procedure](IMAGE_PREPARE_AUTHORIZATION_FIX.md).

[Run #74 active-target correction and verification](IMAGE_TARGET_PREFLIGHT_FIX.md).

[Read-only exact-assertion inspection for repeated target failures](IMAGE_TARGET_READ_ONLY_INSPECTION.md).

## Prepare one exact image; no production recovery/deploy

Set protected GitHub environment variables
`KINGDOM_IMAGE_PUBLICATION_ENABLED=true` and
`KINGDOM_IMAGE_PACKAGE_PRIVATE_CONFIRMED=true` only after the above approvals.
These are capability confirmations, not substitute approval gates.

In Actions → **Owner approved Railway release** → Run workflow:

- Branch: `release/production`.
- Operation: `image-prepare`.
- Promote: **OFF**.
- Leave all registrar/image selectors blank and exclusive-window checkbox OFF.
- Approve the existing protected environment when GitHub requests owner review.

Download the successful `kingdom-image-<sha>-<run>-1` artifact in GitHub. Record
its exact run ID, artifact ID/digest, SHA, candidate digest and manifest digest from
`candidate.json`. There must be exactly `candidate.json` and `manifest.json`.
A failed/ambiguous publication is HOLD; inspect privately, never rerun an uncertain
push blindly. No image is selected by a mutable tag.

## One normal protected image release, only with separate owner approval

Enable protected variable `KINGDOM_GAME_IMAGE_ENABLED=true` only for the
separately approved cutover. For the first credential handoff, keep
`KINGDOM_GAME_IMAGE_REGISTRY_READY` unset/false and select the explicit installation
option below. For subsequent image releases, the owner may set Registry Ready
true only after the first protected deployment and private pull have been verified. Enabling image mode deliberately blocks accidental
source releases. It does not itself deploy or create a recovery copy.

Run the same workflow on the **same exact production SHA**:

- Operation: `image-release`.
- Image run/artifact: the exact successful preparation identifiers.
- Image manifest digest: the full `sha256:...` from that candidate.
- Image exclusive window: **ON**, after excluding all other editors/automation.
- First transition only: `image_install_registry_credentials` **ON**; this
  explicitly authorizes storing the protected read-only token with Railway. For
  later image releases it stays **OFF**. There is no credential-only deploy.
- Promote: **ON only when the owner authorizes the real production release**.
- All registrar inputs blank/OFF; approve the protected environment separately.

Promotion OFF still performs a genuine backup/restore rehearsal. It is **not** a
free diagnostic, so do not run it merely to check image configuration. Read-only
registry/target checks run automatically before any recovery request either way.
Any commit to production requires a newly prepared exact-commit candidate.

The controller authenticates the image and, for the handoff, the token scopes
before any recovery request. After the unchanged recovery chain passes, it stages
seven signed release variables and (first transition only)
`deploy.registryCredentials={username,password}` in one **configuration-only**
patch, with no source fields. It commits with `skipDeploys:true`, authenticates
the exact receipt, all applied values and unchanged old deployment, then uses
one typed `serviceInstanceUpdate` to set the exact image and `repo:null`.
The effective and serialized source, cleared pending patch, unchanged complete
private configuration and old deployment must verify again before one exact
image deployment. The project must have exactly one completely enumerated
environment; any additional environment, including a presumed fork, is HOLD. Credentials never enter the game environment,
source image, approval digest or release artifact. A separate implicit dashboard deploy is never necessary or authorized.
Existing post-release health/login/preservation checks must all pass; retain their
`post-deploy.json` alongside encrypted recovery evidence. Confirm exact deployment
ID, reference and manifest/configuration digests, not simply a green service tile.

## Stops and forward recovery

A failed/uncertain commit or deploy must be reconciled read-only from its server
receipt and exact deployment identity. Do not click Rerun jobs, restage variables,
start a direct Railway redeploy, switch to a tag or use stale proofs. Do not fall
back to source transport without a separately reviewed reset of image source and
approval variables. Preserve the previous digest and independent encrypted backup;
review schema compatibility before any rollback/restoration. Prefer an approved
forward correction with fresh exact-commit CI and release evidence.

The synthetic canary is already removed. Its private image remains evidence; the
owner may revoke the old canary-only PAT if not already revoked. This procedure
never requires access to the owner's computer.

## First-transition evidence and failure boundary

See [contract and evidence limits](REGISTRY_TRANSITION.md). The combined credential
transition is implemented and fixture-tested, but has not been executed against
production or a new billable canary. Unknown/redacted staged shapes fail closed.
The typed source update is now supported by the completed isolated
configuration-only canary. Its broader non-fork environment scope is guarded by
complete single-environment enumeration on every read. See
[TYPED_SOURCE_TRANSITION.md](TYPED_SOURCE_TRANSITION.md) for evidence, exact
sequence, failure boundaries and the current dashboard-only owner procedure.

If commit succeeds but deployment does not, preserve the receipt and old running
service. Do not rerun the first-transition checkbox or use the Railway dashboard
to deploy. Reconcile applied configuration read-only, then obtain a separately
reviewed continuation with fresh proofs as necessary. No automatic rollback,
credential reset or repeat recovery is authorized by a failed job.
