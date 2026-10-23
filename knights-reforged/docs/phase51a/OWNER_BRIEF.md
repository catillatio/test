# CODEX TASK — KINGDOM COME PHASE 5.1A
## Focused mobile UI and purchase-flow refinement

**Repository:** catillatio/test
**Base:** release/production (verify current HEAD and open PRs at task start)
**Delivery:** separate `feature/kingdom-come-phase-5-1a-ui-polish` branch and draft PR only.
**Approval boundary:** No merge, production deploy, protected workflow dispatch, production DB access, Railway changes, bot flag changes, real account moderation/deletion, or financial/combat policy modifications.

### Inputs
1. `KINGDOM_COME_MASTER_CODEX_BACKLOG_UPDATED_2026-10-23.txt` is the planning source. Its October 23 addendum supersedes dated deployment status in the original section 9.
2. `reference_screenshots/` contains ten OWNER-SUPPLIED screenshots of the historic Knights Reforged interface. They are **visual-reference material only**, NOT game assets, current application screenshots or proof of mechanics.
3. Inspect current `release/production` code and current PRs before editing. PR #20 Android, #25 retention, and #13 operator are separate and must remain untouched.

### Working method — avoid another sprawling investigation
- Start with a short current-state checklist: which of the four scoped requests are already present or partly implemented, exact files, and current behavior. Keep it focused; existing Phase 4.9 neutral styling and Home Calling were already approved.
- Implement the four items below as one reviewable PR. Reuse the current server-rendered EJS architecture, CSS layers, routes, shared trade/receipts and test conventions. No redesign or dependency addition unless essential.
- Run focused tests as you work. At the final checkpoint run **one** full exact-head CI pipeline and attach results. Do not repeatedly run 60+ minute full suites, long synthetic combat simulations, or unrelated research.
- Take deterministic **before and after screenshots** at 320, 390, 430px wide (mobile) and 1024px (desktop) for changed surfaces where practical. Use an isolated fixture/test DB; never mutate production. Include screenshots and a short difference summary in PR.
- Don't create more owner decision gates for ordinary technical choices; explain any material ambiguity and make safe, conservative defaults. Do not expand to deferred features.

## Scope 1 — Green background/notification cleanup
Audit active rendering of **tutorial panels, quest-completion feedback and achievement notifications** for lingering vivid green panel backgrounds, oversized pill treatments and inconsistent colors. Adjust only real offenders to the existing charcoal/steel/bronze/gold visual palette, preserving readable success meaning, focus/error states, adequate contrast and the **teal resource bars**. The original historical screenshots use green celebration *text*; don't copy their outdated green aesthetic or remove semantic success entirely. Do not globally replace the CSS green variable or undo approved Phase 4.9 work.

Relevant starting points: `public/phase49.css`, `public/realm-theme.css`, `public/remaster.css`, `public/styles.css`, `views/layout.ejs`, tutorial/achievement/quest templates. Inspect stylesheet cascade and actual computed styles, not only source colors.

**Acceptance:** No bright green background panels remain on these target surfaces; text, notification meaning and reduced-motion behavior remain legible/accessible; no teal-resource or unrelated status regressions.

## Scope 2 — Land sorting on Player/Profile
`src/profiles.ts::ownedProperties()` currently sorts grouped holdings by `grossIncome`. Instead sort existing owned Land **by the catalog's level requirement ascending**, matching the Land marketplace. Use deterministic tie-breakers (e.g., catalog order then stable ID). Account for retired/historical property IDs that may not be in today's catalog without dropping holdings or altering their saved rates/art/name/quantities. Never derive authoritative economic totals from current catalog price or rate; preserve original grouped saved holdings and public/private information rules.

Relevant views: `views/partials/profile-land.ejs` and profile public/self paths.

**Acceptance:** Both self and public profile holdings show consistent unlock-level order; missing-catalog legacy holdings still appear; gross, upkeep and net totals unchanged; unchanged current Land marketplace order.

## Scope 3 — Post-purchase flow (no redundant confirmation stop)
After a **successful** Land or equipment purchase, the standard browser POST/Redirect/GET path should return the player directly to the relevant list, retaining Armory category and ideally anchoring the purchased item. Show a small **nonblocking, server-backed** purchase success message with actual saved quantity/item/gold if available. The displayed state must be refreshed from authoritative saved data. Use existing `command` receipt/notice patterns rather than inventing client-only success. The existing `/game/purchases/:id` historical bookmarked report must keep working, including old or partial receipts.

