# KINGDOM COME — PHASE 6: LIVING WORLD, RARE EQUIPMENT & COMPETITIVE PvP EXPANSION

## MISSION

Implement the next major gameplay expansion for Kingdom Come, building on the now-live level-100 progression, 900-bot population, expanded equipment catalog, and existing PvP systems.

This assignment combines three priorities:

1. **Enable and evaluate purchases-only bot autonomy.**
2. **Finalize rare quest equipment and King Hudson's special equipment grant.**
3. **Expand PvP, bounties, rivalries, leaderboards, and competitive incentives.**

The objective is to make Kingdom Come feel like a living, competitive multiplayer world while preserving the original Storm8 *Kingdoms Live* identity.

**This is an implementation assignment, not another research-only project.**

Complete the code, tests, simulations, UI and documentation. Prepare one coordinated draft PR for owner review.

Do not merge, deploy, activate production bot behavior, enable rare drops, or issue special equipment without separate owner authorization.

---

## PART 1 — PURCHASES-ONLY BOT AUTONOMY

### Objective

Activate the existing economic autonomy infrastructure for the additional 450 bots, initially in purchases-only mode.

The existing 450 original bots must retain their current behavior.

### Required behavior

New bots should independently:

- Purchase appropriate equipment.
- Improve offensive and defensive army strength.
- Acquire additional Land.
- Maintain adequate income for equipment upkeep.
- Accumulate and spend gold realistically.
- Progress economically according to their level, available resources and existing immutable policies.

They must not initiate autonomous bot-versus-bot attacks in purchases-only mode.

### Implementation

Inspect and reuse the existing:

- `living-expansion-economy-1`
- `living-expansion-duels-1`
- `inspect-autonomy`
- `set-autonomy`

Do not rebuild the bot economy or introduce a competing automation system.

Implement any narrowly necessary fixes to ensure economic progression works correctly.

### Economic evaluation

The existing capitalization model estimated approximately 6 million gold/hour in combined initial surplus for the 450 new bots.

Evaluate actual behavior using isolated, repeatable simulations and authorized aggregate production observations where available.

Measure:

- Aggregate gold creation.
- Equipment purchases.
- Land purchases.
- Equipment upkeep.
- Net wealth accumulation.
- Equipment improvements across level bands.
- Bots that accumulate money without improving gear.
- Economic differences between green, seasoned and elite bots.
- PostgreSQL write volume and storage growth.
- Transaction performance and contention.

Investigate the previously modeled 169 bots that showed no gear improvements.

Do not automatically increase bot funding or spending allowances to resolve this.

### Required safety controls

- Explicit owner approval before production autonomy activation.
- Purchases-only as the first active mode.
- No autonomous PvP until separately authorized.
- Defined economic monitoring and pause thresholds.
- No arbitrary gold creation.
- No account resets or destructive population changes.
- Idempotent purchases and transaction-safe accounting.
- Preserve legitimate upkeep and financial settlement when paused.

Prepare an exact owner-reviewed activation plan, but leave production autonomy paused until authorized.

---

## PART 2 — RARE QUEST EQUIPMENT

### Objective

Finalize and implement the quest-exclusive rare equipment reward system.

The system already supports rare equipment infrastructure. Extend and finalize the existing implementation rather than creating a new one.

### Existing proposal

The previously modeled rare-drop probability was:

**500 parts per million = 0.05% per eligible item opportunity.**

This is a proposal, not blanket approval to activate the probability.

### Required work

Inspect the existing quest rarity policies and verify:

- Eligible quests.
- Minimum level requirements.
- Actual item eligibility.
- Item-specific reward opportunities.
- Drop probabilities.
- Transactional reward delivery.
- Duplicate/retry protection.
- Equipment ownership and inventory accounting.
- Server-authoritative random selection.
- Ordinary equipment upkeep.
- Historical reward records.

Preserve the minimum ordinary acquisition level of 71 and the actual existing quest prerequisites.

### Balance analysis

Evaluate the proposed probability against realistic gameplay.

Simulate:

