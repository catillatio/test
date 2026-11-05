# Kingdom Come — current authority index

Reviewed 2026-11-05. This is a navigation map, not deployment authorization.
Verify current origin/HEAD, open PRs and provider state when starting a task;
the references below are a dated snapshot, not permanently pinned task bases.

## Identity and release state

- Repository: [`catillatio/test`](https://github.com/catillatio/test), default
  branch `release/production`. `catillatio/kingdom-come` is not the verified repo.
- Reviewed release source: `90f10dbcb19dee74d9663a64c8bb96035a8200dd`, merged
  [PR #84](https://github.com/catillatio/test/pull/84), progressive bot loot.
  [Exact push CI](https://github.com/catillatio/test/actions/runs/41801207230)
  passed. The protected release ran separately; Railway inventory showed the
  game on digest-pinned image `sha256:3389191a89c5b4d3ff7129677520f7f0d365d2946f892d7f4645903ebdd7d280`.
  Source, deployed image and policy activation are separate facts; recheck them
  for operational work. A documentation merge does not update that live image.
- Railway: project `merry-patience`
  (`41a664f1-06bb-492e-90ef-cfd9635fc67f`), environment `production`
  (`8ced8aef-352e-4ea9-931d-8963ff352c1c`), game service `test`
  (`47a56e8e-aa72-40df-a5c4-0e5feb0f5cdd`). Separate recovery-copy,
  verification and retention services exist. Do not infer enabled cleanup from
  a successful service deployment.
- SQL source head is `026_living_competition.sql`. This is not a fresh query of
  production schema or data. No database credentials belong in this index.
- [PR #63](https://github.com/catillatio/test/pull/63), bounded XP-cliff changes,
  remains unmerged. Do not describe its migration 027 or extra-XP allowance as
  released behavior. Other open historical/operator/Android proposals likewise
  need their own scope and current status check.

## Approved interface release

The owner approved the final Dark Medieval real-app gallery on 2026-11-05 and
explicitly authorized merge and the existing protected release. The approved
[design and browser evidence](../dark-medieval-release/README.md) cover the compact
full-width HUD, route-specific environmental scenery, neutral player links,
clean catalog/rival surfaces, static rewards and framed Recent Activity.
Equipment/property thumbnails and gameplay are unchanged. This source update
alone is not evidence of deployment: the preceding digest above remains the
last observed production image until a new protected release succeeds.

## Architecture: open only the affected path

All paths below are relative to `knights-reforged/`.

| Concern | Entry points and existing authority |
| --- | --- |
| Startup / HTTP | `deployment/start.mjs`, `src/server.ts`, `src/app.ts`, `src/http-contracts.ts` |
| State changes / persistence | `src/commands.ts`, `src/db.ts`, `src/migrate.ts`, `migrations/`; command idempotency, character/advisory locks, ledgers and retained overflow matter |
| Runtime rules / progression | `src/realm-policy.ts`, `src/progression-policy.ts`, `src/compatibility-rules.ts`, immutable `rulesets/`; epochs preserve saved entitlements |
| Combat / economy | `src/combat.ts`, `src/human-pvp-loot.ts`, `src/bot-combat-rules.ts`, `src/bot-loot.ts`, `src/economy.ts`, `src/bounties.ts`, `src/land.ts` |
| UI / artwork | `views/layout.ejs`, `public/realm-iron-brass.css`, artwork resolver modules and registries; [artwork requirements](../ARTWORK_REQUIREMENTS.md), [Iron & Brass coverage](../home-iron-brass/SCREEN_COVERAGE.md) |
| Tests / CI | `scripts/ci/plan.mjs`, `scripts/ci/test-manifest.json`, `scripts/ci/run-tests.mjs`; [CI design](../ci-performance/README.md), [measured limits](../ci-performance/BENCHMARKS.md) |
| Deployment / recovery | repository `.github/workflows/production-release.yml`, `deployment/release/`, [release upload guidance](../release-upload/README.md); protected exact-source/image, backup, independent restore and preservation gates remain authoritative |

Current ordinary bot gold uses immutable `bot-combat-rewards-3`: exact integer
3% exposed-wallet base, logarithmic scaling above 20,000, then existing pair
reductions. Bot XP retains 65% scaling. Human loot has its own policy. Start with
[bot-loot release notes](../bot-loot/RELEASE.md) and
[economic sensitivity](../bot-loot/ECONOMIC_SIMULATION.md), then trace the caller;
do not substitute a historical capped helper or Crime's formula.

## Authority and verification

Development process: [Stage 2 workflow](WORKFLOWS.md) defines the per-task
Sol Medium/Standard default, effort escalation, focused local verification and
[ten-task usage pilot](usage-pilot/README.md). It does not change runtime or CI.

The current explicit owner task defines authorized actions. Current selected
runtime code/definitions determine behavior; provider observations determine
operational state; approved decisions determine intent. Old phase reports are
historical evidence, not permission to activate a feature or replay provisioning.

[The expansion master plan](../../LEVEL100_EXPANSION_MASTER_PLAN.md) explains
staging and compatibility decisions; later implemented source supersedes its
old status statements. The application README retains older milestone notes.
Its references to Phase 4.6/4.7, old catalogs and old caps are not a current
deployment checklist. Crime's original master plan in source PR #80 is historical
design context for that separate game and must not become Kingdom runtime work.

CI already has conservative art/UI/gameplay/full profiles, isolated fixtures,
database/browser lanes and a fail-closed aggregate. Unknown paths, including
documentation, currently classify full. Use focused local checks for iteration;
required final CI and exact release-branch push checks are unchanged. Do not
weaken gates, raise tolerances or reuse another SHA's results for a new candidate.

At handoff record objective, repo/base/head, dirty work, changed paths, actual
commands/results, pending gates and next action. Keep credentials and production
data out. Refresh only affected rows here, with dated source/run links; preserve
historical records rather than rewriting them.

## Android / Google Play candidate (2026-11-05)

Isolated readiness work reconciles PR20 with the approved Dark Medieval release. Start with [readiness matrix](../google-play/PLAY_STORE_READINESS.md) and [Android build/signing guide](../../../android/PLAY_RELEASE.md). Legal text is explicitly draft; deletion requests do not assert completed erasure. No Play submission, production compliance deployment, final package/signing identity or physical-device certification is implied.
