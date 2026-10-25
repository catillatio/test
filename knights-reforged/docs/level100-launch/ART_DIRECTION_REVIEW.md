# Equipment style checkpoint — owner review required

**Superseded by the [owner artwork freeze](ART_FREEZE.md), 2026-10-25.**
All prior pending ordinary designs are rejected and preserved only as reference.
Do not execute the redraw suggestions below. The owner will supply original art;
continue non-artwork engineering independently. Historical gallery labels remain
unchanged so the original evidence is preserved.

The existing approved equipment is the primary authority. The latest museum-like
charcoal studies are rejected. No further artwork has been generated for this
checkpoint, and none of those studies has replaced a runtime asset. The expansion
drafts remain inactive and unapproved. Classic artwork and game balance are unchanged.

## Comparison gallery

- [Approved in-game reference sheet](art/style-review/approved-current-authority.webp)
- [Approved / pending draft / rejected study comparison](art/style-review/approved-draft-rejected-comparison.webp)
- [Levels 80, 90 and 100: pending designs side by side](art/style-review/level80-100-pending-audit.webp)
- [Exact owner-selected Hudson PNGs](art/style-review/hudson-exact-selected.webp)
- [Hudson at actual equipment frame sizes](art/previews/hudson-actual-slots.webp)
- Actual existing Armory captures: [weapons](screenshots/390-approved-current-weapon.png),
  [armor](screenshots/390-approved-current-armor.png), [spells](screenshots/390-approved-current-spell.png).

The sheets show proportionally normalized source images and a 76px check, rather
than pretending source crops are browser screenshots. Atlas crops use the existing
documented irregular row bounds; the five approved per-item overrides take priority.
[Evidence](art/style-review/evidence.json) records the unchanged source hashes.
`python scripts/level100-style-gallery.py` recomposes the sheets without editing
runtime artwork. The charcoal surrounding the **gallery** is a labelled review
canvas, not an artificial border embedded in a game asset.

## What differs, and the targeted next direction

| Area | Visible problem in the drafts/studies | Direction to review before any redraw |
| --- | --- | --- |
| Background | The rejected stone-texture studies look like cut-out museum objects on a repeatable studio surface. Some earlier drafts substitute bright brown haze. | Use the approved art's painterly, uneven charcoal/umber atmosphere, soft smoke and selective reflected light. Keep scenery subordinate; no uniform studio vignette, flat-black gutters or added matte. |
| Levels 51–70 swords | Thin straight blades, small conventional guards and polished metal look ordinary at 76px. Merely changing their curvature or tint is insufficient. | Marcher: substantial forged blade, faceted fuller and distinctive reinforced guard. Royal Warblade: broad clipped falchion and asymmetric royal craftsmanship. Sovereign Zweihander: long flamberge/parrying-hook construction. Painted surfaces, strong proportions and authored details, without copying a classic item. |
| Levels 51–70 polearms | The glaive and halberd read as slender shafts with similar small heads. | Preserve the promising glaive idea, but give it a sweeping substantial head; the halberd needs an unmistakable axe/hook/spike silhouette. Contrast the March-Warden poleaxe's compact multi-face head. Do not replace these with more sword shapes. |
| Levels 80–100 swords | Imperial, Ash and Eclipse drafts reuse a straight gold longsword and circular sun medallion; extra fire and brighter coronas do most of the differentiation. | Imperial Greatblade: architectural leaf-shaped blade and regal forged geometry. Ash-Crowned: heavy asymmetric volcanic/dark-steel construction and crown-shaped guard. Imperial Eclipse: distinct lunar blade geometry and meteoric material. Each must remain recognizable in silhouette with effects removed. |
| Heavy weapons | High Castellan's Hammer has a stronger individual head, but the later hammers converge on the same gold ornament. | Retain the strongest Castellan concept. Make Throneguard a narrow beaked polehammer, and Eclipse Gatehammer a monumental asymmetric lunar head; distinguish head mass, shaft proportions and materials. |
| Armor | Similar cropped cuirasses, repeated layered pauldrons, gold edges and central glowing disks make offense/tank tiers hard to distinguish. | Retain the strongest individual components. Brigandine should visibly use riveted layered panels; Siegeguard should have a broad shield-like front. Upper offensive sets should be lean/angular, defensive bastions broad/architectural. Ash uses forged obsidian and crown ribs; Astral fabric/metal contrasts; Eclipse crescent articulation. Avoid the same headless torso and matching shoulders in every frame. |
| Spells | Several motifs are promising, but literal fireballs/shields and gold sun disks can overwhelm distinctions. | Keep the spell illustrations painterly and symbolic. Differentiate banner, oath, siege, Ash and Astral compositions through the central shape and construction. No new generic notification/chime imagery or particles as a substitute for design. Review existing spell sheet before selecting individual redraws. |
| Hudson | The exact selected paintings already have a unique rainbow/cosmic identity. | Preserve the exact three randomized-name PNGs. No repaint, color filter or substitute. Their rainbow identity must not be copied throughout the ordinary catalog. |

This is a **selective correction proposal**, not authorization to regenerate all
36 shop items. First retain strong individual drafts, then replace only the weak
or repeated designs after owner review. Land art is frozen during this equipment
checkpoint. All pre-existing approved artwork remains unchanged.

## Readability and approval boundary

Use existing compact frames, full bleed, proportional cover crops, and real
36/60/64×72/76/128×112 checks. No stretching, letterboxing, blurred/mirrored
sidebars or empty black padding. Natural dark painted scenery is appropriate.
Automated edge checks catch solid black strips, but cannot certify aesthetic
quality or whether important architecture/silhouettes were cropped: that remains
an owner visual review.

All 45 manifest entries remain blocked by `expansionAssetReadiness()`; exact
Hudson source selection does not falsely mark the entire expansion approved.
Future approval must bind final bytes, rights, framing and a versioned manifest.
No production activation is requested by this checkpoint.
