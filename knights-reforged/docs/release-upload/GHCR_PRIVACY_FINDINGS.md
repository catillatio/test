# GHCR bootstrap privacy finding and approved existing-package registry

Status: alternate registry approved; publication and deployment remain on HOLD.
On 2026-10-27 the owner verified the existing package is Private, confirmed
`catillatio/test` already has Admin Actions access (including Write), and approved
the configuration patch and required CI. No production image publication,
deletion/restoration, Railway operation, protected recovery workflow, production
configuration or Windows execution is authorized by this correction.

## What is established

- The owner confirms the synthetic-only `ghcr.io/catillatio/kingdom-come` package
  was Public and will delete it through GitHub's dashboard. Deletion is not inferred
  from a 404 or an anonymous access denial.
- [Bootstrap run 40595205433](https://github.com/catillatio/test/actions/runs/40595205433)
  pushed once and stopped at PRIVATE_VISIBILITY. Its authenticated, SHA-256 checked
  receipt records PUSHED_NOT_PRIVATE. No game code or secrets were uploaded.
- The exact source and destination image manifest digest was
  `sha256:b49d4df2ca6e4959dcdaf1235d8705d1b2f012380d5a2991fce414ac2acda000`.
  Source configuration digest was
  `sha256:4eee41c0a59aef69fa373485c2043c85c009027f35e90a1d8024e06c852fd689`.
  The preserved raw configuration has no labels, including no repository-source
  or visibility label. Image bytes do not carry a package's visibility setting.
- The pinned bootstrap script uses one ordinary Docker push with the ephemeral
  GITHUB_TOKEN. There is no Public visibility request or visibility mutation.
  Privacy is checked after the push; it is not constrained at creation. That is
  the controllable defect in the bootstrap procedure.
- GitHub documents first publication as Private. The observed Public result is
  inconsistent with that default. Available evidence does not establish the
  provider-side cause or exclude prior namespace/history effects. Do not claim
  it was caused by public-repository inheritance, source-image visibility or
  token type. GitHub explicitly distinguishes permission inheritance from
  visibility inheritance for granular registries.

## Creation cannot currently be guaranteed for this personal namespace

The documented Packages REST API has no pre-create-with-Private operation;
its visibility query is a filter, not a setter. The Packages GraphQL API does
not support granular registries such as GHCR. A new personal package name,
private source repository, different PAT or Docker label is not an independently
verified fix for the observed creation behavior. Public-to-Private conversion
is unavailable. Do not retry the bootstrap, restore the deleted Public package,
or fabricate a visibility-setting API.

Preserving `ghcr.io/catillatio/kingdom-come` safely is therefore unresolved. A
fresh namespace alone does not provide a stronger creation constraint. A clean
new organization namespace with verified Private-only creation policy could be
reviewed separately, but no organization, publisher identity or policy is created
or represented as verified here.

## Approved registry: avoid package creation

The existing owner-confirmed Private package
`ghcr.io/catillatio/kingdom-come-deploy-canary` is the approved permanent
image location. Its historical name does not grant deployment authority. Keep
its original synthetic digest and tags intact. Future game images use distinct
SHA/run/attempt tags and immutable digests; the existing game configuration and
static identity validators reject the synthetic canary as a game candidate.

The configuration correction updates the fixed image reference, package-metadata path,
pull scope and manifest path together. It preserves the pre-push requirement that
authenticated metadata reports this exact existing package as Private. Missing,
wrong-name, unreadable or Public metadata fails; there is no auto-creation or
namespace fallback. All existing release, image-proof and recovery guards remain.

The owner completed namespace approval and verified Private plus existing Admin
Actions access. No repeated permission change or verification survey is needed.
The next credential prerequisite is documented in [operations](IMAGE_OPERATIONS.md):
add or confirm the protected read-only package token while keeping image flags
disabled. Freeze package visibility/settings during any later approved publication
window; no client-side check can defeat a simultaneous owner visibility change. This is not permission
to publish a game image, enable image mode, deploy or run recovery.

Validation: 64 focused image-policy, artifact and deployment tests passed, zero
skips. Required exact-head CI is recorded on the draft PR. Its recovery tests use
disposable fixtures; no protected production recovery workflow is dispatched.

## Primary references

- [GitHub access control and visibility](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility)
- [Packages REST endpoints](https://docs.github.com/en/rest/packages/packages)
- [Packages API support and deletion/restoration](https://docs.github.com/en/packages/learn-github-packages/deleting-and-restoring-a-package)
