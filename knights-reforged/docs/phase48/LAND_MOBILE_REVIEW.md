# Phase 4.8 — Land mobile proportions

**Mobile review pending.** The owner approved the 1024 × 1536 visual direction from `e8c0f63`. This follow-up changes only Land's responsive styling at widths of 430px and below. No other Phase 4.8 screen or stage has been advanced.

## Review captures

All mobile captures are actual Chromium touch-emulated game pages, 844px high, backed by an isolated synthetic PostgreSQL realm. Gold Flow was collapsed with its existing control; the default expanded state remains available. Values are the existing authoritative catalog and fixture holdings, not the mockup's illustrative data.

| Width | Gold Flow collapsed | Gold Flow expanded |
| --- | --- | --- |
| 320px | [320 × 844](land-mobile-review/screenshots/320-land-compact.png) | [320 × 844](land-mobile-review/screenshots/320-land.png) |
| 390px | [390 × 844](land-mobile-review/screenshots/390-land-compact.png) | [390 × 844](land-mobile-review/screenshots/390-land.png) |
| 430px | [430 × 844](land-mobile-review/screenshots/430-land-compact.png) | [430 × 844](land-mobile-review/screenshots/430-land.png) |

Additional checks: [390px income disclosure](land-mobile-review/screenshots/390-income-disclosure.png), [Health disclosure](land-mobile-review/screenshots/390-health-disclosure.png), and [bulk controls](land-mobile-review/screenshots/390-land-bulk.png).

The [approved 1024px reference comparison](land-only-review/comparison.png) and [1024 × 1536 actual render](land-only-review/screenshots/1024-land.png) are **unchanged files**. The comparison still embeds the definitive reference and the actual render at their original dimensions. A fresh render from this revision also matches the approved actual render at every pixel: **0 differing pixels out of 1,572,864**. This proves desktop preservation, not equality between the game and the mockup.

## What changed

| Measurement at 390 × 844 | Before | This revision |
| --- | --- | --- |
| Land heading | 30px type; 54px section | 23px type; 38px section |
| Resource/status bands | 102px combined | 94px combined |
| Health/Mana/Spirit icons | 22 × 25px | 18 × 21px |
| Status control target | 47px high | 44px high; flatter outline |
| Income disclosure target | 24px high | 44px high, including the gold line |
| Level target | 35px wide | 44px wide |
| Gold Flow title / icon | 22px / 27 × 29px | 18px / 22 × 24px |
| Collapsed Gold Flow panel | 62px high | 59px high |
| Expanded figures block | 72px high | 62px high |
| Property row | 106px high | 98px high |
| Row corner / spacing | 8px / 7px | 5px / 6px |
| Property name | 17px | 16px; 15px at 320px |
| Property image frame | 90 × 60px | 80 × 58px; existing 68 × 49px at 320px |
| Buy/Sell height | 46px | 44px |
| First row, collapsed Gold Flow | y=272px | y=242px |
| Bottom navigation | 62px high | 58px high; each tab remains 56px high |
| Complete rows above navigation, collapsed | 4 | 5 |

The framing changes use the same original image files. At 320px, Bulk sits beneath the illustration so the full description column remains available and “Upkeep / hour” no longer wraps around that link. It retains a 68 × 44px target. At wider phones Bulk stays beside the upkeep line. Health, income, Mana, Spirit, and XP disclosures remain functional, with smaller panel padding and visible keyboard focus.

## Verification

- TypeScript check and production build: passed.
- Static checks: **94 passed**, including **73 production EJS fixtures**.
- Focused client, shopping, HTTP, rendering, and security regressions: **48 passed; 0 failed; 0 skipped**.
- Focused Land browser run: **18 Land/bulk responsive visits** at 320, 360, 390, 412, 430, 768, 900, 1024, and 1366px; no horizontal overflow, five tabs, contained 44px+ trade buttons.
- Added mobile review checks at 320, 390, and 430px: five complete collapsed rows; all 77 rendered header/status/trade/Bulk/navigation targets per viewport measure at least 44 × 44px; every fully visible target's center is reachable. All five resource disclosures open and close from the keyboard with visible focus.
- The compact override stops at 430px; 431px retains the existing layout. Desktop bounds, fonts, colors, borders, and shadows match the approved baseline. The fresh 1024 × 1536 screenshot passes a native-pixel comparison in a separate network-blocked browser context; the application's CSP remains unchanged.
- Existing shared browser regression: **56 responsive visits** at 320–1366px; double-submit suppression, Buy More/bulk intent persistence, simulated three-hour idle, lost committed response recovery, and expired-session recovery passed.
- Focused actual PostgreSQL transactions: double submission purchases once; receipt refresh does not charge again; sale pays the exact authoritative refund once; bulk quantity survives reload; Return to Land works.
- Empty Land state remains readable at 390px and 1024px. No browser errors were recorded.

[Browser evidence](land-mobile-review/browser.json), [mobile bounds and hit areas](land-mobile-review/mobile-layouts.json), [shared browser evidence](land-mobile-review/shared-browser.json), and [verification manifest](verification-land-mobile.json) contain the detailed results.

### Reproduce locally

Use only a disposable local PostgreSQL database ending in `_test`. Do not use Railway, Codespaces player data, or an application `.env`.

```sh
cd knights-reforged
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55488/phase48_test'
npm run typecheck
npm run build
npm run check:static
npm exec -- tsx scripts/browser-phase48-land-review.ts --mobile-review
npm run test:browser:phase48
npm exec -- tsx --test --test-concurrency=1 \
  tests/phase48-market-client.test.mjs tests/land-client.test.mjs \
  tests/phase43-shopping.test.ts tests/integration.test.ts \
  tests/rendering.test.ts tests/phase44-security.test.ts
```

The database URL is this workspace's isolated test container. Supply your own disposable equivalent when reproducing. The browser script refuses ordinary non-local/non-test database targets and drops only its own synthetic fixture schema on exit.

## Scope and remaining review

The only application file changed is `public/land-review.css`. Its approved contents remain an exact byte prefix; the appended selectors are scoped to `.kingdoms-ui.screen-land` inside mobile media queries. The stylesheet still loads only on Land. Home and Armory computed-style fingerprints match their untouched baseline. Templates, game/server code, transaction/recovery JavaScript, artwork, catalogs, migrations, deployment scripts, and protected workflows are unchanged.

The mobile arrangement is a responsive adaptation, not a miniature copy of the 1024px layout: price/ownership sit above Buy/Sell, Gold Flow stacks its details, and long property names can wrap at 320px. Five complete rows fit in the tested 844px-high viewport. Expanded accounting, bulk forms, connection warnings, browser chrome, or device safe-area insets reduce the visible row count.

This pass was checked in Chromium touch emulation, not on physical Android/iPhone hardware or Safari. No full gameplay/release suite is claimed for this CSS-only follow-up. No production data or Railway service was accessed, and nothing was merged or deployed. **Paused for owner approval of the mobile Land design before any propagation or further Phase 4.8 stage.**