- Casual quest completion rates.
- Regular active players.
- Intensive players.
- Expected time to first rare reward.
- Expected copies over 30, 60 and 90 days.
- Effects on equipment prestige.
- Effects on late-game PvP.
- Effects on equipment upkeep and the Land economy.

Compare the 0.05% proposal against reasonable alternatives if needed.

Recommend a final rate supported by the model.

Do not silently approve or activate the rate.

### Player experience

Ensure rare rewards are understandable and exciting.

Implement appropriate:

- Rare reward presentation.
- Equipment identity and artwork support.
- Reward notifications.
- Inventory integration.
- Battle participation.
- Historical acquisition records.

Do not introduce guaranteed pity systems, resale mechanisms or new monetization without owner approval.

---

## PART 3 — KING HUDSON'S SPECIAL EQUIPMENT

### Objective

Finalize the existing King Hudson equipment allocation and its special upkeep entitlement.

### Existing grant

King Hudson's designated character UUID:

`55742e75-70c9-4792-8136-fe6ead2b83e0`

Approved item identities:

- King Hudson's Sword.
- King Hudson's Shield.
- King Hudson's Meteor Shower.

Proposed allocation:

- 15 swords.
- 15 shields.
- 15 Meteor Shower spells.

Total: **45 equipment copies**.

### Special entitlement

King Hudson pays zero upkeep on exactly these three equipment identities.

All other equipment and players retain normal upkeep.

The entitlement must be bound to immutable item IDs and the exact character UUID—not a username or display name.

### Required work

Verify and complete:

- Exact manifest validation.
- Quest-exclusive item definitions.
- Equipment ownership and participation.
- Existing grant idempotency.
- Zero-cost acquisition accounting.
- Exact three-item upkeep exemption.
- Historical ledger consistency.
- Duplicate grant prevention.
- Server-authoritative eligibility.
- Preserved special-item artwork references.

Use the existing `inspect-hudson` and `grant-hudson` machinery.

Prepare the exact production grant procedure.

**Do not execute the grant automatically.**

The owner must separately authorize the real grant after inspecting the target account, exact manifest and current recovery evidence.

---

## PART 4 — UNRESTRICTED CROSS-LEVEL BOUNTY HUNTING

### Objective

Restore the unrestricted bounty-hunting behavior that made the original Kingdoms Live competitive.

**Normal rival-level restrictions must never determine whether an eligible bounty target can be attacked.**

### Mandatory behavior

A level-100 player must be able to claim a bounty on a level-5 target.

Likewise, a lower-level player may attempt a bounty against a higher-level player.

Level differences may affect the combat outcome but must not prevent the bounty attempt.

### Important separation

Normal PvP:

- Existing rival-level matchmaking restrictions remain intact.
- Standard attack eligibility rules continue to apply.

Bounty PvP:

- Bounty-specific eligibility rules apply.
- Normal rival-level range checks are bypassed.
- The target must have a valid active bounty.
- Existing combat costs and other applicable safeguards remain enforced.
- The server must validate bounty eligibility independently.

Do not merely remove a UI restriction.

### Bounty death behavior

Preserve the intended original-style bounty mechanics:

- Reaching zero HP through a valid bounty claim produces the appropriate death record.
- A defender may win an individual combat calculation yet still die through the resulting bounty damage, if the existing authoritative mechanics permit it.
- Battle victory, kill credit, bounty reward and death accounting must remain separate concepts.
- Rewards are issued exactly once.
- Bounty claims and removals are transactional.

Test simultaneous bounty claims, repeated attacks, expired claims, insufficient resources and concurrent hunters.

---

## PART 5 — REPEATED BOUNTIES AND PERSISTENT RIVALRIES

### Objective

Support recurring player-driven conflicts without excessive artificial restrictions.

The original game's social competition included repeated bounty placement, group retaliation and long-running rivalries.

### Required behavior

Allow legitimate repeated bounty placement and claiming, subject to explicit resource, accounting and abuse safeguards.

