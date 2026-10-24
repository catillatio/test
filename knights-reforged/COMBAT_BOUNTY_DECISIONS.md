# Combat and bounty decisions — research only

No combat, rewards, bounty rules, catalogs, bot flags or production data were changed. Reproduce with `npx tsx scripts/phase51d-review.ts`; detailed numeric cases are in [the generated model](docs/phase51d/combat-bounty-model.json).

## Current implementation

[Combat](src/combat.ts) already gives a successful **human defender XP**, using `victoryExperience47(defenderLevel,attackerLevel,fullWins<3,defenderDefense,attackerAttack)`. Three full defensive rewards per attacker in a rolling 24-hour window are followed by 1 XP. Defensive level-ups do **not** refill resources. Gold goes only to an attacking winner; defensive gold is currently zero. Attacker victories take 3% of exposed gold, capped at 15,000 before fixed-pair 100/75/50/25/10% reductions. Bot attackers/targets retain the approved bot policy: 65% difficulty XP and 100/85/70/55/40 repeats; this report does not replace it.

Stored wallets and saved combat identities are authoritative. Vault and maintenance reserves/retained treasury are not loot. Normal level range, positive defender Health, at least 20 attacker Health and 1 Stamina remain mandatory; no bot may initiate an attack on a human. Equal rolled powers favor the defender. Exact variation outcomes: 0.2: 441/441; 0.75: 441/441; 1: 231/441; 1.2: 4/441; 2: 0/441.

## Recommended future defense model — needs separate approval

Keep existing defensive XP; **do not add a second XP award**. For ordinary eligible human-versus-human defensive victories only, consider gold = floor(min(5,000, floor(attacker exposed wallet / 100)) × pairMultiplier / 100). This is one third of the ordinary attack percentage/cap because defending costs no Stamina. Use the existing fixed pair-window percentages, counting wins by the actual winner against the loser in either battle orientation. Never mutate historical sequence rows. Zero gold, ineligible levels, allies or a trivial challenger (attack/defense < 0.35) produce zero proposed defensive gold. Keep existing legitimate zero-gold defensive XP; do not make XP depend on wealth.

Every gold unit must be debited from the locked attacker's actual post-upkeep wallet and credited through existing overflow-safe creditGold in the same transaction/receipt as the saved outcome. No minting, Vault access, reserve raid, refund, extra fee or bounty duplication. Continue to award Kills/Deaths only on valid bounty claims. Do not grant a passive defender an automatic bounty claim: current rules require the claimant's finishing attack. Exclude bots from an initial rollout; reviewing bot-versus-bot transfers or future bot-versus-human combat is a separate decision. Bot-initiated human attacks remain prohibited.

| Level | Current next-level XP | Poor purse 1,000: gold | Wealthy purse 1,000,000: gold | Sixth win: gold | Existing matched defensive XP | Trivial challenger: gold / XP |
|---|---:|---:|---:|---:|---:|---:|
| 8 | 135 | 10 | 5000 | 500 | 7 | 0 / 1 |
| 17 | 515 | 10 | 5000 | 500 | 47 | 0 / 1 |
| 25 | 875 | 10 | 5000 | 500 | 105 | 0 / 1 |
| 50 | 2000 | 10 | 5000 | 500 | 240 | 0 / 1 |
| 100 | 4250 | 10 | 5000 | 500 | 300 | 0 / 1 |
| 200 | 8750 | 10 | 5000 | 500 | 300 | 0 / 1 |

Example: a 100,000-gold attacker loses the first matched battle: proposed transfer 1,000; attacker retains 99,000; a defender carrying 500 reaches 1,500. Total remains 100,500. Vault balances are unchanged. At zero carried gold the transfer is zero. A level-8 versus level-100 attack remains forbidden regardless of any bounty or either purse. The 10% repeat gold floor conserves currency but still permits voluntary feeding; existing per-pair XP limits, real Stamina/Health costs and eligibility matter. Multiple accounts multiply independent XP budgets: do not mistake gold conservation for complete collusion prevention.

## Paced collusion stress model

Synthetic equal-power/tied-roll losses (a deliberately favorable defensive-farming stress case), 30-second opportunities, existing Barbarian Stamina recovery, Health recovery, starting Health 100/Stamina 3, optional real-cost healing and unchanged defensive level progression. Each attacker starts with 100,000 exposed gold; no Land income or Vault movement is generated. Attackers gain no XP from losses. Defender level-ups never refill Health. Normal level gaps eventually stop stale-level attackers. Power/Health maxima are held constant rather than inventing level-100/200 equipment. These are stress-model assumptions, **not a live progression forecast**.

