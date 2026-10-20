# Phase 4.9 — 100% / 65% / 40% bot XP review

**Decision: implement 65% as immutable `bot-combat-rewards-2` for owner gameplay testing.** The 40% same-opponent floor remains provisional. No production operation or unrelated interface/audio change is included. This is a balancing checkpoint, not a release recommendation.

## Formula and unchanged economics

```text
full = existing victoryExperience47(attackerLevel, defenderLevel, true, actualAttack, actualDefense)
scaled = max(1, floor(full × 65 / 100))
bot XP = max(1, floor(scaled × pairPercent / 100))
pairPercent = 100, 85, 70, 55, 40, 40, ... in the existing fixed 24-hour pair window
```

The two integer floors are deliberate: apply 65% before the existing repeat reduction. A much weaker opponent whose full award is 1 still gives 1. Losses give no attacking XP and do not advance the victory sequence. There is no client/environment XP override. The 100% and 40% options exist only as explicit offline simulator candidates.

Gold is exactly the already approved Phase 4.9 model: `floor(min(15,000, floor(0.03 × exposed purse), min(3,000, 50 + floor(1.25 × min(defenderLevel,50)^2))) × pairPercent / 100)`. It is an actual defender-to-attacker transfer after normal due income/upkeep. No shared six-victory/day budget and no one-victory-per-bot cutoff. Vault, bounties, bot finances, difficulty calculations, quest XP, human XP, recovery and level-up refills are unchanged.

## Arithmetic: matched first victory and repeated wins

Equal attacker/defender level and pre-roll strength; an eligible victory is assumed. Quest comparison uses the highest available quest level, then XP, ignoring equipment/route unlocks; it is not a claim every player can immediately run that quest.

| Level | XP to next | 100% first | 65% first | 40% first | 65% next-level progress | Quest XP (required level) |
|---|---:|---:|---:|---:|---:|---:|
| 5 | 60 | 3 | 1 | 1 | 1.67% | 16 (5) |
| 8 | 135 | 7 | 4 | 2 | 2.96% | 24 (8) |
| 10 | 200 | 10 | 6 | 4 | 3.00% | 30 (10) |
| 17 | 515 | 47 | 30 | 18 | 5.83% | 50 (16) |
| 25 | 875 | 105 | 68 | 42 | 7.77% | 86 (25) |
| 40 | 1550 | 186 | 120 | 74 | 7.74% | 165 (40) |
| 50 | 2000 | 240 | 156 | 96 | 7.80% | 230 (50) |

| Level | 100% XP, wins 1–5+ | 65% XP, wins 1–5+ | 40% XP, wins 1–5+ |
|---|---|---|---|
| 5 | 3/2/2/1/1 | 1/1/1/1/1 | 1/1/1/1/1 |
| 8 | 7/5/4/3/2 | 4/3/2/2/1 | 2/1/1/1/1 |
| 10 | 10/8/7/5/4 | 6/5/4/3/2 | 4/3/2/2/1 |
| 17 | 47/39/32/25/18 | 30/25/21/16/12 | 18/15/12/9/7 |
| 25 | 105/89/73/57/42 | 68/57/47/37/27 | 42/35/29/23/16 |
| 40 | 186/158/130/102/74 | 120/102/84/66/48 | 74/62/51/40/29 |
| 50 | 240/204/168/132/96 | 156/132/109/85/62 | 96/81/67/52/38 |

**Early-level tradeoff:** a perfectly matched Level-5 full award of 3 becomes 1 at both 65% and 40%; at Level 8, 7 becomes 4 or 2. Real lower-strength encounters can also floor to 1. This is not an XP display bug. Quests remain unchanged (e.g. 16 XP at required Level 5, 24 at Level 8). Combat alone is intentionally slower early on. The 65% first matched award at Levels 17–50 remains about 5.8–7.8% of the next-level requirement, before strength/relative-level variation and repeat reductions.

## Method and limitations

