# Independent population economic and performance sensitivity

2026-11-05. Synthetic evidence only; no live balances, game formulas or production
resources changed. [Inputs/method](graveyard-economy-inputs.json),
[105 scenarios](graveyard-economy-scenarios.csv), [PostgreSQL timings](graveyard-performance.json).

## Recommendation and comparison

Start **disabled**. Proposed eventual setting: target12 / configured cap12 /
maximum6 new per separately approved operation; no scheduler. The public template
Land endowment is intentionally reduced to existing low-tier holdings. This is an
explicit new-NPC configuration proposal, not a catalog-rate or existing-player change.
It must be accepted before activation. Twelve public slots cover the full rival level
range; six is a lower-cost sensitivity case with incomplete level coverage.

| Population | Net gold/hour | Generated/day | Generated/year, no farming |
|---|---:|---:|---:|
| 6 | 264 | 6,336 | 2,312,640 |
| **12 recommended** | **594** | **14,256** | **5,203,440** |
| 24 | 1,188 | 28,512 | 10,406,880 |
| 48 | 2,376 | 57,024 | 20,813,760 |
| 96 implementation ceiling | 4,752 | 114,048 | 41,627,520 |
| Previous 24-NPC proposal | 442,576 | 10,621,824 | 3,876,965,760 |

At equal24 population the revised endowments reduce the proposed source flow by
approximately99.73%. Recommended12 is approximately99.87% below the old24 proposal.
No existing NPC or player estate is modified; no independent population exists in
production under this PR. Old high-tier holdings generated up to133,200/hour per NPC;
the revised template range is14–55/hour. Catalog prices, income, upkeep and existing
loot remain exact. Combat strength/equipment remain public level-appropriate templates.

## Long-term loot and inflation

The deterministic hourly model uses actual `humanVictoryLoot` integer arithmetic,
the existing anchored24-hour gold repeat sequence, and `landCreditAmount` including
retained-overflow handling. It models30/365/1095 days at6/12/24/48/96 NPCs, zero/one/
three eligible farmers per NPC, and1/5/20 successful victories per farmer daily.
Every scenario asserts generated gold = NPC wallet + retained gold + player loot.
The original proposal's multi-year overflow is also modeled without dropping gold.

These are optimistic loot-access sensitivities, not behavior forecasts. Farmers are
**eligible attackers per target**, not a claim that one human can attack every level
band. Defeat, discovery friction, actual HP/Stamina, level/strength mismatch, missed
attacks and player spending/sinks are not modeled. XP, bounties and development-bot
income are excluded. No private data distribution is asserted.

For the recommended12, after one year:

| Eligible farmers/NPC | Wins each/day | NPC wallet total | Gold transferred to players |
|---|---:|---:|---:|
| 0 | 0 | 5,203,440 | 0 |
| 1 | 1 | 474,606 | 4,728,834 |
| 1 | 5 | 184,834 | 5,018,606 |
| 3 | 5 | 64,292 | 5,139,148 |

An untouched55/hour kingdom holds39,600 after30 days and481,800 after365 days;
its first eligible victory yields1,188 or14,454 gold respectively. The14/hour
lowest template holds10,080 after30 days, first payout302. Actual repeated payouts
shrink with wallet deductions and the unchanged pair percentages. Empty wallets pay0.
No grants, backdated income, protected-balance withdrawals or restocked purses fund loot.

**Farming transfers inflation; it does not remove it.** All5,203,440/year is still
created by genuine Land even if players loot nearly all of it. With no farming,
recommended12 stock reaches15,610,320 after three years. Permanent non-spending
kingdoms accumulate indefinitely as required. The cap bounds creation and source
rate, not lifetime gold stock; no finite-cap setting mathematically guarantees a
stable economy without observations of player sinks and activity. No hidden payout
cap, decay, spending bot or income formula is added to disguise this limit.

Use the12 cap as a conservative proposed starting configuration, review actual
read-only economy/participation before any separately signed expansion, and keep
replenishment manual. Raising to96 multiplies the source by8 and is not recommended
for an unmeasured low-population realm. Lowering desired population stops new
construction; it does not confiscate wealth or pause existing NPC income. Any later
change to that behavior needs separate product/economic authorization.

## Isolated PostgreSQL performance

One synthetic human plus the public NPCs, PostgreSQL18, 30 rival queries per size;
no production history or the existing900-bot fixture was imported. Actual observed:

| Population | New NPCs in that step | Construction ms | Rival median/p95 ms | Full income sweep ms |
|---|---:|---:|---:|---:|
| 6 | 6 | 111 | 12.86 / 22.93 | 41.79 |
| 12 | 6 | 82 | 13.45 / 20.75 | 126.60 |
| 24 | 12 | 186 | 10.71 / 26.10 | 180.24 |
| 48 | 24 | 673 | 11.62 / 16.03 | 311.99 |
| 96 | 48 | 898 | 12.16 / 19.72 | 557.44 |

Income work increases with NPC count; measured rival lookup remains small in this
fixture. Construction includes full-row preservation on this fixture and exact
public receipt verification. Large real battle/financial histories, concurrent
users, cold caches, provider I/O and long-running years of new settlement/battle
rows were not benchmarked: these are not production SLOs or proof that a large
realm fits120-second statement /300-second transaction bounds. Future growth adds
normal income/battle journals; a population cap does not cap database history.
No database/recovery storage deletion or retention-system change is proposed here.

Reproduce only with an explicitly owned loopback `*_test` database:

```sh
node --import tsx scripts/graveyard-economy-report.ts /private/economy.json
node --import tsx scripts/graveyard-performance-report.ts /private/performance.json
```

The first is offline. The second writes synthetic fixtures only and enforces the
existing disposable database guard. It never connects using production credentials.
Timing noise is expected; no flaky speed assertion replaces functional checks.
