# Phase 2 shared interface reconstruction

Implemented on the local `feature/kingdoms-live-visual-overhaul` branch, based on
`feature/kingdoms-live-land` at `0fa4b902fefbcf64d999564acbe4a7cbabcd9b55`.
GitHub was not accessed. No branches were merged or deployed.

## Scope

The shared layout now uses a centered portrait frame on Android and PC, five
original bottom tabs, and an always-visible secondary Land entry. Recruit uses
the existing `/game/army` route and militia functionality. The Land route remains
in the server navigation contract; it is only moved out of the primary tab bar.

The original page backgrounds sit behind a compact resource header and the
existing content. Shared CSS adapts buttons, panels, fields, notices and spacing.
Existing decorative hero images are hidden by that shared layer; all intro text,
links and gameplay forms remain. The individual gameplay templates are unchanged.

Gold, Level/XP, Health and Energy continue to use existing server values. Land's
wallet hook, timer, pending income, API refresh and no-JavaScript fallback are
unchanged. There is no new gameplay, economic rule, database migration, scheduler,
API endpoint, or frontend dependency.

## Verified original details

- The five labels/order: Home, Quests, Battle, Armory, Recruit.
- Original 30 × 30 normal/selected icons, copied unchanged into
  `public/art/kingdoms-live/`.
- Native bottom-bar black/gray gradient, gray selected fill, green pressed fill,
  5 dp corner reference and white tab captions, from the decoded drawable XML.
- A native 50 dp tab bar. This implementation adapts it to **50 CSS px of tab
  content**, plus a border and the device's bottom safe-area padding. Android dp
  and browser CSS px are not asserted to be identical on every device.
- Castle background for Home/Recruit and default/Land fallback; bridge for
  Quests; skull/battle art for Battle; sword/shield art for Armory. Battle reports
  use the Battle visual state as a replacement-app convention.
- The helmet-eye app emblem and the declared `buildings.png` Land menu icon.

Sixteen original image copies have source paths, SHA-256 hashes and the source APK
hash in `public/art/kingdoms-live/provenance.json`. No artwork was generated,
repainted or upscaled. The old artwork and its existing provenance remain intact.

## Reconstructions and modern adaptations

The original server-delivered HTML/CSS is unavailable. The resource header,
button/panel styles, typography, title/account bar, 560 px maximum PC frame,
background crop behavior, and secondary Land placement are **reconstructions**.
Tab captions use readable 11 px text instead of copying the original 9 dp label.
Safe-area padding, keyboard focus, skip navigation and modern touch sizes are
retained. The narrow resource layout reflows below 380 px; no new stats are added.

Land is visible immediately below the resource header on every signed-in page.
It has its own current-page state and a Back to Home link. None of the five
primary tabs is marked current on Land, matching the original native route-match
behavior for a Land-only URL. Its exact historical entry-link placement remains
unknown. Recruit's original `group.php` reference does not establish that the
prototype's paid militia recruitment was the original social-army implementation.

## Changed file groups

- `views/layout.ejs`: shared shell, header/secondary/primary partials, original
  emblem, background layer and additional stylesheet.
- `views/partials/realm-header.ejs`, `primary-nav.ejs`, `secondary-nav.ejs`: shared
  account controls, five tab states, and Land access.
- `public/kingdoms-live.css`: shared presentation and responsive frame.
- `public/art/kingdoms-live/`: sixteen image copies and separate provenance.
- `src/http-contracts.ts`: display label Army → Recruit and an explanatory
  comment. All screen IDs and HTML/API command routes are unchanged.
- `scripts/check-project.mjs`, `scripts/html-contracts.mjs`, and
  `tests/fixtures/land-form-contracts.json`: interface checks and pre-change
  form-contract regression fixtures.
- `scripts/browser-test.ts`, `tests/integration.test.ts`: assertions for the
  five primary tabs, secondary Land access, active states, backgrounds and tab
  geometry, retaining the original gameplay loop tests.
- This document: scope, evidence, limitations, and Codespace transfer procedure.

All domain services, account/session code, HTTP handlers, Land code, original
gameplay templates/partials, rulesets, database migrations, `public/land.js`,
`package.json` and existing artwork are unchanged. Protected file hashes were
compared against the pre-edit Land snapshot. The Land branch ref is unchanged.

## Verification

