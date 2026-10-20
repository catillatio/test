# Phase 4.9 owner requirements and release backlog

Latest interaction-stage audit: 2026-10-20 (America/New_York), on `feature/kingdom-come-phase-4-9-bot-combat-rewards`, following approved balance baseline `c2f0adc`. This is a required-work tracker, not a claim that earlier requests were delivered. Production was not contacted. The approved combat checkpoint is unchanged. The first interface stage is implemented for owner review; artwork/audio are separate documentation auditions, not runtime adoption.

Status meanings: **Implemented / local verification** requires named evidence; **Pending** has not been delivered; **Blocked** identifies missing access or approval. Completion of a local implementation does not establish live verification.

## Combat checkpoint

**APPROVED by owner; immutable policy retained unchanged.** Remove both bot hard cutoffs; retain the 100/85/70/55/40 fixed-window pair percentages for gold and XP. New immutable `bot-combat-rewards-2` scales full difficulty XP to 65% before the pair reduction, retaining the 1-XP minimum. Human and quest XP, all gold formulas, bot finances, and resource regeneration are unchanged. The repeat floor remains provisional. Evidence: [comparison and limits](XP_BALANCE_REVIEW.md), [216 scenario results](xp-comparison.json), [release report](../../PHASE_4_9_IMPLEMENTATION.md), `tests/phase49-{rewards,xp,preservation,simulation}.test.ts`. No further XP changes are requested. The 40% floor/long-term pace remain provisional for alpha testing; approval does not close the remaining requirements below.

## 1. Remove ordinary navigation and button sounds — Implemented, verification evidence prepared

- **Current:** `public/sound.js` removes click/navigation playback and the 55ms sound-navigation delay. Gesture unlocking/preloading stays silent; success, defeat and meaningful error cues remain. `src/sound.ts` emits no fallback click for routine commands or pending invitations. Existing mute/volume rows are untouched; old click/navigation files remain unused for compatibility.
- **Components:** `public/sound.js`, `src/sound.ts`, layout cache revision, browser audio regression script.
- **Dependencies:** no replacement audio adoption. Receipt matching, played-ID deduplication, tab suspension and explicit preview are preserved.
- **Acceptance/evidence:** normal links, buttons, disclosures and selectors stay silent with sound enabled. Existing audio browser test checks 17 meaningful cues, real AAC decoding and no navigation cue; new UI browser checks silent controls. `tests/phase49-interface.test.ts` checks routine server hints and meaningful reward priorities. Device listening remains an acceptance limitation.

## 2. Distinct medieval reward audio — New audition prepared; owner approval and adoption pending

- **Current:** runtime remains `phase47-1`. A new focused [four-cue audition](audio-audition/README.md) provides victory, defeat, quest and level-up edits from checksum-verified official Kenney CC0 recordings. Clip provenance, selected source hashes, edit parameters, peaks/RMS and licenses are recorded. No clip is adopted without owner approval.
- **Components:** `docs/phase48/audio-audition/`, eventual Phase 4.9 audition inventory, `public/audio/`, `public/sound.js`, `src/sound.ts`.
- **Dependencies:** item 1; document original/licensed sources and transformations; owner audition before adoption. Keep mute/volume and mobile gesture restrictions, no background music.
- **Acceptance:** clearly distinct, restrained victory, defeat, quest-completion and level-up clips; owner can compare volume-matched samples; runtime adoption requires explicit sample approval. No success sound on failed requests or historical receipt refresh.
- **Verification required:** license/hash inventory, loudness/peak review, cue selection/deduplication tests, Android and iPhone listening. Existing previews are evidence of availability, not completed sound quality acceptance.

## 3. Gray broadcast cleanup — REQUIRED RELEASE ITEM, Blocked; Development Knight excluded

- **Latest authorization:** owner reports Development Knight was already removed through the existing UI; do not touch it again. Only Gray's exact short reported broadcast is authorized for hiding, once its immutable ID/author/content are conclusively verified. The earlier two-message procedure is superseded.
- **Current:** no production credentials, game session or trusted operator shell. **Gray message UUID not obtained; no hide performed; live All/Broadcasts not verified.** The blocker is an authorized execution channel, not missing moderation functionality.
- **Components:** unchanged `views/partials/activity-feed.ejs`, `src/community.ts`, deployed `deployment/moderate.mjs` one-message hide, `realm_messages`/`social_moderation`. No permissions, endpoints or release infrastructure changed.
- **Diagnosis:** Reported for review reflects the viewer's report, not hidden status. Broadcast Remove is author-only. Reporting does not confer moderation permission or hide automatically. The existing single-message operator hide is reversible and audited.
- **Acceptance:** conclusively identify Gray's exact immutable message/author IDs, timestamp/content; execute only that authorized single hide; verify absent in both Recent Activity All and Broadcasts while unrelated activity remains. Record the live audit. Do not blindly retry the non-receipted generic CLI and add duplicate audit entries.
- **Evidence:** new synthetic single-record test proves reported/author controls, unauthorized-removal rejection, exactly one operator audit and absence in both feeds with another broadcast/accounts intact. It is not live cleanup evidence. [Current one-message operator procedure and blocker](BROADCAST_REVIEW.md); [workflow investigation](OPERATOR_INSPECTION_OPTIONS.md). No operator workflow has been added.

