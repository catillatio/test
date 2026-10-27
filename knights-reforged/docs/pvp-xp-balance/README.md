# Bounded PvP easy-victory rewards

Draft proposal, October 27, 2026. Base: `d100a9a03b413b1947d1606db7c73cd37be278e3` on `release/production`. Implements a bounded revision of the offline Policy C experiment from PR #54. Approval to merge and deploy is still required. Nothing in this work contacts a production database, activates an existing realm, rewrites historical XP, or deploys a balance change.

## Gameplay evidence and attribution

The two owner-supplied screenshots show Kong repeatedly winning against Elowen Sunhollow, Hesta Highthorn, Galen Fairbriar, Orwyn Brightmoor and Idris Ravenfen. Every visible victory gives 1 XP, normal gold, 30 damage dealt and 3 received. The screenshots contain neither battle IDs nor saved power/level/eligibility snapshots.

All five names occur in `rulesets/passive-rivals-5/rules.json`: Galen `14:elite:1`, Orwyn `15:elite:0`, Elowen `18:elite:0`, Hesta `18:elite:2`, Idris `19:green:1`. More specifically:

| Screenshot gold, oldest to newest | Bot formula corroboration |
|---|---|
| Galen: 295, 250, 206, 162, 118 | Level 14 cap = 50 + floor(1.25 × 14²) = 295; floor(cap × 100/85/70/55/40%) reproduces all five values |
| Hesta: 250 then repeated 182 | Level 18 cap 455; fourth tier floor(455 × .55) = 250; fifth+ floor(455 × .4) = 182 |
| Elowen: repeated 182 | Same level-18 fifth+ cap |
| Orwyn: 281 | Level 15 cap 331; second tier floor(331 × .85) = 281 |
| Idris: 350, 275, 200 | Level 19 cap 501; third/fourth/fifth tiers floor(501 × .7/.55/.4) reproduce all three |

These independent matches strongly indicate bot encounters. They are **inferences from screenshots and catalog arithmetic**, not an assertion that production identities or battle rows were read. The read-only GitHub evidence exposes source; the available Railway connector exposes infrastructure/logs but no SQL or battle-snapshot query. No database credential was requested or extracted, no write-capable production connection was opened, and public feeds are not treated as private reports. **Actual stored snapshots remain unavailable.** The 30/3 damage pattern alone does not establish the XP strength ratio.

Distinguish the possible causes:

* Human repeat budget: PR #54 already counts only rewarded attacking wins; three eligible wins per opponent/rolling day, then 1 XP. Bots do not use that human quota. It cannot explain confirmed bot identities.
* Strength: the current `victoryExperience47` returns 1 before bot scaling whenever pre-roll defender defense / max(1, attacker attack) < .35. Rolls, gold and decisive damage do not establish that ratio. The previous 78.323417% audit was a synthetic first-bot-victory fixture, entirely attributed to this cutoff, not production incidence.
* Bot scaling: the full award is first floored at 65%, then floored again by the 100/85/70/55/40% pair tier, with a minimum of 1 at each step. Galen's first 295-gold victory already gives 1 XP, so later repeat tiers alone cannot explain all five of its rewards.
* Rounding: full awards 1–3 become 1 on a fresh bot. At level 5 even an equal-power full award of 3 becomes 1. These outcomes are deliberately preserved.
* Storage: a character at 2,147,483,646 lifetime XP can credit only 1 further XP. This edge must be checked from the stored snapshot; it is not a normal strength cause.

For an authorized JSON export containing only `{id,snapshot,result,rewarded}`, run `node --import tsx scripts/explain-pvp-xp.ts export.json`. It reads offline, reports all contributing causes and uses stored identities/sequence/power rather than present-day inventories or names. Missing snapshots/sequence are explicitly unverified. No historical rows are altered. Do not use the baseline calculation to overwrite recorded awards.

## Proposed formula and bounded exposure

New immutable numbers live only in `rulesets/pvp-xp-hybrid-1/rules.json`; the old JSON and pure helpers remain reproducible. `pvp-xp-policy.ts` is the pure calculator, `pvp-xp.ts` owns transactional accounting, and combat supplies existing eligibility, pre-roll power and bot victory ordinal.

Keep the existing base B (cap 300), relative level percentage D (25–150), bot 65% and repeat tiers, both bot floor operations, human three-win budget and every gold/bounty calculation. For eligible easy victories only:

