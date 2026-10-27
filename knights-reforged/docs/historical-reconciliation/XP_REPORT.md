# PvP XP correctness and inactive balance alternatives

**Implemented:** exclude losses from the human successful-victory allowance. **Not activated:** every numerical rebalance in this report. No runtime module imports the research curves, no new realm policy or migration is registered, and no owner activation control is added.

For a player: failed attempts used to use up the same three opportunities that grant full XP for winning against a human rival. The correction lets a later victory receive its earned difficulty award. It keeps zero attacker XP on losses and reduced rewards after three eligible wins. Separately, very weak opponents still give 1 XP under the existing policy; changing that is a balance decision, not the counter bug fix.

## Existing exact path and formula

`executeCommand()` validates the authenticated request, CSRF/idempotency, target and resource state, owns a transaction, locks escrow first and both characters in sorted order, then calls `resolveBattle()`. `stateFrom()` computes pre-roll army/equipment/skill/Calling power. The combat rolls determine the outcome, not the XP difficulty inputs. `victoryExperience47()` composes `victoryExperience45()`. Bot victories then apply `scaleBotExperience()` via `botVictoryRewards()`. `grantExperience()` credits the storage-bounded award and consumes the character's current progression epoch. The final battle JSON and command receipt persist the actual XP. A retry reuses the receipt; failures roll back the entire transaction.

Sources: [combat](../../src/combat.ts), [gameplay rules](../../src/gameplay-rules.ts), [game-feel rules](../../src/game-feel-rules.ts), [bot rewards](../../src/bot-combat-rules.ts), [bot rounding](../../src/bot-experience.ts), [pair sequence](../../src/pvp-economy.ts), [progression](../../src/progression.ts), [epochs](../../src/progression-policy.ts).

Let L=recipient level, O=opponent level, r=opponent relevant power/max(1,recipient relevant power). Attacking rewards use defender defense / attacker attack; defensive rewards reverse the recipient role.

```text
R(L) = thresholds[L]−thresholds[L−1], L<10
       200+45(L−10),               L>=10
thresholds = [0,12,30,60,105,165,245,350,485,650]
p(L) = 5                         through 10
       5+.5(L−10)                through 16
       min(12,9+.375(L−17))       from 17
B = max(1,min(300,ceil(R(L)×p(L)/100)))
D = clamp(100+10(O−L),25,150)
S = max(50,clamp(floor(100r),1,125))
X = max(1,floor(B×D×S/10000)), if eligible and r>=.35
    1, otherwise
human attacking victory = X
human attacking defeat = 0
bot-target attacking victory = max(1,floor(max(1,floor(.65X))×M/100))
M = 100,85,70,55,40 for pair victories 1,2,3,4,5+
```

Before this patch, the human attacker counted `rewarded=true` **encounters** in the preceding 86,400 seconds. After it, the predicate is `rewarded AND outcome='attacker_win'`. Eligibility is count<3; exact cutoff records are excluded by `created_at > cutoff`. Trivial successful attacks still consume an opportunity, matching the conservative old successful-attack treatment. Legacy records without modern XP JSON still count if they are rewarded attacking wins. Legacy losses retain their original flags but no longer consume future win eligibility. No SQL data rewrite is needed.

The allowance was not the request-flood control: the account command rate limit remains 90/minute outside test mode; actual Health/Stamina and normal targeting remain. Deliberate losses do not generate attacker XP, gold or pair-victory advancement. They can still generate the human defender's existing bounded defensive XP; that directional allowance is unchanged. Repeated coordinated accounts remain a residual risk even under the old system; removing losses from the attack counter is not represented as complete collusion prevention.

Human defenders use a separate three-full-nontrivial-defensive-wins/rolling-day counter per attacker and never refill combat resources on defensive level-up. Bot defenders earn zero XP. Bots already advanced their pair repeat sequence only on attacking victories; this patch changes no bot counter. Human gold uses its separate fixed 24h victory window and existing 100/75/50/25/10 schedule. Bounty payout and K/D are separate from ordinary battle XP.

Credited lifetime XP is capped by the existing integer storage limit 2,147,483,647. At one below that limit, a nominal larger award credits only one; this is a storage edge, not the ordinary 1-XP problem. Existing attained levels and in-level entitlements are never derived again from lifetime XP.

## Reproduction of the prior result

The prior audit's local files were found: `reproduce-xp-audit.mjs`, `xp-audit-results.json`, and its written report. Original baseline: `5427755221968247671a361a29fbbc66594021f3`. This branch reruns the relevant source-composed experiment at the pinned release baseline. Existing XP formula and cohort inputs reproduce the exact result.

Fixture: level 50, Freeblade, 50 actual assumed paid participants (20% of 5L), training 8, best legal offensive shop gear from `loadout(50,50,'offense',true)`, maintained equipment, fixed 900-entry research cohort (450 original templates + 450 installed-cohort manifest entries), uniform eligible target weighting, first bot-pair victory, all 441 equally weighted −10…+10 roll combinations. Restored Health/purse snapshots and reset first-pair eligibility isolate rewards. No bot population is installed. There is no random seed because all roll outcomes are enumerated.

