> Archived 100% XP proposal at c1e7e78. Current 65% policy: [XP review](XP_BALANCE_REVIEW.md). Links below point to the original c1e7e78 evidence.

# Phase 4.9 — Bot combat rewards, development review

Branch: `feature/kingdom-come-phase-4-9-bot-combat-rewards`.
Base: Phase 4.8 production source `b305fa011d9428b7e00e68a7cc38026e0bcdb256`.
Policy: **`bot-combat-rewards-1`**. The **40% repeat floor is provisional**.

This is an implementation for owner gameplay testing, not a production-promotion recommendation. No Railway service, live account, live database, production setting, key or release workflow was accessed or changed. No merge or deployment was performed.

## Implemented behavior

- Bot victories no longer share a six-win rolling daily allowance.
- The one-rewarded-victory-per-bot cutoff is removed.
- This ordered attacker–bot pair's victories use **100%, 85%, 70%, 55%, then 40%** for both ordinary gold and XP.
- The existing persistent fixed 24-hour pair window is reused. It resets at its original start plus 24 hours, not 24 hours after the latest attack. Existing sequence counts are retained; rollout does not reset them.
- Losses, rejected commands and replayed receipts do not advance the sequence. Successful zero-loot victories do advance it.
- Different opponents start their own sequences, independent of the player's other bot battles. A different account has its own pair sequence but competes for the **same actual bot Health and purse**.
- No bot starting wealth, inventory, army, Land, income rate, reserve grant, Vault transfer, base XP, combat damage, Calling, recovery rate or character-level curve was increased.
- Human-versus-human reward calculations, repeat percentages and existing XP budgets remain unchanged. Bounty eligibility, escrow, fees, claim authorization, payouts and Kill/Death accounting remain unchanged.

## Exact formulas and rounding

Let `W` be the defender's actual spendable purse **after ordinary due income/upkeep settlement**, `D` its level, and `n` the victory count in this pair's existing fixed window.

```text
B = min(15,000, floor(3 × W / 100))
K = min(3,000, 50 + floor(125 × min(D, 50)² / 100))
F(n) = 100, 85, 70, 55, 40, 40, ... percent

ordinary bot gold = floor(min(B, K) × F(n) / 100)
full XP = existing victoryExperience47(..., fullReward=true, actual powers)
bot XP = max(1, floor(full XP × F(n) / 100))
```

The bot per-battle ceiling is applied **before** the new repeat percentage. This follows the approved investigation proposal and means a rich capped bot's repeated reward also decreases. Both awards floor to whole numbers. The existing victory minimum remains 1 XP; a much weaker opponent never gains extra XP because its presentation says “Decisive Victory.”

The full-XP calculation is unchanged:

```text
Q(L) = T[L] − T[L−1] for levels 1–9
Q(L) = 200 + 45 × (L−10) for L >= 10
T = [0,12,30,60,105,165,245,350,485,650]

P(A) = 5 for attacker level A <= 10
P(A) = 5 + 0.5 × (A−10) for A = 11–16
P(A) = min(12, 9 + 0.375 × (A−17)) for A >= 17

Base = max(1, min(300, ceil(Q(A) × P(A) / 100)))
LevelFactor = clamp(25,150,100 + 10 × (D−A))
r = defender pre-roll Defense / max(1, attacker pre-roll Attack)
StrengthFactor = clamp(50,125,floor(100 × r))

If r < 0.35: full XP = 1
Otherwise: full XP = max(1,floor(Base × LevelFactor × StrengthFactor / 10,000))
```

Existing accumulated-XP storage bounds remain authoritative; receipts display the amount actually granted. Character levels remain uncapped. Bot content remains at its existing assigned levels 1–50.

## Before/after examples

These are synthetic arithmetic examples using existing seasoned variant-0 catalog purses. “Matched” means equal relevant pre-roll powers and levels; it is not a guarantee of victory, nor a claim about live bot balances.

| Level | Catalog exposed gold | XP to next level | Current first gold / XP | Old new-opponent reward after six wins | New new-opponent reward after six wins |
|---|---:|---:|---:|---:|---:|
| 8 | 3,762 | 135 | 112 / 7 | 0 / 1 | 112 / 7 |
| 17 | 5,946 | 515 | 178 / 47 | 0 / 1 | 178 / 47 |
| 25 | 20,428 | 875 | 612 / 105 | 0 / 1 | 612 / 105 |
| 40 | 75,696 | 1,550 | 2,050 / 186 | 0 / 1 | 2,050 / 186 |
| 50 | 113,440 | 2,000 | 3,000 / 240 | 0 / 1 | 3,000 / 240 |

