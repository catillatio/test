# Kingdom Come — Historical Knights Reforged Bounty & Skill Mechanics Addendum

**Recorded:** October 26, 2026  
**Purpose:** Preserve firsthand player testimony and original-game screenshots for a future, owner-directed reconstruction of bounty mechanics.  
**Status:** Historical reference and future implementation requirements; **NOT an instruction to deploy immediately**.

## 1. Owner's decision

The owner intends to change Kingdom Come's bounty logic to reproduce the historical Knights Reforged behavior described below. This is a future gameplay change requiring an explicit implementation plan, comparison with current code, regression testing, data-migration assessment, and owner review before merge/deployment. Historical screenshots are reference evidence, not game assets.

## 2. Firsthand player testimony — bounty lifecycle

The owner relayed the following firsthand historical-game player information:

- A single sponsor/burner account could place **up to 25 bounties on the same target in a rolling 24-hour period**.
- Across all sponsors, a single target could receive **up to 250 bounty placements in a rolling 24-hour period**.
- These were **placement counts**, not a count of successful claims.
- A target already present on the active bounty list **could not be listed again until the active bounty had been successfully claimed and removed**.
- A **successful claim was not necessarily the same as an ordinary battle victory**; the owner explicitly reports that a claim could happen with a battle defeat. The exact server-side trigger for this historical claim is **not yet established** and must be investigated rather than guessed.
- Claiming/removing a listing made the target eligible for another placement, **subject to the same rolling 24-hour sponsor and global target quotas**. A claim did not reset either quota.
- Players exploited this by using burner accounts: one account repeatedly listed a target and the hunter rapidly claimed each listing, up to 25 times; they then switched sponsor accounts until the 250-placement global target allowance was exhausted.
- Players recall **25 stamina** as a practical bounty-hunting build target because they could attack/claim rapidly. This does **not** independently establish a universal one-stamina-per-claim cost; verify the original stamina mechanics separately.

### Historical state machine (conceptual)

1. Check sponsor-target 25-in-24h placement count and global target 250-in-24h placement count.
2. Check whether target already has an active bounty listing. If yes, refuse another placement.
3. Place one funded bounty; count the placement against both rolling windows.
4. A hunter attempts to claim the listed bounty.
5. On an **actual successful claim event** (which historical testimony says might occur even when the hunter loses the associated battle), pay/settle the bounty exactly once and remove the target's active listing.
6. Target can be listed again if both placement quotas allow it.

**Important:** Do not implement step 5 as 'every defeat claims the bounty'. We have testimony about claim/result separation, not a verified claim predicate. Obtain a definitive rule or explicitly return this as an unresolved design question before coding.

## 3. Interactions with current Kingdom Come

- Current Kingdom Come Kills/Deaths counters were deliberately defined as successful bounty claims made/received, not ordinary battles won/lost. Preserve that distinction; assess whether the historical claim-on-defeat behavior changes accounting.
- Existing cross-level bounty hunting and ally eligibility should be preserved unless the owner explicitly changes them.
- Bounty escrow, payment uniqueness, locking, idempotent retries, anti-double-payment safeguards, financial conservation, notifications and history require compatibility review.
- Check rolling-window semantics carefully: time zone, exact 24h window, sponsor/target identity, retries, simultaneous placements, cancelled/expired listings and successful claim finalization.
- Distinguish a sponsor's placement limit **per target** from any total per-sponsor/global system limits; do not invent additional caps.
- Investigate whether 250 was truly a per-target cap or a broader global-list cap: the owner's current interpretation is **250 placements per target per 24h**, but the original wording 'global bounty limit' could benefit from corroboration.
- Do not treat historical abuse with multiple accounts as a required supported feature; preserve the original quotas while separately reviewing present-day abuse protections.

## 4. Skill-point and progression testimony (related reference)

- Former players explicitly reported **three skill points awarded per level** in Knights Reforged.
- Historical screenshots show unspent skill points, but screenshots alone do not establish the award rate; classify the 3-SP rate as **player-confirmed testimony**.
- Players recalled **1:1 displayed Attack/Defense increase per allocated point**. This does not establish the combat power formula.
- Recalled starting values (10 energy, 1 stamina, 10 health, 1 attack, 1 defense) are uncertain and should not be treated as verified.
- Historical leaderboards show levels above 300; these do not authorize raising Kingdom Come's current level-100 cap.

## 5. Evidence hierarchy and limitations

1. **Owner-reported direct player testimony:** 25 placements per sponsor/target/24h, 250 global placements/target/24h, claim needed to remove active listing, claim possibly accompanying battle defeat, 3 SP per level.
2. **Original screenshots:** corroborate repeated fast bounty activity, visible bounty placement/claim messages, combat-result presentation, skills and historical leaderboards.
3. **Inference:** burner-account sequence, design implications and state machine. Do not present inference as independently confirmed original server code.

Screenshots do **not** prove the precise original internal claim predicate, transactional behavior, rolling-window implementation or all original anti-abuse rules.

## 6. Proposed future Codex assignment — review first

Compare this addendum against the current `knights-reforged/` bounty implementation. Produce:
- An exact difference table between current and historical behavior.
- A proposal for 25 per sponsor-target and 250 per target rolling 24-hour placement accounting, including concurrent placements and durable counters.
- A separate investigation of the claim-on-defeat predicate, with unresolved questions flagged.
- Compatibility assessment for current Kills/Deaths, bounty payouts, gold escrow, notifications, bot policies and old records.
- Targeted test plan with race/retry and 24-hour boundary cases.

**Do not implement or deploy the historical bounty changes until the owner approves the exact semantics.** No unrelated UI, art, level-cap or economy changes.

## 7. Image inventory

The `screenshots/` folder contains original uploaded image bytes, unchanged. Filename-level SHA-256 hashes appear in `image_manifest.json`. Some images illustrate related skill, leaderboard, land or battle context, rather than independently proving a bounty rule. The archive deliberately does not reinterpret or edit them.