| Check | Result |
| --- | --- |
| `npm run check:static` | **48 passed, 0 failed**, with 33 template-subset fixture states. |
| Pre-change form contracts | All 32 original fixture contracts match: POST actions/methods, input names/values/IDs, limits, required/disabled flags and CSRF/command-ID presence. Generated token values and presentation classes/styles are normalized. |
| `npm run test:land:offline` | **12 passed, 0 failed**: hour boundaries, offline catch-up, exact balances, upkeep, invalid configuration and payment phase. |
| `npm run test:land:client` | **6 passed, 0 failed**: countdown, refresh, overlapping requests, reconnect, no-property state and large pending balances. Uses a small DOM/clock harness, not a browser. |
| `npm run build` | Blocked, exit 127: `tsc: not found`. |
| `npm run typecheck` | Blocked, exit 127: `tsc: not found`. Node syntax parsing passed; it is not TypeScript type checking. |
| `npm test` | Blocked, exit 127: `tsx: not found`. |
| Direct Node run of existing `tests/rules.test.ts` | Could not load the suite: `ERR_MODULE_NOT_FOUND` for `dotenv` imported by `src/config.ts`. No rule assertions executed. |
| Dependency installation | The additional-network permission request was interrupted without an install result. `node_modules`, `tsc`, and `tsx` remain absent. No further installation attempts were made. |
| PostgreSQL migrations/integration | Not executed: dependencies are absent and no `TEST_DATABASE_URL` is configured. No database operations were performed. |
| Browser rendering | Static HTML for 33 states was generated outside the application. A headless Chromium attempt failed with exit 134, `FATAL:content/browser/sandbox_host_linux.cc:41 ... shutdown: Operation not permitted (1)`. No browser/device verification or screenshot is claimed. |
| Patch and branch preservation | Binary patch application is checked against a separate Land baseline index; the result must reproduce the visual commit's exact tree. The original Land ref must retain its recorded SHA. |

The offline renderer supports the project's EJS tag subset. It does not replace
production EJS, Fastify, PostgreSQL, real-browser layout, or Android-device tests.
The static checker can run without the APK research directories: source hashes
remain mandatory, while source-byte comparison is additionally performed when
the original extraction is available.

## Apply the exported patch in GitHub Codespaces

Upload `kingdoms-live-visual-overhaul.patch` into `/workspaces/test`. Run commands
from the repository root, **not** from its `knights-reforged` subdirectory. The
patch paths already begin with `knights-reforged/`.

First preserve any unrelated uncommitted work. Start from your completed Land
branch, then create the separate visual branch:

```sh
cd /workspaces/test
git status --short
git switch feature/kingdoms-live-land
git switch -c feature/kingdoms-live-visual-overhaul
git apply --check /workspaces/test/kingdoms-live-visual-overhaul.patch
git apply --index /workspaces/test/kingdoms-live-visual-overhaul.patch
git diff --cached --stat
```

This is a full-index, binary-capable `git diff` patch, intended for `git apply`,
not `git am`. It contains the new images as Git binary patch records, not merely
references to this cloud workspace. It includes only Phase 2 additions/changes;
it does not replay Land migrations or include APK/research files. Git history in
your Codespace may have different commit IDs from the local snapshot: the dry run
checks the actual paths and context. If that dry run fails, stop and inspect the
conflicts rather than forcing an overwrite.

If the visual branch already exists, inspect that branch before reusing it;
do not delete or reset it. If the original Land changes are not present in your
Codespace, apply/verify them first. This patch is an addition to Land, not a full
application archive.

With dependencies available in the Codespace:

```sh
cd /workspaces/test/knights-reforged
npm install
npm run check:static
npm run typecheck
npm test
npm run build
npm run test:land:offline
npm run test:land:client
```

Run `npm run test:postgres` with an explicit `TEST_DATABASE_URL` naming a
disposable local/designated `*_test` PostgreSQL database; the test setup applies
the existing migrations. Do not point it at your live game database. Run
`npm run test:browser` against an already running disposable development realm
with Chromium available, following the existing README/environment instructions.
These tests create test accounts and exercise Land plus the two-player loop.

Review mobile safe areas, the onscreen keyboard, zoom, long names/balances and
desktop scrolling in an actual browser before merging. No automatic merge or
deployment is part of this patch.
