# Phase 4.9 owner requirements and release backlog

Last source audit: 2026-10-20, on `feature/kingdom-come-phase-4-9-bot-combat-rewards`, following baseline `c1e7e78`. This is a required-work tracker, not a claim that earlier requests were delivered. Production was not contacted. Only the combat checkpoint is implemented in this update; no unrelated interface, artwork or audio changes are bundled with it.

Status meanings: **Implemented / local verification** requires named evidence; **Pending** has not been delivered; **Blocked** identifies missing access or approval. Completion of a local implementation does not establish live verification.

## Combat checkpoint

**Implemented / local verification; owner review pending.** Remove both bot hard cutoffs; retain the 100/85/70/55/40 fixed-window pair percentages for gold and XP. New immutable `bot-combat-rewards-2` scales full difficulty XP to 65% before the pair reduction, retaining the 1-XP minimum. Human and quest XP, all gold formulas, bot finances, and resource regeneration are unchanged. The repeat floor remains provisional. Evidence: [comparison and limits](XP_BALANCE_REVIEW.md), [216 scenario results](xp-comparison.json), [release report](../../PHASE_4_9_IMPLEMENTATION.md), `tests/phase49-{rewards,xp,preservation,simulation}.test.ts`. Pause at this checkpoint for owner balancing review; it does not close the remaining release work below.

## 1. Remove ordinary navigation and button sounds — Pending

- **Observed:** `public/sound.js` still plays `navigate`/`click` in both the gesture-unlock handler and the ordinary click handler. `src/sound.ts` also falls back to `click` for routine receipts. Those paths have not been removed.
- **Components:** `public/sound.js`, `src/sound.ts`, audio inventory and browser-audio tests.
- **Dependencies:** retain gesture unlocking without playing a routine sound; retain saved mute/volume, success-only receipt cues, recovery deduplication and keyboard handling. No requirement to remove meaningful purchase/reward sounds.
- **Acceptance:** routine tabs, links, buttons and disclosures are silent even when sound is enabled; confirmed rewards still sound once; no navigation delay introduced for a silent cue; no preference reset.
- **Verification required:** browser event/cue assertions for pointer and keyboard navigation, rapid taps, interrupted requests and receipt refresh. Existing audio tests prove the current engine, not this requested change.

## 2. Distinct medieval reward audio for audition — Pending owner audition / adoption

- **Observed:** `public/audio/inventory.json` still identifies the runtime set as `phase47-1`, original deterministic synthesis. A licensed preview exists at [Phase 4.8 audition](../phase48/audio-audition/README.md); its README explicitly says preview only. No approval of a replacement set is evidenced.
- **Components:** `docs/phase48/audio-audition/`, eventual Phase 4.9 audition inventory, `public/audio/`, `public/sound.js`, `src/sound.ts`.
- **Dependencies:** item 1; document original/licensed sources and transformations; owner audition before adoption. Keep mute/volume and mobile gesture restrictions, no background music.
- **Acceptance:** clearly distinct, restrained victory, defeat, quest-completion and level-up clips; owner can compare volume-matched samples; runtime adoption requires explicit sample approval. No success sound on failed requests or historical receipt refresh.
- **Verification required:** license/hash inventory, loudness/peak review, cue selection/deduplication tests, Android and iPhone listening. Existing previews are evidence of availability, not completed sound quality acceptance.

## 3. Exactly two unwanted broadcasts — REQUIRED RELEASE ITEM, Blocked on authorized read-only access / exact owner confirmation

- **Latest identities requested:** **Gray** and **Development Night**. An earlier bullet said “Development Knight”; do not substitute that identity or guess from similar display names.
- **Observed:** tooling exists in `deployment/moderate.mjs` and `src/broadcast-moderation.ts`. No authenticated Railway identity, credential binding, live record IDs, timestamps, message contents or live feed evidence is available in this workspace. Neither record has been identified or hidden here.
- **Components:** existing `realm_messages` and `social_moderation` records, existing moderation CLI, `src/community.ts`, Home `All`/`Broadcasts` feed; **no migration/startup cleanup**.
- **Dependencies:** trusted authenticated operator access, read-only exact-record review, then explicit owner approval of both IDs/content/author/time and their review digest. Approved read access is not approval to hide an unidentified pair.
- **Acceptance:** present both immutable IDs, author IDs/names, timestamps and full messages; after separate approval, reversibly hide only those records with two audit entries. Verify absence in **Recent Activity → All** and **Broadcasts**, with unrelated activity and future posting intact. Only then mark complete.
- **Evidence:** `tests/phase46-guide-moderation.test.ts` checks exact-two review, unchanged reads, digest/approval enforcement, atomic hides/retries, audit entries, reversal and no browser admin endpoint in a synthetic realm. This is not live cleanup evidence. [Owner procedure and record worksheet](BROADCAST_REVIEW.md). The owner confirms no operator shell is available; [existing workflow inspection and a minimal strict operator-only proposal](OPERATOR_INSPECTION_OPTIONS.md) are documented without changing infrastructure or running a job.

## 4. Simplify Profile Stats and Income — Pending

