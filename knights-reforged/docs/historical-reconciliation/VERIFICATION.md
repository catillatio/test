# Verification, preservation and reproduction

Baseline `e9165c34ef8ddaba4e04488438ba110cc2020376`. Tests use a newly initialized local PostgreSQL cluster bound to 127.0.0.1 and a disposable `*_test` database. No production credentials, SQL, Railway service, recovery copy, registrar operation or protected workflow is used. New test files are added to the existing CI manifest; workflow logic and required checks are unchanged.

## Focused regression and existing coverage

`historical-priority.test.ts` has eight tests: three pure research/rendering guards and five PostgreSQL scenarios. They cover every property definition's metadata/art, legacy unknown property fallback, all legacy/expanded/presented equipment sources, candidate boundaries, cross-level quotes/profile links/confirmation/commands, both directions and equal levels, level 5↔100, missing/self/novice/disabled/ally targets, affordability/escrow rollback, concurrent sponsors and command replay. Real loss→loss→loss→win, concurrent final rewarded wins, exact rolling boundary, legacy rewarded-loss records, immutable history and subsequent reward exhaustion are included.

The earlier focused run of `historical-priority`, `bounties`, `phase6-combat`, `phase47-core` passed **30/30**, no skips (before the additional offline research test brought the new file to eight tests). Existing bounty tests cover non-finishing hits, losing finishing claims, simultaneous finishing attacks, same-command retries, sponsor exclusion, enabled ally hunts, bot restrictions, one-active-listing, target rolling quota, expiry/cancel/refund and immediate relisting. These mechanics were not rewritten.

The broader direct Windows PostgreSQL run covered `historical-priority`, `phase43-economy`, `phase47-economy`, `phase5-bot-combat`, `phase5-bot-economy`, `phase51c-interface`, `phase6-preservation`, `level100-e2b-preservation`, `community-combat`, `pvp-economy`: **49 tests, 47 passed, 2 failed, 0 skipped**. Both failures are in unchanged tests:

* `phase5-bot-combat`: its crash/restart fixture expects POSIX `SIGKILL` child termination; Windows reports a different child-process termination result, so the validation predicate fails. Earlier duel simulation, scheduling and default-OFF tests pass. The Linux CI lane remains required for this actual crash assertion.
* `phase51c-interface`: one existing EJS escape test constructs a filesystem path from `new URL(...).pathname`, producing `C:\C:\...` on Windows and ENOENT. The actual HTTP rendering and shared EJS tests pass. No escaping assertion is removed; Linux CI runs it normally.

A first attempt to use the repository's detached multi-process database runner on Windows produced `3221225786` (control-C exit) for several nested Node test workers. The direct serial invocation above avoids that runner platform issue. The runner itself is not changed. Its Linux isolated-database lanes remain required.

An initial full unit attempt discovered Windows symlink `EPERM`, POSIX shell/child-signal assumptions, two explicit platform skips and local checkout line-ending differences in integrity-verified source files. It completed 53 files/702 tests (585 pass, 115 fail, 2 skip) **before** correction of the local checkout and a build prerequisite. This is recorded as a failed attempt, not final readiness. Exact Git bytes were restored for unchanged files, without changing asset manifests or expected hashes. The affected portable asset/audition/expansion-operator/E1 tests were rerun: **16/16 passed**. The existing artwork-mapping guard was updated to compare the exact original inner markup inside the new shared frame; all old pixel mappings and frozen Land assertions remain.

The direct portable gameplay unit selection (15 source/model/rule suites) passes **66/66**, with zero failures/skips. The three real-browser suites (`historical-priority`, `phase51c-browser`, `phase6-browser`) pass **3/3**, with zero skips; these include actual bulk purchases, no-script submissions, hover/focus/touch and competition flows.

`npm run typecheck` and `npm run build` pass. `npm run check:static`: **99 passed / 0 failed**, including 77 production EJS fixtures. Final exact-commit GitHub CI status and aggregate counts are recorded in the draft PR after completion. A local Windows failure is not silently reclassified as a pass.

