# Small finishing pass — local review

Continues the reviewed local commit
`56fbd34c74166bd585de9157d8d41a022f6be6c9` on
`feature/complete-gameplay-rebuild-20261111`. No new layout, gameplay or theme.
The existing committed worktree was restored from its preserved Git index after
the cloud's temporary filesystem was cleared; no branch was reset or replaced.

## Changes

- The same three original transparent SVG silhouettes have 8% more artwork
  coverage, brighter class-colored rims and a restrained static edge light.
  Profile still reserves exactly 60×60 pixels; adjacent text, tabs, panels,
  spacing and navigation are unchanged. No painted portraits or backdrop.
- A single `partials/class-silhouette.ejs` renders the same assets for Profile
  and 30×30 decorative Battle/Bounty markers. Battle markers align with the
  identity/name area, using the existing flexible horizontal column. Attack
  dimensions, type sizes, class labels and saved recommendation order remain
  unchanged. The markers follow each viewed target's actual stored class.
- `paintAttention()` now reconciles the unread link text and Mark all form from
  the same authenticated personal count as Home. At zero, the link/form group
  is hidden, its text is updated to zero and the submit button is disabled.
  Positive partial counts update in place. Army invitations remain separate;
  exact event IDs, CSRF, fixed read-batch IDs and all server read logic are intact.

SVG bytes and provenance are updated together. The `finish2` asset query ensures
the refined image is not confused with an older cached silhouette.

## Local verification

`tests/finishing-pass-browser.test.ts` uses actual Chromium, disposable PostgreSQL,
real human accounts and 450 saved synthetic NPCs. The owner is healed using the
existing paid command before screenshots, so enabled Attack controls are visible.
It captures Profile and Battle/Bounty at 320/390/1280, native 60px class markers,
normal-human rows reached through real More rivals cursors, and the notification
issue before/after using actual read acknowledgments. It checks transparency,
increased visible size/brightness, unchanged Profile geometry, Attack dimensions,
fonts, recommendation IDs/order, saved battles and wallets. A two-event read
updates 5→3; subsequent reads update to zero with one pending invitation intact.

Set `KC_FINISHING_BASELINE` to an isolated, byte-verified extraction of `56fbd34`
to capture comparisons. This is test-only; no theme/debug switch is shipped.
`tests/focused-notifications-browser.test.ts` also asserts control reconciliation
after lost/failed acknowledgments and across tabs, while retaining all existing
ownership, pagination, retry and late-commit cases. The asset test pins the three
preserved matchmaking blobs. The existing complete browser test retains the five
tabs, resources, real actions, portraits and normal notification flow.

```sh
npm run typecheck
npm run build
npm run check:static
node scripts/ci/run-tests.mjs --files=tests/finishing-pass-browser.test.ts,tests/focused-notifications-browser.test.ts,tests/focused-followup-assets.test.ts,tests/complete-rebuild-browser.test.ts --workers=1
```

Final source, exact results, changed paths, screenshots, measured layout and
alpha/brightness evidence are in the external local review bundle. Generated
screenshots live under `test-results/finishing-pass/`; the bundle adds
pixel-preserving comparison sheets and the patch/Git bundle.

Matchmaking, NPC bounty behavior, financial rules, all migrations, feature gates,
charcoal comments, Dark Medieval scenery, Play PR #88 and MOBSTAS are untouched.
Nothing pushed, submitted, merged, deployed or activated. No hosted CI, provider
access or live writes. Owner visual review and a separately authorized release
remain necessary to put this local finishing pass into production.