Do not introduce broad daily bounty restrictions solely to prevent competitive bounty farming.

Historical estimates of approximately 25 placements per player daily and 250 globally remain unverified and must not be treated as authoritative limits.

Review current controls before proposing numerical restrictions.

### Persistent rival records

Implement a player-versus-player rivalry history that tracks:

- Encounters.
- Attacks initiated.
- Defensive encounters.
- Wins and losses.
- Kills and deaths.
- Successful bounty claims.
- Recent interactions.
- Relevant revenge opportunities.

Avoid double-counting repeated requests or transaction retries.

Preserve existing battle records and derive historical values where reliable, without inventing missing events.

### Revenge improvements

Extend existing Revenge and Attack Again features.

Players should be able to identify recurring opponents and revisit their profiles easily.

Normal Revenge eligibility must not become an unintended loophole for cross-level ordinary PvP.

---

## PART 6 — MEANINGFUL KILLS, DEATHS AND K/D STATISTICS

### Objective

Make competitive combat statistics accurate, persistent and publicly meaningful.

Distinguish:

1. Battle victories.
2. Battle defeats.
3. Player kills.
4. Player deaths.
5. Bounty claims.

Do not assume every battle loss is a death.

### Requirements

- Server-authoritative counters.
- Exactly-once accounting.
- Correct bounty-related death handling.
- Correct simultaneous attack behavior.
- No duplicate kill credit.
- Proper handling of combat retries.
- Historical compatibility.
- Protection against fabricated events.

Display appropriate statistics on player profiles.

Include K/D where mathematically meaningful, with sensible handling of zero deaths.

Do not retroactively invent kills or deaths from incomplete historical records.

---

## PART 7 — COMPETITIVE LEADERBOARDS

### Objective

Give players persistent competitive achievements and reasons to return.

Implement leaderboards for:

- Most kills.
- Best K/D.
- Most successful bounty claims.
- Most battle victories.
- Highest-level players.
- Most Wanted / bounty activity.

Prefer lifetime statistics for the initial implementation.

Daily and weekly leaderboards may be designed for later addition if they require substantial new infrastructure.

### Integrity requirements

- Efficient database queries.
- Pagination.
- Deterministic tie-breaking.
- Clear ranking definitions.
- No inflated counters from retries.
- Consistent handling of bots.
- No exposure of private account information.

Human-player leaderboards should not become meaningless because hundreds of development bots dominate them.

If bots are included, distinguish them explicitly and provide an appropriate player-focused view.

Do not artificially assign historical achievements.

---

## PART 8 — PLAYER PROFILES AND COMPETITIVE IDENTITY

Improve public profiles to display relevant competition history.

Potential additions:

- Total battle victories.
- Total defeats.
- Kills.
- Deaths.
- K/D.
- Bounty claims.
- Most recent rivals.
- Personal record against another player.

The interface should remain consistent with Kingdom Come's compact mobile-first design.

Avoid excessive dashboard clutter.

Allow players to navigate naturally between profiles, rival histories, bounty listings and leaderboards.

Do not expose private account data.

---

## PART 9 — BOUNTY CLAIM HISTORY AND NOTIFICATIONS

### Bounty history

Allow players to understand:

- Who placed a bounty, where the existing privacy model allows.
- Who successfully claimed it.
- When the claim occurred.
- The reward amount.
- The resulting death or combat outcome.

Do not expose anonymous bounty issuers if anonymity is an intentional existing game rule.

### Notifications

Extend the existing notification system for meaningful events:

- A bounty placed on the player.
- A bounty successfully claimed.
- A rival attack resulting in a significant outcome.
- A notable revenge or rivalry event.

Avoid spamming players with a notification for every minor event.

Deduplicate retries and repeated event processing.

---

## PART 10 — CLAN COMPATIBILITY WITHOUT BUILDING CLANS YET

Clans and guilds remain a future development phase.

However, the new PvP system should accommodate future organized player competition.

Design rivalry records and leaderboards so that clan affiliations and group statistics can be introduced later without rewriting combat history.