| Start level | Hours | Attacker accounts | Paid healing | Battles | Defender gold | Existing XP | Defender level | Attackers' remaining gold | Healing sink |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|
| 17 | 1 | 1 | no | 23 | 4304 | 161 | 17 | 95696 | 0 |
| 17 | 1 | 1 | yes | 36 | 5529 | 174 | 17 | 94135 | 336 |
| 17 | 1 | 5 | no | 108 | 20851 | 798 | 18 | 479149 | 0 |
| 17 | 1 | 5 | yes | 108 | 20840 | 798 | 18 | 478504 | 656 |
| 17 | 6 | 1 | no | 106 | 11889 | 244 | 17 | 88111 | 0 |
| 17 | 6 | 1 | yes | 202 | 19674 | 340 | 17 | 77754 | 2572 |
| 17 | 6 | 5 | no | 508 | 57496 | 1198 | 19 | 442504 | 0 |
| 17 | 6 | 5 | yes | 508 | 56915 | 1198 | 19 | 441117 | 1968 |
| 100 | 1 | 1 | no | 23 | 4304 | 920 | 100 | 95696 | 0 |
| 100 | 1 | 1 | yes | 36 | 5504 | 933 | 100 | 92816 | 1680 |
| 100 | 1 | 5 | no | 108 | 20851 | 4593 | 101 | 479149 | 0 |
| 100 | 1 | 5 | yes | 108 | 20820 | 4593 | 101 | 475900 | 3280 |
| 100 | 6 | 1 | no | 106 | 11889 | 1003 | 100 | 88111 | 0 |
| 100 | 6 | 1 | yes | 202 | 18708 | 1099 | 100 | 68432 | 12860 |
| 100 | 6 | 5 | no | 508 | 57496 | 4993 | 101 | 442504 | 0 |
| 100 | 6 | 5 | yes | 508 | 56409 | 4993 | 101 | 433751 | 9840 |
| 200 | 1 | 1 | no | 23 | 4304 | 920 | 200 | 95696 | 0 |
| 200 | 1 | 1 | yes | 36 | 5475 | 933 | 200 | 91165 | 3360 |
| 200 | 1 | 5 | no | 108 | 20851 | 4593 | 200 | 479149 | 0 |
| 200 | 1 | 5 | yes | 108 | 20798 | 4593 | 200 | 472642 | 6560 |
| 200 | 6 | 1 | no | 106 | 11889 | 1003 | 200 | 88111 | 0 |
| 200 | 6 | 1 | yes | 202 | 17510 | 1099 | 200 | 56770 | 25720 |
| 200 | 6 | 5 | no | 508 | 57496 | 4993 | 200 | 442504 | 0 |
| 200 | 6 | 5 | yes | 508 | 55787 | 4993 | 200 | 424533 | 19680 |

Each row verifies attacker wallets + defender wallet + healing sink = initial money. Repeated/allied/trivial/disabled-account/replay and multi-account cases need a reviewed immutable reward policy before any implementation. IP/device fingerprinting, new daily global caps or an automatic collusion penalty are not introduced. Land stays the source of sustainable new gold: defense redistributes existing purses and cannot replace it as an inflation source. New upkeep automation may earmark legitimate earnings before a battle, so proposal inputs must use actual settled purses.

## Level-independent bounty placement

[Current placement](src/bounties.ts) and [finalized bounds](src/refinement-rules.ts): sponsor level 3 plus 5 quests; human targets have the same progress floor, targets must currently be in the sponsor's normal rival range, no self/ally targets, one active contract per target, 50 placed contracts per target/rolling day, 1–10,000 principal, 10% fee (minimum 1), 24-hour expiry and sponsor cancellation after one hour. Bot targets require the existing separate flag and active identity. Already-zero-Health targets can be listed but old damage/history never claims a new contract.

Recommendation: remove **only the sponsor-to-target relative-level comparison for placement**, after separate approval. Keep sponsor qualification and target onboarding protection (level 3/five quests), all escrow/fee/visibility/anti-ally rules, durations and limits. This means any *progress-eligible* target level, not exposing level-1 beginners. A truly unrestricted target floor is a separate owner decision. A level-8 sponsor could fund a level-100 target, but only a qualified, appropriately matched level-100-range claimant could attack/claim; a level-200 sponsor cannot gain permission to attack a level-3 target by paying.

Claiming stays unchanged: qualifying claimant, normal claimant/target rival range, no sponsor/self/ally claim, newly resolved attacking finisher with saved positive-before/zero-after Health and spent Stamina, inside contract creation/expiry, and one atomic active-to-claimed transition. Preserve the advisory escrow lock, deterministic character locks, target row lock, command idempotency and overflow-safe credits. Never turn a prior knockout into a retroactive claim. Canceled/expired contracts return principal once, not the placement fee. Simultaneous claims/refunds cannot both win the same status transition.

| Principal | Fee burned | Sponsor after placement (start 20,000) | Escrow | Claimant payout OR sponsor expiry refund |
|---|---:|---:|---:|---:|
| 1 | 1 | 19998 | 1 | 1 |
| 1000 | 100 | 18900 | 1000 | 1000 |
| 10000 | 1000 | 9000 | 10000 | 10000 |

For 1,000 principal: sponsor 20,000 → 18,900; escrow 1,000; fee sink 100. Claim releases exactly 1,000 to claimant; expiry/cancellation releases exactly 1,000 to sponsor. Those alternatives are mutually exclusive. Saved historical bounties/events keep original rulesets and amounts. No policy change is implemented here.

## Level-100/200 and 900-bot readiness

The existing uncapped XP requirement supports the numeric levels above; the 300 base-XP cap makes defense a diminishing fraction of high-level progression. Do not invent final expansion equipment/Land stats from this normalized model. Gold caps/percentages must remain bounded against larger wallets and overflow must stay retained rather than lost. Current human participation cap 101 and bot cap 10 remain unchanged; larger/stronger armies need their own reviewed balance work.

Moving from 450 to up to 900 bots would require a separately approved population migration, preserved old IDs, scheduling/load checks and strict release-count updates. Do not relax 450-bot verification now. Keep bounded batch processing/indexed event queries; do not simulate all N² rival pairs in ordinary requests. Placement range removal must not alter combat eligibility, reveal private balances, notify global bot activity or allow autonomous human targeting.

Owner decisions before future implementation: accept/reject the optional 1%/5,000 defense gold model, assess multi-account XP budgets, choose whether target onboarding protection stays, and explicitly approve any bot-defense participation. Required future tests: concurrent loser-wallet races, receipt replay, zero/overflow wallets, Vault/reserve invariance, pair-window boundaries, allied/alt farming, resource/level-up accounting, cross-level placement with unchanged attack restrictions, finishing-proof age, zero-Health targets, duplicate claim/refund races and 450/900-population compatibility. This Phase 5.1D PR installs none of these combat/bounty proposals.