## 4. Simplify Profile Stats and Income — Implemented; owner visual review pending

- **Current:** native Stats/Income disclosures show compact victory/quest and authoritative net-income summaries. All original grids, descriptions and warnings remain expandable; suspension warning stays visible. Own/public profiles retain existing financial visibility.
- **Components:** `views/profile.ejs`, shared remaster CSS, profile rendering/browser tests.
- **Dependencies:** retain all authoritative values and public/private financial visibility; coordinate item 5 without deleting skills, inventory or holdings sections.
- **Acceptance:** essential summaries visible immediately; supporting statistics and income breakdown expandable with keyboard-accessible controls; retain every existing value and link; no private Vault exposure on public profiles; 320–430px without overflow.
- **Verification required:** screenshots of collapsed/expanded states, accessibility checks, own/public profile comparisons and no-JavaScript operation.

## 5. Calling on Home beside Hall of Champions — Implemented; owner visual review pending

- **Current:** Calling is a Home menu tile beside Hall; `/game/home?calling=1#calling` opens the existing management form and expandable bonus details. Profile retains current Calling, Home management link and secure Sign Out. The original POST remains `/game/profile/calling`, with a fixed allowlisted Home return; legacy callers still return to Profile.
- **Components:** `views/home.ejs`, `views/profile.ejs`, `views/partials/calling.ejs`, existing calling handler and tests.
- **Dependencies:** the latest owner request supersedes the Phase 4.8 decision to keep management in Profile/Settings. Reuse existing server validation, costs and 24-hour change restriction. The compact entry/control is prepared for owner review; no Calling rebalance.
- **Acceptance:** a discoverable Calling action adjacent to Hall of Champions on Home, current Calling visible, existing selection and change protections intact; no sixth bottom tab or duplicated oversized management panel.
- **Verification required:** actual Home/profile screenshots, authorized/CSRF/idempotent change tests, unchanged saved Calling identifiers and bonuses.

## 6. Compact mobile Hall of Champions — Implemented; owner visual review pending

- **Current:** four compact selectors fit on one row with full accessible category names. Tighter ranked rows retain 44px profile targets, own place, all four unchanged categories, recorded XP/tiebreakers and top-twenty limit. Supporting category explanations move to the rules disclosure. Backend ranking queries are unchanged.
- **Components:** `views/champions.ejs`, `public/phase46.css` and shared styling, `src/competition.ts` (read-only queries preserved).
- **Dependencies:** item 5 navigation; approved charcoal/bronze direction. Keep lifetime categories, tiebreakers, bot exclusion and private-data protections unchanged.
- **Acceptance:** compact selectors and readable ranked rows on 320–430px; clear selected category and own rank; no lost categories, horizontal overflow, ranking rewards or new leaderboard rules.
- **Verification required:** seeded ties/top-20/own-rank regression tests, mobile screenshots, keyboard/touch targets and query-count checks.

## 7. Remove green panel/background styling; retain teal resources — Implemented; owner visual review pending

- **Current:** additive `public/phase49.css` overrides active green-biased panel/background/upper-header surfaces with neutral charcoal and steel, preserving bronze buttons and meaningful resource-progress colors. Legacy CSS is retained for compatibility. The teal resource-row gradient and dimensions compare identically with/without the new sheet at 320/390/430/1024px; Land row heights remain identical.
- **Components:** shared remaster CSS, contextual panel/result styles; approved resource header in layout.
- **Dependencies:** scope by rendered comparison, not global replacement; the **teal Health/Mana/Spirit resource header is explicitly preserved**, along with meaningful resource-progress colors.
- **Acceptance:** owner-reviewed charcoal/steel/bronze panels without the unwanted green cast; unchanged compact density, contrast, teal resource row and navigation.
- **Verification required:** before/after Home, Profile, Hall, battle and marketplace screenshots at 320/390/430px, computed-style and contrast checks. See `ui-review/` screenshots and browser measurements. No economy or transaction code changes accompany the palette refinement.

