# Regional weapon and property artwork replacements

Prepared on top of production `4b82971`. **Not activated, deployed, or owner-approved.**

## Package

- **15 newly generated shop weapon illustrations; six newly generated property scenes.**
- One additional weapon candidate is the preserved exact owner-selected King Hudson PNG derivative, not a new design. It remains separately flagged for source/framing review. No grant, drop activation or eligibility change.
- **22 versioned WebPs, 2,294,428 image bytes total** (16 × 512² weapons, six × 768×512 properties). All source PNGs, initial framing passes, prompts, hashes and mechanical encoding script are retained outside the runtime upload.
- New immutable `regional-weapon-land-art-1` depends on exact `level100-equipment-presentation-1` and `level100-beta-artwork-1` canonical digests. Neither installed version is edited. A typed overlay is necessary because several current placeholder weapons occupy legacy slots outside the 45-entry expansion registry.
- Existing approved legendary weapons, every armor/spell illustration, all other properties, names, IDs, stats, unlocks, economics and saved data remain unchanged. No migration, bot, activation, audio, release or recovery code changes.

## Review

[Weapon icons at actual sizes](weapon-actual-size.webp) · [Property icons at actual sizes](property-actual-size.webp) · [Generated source images](sources/) · [Prompts and regional briefs](specifications.json) · [Source provenance/history](source-inventory.json) · [Live audit basis](live-audit.json).

Runtime commit and public assets match production. Direct private installed-registry/activation rows were not read; owner confirms the expansion is live. Candidate selection is derived from that exact deployed code, not from the old rejected drafts. HUD sword availability/grant is not inferred from the shop catalog.

| Stable ID | Current display name | Level | Category | Region | Old placeholder | New candidate |
|---|---|---:|---|---|---|---|
| `stormglass-pike` | Marchwatch Spear | 15 | weapon | Northern Marches | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/stormglass-pike.webp) |
| `gravewarden-scythe` | Fenwarden Billhook | 28 | weapon | Moonfen | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/gravewarden-scythe.webp) |
| `sun-etched-warhammer` | Sunscar Maul | 32 | weapon | Sunscar Reach | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/sun-etched-warhammer.webp) |
| `dragonwake-falchion` | Frontier Falchion | 36 | weapon | Ashen Frontier | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/dragonwake-falchion.webp) |
| `astral-conductor` | Crownlands War Staff | 40 | weapon | Crownlands | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/astral-conductor.webp) |
| `crown-of-ash-blade` | Blacksteel Warblade | 45 | weapon | Ashen Frontier | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/crown-of-ash-blade.webp) |
| `eclipse-greatsword` | Order Marshal Greatsword | 50 | weapon | Crownlands | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/eclipse-greatsword.webp) |
| `marcher-greatsword` | Highland Claymore | 51 | weapon | Northern Marches | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/marcher-greatsword.webp) |
| `fortress-glaive` | Marshguard Glaive | 51 | weapon | Moonfen | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/fortress-glaive.webp) |
| `royal-warblade` | Sunscar Officer’s Saber | 60 | weapon | Sunscar Reach | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/royal-warblade.webp) |
| `guard-captains-halberd` | Crown Captain’s Halberd | 60 | weapon | Crownlands | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/guard-captains-halberd.webp) |
| `sovereigns-zweihander` | Mountain Warden’s Zweihander | 70 | weapon | Northern Marches | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/sovereigns-zweihander.webp) |
| `march-wardens-poleaxe` | Frontier Marshal’s Poleaxe | 70 | weapon | Ashen Frontier | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/march-wardens-poleaxe.webp) |
| `throneguard-polehammer` | Imperial Thronehammer | 90 | weapon | Eclipse Bastion | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/throneguard-polehammer.webp) |
| `eclipse-gatehammer` | Eclipse Gatehammer | 100 | weapon | Eclipse Bastion | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/eclipse-gatehammer.webp) |
| `marcher-stronghold` | Marcher Stronghold | 56 | property | Northern Marches | `/assets/art/level100-beta-1/land.webp` | [WebP](../../public/art/regional-weapon-land-1/marcher-stronghold.webp) |
| `royal-border-fortress` | Royal Border Fortress | 60 | property | Crownlands | `/assets/art/level100-beta-1/land.webp` | [WebP](../../public/art/regional-weapon-land-1/royal-border-fortress.webp) |
| `crown-river-port` | Crown River Port | 70 | property | Moonfen | `/assets/art/level100-beta-1/land.webp` | [WebP](../../public/art/regional-weapon-land-1/crown-river-port.webp) |
| `imperial-siegeworks` | Imperial Siegeworks | 80 | property | Sunscar Reach | `/assets/art/level100-beta-1/land.webp` | [WebP](../../public/art/regional-weapon-land-1/imperial-siegeworks.webp) |
| `sovereign-castle` | Sovereign Castle | 90 | property | Ashen Frontier | `/assets/art/level100-beta-1/land.webp` | [WebP](../../public/art/regional-weapon-land-1/sovereign-castle.webp) |
| `eclipse-crown-citadel` | Eclipse Crown Citadel | 100 | property | Eclipse Bastion | `/assets/art/level100-beta-1/land.webp` | [WebP](../../public/art/regional-weapon-land-1/eclipse-crown-citadel.webp) |
| `king-hudsons-sword` | King Hudson's Sword | 71 | weapon | Eclipse Bastion | `/assets/art/level100-beta-1/weapon.webp` | [WebP](../../public/art/regional-weapon-land-1/king-hudsons-sword.webp) |

