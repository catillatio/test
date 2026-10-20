# Phase 4.8 — Land-only visual correction

**Review update:** The owner approved this 1024 × 1536 visual direction. The [mobile-only follow-up](LAND_MOBILE_REVIEW.md) is pending a separate review; the approved desktop capture and comparison remain unchanged. Work remains on `feature/kingdom-come-phase-4-8-ui-remaster`. Home, Armory, and the remaining Phase 4.8 stages are frozen. Nothing was merged, deployed, or changed in Railway.

## Exact reference and comparison

The owner-uploaded reference is [ChatGPT Image Oct 20, 2026, 12_34_13 AM.png](<ChatGPT Image Oct 20, 2026, 12_34_13 AM.png>), added in commit `dc2e3ccdabac6be86566352c1bbd3b7b7480c0a6`. That upload did not use the requested `kingdom-come-definitive-land-mockup.png` filename; the matching image was located and visually inspected under its retained filename. The feature branch was synchronized to the upload without a merge or overwriting Land work.

Reference dimensions: **1024 × 1536**. SHA-256: `5eeab990681187eedd6eb89f13bd40c67a36d91052c2155778add17cdf5084e4`.

- [Same-resolution side-by-side comparison](land-only-review/comparison.png): reference left, actual Land render right. Both image inputs are unaltered 1024 × 1536 captures. The 52px labels sit outside the images. No scaling, painted-over values, retouching, or generated replacement screenshot is used.
- [Actual 1024 × 1536 render](land-only-review/screenshots/1024-land.png)
- [Actual 390 × 844 mobile render](land-only-review/screenshots/390-land.png)
- [Mobile compact Gold Flow state](land-only-review/screenshots/390-land-compact.png), [income details](land-only-review/screenshots/390-income-details.png), and [bulk controls](land-only-review/screenshots/390-land-bulk.png)
- [Previous implementation at the same dimensions](land-only-review/screenshots/before-1024-land.png)
- [Comparison source hashes](land-only-review/comparison-sources.json) and [measured render bounds](land-only-review/browser.json)

The zero-mismatch composition check verifies that each input image was embedded unchanged. It does **not** mean the actual Land design is identical to the reference.

These are actual game pages backed by a disposable synthetic PostgreSQL realm. The test character earned its level through the existing XP helper and bought the displayed properties/equipment through normal authoritative command handlers. Its balances, prices, upkeep, ownership, and income are deliberately not copied from the mockup.

## Specific differences found and corrected

The previous revision had roughly similar colors but different dimensions and information weights. The following measurements guided this correction. Reference bounds are read from the PNG's visible edges and glyphs; a raster mockup does not reveal its original CSS or exact font file. Browser values are DOM measurements, not estimates.

| Element at 1024 × 1536 | Previous render | Reference target | Land-only correction |
| --- | --- | --- | --- |
| Brand bar | 65px high | about 68px | 68px; original illustrated bronze helmet in the same footprint |
| Resource bands | ended at y=227 | end around y=230 | end at y=230; XP, gold, level, and recovery columns repositioned |
| Land title area | 83.5px high | about 101px | 101px, 44px serif title; background no longer crops off the castle roofs |
| Gold Flow outer panel | x=17, y=318.5, width=990 | x≈21, y≈331, width≈982 | x=21, y=331, width=982; layered inset/outset edge, 11px corners |
| Gold Flow heading | 25px | apparent size about 30px | 30px with larger coin emblem and corrected icon/text gap |
| Income labels and values | 15–17px | apparent size about 20px | 20px, separate column divider, aligned value edges |
| Payment column | 190px wide | about 238px | 238px with inset border, left-aligned label, 32px countdown |
| Payment date | forced to 9px by legacy CSS | apparent size about 17px | Land-only 17px override; other pages unchanged |
| First property row | y=544.9 | around y=570 | y=570; 126px rows and 8px gaps |
| Illustration frame | 190 × 112 | about 198 × 116 | 198 × 116 with a thin, recessed border and preserved image proportions |
| Property name | 23px | apparent size about 28px | 28px; Income/Upkeep enlarged to 22px |
| Buy button | x=802, 94 × 56 | x≈749, 115 × 68 | x=749, 115 × 68, warmer top bevel and darker lower edge |
| Sell button | compressed beside Buy | about 110 × 68 | 110 × 68, charcoal bevel, exact refund retained |
| Bottom navigation | 58px high, small flat vectors | about 98px high | 98px, 20px labels, original silver/metal icon artwork, restrained selected panel |

Panel surfaces and gradients were compared against actual PNG color samples, not color names alone. The black row interiors, gray-green metal edges, payment divider, bronze button highlights, and lower button shadows are now treated individually. The Gold Flow panel also retains its live connection/income status line.

The original castle landscape was too bright, too close, and vertically misaligned. A new original landscape uses the reference's distant horizontal castle placement and darker wooded foreground. The backdrop is confined to Land. The six illustrated property previews are framed as landscape crops, rather than squeezing square catalog tiles into the new rows.

