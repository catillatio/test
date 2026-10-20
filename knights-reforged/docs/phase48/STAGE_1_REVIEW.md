# Phase 4.8 — first visual-stage review

**Historical preview.** The owner rejected this blue-gray visual theme and the photographic-looking property direction below. They approved the compact layouts and transaction-safety work. The newer [definitive-mockup theme review](MOCKUP_THEME_REVIEW.md) supersedes this page's visual proposal and screenshots. Verification here records the earlier Stage 1 baseline; it is not a fresh run against the revised theme.

Status: **preview; owner review required before remaining screens**. Base: `release/production` at `cf4a99d378c2bf2991228ed3fcd2a25a85004ecf`. Branch: `feature/kingdom-come-phase-4-8-ui-remaster`. This is not a completed Phase 4.8 release or a deployment candidate.

## Implemented

- Original charcoal/steel/gold UI primitives, clearer buttons and tabs, compact resources, original vector navigation and courtyard treatment. Existing Kingdom Come branding and five destinations are preserved.
- Home retains all seven menu destinations and all four activity categories, with less repeated copy and more compact tiles. No broadcasts were moderated.
- Armory and Land default to one-item Buy/Sell. Exact sale returns appear on Sell; optional bulk links open focused, URL-addressable controls with 1/5/10/Max and existing server-derived projections.
- The transaction recovery refactor was committed and tested **before** switching marketplace templates. Single and bulk forms share pending/in-flight state for the same item and action. Fresh CSRF comes from the authenticated state read. Ambiguous retries retain the original command and quantity, including when retried from another control. Session expiration preserves the intent and provides an allowlisted sign-in return link. Different signed-in characters cannot submit the saved intent.
- Gold Flow presents net/hour and the persisted deadline compactly. Gross income, both upkeep categories, prepaid-reserve explanation, retained income, offline income and marketplace rules remain available in the disclosure. Only the shared marketplace code owns trade-button eligibility; income refresh cannot unlock a pending transaction.
- Buy More and Return to Land/Armory remain. Land and purchase receipts select the appropriate existing bottom tab.

There are no migrations, rule/catalog changes, bot provisioning, bot financial adjustments, new rewards or balance resets. Calling management is unchanged. Existing authentication/session/Origin/CSRF logic and all protected release/recovery files are unchanged.

## Visual review

Actual screenshots use an isolated synthetic PostgreSQL realm; no live data or services are involved. At 390 × 844, the catalog captures show **four complete rows** with 44px trade buttons. Resource-row height is approximately 96px, excluding the brand bar. Responsive checks visit Home, all Armory categories, Land and both bulk interfaces at 320, 360, 390, 412, 430 and 1366px widths (42 visits), with no horizontal overflow or browser errors.

- [Home](screenshots/390-home.png) and [new-player Home](screenshots/390-home-new.png)
- [Armory](screenshots/390-armory.png) and [bulk controls](screenshots/390-armory-bulk.png)
- [Land](screenshots/390-land.png) and [bulk controls](screenshots/390-land-bulk.png)
- [Land receipt / Buy More](screenshots/390-land-receipt.png)
- [Equipment receipt](screenshots/390-equipment-receipt.png)
- [Income details](screenshots/390-income-details.png)
- [Expired-session recovery](screenshots/390-session-recovery.png)
- [Desktop Home](screenshots/1366-home.png) and [desktop Land](screenshots/1366-land.png)

See [browser evidence](browser-stage1.json). The same synthetic level-15 marketplace content fragments are 55% smaller for Armory and 51% smaller for Land after moving bulk controls off the default rows; see [measurement scope and bytes](payload-comparison.json). This excludes layout, compression and cache and is not a latency benchmark. Browser checks use Chromium touch emulation; physical iPhone/Android, Safari/WebKit and subjective audio quality are not certified. Three-hour idle uses a simulated browser clock.

## Asset approval boundary

The property [direction sheet](previews/property-direction.png) is an original generated proposal, not a balance specification and **not loaded by the game**. Review framing/materials/lighting before the later 21-property pass. Current screenshots retain existing original generated catalog art.

New SVG UI assets have [provenance](../../public/art/remaster-ui/provenance.json) and a CC0 notice. No copied/traced Storm8 geometry or sampled artwork was used. Runtime templates/styles no longer reference APK backgrounds, crest or navigation graphics; browser checks verify no requests to them. Historical extracted files/provenance have not been purged from the repository. Their final removal from the public asset tree belongs to the asset-retirement pass before any release.

Replacement audio has not been adopted. A separate audition and license review remains required. Existing sound preferences, default behavior and playback engine are unchanged in this stage.

## Next stages after owner approval

1. Apply reviewed direction to Quest region navigation, Battle/results, Profile ordering, Recruit, Vault and Settings.
2. Complete the eight-step tutorial redesign and optional first-session introduction; retain all stored progress.
3. Audition sound samples and property-art candidates before final runtime adoption.
4. Implement/test the approved policy that bot **losses do not consume gold-reward eligibility**, retaining numerical anti-farming limits. This stage changes no combat reward formula or eligibility policy. Existing 450-bot blueprint and offline-income tests remain the baseline; no production balances were inspected.
5. Complete Phase 4.8 preservation, migration/no-op, security and visual acceptance checks before a separate release review.

No merge, release workflow dispatch, Railway operation or production database access is authorized by this preview.

## Completed verification

- TypeScript and production build: passed.
- Full automated run with local PostgreSQL: **422 passed, 0 failed, 1 skipped** (423 tests). The skipped test requires the real hosted-runner network namespace; no production credentials were used to bypass it.
- Static/template/asset checks: **92 passed**, including 73 production-template fixture renders.
- Existing Phase 4.7 browser regression: **64 responsive visits**, audio engine and shopping recovery passed.
- First-stage Phase 4.8 browser checks: **42 responsive visits** and actual transaction/recovery flows passed.
- Compiled-process restart persistence: passed, including exactly three offline income periods and no duplicate payouts.
- Application and release-controller production-dependency audits: **0 vulnerabilities** reported by each audit.
- Protected release/deployment/migration/ruleset paths: unchanged from the base commit.

See [structured verification](verification-stage1.json), [safety findings and limitations](SECURITY_STAGE_1.md), and [local test instructions](TESTING.md). These are development checks; no Railway deployment or live configuration was tested.
