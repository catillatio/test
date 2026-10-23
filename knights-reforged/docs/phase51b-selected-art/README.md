# Phase 5.1B — corrected full-bleed artwork checkpoint

**Framing checkpoint 2; awaiting owner review.** Work continues from `985171b` on `feature/kingdom-come-phase-5-1b-selected-land-art`. The first portrait-contain/matte treatment is **rejected**, not approved or available as a runtime fallback. No full CI, final PR, merge, deployment or production operation has occurred.

## Review the result

**[390px Land — five later properties](screenshots/390-land-selected.png)** · **[390px Storm Gate](screenshots/390-land-storm-gate.png)** · [390px Profile](screenshots/390-profile-holdings.png)

Every sheet shows the owner's selected portrait identity at left and **corrected full-bleed samples at native CSS pixel sizes**: 68×49, 80×58, 90×60, 198×116, 60×60 and 64×72. View at 100% zoom. These are comparison galleries; the Land and Profile screenshots are actual local game pages. No rejected letterboxed treatment is shown as the current result.

| Selected identity | Corrected native-size sheet | Full landscape scene |
|---|---|---|
| Dawnspire Cathedral `dawnspire-cathedral` | [Six sizes](screenshots/thumbnails-dawnspire-cathedral.png) | [Landscape](landscape-masters/dawnspire-cathedral.webp) |
| Wyrmcrest Keep `wyrmcrest-keep` | [Six sizes](screenshots/thumbnails-wyrmcrest-keep.png) | [Landscape](landscape-masters/wyrmcrest-keep.webp) |
| Astral Observatory `astral-observatory` | [Six sizes](screenshots/thumbnails-astral-observatory.png) | [Landscape](landscape-masters/astral-observatory.webp) |
| Throne of Ash `throne-of-ash` | [Six sizes](screenshots/thumbnails-throne-of-ash.png) | [Landscape](landscape-masters/throne-of-ash.webp) |
| Eclipse Citadel `eclipse-citadel` | [Six sizes](screenshots/thumbnails-eclipse-citadel.png) | [Landscape](landscape-masters/eclipse-citadel.webp) |
| Tempest Port — Concept A, The Storm Gate `tempest-port` | [Six sizes](screenshots/thumbnails-tempest-port.png) | [Landscape](landscape-masters/tempest-port.webp) |

| Viewport | Land / later properties | Storm Gate scroll position | Owned Profile |
|---|---|---|---|
| 320×844 | [Land](screenshots/320-land-selected.png) | [Gate](screenshots/320-land-storm-gate.png) | [Profile](screenshots/320-profile-holdings.png) |
| 390×844 | [Land](screenshots/390-land-selected.png) | [Gate](screenshots/390-land-storm-gate.png) | [Profile](screenshots/390-profile-holdings.png) |
| 430×844 | [Land](screenshots/430-land-selected.png) | [Gate](screenshots/430-land-storm-gate.png) | [Profile](screenshots/430-profile-holdings.png) |
| 1024×1536 | [Land](screenshots/1024-land-selected.png) | [Gate](screenshots/1024-land-storm-gate.png) | [Profile](screenshots/1024-profile-holdings.png) |

The individual `screenshots/native-<property-id>-<width>x<height>.png` files are exactly the six required viewport dimensions, without gallery scaling.

## What changed

Each selected scene was extended/recomposed into a **1536×1024 landscape**, using the exact selected portrait as the edit reference. Added space contains actual painted scenery: cliffs, mountains, snow, waterfalls, volcanic terrain or storm coast. No black padding, empty matte, blurred sides, mirrored edges or pasted portrait panels.

The defining identities remain: radiant rose-window Cathedral and clustered spires; snowbound fortified Keep and red banners; monumental armillary rings/orb; volcanic magma-window citadel; paired lunar crescents and eclipse moon; and the fortified sea gate, blue banners, beacons and ship. These are generated scene edits, **not pixel-identical copies or guaranteed preservation of every masonry detail**. Context and some architectural details differ; source-versus-corrected comparisons are supplied for owner acceptance.

Runtime art uses a new immutable URL namespace, **`properties-51b-fullbleed-2`**, encoded at 768×512 WebP quality 92. The six images total **1,083,504 bytes**, versus 1,430,532 in the rejected portrait pack. The rejected runtime files are removed; source crops and the rejected commit remain in history for traceability.

Proportional `cover` rendering fills the artwork viewport. Top alignment protects high spires; reviewed landmark regions remain visible across every required shape. The selected image spans and their Land frames have no borders, rounding, shadows or background mattes. Existing frame dimensions and row layout are preserved. Full bleed comes from proper scene content and safe composition, not stretching or merely forcing portrait crops to cover.

The later [owner framing correction](OWNER_FRAMING_CORRECTION.md) supersedes conflicting instructions in the historical [attached brief](OWNER_INTEGRATION_BRIEF.md). The permanent rule is recorded in [ARTWORK_REQUIREMENTS.md](../ARTWORK_REQUIREMENTS.md); this correction does not authorize unrelated art redesigns.

## Preservation and focused verification

- Same shared per-property rendering partial for Land, owned/public Profiles and saved receipts; same six property IDs. No catalog, names, levels, prices, income, upkeep, holdings, financial records or transaction code changes.
- **Crown Harbour, all equipment/spells and every unselected property are unchanged.** Existing atlas files still match their provenance hashes. The earlier subdued equipment/spell proposals remain rejected.
- **Four focused asset/mapping tests passed:** source/output provenance, geometric landmark-safe crops at all six sizes, all 81 catalog bindings plus legacy/small variants, unchanged atlas hashes and the no-matte policy.
- **TypeScript check passed.**
- [Browser evidence](visual-checks.json): four viewport groups, **96 real-route artwork bindings**, **36 exact-size samples** and 18 review captures. Checks include decoded image dimensions, proportional viewport coverage, transparent CSS background, zero image/frame borders and shadows, opaque nonuniform source edges, expected URLs, accessible labels, no overflow, five tabs and ≥44px marketplace controls.
- All six native-size sheets and the four rendered Land widths were visually inspected. Cathedral tips/window, full ring/orb silhouette, both crescent tips, magma-window apex and sea-gate beacons/arch remain visible. Tiny masonry detail naturally reduces at 68×49; no claim is made that every detail survives at that scale.

Landmark rectangles are manually identified from the generated masters; geometry checks confirm their retention but cannot automatically certify semantic identity, painted quality, or the absence of every possible content artifact. Source-edge tests reject uniform embedded strips; visual inspection checks the actual scenery. **Owner visual approval is still required.** No physical-device or full regression-suite claim is made at this checkpoint.

[Runtime provenance](../../public/art/properties-51b-fullbleed-2/provenance.json) records original owner-source hashes, edit/output hashes, master references, encoded sizes and landmark bounds. [Edit prompts](full-bleed-generation.json) document the six source-bound scene extensions. Original generated PNGs remain in the workspace; full-size WebP review masters are linked above. No commercial historical-game assets or third-party stock were used. The source package's [manifest](SOURCE_MANIFEST.txt) and [original crops](source-crops/) remain unchanged.

All game/database activity used disposable local synthetic fixtures. Protected release files and production resources remain untouched. Reproduce the focused checks from `knights-reforged/` with `node --test tests/phase51b-art.test.mjs`, `npm run typecheck`, then `TEST_DATABASE_URL=<local disposable *_test fixture> npx tsx scripts/browser-phase51b-art.ts`.

**Pause here for corrected-visual approval before final PR preparation and full CI.**