216 deterministic scenarios: 189 natural-loadout comparisons (7 starting levels × 3 percentages × 3 seeds × 3 schedules), plus 9 established-loadout and 18 shared/same-bot scenarios. Seeds: 4901, 4919, 4927. All use real combat-roll, eligibility, recovery, upkeep, level requirement and level-up refill helpers. Fixed legal inventories, finite purses and Health, no human Land income or quests. Natural participants/equipment reflect the existing simulator; no free purchases, army growth or skill spending are introduced.

One- and two-hour daily sessions run at the same time over fourteen calendar days; no attacks occur while offline. Regeneration caps normally and due finances settle once. The final calendar horizon includes the last overnight interval. Six-hour runs are sustained play. Decisions are every 30 seconds, except the explicitly labeled 6-second shared-target stress tests. Paid healing is used only when affordable and is charged as a gold sink.

Target selection is optimistic: it knows actual opponent strength and seeks suitable fresh opponents. Fixed gear can become inadequate later; maintenance can pause if finances cannot support it. There is no automatic shopping/recruitment strategy. Therefore these are combat-pressure comparisons across Levels 5–50, not an end-to-end campaign forecast for a changing human loadout. A single Level-5 character with fixed starting equipment does not reach Level 50 in fourteen days. No live bot wealth or player telemetry was inspected.

## First daily session: actual outcomes at 65%

Central seed 4901; gold means gross ordinary loot transferred, before the player’s healing/upkeep costs.

| Start | 1 hour: end / wins / gold / XP | 2 hours: end / wins / gold / XP |
|---|---|---|
| 5 | L5 / 36 wins / 2,770 / 36 | L6 / 71 wins / 5,133 / 71 |
| 8 | L8 / 36 wins / 3,577 / 72 | L8 / 69 wins / 6,025 / 116 |
| 10 | L10 / 32 wins / 4,353 / 100 | L10 / 63 wins / 7,746 / 160 |
| 17 | L18 / 29 wins / 7,405 / 686 | L19 / 59 wins / 14,573 / 1,308 |
| 25 | L26 / 23 wins / 13,076 / 1,195 | L27 / 54 wins / 29,204 / 2,444 |
| 40 | L41 / 21 wins / 31,687 / 1,641 | L42 / 52 wins / 90,501 / 3,999 |
| 50 | L51 / 34 wins / 81,971 / 2,373 | L51 / 64 wins / 148,112 / 3,840 |

## Six continuous hours

Final-level ranges cover all three seeds. Other values are seed 4901. Wins/losses and gold are shown for all policies in the raw report; the summary includes 65% outcomes and gold comparisons.

| Start | End at 100% | End at 65% | End at 40% | Gold: 100% / 65% / 40% | 65% wins / losses | 65% win rate |
|---|---:|---:|---:|---:|---:|---:|
| 5 | 7–8 | 7 | 7 | 9,965 / 10,198 / 10,198 | 176 / 31 | 85.0% |
| 8 | 12 | 9 | 9 | 18,754 / 13,532 / 13,648 | 203 / 2 | 99.0% |
| 10 | 13 | 11–12 | 11 | 17,991 / 18,395 / 18,376 | 173 / 32 | 84.4% |
| 17 | 34–35 | 25–26 | 20 | 118,963 / 82,400 / 48,670 | 198 / 27 | 88.0% |
| 25 | 36–37 | 33 | 28–29 | 158,053 / 143,811 / 102,981 | 175 / 48 | 78.5% |
| 40 | 48 | 46 | 43–44 | 298,513 / 285,592 / 266,170 | 164 / 54 | 75.2% |
| 50 | 55 | 53–54 | 52 | 378,089 / 387,877 / 401,296 | 194 / 16 | 92.4% |

## One hour daily for fourteen days

Final-level ranges cover all three seeds. Other values are seed 4901. Wins/losses and gold are shown for all policies in the raw report; the summary includes 65% outcomes and gold comparisons.

