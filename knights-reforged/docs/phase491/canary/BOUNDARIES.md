# Canary authorization, monitoring and correction boundaries

Current authorization: **development and disposable/restored-copy testing only**. `bot-canary-proposal-1` is not a registered runtime policy. No operator/bootstrap/deployment workflow is provided or enabled. PR #13 is inactive; neither it nor the protected release worker is repurposed.

## Exact proposed scope

- Exactly the 18 logical slots in [MANIFEST.md](MANIFEST.md), six levels and all three tiers. Variant selection is fixed before financial/outcome evaluation. Thirteen are controls; five have one paid acquisition each in the current synthetic snapshot. No replacement bots, bulk-population application or autonomous follow-up purchases.
- Actual production mutation would require separately authorized read-only identity inspection, mapping each slot to immutable bot character/account UUIDs and active disabled-login population metadata. **Those live identities have not been inspected or approved.** Names and logical keys alone cannot authorize a change.
- An owner-review packet must bind code commit, policy version, exact UUID/account mapping, saved-state/paid-lot/holding hashes, catalog prices, exact additions/costs, maximum purse debits, maintenance treatment and projected after-state. It must contain the unchanged controls and aggregate ceilings too. Do not substitute the synthetic JSON or test boolean for an owner approval/signature.
- This experiment authorizes no sales, points, members, Vault movement, credit refund, health refill, Land trade or human mutation. The current candidate's exact total is 7,252 gold spent and 63/hour extra upkeep; operational ceilings 7,500 and 75/hour are limits, not permission to spend the difference on unlisted items.
- A future quote lasts at most 15 minutes. Expiry, changed prices, paid lots, finances, Health/state version, holdings or identity require a new review. Normal due income/upkeep must settle under ordinary locks **before** creating the reviewed quote, not silently during its execution.

The current [machine manifest](manifest.json) is explicitly synthetic and `productionAuthorized:false`. Its SHA-256 binds the complete proposal. [copy-manifest.json](copy-manifest.json) binds exact **disposable** UUIDs and real audit child transaction IDs from the rehearsal; normalized economic-intent hashes cross-check the exact financial/loadout effects. Neither artifact is a production capability.

Future real packets may include protected balances and private paid-lot history. They must remain privately access-controlled and encrypted for the approved operator/owner, never committed to the repository or printed in public job logs. This checkpoint commits only synthetic examples and introduces no production artifact store, secret, signing key or credential wiring.

## Objective gates proposed for owner review

| Gate | Go / stop criterion |
|---|---|
| Identity/preservation | Exact 18 selected identities, 450 bots retained; zero unrelated account/holding/history changes |
| Acquisition | Existing exposed purse only; at most one catalog type/two copies, level/ownership legal; zero sales/grants/points/member creation |
| Financial envelope | Each debit including maintenance top-up ≤10% saved purse; purchases≤7,500 total; added upkeep≤75/hour total |
| Solvency | Positive net; total equipment upkeep≤35% property net; incremental upkeep≤max(1,2% property net); at least four upkeep hours remain affordable |
| Power | Defense improvement 1–8% for each changed bot; attack growth ≤8%; no arbitrary multipliers; actual recorded loadouts produce the result |
| Matchup | No changed bot below 25% ordinary-benchmark win probability; no fixed profile loses over 15 percentage points |
| Pacing | Paired 1/2/6-hour/daily modeled loot differs≤10%; XP differs≤15% where baseline ≥100 XP; final levels differ≤1 |
| Conservation | Exact wallet+reserve accounting, unchanged Vaults; negative purchase/funding entries only; existing finite loot and 65% XP/repeat policy |
| Persistence | One committed audit per bot/version; replay never purchases again; no duplicate income after reconnect/restart |
| Readiness | Owner-approved exact packet, independent backup/recovery and actual-data copy verification, approved private execution channel; **currently absent** |

The first nine numerical/safety gates have synthetic evidence in [gates.json](gates.json) and [copy-verification.json](copy-verification.json). Thresholds are proposals for owner review, not retroactive proof of live fairness. Stop on any gate failure; do not tune an assertion, drop a control or select another bot to make it pass. A run with no affordable improvements is a **no-op/no-go for calibration**, not a reason to grant funds.

## Future monitoring and expansion — separately authorized

1. Before any future mutation: retain/verify an encrypted production backup using the established recovery controls, verify an isolated actual-data copy, and have the owner approve the exact canary packet and independently reviewed private operator execution. No initialization, provisioning or seed command is permitted. No release signing key or backup proof becomes bot-operation authorization.
2. Execute per bot under the existing character locks shared with battles and purchases. Re-read saved identity/state/paid lots and reject any mismatch. Commit the purchase, reserve-preserving repricing and complete before/after/child-receipt audit atomically. Controls receive no financial or progression writes. Apply once per policy version, not once per browser request or job run.
3. On interruption: stop pending work, inspect durable receipts through an authorized read-only channel, retain completed records and retry only identical completed intent or explicitly reapproved pending intent. An expired completed receipt can be read/replayed without a mutation; it cannot authorize a new purchase. Changed/reused command IDs or version/manifest conflicts fail closed. Never reset a bot to a preview snapshot.
4. Monitor the five changed bots and 13 controls immediately, after the next shared hourly boundary and across at least 48 hours. Reconcile exact real inventory additions, wallet debits, all existing paid lots/holdings, maintenance journals, income settlements, ordinary loot transfers, approved XP/repeat IDs, failed/duplicate requests and audit counts. Use current durable records; no new public diagnostics, polling or background shopping is introduced.
5. Expansion requires at least 20 eligible encounters per changed target from at least three independently identified human attackers, including different army strengths, plus an owner review of outcome/reward/resource changes. If the alpha population cannot provide this, remain at the canary. These minimum samples support observation, **not statistical certification**. Stratify by recorded pre-roll strengths/levels; do not compare an established army to a starter or promise the same win rate to all players.
6. Immediate stop conditions: extra/missing trade or receipt, positive unexplained credit, changed old record/identity, any human mutation, wrong target/configuration, negative balance, unaffordable upkeep, duplicate settlement, wrong policy/version, stale/expired pending quote, failure to reconcile due payouts, or measured power outside the approved bound. A pause does not cancel legitimate already-completed player actions.
7. No automatic expansion. Additional bots, altered costs, changed caps/thresholds, new assets/member acquisition or autonomous Phase 5 behavior need a new owner-reviewed scope/version/manifest and fresh copy tests. Existing human mechanics remain fixed.

No live monitoring, inspection, backup job or operation above was performed by this checkpoint. A secure live operator channel remains a prerequisite; this test prototype is intentionally not that channel.

## Realistic correction, without rewriting player activity

Stopping further changes is the first response. Existing paid items, spent gold, upkeep, looted gold/XP and every intervening player action remain part of history. Neither restoring a wallet snapshot nor restoring an entire realm over newer progress is acceptable.

For an individual correction, the owner must separately review its immutable bot ID, original canary purchase/paid lot/receipt, all subsequent purchases/sales/selection, remaining units and current finances. The safest result may be to retain the paid item and stop. If a compensating ordinary sale is appropriate, quote the **current legal FIFO** return and resulting power/upkeep; acknowledge that an older lot may be consumed first and that resale is less than purchase cost. Do not silently target a new lot around FIFO, mint a full-price refund, claw back legitimate player loot/XP, edit old receipts or erase an elapsed upkeep period.

Any approved compensation is a new exact-target, idempotent, audited transaction under normal locks and affordability rules. If ownership/history is ambiguous or the item has already been used/sold, stop for review rather than manufacturing a reset. No compensation mechanism or production permission is implemented here.
