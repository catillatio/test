# Army participation and bot difficulty — review only

No combat policy is adopted by this branch. Active rules, human PvP, bot identities, purses, Land, bounties, quests, recruitment, training, recovery and `bot-combat-rewards-2` are unchanged. This is an offline catalog/blueprint audit, not an inspection of live bots.

## What the current server actually does

- Humans: `capacity = min(101, max(1 + 2 × level, legacy_army_floor))`; participants are the lesser of capacity and `1 + existing militia + accepted allies`. Membership above participation capacity is retained. Human allies can grow beyond participation capacity; bot invitations still enforce the existing recruiting player's capacity and consent/cooldowns. Legacy militia storage has a separate 0–20 database constraint.
- Bots: runtime `stateFrom()` additionally clamps militia, capacity and participants to 10 and ignores allies. Provisioning is smaller still: `min(10, 1 + floor(level / 5), level capacity)` times green/seasoned/elite army percentages 40/70/100, rounded (minimum 1). At level 15 that gives 2/3/4 participants. A larger inventory alone cannot overcome the runtime 10 cap.
- Each participant can use one weapon, one armor and one spell. Each category selects the best available attack or defense, then the secondary stat, upkeep and stable item ID. Saved reports contain the **selected** quantities. Every owned upkeep item is billed, including items not selected. An unpaid maintenance account disables upkeep gear; free gear remains usable.
- Before training/Calling: `A = 5 + 2(L−1) + 3(P−1) + selected weapon/armor/spell attack`; `D = 5 + (L−1) + 2(P−1) + selected defense`. Apply 1% per allocated training rating (maximum 25), then the existing Calling percentage, with the server's hundredth precision. Barbarian is +4% attack/−2% defense; Tank −2%/+4%; Mage −2%/−2%. Recovery differences are preserved.
- Rolls independently enumerate integers −10 through +10. Attacker wins iff `round(A(100+rA)) > round(D(100+rD))`; ties defend. Winner loses 3 Health; loser loses `min(30,12+floor(abs(rolledA−rolledD)/200))`. Spirit costs 1, actor needs 20 Health, defender needs 1. Phase 4.2 immediate repeat flow remains authoritative; the older catalog's 10-second field is not a newly enforced cooldown.
- Bot green/seasoned/elite training is `min(25,floor(L/12)), min(25,floor(L/5)), min(25,floor(L/2))`; equipment level lag is 5/2/0 with deterministic variants; coverage 60/85/100%, rounded up. Existing `passive-rivals-5.calibrateSeasoned` is **false**. Both the old benchmark and provisioning cap at 10: neither models an established human army of 21–101.

Relevant implementation: `src/{alpha-rules,game,development,strategy-rules,commands,inventory}.ts`, `migrations/{001_initial,003_alpha}.sql`. No runtime files above were altered.

## Unchanged rewards and resources

Ordinary bot loot transfers `floor(min(15000, floor(exposedGold × .03), min(3000,50+floor(min(50,defenderLevel)²×1.25))) × pairPercent/100)` from defender to attacker. Vault remains protected. No losses advance the pair victory sequence. Pair percentages are 100/85/70/55/40 in the existing fixed 24-hour window, without shared daily or one-victory cutoffs.

XP remains `max(1,floor(max(1,floor(difficultyXP × .65)) × pairPercent/100))`. Difficulty XP includes relative level and **pre-roll** strength; defender strength below 35% of attack produces the 1-XP floor. A decisive presentation grants no extra XP. Human XP/loot and bounty escrow are separate and unchanged.

Spirit normally recovers every 120 seconds (Barbarian 108); Health restores 10 every 180 seconds (Tank 162). Base resources, paid healing, earned upgrades and level-up refills remain unchanged. Stronger opponents create more losses/Health expense; they do not make all higher XP awards profitable per attempt. Defender regeneration and a finite purse also limit sustained targeting.

## Alternatives compared

| Option | Participation/power | Benefit | Risk / recommendation |
|---|---|---|---|
| Current baseline | Existing level/101 human, 10 bot limits | No human balance change | Many established armies overpower every bot; weak-opponent XP is correctly 1 |
| Remove limits, linear | Every owned member contributes full base and equipment power | Simple, all armies matter | Reject: unbounded linear army advantage, enormous equipment demand and upkeep; worsens recruitment inequality |
| Remove limits, diminishing support | `E(P)=P` through 21; above that `E(P)=21+4 ln(1+(P−21)/4)` | Every member contributes, without linear power inflation | Candidate **only**: changes human PvP and bounties. Requires separate policy approval, precise rounding and schema/selector review |
| Bot-only finite loadout calibration | Keep humans unchanged; give bots deterministic real gear/army/training chosen against a fixed moderate reference | Least disruptive first balance experiment | Requires explicit authorization to adjust persistent bots, participant/storage limits and paid equipment costs; not implemented |

