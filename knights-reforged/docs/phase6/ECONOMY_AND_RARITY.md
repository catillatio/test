# Economic and rarity checkpoint

Nonproduction deterministic analysis, existing policies, no added capital or
spending allowance. `scripts/phase6-models.ts` regenerates both JSON reports using
the real planner, immutable 450-new-bot manifest, selection, settlement, upkeep,
reward taper and resource formulas. Wall-clock timings vary; decisions do not.
The original 450 behavior and the 3,701,553,498 Gold-equivalent manifest are unchanged.

## Purchases-only outcomes

| Scenario, additional 450 only | Land gold created | Upkeep paid | Purchase spend | Gear / Land purchases | No gear improvement |
| --- | ---: | ---: | ---: | ---: | ---: |
| 7 days, no attacks | 2,616,423,474 | 1,526,083,644 | 23,796,907 | 668 / 3,692 | 292 |
| 30 days, no attacks | 12,369,143,746 | 6,596,899,976 | 127,836,543 | 4,605 / 12,914 | 169 |
| 30 days, ten attacking accounts + outages | 12,243,108,757 | 6,588,689,919 | 118,597,848 | 4,195 / 12,286 | 171 |

Initial liquid gold/prepaid reserve: 33,084,880 (excluding already-owned Land and
gear). At day 30 without attacks, liquid gold/reserve totals 5,677,492,107. Every
run asserts initial currency + actual Land credits − upkeep − purchases = final
currency, including external attacker wallets. Purchased Land increases future
legitimate income; no extra passive source is invented.

| Tier | Bots | Day-30 median wallet | Gear buys | No gear improvement |
| --- | ---: | ---: | ---: | ---: |
| Green | 150 | 4,283,433 | 1,747 | 3 |
| Seasoned | 180 | 10,384,472 | 2,050 | 81 |
| Elite | 120 | 20,948,949 | 808 | 85 |

Examples, actual planner snapshots (not live players):

| Green bot level | Wallet before → after 30 days | Gear copies bought | Attack power before → after | Upkeep/hour before → after |
| --- | --- | ---: | --- | --- |
| 51 | 6,432 → 1,695,325 | 10 | 5,842.64 → 6,174.60 | 2,592 → 2,892 |
| 60 | 13,244 → 3,180,098 | 14 | 8,743.96 → 10,211.45 | 5,049 → 5,642 |
| 75 | 16,632 → 4,849,414 | 11 | 15,122.79 → 16,107 | 6,642 → 7,215 |
| 100 | 33,120 → 9,285,791 | 7 | 24,389.75 → 25,402.83 | 13,770 → 14,336 |

### The 169 stalled bots

The diagnosis compares the **actual last scheduled decision snapshot** with the
fully settled final snapshot. All 169 have affordable gear in the latter. At the
actual slot, prepaid upkeep has been consumed; buying gear must also replenish
the required reserve, putting otherwise affordable equipment over the existing
budget. Example level-51 seasoned bot: budget 9,000, reserve 726, upkeep 8,712;
all 23 improving candidates fail the budget check. Land costing 4,280 is selected.
After settlement, 22 candidates are affordable. Elite bots are disproportionately
affected. More wallet gold alone does not remove this income/budget constraint.

Recommendation: permit only the already reviewed conservative purchases-only
trial; do not increase capital, budget or upkeep allowance. If meaningful gear
progress for every tier is required before activation, HOLD that policy decision
for a separately versioned scheduling/prepayment-budget proposal. This PR leaves
both rules and scheduling unchanged. Land-heavy growth and large idle wallets
remain real alpha balance limitations, not a solved result.

The attack stress uses ten equipped level-100 humans, four short visits/day,
existing Health/Stamina recovery, finite bot wallets and ordinary reward taper.
It produces 1,120 attacks/wins, 0 losses, 3,352,784 transferred gold. This is a
favorable attacker/loot-exposure scenario, **not** a realistic global win-rate
prediction. No Vault withdrawal, healing, paid refill or unlimited bot purse is
assumed. Bot levels and recruitment stay fixed for the financial isolation.