| Start | End at 100% | End at 65% | End at 40% | Gold: 100% / 65% / 40% | 65% wins / losses | 65% win rate |
|---|---:|---:|---:|---:|---:|---:|
| 5 | 12 | 9 | 9 | 29,256 / 32,161 / 33,945 | 325 / 187 | 63.5% |
| 8 | 18 | 16–17 | 13 | 50,718 / 79,098 / 75,808 | 477 / 45 | 91.4% |
| 10 | 19–20 | 16 | 13 | 53,097 / 63,399 / 68,823 | 289 / 225 | 56.2% |
| 17 | 44–45 | 39–40 | 32 | 439,067 / 414,269 / 325,055 | 413 / 135 | 75.4% |
| 25 | 45–46 | 41–43 | 36–37 | 448,916 / 508,260 / 450,366 | 361 / 175 | 67.4% |
| 40 | 57–58 | 54 | 50 | 1,198,117 / 1,134,553 / 1,011,377 | 462 / 69 | 87.0% |
| 50 | 61 | 58 | 56 | 1,159,010 / 1,252,272 / 1,265,193 | 467 / 51 | 90.2% |

## Two hours daily for fourteen days

Final-level ranges cover all three seeds. Other values are seed 4901. Wins/losses and gold are shown for all policies in the raw report; the summary includes 65% outcomes and gold comparisons.

| Start | End at 100% | End at 65% | End at 40% | Gold: 100% / 65% / 40% | 65% wins / losses | 65% win rate |
|---|---:|---:|---:|---:|---:|---:|
| 5 | 18 | 12 | 10–11 | 54,160 / 52,537 / 56,084 | 505 / 478 | 51.4% |
| 8 | 18 | 18 | 16 | 50,628 / 89,104 / 127,103 | 635 / 354 | 64.2% |
| 10 | 25–26 | 19–21 | 16 | 94,991 / 95,986 / 110,569 | 410 / 582 | 41.3% |
| 17 | 47–48 | 45 | 39–40 | 609,953 / 715,660 / 716,217 | 671 / 366 | 64.7% |
| 25 | 50–51 | 47–48 | 43 | 663,572 / 797,227 / 886,483 | 544 / 479 | 53.2% |
| 40 | 61 | 58 | 54 | 1,706,542 / 1,972,122 / 1,977,356 | 940 / 73 | 92.8% |
| 50 | 61 | 61 | 58 | 1,142,647 / 1,820,510 / 2,221,745 | 809 / 95 | 89.5% |

**Interpretation:** 100% creates a substantial Level-17+ leveling/refill feedback loop; 40% suppresses matched XP more strongly and returns low-level wins to the 1-XP floor more often. 65% reduces the pressure while keeping combat useful. Slower XP does not guarantee less total gold over many days: players can retain a better win rate at a suitable level instead of outleveling their equipment or the bot catalog. Gold rules are identical in all three candidates; this is a behavioral consequence.

## Resources at 65%: six continuous hours

Natural Spirit is the number actually regenerated, including final materialization; bonus Spirit is only the existing level-up refill. All start with 3 Spirit. The resource identity `attacks = 3 + natural Spirit + level-up Spirit − final Spirit` is asserted in focused tests. HP recovery is capped, not unlimited healing.

| Start | Attacks | Natural Spirit | Level-up Spirit | End Spirit | Natural HP | Level-up HP | Paid heals / gold cost | End spendable purse |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 5 | 207 | 199 | 6 | 1 | 778 | 12 | 2 / 169 | 15,014 |
| 8 | 205 | 199 | 3 | 0 | 626 | 6 | 0 / 0 | 18,487 |
| 10 | 205 | 199 | 3 | 0 | 972 | 6 | 1 / 188 | 23,087 |
| 17 | 225 | 196 | 27 | 1 | 860 | 166 | 2 / 344 | 86,651 |
| 25 | 223 | 197 | 24 | 1 | 844 | 141 | 8 / 2,390 | 145,641 |
| 40 | 218 | 197 | 18 | 0 | 845 | 60 | 12 / 5,173 | 283,019 |
| 50 | 210 | 198 | 9 | 0 | 791 | 53 | 2 / 1,030 | 387,257 |

Daily-session starts record actual Health/Spirit/wallet. For the central one-hour Level-17 run, the next day begins at 100 Health and 3 Spirit, without action while offline. It reaches Level 25 in the fifth session (4.70 active hours, 96.70 elapsed hours). Independent Level-25 and Level-40 starts reach 40 after 11.01 active hours and 50 after 8.07 active hours respectively. These are separate benchmarks, not one combined journey; unused points and fixed gear are not magically upgraded.

