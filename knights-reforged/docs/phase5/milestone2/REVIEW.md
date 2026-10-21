# Milestone 2 — owner review

Implements [owner authorization 6320554228](https://github.com/catillatio/test/pull/16#issuecomment-6320554228) on draft PR #16. **Development only; both autonomous features remain default OFF.** No production access, activation, merge, deployment, Railway/release configuration changes or PR #13 work.

## Implementation and controls

The existing normal-battle transaction body is extracted into `src/combat.ts`, used by both human commands and the server-only bot-duel wrapper. Direct comparison with `671c4b0` confirms the human resolution body is unchanged apart from an empty optional duel marker and a bounty-claim exclusion that applies only to autonomous mode. Human authentication, receipts, combat, army participation, equipment, rewards, progression and result presentation remain unchanged.

`src/bot-combat.ts` verifies two distinct existing active registered bots with login-disabled accounts. It rechecks their character/account mappings, level eligibility and pressure under sorted character/registry/account locks. Humans, missing/inactive identities, changed mappings and busy pairs fail closed. No browser command accepts bot actors or this mode; no privileged login or public administration route is added.

Duels materialize ordinary saved income, upkeep and resource recovery, resolve real combat rolls and damage, and record actual equipment/army snapshots. Attacking victories use unchanged `bot-combat-rewards-2`: 3% exposed-wallet base, existing bot ceiling, 65% difficulty XP, 100/85/70/55/40 pair reductions and 1-XP minimum. Vaults stay protected. Defensive bot wins grant no loot/XP, matching the prepared scope. Only actual attacking wins advance reward sequences. Ordinary XP/leveling, skill points and level-up refills persist; no free training, armies, gear, gold or catalog refresh.

A deterministic UUID and policy/actor/target/window fingerprint bind each completed duel's `command_receipts` entry to its real battle. Health, Spirit, XP, wallet journals, equipment snapshots and receipt commit together. New duels try the existing escrow lock before their receipt read, preventing read-before-commit duplicates without an extra SQL operation. Busy escrow causes an immediate skip. Either participant's active target/sponsor escrow, including expired-but-unsettled records, blocks combat; the worker never claims, expires, cancels or refunds it.

| Scheduling control | `living-bot-duels-1` |
|---|---|
| Interval / actor buckets | Five minutes / deterministic twelve-hour opportunities |
| Global candidates | At most five per slot; no replacement for skipped candidates |
| Actor limit | Two initiations per UTC day; losses also consume an initiation |
| Target protection | Four incoming duels per UTC day and one per rolling hour |
| Offline/restarts | Skip missed slots; no attack catch-up; completed receipts replay without writes |
| Activation | `ENABLE_LIVING_BOT_COMBAT` absent/`0` = OFF; `1` requires enabled development rivals and production private-alpha controls |

These activity bounds apply only to autonomous bot-versus-bot combat. Human reward eligibility is unchanged. Purchase and duel switches are independent and both default OFF. The scheduler/timer is shared, with tests proving purchase-v1 ordering/receipt compatibility, non-overlap and shutdown drain. Fixed failure logging contains no provider or credential details.

Population reads are bounded to 451 rows and fail closed above 450. Each direct attempt revalidates the population, so a tick performs at most six small population reads. Receipt lookups use the existing primary key. Pressure uses the existing attacker/defender date indexes and recent records, not a global history scan. No migration, table, dependency, service, initialization or release-infrastructure change is needed. The extra combat transactions briefly share the existing escrow gate; production private-network latency remains unmeasured.

## Bounded characterization

One disposable-PostgreSQL 24-hour run retained all 450 bots, hourly income, normal purchases, recovery and cooperating workers. It completed **802 scheduled duels and 597 paid acquisitions**. Whole-fixture totals, including two targeted setup duels: **804 battles, 285 attacking wins / 519 losses (35.4% attacking wins), 276,275 gold transferred, 8,806 XP**. One earned level-up was deliberately exercised by placing saved fixture XP one point below its threshold before combat; this is not evidence that ordinary high-level bots level daily.

The model portion used 482,194 SQL calls and about 114 seconds locally. This development characterization preceded final receipt-lock ordering/identity hardening. Final code passed the shorter two-hour regression: **71 scheduled duels, 53 paid acquisitions, 57,506 calls, about 10.3 seconds** in the model portion; whole-fixture 73 battles, 35 wins / 38 losses. Standard CI runs that short case. `RUN_PHASE5_DUEL_MODEL=1` selects the longer characterization only with a validated local disposable test database. The 24-hour study was not repeated. These random-roll/generated-UUID samples are not production capacity or long-term balance forecasts.

Representative saved purses / net hourly income from the 24-hour run (after targeted setup → end of model):

| Bot / starting level | Exposed gold | Net/hour |
|---|---|---|
| Evelith Wolfhart · 5 | 6,494 → 8,538 | 72 → 79 |
| Orwyn Brightmoor · 15 | 24,362 → 39,492 | 555 → 559 |
| Rowan Deepwood · 25 | 190,540 → 333,244 | 5,666 → 5,696 |
| Nimue Ravenshade · 40 | 712,465 → 1,254,828 | 21,578 → 21,608 |
| Zephryn Hawkridge · 50 | 1,061,145 → 1,858,777 | 31,910 → 31,980 |

Wallets + maintenance credit + retained gold reconcile exactly to earned Land less charged upkeep and real acquisitions. Loot only moves between saved purses. Final regression separately checks every battle's real debit/credit, saved XP growth, outcome/damage, actual equipment and target/day/hour bounds. [24-hour characterization](24-hour-results.json) · [Final short regression](regression-results.json).

## Verification and owner boundary

Focused tests cover default-OFF/private controls and no HTTP activation path; purchase compatibility; timer non-overlap/drain; invalid/self/human/inactive/login-enabled/changed-target rejection; Health/Spirit eligibility; held locks and active escrow; forged receipts; rollback after financial/battle/receipt writes; **SIGKILL after a real uncommitted battle insert**, fresh-process retry and read-only receipt replay; concurrent workers, purchases/income/human combat; a real zero-gold XP victory and level-up refills; actual saved XP and wallet accounting; personal feeds and migration replay.

Automatic activity preserves both human accounts/credentials/sessions, Vaults, holdings, inventory, army, progress, messages and personal All/Battles feeds. All 450 bot identities, original inventories/paid lots, army/social relationships, Vaults, bounties and immutable history remain. Only legitimate income, paid acquisitions and combat/progression append or advance records. Identity comparisons use UUID ordering so earned leveling cannot masquerade as identity replacement.

TypeScript/build, static checks, actionlint and affected tests pass. The single comprehensive regression/browser/container/independent recovery verification is the exact-head GitHub check linked in PR #16; it must pass before release review. No repeated local full suite or further long simulation is required for this checkpoint.

Keep `living-bot-economy-1`, 65% XP and the provisional repeat floor unchanged. Starter affordability stalls and offense-heavy selection remain on the [backlog](../BACKLOG.md). The low attacking win rate and conservative target bounds warrant controlled alpha observation if separately approved. No bot-human attacks, login rewards, level-100/200 content, human army changes or UI/tutorial work.

**Pause for owner review.** Do not set production flags or use source redeployment as an activation shortcut. Any later release still requires protected backup, independent restored-copy verification, exact-commit signing and owner approval. Stopping future activity must retain completed duels, paid acquisitions, earned progress and financial history; never reset the realm to undo actions.

Reproduce after installing dependencies and setting a disposable local `TEST_DATABASE_URL` ending `_test`: build, then `npx tsx --test tests/phase5-bot-combat.test.ts`. Optional `RUN_PHASE5_DUEL_MODEL=1` selects the 24-hour case. Fixture clocks, crash injection, provisioning and simulations are excluded from the production image.
