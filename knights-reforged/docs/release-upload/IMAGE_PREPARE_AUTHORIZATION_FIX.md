# Image-prepare protected environment authorization

## Confirmed run #72 failure

[Protected run #72](https://github.com/catillatio/test/actions/runs/40608272956)
used exact source `2429d8917198fbd460f84ca22bf5d4c3d60131c1`.
The safety job has no `environment: production` but invoked the full image
validator with environment-scoped `vars.*`. Logs show both publication flags
empty. The first failed assertion required publication enabled to equal `true`.
The owner reports both flags configured true in the protected production environment.

Other request fields were valid: image-prepare, promotion false, installation
false, exclusive window false, empty image/registrar selectors, manual production
ref and first attempt. Exact-commit/protection preflight passed. Replaying the
sanitized request fails; changing only the two publication flags to true passes.
All operational jobs were skipped; this attempt published no image and requested
no recovery or Railway deployment.

## Narrow correction

- `checkImageRequestShape` and the shape-only CLI mode validate repository, ref,
  event, SHA, attempt, operation and input separation without environment flags.
- Existing `checkImageRequest` still performs full authorization and remains the
  default for build, publish and artifact verification. Missing/disabled flags
  are never accepted as authorization.
- Safety uses shape-only validation. Publication flags and image-enabled state
  are not read there. Existing exact-CI/branch/owner-environment checks remain.
- The existing protected image-prepare job validates authorization before build
  and publish, resolving flags at **step scope** after the environment starts.
  Every operational step still receives and validates the protected flags.
- Protected image-release similarly performs full authorization before tools,
  image verification or recovery. Its relevant steps resolve image-enabled and
  registry-ready flags at step scope, preventing the same scope error on release.
- No repository-wide approval copies, hardcoded true flags, fallback authority,
  new release operation, changed reviewer, mutex or permissions.

Tests simulate the actual workflow bindings with unavailable safety variables and
available protected-step variables, invoke both CLI validators without network or
credentials, reject missing/disabled approval, and retain malformed/mixed-input
and release authorization checks. Required exact-head CI is recorded on the PR.
CI uses disposable fixtures; no production recovery workflow is dispatched.

## Exact next owner action

Review this PR. After separate merge approval and successful exact-production-
commit push CI, start a **fresh** protected workflow on release/production:
operation image-prepare, promotion OFF, installation OFF, all image/registrar
selectors blank and exclusive-window controls OFF. Approve the existing protected
production environment when GitHub prompts. Keep the two existing flags in that
environment; do not recreate them at repository scope. Do not rerun #72 because
reruns have attempt 2 and are intentionally rejected.

That future owner action publishes the private game image only. It does not
change Railway or run recovery. This fix assignment does not itself authorize
Codex to dispatch it or publish an image.

GitHub reference: https://docs.github.com/en/actions/reference/workflows-and-actions/variables
