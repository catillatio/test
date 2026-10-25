# Functional beta artwork — temporary, not final illustrations

The owner's PR #35 revision explicitly permits generic placeholders for the
level-100 beta. Final equipment/regional illustrations are **not a beta blocker**.
The earlier rejected paintings remain frozen as historical references.

| Reusable image | Dimensions | Bytes | Existing original vector |
| --- | --- | ---: | --- |
| Weapon | 128×128 | 508 | `public/art/alpha/blade.svg` |
| Armor | 128×128 | 882 | `public/art/alpha/mail.svg` |
| Shield | 128×128 | 1,022 | `public/art/alpha/buckler.svg` |
| Spell | 128×128 | 998 | `public/art/alpha/storm.svg` |
| Land | 192×128 | 590 | `public/art/alpha/tower.svg` |
| **Total** | **5 WebPs** | **4,000** | **Original project assets** |

These are mechanical vector derivatives on a full-bleed charcoal texture, not
new generated illustrations or recycled rejected designs. The original SVG
files are unchanged. New vector sources are in `sources/`; their hashes, source
hashes, runtime hashes and dimensions are recorded in the immutable registry and
`public/art/level100-beta-1/provenance.json`. No unlicensed third-party, historical
APK or stock artwork is used. [Actual-size frames](actual-size-placeholders.webp).

All **45** new catalog IDs map to these five assets: 36 shop items, three rare
Hudson items and six properties. The shield silhouette represents Hudson's Shield;
this does not create a new equipment category or change purchase restrictions.
Names, levels, stats, prices, upkeep, quantities and historical data are unchanged.

## Explicit policy and integrity

- `temporary-beta-artwork-1` records the owner's temporary-use authorization,
  maximum six assets, 8 KiB/file and 32 KiB total limits, and the level-50 visual
  prestige ceiling. This is not final-art approval or production authorization.
- `level100-beta-artwork-1` is the exact immutable 45-entry registry. Its entries
  say `use: temporary-beta`, `status: temporary-beta-approved`, and the registry
  says `finalArtwork: false`. `approvedExpansionArt()` remains final-only and
  returns no final image for these entries.
- Startup and cutover verify the deployed known registry, SHA-256, actual byte
  counts, WebP header, allowed paths and real paths inside `public/`; missing,
  altered, unknown or outside-root symlinked assets fail closed. Rights/framing
  declarations and exact item identity are required. Tests verify the actual
  pixels/crops, rather than treating metadata alone as proof of framing.
- Every cutover plan pins the registry ID and digest and defaults
  `temporaryBetaArtworkReviewed` to **false**. The owner must explicitly review
  the temporary beta policy and set it to **true** in the exact approved plan.
  String values, omitted review, forged IDs or changed digests are rejected.
  The immutable activation audit records this temporary use and acknowledgement.
- No migration was added. Strict schema **025** and all financial, population,
  backup, independent restore, signature, exact-commit and approval gates remain.

## Runtime exclusion and preservation

**45 obsolete runtime images / 4,870,646 bytes** moved byte-for-byte from
`public/art/level100-1/` to `docs/level100-launch/art/archived-runtime-level100-1/`:
42 rejected ordinary drafts plus three Hudson renderings. None is served or
included in the production Docker/source bundle. The five replacements save
**4,866,646 image bytes**. The existing allowlists exclude all `docs/` archives;
no release-infrastructure change was necessary. [Inventory](inventory.json).

The three owner-original randomized-name Hudson PNGs remain in `art/owner-originals/`
(relative to the parent launch directory), with their original hashes. Masters,
rejected studies, frozen trials and earlier screenshots remain intact. Crown
Harbour, all classic equipment/spells and approved Phase 5.1B artwork are unchanged.
Historical artwork ruleset versions 1 and 2 remain immutable installed definitions;
their old paths document history and are not the active renderer's mapping.
Historical packaging cannot recreate the rejected runtime directory.

## Replacing individual images later

1. Receive separately approved original assets and rights/framing evidence.
   Use new versioned file paths; never overwrite a prior registered asset path.
2. Add a new immutable registry, binding the exact predecessor ID/digest and
   declaring exactly the changed item IDs. Keep all 45 identities, names, kinds
   and levels unchanged. Unselected entries/assets stay byte-identical. A single
   item may leave the shared placeholder while all other items retain it.
3. Mark only final reviewed entries `use: final` / `status: approved`. A mixture
   of final and placeholder images is explicitly `purpose: mixed`, not falsely
   final. The replacement validator rejects undeclared changes, reused paths with
   changed bytes, missing rights/framing, extra IDs or content remapping.
4. Register the new immutable definition, retain known predecessors and select
   it in the same reviewed code release. Startup verifies the new image files.
   Use the existing protected release process. No new public endpoint, runtime
   file override, environment bypass, data migration or ownership rewrite exists.

The immutable realm activation keeps its original artwork approval digest as
cutover evidence. The **reviewed deployed registry** controls current rendering,
as with existing per-item artwork overrides. Known predecessor digests remain
recognized; no activation record is edited to change a picture. Thus Profiles,
receipts, requirements and historical battles consistently use the current
reviewed image for the same authoritative item ID.

Level-50-style legendary visual prestige is the ceiling for future levels 81–100.
The earlier extravagant art briefs are archived history, not current direction.
Possible future legendary naming/unlock/content remapping remains a **separate
owner decision**. This revision does not retier existing gear or alter economics.

## Verification and previews

[Browser evidence](screenshots/verification.json) covers all 45 bindings at 320,
390, 430 and 1024px, actual owned/public Profiles, Armory, Land, requirements,
receipts and battle equipment. **1,236 actual crop checks**, no missing assets,
no overflow and five navigation tabs. The shared images are decoded and the
rendered per-ID path/use checked, including the three quest-only items.

- [390px Armory](screenshots/390-armory-weapon.png)
- [390px Land](screenshots/390-land.png)
- [390px public Profile](screenshots/390-hudson-public.png)
- [320px](screenshots/320-armory-armor.png), [430px](screenshots/430-armory-spell.png),
  [1024px](screenshots/1024-land.png)

Reproduction: `npx tsx scripts/build-beta-placeholders.ts` requires Chromium and
Python Pillow. It refuses to overwrite any existing version with different bytes.
Normal CI verifies committed bytes and routes without rebuilding images or
requiring new runtime dependencies. Physical device testing remains an alpha
limitation; final CI links and exact commit are recorded in draft PR #35.
