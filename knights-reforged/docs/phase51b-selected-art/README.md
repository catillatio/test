# Phase 5.1B — selected Land artwork: first visual checkpoint

**Owner-selected images integrated for framing review; not deployed.** Branch `feature/kingdom-come-phase-5-1b-selected-land-art`, based on `release/production` at `2e05e1c`. This checkpoint precedes visual approval, the final draft PR and the full CI run.

## Review the actual size and mobile captures

- **[390×844 Land — five later properties](screenshots/390-land-selected.png)**
- **[390×844 Land — Tempest Port / Storm Gate](screenshots/390-land-storm-gate.png)** — same marketplace, different scroll position.
- [390×844 owned Profile holdings](screenshots/390-profile-holdings.png)

Each sheet below shows the supplied portrait beside **native-size before/after samples** at **68×49, 80×58, 90×60 and 198×116**, plus the actual **60×60 Profile** and **64×72 receipt** dimensions measured in the local application. View at 100% zoom for the intended size; these sheets are labeled review galleries, while the Land/Profile captures above are actual game pages.

| Exact selected property | Native-size comparison |
|---|---|
| Dawnspire Cathedral `dawnspire-cathedral` | [Before / selected](screenshots/thumbnails-dawnspire-cathedral.png) |
| Wyrmcrest Keep `wyrmcrest-keep` | [Before / selected](screenshots/thumbnails-wyrmcrest-keep.png) |
| Astral Observatory `astral-observatory` | [Before / selected](screenshots/thumbnails-astral-observatory.png) |
| Throne of Ash `throne-of-ash` | [Before / selected](screenshots/thumbnails-throne-of-ash.png) |
| Eclipse Citadel `eclipse-citadel` | [Before / selected](screenshots/thumbnails-eclipse-citadel.png) |
| Tempest Port — Concept A, The Storm Gate `tempest-port` | [Before / selected](screenshots/thumbnails-tempest-port.png) |

**Framing tradeoff for approval:** the images remain portraits. Full-portrait `contain` preserves the Cathedral's spires, Observatory rings, Eclipse crescent and Storm Gate without stretching structures or inventing scenery. Wide frames therefore have dark side space, and the painted area is narrower than before—approximately 40px wide within the 80×58 mobile frame, and 82px within 198×116. Fine masonry detail is less readable at the smallest sizes. No aggressive wide crop was substituted to hide this limitation. Review this framing before further testing/adoption.

## Integration and preservation

Only the six selected IDs receive `properties-51b` overrides in the existing shared `catalog-art.ejs` partial. Land delegates to that partial, as do owned/public Profiles and purchase receipts. Existing square/wide frame sizes and compact controls are unchanged. The new CSS preserves source colors without additional filters and does not restyle other illustrations. The existing stylesheet cache suffix is updated.

**Crown Harbour remains exactly on its old atlas/slot. All weapons, armor and spells are unchanged.** The earlier subdued concepts are rejected and are not present in this integration branch. Every other property, including Oathbound Citadel and Gold Mine, retains its previous mapping/artwork. Old atlases and the earlier Wyrmcrest asset remain intact as historical source assets; the new shared override selects the snowbound Keep.

Catalog IDs/names, levels, prices, income, upkeep, saved financial rates, quantities, receipts and transactions are untouched. No migration, seed, bot logic, game-rule, release-infrastructure or production change was made. Displayed screenshot prices reflect the synthetic character's actual holdings and authoritative successive prices.

## Source and checks

The supplied [integration brief](OWNER_INTEGRATION_BRIEF.md) and [source manifest](SOURCE_MANIFEST.txt) are preserved as owner-provided requirements/provenance. The six [source PNG crops](source-crops/) are byte-identical to the package. The full source comparison sheets are retained only in the local input package, not distributed as runtime art. Independent high-resolution masters were not supplied.

[Versioned runtime provenance](../../public/art/properties-51b/provenance.json) records source-package/source/output SHA-256 hashes, dimensions and each crop. Processing removes only a **2px comparison-frame edge on each side**, then losslessly encodes WebP. Decoded output pixels were verified identical to those trimmed source pixels. No generation, repainting, rescaling, recoloring or scene extension. Six runtime images total **1,430,532 bytes**; this checkpoint favors exact source fidelity over lossy compression. No reference-sheet UI or labels are served as artwork.

Focused verification:

- **3 asset/mapping regression tests passed:** exact source/output hashes, all 81 catalog bindings plus legacy/small variants, safe labels, and existing atlas hashes. Only the six approved mappings change.
- **TypeScript check passed.**
- [Local browser evidence](visual-checks.json): real 390px Land, owned/public Profile and all six private receipt routes; expected selected URLs, accessible labels, `contain` framing, no added filters, no horizontal overflow, five tabs and existing ≥44px marketplace controls. Six native-size before/after sheets generated; no browser script errors.
- Catalog, gameplay, transaction, migration and release files remain unchanged. All database activity was confined to a disposable local synthetic fixture.

**Pending:** owner approval of the thumbnail framing, then final draft PR and one full exact-head CI checkpoint. No full regression/preservation suite or physical-device claim is made at this stage. No PR has been opened, and nothing has been merged or deployed.

To reproduce with existing development dependencies and a designated local `*_test` database: `node --test tests/phase51b-art.test.mjs`, `npm run typecheck`, then `TEST_DATABASE_URL=<local disposable fixture> npx tsx scripts/browser-phase51b-art.ts`. This script has no live connection or production operator path.
