# Phase 3 alpha implementation and reconstructed rules

Phase 3 builds on visual-overhaul commit `c121cc13e6ff66b2803a8fe4658dd35fcb51fb75`. All work is isolated on `feature/kingdoms-live-phase-3-alpha`. Earlier gameplay services, database history, recovered artwork and navigation routes remain available. The active immutable catalog is `rulesets/alpha-0.1/rules.json`.

## Fidelity and scope

| Mechanic | Evidence and implementation |
| --- | --- |
| Five tabs; Armory categories, illustrated rows, Buy/Sell | Verified in the APK/screenshots/video. Recovered tab states, gradients and screen backgrounds remain; new catalog rows and buttons reconstruct the appearance. |
| Mana for repeatable equipment-gated quests | Observed in the recording. Separate Buy required and Do It/Do Again actions are implemented; prerequisites remain owned. Content, rewards and thresholds are ours. |
| Spirit for attacks; Health damage/recovery; level refills | Roles and refills observed. Starting 100/20/3, recovery intervals and formulas are approved/provisional alpha choices. |
| Skill allocation | Recording supports Mana +1/point, Health +10/point, Spirit +1/two points. Current capacities rise by the same added amount; this refill-limiting policy is reconstructed. |
| Automatic army equipment | Observed help text supports at most one weapon, armor and spell per member. Attack/defense preference, tie-breaking and participation cap are reconstructed. |
| Equipment quantities, upkeep and resale | Quantities/upkeep/Sell controls visible. Exact original funding, insolvency and resale rules are unknown. Alpha uses recorded-cost FIFO sales and a disclosed safe maintenance policy. |
| Land and hourly income | Properties, income and ownership visible in screenshots. The 60-minute interval comes from player recollection and the established Land implementation. Scaling, sales and maintenance are alpha reconstructions. |
| Army and rival reports | Army sizes, character descriptions, Attack controls and battle reports are observed. Consent links, member contributions, level ranges, combat math and reward caps are reconstructed. |
| Item/property art | Original APK navigation/background art is preserved byte for byte. Eighteen new SVG object illustrations are authored Knights Reforged placeholders, recorded separately in `public/art/alpha/provenance.json`. |

No original server formulas, PHP implementation or complete historical item catalog are claimed as recovered. No historical servers are contacted. The recorded screenshots include Knights Reforged as well as original Kingdoms Live variants; they are references, not proof of identical mechanics across versions.

## Resources, progression and character

New accounts start with 60 gold, 100 Health, 20 Mana and 3 Spirit. Recovery uses server time and independent persisted clocks: Health +10 every 180 seconds, Mana +1 every 300 seconds, Spirit +1 every 120 seconds. Fractional ticks survive reads/actions. Resources cap at their persisted maxima. Full resources do not stockpile future recovery.

Cumulative new-character XP thresholds through level 10 are 0, 12, 30, 60, 105, 165, 245, 350, 485 and 650. Each further level needs `200 + (level - 10) × 45` XP. Excess XP carries. A level grants one point and restores resources. Unique milestones grant one additional point each for ten quests, level five and the first initiated PvP victory.

Mana capacity costs one point for +1, Health one for +10, Spirit two for +1. Allocation adds only that gained capacity to current resources, rather than refilling the whole pool. Capacity bounds are 500 Mana, 5,000 Health and 100 Spirit. No respec/refund system exists.

Freeblade, Warden and Spellward are cosmetic identities during alpha. They confer no hidden statistical advantage.

## Inventory, transactions and army equipment

The catalog has five weapons, four armor entries and four spells. The existing Iron sword keeps its ID and stats. Inventory is summarized by owner/item with a maximum of 1,000 copies, while acquisition lots retain original quantity, remaining copies, unit cost and ruleset. A transaction buys/sells 1–100 copies.

Sales consume oldest lots first, ordered by acquisition time and ID. Each copy refunds `floor(recorded unit cost / 2)`. The lot and summary remain at quantity zero for auditability; subsequent purchases reuse the inventory entry ID. Selling the last equipped legacy sword clears its obsolete slot reference.

Each participating army member can use at most one copy from each category. An army of three with one strong sword and two spears uses those three weapon copies; another 20 spare spears cannot provide 20 more bonuses. Attack selects attack first, defense second; defense reverses that order. Ties favor lower upkeep, then stable item ID. A paused maintenance account excludes upkeep-bearing gear but retains all inventory.

The leader counts as one participant. Available membership is `1 + retained militia + accepted allies`. The active cap is `min(101, max(1 + 2 × level, grandfathered army floor))`. Surplus recruits/allies remain stored. Militia cost 12 gold each, with a retained limit of 20. Pending invitations add no strength; only the invited player can accept. Either participant can remove their own link.

