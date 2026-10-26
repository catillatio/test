# Elemental weapon redesign — PR #37

**15 genuinely redesigned weapon illustrations. Inactive, pending owner review.**
This candidate supersedes the weapon proposals at `e599cd0`; it does not activate
or replace anything in production. The six accepted-for-now property candidates
and King Hudson's Sword retain their **exact original bytes and complete manifest
entries**, including Hudson's separate framing-review status.

[Full collection](full-gallery.webp) · [Original/new at actual 76px and 60px sizes](comparison-actual-size.webp) · [Hudson quality reference, unchanged](hudson-quality-reference.webp) · [Source PNGs](sources/) · [Hashes and source history](source-inventory.json).

## Regional sheets

- [Crownlands — Royal Sapphire](region-crownlands.webp)
- [Northern Marches — Glacial Frost](region-northern-marches.webp)
- [Ashen Frontier — Emberforged Ruin](region-ashen-frontier.webp)
- [Moonfen — Ethereal Fenlight](region-moonfen.webp)
- [Sunscar Reach — Solar Gold](region-sunscar-reach.webp)
- [Eclipse Bastion — Void Violet](region-eclipse-bastion.webp)

## What changed

Every new weapon was illustrated with actual OpenAI image generation using the
approved Oathbound/Eclipse equipment and Hudson only as **quality/style**
references. The original PR weapon candidates were not recolored, reused as
finished designs, filtered or procedurally redrawn. Each weapon has an individual
[construction brief](specifications.json), one regional elemental family and
localized elemental lighting integrated into its material/construction.

The first new Mountain Warden was rejected because it resembled the Highland
Claymore. Its replacement has a wavy asymmetric blade, straight block-ended
crossguard, separate parrying lugs and a transverse glacial core. The rejected
output remains explicitly labeled in source history and is never a runtime asset.

All fifteen received image-generation framing refinements, preserving their new
designs while adding natural painted clearance for portrait/wide crops. Exports
are proportional 512×512 WebPs. Encoding performs no painting, recolor, CSS
filter, stretching, matte/padding, mirrored extension or blurred sidebars.

Backdrops use a faithfully matched near-black charcoal treatment, subdued neutral
texture and centered framing. They are **not a pixel-identical shared background
composite**: natural painted texture and small localized elemental spill vary.
Unlike the original candidates, there is no broad warm-brown backdrop. Regional
light remains attached to the weapon. No new rainbow or prismatic weapon exists.

The separate Hudson sheet is a quality benchmark only. Hudson retains its unique
rainbow design; its known original-source portrait framing issue is unchanged.

## Exact fifteen targets

The table below is completed by the packaging script's immutable manifest.
Names/levels come from the installed presentation definitions, not old filenames.
Each old candidate is in `public/art/regional-weapon-land-1/`; each new candidate
is in `public/art/regional-weapon-land-2/`, using the stable ID filename.