Relevant starting points: `src/app.ts` purchase redirect (around route kinds `buy`, `land_buy`), `views/purchase.ejs`, `views/land.ejs`, `views/armory.ejs`, market forms/handlers. Preserve separate **pre-purchase** trade-quote/confirmation safeguards where required; only remove the extra post-success navigation stop. Handle ordinary single and bulk purchases, retries/same command ID, missing/expired receipts, no-JS form operation, and JSON/API callers. No transaction/accounting changes.

**Acceptance:** User remains in the appropriate catalog/category after purchase; sees accurate compact feedback, can immediately buy/sell again, refresh/back doesn't double-charge, errors remain actionable. Don't leak another user's receipts through query args.

## Scope 4 — Hall of Champions player levels
`views/champions.ejs` currently shows champion name and score, with XP only in the level category. Add each ranked character's **actual attained level directly below their name** for all existing categories, readable without enlarging rows much. `src/competition.ts::hallOfChampions` currently appears not to select attained level for each row, so extend the existing *bounded* query/projection minimally instead of issuing a per-row query. Reuse authoritative level, not level inferred from XP/score. Preserve rank, category, tiebreakers, human eligibility, top-twenty display and the player's own rank. The owner's note requests top-ten presentation, not cutting the existing top-twenty list.

**Acceptance:** All ranked entries display "Level N" beneath name at mobile widths without overlap; scores/ranks unchanged, not misleading in `Highest Level` category.

## Historical screenshot reference directions
- `01_profile_compact.png`: one-screen dense identity, resource bars, stats, income, weapons and fixed five-tab navigation. Emulate **clarity and information density**, not exact visual assets/fonts/bars.
- `02_victory_levelup_143.jpg`, `03_victory_levelup_125.jpg`, `04_bounty_victory.png`: clear celebration hierarchy and contextual rewards, but historical screenshots include *broken thumbnails* and contradictory slain/won phrasing. Do NOT reproduce defects. Larger battle-result redesign is NOT in this PR.
- `05_home_activity.png`: five-tab navigation, quick-action density and personal feed separation. Notifications and social redesign are deferred.
- `06_comments_unicode.jpg`, `10_comments_older.jpg`: readable author identity, short comment/feed entries and expressive usernames. Full Unicode policy and profanity work are deferred.
- `07_skills.png`: simple skill descriptions and clear single-action rows. No skill formula work.
- `08_profile_stats.png`, `09_public_profile.png`: stats, income, owned equipment and profile interaction hierarchy. Avoid the old large empty panels; no wholesale profile redesign here.

Original-game screenshots are user-provided for **reference only**. Do not copy/rehost/repackage copyrighted graphics into the product, reproduce proprietary marks, or assert that the screenshots reveal backend formulas. Use Kingdom Come's existing owned/approved art and styles.

## Explicit non-goals for this PR
No Spirit→Stamina rename; that is its own compatibility-sensitive UI task.
No redesign of swords/armor/spells or new generated art; separate art-review milestone.
No level-independent bounty eligibility, defender rewards, loot policy, gold grants or maintenance funding change.
No tutorial Calling step, persistent unread badges, battle-list reshuffle, Unicode acceptance, profanity filter, branding-wide rename, or account deletion.
No change to economy/combat bot automation, current private PostgreSQL volumes, recovery-copy retention PR #25, APK PR #20, operator PR #13 or protected release controls.

## Verification and final deliverable
- Focused tests for sorting including legacy IDs and saved-rate preservation; redirects/receipts including idempotency + JSON/no-JS + historical URLs; Hall actual level/rank preservation; tutorial/quest/achievement CSS and keyboard/accessibility.
- Responsive visual evidence at 320/390/430/1024; reduce unnecessary scrolling but do not shrink essential touch targets (~44px) or omit information.
- One exact-head full CI at the finish, including security, preserved assets/players, and existing recovery/release checks (run normal CI once, not independently rerunning many long suites).
- Draft PR: implementation summary, precise before/after screenshots, test outputs, known limitations, and changes deliberately deferred. Reference original screenshots only in the review attachment, not in distributed game assets.
- If a scoped requirement is already satisfied, document evidence and avoid needless changes.
- Finish by reporting HEAD SHA, draft PR URL, tests and screenshots. **Stop for owner review; never merge or deploy.**
