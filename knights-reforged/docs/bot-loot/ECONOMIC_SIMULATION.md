# Progressive bot loot: economic sensitivity

The deterministic [machine report](ECONOMIC_SIMULATION.json) evaluates the existing source-defined **900-bot population**: 450 original `passive-rivals-5` blueprint slots and 450 `level100-rivals-1` entries. This is **not current production wallet telemetry**. No live database, provisioning, network, grants or runtime settings are accessed.

The model uses actual equipment powers, rival-level eligibility, damage, natural Health/Stamina recovery, source-defined estate surplus, the existing ordered-pair 24-hour reset and `100/85/70/55/40` repeat percentages. The previous policy is the unchanged historical `victoryLoot45()` bot calculation. The new policy uses exact integer 3% of the actual exposed wallet, then the approved progressive curve and the same repeats.

## Finite wallet distribution

Authored portfolios earn 222,829,344 gold of net estate surplus per simulated day across all 900 bots. This pre-existing source-defined income is not created by the loot change. For sensitivity, estate portfolios and equipment are frozen and autonomous purchases are excluded, so 1/7/30-day unspent balances are **available-liquidity upper bounds**, not an expected production trajectory. Original-bot legacy UUIDs are unavailable in the public source; deterministic synthetic study UUIDs are used for their scheduling, while added-cohort IDs come from its manifest.

| Unspent estate days | Median exposed wallet | Maximum wallet | Old aggregate first-win quote | New aggregate first-win quote | Ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0, source blueprints | 28,487 | 232,047 | 1,027,535 | 1,265,616 | 1.232× |
| 1 | 184,632 | 1,618,960 | 1,736,597 | 7,600,894 | 4.377× |
| 7 | 1,095,640 | 9,945,040 | 1,779,336 | 23,184,081 | 13.030× |
| 30 | 4,611,880 | 41,861,680 | 1,779,336 | 36,646,463 | 20.596× |

Aggregate quotes sum one eligible first-win quote per bot at its level; they are not loot that a single player can collect across all levels. At the source starting balances no first-win quote exceeds 20,000. After 30 static-estate days, 730 of 900 quotes exceed it. Source blueprints include 50 added mid-level bots, giving 500 slots at levels 1–50 and 400 at 51–100.

The existing spendable wallet capacity, 2,147,483,647, is respected. Any ordinary earned overflow is retained separately and included in conservation totals; it is never silently lost, withdrawn from a Vault or used as an attack-triggered refill. This is the existing wallet capacity, not a replacement reward cap.

## Resource-limited farming sensitivity

Thirty-six paired cases cover levels 50/75/100, one/seven/thirty days, two visit schedules, and old/new payouts. They start with the same finite 30-day static-estate stockpile. Each attacker has an authored legal offensive five-per-level army, training 25, Health 100 and Stamina 3. Actual combat, level matching, defender recovery and the pair sequence execute. The strategy chooses a wealthy eligible target whose unrolled Defense does not exceed Attack; random roll losses remain possible. No paid healing, Stamina refill, Vault withdrawal, new daily quota or balance replenishment is supplied.

All values below are **gross loot before the human's own upkeep/purchases**. XP, level-ups, changing gear, autonomous spending and estate growth are frozen, so these cases isolate financial exposure rather than predict player progression.

| Level 100 schedule | Old gold transferred | New gold transferred | Actual attempts / wins |
| --- | ---: | ---: | ---: |
| First day, four short visits / 12 attacks | 18,900 | 430,284 | 12 / 12 for both |
| Thirty days, four short visits per day | 567,000 | 18,043,642 | 360 / 360 for both |
| First day, one attempt every two minutes | 873,000 | 20,427,793 | 720 / 720 for both |
| Thirty days, one attempt every two minutes | 26,598,150 | 673,337,315 | 21,600 / 21,600 for both |

The two-minute case is deliberate sustained-activity stress, not a typical daily session. Natural recovery is still enforced; victorious damage and three Stamina slots permit sustained targeting of this finite distributed population. The active bot policy already has no shared daily gold quota or one-win-per-target cutoff; this change neither adds nor removes one. Pair-repeat reductions continue to a 40% floor and reset on their existing 24-hour window.

The complete report includes levels 50 and 75, losses, repeated victories, payouts over 20,000, remaining exposed wallets, and a currency equation for every case. Target selection responds to changed wallets, so later old/new cases can choose different targets. Every case verifies:

`initial wallets + retained overflow + unchanged Vaults + explicitly earned estate surplus = final wallets + retained overflow + unchanged Vaults`

## Bot-to-bot effects

The existing shared combat resolver also uses the bot reward policy for autonomous bot duels. A separate 24-hour isolation uses the existing scheduler and limits: two initiations per UTC day, four incoming per UTC day and one incoming per rolling hour, plus real Health/Stamina/level eligibility. With a 30-day static stockpile, both policies produced 1,564 attempts and 648 attacking wins; gross currency redistributed rose from **1,264,117 to 24,298,054**. Total bot/Vault/retained currency was **6,832,838,536 before and after** for both. Income and purchases are excluded only in this duel isolation to demonstrate that larger transfers do not create money.

The legacy study UUIDs mean exact live scheduling/targets are not claimed. Bounty holds and concurrent-lock contention are absent from these synthetic inputs, so these figures can overstate actual autonomous activity. Existing scheduler and pressure enforcement are unchanged in the application.

## Assessment and remaining risks

- **No new gold faucet:** all ordinary loot is debited from a finite exposed defender wallet and credited to the attacker; every study reconciles exactly. All growth shown is declared pre-existing net Land income. Vaults remain untouched.
- **Material redistribution risk:** wealthy bots can fund substantially faster human gear/land acquisition. At level 100 the conservative visit pattern in this stocked-wallet case yields about 22.8× the prior first-day loot. This is intended cap removal with diminishing returns, not proof that the change has small economic impact.
- **Repeat farming remains meaningful:** the unchanged 40% floor permits continued payouts against a wealthy surviving/recovered target. Natural recovery, level restrictions and wallet depletion constrain activity; there is no new compensating cap.
- **Existing source income matters:** a heavily stocked, unspent high-level estate population can sustain large transfers. Real autonomous purchases, upkeep, human losses, mixed builds and other attackers alter both liquidity and concentration. Exact production wallet/estate observations are needed for a calibrated forecast, not another recovery rehearsal.
- **Finite starting purses are not replenished after attacks.** A drained bot can pay only from what remains or from subsequently earned ordinary income. The policy does not grant gold, change bot estates, bypass protected funds or alter XP.

No additional gold cap, encounter quota, multiplier or sink was introduced to hide these risks. Review actual post-release transfer distributions, zero-wallet rates, concentration and bot purchasing behavior using existing read-only operational access; historical reports/ledgers should remain immutable.

## Reproduce in a disposable cloud checkout

```sh
node --import tsx scripts/simulation/bot-loot-economy.ts --check
```

Omit `--check` to regenerate the deterministic JSON. The report pins the relevant source/ruleset hashes and includes conservation assertions for all campaigns and both duel policies. This command performs no SQL or provider operations and is not a production activation command.