| ID | Current name | Level | Region / element | Original PR #37 | New candidate | SHA-256 |
|---|---|---:|---|---|---|---|
| `stormglass-pike` | Marchwatch Spear | 15 | Northern Marches / Glacial Frost | [original](../../public/art/regional-weapon-land-1/stormglass-pike.webp) | [redesign](../../public/art/regional-weapon-land-2/stormglass-pike.webp) | `94930afd04a2f47acbd4be7c92d4e2e99dca834958617d5fa8522548c7a04402` |
| `gravewarden-scythe` | Fenwarden Billhook | 28 | Moonfen / Ethereal Fenlight | [original](../../public/art/regional-weapon-land-1/gravewarden-scythe.webp) | [redesign](../../public/art/regional-weapon-land-2/gravewarden-scythe.webp) | `9b9307c73d1cfdbbb22d30b7b27875a1ad082f50d29fc0b5eb51e57216ee6761` |
| `sun-etched-warhammer` | Sunscar Maul | 32 | Sunscar Reach / Solar Gold | [original](../../public/art/regional-weapon-land-1/sun-etched-warhammer.webp) | [redesign](../../public/art/regional-weapon-land-2/sun-etched-warhammer.webp) | `dd3ad8be3b51ee8c2cd9a64d0127f800f2c7c85e6be36d953b9878adbd8c7765` |
| `dragonwake-falchion` | Frontier Falchion | 36 | Ashen Frontier / Emberforged Ruin | [original](../../public/art/regional-weapon-land-1/dragonwake-falchion.webp) | [redesign](../../public/art/regional-weapon-land-2/dragonwake-falchion.webp) | `237a5631ea03e0e8ff48427c909bf878b9f0ef9b35cb66fdebd407d4bc645052` |
| `astral-conductor` | Crownlands War Staff | 40 | Crownlands / Royal Sapphire | [original](../../public/art/regional-weapon-land-1/astral-conductor.webp) | [redesign](../../public/art/regional-weapon-land-2/astral-conductor.webp) | `f772f3ab2ddbc404edd6dffcb1a9a5d5e51802b91e5f9e78c8debb94bec6775e` |
| `crown-of-ash-blade` | Blacksteel Warblade | 45 | Ashen Frontier / Emberforged Ruin | [original](../../public/art/regional-weapon-land-1/crown-of-ash-blade.webp) | [redesign](../../public/art/regional-weapon-land-2/crown-of-ash-blade.webp) | `ce9fe08f49d6275eb0ecf1029a91bf165a65ba126b3723d911a436862a103e9f` |
| `eclipse-greatsword` | Order Marshal Greatsword | 50 | Crownlands / Royal Sapphire | [original](../../public/art/regional-weapon-land-1/eclipse-greatsword.webp) | [redesign](../../public/art/regional-weapon-land-2/eclipse-greatsword.webp) | `f810cc5c383817b196f3f74ad4273cd4ac6bd77744a9ec5937acbbf065c237dd` |
| `marcher-greatsword` | Highland Claymore | 51 | Northern Marches / Glacial Frost | [original](../../public/art/regional-weapon-land-1/marcher-greatsword.webp) | [redesign](../../public/art/regional-weapon-land-2/marcher-greatsword.webp) | `06d704fff02335ebe12f7f75795d5cdae5545a6c52fe3ea375ba81ae2770afb5` |
| `fortress-glaive` | Marshguard Glaive | 51 | Moonfen / Ethereal Fenlight | [original](../../public/art/regional-weapon-land-1/fortress-glaive.webp) | [redesign](../../public/art/regional-weapon-land-2/fortress-glaive.webp) | `788b51c8f35db8eeec9cdcc6eaa9adb1e6b603183704744a30cc057973d57462` |
| `royal-warblade` | Sunscar Officer’s Saber | 60 | Sunscar Reach / Solar Gold | [original](../../public/art/regional-weapon-land-1/royal-warblade.webp) | [redesign](../../public/art/regional-weapon-land-2/royal-warblade.webp) | `318d3cdbf97b4210ae9c811b49f5910ce4f3a1230e430b7a7e9ecf97b2aa8ae0` |
| `guard-captains-halberd` | Crown Captain’s Halberd | 60 | Crownlands / Royal Sapphire | [original](../../public/art/regional-weapon-land-1/guard-captains-halberd.webp) | [redesign](../../public/art/regional-weapon-land-2/guard-captains-halberd.webp) | `7143883d2eb588ed378c43bd0add1303e10701f90527e86a00257e1b06c8c006` |
| `sovereigns-zweihander` | Mountain Warden’s Zweihander | 70 | Northern Marches / Glacial Frost | [original](../../public/art/regional-weapon-land-1/sovereigns-zweihander.webp) | [redesign](../../public/art/regional-weapon-land-2/sovereigns-zweihander.webp) | `7de7f78b76bd07f5da99ea9922f758bcb7efcde5488be83d0ae3039e11089201` |
| `march-wardens-poleaxe` | Frontier Marshal’s Poleaxe | 70 | Ashen Frontier / Emberforged Ruin | [original](../../public/art/regional-weapon-land-1/march-wardens-poleaxe.webp) | [redesign](../../public/art/regional-weapon-land-2/march-wardens-poleaxe.webp) | `619c66deab3a750f12d6835f5645605d46318e8505027734c42127cce82aeab7` |
| `throneguard-polehammer` | Imperial Thronehammer | 90 | Eclipse Bastion / Void Violet | [original](../../public/art/regional-weapon-land-1/throneguard-polehammer.webp) | [redesign](../../public/art/regional-weapon-land-2/throneguard-polehammer.webp) | `53cf8df0c81a9eeb8fb4cf13c026db3c13b7e66a33f1ce88190103c2e3b28157` |
| `eclipse-gatehammer` | Eclipse Gatehammer | 100 | Eclipse Bastion / Void Violet | [original](../../public/art/regional-weapon-land-1/eclipse-gatehammer.webp) | [redesign](../../public/art/regional-weapon-land-2/eclipse-gatehammer.webp) | `a61094ee2ab774d0debb903519e549b7520ec83f85da29241705d33ab04c3cf8` |

