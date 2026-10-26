# Progression to 100 — reproducible finite-resource simulation

Baseline `7cf9a3a48284c96afe922b3473cce429339bd7e4`; three fixed seeds **1001/1007/1013**, 72 scenarios, 180-day maximum horizon. [Complete JSON](docs/level100-e1/progression.json), [comparison CSV](docs/level100-e1/progression.csv), [inputs/hashes](docs/level100-e1/provenance.json). These are synthetic planning results, not live forecasts or statistical confidence intervals.

## Real formulas retained

Current level requirements: early thresholds `[0,12,30,60,105,165,245,350,485,650]`, then `200 + 45×(L−10)`. Fresh level 100 needs **198,875 XP**; level 500 needs **5,489,875**. No stored attained level or lifetime/in-level XP is changed in this PR.

Proposal: `R_new(L) = R_legacy(L) + 150×max(0,L−50)`. Levels 1–50 are identical; fresh cumulative XP to 100 becomes **382,625**, to 500 **20,643,625**. Level 100→101 requires 11,750 and level 500→501 89,750. The +0 and +300 alternatives are modeled, not installed.

Combat XP is calculated by the **existing** `victoryExperience47`/`botVictoryRewards`: difficulty, level ratio, trivial-strength threshold, 65% bot percentage, then 100/85/70/55/40 fixed-pair-window multipliers and the 1-XP minimum. Losses do not consume a victory sequence. Human rules retain their existing three-full-reward budget and repeats. Bot loot still transfers actual exposed purse gold at 3%, with the defender-level cap that currently clamps at level 50 and maxes at **3,000**, then the approved repeat taper. Vault/reserves are not loot. The larger proposed XP requirement is **not** silently fed into combat's reward-budget helper; otherwise a curve change could accidentally increase XP awards.

## Modeled play, prerequisites and money

- Start level 1, 60 gold, no militia/allies, 100 Health, 20 Mana and 3 Stamina. One meaningful action per active minute, including buying, recruiting and healing; no actions while offline.
- Intensive: four two-hour sessions (06:00, 10:00, 14:00, 18:00). Regular: three 30-minute sessions (08:00, 13:00, 19:00). Occasional: one 30-minute session at 19:00. Alternative schedules are explicit below.
- Real regeneration/Calling modifiers, caps, fractional timers and earned skill points; a repeating allocation sequence Mana/Mana/Stamina/Health/Attack, with Stamina costing two points. Existing milestones, first victory and ten quests add only their actual existing points. No new expansion skill-point bonus.
- Real level-up refills, recorded separately from natural recovery and paid healing. Healing costs missing Health × ceil(level/10), uses carried funds and one action, and is attempted only when affordable within 5% of the purse.
- Quest choice considers actual army, owned requirements, purchase affordability and the real nonconsumed loot-key chain. Old quests accept the proposed numerical-equivalent mirror for a moved classic requirement; nothing is assumed owned for free. Repeatable quests retain their actual XP/Gold/Mana costs; new definitions are clearly separate proposals.
- Recruitment respects rolling 20/day, 30-second cooldown and unique accepted allies. The base case explicitly assumes enabled existing development-bot recruitment, so those finite invitations auto-accept. The 50% acceptance sensitivity approximates uncertain consent; it does not assert that real humans accept on command. No infinite member pool.
- Saved equipment purchases and progressive Land reinvestment debit actual money. Upkeep uses 5.1D's one shared income clock, accrued liability, arrears and affordable reserve; no Vault transfer, future income or instant bot refill. New lots get only their exact first partial period, with fractional numerators retained. Every scenario reconciles global stored money to net Land + quests minus actual upkeep/healing/shop sinks; loot cancels as a real transfer.
- The finite NPC pool shares Health, purses and recovery across the player's attacks. Selection examines at most 24 rotating candidates; it approximates defense from visible gear/army/Calling, ignoring hidden training, and favors worthwhile unfamiliar targets. This is a competent-player heuristic, not random novice behavior or perfect outcome knowledge. Losses, depletion, no targets, low Health/Mana/Stamina and paused equipment are recorded.
- Existing 450 bot blueprints are fixed reference snapshots, not observations of live autonomy. Proposed new bots use authored legal gear/skill budgets and finite audited initial resources. Bot autonomous purchases/duels, incoming human attacks, bounties, market luck and player competition are **not** secretly added as XP/income sources. Their uncertainty is assessed separately; 50% availability is an external-contention sensitivity mask, not proposed immunity/eligibility logic.

## Full comparison

