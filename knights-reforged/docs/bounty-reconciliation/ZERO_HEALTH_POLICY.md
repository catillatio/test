# The one unresolved decision: literal zero-Health contract finishing

**Proposed only. No runtime implementation, flag, migration or activation exists.** This is the fallback expressly authorized in Part 2 of the October 27 request. The 25/250 changes and exact-contract safeguards do not depend on this decision.

## Evidence and the conflict

The owner confirms rapid relisting/claiming while the victim remained near zero or depleted. The historical addendum explicitly says the original stored zero versus minimum-positive floor is unverified. Current Kingdom Come stores integer Health ≥0, clamps real combat damage at zero, requires positive defender Health to attack, and verifies claims from a saved transition `before > 0 → after = 0`. Competitive death evidence also requires that transition.

At literal stored zero, an ordinary attack cannot actually remove remaining Health. Treating `0 → 0` as depletion changes the claim predicate. Inventing a temporary 1 Health, silently healing on relisting, allowing negative Health, or claiming after any previously saved hit would create material combat semantics unsupported by the evidence. None is installed here. Natural recovery to positive Health, real damage on losses, immediate relisting and subsequent genuine finishing claims are already verified.

## Narrow proposal for owner approval: a distinct depleted-contract finishing action

Keep stored Health exactly zero and explicitly distinguish a **depleted-contract execution** from a real health-depletion claim. This name describes a new compatibility rule; it is not asserted to be the recovered original algorithm.

1. Permit this action only when the authenticated human explicitly supplies the exact active bounty ID and target ID, current materialized target Health is still zero, the hunter is an eligible non-sponsor/non-target, and the ordinary hunter Health ≥20 and 1-Stamina requirements pass. Ordinary PvP and attacks without an exact contract remain exhausted at zero. Existing bot-target flags still apply; bots never initiate or claim.
2. Under the existing escrow and sorted character locks, recheck that exact listing and its expiry. Resolve a fresh ordinary combat roll and apply its genuine damage to the hunter. Save zero as both target Health values and **actual damage removed = 0**, separately from any calculated damage. Never label that result a positive-Health finishing hit. An attacking win is not required.
3. Spend one real Stamina. Award **no ordinary XP to either combatant, no ordinary gold, no progression milestones and no victory-sequence advancement for this exceptional action**. Pay only the real contract principal once. Positive-Health fights keep all current policies.
4. Record a distinct proof/source for this one contract/action. Award one claim Kill/Death with the distinct source visible in the report/feed; the ordinary roll outcome can remain visible separately. Keep unique contract/battle protections, idempotent replay and immutable history. Do not reuse a prior attack or timestamp-only association.
5. Close that listing. Keep the victim at zero with its original natural-recovery clock. A newly funded listing gets a new identity and another independently paid action, bounded by both placement quotas and normal hunter exhaustion. No automatic heal, negative HP, extra immunity or relisting cooldown.

This proposal deliberately changes the claim trigger at literal zero. That is the precise owner decision needed; its adoption cannot be disguised as a correction to the present positive-health formula. If it is rejected, retain the current natural-recovery requirement; the quota improvements still stand.

## Prospective acceptance cases (not claimed implemented or passing)

| Case | Required result if the owner approves this policy |
|---|---|
| Fresh contract, target 0, hunter eligible with resources | One fresh paid action, one escrow transfer, one new-source claim; target stays 0 |
| Ordinary roll lost | Same claim eligibility; true hunter damage/cost persists; no attacker-victory requirement |
| No contract, wrong target, stale ID, expired/canceled/claimed ID | Reject before combat, costs, XP, money or statistics |
| Sponsor/self, novice, disabled account, flag-disabled bot | Existing eligibility rejection |
| Hunter Health 19 or Stamina 0 | Normal exhaustion rejection; zero contract/financial effects |
| Two hunters race on one zero-Health contract | Exactly one succeeds; other spends nothing and receives nothing |
| Same command replayed, including after a new relisting | Return original receipt only; never execute or claim the new listing |
| Two consecutive relistings at 0 | Distinct funding/actions/proofs, exactly two principal transfers, two fees and two placement counts per relevant bucket; no heal |
| Natural recovery occurs before the action | Use ordinary positive-Health damage/XP/gold and actual finishing proof, not the exceptional path |
| Attack races with cancellation, expiry or another placement | Settles only the contract authoritative at the serialized action; no stale settlement |
| 26th pair / 251st target placement | Refuse placement and all charges even if previous zero-Health claims were rapid |
| Exceptional action after three ordinary wins | No ordinary XP/gold or sequence advance; existing positive-Health budget unchanged |
| Forced transfer/event failure | Entire action rolls back: hunter damage/Stamina, claim, principal transfer, proof and K/D |
| Legacy history / pre-cutover saved report | Preserve untouched; no retroactive proof, claim or reward |

## Compatibility work required after approval

The existing competitive-death verification accepts only genuine positive-to-zero evidence. Adopting a distinct source needs an additive/repeatable migration and reviewed evidence predicates, report/feed labels, claim source compatibility and updated tests. Never weaken the old predicate globally or reinterpret old rows. Any schema additions must allow old data and roll forward safely; mixed workers need an owner-approved cutover. A development-only prototype with real PostgreSQL tests should precede deployment approval.

The current PR needs no migration because it does **not** adopt this proposal. No owner input is needed to retain the completed quota and contract-binding changes; only this literal-zero exception remains for a separate decision.
