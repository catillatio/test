# Three balanced weapon-style proofs — owner review

**Exactly three new illustrations. No runtime assets, registry references or game
code changed. Stop here for owner review before generating the other twelve.**

The complete first and second weapon sets remain unapproved comparison history.
Their files are retained unchanged. Passing code CI did not approve their art.

[Three new proofs together](three-proofs.webp) · [All four-way comparisons](comparisons.webp) · [Prompts and construction briefs](briefs.json) · [Hashes/provenance/preservation checks](review-manifest.json).

Each comparison shows the original PR #37 candidate, the overly elemental second
candidate, the new proof and the **unchanged King Hudson quality reference**.
Every column also includes actual 76×76 and 60×60 square thumbnails. These are
labeled review sheets, not screenshots of an activated game.

## What works in each previous direction

| Prior direction | Qualities to retain | Qualities to leave behind |
|---|---|---|
| Original candidate set | Readable steel planes, visible blade mass, distinct metal/leather/ivory surfaces, engraving and grip details | Ordinary-looking construction, insufficient fantasy prestige, bright warm-brown background competing with the object |
| Elemental revision | Stronger cultural motifs, sculpted components, memorable head/guard construction, incorporated supernatural features | Continuous luminous channels, lightning/edge coronas, hidden material planes, similar region-wide glow treatments |
| Approved Hudson reference | A beautiful substantial sword, rich material rendering, clear silhouette, dramatic illumination and a meaningful enchantment | Its unique prismatic treatment and actual design remain exclusive to Hudson |

The three proofs prioritize visible craftsmanship and neutral reflected lighting.
They use organic smoky charcoal backgrounds and individual magical treatments.
Regional identity comes from construction and ornament as well as the restrained
color accent. No new rainbow weapon, continuous energy outline or broad aura.

## The three new constructions

| Proof | New physical identity | Individual magical treatment | Comparison |
|---|---|---|---|
| **Order Marshal Greatsword — 50, Crownlands** (`eclipse-greatsword`) | Solid broad silver-steel blade with shallow laurel engraving, asymmetrical folded-laurel S-guard, heraldic shield, navy-wrapped grip and crown pommel | One contained sapphire glint and small nearby blue inlays; the blade remains visible metal | [Four-way sheet](compare-eclipse-greatsword.webp) · [512px proof](eclipse-greatsword.webp) |
| **Sunscar Officer’s Saber — 60, Sunscar Reach** (`royal-warblade`) | Broad curved crucible-steel blade with angular yelman/false-edge step, etched sun-map, segmented ivory grip, falcon pommel and pierced copper/bronze hand guard | Three small recessed amber inscriptions at the blade shoulder; no illuminated cutting edge | [Four-way sheet](compare-royal-warblade.webp) · [512px proof](royal-warblade.webp) |
| **Eclipse Gatehammer — 100, Eclipse Bastion** (`eclipse-gatehammer`) | Large opaque faceted obsidian striking block, asymmetrical crescent projections, moon-phase inlays, engraved metal buttresses and an architectural haft/counterweight | A small violet void recess protected within the head/haft junction; no floating debris or glowing shaft | [Four-way sheet](compare-eclipse-gatehammer.webp) · [512px proof](eclipse-gatehammer.webp) |

The stable historical ID `eclipse-greatsword` in this table refers to the current
**Order Marshal Greatsword (50)** presentation. No catalog name, level, statistic
or approved classic Eclipse image has been changed.

All three are newly image-generated physical designs. Their solid blade/head
construction, guards, grips and ornament differ from both previous candidates;
they were not made by dimming, filtering or recoloring those images. Original
PNG outputs and exact prompts are retained. Preparing the WebPs/sheets uses
proportional resizing and encoding only.

## Review boundary and known limits

- This checkpoint asks for a **visual direction decision on these three proofs**.
  It grants no approval to the other twelve. No other new weapons were generated.
- The proofs are 512×512 review WebPs with original 1254×1254 PNG sources. Square
  thumbnail appearance was inspected at 60px and 76px. Other in-game frame ratios
  and final integration remain a later step after direction approval; these are
  not certified production assets or an installable artwork registry.
- The sapphire is deliberately subtle at icon size. Saber inscriptions become
  small warm marks; the hammer's protected violet core stays subordinate to its
  material mass. Owner review should judge whether this amount of magic is right.
- The neutral reflections are brightest on the greatsword and saber bevels. They
  reveal the material rather than emitting a colored outline. Fine engraving
  naturally resolves more fully in the larger views.
- All six Land illustrations, Hudson's Sword, its original framing-review hold,
  both complete candidate manifests and all previous source/review files remain
  unchanged. No armor, shield or spell changes.
- The artwork registry remains inactive, with the existing runtime selector
  `null` and approvals unset. No new registry version is created by these proofs.
- Future weapon/armor/shield/spell/Land adoption remains a coordinated,
  owner-approved artwork release through the existing protected process.

## Focused verification

`python docs/regional-art-3-proofs/prepare-proofs.py` creates reproducible review
derivatives and sheets, rejecting different bytes at an existing proof path.
It checks the three target names/IDs/levels against the existing presentation and
compares **334 existing game/art/registry/release files** byte-for-byte with
`b95c156`. Image/source hashes and the unchanged Hudson/registry hashes are in the
review manifest. This checkpoint requires no database, game startup, production
inspection or protected workflow.

The full game CI at `b95c156` passed 769/769 tests. This proof-only commit changes
documentation/images only; any automatically triggered normal PR CI is reported
separately in the draft PR, without treating the old result as new-head validation.

No merge, deployment, production modification or artwork activation.
