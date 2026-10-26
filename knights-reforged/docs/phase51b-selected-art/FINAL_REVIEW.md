# Phase 5.1B — final artwork integration

Prepared on `feature/kingdom-come-phase-5-1b-selected-land-art` for a **draft** PR into `release/production`. This is an artwork-only release candidate, not deployment authorization. The exact candidate commit and complete CI run are recorded on the PR so reporting does not require another code commit after verification.

## Approved content

- **Six Land scenes remain frozen at owner-approved `c764e1913501148cc58a2fe582742efab9eeed97`:** Dawnspire Cathedral, Wyrmcrest Keep, Astral Observatory, Throne of Ash, Eclipse Citadel and Tempest Port / Storm Gate A. Asset bytes, shared mappings, focal positions and approved framing rules are pinned in [APPROVED_LAND.json](APPROVED_LAND.json) and tested. No regeneration, repainting or reframing during finalization.
- **Five owner-selected CURRENT equipment references:** Oathbound Greatsword, Crown of Ash Blade, Eclipse Greatsword, Sovereign's Bastion and Eclipse Citadel Plate. The exact PNGs come from `df0b4dc9bfd1dbed533487d5aabe0b5357d8fdec`; only captured review-frame edges were removed. Lossless 208×208 WebP overrides preserve the selected cropped RGB pixels exactly.
- **Crown Harbour, all spells, every unselected property and all other weapons/armor retain their original assets and bindings.** Existing atlases are unchanged. The prior PROPOSED equipment and spell redesigns are excluded.

**Important comparison finding:** all five CURRENT equipment references depict the same underlying paintings already used by the game. They are not five new equipment designs. Square reference capture, its baked contrast/desaturation, native atlas aspect ratios and frame presentation explain the differences. All 20 captured native before/after pairs differ at the pixel level; decoded runtime pixels match the selected source crops exactly. The explicit overrides normalize their presentation and remove captured framing without inventing new artwork.

## Review images and provenance

- [Native-size CURRENT / before / after equipment comparison](../phase51b-selected-equipment/screenshots/current-reference-comparison.png): Armory, Profile, saved battle and saved receipt for all five selections.
- [Equipment screenshots at 320, 390, 430 and 1024px](../phase51b-selected-equipment/README.md#actual-rendered-pages), including real saved-record views.
- [Approved Land 390px](screenshots/390-land-selected.png) and [Storm Gate 390px](screenshots/390-land-storm-gate.png); [all Land widths and six native-size samples per scene](README.md#review-the-result).
- [All eleven runtime asset hashes, dimensions and byte sizes](ASSET_HASHES.csv).
- [Land provenance](../../public/art/properties-51b-fullbleed-2/provenance.json), [equipment provenance](../../public/art/equipment-51b-current-1/provenance.json), [exact CURRENT source tiles](../phase51b-selected-equipment/source-tiles/) and [native pixel comparison](../phase51b-selected-equipment/pixel-comparison.json).

All artwork derives from existing original project-generated illustrations and the owner's approved source-bound Land edits. No historical commercial-game screenshot artwork, stock asset or new third-party license dependency is introduced. Processing and source hashes are documented. Equipment reference captures are 211px source material, not higher-resolution painting masters; no missing source details have been invented.

## Shared integration and preservation

Only the shared `catalog-art.ejs` selection, scoped artwork CSS and stylesheet cache version change runtime presentation. Land, Armory, owned/public Profiles, purchase receipts, quest equipment requirements and saved battle loadouts use the same stable-ID mapping. Existing native dimensions and proportional full-bleed fill remain; no matte, padding, stretching, blurred sides or duplicate color filter. Historical loadout participation still comes from saved battle records, with the existing compatibility behavior when a historical record has no loadout.

No changes to catalogs, IDs, item/property names, unlock levels, prices, income, upkeep, character rules, transaction endpoints, receipt formats, combat calculations or migrations. No database reset, initialization, bot regeneration or data correction is added. Authentication, sessions, release controller, recovery/signing/restore gates, Dockerfiles and production workflows are unchanged. Container verification is extended only to check that all eleven selected static assets are served with exact hashes and review sources stay outside the runtime image.

## Verification

Focused checks completed before opening the draft:

- Six asset/mapping/provenance tests: source/runtime hashes, selected-only mapping across all 81 current entries plus historical/small variants, unchanged atlases, permanent full-bleed rule and exact `c764e19` Land freeze.
- Approved Land browser coverage: four widths, **96 real-route bindings**, **36 native-size samples** and 18 review captures.
- Equipment browser coverage: four widths, **124 real-route bindings**, including owned/public Profiles, all five saved receipts, saved battle participation, and applicable quest/purchase requirements. No page errors or horizontal overflow; five-tab navigation preserved. Read-only browsing leaves saved battle results, wallet rows and receipt snapshots unchanged.
- Twenty native before/after comparisons, with local synthetic accounts and baseline captures from a detached `c764e19` checkout. Source-crop / runtime decoded RGB equality verified for all five equipment assets.
- TypeScript and project static validation. Focused browser suites are included in the normal automated test command; CI writes evidence to ignored test-results instead of changing approved screenshots.

**Final complete exact-head CI:** use the linked “Kingdom Come checks” run on the draft PR. Required stages are the entire PostgreSQL-backed automated suite (including populated migration/account/450-bot preservation and release-safety regressions), typecheck, production build, static validation, shipping-browser audio compatibility, dependency audits, browser regression, game container preservation/restart checks and encrypted release-worker backup/restore verification. Focused results above do not substitute for that complete run; the PR records its actual outcome and any failures.

## Remaining limits and owner checkpoint

Automated Chromium captures are not physical iPhone Safari/Android signoff. Equipment source detail can soften at high display density; legitimate dark painted scenery remains, without artificial image framing. No asset mismatch was found that requires another design checkpoint. No full artwork redesign, gameplay change, production inspection or operational setup is included.

Stop at final draft-PR review. Do not merge, deploy, dispatch a protected release, modify Railway or production data, or change release safeguards.
