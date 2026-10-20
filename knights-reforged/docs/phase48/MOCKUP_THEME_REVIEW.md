# Phase 4.8 — definitive Land mockup review

**Review checkpoint; remaining screen work is paused.** Branch: `feature/kingdom-come-phase-4-8-ui-remaster`. This revision follows Stage 1 commit `21446332d7f609b3cb9b5d55972852cb5fa7b2db`. It is not a finished Phase 4.8 release or a deployment candidate.

## Visual authority and changes

The owner's latest inline Land mockup supersedes the earlier blue-gray theme, photographic-looking property sheet, and previous visual-reference priority. It supplies composition, color, framing, typography, and button direction. The existing game's data and behavior remain authoritative. The reference is available in the conversation; no repository `design-references/` directory or additional unseen screenshots are assumed.

| Mockup element | Revised implementation |
| --- | --- |
| Gold helmet, Kingdom Come wordmark, Profile link | Original shield/helmet vector, retained branding and existing Profile destination |
| Gold / income / XP / level band | Compact mobile band, larger desktop proportions, green XP meter, warm gold figures; existing server values and disclosures |
| Teal Health / Mana / Spirit row | Teal band, original heart/orb/spirit symbols, green meters, retained healing and recovery panels |
| Black and charcoal panels with restrained metal | Shared panel, tab, input, marketplace, and navigation styling replaces the blue-gray theme |
| Warm bronze beveled Buy and dark Sell | Consistent primary/secondary button gradients, clear pressed/focus/disabled states |
| Property image / details / price / actions | Landscape thumbnail frame, compact information hierarchy, one-tap forms, secondary Bulk links; no copied mockup economics |
| Gold Flow and payment | Expandable gross/property upkeep/equipment upkeep/net breakdown with the authoritative countdown and detailed rules |
| Castle atmosphere and strong navigation silhouettes | Original painted castle backdrop, original solid SVG icons, five existing destinations and selected states |

Home retains its two-column menu and all destinations. Armory retains Weapons, Armor, Spells, exact resale figures, upkeep, and automatic loadout. Land retains all catalog entries and economic rules. Shared styles also reach the other screens, but their Phase 4.8 screen-specific work is not included in this review.

## Screenshots

All captures use synthetic accounts and an isolated local PostgreSQL 18 test realm. Balances and holdings shown are test data.

- [Mobile Home, 390 × 844](mockup-review/screenshots/390-home.png) and [new-player Home](mockup-review/screenshots/390-home-new.png)
- [Mobile Armory](mockup-review/screenshots/390-armory.png) and [secondary bulk controls](mockup-review/screenshots/390-armory-bulk.png)
- [Mobile Land, expanded Gold Flow](mockup-review/screenshots/390-land.png) and [compact disclosure state](mockup-review/screenshots/390-land-compact.png)
- [Narrow 320px Armory](mockup-review/screenshots/320-armory.png) and [Land](mockup-review/screenshots/320-land.png)
- [Land purchase / Buy More](mockup-review/screenshots/390-land-receipt.png), [equipment receipt](mockup-review/screenshots/390-equipment-receipt.png), and [session recovery](mockup-review/screenshots/390-session-recovery.png)
- [1024 × 1536 Land composition](mockup-review/screenshots/1024-land.png), [desktop Home](mockup-review/screenshots/1366-home.png), and [desktop Land](mockup-review/screenshots/1366-land.png)

Armory shows four complete rows at 390 × 844. Land shows three plus the next row with the full Gold Flow breakdown open, and at least four complete rows when that accounting disclosure is closed. Buy/Sell remain at least 44 × 44px. The mobile resource band is approximately 103px, excluding the 44px brand bar. Desktop uses the mockup's more generous header proportions.

## Assets awaiting review

The [revised painted property sheet](previews/property-illustrated-v2.png) follows the mockup's illustration direction. It has **not** replaced runtime property assets. The six tiles correspond to existing property identities, not the mockup's invented catalog values. See [tile order and provenance](previews/README.md).

The original castle backdrop is provisionally used to review the UI's atmosphere. Its [provenance and hash](../../public/art/remaster-ui/castle-provenance.json) distinguish it from the [manually authored original SVGs](../../public/art/remaster-ui/provenance.json). No extracted APK artwork is referenced by current templates/styles or requested in browser checks. Historical extracted files remain in the public tree; their retirement is still required before a release.

Audio assets, playback logic, defaults, and saved preferences have not changed. Audio samples remain a later owner-review step.

## Safety and scope

The approved transaction refactor remains intact. Single and bulk forms share in-flight and ambiguous-outcome recovery; retries preserve the same command and quantity. A refresh cannot award a second receipt. Expired sessions preserve the marketplace destination and selected quantity. Land updates cannot unlock a pending purchase. Server price, eligibility, ownership, and wallet validation remain unchanged.

This revision changes no `src`, rulesets, migrations, deployment controller, release workflow, or marketplace client JavaScript. It adds no database migration. No bot provisioning, balance adjustment, reward-formula change, new financial calculation, or broadcast moderation was performed. No live database or Railway service was accessed. Nothing was merged or deployed.

## Verification

Fresh results are recorded in [verification-mockup.json](verification-mockup.json), with [Phase 4.8 browser evidence](mockup-review/browser.json). They cover TypeScript, build, 93 static checks / 73 EJS fixtures, the 48 focused PostgreSQL/client/rendering/security tests, and responsive marketplace safety checks. The existing Phase 4.7 browser regression also exercises the wider shared interface and existing audio/recovery behavior.

The legacy browser header assertion now keeps its existing 110px limit for mobile and checks the new mockup proportions separately on desktop. No gameplay or security expectation was relaxed. The older [full-suite report](verification-stage1.json) belongs to the preceding Stage 1 commit; it is not presented as a new full-suite run for this visual revision.

These are Chromium development checks, not certification of physical Android/iPhone or Safari/WebKit behavior. Prolonged idle uses a simulated browser clock. Subjective typography, art, and sound acceptance require owner review. No live financial or deployment behavior was tested.

## Owner review before continuing

Review the shared theme on Home, Armory, Land, and the painted property proposal. After this checkpoint, the remaining Phase 4.8 work includes Quest region navigation, Battle cleanup/results, Profile ordering, Recruit/Vault/Settings refinements, all eight tutorial steps, sound audition/replacement, bot-economy investigation and the approved loss-eligibility policy, and final preservation/security verification. Calling management stays in Profile/Settings. Broadcast cleanup remains a separate exact-ID owner-approved moderation action.

Protected Phase 4.7 release, recovery, backup, and approval controls remain unchanged. No production workflow should be dispatched to review this stage.
