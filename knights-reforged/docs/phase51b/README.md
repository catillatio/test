# Phase 5.1B — artwork comparison for owner review

**Design proposal only.** Based on the latest `release/production` at inspection, [`2e05e1c`](https://github.com/catillatio/test/commit/2e05e1c15b50018607e906db0e2ad33866e95aac), including merged Phase 5.1A. No game code, CSS, catalog, production asset, financial value, database, release workflow or infrastructure is changed. No implementation PR or full CI run is needed for this checkpoint.

## Visual comparison

The four current contact sheets cover **all 60 equipment items and all 21 properties**, labeled with actual names, stable IDs and unlock levels. Each has an enlarged view and a **76px** check. These are review galleries rendered from the existing EJS art partials and CSS, **not live-account screenshots**. The Land frame is proportionally normalized to 76×54; real mobile Armory tiles are smaller, typically 62×60 or 68×61. Final asset acceptance must include those sizes too.

| Current artwork | Current versus proposed |
|---|---|
| [20 weapons](artwork-review/current-weapon.png) | [Three greatswords and two armor sets](artwork-review/compare-equipment.png) |
| [20 armor items](artwork-review/current-armor.png) | [Equipment comparison](artwork-review/compare-equipment.png) |
| [20 spells](artwork-review/current-spell.png) | [Four beginner spells](artwork-review/compare-spells.png) |
| [21 Land properties](artwork-review/current-property.png) | [Tempest Port, variants A/B and Crown Harbour comparator](artwork-review/compare-port.png) |

Existing browser evidence was reused to check context: [Phase 5.1A Armory](../phase51a/screenshots/after/390-armory-purchase.png) and [approved property integration in Land](../phase49/art-integration/screenshots/390-keep.png). No production accounts or databases were used.

## Findings and ten proposed replacements

The three greatswords have different guards, but at thumbnail size they share a diagonal blade with a hot luminous edge. Crown of Ash and Eclipse particularly converge on black/red/gold; Oathbound's construction is obscured by light. Existing bows, axes, polearms and the Astral Conductor are easier to recognize by outline: retain those identities rather than making every high-level weapon a bright sword.

Late armor is already more varied: Dawnforge's gold/red plate, Astral Archon's fabric silhouette and Seraphic Vestment's pearl wings remain useful progression anchors. The two proposed armor changes address specific noisy silhouettes and the oversized glowing chest aperture; a whole-category repaint is unnecessary.

Beginner spells consume most of their canvas with magic: Ember Word resembles a fire torrent, Hearth Ward a house-sized dome, Lantern Mote a swirling orb, and Thorn Hex a multi-loop cage. Simplifying those four creates room for the existing L12–50 ritual, spectral, dragon and celestial imagery to feel advanced. Muted colors must not make the actual spell unreadable.

| Priority | Item · unlock | Current issue | Proposed silhouette, palette and effects |
|---|---|---|---|
| 1 | **Oathbound Greatsword · L24** `oathbound-greatsword` | Flame-bright edge dominates the broad blade. | Parallel-edged steel and a broad fuller; straight engraved brass guard, long leather grip and one crimson oath ribbon. Warm steel, not a burning blade. |
| 1 | **Crown of Ash Blade · L45** `crown-of-ash-blade` | Jagged black blade and red light overlap the later sword. | Heavy clipped point, limited upper-spine teeth and broken-crown guard; ash-gray metal, dark copper and small dull-red enamel recesses. No fire cloud. |
| 1 | **Eclipse Greatsword · L50** `eclipse-greatsword` | Orange edge and luminous disk substitute for craftsmanship. | Long tapered black/silver blade, crescent quillons and polished physical bevel; cool ivory highlights, small non-luminous eclipse inlay. No orange corona along the blade. |
| 1 | **Tempest Port · L21** `tempest-port` | Another dominant blue-sailed ship reads too similarly to Crown Harbour. | **Recommend A:** paired stormgate towers and a broad C-shaped stone breakwater; small ships communicate scale. Slate sea, weathered masonry, restrained amber beacons. B uses terraced drydocks and cranes but is busier at 76px. |
| 2 | **Ember Word · L1** `ember-word` | Dense sparks and a large flame read as advanced fire magic. | One small breath-borne ember and at most two sparks; charcoal/copper, little occupied space. Keep a readable flame core. |
| 2 | **Hearth Ward · L1** `hearth-ward` | Whole-house luminous dome has high-tier spectacle. | Oak doorway, simple lintel and narrow amber threshold ward; quiet stone/brown palette, no spherical field. |
| 2 | **Lantern Mote · L2** `lantern-mote` | Orb, trails and sparks suggest an astral spell. | One ivory light beside a twig, a short soft trail and dark negative space; muted moss/brown support, no orbiting rings. |
| 2 | **Thorn Hex · L3** `thorn-hex` | Numerous interlocking thorn loops become texture. | One hooked briar knot with three large readable thorns; bark, muted moss and burgundy berry. No portal or particle swarm. |
| 3 | **Sovereign's Bastion · L44** `sovereigns-bastion` | Many tiny spires merge into a busy black outline. | Stepped squared pauldrons, severe flat-crowned helm and visibly layered/riveted plate; blackened steel, bronze engraving and oxblood mantle. Prestige through fabrication. |
| 3 | **Eclipse Citadel Plate · L50** `eclipse-citadel-plate` | Spiky shoulders and bright chest void obscure armor construction. | Large crescent shoulders, fluted gorget and articulated silver/obsidian plates; small metal eclipse medallion. Cool restrained edge light, no luminous hole. |

All ten need **new or purpose-repainted illustrations**. Color grading or CSS filters cannot create the required silhouettes. The generated studies demonstrate directions, not approved finished replacements. [Equipment concept board](artwork-review/concepts/equipment.webp) contains an additional Dawnforge continuity study; **Dawnforge is not an eleventh proposed replacement**.

## Land identity and economic hierarchy

There are **only two harbor properties** in the current `alpha-0.3` catalog. No later harbor exists to rename or invent.

| Actual property | Unlock | Base price | Gross / property upkeep per hour | Decision |
|---|---:|---:|---:|---|
| Crown Harbour `crown-harbour` | 7 | 900 | 120 / 0 | Keep the calm small inlet, modest lighthouse and merchant ship. |
| Tempest Port `tempest-port` | 21 | 11,000 | 700 / 100 | Show substantial storm protection, warehouses and port infrastructure. |

Tempest costs **12.2×** as much at zero holdings and yields **5.8×** the gross income, yet both current illustrations foreground one blue-sailed vessel. Architecture and occupied scale should carry that distinction. These are unchanged **catalog base** figures, not live quotes or saved player values.

Later nearby illustrations are **Runekeeper Academy** (`runekeeper-academy`, L24), **Oathbound Citadel** (`oathbound-citadel`, L28), and **Dawnspire Cathedral** (`dawnspire-cathedral`, L32). They are not harbor properties. Academy and Citadel share pale towers/cliffside framing, but their blue central crystal versus red gate banners remain distinct enough to retain for this small first batch. Do not turn either into another waterfront city. Preserve the approved grounded Wyrmcrest Keep and Gold Mine art. Gold Mine's stable ID remains `moonwell-sanctuary`; its old catalog label is intentionally historical.

## Mappings and provenance

- Active catalog: [`alpha-0.3`](../../rulesets/alpha-0.3/rules.json), loaded by `src/alpha-rules.ts`. Item IDs, atlas columns/rows and unlock levels come from that catalog.
- `views/partials/catalog-art.ejs` selects equipment atlas cells. `refinements.css` maps **observed nonuniform row bounds**, not uniform fifths. Every equipment sheet has 4 columns × 5 rows. No target was found bound to the wrong category or ID.
- Properties differ: `strategy.css` overrides the old fantasy atlas with **`land-simple-0.1/properties.webp`**. Land's first six properties use `land-review/painted-properties.webp` through `land-review-art.ejs`. `properties-49` overrides Wyrmcrest Keep and the stable Gold Mine ID. Auditing only `fantasy-0.2/properties.webp` would review retired views for most Land rows.
- Land also uses a wide center crop and existing darkening/desaturation; Armory applies restrained filtering. The contact sheets preserve these per-art treatments at normalized comparison sizes. No additional glow or CSS treatment is proposed.
- [Provenance and hash evidence](artwork-review/provenance.json) verifies **10 existing WebP files** against their checked-in manifests. Existing equipment is documented original project-generated art; simplified Land derives from that original work, with original later approved overrides. No APK-derived or historical commercial-game art is used in this review.
- The **12 new concept cells** are original `image_gen.imagegen` output: five equipment proposals plus a Dawnforge comparator, four spell proposals and two alternatives for the same Tempest Port. [Exact prompts](artwork-review/concepts/prompts.json), master/output SHA-256 hashes and observed crop bounds are recorded. WebP encoding only; the comparison renderer clips/scales cells without repainting. Original PNG masters remain in the workspace. No exclusive copyright claim is made; applicable OpenAI terms govern generated output. Old workspace-only source-master authenticity has not been independently re-established.

## Small implementation plan, after owner selection

1. Approve/reject the ten directions and choose Tempest A or B. No new UI system is needed.
2. Finish individual source illustrations with consistent painted texture, restrained effects and 10–14% safe margins. **Remaining concept issues:** sword tips still sit too near cell edges; Oathbound and Eclipse need a stronger width/guard contrast at the smaller actual Armory size; Crown's guard needs less fine detail. Hearth Ward needs a tighter threshold crop so it reads as magic rather than Land. Lantern Mote may need a slightly larger core without more particles. Thorn Hex should become less of a perfect ring. Port A is preferred, but its tower tips approach the wide crop edge; recompose for that frame. Both port studies still have finer masonry detail and a more photographic finish than the target painted thumbnails. These are not asset-adoption-ready.
3. Add an isolated, versioned original-art pack with explicit per-ID presentation overrides following the existing `properties-49` pattern. Keep immutable catalog files and old atlases intact; do not move IDs, slots or prices. Preserve receipt names and historical battle-equipment snapshots. Reuse one shared art partial rather than page-specific replacements, retaining current property-specific routing.
4. Compare final images at 76px, actual 62×60/68×61 Armory sizes, and existing Land wide crops. Check grayscale outline readability, no neighboring-cell bleed, no clipped weapon tips, dark-screen legibility and distinction between adjacent tiers. Reuse 320/390/430/1024px browser fixtures for Armory, Land, quest requirements, Profile, receipts and battle reports. Preserve current density, accessible labels and transaction behavior. Check image weight/load cost and asset hashes; then obtain owner asset approval before runtime adoption.

For this checkpoint, **81 current bindings** were checked, ten existing runtime hashes matched, contact sheets and three comparison boards were visually inspected, and only documentation/design files differ from base. No full CI, live service query, database access, release operation or production mutation was performed. Regenerate review sheets with the existing development dependencies: `node docs/phase51b/render-contact-sheets.mjs` then `node docs/phase51b/render-comparisons.mjs` from `knights-reforged/`.

**Awaiting owner direction on the concepts. No implementation or adoption is authorized by this report.**