A repeated matched level-17 opponent, starting at 5,946 gold, without intervening income:

| Victory | Old gold / XP | New gold / XP | New remaining defender gold |
|---|---:|---:|---:|
| 1 | 178 / 47 | 178 / 47 | 5,768 |
| 2 | 0 / 1 | 147 / 39 | 5,621 |
| 3 | 0 / 1 | 117 / 32 | 5,504 |
| 4 | 0 / 1 | 90 / 25 | 5,414 |
| 5 | 0 / 1 | 64 / 18 | 5,350 |
| 6 | 0 / 1 | 64 / 18 | 5,286 |

Actual PostgreSQL/HTTP fixture examples use physical inventories, automatic equipment selection and real combat rolls:

- Level 25 versus a level-29 bot: purse **12,198 → 11,833**, **365 gold / 73 XP** on the first win. The second win transfers **300 gold / 62 XP**, leaving **11,533**. The old second-win result was **0 gold / 1 XP** despite the funded purse.
- Two different accounts attacking the same 1,000-gold purse serialize transfers of **30 then 29**, leaving **941**. Same-key concurrent retries create one battle, XP award, Spirit charge and transfer.
- A matched bot with an explicitly empty disposable-fixture purse pays **zero gold while still awarding difficulty-based XP**. Neither Vault savings nor maintenance reserves fund loot.
- A nontrivial win can level the attacker and refill their resources normally. A defender reduced to 0 Health remains defeated; the refill does not permit attacking that defender again before recovery.
- Forged `gold`, `xp` or `multiplier` request fields do not control awards. The server recomputes from its saved state.

## Battle feedback

Receipts store the policy ID, the actual pair multiplier, full pre-repeat awards, actual awards, and independent reduction reasons. New reports and action feedback use concise explanations:

- **“Reduced rewards from repeated battles with this rival.”**
- **“Less experience against a much weaker opponent.”**
- **“This rival had too little unprotected gold to steal.”**

Repeat and low-strength reasons may both apply. A fresh low-strength victory is not described as repeated farming. New bot defeats do not incorrectly show the repeat warning. Where historical/human reports actually recorded low-strength evidence, that explanation is also available; historical values and records are never recomputed from current inventory. No formulas, percentages, counters, policy IDs or database identifiers are printed in battle results.

The Battle disclosure and public Rules text now describe the new policy; the obsolete six-win/one-per-bot instructions have been removed. Human gold rules remain separately documented with their original percentages.

## Paced progression and sustained farming

Run **`npm run balance:phase49`** from the application directory. This command makes no network or database connection, performs no provisioning, and writes [the reproducible results](paced-simulations.json).

The **66 scenarios** include:

- Before/after 24-hour solo varied-target and same-target play at levels 8, 17, 25, 40 and 50.
- Ten-account 24-hour varied-target and shared-same-target pressure at levels 17 and 50.
- A six-hour ten-account same-bot burst case, deciding every six seconds with an affordable 10-Spirit allocation.
- Established ten-member inventories at levels 8, 17 and 50.
- Five deterministic seeds each for six-hour before/after varied play at levels 8, 17 and 50.

The simulator uses the actual combat rolls/damage helper, automatic equipment selection, level/Calling/training calculations, normal rivalry range, Spirit and Health recovery, zero-Health target blocking, difficulty XP, integer progression, level-up Health/Spirit refills, affordable gold healing, maintenance and saved hourly bot property rates. Bots remain at their assigned levels. Gear, army and training do not improve automatically as simulated players level up.

Synthetic humans start with legal owned gear, 5,000 spendable gold **after** its purchase and one paid upkeep hour; no human Land income or quests. Initial skill allocations are checked against actual level entitlements. Every account competes for shared finite bot Health and wallets. All scenarios reconcile total purse + prepaid reserve + retained gold against initial balances + real property payments − actual upkeep − paid healing. Loot is an internal transfer; Vault is unchanged.

The selector prefers fresh, reasonably matched targets using model-known power. This is an active, knowledgeable target-selection strategy, not ordinary telemetry or a guaranteed rate. Decisions occur every 30 seconds, or six seconds for the burst scenario. Accounts run in deterministic serial order; this models contention, not scheduling fairness. PostgreSQL tests independently cover real concurrent transactions.

### Representative 24-hour varied-target solo results

Natural fixed starting inventories; healing enabled. Levels can exceed 50 under the existing architecture.

