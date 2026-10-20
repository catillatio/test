# Phase 4.8 shared-screen review

The owner-approved Land design is now the shared visual foundation. This is a **feature-branch review**, not a production release. No Railway service, production database, broadcast or release workflow was changed.

## Visual review

All captures render real server templates against a populated, isolated local PostgreSQL fixture. Names, balances, inventory and purchases are synthetic test data. Screenshot bytes are unaltered; [checksums](shared-review/screenshots.json) identify every capture.

| Screen | 390px | 320px | 430px | 1024px |
|---|---|---|---|---|
| Home | [View](shared-review/screenshots/390-home.png) | [View](shared-review/screenshots/320-home.png) | [View](shared-review/screenshots/430-home.png) | [View](shared-review/screenshots/1024-home.png) |
| Armory | [View](shared-review/screenshots/390-armory.png) | [View](shared-review/screenshots/320-armory.png) | [View](shared-review/screenshots/430-armory.png) | [View](shared-review/screenshots/1024-armory.png) |
| Land | [Collapsed](shared-review/screenshots/390-land-compact.png) | [View](shared-review/screenshots/320-land.png) | [View](shared-review/screenshots/430-land.png) | [View](shared-review/screenshots/1024-land.png) |
| Quests | [View](shared-review/screenshots/390-quests.png) | [View](shared-review/screenshots/320-quests.png) | [View](shared-review/screenshots/430-quests.png) | [View](shared-review/screenshots/1024-quests.png) |
| Battle | [View](shared-review/screenshots/390-battle.png) | [View](shared-review/screenshots/320-battle.png) | [View](shared-review/screenshots/430-battle.png) | [View](shared-review/screenshots/1024-battle.png) |
| My Profile | [View](shared-review/screenshots/390-profile.png) | [View](shared-review/screenshots/320-profile.png) | [View](shared-review/screenshots/430-profile.png) | [View](shared-review/screenshots/1024-profile.png) |

Additional 390px captures: [Armor](shared-review/screenshots/390-armor.png), [Spells](shared-review/screenshots/390-spells.png), [Recruit](shared-review/screenshots/390-recruit.png), [My Army](shared-review/screenshots/390-army.png), [Army Dashboard](shared-review/screenshots/390-dashboard.png), [Vault](shared-review/screenshots/390-vault.png), [Settings](shared-review/screenshots/390-settings.png), [Hall of Champions](shared-review/screenshots/390-champions.png), [Achievements](shared-review/screenshots/390-achievements.png), [Bounties](shared-review/screenshots/390-bounties.png), [Victory](shared-review/screenshots/390-victory.png), [Revenge](shared-review/screenshots/390-revenge.png), [Level-Up](shared-review/screenshots/390-level-up.png), [Locked region](shared-review/screenshots/390-quests-locked.png).

Tutorial: [Introduction](shared-review/screenshots/390-tutorial-intro.png), [First lesson](shared-review/screenshots/390-tutorial-step.png), [Quest highlight](shared-review/screenshots/390-tutorial-quest-highlight.png), [Land lesson](shared-review/screenshots/390-tutorial-land.png), [Completion](shared-review/screenshots/390-tutorial-complete.png).

The original definitive mockup and [approved same-size comparison](land-only-review/comparison.png) remain unchanged. [Land preservation measurements](shared-review/land-preservation.json) compare the current 1024×1536 rendering against the approved baseline: **zero changed pixels outside the requested price and Gold Flow metadata**. Display time is frozen during that comparison, then resumed for interactions.

## What changed

