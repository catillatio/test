# Balanced weapons on the live game's background

**15 inactive weapon candidates: twelve new designs and three adapted proof
designs. Six Land illustrations and King Hudson's Sword remain unchanged.**

[Full collection](full-gallery.webp) · [Actual-size comparisons/crops](actual-size-comparison.webp) · [Live background reference](references/shared-live-background.png) · [Public live-byte verification](live-background-reference.json) · [Exact registry/digest/size](inventory.json).

## Background requirement

The shared background is made from **actual live game pixels**, not a newly
generated charcoal interpretation. A read-only public GET of the live weapons
atlas and two approved equipment icons matched the checked-out bytes exactly.

The unoccupied `[8, 8, 108, 108]` corner of the first tile in
`public/art/fantasy-0.2/weapons.webp` supplies its existing smoky olive/umber
charcoal texture. That 100×100 sample is proportionally scaled to 512×512 and used
unchanged behind **every one of these fifteen weapons**. Its source hash, crop,
processing and shared lossless WebP hash are recorded in the new manifest. This
reuses the live background's palette and pattern; it does not claim that every
entire legacy weapon tile has an identical background composition.

All illustrated foregrounds were produced with actual image generation on
transparency. The twelve new weapons follow the approved proof direction. The
three proof designs were adapted to transparent foregrounds, retaining their
physical designs; the gatehammer also retains its slight localized violet light.

The final exports mechanically composite those foregrounds over the same live
sample. There is no RGB recolor, CSS filter, generated background, stretched
geometry, mirrored edge, matte, blurred sidebar or artificial black gutter.
Only 66 pixels of disconnected edge-alpha speck noise in the raw falchion output
were removed; its raw PNG remains retained. The substantial weapon components
are never removed by that cleanup. Source silhouette bounds are checked before
proportional placement, and natural background clearance supports portrait/wide
cover crops without clipping major weapon features.

## Slight glow, selectively applied

Only these three are marked for a slight local glow:

- **Mountain Warden's Zweihander (70):** a little ice-white light around the small
  glacial cylinder at the ricasso, with solid readable steel elsewhere.
- **Imperial Thronehammer (90):** violet light contained near two protected head
  windows, with visible obsidian, steel and engraved metal faces.
- **Eclipse Gatehammer (100):** violet light in the protected head/haft recess,
  preserving the substantial obsidian striking block and crescent structure.

Other weapons keep varied small core, gemstone or inscription accents. A luminous
inscription is not an all-over aura. Craftsmanship, materials and silhouette
remain primary. No rainbow weapon, lightning outlines or continuous energy rails.
Hudson's unique prismatic artwork is preserved exactly, including its separate
framing-review hold.

## Exact candidates

Stable IDs, current names, levels, stats, ownership, prices and upkeep are unchanged.
The historical ID `eclipse-greatsword` here is **Order Marshal Greatsword (50)**;
the approved classic Eclipse illustration used elsewhere remains untouched.

| ID | Current name | Level | Culture | Small magical treatment | Image |
|---|---|---:|---|---|---|
| `stormglass-pike` | Marchwatch Spear | 15 | Northern Marches | small quartz glint | [WebP](../../public/art/regional-weapon-land-3/stormglass-pike.webp) |
| `gravewarden-scythe` | Fenwarden Billhook | 28 | Moonfen | single throat rune | [WebP](../../public/art/regional-weapon-land-3/gravewarden-scythe.webp) |
| `sun-etched-warhammer` | Sunscar Maul | 32 | Sunscar Reach | protected amber inset | [WebP](../../public/art/regional-weapon-land-3/sun-etched-warhammer.webp) |
| `dragonwake-falchion` | Frontier Falchion | 36 | Ashen Frontier | contained ember seal | [WebP](../../public/art/regional-weapon-land-3/dragonwake-falchion.webp) |
| `astral-conductor` | Crownlands War Staff | 40 | Crownlands | pale interior rune | [WebP](../../public/art/regional-weapon-land-3/astral-conductor.webp) |
| `crown-of-ash-blade` | Blacksteel Warblade | 45 | Ashen Frontier | recessed crimson inscription | [WebP](../../public/art/regional-weapon-land-3/crown-of-ash-blade.webp) |
| `eclipse-greatsword` | Order Marshal Greatsword | 50 | Crownlands | contained sapphire accent | [WebP](../../public/art/regional-weapon-land-3/eclipse-greatsword.webp) |
| `marcher-greatsword` | Highland Claymore | 51 | Northern Marches | two frost rune inlays | [WebP](../../public/art/regional-weapon-land-3/marcher-greatsword.webp) |
| `fortress-glaive` | Marshguard Glaive | 51 | Moonfen | short inner-edge inscription | [WebP](../../public/art/regional-weapon-land-3/fortress-glaive.webp) |
| `royal-warblade` | Sunscar Officer’s Saber | 60 | Sunscar Reach | three amber inscriptions | [WebP](../../public/art/regional-weapon-land-3/royal-warblade.webp) |
| `guard-captains-halberd` | Crown Captain’s Halberd | 60 | Crownlands | two recessed heraldic glyphs | [WebP](../../public/art/regional-weapon-land-3/guard-captains-halberd.webp) |
| `sovereigns-zweihander` | Mountain Warden’s Zweihander | 70 | Northern Marches | small glacial core with slight local glow | [WebP](../../public/art/regional-weapon-land-3/sovereigns-zweihander.webp) |
| `march-wardens-poleaxe` | Frontier Marshal’s Poleaxe | 70 | Ashen Frontier | small internal furnace seal | [WebP](../../public/art/regional-weapon-land-3/march-wardens-poleaxe.webp) |
| `throneguard-polehammer` | Imperial Thronehammer | 90 | Eclipse Bastion | protected violet windows with slight local glow | [WebP](../../public/art/regional-weapon-land-3/throneguard-polehammer.webp) |
| `eclipse-gatehammer` | Eclipse Gatehammer | 100 | Eclipse Bastion | protected violet core with slight local glow | [WebP](../../public/art/regional-weapon-land-3/eclipse-gatehammer.webp) |