Characters remain uncapped. Some starting-level-50 scenarios reach 61, where the level-50 opponent catalog eventually no longer supplies eligible bots. The simulator reports that limitation rather than extending bots, changing eligibility or inventing a level cap.

## Sustained same-bot and multi-account checks

Level 17, six hours, six-second decisions, budget-checked 10 Spirit capacity. Every account competes for the same actual target Health and purse. Serial player ordering is deterministic and can advantage the first account; this is not a fairness forecast.

| Full XP % | Accounts | Wins / losses | Gold transferred | XP awarded | Final levels | Target-Health blocks |
|---|---:|---:|---:|---:|---|---:|
| 100 | 1 | 125 / 1 | 7,314 | 2,416 | 21 | 3,474 |
| 100 | 10 | 125 / 1 | 7,480 | 2,575 | 20,17,17,17,17,17,17,17,17,17 | 35,874 |
| 65 | 1 | 125 / 1 | 7,314 | 1,501 | 19 | 3,474 |
| 65 | 10 | 125 / 1 | 7,480 | 1,598 | 19,17,17,17,17,17,17,17,17,17 | 35,874 |
| 40 | 1 | 125 / 1 | 7,314 | 901 | 18 | 3,474 |
| 40 | 10 | 125 / 1 | 7,480 | 964 | 18,17,17,17,17,17,17,17,17,17 | 35,874 |

The 65% ten-account case transfers 7,480 gold and 1,598 XP in aggregate, not ten independent copies of the solo purse. All 216 runs conserve wallet/reserve/retained currency: ending total equals starting total plus existing property income minus real upkeep and healing. Every Vault is unchanged. No attack generates gold; the only generation is unchanged Land income. Because the approved hard quotas are removed, determined multi-account play can still distribute attacks across the finite bot population; this risk is not claimed solved by a per-pair floor. Keep the floor provisional and review real controlled-alpha behavior.

## Actual PostgreSQL transfer example

The Level-25 versus Level-29 bot integration fixture resolves real combat with physical inventories. First win transfers **365 gold** from **12,198 → 11,833**, granting **47 XP** at 65% (the v1 full award was 73). The second transfers **300 gold**, leaving **11,533**, granting **39 XP** (v1: 62). Thus gold transfers and the 85% repeat reduction are unchanged; only bot full XP scaling changes. Concurrent two-account transfers still debit 30 then 29 from a 1,000-gold purse, leaving 941 with no Vault access.

## Preservation and verification

New immutable version only; `bot-combat-rewards-1` stays byte-identical and installed. No schema migration, historical recalculation, pair-window reset, reseed or bot-finance correction. Upgrading the populated v1 fixture adds only the v2 ruleset row: all 66 tables retain their existing business rows, including 452 accounts / 450 bots, both legacy and v1 receipts, sessions, balances, Vaults, inventories, holdings, bounties, tutorial and achievements. Upgrading from Phase 4.8 registers both bot policy definitions; neither registration awards anything.

Focused tests cover nested rounding, low-XP minimums, repeated and distinct rivals, exact 24-hour boundaries, concurrent wallet transfers, duplicate keys, Spirit races, actual awarded/displayed XP, human-rule preservation and offline-session reconstruction. Mobile receipts at 320/390/430px retain the approved Phase 4.8 design and separate repeat reductions from weak-opponent reductions. Full final counts and commands are in [verification](verification.json) and the [implementation report](../../PHASE_4_9_IMPLEMENTATION.md).

## Reproduce without production access

```bash
cd knights-reforged
npm run balance:phase49:xp
```

The command reads local versioned catalogs and writes `docs/phase49/xp-comparison.json`. It does not connect to PostgreSQL, Railway or a provider. The earlier 100% proposal is retained in [its original report](V1_IMPLEMENTATION.md) and [66 original simulations](paced-simulations.json). New default-policy reruns use a policy-specific output filename instead of overwriting that archive.

Outstanding interface/audio/assets and required targeted broadcast moderation are separately tracked in [BACKLOG.md](BACKLOG.md). They have not been silently treated as complete by this combat change. Pause for owner balancing review before the next implementation stage.