## 8. Wyrmcrest Keep artwork — Preview prepared; approval/adoption pending

- **Current:** [original less-fiery keep preview](art-audition/README.md) is prepared with documented provenance and checksum. Runtime art/catalog remain unchanged. Owner approval, compact crop verification and adoption remain pending.
- **Components:** `public/art/land-simple-0.1/properties.webp` and its provenance, catalog-to-art mapping, Land and profile thumbnails. The separate first-six-property `public/art/land-review/painted-properties.webp` does not replace this later property.
- **Dependencies:** prepare an original or appropriately licensed fortified-keep illustration; owner preview before adoption. Preserve stable property identity, price, income, level and saved holdings.
- **Acceptance:** recognizable fortified keep with restrained lighting, matching approved framing/style; no fiery spectacle; licensed/original provenance and hash record; no economic changes.
- **Verification required:** preview comparison, atlas-cell/image integrity tests, browser screenshots and populated holdings/financial-history preservation.

## 9. Moonwell Sanctuary → Gold Mine — Preview prepared; compatible rename/adoption pending

- **Current:** [Gold Mine illustration preview](art-audition/README.md) is prepared. The Gold Mine name is mandatory and reserved for this property; runtime renaming/adoption remains pending compatible presentation mapping or a new immutable catalog after art approval. Stable `moonwell-sanctuary` identity/holdings/finances remain untouched. The unrelated spell `moonwell-veil` and quest `secure-moonwell` must retain their names.
- **Components:** property presentation/catalog versioning, atlas/provenance, Land/profile/purchase labels and historic receipts.
- **Dependencies:** choose a presentation mapping or a new immutable catalog version without changing the property ID or saved financial terms; keep historical records intact. Original/licensed Gold Mine preview requires owner approval before adoption.
- **Acceptance:** new property-facing name Gold Mine and suitable mine art; same holdings, stable ID, prices, saved rates, purchase lots, income history and historical receipt contents; no reseeding or duplicate property type.
- **Verification required:** rendered labels/art, migration/version compatibility against populated holdings, byte-identical old receipts/ledger, no change to unrelated Moonwell items/quests.

## 10. Tutorial and battle-result presentation — Pending, lower-priority polish

- **Observed:** `views/tutorial.ejs`, `views/report.ejs` and experience/celebration components retain the approved earlier behavior. This checkpoint improves recorded reward explanations and XP accuracy only; it is not a delivery of additional presentation feedback.
- **Dependencies:** items 1–2 audio, shared styling stage, owner review of specific remaining presentation issues. Preserve tutorial persistence/replay, correct Land navigation, normal combat eligibility, achievements, and refresh-safe celebrations.
- **Acceptance:** focused improvements with one clear next action, readable outcomes and short nonblocking effects; no invented rewards or reset tutorial progress.
- **Verification required:** actual mobile flows with resource shortages, skipped/completed/replayed tutorial, new/historical battle receipts, reduced motion and receipt/audio replay suppression.

## Review stages after the balancing checkpoint

1. **Balance checkpoint APPROVED:** keep immutable 65% policy and provisional repeat floor; no further XP changes requested.
2. **Low-risk interaction/presentation:** remove routine sounds, Profile disclosures, Calling/Home placement and compact Hall; targeted neutral panel colors. Provide mobile screenshots/tests before finalizing the stage.
3. **Asset audition:** distinctive reward audio and two property-art previews with provenance; owner approval before runtime adoption. Implement the property rename with stable IDs and preservation tests.
4. **Lower-priority guidance polish:** tutorial/results after the core usability/assets stage.
5. **Separate required live moderation:** Gray only, after conclusive exact-record identification; authorization for that exact hide is already given. Development Knight was owner-reported removed and is excluded. Finish reversible hide/audit and both feed checks only through authorized operator access, never by deployment.

No merge, release workflow dispatch, release-infrastructure change, Railway service modification or live-data mutation is authorized by this tracker. Backlog items remain open until their stated evidence exists.

## Current interface-stage evidence

[UI stage review](ui-review/README.md), `scripts/browser-phase49-ui.ts`, and `tests/phase49-interface.test.ts` document the actual implementation, 320/390/430px captures, desktop checks, keyboard/touch behavior, fixed Calling return, exact-record moderation regression and data-preserving navigation. Final verification counts are recorded in `ui-review/verification.json`. Asset audition readiness is not owner approval or runtime adoption.