File names intentionally follow stable historical IDs. For example the new `regional-weapon-land-1/eclipse-greatsword.webp` depicts **Order Marshal Greatsword (50)**; the separately approved classic Eclipse Greatsword image used at level 100 is untouched.

[390px weapons before/after](screenshots/compare-390-weapons.webp) · [upper weapons](screenshots/compare-390-upper-weapons.webp) · [Land](screenshots/compare-390-land.webp).

## Renderer and adoption boundary

The shared catalog renderer has a narrow artwork-only override slot. Its runtime
selector is **null** and the candidate registry is `pending-owner-review`, with
null owner approvals. Request parameters, environment variables and player data
cannot select it. Unknown/mismatched IDs, categories, previous references,
paths, file hashes and registry dependencies fail validation. Approved art is
outside the exact 22-target set. Historical original equipment without the
presentation-policy marker is not eligible for an override.

Current live rendering stays byte-identical while off, including frozen Phase
5.1B Land/weapon assertions. Local previews explicitly substitute candidate image
paths in actual HTTP-rendered game templates; they do not represent live changes.
Native EJS tests exercise the same candidate resolver in the shared component.

After owner **visual** review, prepare a new immutable approved registry version
bound to this review digest and approved asset hashes (or an explicitly reviewed
subset), register its definition with the existing immutable installation checks,
and select that reviewed version through a separate protected code release.
Retain this proposal unmodified. Do not flip an environment flag, rewrite an
existing registry, reactivate the expansion, change XP epochs or reset bots.
All existing exact-commit, encrypted recovery and owner deployment gates apply.
No approval or deployment is requested/executed automatically by this package.

## Known visual limitations / decisions

- The new weapon backdrops have more visible painted brush texture and warmer
  umber than some older atlas cells. They share the charcoal foundation; exact
  aesthetic equivalence is not claimed. Review at actual 60/76px dimensions.
- Regional distinction is expressed in silhouette, materials and construction:
  billhook, seax-like blade, falchion, claymore, flamberge, glaive, kilij, halberd,
  poleaxe, solid copper maul, stone-cage hammer and crescent gatehammer. Highest
  tiers add physical complexity without exceeding the classic legendary ceiling.
- Property crops retain their central gate/keep/arsenal silhouettes; wide scenery
  and outer nonessential walls naturally fall outside narrow frames. They have
  no added matting, vignette, mirrored extension or artificial borders.
- **King Hudson sword:** exact source selection is preserved, including its
  rainbow identity. Its original near-corner composition can trim extremities in
  portrait/wide frames. That candidate is expressly held for owner-specific
  framing approval; it is not labeled ready or silently repainted. The other
  21 generated candidates have natural painted clearance. A reviewed 21-item
  adoption may exclude Hudson while that separate decision remains open.
- Newly generated art uses project-owned approved art as style reference with
  OpenAI image generation; applicable output terms, no third-party stock/APK
  assets and no claim of exclusivity. HUD reuse follows the existing recorded
  owner selection; independent authorship rights are not asserted.

## Verification

- Focused registry, integrity, provenance, default-off and all-template mapping
  tests plus unchanged Phase 5.1B assertions: 9/9 passed.
- Typecheck/build and static checks: 99 assertions / 77 EJS fixture cases.
- Browser review: 320/390/430/1024, actual Armory/Land/Profile, decoded images,
  object-fit cover, no overflow and five-tab navigation; 116 border/crop checks.
  This checks full-bleed pixels, not semantic landmark recognition or owner taste.
- See [before/after screenshots](screenshots/) and [machine evidence](screenshots/verification.json).
- Source/public preservation is verified against the production baseline; the
  full normal CI result is recorded in the draft PR. No protected workflow runs.