| Persona | Scenario | Days to 100 / censored horizon | Actual win rate |
|---|---|---|---|
| intensive-8h | Current code/catalog/population | 43.25–43.25 | 99.8–99.8% |
| intensive-8h | Full proposal, old XP curve | 9.59–9.65 | 77.0–78.2% |
| intensive-8h | Full proposal, +150 curve | 22.48–22.81 | 48.7–48.9% |
| intensive-8h | Full proposal, +300 curve | 28.66–29.45 | 51.1–51.1% |
| regular-90m | Current code/catalog/population | 76.79–77.54 | 99.7–99.8% |
| regular-90m | Full proposal, old XP curve | 37.56–39.54 | 55.7–59.5% |
| regular-90m | Full proposal, +150 curve | 63.79–65.81 | 46.2–48.5% |
| regular-90m | Full proposal, +300 curve | 82.79–84.34 | 56.3–58.7% |
| occasional-30m | Current code/catalog/population | >180 (L85–86) | 99.7–99.8% |
| occasional-30m | Full proposal, old XP curve | 110.79–113.79 | 56.7–59.4% |
| occasional-30m | Full proposal, +150 curve | >180 (L97–98) | 46.4–50.5% |
| occasional-30m | Full proposal, +300 curve | >180 (L88–89) | 51.5–51.8% |


Recommendation: **+150**, conditional on the proposed content and worthwhile new rival cohort. The 8-hour grinder reaches about 22–23 days, near the 21-day aim; the regular 90-minute/three-visit player reaches 64–66 days. Occasional players have not reached 100 within 180 days. The +0 expansion is too fast; +300 slows intensive progress to about 29 days and regular progress to about 83–85 days.

These are approximate persona targets, not guaranteed minimum calendar times. Do not add a daily XP cap to force every schedule into a band.

## Sensitivity and ablation

| Scenario (three seeds) | Days to 100 |
|---|---|
| intensive-10h | 18.47–19.61 |
| regular-2h-one-visit | 63.81–63.86 |
| regular-2h-four-visits | 50.67–51.67 |
| regular-1h-two-visits | 97.33–97.81 |
| regular-half-availability | 65.81–67.33 |
| regular-low-acceptance | 68.35–68.81 |
| regular-mage | 65.33–66.55 |
| regular-no-reinvestment | 93.54–94.54 |
| intensive-8h-army-only | 43.25–43.33 |
| regular-90m-army-only | 78.54–78.54 |
| intensive-8h-expanded-old-population | 65.75–66.42 |
| regular-90m-expanded-old-population | 105.54–105.54 |


Four short visits at two hours total beat one two-hour visit because more naturally regenerated full resource bars are collected. A one-hour/two-visit schedule takes about 97–98 days; unusually intensive ten-hour play is faster than 21. The recommended curve does **not** put every conceivable consistent schedule in 60–90 days. Owner decision: accept this original-style advantage for return visits, or review a different curve before implementation. Changing recovery/capping legitimate play to hide the difference is not recommended.

Army-only ablations retain the old 450/catalog/XP curve: they do not fix meaningful combat rewards. New quests/curve with only the old cohort takes roughly 66 intensive /106 regular days. This isolates the opponent bottleneck rather than attributing all improvement to more equipment capacity.

## Concrete recommended-case outcomes (seed 1001)

| Metric | 8h intensive | 90m regular |
|---|---|---|
| quests | 591 | 823 |
| attacks | 7,194 | 3,308 |
| wins | 3,515 | 1,604 |
| losses | 3,679 | 1,704 |
| oneXpWins | 739 | 388 |
| repeatWins | 2,293 | 296 |
| xpQuest | 166,790 | 247,799 |
| xpCombat | 215,906 | 134,829 |
| loot | 6,589,546 | 3,684,676 |
| naturalMana | 4,497 | 8,383 |
| refillMana | 3,219 | 2,829 |
| naturalSpirit | 6,517 | 3,102 |
| refillSpirit | 677 | 206 |
| heals | 330 | 103 |


The intensive player reaches 100 with **461 actual participants /500 capacity**; the regular player with **495 /500**. No army was magically filled. Final intensive equipment upkeep is 103,129/hour against 247,802 net property income; regular upkeep is 175,417 against 366,174. The exercise does not assume a fully funded optimal 500-person legendary set.

For that intensive run, Stamina spent + remaining = 7,194 + 21; initial + natural + level refills + allocated capacity = 3 + 6,517 + 677 + 18. They match exactly. Mana and Health have equivalent independent identities, including skill increases and paid healing. Resource snapshots are at the last active action; economic books are additionally closed at the horizon without inventing offline actions.

## Remaining uncertainty and compatibility

No opponent is invented above the catalog: original blueprint levels stop at 50, so a static original cohort has no eligible target by level 61. Current live bots can legitimately level through autonomous combat; their actual distribution was not inspected and is not promised to fill 51–100 quickly. Current quests still let characters progress above 50, but with poorer variety/rewards. New quests are not enough to guarantee the dedicated target if rivals stay weak.

Only three RNG seeds are sampled. Stronger/easier player heuristics, weekend absence, multiple simultaneous humans, changed autonomous holdings, physical tap speed and different skill allocations can shift results substantially. The model is a calibrated proposal for playtesting, not proof of retention or a production balance guarantee.

Never edit the installed `alpha-0.3` curve: it explicitly checks compatibility with the earlier curve. Implement a separate immutable progression policy and per-character epoch/frozen-current-level entitlement under the existing character lock, after a compatibility rollout. Preserve `attained_level`, `xp`, `level_xp`, old receipts and all past awards. No retroactive XP, level rollback or bonus refills. See the migration plan for exact ordering.
