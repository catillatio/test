# Complete local rebuild — owner review

This is one clean implementation of the sixteen-item request, based on `release/production` at `d6a0c831ade5f0f7265f565906f6e4cf94330fcd`. The remote release ref was rechecked unchanged. Worktree: `/dev/shm/kingdom-complete-rebuild`; branch: `feature/complete-gameplay-rebuild-20261111`. The review bundle's `LOCAL_HEAD.txt` and verification manifest identify the final commit and exact executions.

The rejected `feature/gameplay-improvements-20261110` implementation was not used, cherry-picked, reset or deleted. New migrations are 046–052, deliberately distinct from its rejected 041–045. Existing release migrations 001–026 and installed historical ruleset definitions retain their meaning. PR #88 remains independent at `3d273e806575ea63e22148b7c04fae91e259e5a8`. Existing owner-runtime telemetry is retained.

## Evidence matrix

F = `tests/complete-rebuild-finance.test.ts`; N = `tests/complete-rebuild-rivals-npc.test.ts`; B = `tests/complete-rebuild-browser.test.ts`. Final pass/fail counts belong to the external exact-head verification report, not this pre-verification checklist.

| Item | Implementation and local verification | Main files / review evidence |
|---|---|---|
| 01 HUD coin | One original coin beside carried Gold; square 13–16px, tighter spacing; no price/reward coin duplication. B checks five tabs and nested views at 320/390/412/768/1280. | `views/partials/resources.ejs`, consolidated CSS; Home/Quests/Rivals/Armory/Recruit captures. |
| 02 Achievements | Versioned lifetime payments, unique command and milestone receipts, human-only locked settlement, overflow retained in the existing treasury. Default OFF. F tests retroactive/new awards, concurrency, rollback, endgame, replay and unchanged evidence. | `src/achievement-gold*.ts`, `experience.ts`, migration046, actual milestone ledger and original SVG heraldry; nine achievement comparisons. |
| 03 Recovery | Compact coordinated red/blue/amber disclosures, genuine next recovery and offline intervals. Only Health has a paid action. B tests keyboard focus/Escape, full/poor states and a lost acknowledgment retried without a second debit. | `partials/resources.ejs`, `public/status.js`; Health/Mana/Stamina and additional full/poor captures. |
| 04 Calling | New actual switches cost 1,000,000 carried Gold and start exactly 604,800 seconds. Same class is free. Previously completed changes retain their original 24-hour eligibility promise. F/B test quotes, native forms, boundaries, concurrency, rollback and replay. | `calling-change-policy.ts`, `commands.ts`, migration047, Home/tutorial Calling controls. |
| 05 Rest of UI | Route/view audit, readability and state fixes listed below. Approved scenes, five destinations, crimson Attack, catalog assets and compact density retained. | Static EJS fixtures, existing browser matrix, B; Quests, Settings, Recruit, Bounties, Profile and report comparisons. |
| 06 Rivals | Full indexed legal level-window candidate selection; batched equipment/army projections and exact current XP functions/roll grid. Expected attainable XP outranks arbitrary UUID rotation. Owner-bound, expiring, duplicate-free saved ordering; fresh target eligibility per page. | `rival-recommendations.ts`, migration050; N's real 900-NPC pagination, query budgets and independent state-builder XP comparison. |
| 07 Crowns | Real zero-opening separate balance and immutable provider/idempotency ledger foundation. Original Crown emblem, three unavailable offers; Home shortcut and Settings Rules link. Every purchase/use/grant/refund POST is rejected. No SDK, checkout, prices or effects. | `crowns.ts`, migration048, `views/crowns.ejs`; F/B and three-width Market captures. |
| 08 Upkeep | Semantic expense color outranks component finishes. Owned/public Profile, property/gear rates, maintenance, disclosures and quotes use restrained red. Positive income and prices remain Gold; negative net is red. | Consolidated financial-semantics layer, explicit EJS markers, `land.js`, `shopping.js`, `status.js`; B computed-style checks. |
| 09 Social scale | Readable ivory message bodies with dark text, neutral uniform 15px player links and a clear author/body distinction. Text is escaped; moderation/report actions remain. | Consolidated activity styles; populated comments/broadcast captures; existing social and browser tests. |
| 10 Notifications | Exact event reads on actual visible headings, including Tales, saved reports and bounty events. Paginated unread context and optional fixed-ID mark-all; no time watermark. Pending Army invitations are independent. | `notifications.ts`, migration049, player-experience client; B's old/off-page 5→0 without mark-all, F's late commit/microsecond/foreign-account tests and existing restart/CSRF tests. |
| 11 Tales | Fine fight dividers, distinct outcomes, uniform opponent links, saved reward/damage values and separated date/report footer. No invented historical amounts. | `partials/tales.ejs`; varied real synthetic fights, report access and existing pagination tests. |
| 12 NPC armies | Versioned varied level-based defaults; wallet-funded membership/equipment preparation and immutable receipts. Explicit future local generator applies defaults only to new identities; historical provisioning/endowment definitions stay intact. Existing-NPC adjustment is loopback/fixture/*_test-only. | `npc-army.ts`, `future-local-npcs.ts`, migration051; N's saved before/after rosters, paid costs, original identities and no-grant evidence. Production adjustment remains unavailable. |
| 13 Land rate | HUD displays actual current net/hour, separately from the next prorated payment. Native and enhanced trades, foreground/back navigation and cross-tab refresh read server state. No new income tick or clock reset. | `resources.ejs`, `realm.js`, `market.js`, existing Land client; F/B actual purchases and sales with unchanged payment boundary. |
| 14 NPC bounties | Working default-off server worker uses normal principal/fee/escrow writes, saved wallets and genuine finance settlement. Global window receipts, caps, target hold, private holds, eligibility/ally and pending-erasure checks. No NPC attacks. | `bounties.ts`, migration052, guarded config/server lifecycle; N's actual postings, retry, cap, finishing claim, cancellation and expiry refunds. |
| 15 Mute | Visible expiry-derived notice at composer, disabled controls, exact end time and existing announcements contact instructions. Server still rejects direct posting; expiry restores it. Private notes never render. | `community.ts`, `partials/message-form.ejs`; F/B and muted capture. |
| 16 Portraits | Three original painted full-bleed portraits, actual 60×60, selected by the viewed profile's Calling. Owner review remains required before release. | `public/art/class-portraits-1/provenance.json`, `profile.ejs`; three in-app states, actual-size crops and enlarged review sheet. |

Optional 17: shared paper and player-link tokens gain approximately 7.6% and 7.8% contrast against the original near-black background; muted text is lifted by about 8%. No global filter, image contrast manipulation or palette replacement is applied.

## Proposed reward balance and economic limits

`achievement-gold-1`: ranks I–VI = **500 / 2,500 / 10,000 / 50,000 / 100,000 / 150,000 Gold**. These are delegated design proposals, not a claim that the owner individually approved each amount. Rank VI specifically remains an installation-review checkpoint.

Maximum one-time liability per human is **378,000 Gold** for all 23 original milestones, or **528,000 Gold** for all 24 expanded milestones. Existing eligible human count/progress is not known from local fixtures: total retroactive liability must be measured privately before activation; its upper bound is 528,000 × eligible humans. The 900 development NPCs receive zero. This is deliberate new achievement issuance recorded under its own policy, not a wallet transfer disguised as income.

NPC army bands are proposed at 20% weaker / 65% matched / 15% elite, with actual participation bounded by existing army rules and the 20 retained-militia storage limit. Legacy rivals remain capped at 10; expanded cohort members retain their sealed historical base. Recruiting an NPC benefits the human roster without reciprocally adding a human ally to that NPC. Listing/ranking projections and paid adjustments follow the authoritative non-reciprocal roster rule; the 900-NPC regression includes a recruited expanded NPC. Membership costs the existing unit cost (12 Gold), equipment uses actual shop costs, and saved property income constrains ongoing upkeep to 70%. No extra capital, Land, Vault withdrawal or free gear is available in the adjustment. Fresh reviewed quotes fail on drift. The final synthetic evidence contains exact costs and level-bin distributions; these are not claims about current production wallets. Real-world funding/roster review is a separate authorization checkpoint.

NPC sponsorship proposals: at most two active, three placements per rolling 24h, 72h target cooldown, 5% selection per hourly evaluation, 250–2,000 principal with a conservative level/purse budget. Maximum nominal daily principal is 6,000; existing 10% fees are a sink, and principal is transferred from genuine NPC funds or refunded once. It does not create Gold. Actual level-100 budget is lower than the nominal upper bound. A missing/unknown population, lack of funds, pending erasure, active hold or ineligible target does not trigger replenishment. Same-window restart cannot create another contract.

## Additional discretionary polish ledger

1. Quest requirements/rewards and unlock labels are more legible, with wrapped requirements rather than cramped tiny text.
2. Disabled Attack reasons are visible on touch screens, instead of relying solely on a hover title. Crimson controls and attack behavior are unchanged.
3. NPC-sponsored listings identify their origin without adding sponsor-name clutter to ordinary compact listings. Bounty payout framing uses the existing contract-scroll emblem, preserving compact repeat-combat access without duplicating the Gold coin.
4. Disabled purchase/combat labels have improved contrast while remaining visibly unavailable.
5. Recruit invitation codes use a readable neutral ink and restrained baseline treatment; clipboard value and invitation rules are unchanged.
6. Profile account/sign-out controls use a constrained two-column layout with wrapping usernames, preventing overlap.
7. Currency form numeric-keyboard hints, uniform Settings control alignment and native focus behavior are preserved/refined.
8. Tales removes the global block-style muted-word inheritance and gives dates/report links their own compact footer.
9. Temporary-rival help describes the active saved roster instead of incorrectly claiming that every expanded NPC is capped at ten, and distinguishes optional wallet-funded sponsorship from NPC attacks/claims.

These are component fixes, not a claim that every audited page needed replacement.

## References and screenshot method

The initial sparse checkout omitted the requested reference paths. Their exact tracked bytes were recovered from d6a0c83: `docs/dark-medieval-release/README.md` and `overview.jpg`, original-reference `comments.png`, `player-income.png`, `skills.png`, Storm8 social captures/provenance, and artwork requirements. The approved gallery and real d6a0c83 application supply the visual baseline; supplementary earlier review captures are not represented as the approved source. Original screenshots remain layout references only. Separate owner Drive Profile/class images were not located; no invented attribution is asserted. No original-game pixels were copied into shipped assets.

The gallery uses actual Chromium, shared synthetic PostgreSQL state, the same route/account, viewport, zoom and crop for both renderers. Three portrait source artworks are identified separately from screenshots. Visual-only capture blocks the read-ack POST in both renderers to keep evidence/badges frozen; normal JavaScript timers and clients run. Independent B tests prove real acknowledgment behavior with requests enabled. Every primary comparison uses the same absolute document scroll offset. Where changed row heights move a section, additional content-aligned after views and both offsets are recorded explicitly.

The curated gallery has 24 labeled pairs plus necessary additional states, not an indiscriminate full-page screenshot dump. Raw captures and machine-readable checks remain available.

## Release and activation boundaries

Nothing here is merged, pushed, deployed or installed into production. No hosted CI, Railway settings, live accounts, real NPC funds, recovery copies, credentials, Android signing or Google Play submission are changed. No MOBSTAS files are touched.

- Achievement payments stay OFF until balance/liability review and separately authorized installation/activation.
- Crowns purchasing/use remains hard-disabled; enabling real money commerce needs a separate provider/refund/security review.
- NPC sponsorship stays OFF (`ENABLE_NPC_SPONSORSHIP` absent/0). Its one production activation checkpoint is a separately approved protected release/configuration operation setting that flag, after reviewing population, targeting and purse budgets. It is not executed here.
- NPC membership adjustment and future generation are deliberately restricted to isolated local fixtures; there is no live adjustment route or scheduler.
- Portraits and the full visual gallery require owner review before release.
- PR #88 erasure remains disabled/independent. Before combining releases, its reviewed erasure/recovery handling must account for these new minimal financial receipts and disposable notification/rival caches. This task does not certify that future integration or change its privacy policy.
- Startup and protected post-deployment verification advance the exact required schema pin to 052; they still reject stale/unknown heads, including 026. Signed-image, recovery, encryption, population and owner gates are retained.

## Local verification and known environment limits

The final verification manifest records exact Git HEAD, typecheck/build/static results and every local unit/PostgreSQL/Chromium lane. Tests added here include populated 026→052 preservation/replay, not merely empty-schema migration.

Model/effort/speed controls are unavailable in this environment; no global configuration was changed. One implementer performed this work without delegation. Existing dependencies are reused, including an exact-lock cached release-controller dependency tree. Disposable PostgreSQL 18 and Chromium run in the cloud; no Windows/owner computer is accessed. This runtime's Node version differs from hosted CI's pinned Node 24.22.0 and is recorded in evidence.

The protected container recovery/image/retention delivery matrix is separate from the application test manifest. It must not be represented as passed unless actually executed at the final source. Hosted CI is unauthorized; local container capacity/prerequisites are recorded honestly in the final report. Required release guards are not skipped or weakened to compensate.
