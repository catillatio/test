# Phase 4.9 owner requirements and release backlog

Latest interaction-stage audit: 2026-10-20 (America/New_York), on `feature/kingdom-come-phase-4-9-bot-combat-rewards`, following approved balance baseline `c2f0adc`. This is a required-work tracker, not a claim that earlier requests were delivered. Production was not contacted. The approved combat checkpoint is unchanged. The five interface refinements and property-art direction are owner-approved. The two approved illustrations and Gold Mine display alias are now integrated for review. The first four-cue audio audition was rejected in full; a separate recorded-orchestra audition remains unapproved and outside runtime.

Status meanings: **Implemented / local verification** requires named evidence; **Pending** has not been delivered; **Blocked** identifies missing access or approval. Completion of a local implementation does not establish live verification.

## Combat checkpoint

**APPROVED by owner; immutable policy retained unchanged.** Remove both bot hard cutoffs; retain the 100/85/70/55/40 fixed-window pair percentages for gold and XP. New immutable `bot-combat-rewards-2` scales full difficulty XP to 65% before the pair reduction, retaining the 1-XP minimum. Human and quest XP, all gold formulas, bot finances, and resource regeneration are unchanged. The repeat floor remains provisional. Evidence: [comparison and limits](XP_BALANCE_REVIEW.md), [216 scenario results](xp-comparison.json), [release report](../../PHASE_4_9_IMPLEMENTATION.md), `tests/phase49-{rewards,xp,preservation,simulation}.test.ts`. No further XP changes are requested. The 40% floor/long-term pace remain provisional for alpha testing; approval does not close the remaining requirements below.

## 1. Remove ordinary navigation and button sounds — Implemented and OWNER APPROVED

- **Current:** `public/sound.js` removes click/navigation playback and the 55ms sound-navigation delay. Gesture unlocking/preloading stays silent; success, defeat and meaningful error cues remain. `src/sound.ts` emits no fallback click for routine commands or pending invitations. Existing mute/volume rows are untouched; old click/navigation files remain unused for compatibility.
- **Components:** `public/sound.js`, `src/sound.ts`, layout cache revision, browser audio regression script.
- **Dependencies:** no replacement audio adoption. Receipt matching, played-ID deduplication, tab suspension and explicit preview are preserved.
- **Acceptance/evidence:** normal links, buttons, disclosures and selectors stay silent with sound enabled. Existing audio browser test checks 17 meaningful cues, real AAC decoding and no navigation cue; new UI browser checks silent controls. `tests/phase49-interface.test.ts` checks routine server hints and meaningful reward priorities. Device listening remains an acceptance limitation.

## 2. Distinct medieval reward audio — Previous set REJECTED; new orchestral audition pending

- **Owner decision:** all four metallic/chime-based clips in `audio-audition/` are REJECTED and must never be adopted. Their README, player and manifest mark the rejection; the archived reproduction script refuses to overwrite that status. Ordinary buttons/navigation remain silent.
- **Current:** runtime remains `phase47-1`. The separate [recorded-orchestra audition](audio-orchestral-audition/README.md) provides four original short arrangements from publisher-licensed **CC0 VSCO 2 Community Edition acoustic recordings**. French horn/trumpet victory; low horn/cello defeat; concert harp/soft bells/strings quest; fuller independent orchestral level-up. No rejected impact or notification samples are reused. None is approved or in `public/audio/`.
- **Components:** documentation-only score, pinned recorded-source/SFZ manifests and licence, lossless masters, volume-matched MP3s, offline player and `scripts/preview-orchestral-phase49.py`. Existing audio playback/receipt protection and preferences remain unchanged.
- **Dependencies:** explicit owner listening approval before any runtime adoption; source redistribution rights verified with the publisher's CC0 licence. No background music, autoplay, paid purchase or new audio service.
- **Acceptance/evidence:** new audition measurements are within 0.02 LUFS of −20 LUFS, with safe true peaks, checked output/source hashes and recorded instrument mapping coverage. `tests/phase49-audition.test.mjs` verifies provenance and unchanged runtime version. Naturalness, musical character and phone-speaker/headphone quality are **pending owner audition**, not established by numerical tests.

## 3. Gray broadcast cleanup — REQUIRED RELEASE ITEM, Blocked; Development Knight excluded