| Start level | Old wins / losses | New wins / losses | Old gold | New gold | Old final level | New final level |
|---|---:|---:|---:|---:|---:|---:|
| 8 | 786 / 27 | 491 / 337 | 692 | 45,437 | 12 | 18 |
| 17 | 680 / 125 | 569 / 304 | 1,450 | 368,726 | 18 | 44 |
| 25 | 397 / 211 | 446 / 411 | 3,959 | 409,014 | 26 | 46 |
| 40 | 298 / 228 | 783 / 61 | 8,842 | 972,949 | 40 | 56 |
| 50 | 694 / 69 | 752 / 77 | 17,206 | 1,034,711 | 50 | 60 |

These are transferred gold totals **before** the player's upkeep and healing expenditure. Different progression changes future opponents, payouts, combat difficulty and resource refills, so before/after win counts need not match. They are not static-wallet arithmetic or 24 hours of guaranteed victories.

**Balance issue for owner review:** sustained six-hour varied play starting at 17 ended at **34–35 across five seeds**, versus 17 under the old cutoff. The new single-seed six-hour case includes 204 wins, actual losses, 18 level-ups and 54 Spirit restored by those level-ups. The retained full-XP curve was designed to award meaningful fractions of a level; removing the quota exposes that pace. The implementation does not secretly lower base XP or change the approved 40% floor. The floor and overall active-play pacing need alpha review before any production decision.

Sustained same-bot play does not give ten accounts ten independent copies of its income or purse. The level-17 ten-account burst scenario completes **125 victories in six hours** for **7,480 gold / 2,575 XP in aggregate**, with repeated zero-Health blocking. Some accounts receive no encounters because the fixed serial order is deliberately competitive. Resource refills do not revive the bot. Same-bot solo characters eventually outlevel their fixed target and must select another legal rival.

There is no instant refill. The unchanged catalog's 450 bots generate about **3.28 million fully funded net gold/hour collectively**. Removing the old cutoff makes more of that existing wealth available to players, without adding a new currency source. Increasing bot wealth or Land income simultaneously would confound balance and is intentionally excluded. The model does not prove resistance to every coordinated account or automated-player strategy; it demonstrates exact finite-wallet transfers and the existing combat/resource constraints.

## Preservation, migration and rollback compatibility

- **No SQL schema migration and no data backfill.** The existing controlled migration function registers one new immutable ruleset row. Its normal replay checks remain in force.
- No existing ruleset JSON was edited. Startup refuses a missing/mismatched installed definition. A future change to the provisional floor must use another version; do not overwrite this definition.
- The populated synthetic Phase 4.8 fixture has **66 tables, 452 accounts and all 450 bots**. Upgrade and migration replay retain all existing business rows, including passwords, sessions, balances, Vault, inventories/lots, Land, army, bounties, achievements, tutorial, financial journals, pair counters and battle history.
- A historical exhausted-budget `0 gold / 1 XP` receipt replays its original result exactly under the new build. It is not repriced or granted an adjustment. Existing pair counts, even those from formerly unrewarded victories, continue in their original window.
- Application reconstruction accepts the saved session and retains preferences. Ordinary deployment must never run initialization, account reset, bot provisioning, seeds or any endowment.
- Older code can coexist with the additional ruleset row; no destructive down migration is required. Reverting code would restore its old reward cutoffs for future commands, not undo newer legitimate rewards. Never reverse player balances or delete newer history as a rollback shortcut.
- All production release/recovery files, workflow gates, encrypted backup/restore verification, signing, migration approval, deployment configuration, authentication and session code remain unchanged.

This is a **synthetic populated preservation test**, not an audit or restore of the live Railway database. An eventual release must still use the established protected process, its fresh backup and independent restored-copy checks, exact-commit CI and owner approval. Nothing in this branch authorizes a production operation.

## Verification

- **Full automated suite:** 441 tests discovered; **440 passed, 0 failed, 1 skipped** locally. The existing skipped test exercises a real GitHub-hosted network namespace and needs that runner; it is not disabled or weakened by this branch.
- **Targeted suite:** 31 core/PostgreSQL regressions passed, including actual transfers, concurrency, human rules, bounties and populated preservation. New focused reward and simulation tests also pass.
- **TypeScript and production build:** passed.
- **Static/template checks:** **96 passed, 0 failed**, including **75 production EJS render fixtures**, actual helper wiring, asset provenance and escaped content.
- **Paced simulations:** **66 deterministic scenarios**; all financial-conservation and protected-Vault assertions passed, including losses, regeneration, paid healing, upkeep and level-up refills.
- **Browser:** **9 real receipt views at 320/390/430px**, plus **6 existing marketplace/idle/recovery checks**, passed. No page errors or horizontal overflow in the new report views.
- **Dependency audit:** game and unchanged release controller each report **zero known production vulnerabilities**.
- **Scope audit:** authentication, finance/settlement, existing catalogs, runtime artwork/audio, SQL migrations, lockfile and every release/deployment/workflow file remain unchanged. Only one new immutable bot policy is registered.