1. **Shared components:** the approved Land header, atmospheric background, resource bars, bronze/steel buttons and five-tab navigation were extracted into `realm-theme.css`. Other screens use those components; the Land-specific stylesheet still loads only on Land. Duplicate headings remain accessible to screen readers without wasting vertical space.
2. **Land refinements:** collapsed Gold Flow shows authoritative signed net income and the same live countdown as the expanded breakdown. Bulk is below the image on phones, away from Buy/Sell, with a 44px target. Prices are slightly smaller than names. Mobile rows remain 98px; five complete rows fit at 390px when accounting is collapsed. All 21 server-defined properties, prices, ownership limits, upkeep and payment rules remain authoritative.
3. **Home:** retained the two-column menu, existing destinations and announcement/feed functionality. Calling stays in Profile/Settings. Hall of Champions keeps its existing entry, without a sixth bottom tab.
4. **Armory:** compact weapons, armor and spell rows; one-tap single-item Buy/Sell; secondary Bulk controls; exact sale return, owned count, stats and upkeep remain visible. Single/bulk pending intents still share a lock and recover the same transaction after ambiguous responses. Tablet breakpoint conflicts were corrected rather than reducing touch targets.
5. **Quests:** previous/next navigation, actual filter position and complete metallic region list, including lock labels. All Regions/Nearby and remembered filters remain. Quest cards, requirements, mastery, rewards and direct missing-equipment purchases retain the existing handlers and short confirmed-result effects.
6. **Battle:** Recent Rivals UI and the aggregate power strip are removed. Durable history, human rivalry backend, Hall of Champions and Revenge remain. Compact rival rows and result panels use the shared presentation. Longer temporary-rival explanations are expandable.
7. **Profile:** removed the personal join-date line under Achievements/Tutorial. Army and Equipment now precede Kingdom Holdings; detailed stats, income, inventory, loadouts, skills, Callings and battle records remain.
8. **Recruit / My Army:** copy invitation code with one tap; device copy fallback selects the code. Compact code-entry form; advanced invitation rules stay available in a disclosure. Consent, membership, militia compatibility and caps are unchanged.
9. **Vault:** restrained shared styling, prominent balances and existing transaction history. No banking calculation or financial handler changed.
10. **Tutorial:** new public signup opens an optional introduction once. Start/Skip, persistent Resume/Replay, eight original objectives and completion evidence remain. Each lesson has one dominant action; Back, optional Next and Skip are in a disclosure. Targets receive a non-obstructing outline, Show Me can focus an already visible action, completed steps are explicit, and resource hints explain recovery/affordability. No reading/replay action spends gold or fabricates gameplay evidence.
11. **Audio / Settings:** new public signups receive enabled sound preferences, still subject to gesture unlocking. Existing saved choices and legacy muted fallback are untouched. Debounced autosave uses fresh CSRF, identity checks and the existing idempotent command endpoint; uncertain writes retain their command ID and payload. No initial/background save occurs. Original runtime effects are retained pending the separate [licensed sound audition](audio-audition/README.md).
12. **Bots:** the approved victories-only reward-eligibility fix ignores historical losses when counting the unchanged one-per-opponent / six-per-day allowance. New losses store `rewarded=false`. No old receipt is rewritten, no gold is generated, and no balance, portfolio, Calling, equipment or army is reset. Details: [economy audit](BOT_ECONOMY.md).
13. **Assets:** unused APK-derived files are removed from the public tree and guarded against reintroduction. Historical provenance is retained under [retired-art](retired-art/README.md); original replacement assets and catalogs remain.

## Verification and boundaries

- [Shared browser report](shared-review/browser.json): **176 visits**, eight widths (320, 360, 390, 412, 430, 768, 1024, 1366), five tabs, no horizontal overflow or JavaScript errors, shared header/navigation agreement, 44px marketplace controls, actual copy/settings/tutorial flows and unchanged human state/450 bot identities during page review.
- [Marketplace report](shared-review/marketplace.json): 56 responsive visits, single-item duplicate suppression, bulk/receipt recovery, three-hour simulated idle, expired session retention, authoritative sale refunds and keyboard Gold Flow.
- [Audio/session report](shared-review/audio-engine.json): 64 responsive visits, 19 cues decoded, gesture unlocking, mute/volume persistence, one sprite, duplicate suppression, interrupted receipt recovery and reduced-motion behavior.
- Static checks render 73 EJS cases; TypeScript and production compilation are required. Full regression and populated-fixture results are recorded in [verification](verification-shared.json) for the completed clean run.
- Release infrastructure, deployment scripts, migrations and versioned economy catalogs are unchanged. There is no upgrade initialization, reseed, account reset or administrative grant in this work.

## Remaining owner review

- Review these actual shared-screen captures before visual finalization. This is **not** another Land-only approval checkpoint.
- Approve or revise the [new sound audition](audio-audition/README.md) before runtime adoption. No new sound has been adopted without that approval.
- The first six Land images use the approved illustrated set. Later properties retain their existing original catalog illustrations; a fuller artistic pass can be reviewed separately without changing property data.
- No exact live broadcast IDs are available here. Nothing was hidden. Use the separate [two-record review and reversible moderation procedure](../../PHASE_4_6_RELEASE.md#one-time-owner-authorized-broadcast-moderation) only after owner identification and approval.
- Chromium emulation does not prove physical Android/iPhone behavior or Safari playback quality. Device listening, touch and safe-area checks remain necessary before release.