- **Latest authorization:** owner reports Development Knight was already removed through the existing UI; do not touch it again. Only Gray's exact short reported broadcast is authorized for hiding, once its immutable ID/author/content are conclusively verified. The earlier two-message procedure is superseded.
- **Current:** no production credentials, game session or trusted operator shell. **Gray message UUID not obtained; no hide performed; live All/Broadcasts not verified.** The blocker is an authorized execution channel, not missing moderation functionality.
- **Components:** unchanged `views/partials/activity-feed.ejs`, `src/community.ts`, deployed `deployment/moderate.mjs` one-message hide, `realm_messages`/`social_moderation`. No permissions, endpoints or release infrastructure changed.
- **Diagnosis:** Reported for review reflects the viewer's report, not hidden status. Broadcast Remove is author-only. Reporting does not confer moderation permission or hide automatically. The existing single-message operator hide is reversible and audited.
- **Acceptance:** conclusively identify Gray's exact immutable message/author IDs, timestamp/content; execute only that authorized single hide; verify absent in both Recent Activity All and Broadcasts while unrelated activity remains. Record the live audit. Do not blindly retry the non-receipted generic CLI and add duplicate audit entries.
- **Evidence:** new synthetic single-record test proves reported/author controls, unauthorized-removal rejection, exactly one operator audit and absence in both feeds with another broadcast/accounts intact. It is not live cleanup evidence. [Current one-message operator procedure and blocker](BROADCAST_REVIEW.md); [workflow investigation](OPERATOR_INSPECTION_OPTIONS.md). No operator workflow has been added.

## 4. Simplify Profile Stats and Income — Implemented and OWNER APPROVED

- **Current:** native Stats/Income disclosures show compact victory/quest and authoritative net-income summaries. All original grids, descriptions and warnings remain expandable; suspension warning stays visible. Own/public profiles retain existing financial visibility.
- **Components:** `views/profile.ejs`, shared remaster CSS, profile rendering/browser tests.
- **Dependencies:** retain all authoritative values and public/private financial visibility; coordinate item 5 without deleting skills, inventory or holdings sections.
- **Acceptance:** essential summaries visible immediately; supporting statistics and income breakdown expandable with keyboard-accessible controls; retain every existing value and link; no private Vault exposure on public profiles; 320–430px without overflow.
- **Verification required:** screenshots of collapsed/expanded states, accessibility checks, own/public profile comparisons and no-JavaScript operation.

## 5. Calling on Home beside Hall of Champions — Implemented and OWNER APPROVED

- **Current:** Calling is a Home menu tile beside Hall; `/game/home?calling=1#calling` opens the existing management form and expandable bonus details. Profile retains current Calling, Home management link and secure Sign Out. The original POST remains `/game/profile/calling`, with a fixed allowlisted Home return; legacy callers still return to Profile.
- **Components:** `views/home.ejs`, `views/profile.ejs`, `views/partials/calling.ejs`, existing calling handler and tests.
- **Dependencies:** the latest owner request supersedes the Phase 4.8 decision to keep management in Profile/Settings. Reuse existing server validation, costs and 24-hour change restriction. The compact entry/control is prepared for owner review; no Calling rebalance.
- **Acceptance:** a discoverable Calling action adjacent to Hall of Champions on Home, current Calling visible, existing selection and change protections intact; no sixth bottom tab or duplicated oversized management panel.
- **Verification required:** actual Home/profile screenshots, authorized/CSRF/idempotent change tests, unchanged saved Calling identifiers and bonuses.

## 6. Compact mobile Hall of Champions — Implemented and OWNER APPROVED

- **Current:** four compact selectors fit on one row with full accessible category names. Tighter ranked rows retain 44px profile targets, own place, all four unchanged categories, recorded XP/tiebreakers and top-twenty limit. Supporting category explanations move to the rules disclosure. Backend ranking queries are unchanged.
- **Components:** `views/champions.ejs`, `public/phase46.css` and shared styling, `src/competition.ts` (read-only queries preserved).
- **Dependencies:** item 5 navigation; approved charcoal/bronze direction. Keep lifetime categories, tiebreakers, bot exclusion and private-data protections unchanged.
- **Acceptance:** compact selectors and readable ranked rows on 320–430px; clear selected category and own rank; no lost categories, horizontal overflow, ranking rewards or new leaderboard rules.
- **Verification required:** seeded ties/top-20/own-rank regression tests, mobile screenshots, keyboard/touch targets and query-count checks.

## 7. Remove green panel/background styling; retain teal resources — Implemented and OWNER APPROVED

- **Current:** additive `public/phase49.css` overrides active green-biased panel/background/upper-header surfaces with neutral charcoal and steel, preserving bronze buttons and meaningful resource-progress colors. Legacy CSS is retained for compatibility. The teal resource-row gradient and dimensions compare identically with/without the new sheet at 320/390/430/1024px; Land row heights remain identical.
- **Components:** shared remaster CSS, contextual panel/result styles; approved resource header in layout.
- **Dependencies:** scope by rendered comparison, not global replacement; the **teal Health/Mana/Spirit resource header is explicitly preserved**, along with meaningful resource-progress colors.
- **Acceptance:** owner-reviewed charcoal/steel/bronze panels without the unwanted green cast; unchanged compact density, contrast, teal resource row and navigation.
- **Verification required:** before/after Home, Profile, Hall, battle and marketplace screenshots at 320/390/430px, computed-style and contrast checks. See `ui-review/` screenshots and browser measurements. No economy or transaction code changes accompany the palette refinement.

