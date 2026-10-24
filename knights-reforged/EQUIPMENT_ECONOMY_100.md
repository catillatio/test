# Equipment and economy through 100, with 200/500 stress cases

Research baseline `7cf9a3a48284c96afe922b3473cce429339bd7e4`. All actual equipment/Land prices, stats, saved rates, balances and images remain unchanged. [Full sets and portfolios](docs/level100-e1/equipment.json), [numeric stress results](docs/level100-e1/numeric.json).

## Build identities and automatic selection

- **Offense:** highest attack in each category; defense is whatever those owned copies provide.
- **Tank:** highest defense in each category; accepts lower attack.
- **Balanced:** union of the best offensive and defensive definitions, with real full quantities of each distinct item. The existing selector switches direction automatically. It must not charge/use one item twice in the same category, but must charge upkeep on both owned sets.
- **Economy:** best directional gear with upkeep ≤3 per item, then union the two sets. This is a defined low-upkeep comparison, not a claim that all players select it. Zero-upkeep-only gear is another valid extreme. Do not make it as strong as expensive prestige gear.

The current strongest level-50 comparison uses Eclipse Greatsword, Seraphic Vestment and Eclipse Invocation for attack; Astral Conductor, Eclipse Citadel Plate and Seraph's Rebuke for defense. A balanced 500-person hypothetical needs 3,000 owned copies but selects at most 1,500 in one encounter. Current capacity makes 500 participants **ineligible at level 50**; these rows isolate numerical starting costs, not permitted current combat.

| Current definitions, hypothetical 500 | Equipment cost | Upkeep / h | Equipment attack | Equipment defense |
|---|---|---|---|---|
| offense | 12,700,000 | 87,000 | 121,000 | 97,000 |
| tank | 11,000,000 | 78,000 | 85,500 | 116,500 |
| balanced | 23,700,000 | 165,000 | 121,000 | 116,500 |
| economy | 310,000 | 6,500 | 19,500 | 19,000 |


## Authored level-100 proposal at actual army sizes

Equipment-only totals below exclude leader/unit baseline, Calling and training. These are not modified combat stats. All proposed costs are paid in normal Gold; no crafting, enhancement or new currency.

| Members | Build | Owned copies | Attack gear total | Defense gear total | Equipment gold | Upkeep / h | Property net for ≈50% upkeep | Land capex | Paid lots |
|---|---|---|---|---|---|---|---|---|---|
| 100 | offense | 300 | 43,500 | 34,700 | 13,900,000 | 34,500 | 69,083 | 2,059,311 | 247 |
| 100 | tank | 300 | 22,500 | 52,500 | 13,800,000 | 34,000 | 68,483 | 2,033,373 | 246 |
| 100 | balanced | 600 | 43,500 | 52,500 | 27,700,000 | 68,500 | 138,729 | 5,747,630 | 322 |
| 100 | economy | 500 | 3,900 | 3,800 | 62,000 | 1,300 | 2,631 | 26,090 | 51 |
| 250 | offense | 750 | 108,750 | 86,750 | 34,750,000 | 86,250 | 173,058 | 7,972,995 | 350 |
| 250 | tank | 750 | 56,250 | 131,250 | 34,500,000 | 85,000 | 171,118 | 7,842,466 | 346 |
| 250 | balanced | 1,500 | 108,750 | 131,250 | 69,250,000 | 171,250 | 343,699 | 22,100,071 | 443 |
| 250 | economy | 1,250 | 9,750 | 9,500 | 155,000 | 3,250 | 6,663 | 86,559 | 84 |
| 375 | offense | 1,125 | 163,125 | 130,125 | 52,125,000 | 129,375 | 264,161 | 14,929,746 | 403 |
| 375 | tank | 1,125 | 84,375 | 196,875 | 51,750,000 | 127,500 | 264,161 | 14,929,746 | 403 |
| 375 | balanced | 2,250 | 163,125 | 196,875 | 103,875,000 | 256,875 | 513,752 | 40,065,012 | 500 |
| 375 | economy | 1,875 | 14,625 | 14,250 | 232,500 | 4,875 | 9,861 | 145,080 | 105 |
| 500 | offense | 1,500 | 217,500 | 173,500 | 69,500,000 | 172,500 | 346,774 | 22,399,533 | 445 |
| 500 | tank | 1,500 | 112,500 | 262,500 | 69,000,000 | 170,000 | 341,549 | 21,892,571 | 442 |
| 500 | balanced | 3,000 | 217,500 | 262,500 | 138,500,000 | 342,500 | 692,930 | 63,270,523 | 555 |
| 500 | economy | 2,500 | 19,500 | 19,000 | 310,000 | 6,500 | 13,000 | 208,665 | 119 |


The balanced 500-person example costs **138.5 million** equipment gold and **342,500/hour** upkeep. It has the offense set's attack and the tank set's defense, at the sum of their upkeep. It is allowed to be expensive and versatile. The economy comparison pays only 6,500/hour, accumulates wealth faster and is much weaker in direct combat. More copies of cheap gear cannot exceed the same participant capacity.

Ownership and selected quantity are separate: 500 balanced members own 3,000 copies across six IDs; an encounter uses three category slots per member. Level 500's 2,500-member case owns 15,000 copies, with 7,500 selected; the current 1,000-copy SQL CHECK would reject individual 2,500 stacks and must be changed before that case is executable. E1 changes no CHECK.