At 390px, the full breakdown uses readable two-column figures and a separate payment strip. Buy/Sell stay one-tap controls with 44px+ targets. Collapsing Gold Flow exposes at least four complete property rows. The full breakdown remains available, with keyboard access. The 390px layout is an adaptation, not a scaled-down 1024px image.

## What still differs

1. **Artwork is original, not pixel-identical.** The castle, helmet, metal symbols, property structures, foliage, lighting, and framing have different details and silhouettes. The background remains somewhat warmer and its castle arrangement differs. These assets are provisional for this Land review, not approved for propagation or production.
2. **The real catalog differs.** Watchtower, River Mill, and Hearthstead Hamlet remain the actual fourth, fifth, and sixth entries. They are not renamed to the mockup's Stone Quarry, Iron Mine, or Royal Estate. All 21 properties remain accessible, so the next row is partially visible where the mockup has only six examples. Properties beyond the six new illustration previews retain their existing artwork.
3. **Useful controls remain.** Secondary Bulk links, exact Sell refund figures, live income/connection status, locked-property requirements, retained-income messages, and expanded economic rules have no exact counterparts in the mockup. They remain functional rather than being hidden to make the screenshot resemble a painting.
4. **Typography is an approximation.** The implementation uses the existing Georgia / Times-compatible serif stack. Measured glyph bounds are close for the visible names, but the mockup's original font and rasterization are unknown. Font rendering can differ across platforms; physical iPhone/Android acceptance remains outstanding.
5. **A few dimensions differ by pixels.** The panel is 224px high, and the regular row spacing produces small differences against the mockup's nonuniform raster edges. The selected bottom-tab widths use five equal columns. No claim of a pixel-identical reconstruction is made.
6. **Data and states are real.** Test balances, level, XP progress, recovery state, owned quantities, prices, hourly figures, countdown, and date differ. The implementation preserves the existing authoritative payment/reserve rules, including legitimate differences between projected purse change and economic net/hour.

## Assets and rights

See [Land-only asset provenance](../../public/art/land-review/provenance.json). The new castle and icon atlas are original generated project output using the owner's uploaded mockup as a visual reference. The first six property previews reuse the preceding original painted sheet, encoded for this Land-only working review. No original Storm8/APK artwork or third-party stock was copied into these assets. Original source files and SHA-256 hashes are recorded; applicable OpenAI terms apply, and exclusivity or copyright protection is not asserted.

The icon atlas supplies only decorative imagery. All navigation labels, links, selected state, and accessible names remain HTML. No mockup text, balances, prices, fictional property definitions, or UI screenshot pixels are baked into runtime panels. The reference PNG stays in documentation, not the public asset tree.

The three new Land-specific WebP files total 1,286,696 bytes before HTTP caching. Existing fallback art and application assets are additional. Local browser checks are not a mobile-network latency benchmark.

## Preservation and verification

- `land-review.css` is loaded only for the Land screen. All its selectors are scoped to `.kingdoms-ui.screen-land`. Home and Armory layout/style fingerprints match their saved baseline exactly. The shared `remaster.css`, Home and Armory templates, and existing shared runtime artwork are unchanged in this correction.
- The transaction refactor and marketplace JavaScript are unchanged. Real PostgreSQL/browser tests exercise one-tap duplicate suppression, exact refunds, receipt refresh, Return to Land, preserved bulk quantity, keyboard disclosures, locked properties, and readable empty states.
- Source gameplay, catalogs/rulesets, migrations, authentication/session code, release/recovery controller, workflows, and production configuration are unchanged. There are no new migrations or initialization commands. No real accounts, bots, databases, or broadcasts were accessed or changed.
- Fresh results: [verification-land-only.json](verification-land-only.json). These cover TypeScript, production build, 94 static checks / 73 EJS fixtures, 48 focused client/PostgreSQL/rendering/security tests, 18 Land/bulk responsive visits plus two empty-state widths, and the existing 56-view marketplace/recovery browser suite.
- Browser coverage includes 320, 360, 390, 412, 430, 768, 900, 1024, and 1366px. This is Chromium development verification, not physical-device or Safari certification. Prolonged idle/background events in the shared browser suite are simulated.

The earlier full-suite report remains historical evidence; it was not rerun or represented as fresh for this Land-only presentation change.

## Reproduce locally

Use only a disposable local `_test` database. Do not run these test commands against Railway or a realm containing player data.

```sh
cd knights-reforged
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55488/phase48_test'
npm run typecheck
npm run build
npm run check:static
npm exec -- tsx scripts/browser-phase48-land-review.ts
node scripts/compare-phase48-land.mjs
```

The `before/` fingerprint and screenshot evidence comes from `7e58f0f` (before the owner's upload-only `dc2e3cc` commit), using the script's `--baseline` mode before applying the Land correction. On a fresh checkout, the script automatically reads the recorded fingerprint from `docs/phase48/land-only-review/baseline/` if no local baseline exists. Baseline evidence must not be regenerated using the new Land stylesheet and presented as an earlier design.

**Stop here for owner review of Land.** Do not propagate these visuals, advance other Phase 4.8 stages, merge, or dispatch production workflows based on this review package.