- **Observed:** `views/profile.ejs` renders Stats and Income as expanded grids with explanatory text. No new compact summary/disclosure implementation is present.
- **Components:** `views/profile.ejs`, shared remaster CSS, profile rendering/browser tests.
- **Dependencies:** retain all authoritative values and public/private financial visibility; coordinate item 5 without deleting skills, inventory or holdings sections.
- **Acceptance:** essential summaries visible immediately; supporting statistics and income breakdown expandable with keyboard-accessible controls; retain every existing value and link; no private Vault exposure on public profiles; 320–430px without overflow.
- **Verification required:** screenshots of collapsed/expanded states, accessibility checks, own/public profile comparisons and no-JavaScript operation.

## 5. Calling on Home beside Hall of Champions — Pending

- **Observed:** `views/home.ejs` includes Hall of Champions but no Calling control. Own Profile includes `views/partials/calling.ejs`; its POST remains `/game/profile/calling`.
- **Components:** `views/home.ejs`, `views/profile.ejs`, `views/partials/calling.ejs`, existing calling handler and tests.
- **Dependencies:** the latest owner request supersedes the Phase 4.8 decision to keep management in Profile/Settings. Reuse existing server validation, costs and 24-hour change restriction. Decide a compact Home entry/control with the owner during the interface review stage; no Calling rebalance.
- **Acceptance:** a discoverable Calling action adjacent to Hall of Champions on Home, current Calling visible, existing selection and change protections intact; no sixth bottom tab or duplicated oversized management panel.
- **Verification required:** actual Home/profile screenshots, authorized/CSRF/idempotent change tests, unchanged saved Calling identifiers and bonuses.

## 6. Compact mobile Hall of Champions — Pending owner-requested refinement

- **Observed:** `views/champions.ejs` already has four category links, top-twenty rows, own position, and a rules disclosure. This pre-existing implementation does not itself satisfy the new compactness feedback.
- **Components:** `views/champions.ejs`, `public/phase46.css` and shared styling, `src/competition.ts` (read-only queries preserved).
- **Dependencies:** item 5 navigation; approved charcoal/bronze direction. Keep lifetime categories, tiebreakers, bot exclusion and private-data protections unchanged.
- **Acceptance:** compact selectors and readable ranked rows on 320–430px; clear selected category and own rank; no lost categories, horizontal overflow, ranking rewards or new leaderboard rules.
- **Verification required:** seeded ties/top-20/own-rank regression tests, mobile screenshots, keyboard/touch targets and query-count checks.

## 7. Remove green panel/background styling; retain teal resources — Pending

- **Observed:** `public/remaster.css` still contains green-biased background/panel tokens, including `--panel: #0c100dee`, `--panel-soft: #24261f`, and green-tinted upper-header gradients. No targeted Phase 4.9 neutralization is implemented. These source colors identify candidates, not proof that every green accent should disappear.
- **Components:** shared remaster CSS, contextual panel/result styles; approved resource header in layout.
- **Dependencies:** scope by rendered comparison, not global replacement; the **teal Health/Mana/Spirit resource header is explicitly preserved**, along with meaningful resource-progress colors.
- **Acceptance:** owner-reviewed charcoal/steel/bronze panels without the unwanted green cast; unchanged compact density, contrast, teal resource row and navigation.
- **Verification required:** before/after Home, Profile, Hall, battle and marketplace screenshots at 320/390/430px, computed-style and contrast checks. No theme changes are included in the combat commit.

## 8. Wyrmcrest Keep artwork — Pending preview and approval

- **Observed:** immutable catalog `rulesets/alpha-0.3/rules.json` retains `wyrmcrest-keep` and its ember-themed description/art assignment. No approved less-fiery replacement is evidenced.
- **Components:** `public/art/land-simple-0.1/properties.webp` and its provenance, catalog-to-art mapping, Land and profile thumbnails. The separate first-six-property `public/art/land-review/painted-properties.webp` does not replace this later property.
- **Dependencies:** prepare an original or appropriately licensed fortified-keep illustration; owner preview before adoption. Preserve stable property identity, price, income, level and saved holdings.
- **Acceptance:** recognizable fortified keep with restrained lighting, matching approved framing/style; no fiery spectacle; licensed/original provenance and hash record; no economic changes.
- **Verification required:** preview comparison, atlas-cell/image integrity tests, browser screenshots and populated holdings/financial-history preservation.

## 9. Moonwell Sanctuary → Gold Mine, replacement artwork — Pending preview and compatible naming design

- **Observed:** active immutable catalog still calls stable ID `moonwell-sanctuary` **Moonwell Sanctuary**. The requested Gold Mine name/art has not been implemented. The separate spell `moonwell-veil` and quest `secure-moonwell` are unrelated and must not be renamed accidentally.
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

1. **Balance review:** approve or revise 65% and the provisional repeat floor using the simulation report; retain documented early-level rounding and model limitations.
2. **Low-risk interaction/presentation:** remove routine sounds, Profile disclosures, Calling/Home placement and compact Hall; targeted neutral panel colors. Provide mobile screenshots/tests before finalizing the stage.
3. **Asset audition:** distinctive reward audio and two property-art previews with provenance; owner approval before runtime adoption. Implement the property rename with stable IDs and preservation tests.
4. **Lower-priority guidance polish:** tutorial/results after the core usability/assets stage.
5. **Separate required live moderation:** exact-record read-only identification, owner approval, reversible targeted hide, then both feed checks. This can be handled independently of code stages through authorized operator access, never by deployment.

No merge, release workflow dispatch, release-infrastructure change, Railway service modification or live-data mutation is authorized by this tracker. Backlog items remain open until their stated evidence exists.