## Land: real progressive pricing, not arbitrary wealth

For each type, copy `n` costs `ceil(base × 1.1^n)`. The portfolio model selects the lowest available marginal cost/net-income unit at each step, respecting unlocks, 100/type ownership and valid integer quotes. It is a reproducible **greedy feasible portfolio**, not proof of a globally optimal integer solution. The table's 50%-upkeep case targets property income twice equipment upkeep; it includes genuine property upkeep in the net rate.

Existing saved holdings always retain their own income/upkeep/acquisition prices. Gold Mine remains display-only for stable ID `moonwell-sanctuary`; Crown Harbour, Tempest Port and all approved art are retained. New properties join the same hourly cycle and receive only eligible first-period earnings.

Three strategies are explicitly valid:

1. **Maximum sustained power:** property net approximately equals upkeep. Requires an existing funded one-hour reserve; spending every future earning on upkeep leaves no growth/healing/bounty budget.
2. **Balanced reinvestment:** half the property net funds upkeep and half remains for equipment, new Land, healing and competition.
3. **Economy:** low ongoing costs and substantial surplus; accepts lower army strength. It is not forced into equal win rates with a fully equipped balanced army.

Zero surplus is not an accounting bug. With property net 342,500 and active upkeep 342,500, a prepaid 342,500 reserve can be consumed/refilled at the existing hourly boundary with zero net spendable growth. All obligations still count. A raid that removes the reserve-free wallet does not authorize a Vault withdrawal. If income/funds fall short, existing suspension/arrears rules apply; actual later income can resume upkeep under 5.1D. Never advance tomorrow's income or run a second upkeep payment clock.

Offline settlement retains exact fractions and saved boundaries. New funding is a wallet-to-reserve asset movement; it is not a second maintenance expense. The model's invariant is:

`initial stored cash + actual net Land credits + quest gold − charged upkeep − actual shop spending − healing = final wallet + Vault + reserve + retained gold`.

Ordinary loot cancels between real purses. The simulation additionally reconciles Mana/Stamina/Health, skill increases, natural recovery, damage, paid healing and level refills. Initial authored NPC capital is declared separately from sources earned during the study.

## Numeric boundaries and forward compatibility

| Level | 5× capacity | Largest item stack | Upkeep / h | Largest rolled attack (25 training) | Proposed cumulative XP | Seven-day upkeep |
|---|---|---|---|---|---|---|
| 50 | 250 | 250 | 82,500 | 8,773,050 | 43,750 | 13860000 |
| 75 | 375 | 375 | 152,250 | 17,717,700 | 152,250 | 25578000 |
| 100 | 500 | 500 | 342,500 | 31,345,600 | 382,625 | 57540000 |
| 200 | 1,000 | 1,000 | 685,000 | 62,691,200 | 2,522,875 | 115080000 |
| 500 | 2,500 | 2,500 | 1,712,500 | 156,728,000 | 20,643,625 | 287700000 |


Levels 200/500 reuse the proposed level-100 items as a stress input; **no level-500 content/stats or pacing are invented**. All studied powers fit safe JavaScript arithmetic and even a conservative signed-32-bit comparison; rolled combat powers are actually stored in JSON, not an integer column. Hourly rates and current/proposed cumulative XP through 500 fit existing integer bounds. Preserve explicit safe-integer multiplication/aggregate checks as future stats grow.

The wallet and Vault each cap at **2,147,483,647**. Retained overflow already uses numeric/BigInt journals and must never be dropped, silently rounded or automatically moved out of Vault. Aggregate property/equipment capital may legitimately exceed one wallet: the 2,500-member balanced half-income Land portfolio costs about 2.93 billion across many valid purchases. That is not authorization for one oversized transaction.

New property bases exceed the active catalog validator's 140,000 maximum. More importantly, `estateState` eagerly computes future quote steps: high new bases can exceed the treasury bound **before** 100 owned copies. For the proposed 2.2-million property, later unit quotes overflow the present integer rule. Future code must return a bounded valid prefix and a clear treasury-limit reason, keeping historical holdings and precise prices; it must not crash the entire marketplace, wrap, clamp the price downward or accept an unaffordable batch. Preserve 25-Land/100-equipment transaction limits and existing idempotent/CSRF-safe recovery.

A blanket BIGINT money migration is not required to make level 100 work. Before a later expansion permits individual prices above the current wallet cap, review SQL fields, API string serialization, exact ledger arithmetic, browser formatting, payment previews and recovery tests together. Never remove today's cap/assertions to make a spreadsheet fit.

## Combat incentives and NPC money

Land is intentionally the main upkeep source. The unchanged 3,000 bot loot ceiling limits how much huge NPC estates can transfer to a human; it can also make wealthy upper-level bots look equally rewarding after the ceiling. A max-power 500-person army cannot reasonably finance all its daily upkeep from bot loot alone. Keep 65% XP/gold/tapers in the first reviewed expansion unless a separate combat-economic decision changes them; do not silently raise caps with attacker level. Human purses, difficulty, reputation, bounties and long-term rivalries remain meaningful.

The prototype NPC fleet's capitalization and net rent are large: see the population report. Existing bots receive **no** asset grants or balance correction. New-cohort capital, resource-funded future development and storage must be explicitly approved before provisioning. Current autonomous buying's 5,000 cap cannot purchase any of the 36 proposed upper-tier items; simply adding gold does not fix that rule.
