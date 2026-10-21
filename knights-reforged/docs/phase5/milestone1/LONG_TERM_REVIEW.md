# Milestone 1: 7- and 30-day economic review

**Policy unchanged; default OFF.** These are 30 virtual days in real, disposable PostgreSQL 18 realms, not observations from production. No allowance, combat rule, regeneration rate, catalog, release control or production record changed. PR #16 remains draft.

Each scenario starts from the same saved synthetic snapshot: 450 synthetic saved bot identities from the current catalog, six funded human attackers and one uninvolved human witness. Normal purchases, upkeep, Land settlement, combat commands and command receipts execute against PostgreSQL. Only the test clock advances. Hourly settlement uses twelve cooperating income sweepers to complete the experiment sooner; it does not change the production timer or batch sizes. The game image does not include this test harness. Fresh runs use new synthetic UUIDs, so exact decisions can differ across runs; all three scenarios here reuse identical IDs. Reported quantiles use the lower ordered sample at floor((N−1) × p).

- **Quiet:** no player attacks; one autonomous purchase-worker invocation per five-minute slot.
- **Attacked:** six four-member human armies starting at levels 5/10/20/30/40/50; two-hour daily sessions, one attempt each per five minutes, alternating fixed and rotating opponents within two levels. Natural Health/Spirit recovery, losses, cooldowns, XP and level-up refills apply. No later grants, forced wins, paid heals or resource resets. Combat rolls use the real randomized resolver.
- **Interrupted:** no attacks; two 24-hour outages beginning on days 3 and 15. Income catches up on return. Purchase opportunities are skipped. Three purchase workers execute concurrently at hourly slots, followed by a same-slot replay.

## Population results

Acquisition spending is paid equipment plus Land cost; reserve funding stays reserved and is reported separately in the JSON. Net income includes property and equipment upkeep.

| Scenario | Days | Exposed gold | Land buys | Gear buys | Acquisition spending | Net gold/hour | Bots with improved selected gear |
|---|---:|---:|---:|---:|---:|---:|---:|
| quiet | 7 | 578,889,817 | 2,759 | 1,612 | 1,554,953 | 3,326,167 | 439/450 |
| quiet | 30 | 2,436,696,308 | 11,088 | 6,453 | 11,896,504 | 3,455,397 | 444/450 |
| attacked | 7 | 578,375,184 | 2,759 | 1,612 | 1,554,953 | 3,326,167 | 439/450 |
| attacked | 30 | 2,435,098,544 | 11,088 | 6,453 | 11,896,504 | 3,455,397 | 444/450 |
| interrupted | 7 | 578,845,605 | 2,428 | 1,326 | 1,262,771 | 3,322,506 | 435/450 |
| interrupted | 30 | 2,432,001,705 | 10,364 | 6,166 | 10,896,746 | 3,437,452 | 444/450 |

| Quiet spending mix | Land cost | Equipment cost | Equipment reserve top-ups |
|---|---:|---:|---:|
| 7 days | 393,424 | 1,161,529 | 232,922 |
| 30 days | 2,672,664 | 9,223,840 | 1,438,079 |

## Where development occurs

| Levels | Bots | Initial median gold | Day-7 median | Day-30 gold P10 / median / P90 | Day-30 improved gear | Median equipment contribution gain |
|---|---:|---:|---:|---|---:|---:|
| 1–10 | 90 | 3,706 | 20,564 | 24,739 / 123,291 / 183,536 | 84 | 60% |
| 11–25 | 135 | 8,645 | 205,600 | 404,828 / 879,913 / 3,448,292 | 135 | 34.62% |
| 26–50 | 225 | 56,712 | 2,324,460 | 3,109,489 / 9,685,979 / 17,164,664 | 225 | 20.9% |

Equipment gains above measure the selected equipment attack-plus-defense contribution, not a combat multiplier or win-rate prediction. Much of the gain fills offensive slots: the level-40 example gains 254 equipment attack while defense stays unchanged. Bots remain passive in milestone 1, so this does not imply an equal improvement in present defensive challenge. Bot levels, armies, skills and Callings remain fixed. Existing equipment stays owned and maintained.