## Browser evidence

The new `historical-priority-browser` test uses the real local Fastify/EJS routes, ordinary purchase functions and saved battle reports. A synthetic expanded fixture supplies paid inventory and properties; it does not activate any live policy. A second detached checkout at the exact baseline runs the same fixture with `--before`. No DOM image substitution or renderer policy injection is used.

Each stage checks **50 views**: ten views at 320×900 DPR1, 390×900 DPR2, 430×900 DPR3, 1280×900 DPR1, plus 320×900 DPR2 with root text size 125%. Views: Armory Weapons/Armor/Spells, owned profile inventory, profile Land, public equipment, Land catalog, bulk buy/sell, purchase receipt, saved battle equipment. Both before and after runs pass their baseline/patched expectations. DPR/font changes are emulations, not a physical Android-device claim. Root font scaling does not imply every fixed-pixel font scales like Android accessibility settings.

After assertions verify square frames with a single 1px outer border and zero inner border, consistent size within each context, proportional `contain` on images, correct Marcher approved URL, no broken catalog image, no horizontal overflow, five navigation links, quantities below centered images and no Bulk target overlapping art. Browser scripts produce no JS errors. Wallets, holdings, acquisition rows, receipts, saved battles and activation rows are snapshotted across warmed views; the snapshot stays unchanged. No purchase/claim is triggered just by viewing images.

Representative unmodified captures are committed in [screenshots](screenshots/): before/after 390 inventory, 390 Land contributions, 320 Armor, and 1280 battle. Verification JSON records every tested view. Additional captures are generated by `--evidence` and retained in local test results; they need not inflate the repository. Source-image inspections and frozen artwork/atlas checks supplement screenshot review.

Native Chrome for Testing could not launch on this Windows installation because of an OS side-by-side configuration error. The downloaded Chromium headless-shell executable worked and produced the recorded actual browser captures. This is browser evidence, not a fallback DOM-only claim.

## Run

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run typecheck
npm run check:static
# Configure TEST_DATABASE_URL to a LOCAL/DESIGNATED disposable *_test database.
# Configure BROWSER_EXECUTABLE to the installed Chromium executable.
node --import tsx --test --test-concurrency=1 tests/historical-priority.test.ts tests/bounties.test.ts tests/phase6-combat.test.ts tests/phase47-core.test.ts
node --import tsx scripts/browser-historical-priority.ts --evidence
node --import tsx scripts/historical-xp-study.ts
# Linux CI/full local supported environment:
node scripts/ci/run-tests.mjs --profile=full
```

To compare baseline screenshots, copy only the new browser fixture script into an isolated checkout at the pinned baseline, install the same lockfile dependencies, then run it there with `--before --evidence`. Test fixture code is not a runtime activation mechanism. Unit/browser regression changes do not bypass protected release or recovery gates.

The broad XP matrix is deterministic exhaustive enumeration. A gzip JSON contains all 16,080 distributions, with seeds unnecessary for the 441 roll pairs; all assumptions, weak/strong target groups, repeat tiers, denominator definitions and local pacing limits are in the XP report. The original 78.323417% fixture is asserted exactly. Numerical alternatives remain offline research only.

## Initial Linux browser finding and correction

The first exact-head run at `ff3d21e4b37be55433ba62814580664e1622cd25` passed all 746 unit tests, all three PostgreSQL shards, the new browser test and encrypted recovery. Five existing artwork browser fixtures still asserted `object-fit:cover` for equipment. That expectation conflicts with the new explicitly requested square frame / silhouette-preserving contain treatment. Their expectations now distinguish framed equipment (`contain`, mandatory frame, square rendered geometry) from Land (`cover`, existing landscape behavior). Exact source URLs, dimensions, names, quantities, manifests, historical mappings, pixel/crop tests, row preservation and all other assertions remain. This is an intentional presentation expectation update, not a removed check. Final CI must run the complete suites again on the follow-up commit.