| Measure | Exact reproduction |
|---|---:|
| Encounter cases | 81,585 |
| Winning cases | 56,305 |
| 1-XP winning cases | 44,100 |
| 1-XP share | 78.323417% |
| P25 / median / P75 | 1 / 1 / 1 |
| Mean XP/victory | 27.151070 |
| Maximum | 282 |
| XP/encounter = XP/stamina | 18.738016 |

The 44,100 one-XP cases are trivial-strength wins, not exhausted human allowances. Consequently the counter fix does not change this particular first-bot-win distribution. Its benefit is independently proven by real PostgreSQL loss→win tests. Do not claim the counter fix alone solves the 78.3% result.

A legitimate 135-XP example from the earlier fixture: L=O=50, attack 13,871.52, defense 12,146.04, r≈.87561; B=240, D=100, S=87; X=floor(240×100×87/10000)=208; floor(.65×208)=135. This is an ordinary difficulty award, not an XP jackpot. The formula permits larger awards; 135 itself is not a defect.

The cliff is reproducible at equal level 50: r=.3499 → 1 bot XP; r=.35 → 78. Improving your army can therefore move an unchanged opponent across the cliff and sharply reduce the reward. This is established policy in the current formula, not evidence of an incorrectly implemented historical rule.

## Bot rounding and late progression

The 65% policy and the two floor operations are explicitly established by existing tests. Human awards 1–3 all become 1 on a fresh bot target. At level 5 an equal-power human award of 3 becomes floor(1.95)=1. On fifth+ bot wins, small values are floored again by 40%. Combining both multipliers before flooring changes some results (e.g. full 4,65%,85% gives 1 under current ordering versus 2 if both multipliers are combined). The existing `phase49-xp` tests exhaust relevant boundaries. This branch preserves the established two-stage policy; no rounding buff is justified as a bug correction.

The compatible expanded human progression requirement is `R(L)+150×max(0,L−50)`, except the preserved boundary level finishes at its frozen legacy requirement. Bots keep the legacy requirement. XP rewards still use R(L), with B capped at 300 around level 61. Expanded level 100→101 needs 11,750 XP, while a first equal-level/equal-power bot win gives 195. The authored content horizon and available targets matter as much as reward cap; changing only the cap would not create new rivals.

Separate cap sensitivity, holding same-level power/outcome/bot percentage constant:

| Level | Existing B / first bot win | Hypothetical expanded-base cap 450 | Hypothetical expanded-base cap 600 |
|---|---|---|---|
| 25 | 105 / 68 | 105 / 68 | 105 / 68 |
| 50 | 240 / 156 | 240 / 156 | 240 / 156 |
| 75 | 300 / 195 | 450 / 292 | 600 / 390 |
| 100 | 300 / 195 | 450 / 292 | 600 / 390 |

These are arithmetic counterfactuals, not additional installed candidates or authorization to alter the approved +150 progression epoch. At L100/r1 the static current expectation is about 4.22 active hours per expanded level at 30 attacks/hour, versus about 2.11 with a 600 base cap. Both omit Health constraints, target availability, refills and strategy/equipment feedback. No end-to-end progression prediction or live activation claim is made.

## Alternative policies (offline, versioned research functions only)

All candidates preserve B≤300, D, 65%, bot repeat tiers, integer floor ordering, zero loss XP and the human three-win allowance. For a full-eligible win, replace the difficulty factor S/100 with:

* **A `continuous-v1`:** f(r)=.5(r/.35)² below .35; min(1.25,max(.5,r)) at/above .35. This joins continuously before integer rounding and removes the 1→78 cliff.
* **B `bands-v1`:** r<.1 → 1 XP; .1≤r<.2 → .10; .2≤r<.35 → .25; otherwise min(1.25,max(.5,floor(20r)/20)). More intelligible bands, but new discontinuities remain.
* **C `hybrid-v1`:** A plus an extra 100/50/25/10/0% factor on successive **easy** wins (r<.35). Fifth+ easy wins return to 1 XP before the ordinary bot policy. Meaningful opponents keep A. This needs a durable, versioned easy-victory sequence design before runtime implementation; the offline encounter ordinal is an assumption, not a hidden new production counter.

Extremely weak r=.01 targets still yield 1 XP in all tested levels. Humans retain 1 XP after three eligible successes under all alternatives. Defensive recipients are separately modeled; they spend no Stamina, so defender XP/stamina is null rather than inventing a cost. Bot defender XP remains zero and is explicitly identified, not mixed into human samples.

## Matrix and results

72 builds = levels 1/10/25/50/75/100 × offensive/defensive/balanced specialization × small (L) or full (5L) real-assumed armies × weak level-1 or appropriate best-unlocked equipment. Offensive/defensive training uses min(25,L−1) in its chosen rating; balanced splits L−1 across ratings, each capped 25; other points remain unspent. All are synthetic paid/maintained builds, not typical players. Both orientations, bot targets/human power proxies, first through fifth pair wins and trivial/weak/even/strong groups yield **16,080 distribution rows**. All 441 roll pairs are used; identical outcomes/targets feed all candidates. Human proxies borrow the cohort power/level template without changing runtime identity. Levels 75/100 use projected expanded fixtures; no active realm is observed.