Regional review sheets: [Northern Marches](region-northern-marches.webp) ·
[Crownlands](region-crownlands.webp) · [Moonfen](region-moonfen.webp) ·
[Sunscar Reach](region-sunscar-reach.webp) · [Ashen Frontier](region-ashen-frontier.webp) ·
[Eclipse Bastion](region-eclipse-bastion.webp).

## Inactive registry and preservation

New [`regional-weapon-land-art-3`](../../rulesets/regional-weapon-land-art-3/rules.json)
is the third installable **candidate**, following versions 1 and 2. The earlier
`regional-art-3-proofs` directory was documentation only, not a registry version.
This round's sources/reviews are in `docs/regional-art-4` to preserve that history.

The new candidate binds version 2's exact digest, current presentation/beta-artwork
digests, and the live-background source identity. Historical manifests and all
their files remain unchanged. The six property entries and Hudson entry retain
their complete original records and original version-1 paths; no background
processing is applied to them. No armor, shield or spell art changes.

The renderer selector remains **null**, all asset approvals remain unset, and no
environment flag/request parameter/account value enables these candidates.
Existing live/historical rendering while off is unchanged. No SQL migration,
catalog, economic, bot, progression, release, backup or recovery changes.

This remains part of a future **coordinated owner-approved artwork release**
covering weapons, armor/shields, spells and Land. Nothing is approved or activated
automatically. Any final adoption requires a new reviewed approved manifest,
exact installation identity and explicit code selection through the existing
protected release process. Do not deploy a partial weapon-only update.

## Evidence and reproduction

[Design briefs](briefs.json) · [Source provenance](source-inventory.json) ·
[Existing-file preservation](preservation-checks.json) · [Rendered screenshots](screenshots/) ·
[Browser evidence](screenshots/verification.json).

Run `python scripts/package-regional-art-3.py` from `knights-reforged` with Pillow
and DejaVu. It verifies the live-atlas hash, reproduces the shared sample, checks
transparent source/physical bounds, preserves the seven carried-forward entries,
and rejects changed bytes at an existing versioned output. Raw generated RGBA
PNGs and lossless composites are retained outside the runtime package. Runtime
files are optimized 512×512 weapon WebPs, the small shared-background WebP and
provenance. Property sizes/bytes are unchanged.

Technical checks cover exact sources/hashes, immutable registry identities,
default-off behavior, preserved historical/current rendering, constrained paths,
symlink/tampering rejection, background equality, selected-glow metadata and the
unchanged Phase 5.1B asset assertions. Browser checks cover 320/390/430/1024px,
116 full-bleed crops and shared-background corner comparisons for all fifteen.
Visual desirability remains for owner review; mechanical checks do not grant it.

Final normal CI results are recorded in draft PR #37. No protected workflow,
production database operation, bot provisioning, Hudson grant, merge or deployment.

[Actual live source/sample diagram](background-source-diagram.webp) · [Three proof designs/background update](proof-design-background-update.webp) · [390px Armory](screenshots/compare-390-weapons.webp) · [390px upper weapons](screenshots/compare-390-upper-weapons.webp) · [1024px](screenshots/compare-1024-upper-weapons.webp).