## 8. Wyrmcrest Keep artwork — OWNER APPROVED direction; integration verified locally

- **Current:** the approved original fortified-keep illustration replaces the fiery later-property thumbnail. It is split/downsampled from the approved sheet, without a new creative repaint, and shown in Land, current holdings and receipts through the stable-ID artwork override.
- **Components:** `public/art/properties-49/wyrmcrest-keep.webp`, provenance, shared catalog-art partial and scoped CSS. The immutable catalog/older atlas and all other illustrations remain unchanged.
- **Acceptance/evidence:** less-fiery grounded keep; original image provenance, source/output hashes and exact crop recorded. `tests/phase49-properties.test.ts`, 320/390/430/1024px [runtime screenshots](art-integration/README.md), 44px controls, no overflow and populated-record preservation. No price, income, level, identity or financial change. Not deployed.

## 9. Moonwell Sanctuary → Gold Mine — OWNER APPROVED; display alias and artwork verified locally

- **Current:** today’s marketplace, current holdings/public profiles, new purchases, quotes and new unlock text use **Gold Mine**, with the approved original timber/ore mine illustration. The property ID remains **`moonwell-sanctuary`**. New receipt/holding name snapshots say Gold Mine; older rows and saved receipt names stay intact. Historical purchase headings use their recorded item name, with the immutable original catalog name as fallback for older receipts.
- **Components:** `src/property-presentation.ts`, current estate/profile/quote/unlock presentation, new-command labels, receipt view, shared art mapping and provenance. Unrelated `moonwell-veil` spell and `secure-moonwell` quest are unchanged.
- **Dependencies/safety:** **no SQL migration, immutable catalog edit, property-ID change or reseeding**. All costs, saved rates, quantities, income clocks, sale calculations and idempotency remain authoritative and unchanged.
- **Acceptance/evidence:** focused PostgreSQL test retains 450 bots, existing holdings, old receipts and financial journals; same-command retry returns the old saved result and does not charge again; a new buy uses the same ID/rates and new label; simulated app restart preserves the session and historical receipt. Runtime captures cover Land, holdings and Buy More at 320/390/430/1024px. [Integration evidence](art-integration/README.md). Live deployment remains unauthorized.

## 10. Tutorial and battle-result presentation — Pending, lower-priority polish

- **Observed:** `views/tutorial.ejs`, `views/report.ejs` and experience/celebration components retain the approved earlier behavior. This checkpoint improves recorded reward explanations and XP accuracy only; it is not a delivery of additional presentation feedback.
- **Dependencies:** items 1–2 audio, shared styling stage, owner review of specific remaining presentation issues. Preserve tutorial persistence/replay, correct Land navigation, normal combat eligibility, achievements, and refresh-safe celebrations.
- **Acceptance:** focused improvements with one clear next action, readable outcomes and short nonblocking effects; no invented rewards or reset tutorial progress.
- **Verification required:** actual mobile flows with resource shortages, skipped/completed/replayed tutorial, new/historical battle receipts, reduced motion and receipt/audio replay suppression.

## Review stages after the balancing checkpoint

1. **Balance checkpoint APPROVED:** keep immutable 65% policy and provisional repeat floor; no further XP changes requested.
2. **Low-risk interaction/presentation:** remove routine sounds, Profile disclosures, Calling/Home placement and compact Hall; targeted neutral panel colors. Provide mobile screenshots/tests before finalizing the stage.
3. **Assets:** property direction is approved and art/display-alias integration is verified. First audio audition is rejected; new orchestral samples await explicit owner approval before adoption.
4. **Lower-priority guidance polish:** tutorial/results after the core usability/assets stage.
5. **Separate required live moderation:** Gray only, after conclusive exact-record identification; authorization for that exact hide is already given. Development Knight was owner-reported removed and is excluded. Finish reversible hide/audit and both feed checks only through authorized operator access, never by deployment.

No merge, release workflow dispatch, release-infrastructure change, Railway service modification or live-data mutation is authorized by this tracker. Backlog items remain open until their stated evidence exists.

## Current interface-stage evidence

[UI stage review](ui-review/README.md), `scripts/browser-phase49-ui.ts`, and `tests/phase49-interface.test.ts` document the actual implementation, 320/390/430px captures, desktop checks, keyboard/touch behavior, fixed Calling return, exact-record moderation regression and data-preserving navigation. Final verification counts are recorded in `ui-review/verification.json`. The five UI refinements are now owner-approved. Artwork direction is approved and integrated in the feature branch. Audio remains a separate pending review; the rejected set is barred from adoption.