The numerical matrix combines each uncapped alternative with a finite bot-loadout search. It targets defense ratios .80/1.00/1.18 against a **fixed**, fully equipped, slightly lagged reference army `min(21,1+floor(L/2))`, never the current attacker's strength. It searches real catalog gear, participant counts and 40/60/80/100% coverage. This is not dynamic difficulty or a reward multiplier. Quantities and upkeep are recorded in the representative results.

The support candidate weights selected slots by `E(k+n)−E(k)` in normal selection order and replaces only army base contribution with `E(P)−1`. It still charges full ordinary upkeep for all real copies. This gives 21 effective participants at 21, about 33 at 101 and 52 at 10,000. It leaves the first 21 slots unchanged, but introduces a power change for larger human armies; approval is essential. For example, a fully equipped level-50 army of 101 changes from **29,973.01** attack to **9,927.02** under this candidate, while full equipment upkeep stays **17,574/hour**. That is about a **67% power reduction**, not a minor cap adjustment, and it must not be silently imposed on existing players. A real implementation must define fixed-point/log rounding, replay policy and maximum validated input; this floating-point offline experiment is not a production specification.

A bot loadout above 21 cannot currently be persisted as a single militia stack. Relaxing `armyCap` JSON alone is insufficient: `refinement-rules`, runtime clamps, `selectEquipment`'s 101 validation, the legacy floor constraint, projections, recruitment validation and a **bot-restricted** storage/migration design all require review. No human member, existing equipment or historic snapshot should be rewritten. No automatic free replacement gear, Land or capital should fund the experiment.

## Concrete results and economic limits

At level 15 the moderate reference has 8 members, attack **620.84**. Existing green/seasoned/elite defenses are **155.40 / 241.25 / 366.11**, with 100% attacker wins and **1 / 10 / 11 XP**. The illustrative revised legal-item loadouts produce **506.80 / 618.75 / 719.26** defense, approximately **100 / 52.38 / 4.54%** wins and **16 / 20 / 23 XP per win**. Extra equipment upkeep is **75 / 85 / 92 gold/hour**; the same unchanged estates retain **542 / 511 / 463 net/hour**. No purse or property grant is modeled.

The 1.18 elite target is too punishing as a routine match. Sensitivity calculations in `army-models.json` compare .80, 1.00, 1.04, 1.08, 1.12 and 1.18. Start a separately approved bot-only test near **1.04–1.08**, retain easy opponents and clearly label tougher rivals. Do not silently apply these targets to human PvP.

At level 50, the 21-member reference attack is **5592.87**. Current green/seasoned defenses fall below the 35% strength threshold and legitimately award 1 XP, whereas elite awards 85. Raising bot loadouts removes that mismatch but can require roughly **2,000–2,800 extra upkeep/hour** on the same estates. Each proposed portfolio's net income is calculated; new gear must have an authorized acquisition/funding plan and remain solvent without minting combat gold. Higher difficulty affects purse extraction speed, healing gold sinks and equipment demand, even when all reward formulas stay unchanged. Bot-only changes must not alter human bounties; production bot bounty targeting remains excluded by existing controls. A shared human support curve could alter finishing-attack frequency and therefore needs its own bounty concurrency/expiry regression review.

For 100/200 tests, current bots remain level 50 and are **ineligible** under existing level-range rules. Future proposal opponents use hypothetical level bases with the existing level-50 catalog only; these are mechanical stress cases, not new content, bots or legitimate reward forecasts. XP/gold outputs for these ineligible encounters are null. Future content costs, army representation and opponent bands require later design; there is no invented level-200 catalog.

## Evidence and recommendation

- `army-matrix.csv`: **3,744 scenarios / 11,232 matchups / 441 roll pairs each**, levels 1–50 and 100/200, armies 1/10/21/51/101/500/1000/10000, starter/lagged/best equipment. Above 1,000 members, the chosen item types stop at the real per-item ownership limit and leave an under-equipped tail.
- `army-models.json`: assumptions, representative real item IDs/quantities/costs, income deltas, eligibility and challenge sensitivity. `ARMY_MODEL_RESULTS.md`: readable table.
- `paced-baseline.json`: 48 deterministic accepted-policy sessions of 1/2/6 active hours, natural/established inventories, losses, blocked resources, natural recovery, level-up refills, gold, healing and upkeep, with conservation assertions. This preserves the existing Phase 4.9 simulator and does not activate the proposals. It is not a promise of player earnings.
- Tests independently compare baseline power with actual selection/training, preserve first 21 support slots, check monotonic finite behavior at large armies, enforce existing reward policy identity and account for every proposed upkeep copy.

**Recommendation:** keep the current policy for this polish release. Separately approve a bot-only calibration experiment with sustainable paid equipment and varied fixed difficulty targets. Review diminishing support as a distinct human-PvP proposal; do not combine cap removal with the low-risk report/audio changes. None of the alternatives is ready for production adoption merely because the offline tests pass.
