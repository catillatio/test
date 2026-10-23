# Phase 5.1B — five selected CURRENT equipment references

The owner selected these exact files from commit **`df0b4dc9bfd1dbed533487d5aabe0b5357d8fdec`**, under `knights-reforged/docs/phase51b/artwork-review/tiles/`. The previously proposed alternative designs and all spell redesigns remain rejected. No artwork was generated or repainted during this equipment integration.

**[Actual native-size before/after comparison](screenshots/current-reference-comparison.png)** · [Source tiles](source-tiles/) · [Provenance](../../public/art/equipment-51b-current-1/provenance.json) · [Pixel comparison](pixel-comparison.json) · [Final Phase 5.1B report](../phase51b-selected-art/FINAL_REVIEW.md)

| Exact item ID | Selected source |
|---|---|
| `oathbound-greatsword` | [CURRENT](source-tiles/oathbound-greatsword.png) |
| `crown-of-ash-blade` | [CURRENT](source-tiles/crown-of-ash-blade.png) |
| `eclipse-greatsword` | [CURRENT](source-tiles/eclipse-greatsword.png) |
| `sovereigns-bastion` | [CURRENT](source-tiles/sovereigns-bastion.png) |
| `eclipse-citadel-plate` | [CURRENT](source-tiles/eclipse-citadel-plate.png) |

## What the comparison established

**All five depict the same underlying paintings already in the active `fantasy-0.2` atlases. None is a new weapon or armor design.** This is not a five-illustration redesign.

The `df0b4dc` reference renderer documented a 210px square normalization, **`contrast(1.02) saturate(.85)`** and a review-frame border. Fractional browser coordinates produced 211×211 PNG captures. Current native game tiles instead have multiple shapes: Armory 62×60, 68×61 or 128×112; Profile/battle sizes vary with viewport; receipts 64×72; small quest requirements 25×25. The atlas renderer scales each cell into those boxes; some contexts apply no color filter while Armory applies the same contrast/desaturation. Frame borders, row sampling and proportional differences therefore explain the discrepancy despite CURRENT labels.

The captured before/after native tiles are **not pixel-for-pixel identical**. The paired evidence records the changed presentation, not different underlying source artwork. The actual runtime pixels **are pixel-identical to the selected source crops** after the outer review frame is removed. The original paintings, atlases and catalog cell assignments are preserved.

## Integration

- Versioned pack: `public/art/equipment-51b-current-1/`.
- Exact source PNGs are retained unchanged here. Per-file crop rectangles remove only the captured comparison frame; the resulting 208×208 pixels are encoded losslessly as WebP. Source and decoded RGB equality was verified. No padding, recoloring, rescaling, repainting or generated substitute.
- Shared `catalog-art.ejs` selects overrides for only these five stable IDs. The existing `fantasy-art` sizing class retains native layout dimensions. Scoped CSS uses proportional full-bleed `cover`, transparent background, no border/shadow and **no second color filter**.
- Armory, owned/public Profiles, receipts, quest requirements/missing-equipment purchases and existing recorded battle loadouts use the same shared mapping. Historical names, participation and quantities still come from saved records. No loadout is fabricated for legacy battles lacking records.
- Crown Harbour, all twenty spells, every other item/property, all content catalogs and game/economic logic remain unchanged. The six approved Land outputs, focal positions, rendered mapping and framing CSS are pinned separately in [APPROVED_LAND.json](../phase51b-selected-art/APPROVED_LAND.json).

## Actual rendered pages

Before is the `c764e19` build, with the old atlas presentation. After uses the selected reference-backed overrides. Synthetic local authenticated accounts only. Native source comparisons use a detached `c764e19` checkout; the screenshots are not production-account captures.

| Width | Armory weapons | Armory armor | Profile equipment | Saved battle equipment |
|---|---|---|---|---|
| 320 | [Before](screenshots/before/320-armory-weapon.png) / [After](screenshots/after/320-armory-weapon.png) | [Before](screenshots/before/320-armory-armor.png) / [After](screenshots/after/320-armory-armor.png) | [Before](screenshots/before/320-profile-equipment.png) / [After](screenshots/after/320-profile-equipment.png) | [Before](screenshots/before/320-battle-equipment.png) / [After](screenshots/after/320-battle-equipment.png) |
| 390 | [Before](screenshots/before/390-armory-weapon.png) / [After](screenshots/after/390-armory-weapon.png) | [Before](screenshots/before/390-armory-armor.png) / [After](screenshots/after/390-armory-armor.png) | [Before](screenshots/before/390-profile-equipment.png) / [After](screenshots/after/390-profile-equipment.png) | [Before](screenshots/before/390-battle-equipment.png) / [After](screenshots/after/390-battle-equipment.png) |
| 430 | [Before](screenshots/before/430-armory-weapon.png) / [After](screenshots/after/430-armory-weapon.png) | [Before](screenshots/before/430-armory-armor.png) / [After](screenshots/after/430-armory-armor.png) | [Before](screenshots/before/430-profile-equipment.png) / [After](screenshots/after/430-profile-equipment.png) | [Before](screenshots/before/430-battle-equipment.png) / [After](screenshots/after/430-battle-equipment.png) |
| 1024 | [Before](screenshots/before/1024-armory-weapon.png) / [After](screenshots/after/1024-armory-weapon.png) | [Before](screenshots/before/1024-armory-armor.png) / [After](screenshots/after/1024-armory-armor.png) | [Before](screenshots/before/1024-profile-equipment.png) / [After](screenshots/after/1024-profile-equipment.png) | [Before](screenshots/before/1024-battle-equipment.png) / [After](screenshots/after/1024-battle-equipment.png) |

[Before route evidence](before-browser.json) and [after route evidence](after-browser.json) include saved receipt and requirements checks. The after run verifies **124 real-route artwork bindings**, including all five IDs in Armory, owned/public Profiles, saved receipts and saved battle loadouts at each width, plus applicable quest/requirements displays. Wallet rows, receipt snapshots and the saved battle result are compared before/after read-only page navigation. Current full-suite results are attached to the draft PR at its exact head; earlier focused captures do not substitute for that run.

## Limits

These selected references are 211px browser captures, not independent higher-resolution painting masters. The 208px content is sufficient for current thumbnail layouts; source-limited fine detail can soften at high device scale. Some weapons already run to the source image edge; no missing tip, handle, unit or equipment detail was invented. Black/dark painted backdrop belongs to the original selected illustration; no artificial black frame/matte is added.

Automated Chromium coverage is not physical iPhone Safari/Android device signoff. No source mismatch requiring a new approval checkpoint was found. Merge and production release remain owner-controlled.