The historical ID `eclipse-greatsword` here represents **Order Marshal Greatsword
(50)**. The separately approved classic Eclipse weapon currently presented in the
level-100 catalog remains untouched. No names, catalog definitions, attack/defense,
levels, prices, upkeep, inventory, purchases, quest loot or financial records change.

## Registry and preservation

- New immutable candidate: [`regional-weapon-land-art-2`](../../rulesets/regional-weapon-land-art-2/rules.json).
- It binds the exact prior candidate digest and exact current presentation/beta-art
  dependencies. The first candidate and all its assets remain unmodified history.
- Only fifteen weapon entries use new paths/hashes. Six property entries and the
  Hudson entry are deep-equal to candidate 1, including source, framing, approvals
  and metadata. Tests reject any alteration to those preserved entries.
- [Preservation baseline](preservation-baseline.json) pins the original manifest
  bytes. [Inventory](inventory.json) records exact registry digest and image sizes.
- Both registries remain pending owner review; all approvals remain null.
  The production renderer selector remains **null**. No environment flag, request
  parameter or account value can turn these on. Live/historical rendering while
  off remains byte-identical.
- Armor, shields, spells, every approved asset, production rulesets, all 900 bot
  identities/activation, progression and release/recovery infrastructure are untouched.

**Release boundary:** these weapons are one part of a future **coordinated,
owner-approved weapon/armor/shield/spell/Land artwork release**. Do not activate
weapons separately or treat these internal checks as owner approval. After every
required category has been completed and approved, prepare a new immutable
approved registry (including any explicitly approved subset), register the exact
definitions and select it in a reviewed code change using the existing protected
release/recovery process. No activation, merge, deployment or grant is authorized
or performed by this PR.

## Review and verification

Full-resolution sources, the entire collection and every 60px/76px icon were
visually reviewed. Internal review covers the eight requested gates: premium
style, physical silhouette, regional construction, integrated element, level
prestige, thumbnail readability, desirability and Hudson exclusivity. Final visual
desirability remains an owner decision; no automatic score can certify it.
See [per-weapon review notes](quality-review.json) and [background measurements](background-checks.json).

The technical checkpoint includes exact asset/source hashes, image decode and
dimensions, path/symlink/tampering rejection, immutable predecessor validation,
all-template current/historical rendering, property/Hudson preservation and all
six unchanged Phase 5.1B frozen-art tests. Actual local HTTP game previews use
disposable accounts/database data and explicit image substitution only; production
is never contacted. Browser evidence covers 320/390/430/1024px and 116 full-bleed
crops. These mechanical checks do not substitute for human art review.

[Rendered screenshots](screenshots/) · [Browser evidence](screenshots/verification.json).
Normal full CI results and the final commit are recorded in draft PR #37.
No protected workflow dispatch or production operation occurs.

Reproduce derivatives/sheets with `python scripts/package-regional-art-2.py` from
`knights-reforged` using Pillow/DejaVu. Existing versioned output with different
bytes fails closed. Source PNGs and galleries stay outside runtime upload/container
packages. Only optimized WebPs and their provenance are runtime files.

## Completed local validation

- 10/10 focused registry/rendering/preservation tests, zero skips.
- Typecheck, build and static checks: 99 assertions / 77 EJS fixture cases.
- Browser: four widths, 22 decoded sources, 116 full-bleed crops, two synthetic matte-rejection fixtures and a natural-charcoal acceptance fixture. The previous single-dark-pixel heuristic falsely rejected charcoal scenery after downsampling; the replacement inspects natural-resolution abrupt matte bands and opaque edge-to-edge crops instead.
- [390px original/redesigned Armory](screenshots/compare-390-weapons.webp) · [upper weapons](screenshots/compare-390-upper-weapons.webp) · [1024px comparison](screenshots/compare-1024-upper-weapons.webp) · [approved style benchmarks](live-style-benchmarks.webp).
- Final normal full CI and source-upload packaging results are recorded in the draft PR.
