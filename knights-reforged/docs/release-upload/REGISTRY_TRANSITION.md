# First protected GitHub-to-private-image transition

> Historical implementation record. The combined source/credential patch below
> is superseded by the [verified typed-source transition](TYPED_SOURCE_TRANSITION.md).
> Current promotion commits variables/credentials with deployments suppressed,
> then applies the typed source update under a strict single-environment guard.
> The original design and its evidence limits are retained here for history.

Status: implemented for owner review; no production mutation, image publication,
recovery run or deployment performed. The owner-reported GitHub-source dashboard
has no Registry Credentials field. The previous setup step was not executable
without an unsafe source switch.

## Narrow correction

The existing `image-release` gains one checkbox:
`image_install_registry_credentials` (default OFF). It is accepted only for a
first-attempt real promotion, with an exact authenticated image candidate and the
exclusive edit window. The game must still point to `catillatio/test`, with no
image source. Later image releases, source releases, registrar operations, image
preparation and backup-only rehearsals cannot use this handoff.

Before any backup, the existing image verifier authenticates the Private package,
manifest/configuration, isolated payload and (when installing) the classic PAT's
`X-OAuth-Scopes` header. Exactly `read:packages` is accepted. Missing headers,
write/delete/repository scopes or invalid syntax stop before recovery. The
read-only target preflight binds the public setup-mode label into its existing
job/SHA/candidate/expiry record. It writes no credentials and changes no Railway
configuration.

After all unchanged recovery, signature and owner gates pass, one exact
production game-service patch contains:

- Source image: authenticated immutable GHCR platform-manifest reference;
  repository source: null.
- Seven existing signed release variables.
- First transition only: `deploy.registryCredentials` with fixed username
  `catillatio` and the protected read-only token as password.

The complete sensitive patch is checked privately, reread and revision-bound.
One `environmentPatchCommitStaged(skipDeploys:true)` call follows. Its server
workflow/committed-patch receipt, applied image source and unchanged running game
must verify before one `serviceInstanceDeployV2` call. No direct source connect,
service update, credential-only deployment, retry or latest fallback is used.
Additional changes, missing/redacted fields, lost acknowledgments or an implicit
restart stop the controller.

Credentials stay out of process arguments, game environment variables, image
layers, public approval digests/hashes, console output and uploaded artifacts.
They are sent only in the authenticated Railway patch. Private in-memory patch
equality includes the credential; public target hashes exclude it. No permanent
write credential is required. Static image identity, signed v3 proof and exact
deployment/health/preservation checks remain mandatory.

## Verified contracts and limits

- Official CLI 5.70.0's GraphQL schema declares `RegistryCredentialsInput` as
  required string `username`/`password`, the environment-scoped JSON staging
  input, and the commit's `skipDeploys` argument:
  https://github.com/railwayapp/cli/blob/v5.70.0/src/gql/schema.json
- Railway's published service configuration schema places the credential object
  at `deploy.registryCredentials`: https://railway.com/railway.schema.json
- Railway documents GHCR read-package PATs and encrypted-at-rest registry
  credentials: https://docs.railway.com/builds/private-registries
- The earlier isolated canary proved private digest pull. It did not exercise
  this combined transition. No production mutation or new canary is claimed as
  live validation here. Synthetic provider tests exercise the integration; a
  provider representation mismatch holds without broadening acceptance.
- The environment JSON schema endpoint was inaccessible during investigation.
  The implementation uses the published service shape and existing per-service
  environment patch contract; this is not represented as a live staging test.
- Direct `serviceInstanceUpdate` is unused: its official schema describes
  experimental propagation across non-fork environments, and its deployment
  side effects were not independently established here.
- There is no demonstrated CAS across read/commit/deploy. The existing mutex,
  exact revisions/receipts and owner-exclusive window remain required.

## Dashboard-only owner sequence, after separate approvals

1. Review this PR/CI. Merge only with separate approval; wait for green exact-
   production-commit push CI. No action in Railway Source is required now.
2. The existing package is Private, Actions Admin access is sufficient and the
   protected read-token secret is configured. It must be a classic PAT with only
   `read:packages`. Do not recreate it or share the value here.
3. When publication is separately authorized, run protected `image-prepare`,
   promotion OFF and installation OFF. It publishes the game image without
   changing Railway or running recovery. Publication is not authorized now.
4. For the separately approved first promotion, run `image-release` with exact
   preparation run/artifact/digest, exclusive window ON, promotion ON and
   `image_install_registry_credentials` ON. Leave Registry Ready unset/false;
   the authenticated handoff supplies this first-use prerequisite. Approve the
   existing protected production environment gate.
5. Only after exact image pull, health and preservation pass may the owner mark
   `KINGDOM_GAME_IMAGE_REGISTRY_READY=true` for later releases, with installation
   OFF. Do not rerun an uncertain first-transition mutation.

No disconnect-GitHub action, manual Deploy click, production credential write,
protected recovery diagnostic or new billable resource is required during review.
