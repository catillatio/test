# Kingdom Come — Phase 5.1B Selected Asset Integration

**Owner decision (2026-10-23):** The previous `df0b4dc` muted/reduced-spell and replacement-equipment proposal is rejected. Use the six selected OWNER-PROVIDED original fantasy illustration crops supplied in this package. This is an asset-integration brief, not approval to merge or deploy.

## Exact new property selections

| ID | Supplied crop | Decision |
|---|---|---|
| `dawnspire-cathedral` | `selected/dawnspire-cathedral.png` | Replace the existing property illustration with this new cathedral concept. |
| `wyrmcrest-keep` | `selected/wyrmcrest-keep.png` | Replace the earlier approved Wyrmcrest illustration with this snowbound fortified-keep concept. |
| `astral-observatory` | `selected/astral-observatory.png` | Replace with the distinctive celestial ring/orb observatory. |
| `throne-of-ash` | `selected/throne-of-ash.png` | Replace with the volcanic black citadel and magma architecture. |
| `eclipse-citadel` | `selected/eclipse-citadel.png` | Replace with the giant lunar/crescent-ring citadel. |
| `tempest-port` | `selected/tempest-port.png` | Replace with **CONCEPT A: The Storm Gate**, fortified sea arch and towers. This is an approved *provisional* image, revisit possible later. |

## Hard DO-NOT-CHANGE list

- `crown-harbour` art remains EXACTLY as it is. The alternative Crown Harbour concepts in the comparison sheet are REJECTED.
- **ALL spells remain EXACTLY as they are.** No Ember Word, Hearth Ward, Lantern Mote, Thorn Hex or any spell changes; proposed muted alternatives are REJECTED.
- The three weapon illustrations and two armor illustrations labeled **CURRENT** in the reference screenshot are the versions the owner wants to keep. These already correspond to current repo art; verify the IDs and leave existing artwork unchanged for `oathbound-greatsword`, `crown-of-ash-blade`, `eclipse-greatsword`, `sovereigns-bastion`, and `eclipse-citadel-plate`. Do not accidentally import the earlier subdued proposals.
- `oathbound-citadel` and all other properties not in the six-item selection remain unchanged in this slice.
- No catalog, purchase/economy, IDs, names, unlocks, stats, prices, database, gameplay, bot logic, release infrastructure or production changes.

## Asset provenance and quality

`selected/*.png` are *unaltered crops* extracted from the owner-provided image comparison sheets in this chat. They are approximately 340–351px wide and 478–490px tall, enough pixel count for tiny thumbnails but **not independent high-resolution source masters**. The sheets are also included as original files under `source_sheets/`; keep them as development references, not in distributed production art.

No generation or repainting is requested. Do not reproduce embedded labels, decorative frames, matte silhouettes, or the comparison sheet UI in deployed thumbnails. If high-resolution original crops/source masters are already accessible, use the matching original exact selection after checking visual identity; otherwise use these extracted crops.

**Critical crop check:** originals are portrait. Land listings use wide frames (around 80×58, 90×60 and 198×116). A naive `background-size: cover; center` risks cutting off the defining spires, the Observatory's celestial rings, or Tempest Port's gate. Use item-specific crop/position within the existing art architecture; if needed, retain more of the portrait composition with subtle project-consistent dark side framing rather than distorting structures. Do not invent new scene content or globally restyle the art. Render owner-review screenshots at actual 68×49, 80×58, 90×60, 198×116 plus corresponding profile and mobile screens. If a crop cannot faithfully preserve the chosen illustration, flag it for owner approval before any art adoption rather than quietly replacing it with a different generated image.

## Implementation requirements

- Work on a feature branch based on current `release/production`; do not modify that base branch directly. Keep Phase 5.1A production release work unmodified and PR #25 / Android PR #20 separate.
- Integrate exact six per-ID assets through reusable property art mapping/partials so they appear consistently in Land, owned/public Profile holdings, item-related receipt views, and any other site that shows these same property IDs. Check existing `views/partials/catalog-art.ejs`, `views/partials/land-review-art.ejs`, `public/phase49.css`, `public/land-review.css`, `public/strategy.css`; preserve old atlases and fallback IDs. Respect existing CSS cascade and market crop.
- Use a versioned asset directory, prefer optimized WebP derived only from these crops, keep image weight reasonable and record source SHA-256/crop provenance. Do not include full reference sheets in runtime assets. Do not rewrite immutable catalog rules.
- First produce a *small review checkpoint* with six actual-size before/after thumbnail screenshots and ONE sample Land page (390px). Ask for visual approval if necessary. This is cheaper than a full CI cycle for unacceptable crops.
- Once visual cropping is approved, perform focused asset/binding/rendering/accessibility tests; one standard full CI at the final PR checkpoint, not repeated full-suites. Draft PR only; do NOT merge/deploy, touch Railway or execute protected GitHub workflows.

## Context

The owner's core complaint is *same base castle model* across several high-level properties, not that fantasy art is too colorful. These chosen concepts solve it with different architecture and silhouettes (radiant cathedral, alpine fortress, celestial instruments, volcanic spire, lunar monument). Keep the distinctive dramatic fantasy appeal. Explicitly do NOT pursue the previously proposed simplification of magic or the muted replacement weapons/armor.
