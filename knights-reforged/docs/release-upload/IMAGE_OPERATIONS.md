# Owner procedure: private immutable-image releases

This is a **future owner-authorized procedure**, not evidence that any step below
has been performed. The implementation is inactive. Do not dispatch a protected
workflow, publish a game image or change production configuration as part of PR
review. No local CLI/software or Windows access is required.

## One-time prerequisites, after review and separate authorization

1. Merge the reviewed implementation only after exact-head CI and owner approval;
   wait for successful exact-production-commit push CI. Preserve existing required
   owner review, administrator-bypass prohibition, branch rule, autodeploy-disabled
   setting and production mutex.
2. GitHub Packages must already contain **private**
   `ghcr.io/catillatio/kingdom-come`. Allow this repository's Actions write access.
   If absent, stop before any game publication: separately authorize a small
   synthetic bootstrap into this exact package using the already proven canary
   publisher pattern, set/verify Private in GitHub's dashboard, and then grant
   Actions access. Do not bootstrap by uploading the game before privacy is known.
   This bootstrap is not run or automatically added by this PR.
3. Create a restricted, short-lived classic PAT with only `read:packages` for this
   package. Enter it privately as protected GitHub environment secret
   `KINGDOM_IMAGE_REGISTRY_READ_TOKEN`; never send it through chat or workflow
   inputs. The publishing step uses its separate ephemeral GITHUB_TOKEN.
4. In the existing Railway **game service only**, privately save an independently
   restricted GitHub read-package credential under Source → Registry Credentials.
   Confirm the plan already supports private registry pulls; no plan upgrade is
   authorized here. Keep image auto-updates and GitHub autodeploy disabled. Do not
   click Deploy or accidentally apply unrelated staged changes. If entering the
   credential/source requires a deployment in the dashboard, hold for a separately
   reviewed setup action rather than starting one outside the protected workflow.
5. Review/accept the [exclusive-window/TOCTOU limitation](IMAGE_TRANSPORT_DESIGN.md).
   Ensure no other Railway editor or automation can change the environment until
   each protected release completes. Reuse the current recovery/signing/database
   evidence; do not reinstall catalogs, alter credentials or run a rehearsal merely
   to validate the registry.

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

Enable protected variables `KINGDOM_GAME_IMAGE_ENABLED=true` and
`KINGDOM_GAME_IMAGE_REGISTRY_READY=true` after private pull access and the edit
window have been confirmed. Enabling image mode deliberately blocks accidental
source releases. It does not itself deploy or create a recovery copy.

Run the same workflow on the **same exact production SHA**:

- Operation: `image-release`.
- Image run/artifact: the exact successful preparation identifiers.
- Image manifest digest: the full `sha256:...` from that candidate.
- Image exclusive window: **ON**, after excluding all other editors/automation.
- Promote: **ON only when the owner authorizes the real production release**.
- All registrar inputs blank/OFF; approve the protected environment separately.

Promotion OFF still performs a genuine backup/restore rehearsal. It is **not** a
free diagnostic, so do not run it merely to check image configuration. Read-only
registry/target checks run automatically before any recovery request either way.
Any commit to production requires a newly prepared exact-commit candidate.

The controller then uses the unchanged recovery chain once, stages only the game
source and signed proof, commits with skip-deploys and performs one exact image
deployment. A separate implicit dashboard deploy is never necessary or authorized.
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