```text
r = opponent relevant power / max(1, recipient relevant power)
S = 50 × (r / .35)²                         if r < .35
smooth = max(1, floor(B × D × S / 10000))
pairExtraPercent = [100, 50, 25, 10, 0][min(priorEasyWins, 4)]
fullCandidate = 1 + floor((smooth − 1) × pairExtraPercent / 100)
candidate = fullCandidate, or existing two-stage bot scale(fullCandidate)
legacy = exact pre-change award, including pair eligibility and bot floors
bonus = min(max(0, candidate − legacy), availableAccountBonus)
final = legacy + bonus
```

At/above .35 the exact old integer strength rounding remains; there is no incidental buff to meaningful opponents. Below .35 the first-win curve joins the old award within one XP. Repeated easy wins intentionally taper; an exhausted allowance can still produce 1 XP. This correction is not a promise that every weak target yields a meaningful reward forever.

The rolling 24-hour account allowance is proportional to 10% of the **legacy reward-base requirement**, capped at 200 extra XP. This is conservative under both progression epochs and never recalculates existing entitlements:

```text
C(level) = max(1, min(200, floor(legacyRequirement(level) × .10)))
remainingUnits = 10000 − sum(unexpired debits)
availableAccountBonus = floor(remainingUnits × C(level) / 10000)
debit = ceil(actualCreditedBonus × 10000 / C(level))
```

The unit sum is shared across targets, humans/bots, offense/defense, character slots, reconnects, logins and policy IDs. It does not reset at midnight or level-up. Every easy win is recorded for the recipient-account/opponent-account taper, including rounded/exhausted wins. Cross-role pair switching and replacing a character on an existing account cannot refill it. Since each debit is at least `bonus / 200` of the account allowance, **no rolling-day sequence can add more than 200 XP**, even with arbitrarily many fresh/cooperating targets and level changes. Integer rounding can leave a fraction of the allowance unusable; it cannot increase it. At L17 the capacity is 51, L25 87, L50+ 200. These are proposed balance choices requiring owner review.

The taper applies to the additional award rather than multiplying away the preserved 1 XP; this accounts for small differences from original C (e.g. L50 bot second easy win 11 instead of 10). The cap is applied **after** bot reductions, so the actual extra credited XP consumes the account budget.

## Persistence and preservation

Migration 027 adds only `pvp_xp_events` and two window indexes. Existing characters, XP/skill/progression epochs, receipts, battles, wallets, ledgers, bounty escrow and financial records are untouched. The policy is installed as a new immutable ruleset by the existing migration mechanism; startup requires its exact installed definition. Deploying this branch would change future combat only, after the normal approved release/migration process. There is no client selector, runtime admin endpoint or environment bypass.

Existing sorted character locks and an account advisory lock serialize budget reads and debits. Each event has one battle primary key, deferred battle FK, account/character FKs and range constraints. Debit and XP grant share the command transaction. Duplicate command IDs reuse receipts; rollback removes the award and event together. The debit uses **actual credited** bonus after the existing lifetime-XP storage cap. Passive autonomous bot-vs-bot combat keeps its existing rewards and creates no human bonus events. No pruning/reset job is introduced.

Human attack losses still grant zero. Three eligible human attacking wins remain unchanged. New defensive eligible easy wins also consume the defender's three-win pair allowance; legacy saved `defenderFullXp` flags remain untouched. Defensive progression still uses `restoreResources=false`. Damage, real Health/Stamina spending, legitimate offensive level-up refills, progression requirements, earned levels and points stay on the authoritative existing paths. No XP or financial backfill exists.

## Before/after examples

Equal-level L50, ratio .2, wins within one rolling day, sufficient budget:

| Scenario | Current | Original C | Bounded revision |
|---|---:|---:|---:|
| First bot victory | 1 | 25 | 25 |
| First six wins vs one bot | 1,1,1,1,1,1 | 25,10,3,1,1,1 | 25,11,4,1,1,1 |
| 100 wins vs one bot | 100 | 135 | 137 |
| 100 fresh bot targets | 100 | 2,500 | 300 |
| 100 fresh human targets | 100 | 3,900 | 300 |
| First six human wins vs one opponent | 1,1,1,1,1,1 | 39,19,9,1,1,1 | 39,20,10,1,1,1 |

At L50/.3499 the first bot victory changes 1→77; .35 stays 78. Equal-power first bot victory stays 156. The reproducible full award 208→135 after bot scaling stays 135. Ratio .01 stays 1 at every tested level. Exhausted human wins stay 1, and all attacking losses stay 0.

## Simulation and verification

