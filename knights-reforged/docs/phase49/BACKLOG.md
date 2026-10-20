# Phase 4.9 owner requirements and release backlog

Latest scope: [owner comment 6303697572](https://github.com/catillatio/test/pull/12#issuecomment-6303697572), 2026-10-20, on `feature/kingdom-come-phase-4-9-bot-combat-rewards`. The 65% combat checkpoint, five UI refinements, integrated property art/Gold Mine alias, and orchestral audition at `087e1a8` are approved for alpha. Only those four musical cues are adopted. The earlier impact/chime audition remains rejected. Gray removed his own message; no moderation is requested. The username correction is explicitly dropped. PR #13 remains draft/inactive and outside this release. Production was not contacted. [Final candidate review and current verification](FINAL_REVIEW.md) supersede earlier checkpoint statuses.

Status meanings: **Implemented / local verification** requires named evidence; **Pending** has not been delivered; **Blocked** identifies missing access or approval. Completion of a local implementation does not establish live verification.

## Combat checkpoint

**APPROVED by owner; immutable policy retained unchanged.** Remove both bot hard cutoffs; retain the 100/85/70/55/40 fixed-window pair percentages for gold and XP. New immutable `bot-combat-rewards-2` scales full difficulty XP to 65% before the pair reduction, retaining the 1-XP minimum. Human and quest XP, all gold formulas, bot finances, and resource regeneration are unchanged. The repeat floor remains provisional. Evidence: [comparison and limits](XP_BALANCE_REVIEW.md), [216 scenario results](xp-comparison.json), [release report](../../PHASE_4_9_IMPLEMENTATION.md), `tests/phase49-{rewards,xp,preservation,simulation}.test.ts`. No further XP changes are requested. The 40% floor/long-term pace remain provisional for alpha testing; approval does not close the remaining requirements below.

## 1. Remove ordinary navigation and button sounds — Implemented and OWNER APPROVED

- **Current:** `public/sound.js` removes click/navigation playback and the 55ms sound-navigation delay. Gesture unlocking/preloading stays silent; success, defeat and meaningful error cues remain. `src/sound.ts` emits no fallback click for routine commands or pending invitations. Existing mute/volume rows are untouched; old click/navigation files remain unused for compatibility.
- **Components:** `public/sound.js`, `src/sound.ts`, layout cache revision, browser audio regression script.
- **Dependencies:** no replacement audio adoption. Receipt matching, played-ID deduplication, tab suspension and explicit preview are preserved.
- **Acceptance/evidence:** normal links, buttons, disclosures and selectors stay silent with sound enabled. Existing audio browser test checks 17 meaningful cues, real AAC decoding and no navigation cue; new UI browser checks silent controls. `tests/phase49-interface.test.ts` checks routine server hints and meaningful reward priorities. Device listening remains an acceptance limitation.

## 2. Distinct medieval reward audio — Orchestral set OWNER APPROVED and integrated

- **Owner decision:** all four metallic/chime-based clips in `audio-audition/` are REJECTED and must never be adopted. Their README, player and manifest mark the rejection; the archived reproduction script refuses to overwrite that status. Ordinary buttons/navigation remain silent.
- **Current:** `phase49-orchestral-1` packages the exact approved lossless arrangements as mobile-compatible stereo AAC. Victory/Defeat are 3.9s, Quest 4.0s and Level-up 5.3s, with no musical re-edit. Decisive Victory aliases the approved Victory cue. Other previously shipped meaningful-event assets and server cue priorities remain unchanged; no background music or ordinary click/navigation audio.
- **Components:** `scripts/adopt-orchestral-phase49.py`, runtime audio/index/inventory/licenses, versioned client cache URLs; pinned recorded-source/SFZ manifests, score and approved masters remain in the audition archive. Preferences, silent gesture unlock, pending-receipt matching, duplicate suppression and navigation cleanup are retained.
- **Dependencies:** the owner granted alpha adoption in comment 6303697572. Public source/license manifests establish CC0 redistribution rights; no paid audio service or third-party runtime requests. The historical generator refuses to overwrite adopted assets.
- **Acceptance/evidence:** asset hash/source/license tests, actual AAC decoding, full-length Web Audio playback, silent navigation, duplicate receipt and interrupted-fetch browser checks. Phone-speaker/headphone mixing, physical Android/iPhone Safari restrictions and professional refinement remain documented alpha limitations, not claims established by headless tests. [Final review](FINAL_REVIEW.md).

## 3. Broadcast cleanup — CLOSED by owner report; no action authorized

- **Current direction:** Gray voluntarily removed his own broadcast; Development Knight was previously owner-reported removed. Do not inspect, hide, restore or retarget either message. Closure is based on the owner's statement, not independent production inspection.
- **Components/evidence:** existing author-removal/moderation functionality and synthetic regression remain unchanged. Earlier [moderation investigation](BROADCAST_REVIEW.md) and [operator options](OPERATOR_INSPECTION_OPTIONS.md) are historical only and confer no current authorization.
- **Release acceptance:** no production moderation, operator deployment, startup cleanup, permission change or release-workflow edit. No remaining Phase 4.9 moderation blocker.

## 3a. Username correction — WITHDRAWN; do not implement or execute

- Owner comment 6303697572 drops the correction for player `af025047-1c77-437a-8d5a-dd51eba71840` entirely. Do not change `accounts.username` or `characters.name`, inspect that production account, install audit objects or activate PR #13.
- **Evidence/acceptance:** PR #12 contains no operator workflow, operator runtime/audit module, username-update command or production administration change. Existing accounts/names are included in whole-schema preservation snapshots. PR #13 remains untouched, draft and inactive.

## 4. Simplify Profile Stats and Income — Implemented and OWNER APPROVED

- **Current:** native Stats/Income disclosures show compact victory/quest and authoritative net-income summaries. All original grids, descriptions and warnings remain expandable; suspension warning stays visible. Own/public profiles retain existing financial visibility.
- **Components:** `views/profile.ejs`, shared remaster CSS, profile rendering/browser tests.
- **Dependencies:** retain all authoritative values and public/private financial visibility; coordinate item 5 without deleting skills, inventory or holdings sections.
- **Acceptance:** essential summaries visible immediately; supporting statistics and income breakdown expandable with keyboard-accessible controls; retain every existing value and link; no private Vault exposure on public profiles; 320–430px without overflow.
- **Verification:** final 320/390/430px collapsed/expanded screenshots, native keyboard disclosures, own/public-profile privacy and preserved statistics PASS. `final-review/ui.json`, `phase49-interface.test.ts` and the full PostgreSQL profile suites; no-JavaScript disclosure behavior is provided by native HTML details/summary.

## 5. Calling on Home beside Hall of Champions — Implemented and OWNER APPROVED

- **Current:** Calling is a Home menu tile beside Hall; `/game/home?calling=1#calling` opens the existing management form and expandable bonus details. Profile retains current Calling, Home management link and secure Sign Out. The original POST remains `/game/profile/calling`, with a fixed allowlisted Home return; legacy callers still return to Profile.
- **Components:** `views/home.ejs`, `views/profile.ejs`, `views/partials/calling.ejs`, existing calling handler and tests.
- **Dependencies:** the latest owner request supersedes the Phase 4.8 decision to keep management in Profile/Settings. Reuse existing server validation, costs and 24-hour change restriction. The compact entry/control is prepared for owner review; no Calling rebalance.
- **Acceptance:** a discoverable Calling action adjacent to Hall of Champions on Home, current Calling visible, existing selection and change protections intact; no sixth bottom tab or duplicated oversized management panel.
- **Verification:** final Home/Profile screenshots, actual browser Calling change and same-key retry, CSRF/cooldown/fixed-return tests PASS. Saved internal identifiers/bonuses remain unchanged. `final-review/ui.json` and `phase49-interface.test.ts`.

## 6. Compact mobile Hall of Champions — Implemented and OWNER APPROVED

- **Current:** four compact selectors fit on one row with full accessible category names. Tighter ranked rows retain 44px profile targets, own place, all four unchanged categories, recorded XP/tiebreakers and top-twenty limit. Supporting category explanations move to the rules disclosure. Backend ranking queries are unchanged.
- **Components:** `views/champions.ejs`, `public/phase46.css` and shared styling, `src/competition.ts` (read-only queries preserved).
- **Dependencies:** item 5 navigation; approved charcoal/bronze direction. Keep lifetime categories, tiebreakers, bot exclusion and private-data protections unchanged.
- **Acceptance:** compact selectors and readable ranked rows on 320–430px; clear selected category and own rank; no lost categories, horizontal overflow, ranking rewards or new leaderboard rules.
- **Verification:** seeded ties/top-20/own-rank/bot-exclusion/query-plan regressions and final 320/390/430px screenshots PASS. Four categories and 44px profile/selector targets verified; backend ranking queries remain byte-for-byte unchanged. `final-review/ui.json`, full `phase46-competition.test.ts` and `final-review/change-audit.json`.

## 7. Remove green panel/background styling; retain teal resources — Implemented and OWNER APPROVED

- **Current:** additive `public/phase49.css` overrides active green-biased panel/background/upper-header surfaces with neutral charcoal and steel, preserving bronze buttons and meaningful resource-progress colors. Legacy CSS is retained for compatibility. The teal resource-row gradient and dimensions compare identically with/without the new sheet at 320/390/430/1024px; Land row heights remain identical.
- **Components:** shared remaster CSS, contextual panel/result styles; approved resource header in layout.
- **Dependencies:** scope by rendered comparison, not global replacement; the **teal Health/Mana/Spirit resource header is explicitly preserved**, along with meaningful resource-progress colors.
- **Acceptance:** owner-reviewed charcoal/steel/bronze panels without the unwanted green cast; unchanged compact density, contrast, teal resource row and navigation.
- **Verification:** final Home/Profile/Hall/marketplace captures, unchanged computed teal gradient/resource dimensions and Land row heights at 320/390/430/1024px PASS. `final-review/ui.json`, current screenshots and browser checks; no new palette changes in the final audio checkpoint. Device/assistive-technology contrast acceptance remains an alpha limitation rather than a formal certification.

## 8. Wyrmcrest Keep artwork — OWNER APPROVED direction; integration verified locally

- **Current:** the approved original fortified-keep illustration replaces the fiery later-property thumbnail. It is split/downsampled from the approved sheet, without a new creative repaint, and shown in Land, current holdings and receipts through the stable-ID artwork override.
- **Components:** `public/art/properties-49/wyrmcrest-keep.webp`, provenance, shared catalog-art partial and scoped CSS. The immutable catalog/older atlas and all other illustrations remain unchanged.
- **Acceptance/evidence:** less-fiery grounded keep; original image provenance, source/output hashes and exact crop recorded. `tests/phase49-properties.test.ts`, 320/390/430/1024px [runtime screenshots](art-integration/README.md), 44px controls, no overflow and populated-record preservation. No price, income, level, identity or financial change. Not deployed.

## 9. Moonwell Sanctuary → Gold Mine — OWNER APPROVED; display alias and artwork verified locally

- **Current:** today’s marketplace, current holdings/public profiles, new purchases, quotes and new unlock text use **Gold Mine**, with the approved original timber/ore mine illustration. The property ID remains **`moonwell-sanctuary`**. New receipt/holding name snapshots say Gold Mine; older rows and saved receipt names stay intact. Historical purchase headings use their recorded item name, with the immutable original catalog name as fallback for older receipts.
- **Components:** `src/property-presentation.ts`, current estate/profile/quote/unlock presentation, new-command labels, receipt view, shared art mapping and provenance. Unrelated `moonwell-veil` spell and `secure-moonwell` quest are unchanged.
- **Dependencies/safety:** **no SQL migration, immutable catalog edit, property-ID change or reseeding**. All costs, saved rates, quantities, income clocks, sale calculations and idempotency remain authoritative and unchanged.
- **Acceptance/evidence:** focused PostgreSQL test retains 450 bots, existing holdings, old receipts and financial journals; same-command retry returns the old saved result and does not charge again; a new buy uses the same ID/rates and new label; simulated app restart preserves the session and historical receipt. Runtime captures cover Land, holdings and Buy More at 320/390/430/1024px. [Integration evidence](art-integration/README.md). Live deployment remains unauthorized.

## 10. Tutorial and battle-result presentation — Deferred cosmetic work; existing flows verified

- **Observed:** `views/tutorial.ejs`, `views/report.ejs` and experience/celebration components retain the approved earlier behavior. This checkpoint improves recorded reward explanations and XP accuracy only; it is not a delivery of additional presentation feedback.
- **Dependencies:** owner comment 6303697572 limits this candidate to agreed alpha-blocking functional/usability items. Broader tutorial/result cosmetic changes are deferred, not marked implemented. Preserve tutorial persistence/replay, correct Land navigation, normal combat eligibility, achievements, and refresh-safe celebrations.
- **Acceptance:** focused improvements with one clear next action, readable outcomes and short nonblocking effects; no invented rewards or reset tutorial progress.
- **Existing-flow verification:** actual mobile tutorial Step 6/Land destinations, skipped/completed/replayed tutorial persistence, resource validation, new/historical receipts, reduced motion and audio/celebration replay suppression PASS in full PostgreSQL and browser/restart tests. Additional cosmetic/tutorial restructuring remains deferred, not delivered by this checkpoint.

## Review stages after the balancing checkpoint

1. **Balance checkpoint APPROVED:** keep immutable 65% policy and provisional repeat floor; no further XP changes requested.
2. **Low-risk interaction/presentation:** remove routine sounds, Profile disclosures, Calling/Home placement and compact Hall; targeted neutral panel colors. Provide mobile screenshots/tests before finalizing the stage.
3. **Assets APPROVED:** property integration retained; the four approved orchestral cues are integrated with verified CC0 provenance. Rejected audio stays archived and absent from runtime.
4. **Deferred:** broader visual redesign, professional audio refinement, new bot systems, admin dashboard, tutorial/result cosmetic polish and level/content expansion. Level 100/200 remain future targets; no level curve, cap or catalog expansion here.
5. **Administration CLOSED/WITHDRAWN:** no Gray/Development Knight moderation, no username correction, and no PR #13 activation or architecture work.
6. **Final checkpoint:** full candidate regression/preservation, final mobile evidence, dependency/runtime/safeguard audit and existing protected release instructions. Pause for owner review; no merge or deployment.

No merge, release workflow dispatch, release-infrastructure change, Railway service modification or live-data mutation is authorized by this tracker. Backlog items remain open until their stated evidence exists.

## Current interface-stage evidence

[UI stage review](ui-review/README.md), `scripts/browser-phase49-ui.ts`, and `tests/phase49-interface.test.ts` document the approved interface, 320/390/430px captures, desktop checks, keyboard/touch behavior, fixed Calling return and data-preserving navigation. Earlier stage counts remain historical. Current candidate counts/evidence are in [FINAL_REVIEW.md](FINAL_REVIEW.md) and `final-review/verification.json`. The rejected audio set remains barred from adoption.