| Quiet example | Gold: initial → 7d → 30d | Properties: initial → 30d | Equipment attack / defense: initial → 30d | Net/hour: initial → 30d |
|---|---|---|---|---|
| Lysandra Hearthguard · 5 | 3,443 → 21,260 → 133,032 | 3 → 26 | 23/18 → 23/35 | 81 → 236 |
| Wulfran Wyrmward · 15 | 5,826 → 107,795 → 455,705 | 3 → 31 | 120/216 → 246/228 | 596 → 752 |
| Hesper Cloudspire · 25 | 20,428 → 709,269 → 3,043,533 | 7 → 35 | 264/464 → 488/492 | 3,962 → 4,427 |
| Cedric Ebonhart · 40 | 75,696 → 2,900,348 → 12,202,003 | 13 → 36 | 678/1062 → 932/1062 | 16,574 → 17,006 |
| Gwyneira Emberfall · 50 | 113,440 → 4,290,716 → 17,974,143 | 13 → 27 | 984/1302 → 1051/1378 | 24,600 → 24,989 |

Gear acquisition phases (quiet): days 1–2: 82; days 3–7: 1,530; days 8–30: 4,841.
Initial stock has 48 hours of prepaid upkeep. The policy waits until credit is consumed before buying gear, preventing an ordinary purchase from returning old reserve credit to the purse. Land can be purchased during that wait.

## Limits, stalls and accumulation

At day 30, 0 quiet bots reached a hard ownership limit. Maximum quantity of one property: 37/100; one equipment item: 10/1,000. 68 bots made no purchase in the last seven days; 230 already had their best unlocked equipment contribution. 220 still had useful unlocked equipment candidates; none had an entire remaining choice set priced above 5,000. These diagnostic groups overlap: best unlocked gear does not prevent Land purchases. They are not failed transactions.

The lowest starter portfolio illustrates a genuine policy barrier: three Smallholdings yield 21/hour, while the next costs 74. The two-hour-income limit permits at most 42 even with plenty of cash. Saved gold alone cannot unlock that purchase; equipment upkeep can lower the budget further. Higher-level portfolios can instead encounter the 5,000 ceiling, rising owned-quantity prices, the 2% Land-growth gate or the useful-equipment/upkeep constraints.

Quiet per-bot acquisitions at 30 days: Land P10/median/P90 = 17/25/34; gear = 5/15/23. 0 bots bought nothing over the full month.

- 7 days: keeping the original portfolios with no autonomous purchases gives 575,792,737 exposed gold; observed quiet gold is 578,889,817 (+3,097,080).
- 30 days: keeping the original portfolios with no autonomous purchases gives 2,388,453,097 exposed gold; observed quiet gold is 2,436,696,308 (+48,243,211).

This no-purchase comparison is closed-form: initial purse + original net income × hours + consumed initial reserve less the final one-hour reserve. Original equipment upkeep totals 126,082/hour. It assumes the same solvent, untouched starter stock and no attacks. It is not a second database experiment. The existing Land endowment dominates accumulation; autonomous buying is a small currency sink and adds legitimate future Land income.

At 30 days, quiet net hourly income is 5.23% above the original rate; acquisition spending is 0.47% of Land credits.

## Attacks and resources

| Days | Attempts | Wins / losses | Gold transferred to humans | XP | Level-ups | Spirit spent | Health-blocked requests / matched-pool skips |
|---|---:|---|---:|---:|---:|---:|---|
| 7 | 1,008 | 775 / 231 | 514,633 | 16,326 | 13 | 1,006 | 2 / 0 |
| 30 | 3,780 | 2,348 / 1,320 | 1,597,764 | 56,354 | 50 | 3,668 | 112 / 540 |

These are moderate periodic raids, not a worst-case coordinated farming model. The test deliberately chooses opponents within two levels, narrower than the game’s authoritative rival range. Of 4,320 scheduled player opportunities, 540 were skipped after players outgrew this matched pool; these are not game rejections or a character-level cap. Human loadouts stay fixed and players do not manually resume paused equipment upkeep, so this does not represent continuously optimized, well-funded attackers. Loot is transferred out of actual bot wallets; it is never replenished on attack. In this fixture, aggregate acquisition counts/costs, Land credits, projected net income and reported gear summaries matched quiet. The difference in total exposed bot gold equals the actual loot transferred; the global reconciliation additionally includes human upkeep. Active synthetic humans progress through normal combat; the uninvolved witness stays byte-identical.

## Scheduling, concurrency and database load