[Machine-readable verification](https://github.com/catillatio/test/blob/c1e7e787e5f3e1a604b620680ccef60089b7ef3e/knights-reforged/docs/phase49/verification.json) records the scope, checks and limitations. Hosted CI is reported on the review PR; this document does not claim physical-device or production verification.

The first complete local run found a pre-existing test assumption: concurrent bot-income workers can report 475 **processed row visits** for 450 bots because a query can acquire a just-released character with an older joined income snapshot. That is not a distinct-payment count. The test now verifies one durable 72-hour settlement per holding, every bot's exact wallet-plus-reserve change, no duplicate subsequent payment and unchanged human/Vault state. **Worker, income and bot-finance runtime code are byte-identical to Phase 4.8.** This strengthens the financial proof rather than suppressing an overpayment assertion.

Reproduction, using an explicitly disposable local `*_test` PostgreSQL database:

```sh
npm run typecheck
npm run build
npm run check:static
TEST_DATABASE_URL='<local disposable *_test URL>' npm test
npm run balance:phase49
TEST_DATABASE_URL='<local disposable *_test URL>' npx tsx scripts/browser-phase49-test.ts
TEST_DATABASE_URL='<local disposable *_test URL>' npm run test:browser:phase48
```

Do not supply a Railway or live connection. The test helper rejects undesignated remote/non-test databases; preservation and browser fixtures use isolated disposable schemas. The simulation needs no database variable.

Mobile screenshots use actual saved synthetic battle receipts, with unchanged Phase 4.8 styling: [repeat reduction](https://github.com/catillatio/test/blob/c1e7e787e5f3e1a604b620680ccef60089b7ef3e/knights-reforged/docs/phase49/screenshots/390-repeat.png), [low-strength XP](https://github.com/catillatio/test/blob/c1e7e787e5f3e1a604b620680ccef60089b7ef3e/knights-reforged/docs/phase49/screenshots/390-weak.png), [empty purse](https://github.com/catillatio/test/blob/c1e7e787e5f3e1a604b620680ccef60089b7ef3e/knights-reforged/docs/phase49/screenshots/390-empty.png). All three are captured at 320, 390 and 430 pixels in [the screenshot directory](https://github.com/catillatio/test/tree/c1e7e787e5f3e1a604b620680ccef60089b7ef3e/knights-reforged/docs/phase49/screenshots). Chromium responsive checks are not physical iPhone Safari or Android device certification.

## Requirement checklist

| Requirement | Implementation / evidence |
|---|---|
| 1. Remove shared six-win bot restriction | No bot daily-budget query; more than six distinct meaningful rivals tested. |
| 2. Remove one-win-per-bot cutoff | Same-pair victories remain eligible; repeat awards stay wallet-funded. |
| 3. 100/85/70/55/40 schedule, fixed window | Immutable bot policy; original persisted sequence; exact-boundary, rename and replay tests. |
| 4. Gold and XP reductions | Separate integer awards after existing full amounts, with the existing 1-XP minimum. |
| 5. Preserve exposed gold, ceilings, Vault, difficulty and transfers | Imported unchanged base functions; ledger, protected-balance and concurrency tests. |
| 6. Preserve humans, bounties, idempotency and history | Human path unchanged; separate bounty claims/loot, 50 claims, historical receipt and row-digest tests. |
| 7. No bot wealth, Land or base-XP increases | Existing catalogs and finance/settlement runtime byte-identical. |
| 8. Accurate battle explanations | Independent repeat / low-strength / poor-purse notes; actual receipt and mobile tests; obsolete quota copy removed. |
| 9. Regressions, preservation and paced simulations | Full test evidence below, populated 66-table fixture, actual resource/combat helpers. |
| 10. Multi-account and sustained farming | Shared-target/varied-target and burst cases, losses, Health, Spirit, paid healing, level-up refills, finite shared balances. |

**Review status:** implemented on the development branch; **40% floor and paced progression awaiting owner gameplay review**. No merge, deployment, production database access or release-infrastructure change.
