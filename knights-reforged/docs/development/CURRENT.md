# Kingdoms Restored — current authority index

### Pending reviewed security integration — 2026-11-17 UTC

The [two confirmed Medium fixes](../security/2026-11-16-practical-review.md)
for shared authentication attempts (AUTH-01) and recovery-function permissions
(PG-01) have been applied to the current source for exact-head CI review.
The original local review was at commit `6c96115a42336573737edaa925e96b327354c929`.
This candidate is **not a deployed security release**; protected recovery and
production promotion remain separately gated.

## Verified production release — 2026-11-17 UTC

The latest verified live source is `c8222eaac6ee7a2b6392279b13415fadda3d788e`
([PR #97](https://github.com/catillatio/test/pull/97)), deployed through
[protected image release 44016282262](https://github.com/catillatio/test/actions/runs/44016282262). Exact-merge
[application CI](https://github.com/catillatio/test/actions/runs/44000561124)
passed 10/10 and
[Android readiness](https://github.com/catillatio/test/actions/runs/44000561987)
passed 3/3 (not a signed Android release). Image preparation
[44012465228](https://github.com/catillatio/test/actions/runs/44012465228)
published the exact digest pinned on Railway. Live game deployment is
`bdd050bb-4b7c-49b7-9870-fd08e77c16d6`, image
`sha256:51c8d045d1dc643d4f00d0d5a81856ad2a79681a2e6dac9a7596afd23b869f`.

Protected backup, independent restore, retained encrypted recovery, all three
complete cryptographic snapshots, migration/replay comparisons and health checks
passed. The real Railway checker completed in **217.011 seconds** against its
unchanged 600-second limit. This releases the PR #96 NPC sponsorship target
correction and the reviewed achievement/recovery performance source; optional
feature activation, live gameplay behavior and real-user latency improvement
have not independently been confirmed. The separate security branch is not
included. Failed recovery run 43831109552 remains **UNVERIFIED**; do not clean
up or reuse its copy.

See the [full immutable release evidence](../release-upload/PRODUCTION_RELEASE_20261117.md).
All lower sections are dated historical handoffs, not the latest deployed image.

Historical 2026-11-13 handoff: reconcile PR #88 with then-deployed production `c8247df`.
See [Play readiness](../google-play/PLAY_STORE_READINESS.md). Production erasure,
NPC creation, signing, and PR #88 merge/deployment remain owner-gated. Prior
A/B/D policy approvals stand; C remains conditional. The owner-authorized
Kingdoms Restored rebrand is a separate review change; internal identifiers stay
unchanged. See [current rebrand review](../google-play/REBRAND_REVIEW.md).

2026-11-13: [Release 103 preflight correction](../release-image-preflight-103/README.md)
was merged in [PR #93](https://github.com/catillatio/test/pull/93), including the
notification snapshot test correction. Protected release
[43511938434](https://github.com/catillatio/test/actions/runs/43511938434) succeeded
at `c8247dfa891c9f2c0458ff7df523f09fa24f0cfa`; the game is on the exact prepared
image. This reconciliation preserves those changes and all Play-specific tests.
Source integration is not authorization to activate erasure or merge PR #88.

Small continuation of reviewed `56fbd34`: [silhouette readability, compact Battle
markers and synchronized unread controls](../finishing-pass/README.md), local only.

Latest bounded follow-up: [local Profile silhouettes, class labels, charcoal
comments and notification delivery](../focused-followup-20261112/README.md).
Read-only observation on November 12, 2026 confirmed production merge `062f70c`
and successful protected release 43113551849. The historical snapshots below
remain dated records. This new follow-up is local only; NPC sponsorship remains
off and matchmaking is frozen byte-for-byte.

Reviewed 2026-11-05. This is a navigation map, not deployment authorization.
Verify current origin/HEAD, open PRs and provider state when starting a task;
the references below are a dated snapshot, not permanently pinned task bases.

## Identity and release state (historical 2026-11-05 snapshot; see current state above)

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
- The historical 2026-11-05 SQL source head was `026_living_competition.sql`.
  The 2026-11-17 release contains migration `055_achievement_gold_lookup.sql`.
  This index is not a direct query of live database data or permissions.
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
Equipment/property thumbnails and gameplay are unchanged. That historic source update was distinct from deployment; the newer verified
production image is now recorded at the top of this index.

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

## Local owner review — 2026-11-11

The [complete clean rebuild](../complete-rebuild-20261111/README.md) starts from
release source `d6a0c831ade5f0f7265f565906f6e4cf94330fcd`, preserving the
merged Dark Medieval presentation and owner-runtime telemetry. It implements the
sixteen-item request in an isolated local branch. New local schema head is
`052_npc_sponsorship.sql`; this is **not** an observation or change of production.
Achievement payouts and NPC sponsorship are disabled by default, Crowns commerce
is hard-disabled, and NPC adjustment/generation is limited to disposable local
fixtures. Source, tests, artwork provenance and review/activation boundaries are
linked there. PR #88 remains separate. No hosted CI, push, merge or deployment
is authorized by this local work.

### Focused correction of owner-reviewed 536fb2d

The [focused correction](../focused-correction-20261111/README.md) improves the
funded local NPC planner, adds independent nonzero-XP pagination proof and
finishes Crowns presentation. The 144 legacy NPCs among 164 at levels 15–30
remain hard-capped at ten: this is an explicit policy blocker, not completed
large-army scaling. No army/XP/combat formula, class portrait, live setting or
activation flag is changed. Final-head focused evidence is in its review bundle.

PR88 internal-testing integration: current deployed98756a0 merged into the existing
draft source without rewriting its history. Play additions use migrations053/054,
all33 deployed migrations and XP matcher preserved. A/B/D approved; C conditional.
Private erasure journal relay and actual protected release-window verification are
prepared, not installed; Android upload signing environments/keys remain owner-only.
See [current handoff](../google-play/PLAY_STORE_READINESS.md); no deployment/activation.

## Historical local request-latency correction — 2026-11-16 (subsequently deployed)

The [measured correction](../performance/2026-11-16/README.md) batches exact
achievement-receipt verification and adds selective lookup index migration 055.
It starts at release `dbdd96e`, preserving its bounty changes; deployed `59f6f75`
has the same affected runtime modules. Matched local PostgreSQL/HTTP fixtures
improve latency without changing rewards or balances. Live SQL/wait measurements
are pending the one bounded read-only Console packet; no claim of a deployed fix.
Privacy-history release guards remain effective after 054, and exact head 055 is
required. Security and recovery-investigation branches remain separate; required
CI, recovery verification, merge and deployment are owner-gated and not executed.

## Historical local recovery-budget correction — 2026-11-16 (subsequently deployed)

The [restored-fixture correction](../release-upload/recovery-budget-20261116/README.md)
continues reviewed achievement source `cd1fc8e` without editing gameplay modules.
It keeps full-row cryptography, every table and three complete snapshots while
using sequential full-result planning and streaming. Four controlled fresh
restores measured 168.6–174.4s baseline versus 94.1–94.7s candidate, including
actual migration/replay. Migration 055 now refuses conflicting writers and has
ten-second statement and fifteen-second whole-transaction bounds, preserving
stricter existing deadlines. A fifth fresh restore validates the final guard
and full checker in 96.3s. Run 43831109552's copy remains unverified and untouched.
Security work and PR #95 remain separate. Required exact-head CI and protected
production promotion are still pending separate owner authorization.
