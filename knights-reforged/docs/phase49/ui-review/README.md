> Owner decision: all five UI refinements and the property-art direction are APPROVED. The first four-clip reward-audio audition is REJECTED. This page records the earlier UI checkpoint; current [art integration](../art-integration/README.md) and [new orchestral audition](../audio-orchestral-audition/README.md) supersede its asset-status discussion below. New audio remains unapproved and outside runtime.

# Phase 4.9 — Interface and audition review

**Owner review checkpoint, not a release candidate.** Approved `bot-combat-rewards-2` remains immutable at 65% XP with the unchanged 100/85/70/55/40 pair percentages. No economy, combat, resource-recovery, bot-finance or release-infrastructure changes. PR #12 stays draft. No production database or Railway service was accessed.

## Implemented interaction stage

1. **Silent routine controls.** Removed ordinary click/navigation playback and the 55ms audio navigation interception. Gesture unlock remains silent; meaningful committed rewards, defeat and error cues keep the existing engine. Routine server receipts return no fallback click. Existing sound preferences and reward receipt deduplication are preserved. Original runtime audio assets are unchanged pending audition approval.
2. **Profile Stats and Income.** Compact native disclosures show battle/quest summaries and net hourly income. Supporting stats, bounty-only Kill/Death explanation, gross income and upkeep remain expandable. Upkeep suspension remains visible. Army/Equipment still precede holdings; private balances stay private.
3. **Calling on Home.** The tile sits beside Hall of Champions, shows the current Calling and opens `/game/home?calling=1#calling`. The normal validated Calling command returns to that panel. Costs, 24-hour restriction, internal identifiers and bonuses remain unchanged. Profile retains the management link and secure Sign Out. No sixth navigation tab.
4. **Compact Hall.** Four one-row category selectors retain full accessible names. Ranked rows are tighter, with 44px profile targets, own standing and recorded XP where appropriate. Help moves into the existing rules disclosure. Lifetime calculations, top-twenty limit, bot exclusion, tiebreakers and queries are untouched.
5. **Neutral surfaces.** Additive `public/phase49.css` changes green-biased panel/background surfaces to charcoal/steel and restrained gold. Bronze button geometry, approved framing and marketplace density stay intact. Teal Health/Mana/Spirit backgrounds and resource meters remain intact.

## Screenshots

Actual rendered pages from an isolated synthetic realm; no real player accounts or production records. Mobile viewports are 320/390/430 × 844. Open the individual PNGs for full-resolution review.

| Width | Home | Profile | Expanded Profile | Calling | Hall | Land preservation |
|---|---|---|---|---|---|---|
| 320 | [View](screenshots/320-home.png) | [View](screenshots/320-profile.png) | [View](screenshots/320-profile-details.png) | [View](screenshots/320-calling.png) | [View](screenshots/320-champions.png) | [View](screenshots/320-land.png) |
| 390 | [View](screenshots/390-home.png) | [View](screenshots/390-profile.png) | [View](screenshots/390-profile-details.png) | [View](screenshots/390-calling.png) | [View](screenshots/390-champions.png) | [View](screenshots/390-land.png) |
| 430 | [View](screenshots/430-home.png) | [View](screenshots/430-profile.png) | [View](screenshots/430-profile-details.png) | [View](screenshots/430-calling.png) | [View](screenshots/430-champions.png) | [View](screenshots/430-land.png) |

[390px Calling bonuses expanded](screenshots/390-calling-details.png). The Hall screenshots use the actual Highest Level category and ten synthetic human accounts; all four categories are navigated in the browser checks, including empty states.

## Regression and preservation evidence

[Final verification](verification.json) records the actual full-suite, TypeScript/build/static and browser results.