### Workload and storage

The fixed bounded scheduler skips 336/1,440 nominated opportunities over 7/30
days; these are not backfilled. Outages similarly skip decision slots, while
legitimate hourly Land/upkeep settlement catches up. Multiple invocations reuse
exact command IDs; populated SQL tests exercise concurrency and pause races,
not a claim that a multiplication of simulated workers measures SQL throughput.

Day-30 no-attack model estimates **8,493,608 Land settlement rows**. The previous
independent 900-bot restore measured 1,327,104 bytes / 8,208 rows (~162 bytes/row),
which suggests ~1.37 GB for that journal alone under a similar row/index mix.
This is an estimate, excluding other journals, WAL, bloat, indexes and retained
restores. New population tests record actual local append milliseconds, WAL,
database bytes and matchmaking timings in CI artifacts. Those local fixture
numbers are not production latency guarantees.

20-GB volumes were owner-reported previously; current free space, WAL and
recovery-copy accumulation are **UNVERIFIED** here. No deletion or PR #25
activation is included. Read-only aggregate monitoring must be paired with
existing Railway volume metrics before approving sustained automation.

## Rare quest recommendation

Retain **500 ppm per eligible item opportunity**, pending explicit owner review.
No rate is activated by installation. Ordinary minimum remains **71**; actual
quests start later and retain all equipment/army/seal prerequisites:

| Actual quest | Level | Independent item opportunities |
| --- | ---: | --- |
| storm-the-river-fortress | 74 | Sword |
| settle-the-war-of-crowns | 79 | Shield |
| breach-the-imperial-walls | 84 | Meteor Shower |
| defend-the-hundred-kingdoms | 100 | Sword, Shield, Meteor Shower |

One opportunity at 500 ppm has mean first success 2,000 completions and median
1,386. The final quest has three independent opportunities: any-drop probability
0.149925% per completion; mean ~667 and median ~462 completions. No guarantee,
pity, boost or trading system was added.

The resource-paced model starts qualified characters at 71/74/79/84/100, checks
actual quest Mana/XP, natural Calling-adjusted recovery, downtime and actual
level-up refills. Maximum Mana is fixed and capped by legitimately available
skill points; no free resource bonuses. Quest prerequisites are assumed earned
already. It models no travel, combat, alternate quests, future post-100 content
or skill allocation; it is a conditional mature-quester model, not a new-player
leveling prediction. Level-71 questers have no eligible quest in this isolation.

Level-100 start, 90 days; all three items eligible per completion:

| Daily sessions | Completions 30 / 60 / 90 days | Expected copies **per item**, 90d at 500 | Any reward by 90d, 250 / 500 / 1,000 ppm |
| --- | --- | ---: | --- |
| Casual 15m | 64 / 130 / 193 | 0.0965 | 13.5% / 25.1% / 44.0% |
| Regular 1h | 199 / 399 / 594 | 0.2970 | 36.0% / 59.0% / 83.2% |
| Regular 2h | 310 / 614 / 913 | 0.4565 | 49.6% / 74.6% / 93.5% |
| Intensive 4h | 432 / 839 / 1,253 | 0.6265 | 60.9% / 84.7% / 97.7% |

At 500 ppm, approximate mature level-100 median first reward is 216 / 70 / 46 /
33 days at those respective modeled rates. 250 is particularly punishing for
casual play; 1,000 erodes scarcity faster. Even 500 can produce lengthy droughts;
that tradeoff needs owner approval rather than a hidden guarantee.

One Sword/Shield/Meteor costs ordinary upkeep 175/170/165 per hour. Equal full-set
expected 90-day upkeep is ~49/151/233/320 gold/hour across the four schedules.
45 copies cost ordinary characters **7,650/hour**. Rare items use real inventory
capacity and ordinary automatic offense/defense selection; a handful does not
fill a 500-participant army. They are attack-focused, so lucky discoveries can
matter in close PvP without modifying any combat/reward formula. Hudson's
separate 15/15/15 entitlement applies only to the exact UUID and these item IDs;
other gear and previously accrued liabilities remain payable.