Do not implement a full clan system in this assignment.

Do not introduce artificial guild wars or automated faction warfare.

The emphasis remains player-driven rivalries.

---

## PART 11 — GAMEPLAY AND ECONOMIC PRESERVATION

The update must preserve:

- All existing player accounts.
- All 900 bots.
- Level-100 progression.
- 5× army capacity.
- Existing equipment ownership.
- Current combat balance unless an exact change is separately justified.
- Gold balances and ledgers.
- Land holdings.
- Equipment upkeep.
- Historical battle records.
- Current production artwork.
- Existing recovery and release controls.

If database migrations are necessary, make them additive, forward-compatible and recoverable through the established protected procedure.

Do not reset statistics or historical events.

Do not change existing bot population identities.

---

## PART 12 — TESTING AND PERFORMANCE

Use the CI/CD optimizations from the preceding assignment once safely merged.

During development, run targeted tests relevant to the changed systems rather than repeatedly running the entire suite after every small commit.

Required coverage includes:

- Cross-level bounty eligibility.
- Normal PvP level restrictions remaining intact.
- Bounty transactions and concurrent claims.
- Death/kill accounting.
- Rival history.
- Leaderboards.
- Profile statistics.
- Bot economic transactions.
- Rare-drop eligibility and idempotency.
- Hudson entitlement isolation.
- Account and financial preservation.
- Security and authorization.
- Mobile/browser rendering.

Run the appropriate complete final CI and independent recovery tests before presenting the final release candidate.

Do not weaken tests or security checks for speed.

---

## PART 13 — DELIVERY STRATEGY

Treat this as one substantial development assignment with internal milestones:

**Milestone A — Living Economy**

Purchases-only autonomy readiness, policy evaluation and economic reporting.

**Milestone B — Rare Equipment**

Quest rarity implementation, balancing and Hudson grant readiness.

**Milestone C — Core PvP**

Cross-level bounty eligibility, bounty death accounting, and persistent rivalry records.

**Milestone D — Competitive Experience**

Leaderboards, public statistics, bounty history, notifications and improved revenge navigation.

Each milestone should be independently testable, but the work should be coordinated under a single development branch and draft PR unless repository constraints genuinely require separate branches.

Avoid duplicating existing systems or repeating completed development.

### No unnecessary staging

Routine gameplay code should become functional through one owner-approved protected deployment whenever safe.

However, production bot autonomy, rarity policy activation and Hudson's grant remain explicitly separately authorized state-changing operations.

Do not bypass those authorization boundaries merely to reduce deployment count.

---

## PART 14 — DELIVERABLES

Produce a draft PR targeting `release/production` containing:

1. Implemented gameplay and UI changes.
2. Database migrations, if required.
3. Bot economic analysis and monitoring recommendations.
4. Rare-drop probability recommendation.
5. Hudson grant readiness and exact owner-controlled procedure.
6. Cross-level bounty tests and accounting evidence.
7. Rivalry and leaderboard implementation.
8. Browser screenshots.
9. Relevant CI and recovery results.
10. A concise production launch checklist.

Provide explicit PASS / BLOCKED / UNVERIFIED status for each major feature.

Do not call a feature complete if only a design document or dormant scaffold exists.

### Owner approval boundaries

Do not:

- Merge or deploy automatically.
- Enable production bot purchases or combat autonomy.
- Enable rare quest drops.
- Execute Hudson's equipment grant.
- Alter existing player wealth or progression.
- Remove production recovery gates.
- Change release permissions or secrets.

These actions require their own explicit owner authorization.

---

## FINAL DIRECTIVE

Implement Kingdom Come's next major gameplay expansion with particular emphasis on **living economic activity and meaningful player competition**.

Preserve the original game's addictive PvP, bounties, rivalries and long-term progression.

The goal is to make the world feel active, make rare equipment exciting, and give players reasons to compete repeatedly.

**Deliver working systems, not another long research report.**

Make full use of the existing infrastructure, minimize unnecessary CI/deployment cycles, and return one coordinated draft PR for final owner review.