- `tests/phase49-interface.test.ts`: routine sound hints are silent; Calling Home/legacy navigation is allowlisted, CSRF-protected, cost/cooldown-safe and same-key idempotent; reported messages remain visible until authorized hide; one synthetic operator hide disappears from All/Broadcasts while another broadcast and accounts remain intact.
- `scripts/browser-phase49-ui.ts`: 19 captures, keyboard disclosures, all four ranking categories, 44px touch targets, five tabs, no horizontal overflow, Calling adjacent to Hall, actual successful Calling/retry, silent ordinary controls, preserved gameplay tables and identity/XP/skill/Calling/capacity snapshots before the deliberate test-only Calling change. All 450 bot identities stay intact.
- Teal resource-row computed background and height are identical with/without the new stylesheet: 46px at mobile widths, 80px at 1024px. Land rows remain 98px mobile and 126px desktop. The existing resource meters and market controls are not resized.
- Updated `scripts/browser-phase47-test.ts`: 17 meaningful cues decode to non-silent AAC, duplicate cues suppress, navigation stays silent, purchase/Buy More recovery, expired-session reauthentication, original gameplay, reduced motion, context cleanup and 64 responsive visits pass. Calling assertions now check its new Home location and Profile Sign Out separately.
- Existing populated migration, old receipt/session, bot economy, bounty, Origin/CSRF and production release-guard tests are retained. No SQL migration, initialization, seed, provisioning, grant, role change or protected workflow edit is introduced.

## Separate audio and artwork auditions

[Reward audio](../audio-audition/README.md): four short recorded-sound edits (victory, defeat, quest, level-up), a combined reel and tap-to-play HTML. Official Kenney CC0 source archives are checksum-verified; edit parameters, output hashes, licenses and measured peaks/RMS are included. No ordinary button sounds or background music. **Not adopted.** Physical Android/iPhone listening and Safari acceptance remain owner checks.

[Property artwork](../art-audition/README.md): original less-fiery Wyrmcrest Keep above, proposed Gold Mine below. Provenance and image checksum included. **Not adopted.** Preview lighting is brighter than the dark marketplace reference and the scene is more detailed; review compact cropping before adoption. The Gold Mine name remains mandatory, but its runtime presentation rename/art mapping is a subsequent compatible step retaining stable ID `moonwell-sanctuary`, holdings, paid costs, rates and historical receipts. No catalog values change.

## Historical Gray broadcast status — superseded

**Current owner direction (comment 6303697572): Gray removed his own message. No further moderation or name correction is requested.** The following is the earlier checkpoint's access limitation, not a current task. Audio and property integration are now approved; [final review](../FINAL_REVIEW.md) supersedes this stage's pending-review statements.

**Not removed here; immutable message ID is still unknown.** The owner reports Development Knight was already removed through the UI and explicitly excludes it from further action. The current authorization is only for Gray’s exact reported message, once conclusively identified.

The UI says Reported for review because the viewer has submitted a report; it does not confer moderation privileges or hide the message. Broadcast Remove is author-only. Existing operator CLI supports one-record reversible audited hiding, but no trusted production execution channel or credential is available here. [Current diagnosis, DOM-only ID extraction and shortest safe operator procedure](../BROADCAST_REVIEW.md). No broad deletion, permission upgrade, new admin endpoint or release operation is performed. This remains a required release item until live evidence exists.

## Review scope and remaining limits

Please review mobile proportions, the Home Calling entry, Profile summaries, Hall density and neutral panel palette. These refinements preserve the approved Land visual language; they are not a replacement visual theme or a claim of pixel equivalence to the mockup. Short Hall selector labels are intentional, with full accessible names and a full category heading. The shared header remains compact and teal.

Audio and artwork each require explicit owner approval before runtime adoption. Tutorial/battle presentation remains lower-priority backlog work, beyond neutral surface polish. Gray moderation remains blocked. No physical-device listening/testing is claimed from Chromium emulation. Full browser safety checks do not establish live production acceptance.

[Complete required backlog](../BACKLOG.md). Pause at this review checkpoint; do not merge, deploy or dispatch production workflows.