`scripts/pvp-xp-balance-study.ts` imports the existing 900-entry cohort, legal equipment/training and actual combat, regeneration, healing, bot loot and progression helpers. `results.json.gz` is deterministic generated evidence; decompress as JSON. No network, server, database or population install is involved.

* Pure regression sweep covers every integer level 1–100, weak/equal/strong targets, humans/bots, first through sixth victories and three army sizes with legal offensive/tank/balanced gear.
* 69 cohort builds at L1/5/10/17/25/50/75/100 enumerate all 441 roll pairs. Each first target gets an isolated unused allowance; these distributions **must not** be presented as whole-session improvements.
* 256 controlled scenarios compare original C, current and bounded rewards across repeated/fresh targets.
* 240 finite resource-day runs cover representative L1–100 builds, actual Health/Stamina recovery/damage, paid healing from a finite purse, finite target Health/recovery, earned gold depletion, XP progression and legitimate level-up refills, both legacy and compatible +150 epochs. Fixed gear is assumed bought and maintained; no shopping, ally acquisition, maintenance cash flow or human behavioral model is claimed. One attack is considered per two-minute interval, at most 720/day, so these are explicit stress scenarios rather than typical play or maximum refill burst throughput. The bound itself is independent of this scheduler.

Representative offensive builds with L actual paid participants:

| Level | Isolated first-bot-win 1-XP share, before→after | Median, before→after |
|---:|---:|---:|
| 1 | 100%→100% | 1→1 |
| 5 | 100%→100% | 1→1 |
| 10 | 83.41%→77.15% | 1→1 |
| 17 | 93.38%→50.69% | 1→1 |
| 25 | 96.56%→39.70% | 1→4 |
| 50 | 76.39%→33.05% | 1→5 |
| 75 | 38.36%→0% | 40→78 |
| 100 | 47.53%→0% | 24→31 |

Whole-day easy rotation remains deliberately modest: L17 720→771 XP, L25 720→806, L50/100 720→920, each with 720 wins in its controlled expanded-epoch scenario. Most later wins remain 1 after the allowance is spent. At L50/50 participants, meaningful-target policy runs are identical at 51,091 XP, 372 wins/720 attacks, 44,772 gold paid healing and level 65 at day's end; these optimistic all-day snapshots illustrate existing progression, not an endorsement of live pacing. The new direct bonus never exceeds 200 in any run. Existing 1-XP baseline farming can still level early characters; this patch does not remove that economy.

Local validation: typecheck, build, static checks (99/99; 77 EJS fixtures), seven pure regression groups, and PostgreSQL combat/accounting/financial preservation tests. Full Linux CI remains required; its exact-head result belongs in the draft PR.

Reproduce from `knights-reforged`:

```sh
npm ci
npm run typecheck
npm run build
npm run check:static
node --import tsx scripts/pvp-xp-balance-study.ts
node --import tsx --test tests/pvp-xp-policy.test.ts
# A disposable localhost/designated *_test PostgreSQL database only:
TEST_DATABASE_URL=postgres://.../pvp_xp_test node --import tsx --test tests/pvp-xp-integration.test.ts tests/historical-priority.test.ts tests/phase49-rewards.test.ts tests/phase49-preservation.test.ts tests/pvp-economy.test.ts
```

The new tests are explicitly inventoried in existing CI lanes; no required check, timeout, safeguard or workflow is weakened. Changes classify as `full`, requiring validation, all unit/database/browser shards, recovery rehearsal and aggregate checks.

## Residual risk and release decision

Coordinated attackers can direct the capped bonus to a chosen defender without that defender spending Stamina. They still cannot exceed the same recipient allowance, and the attackers pay existing costs. Creating genuinely new accounts creates new account allowances: the patch bounds each account's progression, not a whole colluding organization. Existing meaningful-strength repeat rewards, bot 40% floor and baseline 1-XP victories remain farmable under their old rules. Deliberately changing gear to cross .35 can recover the **pre-existing** meaningful award; it cannot create unbounded new bonus. Raising those guards would expand scope and require separate review.

The cap makes this intentionally conservative: sustained overwhelmingly weak-target grinding still returns to 1 XP. Useful follow-up evidence is an approved battle export confirming Kong's ratios and a real-player target/pacing distribution. Do not promise the isolated 1-XP percentages as production outcomes. Review the 10%/200 cap and whether this conservative budget meets the desired play pace before approving merge, migration or deployment. No production balances or saved records were changed by preparing this draft.