| Scenario (30d) | Autonomy SQL (incl. probes) | Income SQL (incl. probes) | Durable full + partial settlement rows | Nominal opportunities lost to the five-candidate cap | Offline missed candidates | Concurrent purchase ticks / replay checks |
|---|---:|---:|---:|---:|---:|---|
| quiet | 1,058,848 | 25,422,930 | 6,693,464 | 1,740 | 0 | 0 / 0 |
| attacked | 1,058,848 | 26,075,178 | 6,693,464 | 1,740 | 0 | 0 / 0 |
| interrupted | 1,018,887 | 23,559,135 | 6,001,292 | 1,740 | 1,684 | 672 / 672 |

Every scenario reconciled wallets plus maintenance reserves to actual Land credits minus charged upkeep and acquisitions. All prices, purse limits and reserve top-ups passed receipt checks. No wallet became negative. Maximum committed decisions per slot stayed at five. Each interrupted-run income replay settled zero bots; each completed purchase replay bought zero items. Missed purchases were not caught up.

The paired snapshots preserve all 450 UUIDs/names, account credentials, sessions, Vaults, army membership, original paid lots and immutable financial rows. Normal income advances existing Land settlement cursors; legitimate acquisitions append holdings and history. The full regression suite independently covers locks, forged receipts, rollback, concurrent PvP, actual compiled-process restart/replay and migration preservation.

The raid scenario adds 478,765 combat-command SQL calls. A read-only local sample around raid day 28 measured 1,807,546,047 database bytes (about 1.68 GiB including indexes, excluding WAL); this is a fixture observation, not a production sizing guarantee.

Counts above measure logical SQL calls in this harness, excluding fixture setup and report scans. Query milliseconds in the JSON sum concurrent calls and are not wall-clock latency. Twelve cooperating income sweepers add some empty-batch overhead; production retains its existing one-minute timer. Empty minutes are omitted here: at a stable shared boundary, one income process adds approximately 5,664 idle SQL calls/day (59 × 24 × 4). New Land lots increase future settlement rows and writes. The initial 3,603 bot lots alone imply about 2.59 million hourly lot settlements over 30 days; the quiet run produces about 6.69 million. This storage/write amplification is substantially larger than the percentage income gain. Production storage capacity and private-network latency remain unverified; review them before activation. Local PostgreSQL used disabled fsync on disposable storage; elapsed times are not production capacity or crash-durability evidence. Existing CI container restart/recovery tests use their normal configuration.

## Recommendation and verification

Keep `living-bot-economy-1` unchanged for this review. It achieves real early/mid-level equipment catch-up and modest Land growth while retaining cash. It is not a general gold sink, and low starter portfolios can stall despite accumulated savings. Before any separately reviewed policy version, decide whether those starter affordability barriers and mature equipment plateaus are desirable. Do not raise global allowances simply to reduce savings. Review starter affordability and the purpose of offensive purchases while bots remain passive as separate owner decisions; do not silently change the selector or add bot attacks. Observe production job duration, journal growth and actual raid pressure during a separately authorized alpha rollout.

No next milestone starts here. No production inspection, activation, merge or deployment occurred; PR #13 remains paused and untouched.

CI [39543977454](https://github.com/catillatio/test/actions/runs/39543977454), code commit `0c18e4218cd3964edfc7499e5ff2f3ca3b5b10b3`: **482/482 tests passed, zero skips/failures**, TypeScript/build, 99 static checks / 77 EJS fixtures, browser checks, both dependency audits, game container and independent recovery-worker checks. Local focused economics/race/preservation tests and actionlint also passed. [Raw experiment results](long-term.json).

## Reproduce on disposable local PostgreSQL only

The runner creates an isolated fixture schema and removes it afterward. Its identical-snapshot cloning needs a local test superuser; never supply production credentials. Use PostgreSQL 18 and the repository dependencies, then from `knights-reforged`:

```sh
TEST_DATABASE_URL='postgresql://LOCAL_TEST_USER:LOCAL_TEST_PASSWORD@127.0.0.1:LOCAL_TEST_PORT/realm_test' \
RUN_PHASE5_LONGTERM=1 PHASE5_DAYS=30 npx tsx scripts/phase5-longterm.ts
```

Expect a long run with millions of real SQL statements. Optional `PHASE5_SCENARIOS=quiet,attacked,interrupted` selects scenarios. `PHASE5_TEST_TABLESPACE=phase5_longterm_store` is only a local storage-placement option if that test tablespace has been created; it changes no rows or economic rules. Results are written under ignored `test-results/`, with interim per-scenario checkpoints. The test clock and harness are absent from the production image.
