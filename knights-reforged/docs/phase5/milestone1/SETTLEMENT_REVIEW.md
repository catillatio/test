# Land settlement efficiency checkpoint

Implements [owner comment 6319300648](https://github.com/catillatio/test/pull/16#issuecomment-6319300648) on draft PR #16. Economic policy, rewards, holdings and production switches are unchanged. No production access, activation, merge or deployment.

## Narrow runtime change

`src/land.ts` replaces two SQL writes per paid lot with bounded batches of at most **250 lots**: one full-receipt insert, one partial-receipt insert when needed, and one cursor update. Every original per-lot receipt, rate, period, quantity, integer remainder and unique key remains. BigInt arithmetic, earliest unpaid/shared clock, first-period proration, offline catch-up, FIFO sale costs and retained treasury overflow are unchanged. No aggregation, deletion, history rewrite, migration, new dependency or new permissions. Human and bot settlement use the same optimized path.

`src/bot-income.ts` also rechecks candidate eligibility in one fresh read after acquiring character locks. Testing exposed an existing READ COMMITTED joined-snapshot race: three sweepers could count **519 materializations for 450 due bots**, even though existing cursor checks prevented duplicate payments. The fresh locked-candidate read skips that redundant work and restores accurate due-bot counting. It costs one indexed read per nonempty batch (18 reads for a single 450-bot sweep). Scheduling, batch limits, lock order and payment timing stay unchanged.

## Measured before / after

Local PostgreSQL 18; fsync, synchronous_commit and full_page_writes **on**. Each variant uses the identical populated snapshot, runs three times, and rolls back after observation. The baseline is the frozen `42844af` settlement implementation; its source was checked against Git. Latency is median settlement execution wall time, including character locks and ordinary income/retained ledgers, **excluding COMMIT, fixture setup and report scans**. No network-delay injection. This is a local path benchmark, not a production throughput or power-loss durability guarantee. Bot-sweeper dispatch/recheck overhead is outside this table.

| Fixture | SQL calls | Median execution | New settlement rows |
|---|---|---|---|
| 450 original bot portfolios, first hour | 14,406 → 8,100 (43.8% fewer) | 1.941s → 1.554s (19.9% faster) | 3,603 → 3,603 |
| mature paid lots, 1/30/59 minute purchases and seven-day downtime | 23,120 → 8,571 (62.9% fewer) | 3.405s → 1.776s (47.8% faster) | 7,952 → 7,952 |

The first fixture has all 450 original portfolios. The larger fixture includes nine additional normally priced, wallet-funded lots per bot, bought at 1/30/59 minutes, plus 300 paid human lots, an old multi-unit holding, saved fractional remainders, native sub-millisecond cursor precision, a future cursor and a nearly full wallet. Previous payments are committed using the old implementation before the seven-day catch-up; their rows survive unchanged. This is a bounded fixture, not a new 30-day simulation or a changed autonomous purchase allowance.

Durable financial rows are **unchanged**, not compressed: the first case appends 3,603 settlements, 450 ledger transactions, 450 entries and 900 retained movements (5,403 rows); the larger appends 7,952 settlements, 451 transactions, 451 entries and 902 retained movements (9,756 rows). Holding rows updated are also unchanged, 3,603 and 7,952 respectively. Only their SQL statement count falls. Storage growth, index/WAL volume and retention remain operational considerations; this does not solve the previously measured 6.69-million-row month by discarding history. [Raw samples and counts](settlement-efficiency.json).

## Preservation, recovery and regression evidence

- The frozen-reference comparison verifies exact cursors, clocks, balances, pending gold, every full/partial receipt, and individual ledger/retained amounts. Independently generated ledger UUIDs and recording timestamps are normalized between rollback trials; pre-existing immutable rows are separately checked byte-for-byte.
- Faults after full insert, partial insert, cursor write, real wallet entry and an unexpected cursor update count roll back all changes. Retrying ordinary settlement neither skips nor duplicates paid ranges. A deterministic stale-join test fails closed on a failed recheck without touching any financial/resource state.
- Three actual PostgreSQL sweepers settle **exactly 450** due bots. Immediate repeat settles zero and changes no row. Both humans (accounts, sessions, Vaults, paid lots, inventory, progress) remain unchanged by bot sweeps. All 450 bot identities/registries, armies, existing gear, bounties, history and personal activity survive.
- **14 affected tests passed, zero skips/failures**, including ordinary PvP wallet/XP/Vault races, bot income, bounded autonomous purchases, actual post-purchase rollback and compiled-process restart/replay. The broader local run discovered the stale-selection assertion above; the fix then passed this focused regression. Exact-head full CI status is linked in PR #16 and must be green before any release.
- TypeScript, production build, **99 static checks / 77 EJS fixtures**, actionlint and both production dependency audits passed (zero reported vulnerabilities). Existing CI additionally runs the full suite, browser, game-container restart/preservation and independent encrypted recovery-worker checks.

No protected workflow, deployment/backup/restore/signing code, migration, catalog, combat rule, purchase policy, initialization or account privilege changes. `ENABLE_LIVING_BOT_ECONOMY` remains default OFF. No new autonomous combat switch or execution path is installed. PR #13 is untouched.

## Next boundary

[Milestone 2 preparation](../milestone2/PREPARATION.md) specifies the next separately reviewable bot-versus-bot slice: real outcomes/resources, saved-wallet transfers, ordinary XP/leveling and durable reports using one authoritative combat core, without changing human PvP or personal feeds. Current bot accounts are still rejected by the player attack command, proven against the populated fixture. Numeric scheduling/target-pressure choices and any activation need separate review. No bot-human attacks.

[Backlog](../BACKLOG.md) retains starter affordability stalls and offense-heavy gear selection **unchanged**; no spending allowance, XP, loot or resource recovery rebalance. Pause for owner review, keeping PR #16 draft.

## Reproduce on disposable local PostgreSQL

From `knights-reforged`, after installing dependencies, provide only a local/designated disposable `*_test` database through `TEST_DATABASE_URL`:

```sh
npm run typecheck
npm run build
npx tsx --test --test-concurrency=1 tests/phase5-settlement.test.ts tests/phase5-bot-economy.test.ts tests/phase45-economy.test.ts tests/phase47-economy.test.ts
```

The new populated test creates/removes its own fixture schema. Output: ignored `test-results/phase5-settlement.json`. The frozen reference/harness is excluded from the production image.