Members contribute a generic Militia-equivalent bonus and use the leader's equipment. Their private inventories are neither copied nor transferred. Ally-based attack protection is not implemented; eligible allies can currently appear as rivals. Exact original social-army rules remain undocumented.

## Quests and first-session progression

Eight repeatable quests span The Vale and The Marches. The first has no equipment gate; later quests introduce one item, multiple categories, level and army requirements, then a story prerequisite. Required items are not consumed. Buying missing equipment never silently runs the quest or spends Mana.

Rewards are server-selected integer gold ranges plus fixed XP. The first Fallen Abbey discovery guarantees a persistent Watchtower Map; later discovery rolls are relevant only if the map is not owned. The map unlocks the Silent Tower route and cannot be sold. Each saved quest run records its actual rewards, Mana cost, ruleset, loot and level result; retries return the same receipt, not another reward roll.

The initial patrol gives 8–12 gold and 4 XP for 2 Mana. Three runs reach level two. Ash Spear + Wicker Buckler requirements cost 18 gold and open 4-Mana/10-XP quests. Level refills sustain the first session, then recovery and hourly income support later visits.

The normal-account HTTP and browser playthroughs reach skills, multiple equipment categories, recruitment, an ally, a real rival fight, properties and loot without gold/XP grants. The actual one-hour income boundary is exercised by PostgreSQL clock fixtures and pure boundary tests. Human 10–20 minute pacing and long-term balance still need player sessions.

## Land and maintenance

Existing Smallholding, Woodland and Watchtower identities remain. River Mill and Crown Harbour add two original tiers. New purchase prices for the next owned unit are `ceil(base price × 1.1^owned)`, computed with exact integer arithmetic; bulk quotes sum successive prices. Ownership is capped at 100/type and 25 per transaction. Income does not scale with purchase price.

Each batch keeps its purchased rates, version and independent full-hour clock. Due completed hours settle before every read/action, including an offline defender's combat snapshot. There is no offline-hour cap. No continuously running payout worker is needed: the server materializes the exact accumulated amount when the character is accessed.

Land sales settle earned full hours first and refund half each recorded unit price, rounded down. Oldest batches sell first. Sold units forfeit their unfinished hour; remaining units retain their phase. Closed holdings, income settlements and sale records remain. New purchases start a fresh full-hour clock.

Property upkeep stays inside each existing property's contractual net payment. Equipment upkeep is separate, counts **all owned upkeep-bearing copies**, and uses one character-level timeline. It is not charged once per property.

The maintenance policy deliberately permits negative-income strategies:

1. Purchasing gear or selling property never requires positive passive income.
2. Due property income is collected first. Equipment charges accrue proportionally to server milliseconds, carrying fractional gold between settlements.
3. Active gear uses a displayed prepaid reserve, then carried gold. After an inventory change, the server tries to reserve one hour of the new bill. If that is unaffordable, the purchase still succeeds and upkeep gear pauses.
4. A later funding shortfall consumes available funds, caps arrears at one hourly bill, waives the remainder and suspends upkeep gear. Further charges stop. Free gear remains available; nothing is confiscated and wallets cannot become negative.
5. Resume pays the bounded arrears and funds one hourly reserve. Selling all upkeep gear returns unused reserve; outstanding arrears remain explicit until paid.
6. Inventory changes settle the previous rate first. Rate events, accruals, funding, reserve/arrears balances and waived amounts are recorded. Paused time is not charged retroactively.

Offline Land receipts and wallet funds are pooled at access before maintenance is calculated. This is a friendly alpha simplification, not an hourly historical cash-flow simulation. Land's displayed net assumes maintained equipment even if gear is presently paused.

The wallet retains its existing signed-integer ceiling of 2,147,483,647 gold. Income or sale credits above available room enter durable retained treasury storage with a separate movement journal; they are released as wallet room becomes available. Reserved maintenance funds are distinct from spendable wallet gold.

## PvP and reports

Eligible levels differ by at most the smaller player's `max(2, ceil(level × 0.2))` range. Selection and attack both enforce that rule. Rival lists use stable keyset pagination preserving PostgreSQL microseconds, display name/level/calling/army/Health and handle low population without fake players.

An attack costs one Spirit, needs both characters at 20+ Health and starts a ten-second actor cooldown. Power is the character's old base/level contribution plus one Militia contribution per additional participant plus quantity-limited selected equipment. Attack/defense rolls independently vary by ±10%; ties favor the defender. Loser damage is 12–30, winner damage 3. Health is bounded at zero.