The following representative first bot wins use offensive specialization, L participants and appropriate gear. They differ from the original training-8 reproduction above; there is no contradiction between 76.389% here and 78.323% there.

| Level | Policy | 1-XP % | P25 | Median | P75 | Mean | Max | XP/stamina |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Current / A / B / C | 100 | 1 | 1 | 1 | 1.00 | 1 | .80 |
| 10 | Current | 83.41 | 1 | 1 | 1 | 1.41 | 5 | 1.36 |
| 10 | A / C | 77.15 | 1 | 1 | 1 | 1.52 | 5 | 1.46 |
| 10 | B | 83.41 | 1 | 1 | 1 | 1.41 | 5 | 1.36 |
| 25 | Current | 96.56 | 1 | 1 | 1 | 2.81 | 109 | 2.62 |
| 25 | A / C | 39.70 | 1 | 4 | 11 | 7.51 | 109 | 7.00 |
| 25 | B | 38.62 | 1 | 5 | 9 | 8.50 | 107 | 7.93 |
| 50 | Current | 76.39 | 1 | 1 | 1 | 31.39 | 250 | 23.10 |
| 50 | A / C | 33.05 | 1 | 5 | 77 | 40.77 | 251 | 30.00 |
| 50 | B | 44.07 | 1 | 4 | 58 | 37.88 | 250 | 27.88 |
| 75 | Current | 38.36 | 1 | 40 | 146 | 74.03 | 347 | 36.60 |
| 75 | A / C | 0 | 25 | 78 | 146 | 90.77 | 348 | 44.88 |
| 75 | B | 0 | 29 | 63 | 146 | 85.11 | 336 | 42.07 |
| 100 | Current | 47.53 | 1 | 24 | 36 | 27.38 | 181 | 14.40 |
| 100 | A / C | 0 | 16 | 32 | 52 | 40.35 | 182 | 21.22 |
| 100 | B | 0 | 11 | 26 | 43 | 35.91 | 175 | 18.89 |

Current versus candidate easy farming, L50 equal-level bot target with r=.2, guaranteed victory under all rolls:

| Policy | First six awards | XP per 100 same-target victories | First-win XP/100 varied-target attacks |
|---|---|---:|---:|
| Current | 1,1,1,1,1,1 | 100 | 100 |
| A | 25,21,17,13,10,10 | 1,036 | 2,500 |
| B | 39,33,27,21,15,15 | 1,560 | 3,900 |
| C | 25,10,3,1,1,1 | 135 | 2,500 |

At r=.7, every candidate keeps the level-50 first bot award 109 and 100-same-target-wins total 4,464. At r=1, first award 156 but winning probability is 210/441=47.619%, so first-win expectation is 74.286 XP/stamina versus 109 at r=.7. Harder opponents give more **per victory** yet safe meaningful opponents can remain best **per encounter**. No candidate is represented as making difficult targets universally optimal.

Pacing assumes either 30 active attacks/hour (natural Freeblade Stamina) or 10 attacks/calendar day. The controlled matrix reports local hours/days at the current or approved projected requirement; repeated-target totals are conditional on that many wins inside one pair window. It does not assume 100 equal-power wins are feasible in one resource-limited session. Health, healing cost, opponent recovery, finite fresh targets, daily resets, level-up refills, shopping and choices can materially alter pace. This static comparison does not rerun the old dynamic economy model under new policies; that is an explicit activation blocker for numerical balancing.

**Preferred next experiment: C.** At L50 in this representative mix, it cuts 1-XP first wins 76.39%→33.05%, lifts median 1→5 and XP/stamina 23.10→30.00, while holding r=.2 repetitive farming to 135/100 wins versus A's 1,036 and B's 1,560. It retains meaningful r=.7 rewards. However, fresh easy targets still rise 25-fold in that controlled case. Large target pools/coordinated accounts and the durable easy-victory counter require a separate abuse and finite-resource progression study. Recommendation is **review and simulate further, not activate**.

## Reproduce and inspect

From `knights-reforged`, Node ≥22 with installed pinned dependencies:

```sh
node --import tsx scripts/historical-xp-study.ts
node --import tsx --test tests/historical-priority.test.ts
```

Without a local designated `TEST_DATABASE_URL`, the five database regression tests are explicitly skipped; the three pure tests run. For full PostgreSQL coverage use the verification instructions. Script output: [summary](xp-summary.json) and [complete gzip JSON](xp-results.json.gz). Decompress with a standard gzip reader or Node `gunzipSync`; `rows` has every distribution and `controlled` has matched strength/pacing/repeat conditions. No network, database, server startup, seed, provisioning or production command is called by the study.

Owner decisions: whether to adopt any smooth curve; acceptable fresh-target farming exposure; future easy-victory counter/window/version; post-50 combat/quest pacing; eventual cap changes. Keep 65% and the approved epoch plan unless separately changed. No production policy is installed or activated by this study.