The winner receives at most 5% of the loser's carried gold, capped at 50. Fights transfer gold; they do not mint it. Only an attacking victory gives 5 XP. The first three encounters initiated against a given target per rolling 24 hours can reward gold/XP; further encounters cost Spirit and inflict damage but award neither. This is bounded anti-farming protection, not account-abuse prevention.

Combat records both pre-action projections and immutable selected equipment, participation, rolls, damage, loot, eligibility, XP and post-level-up Health. Only participants can retrieve a report. Historical reports continue to render using their earlier format.

## Transaction and compatibility guarantees

All mutation commands use normalized server-selected intents, an account-scoped UUID receipt, a database transaction and stable ordered character locks. The client cannot choose prices, rates, actor identity, rewards, damage or server time. Identical retries return the stored outcome; changed intent under the same key is rejected. Failed actions roll back resources, economy, holdings and receipts together.

Migrations are additive and transactional under the existing advisory lock:

- `003_alpha.sql`: resources/progression, quantity summaries and acquisition lots, skills/milestones/loot, maintenance, closed holdings/sales, army links and combat metadata.
- `004_retained_treasury.sql`: durable retained-gold movement journal and opening entries for previous retained balances.
- `005_maintenance_audit.sql`: explicit rules/rate metadata and inventory-driven maintenance-rate events. Earlier events with unavailable rates remain unmodified and nullable.

Old accounts, sessions, character IDs, lifetime XP, attained levels, sword entry IDs/slots, recruits, quest/battle receipts, ledger entries, property snapshots, income history and retained balances remain. Legacy within-level XP is mapped proportionally into the new curve; legacy level is computed under its old XP/50 rule. Previous level/milestone skill entitlements are seeded once. Old energy is materialized at cutover and mapped to Mana with the ten additional capacity filled. The grandfathered army floor prevents loss of already usable recruits.

Legacy sword lot cost comes from its saved immutable ruleset. Unknown legacy item-price mappings stop the whole migration, preserving the old schema/data for review. Installed catalog definitions must match their recorded JSON; changes require a new ID/file and deliberate version registration, never editing an installed catalog.

No downgrade migration or production-database rewrite is provided. Stop the old application, back up and run `npm run db:migrate`; do not reseed or reset. Production data beyond the supported prototype schemas still requires its own backup/rehearsal.

## Verification and remaining work

[PHASE_3_VERIFICATION.json](PHASE_3_VERIFICATION.json) records the executed gates and exact environment. Tests include populated and clean migrations, receipt compatibility, rejected input, ledger reconciliation, concurrent sales/spending/attacks, offline recovery/income/upkeep, refund/overflow policy, full normal-account gameplay, production EJS fixtures, real browser forms and a compiled-process restart.

The browser reference checks preserve the APK tab icons and backgrounds, 50px tab content with safe-area padding, compact rows, and three resource meters. Thirty EJS fixture cases also cover zero/large resources, locked content, old reports and the paused-maintenance screen.

Remaining alpha limitations:

- Physical Android Chrome/WebView, accessibility/device combinations, cloud ingress and container builds are not verified here. There is no native Android package.
- This is a small 13-item/eight-quest/five-property catalog. Art is placeholder quality; classes are cosmetic.
- Human session timing, extended balance, hostile-load tests, multi-account abuse and long-term inflation require playtests. The 24-hour reward cap does not solve alternate-account farming.
- Bank/Hospital, Bounties, premium currency, password recovery, full achievements, comments and leaderboards are deferred. Exact original maintenance, resale, combat and social-army formulas remain unknown.
- No public deployment, merge, hosting purchase or player-data reset is part of this work.

## Economy arithmetic review

Run `npm run balance:report` for reproducible catalog tables. Starter all-category loadout (Ash Spear, Wicker Buckler, Ember Word) costs 26 gold/member with 5 attack, 3 defense and zero upkeep. A defensive Iron sword/Padded Coat/Hearth Ward set costs 73, with 9 attack/9 defense and zero upkeep. Mid-tier equipment totals 195/member with 23 attack/18 defense and 3 upkeep/hour. Top-tier totals 420, with 39 attack/31 defense and 9 upkeep/hour.

One starter property earns 7 net gold/hour; one Smallholding plus one Woodland earns 22. New same-type marginal payback grows with owned quantity. At the deliberately extreme 100-of-every-property cap, acquisition spend is 215,651,175 gold, gross income 23,900/hour and property upkeep 1,200/hour. Owning 1,000 of every catalog item adds 12,000/hour equipment upkeep. These are arithmetic bounds, not evidence of a balanced mature player economy; stronger anti-inflation or content adjustments must use a new version.
