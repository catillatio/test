# Coordinated owner-supplied artwork integration

**Blocked for release/adoption: five weapon files are explicitly concept-only.**

This checkpoint integrates the usable supplied files, preserves the selected six Land images exactly, and prepares one presentation-only override boundary. It does not approve or perform a partial release. No images were generated, recolored, given new backgrounds or replaced with previous candidates.

## Review images

Actual-size comparisons: [weapons](comparison-weapon.webp) · [armor](comparison-armor.webp) · [spells](comparison-spell.webp) · [Land](comparison-property.webp). Blocked rows truthfully retain their existing placeholders.

390px before/after viewports: [weapons](screenshots/compare-390-weapon.webp) · [armor](screenshots/compare-390-armor.webp) · [spells](screenshots/compare-390-spell.webp) · [Land](screenshots/compare-390-property.webp).

Full rendered pages and 320/390/430/1024px Profile/receipt/battle captures are in [screenshots/](screenshots/). All previews are local synthetic data, not production adoption evidence. [Concept-only source reference](blocked-concepts.webp).

## Exact inventory and provenance

[52-slot inventory](INVENTORY.md) · [source/output hashes, crop rectangles and processing](inventory.json) · [immutable registry](../../rulesets/coordinated-art-1/rules.json) · [unchanged historical files](preservation.json).

- **10 weapons:** supplied standalone 512×512 WebPs, copied byte-for-byte.
- **15 armor pieces:** individually supplied original-image WebPs, proportionally downscaled from 1254×1254 to 512×512.
- **16 spells:** 15 individually supplied generation-sheet tiles (not independently generated full-resolution originals) plus the **later standalone Moonfen Rampart Ward**, verified by its supplied WebP hash. The embedded decorative frame is trimmed by 6px per tile edge / 44px per standalone edge, then encoded without stretching or enlargement. This is technical full-bleed packaging, not a new composition.
- **6 properties:** exact `regional-weapon-land-art-1` paths, hashes and bytes; no recompression or cropping.
- **5 weapons remain blocked:** their low-resolution gallery crops are preserved under `concepts/`, excluded from runtime image paths and never called final assets.

The compact ZIP contains WebPs and source metadata, **not the original PNGs** named in the older handoff manifests. The received files and manifests are preserved under `owner-upload/`. Original PNG names/hashes remain provenance metadata, not claims that those files were received. Source authority is the owner's supplied original generated artwork package; no stock or historical game artwork was introduced. No montage screenshot was cut up for use as an asset.

New runtime image bytes: **2,653,794** (41 equipment files). Reused Land bytes: **1,119,934**. Selected usable total: **3,773,728**. Raw uploads, concepts, screenshots and provenance documents remain outside the allowlisted production upload and container inputs. Historical candidate files already present in PR #37 remain unchanged and inactive.

## Missing production assets — exact smallest correction

| Stable ID | Current displayed name | Supplied file | Problem |
|---|---|---|---|
| `royal-warblade` | Sunscar Officer’s Saber | `sunscar-officers-saber-SHEET-CROP-ONLY.webp` | 286×245; source manifest explicitly says concept only |
| `march-wardens-poleaxe` | Frontier Marshal’s Poleaxe | `frontier-marshals-poleaxe-SHEET-CROP-ONLY.webp` | 280×245; same restriction |
| `sovereigns-zweihander` | Mountain Warden’s Zweihander | `mountain-wardens-zweihander-SHEET-CROP-ONLY.webp` | 279×245; same restriction |
| `throneguard-polehammer` | Imperial Thronehammer | `imperial-thronehammer-SHEET-CROP-ONLY.webp` | 283×245; same restriction |
| `eclipse-gatehammer` | Eclipse Gatehammer | `eclipse-gatehammer-SHEET-CROP-ONLY.webp` | 283×245; same restriction |

Supply acceptable individual owner-selected production images for these five slots. They need not be invented by Codex; regeneration and substitution were expressly prohibited. Merely renaming or upscaling these concept crops would not resolve the source-quality restriction. The other 47 mappings can carry forward unchanged into the next immutable coordinated registry.

## Rendering and adoption design

The shared `catalog-art.ejs` resolver handles Armory, Profile, public Profile, purchase receipts, quest requirements and recorded battle equipment. New overrides apply only to exact stable IDs, matching names/levels/categories, with the current presentation-policy marker on equipment. Unmarked historical identities continue to use their historical artwork. Saved names, receipts and battle data are not rewritten.

`activeCoordinatedArtwork` is **null**. The new manifest is canonically pinned in code, records five explicit blockers and has no release approval. No URL, form, environment variable, realm field or public endpoint selects it. Incomplete/unknown manifests and forged approvals fail closed. Startup verifies the entire selected registry's bytes before accepting a future active selection; there is currently no active selection.

Use a separately reviewed **code-selected immutable registry** for eventual adoption. This keeps adoption atomic across all 52 entries and needs no new SQL tables, grants, admin API or rewrite of the already-installed expansion activation. A new complete registry/version and exact owner-approved selector pin must be reviewed together. All workers of one deployed code version resolve one complete set. Normal rolling-deployment clients may briefly see either complete old or complete new set; there is no category-by-category switch.

Because this candidate is incomplete, **there is no production-adoptable manifest or activation command in this checkpoint**. Do not deploy this draft as if it were the requested final artwork release. Existing `regional-weapon-land-art-*` selectors also remain inactive; Hudson's Sword retains its exact bytes and separate pending framing review. No Hudson grant is performed.

## Approval and release sequence

1. Obtain the five missing acceptable weapon assets. Append the complete immutable successor manifest with explicit source/output hashes; keep this historical candidate intact.
2. Verify all 52 entries, source rights/provenance, full-bleed crops, unchanged approved artwork and responsive game routes. Run exact-head normal CI, including the existing independent encrypted recovery rehearsal.
3. Present the complete inventory, screenshots, immutable digest, exact code-selected adoption pin, commit and CI result for **separate owner approval**. No final-art/release approval is inferred from file receipt.
4. Obtain explicit merge authorization. Merge only the reviewed candidate through the existing release branch process.
5. Obtain separate protected production-release/adoption authorization for that exact commit. Run only the existing protected workflow, preserving owner gates, exact identity, signatures, encrypted export, independent download/restore, schema-025 and preservation checks. Never direct-redeploy Railway or rerun the level-100 expansion cutover.
6. The owner-reviewed complete registry is selected atomically by that protected code release; there is no extra database mutation or unreviewed live variable change. If the owner wants code installation before artwork adoption, keep the selector null for installation and use a second separately approved protected code release for adoption.
7. Verify actual public/live Armory, Land, Profiles and receipts after adoption. Only then mark **production-adopted/live-verified**. Follow existing protected rollback/forward-recovery procedures if needed; do not reset the realm or rewrite activation records.

No protected workflow was dispatched, production records inspected, service changed, merge performed, deployment attempted or artwork adopted during this work.

## Verification evidence

- Focused registry/adversarial/preservation checks: [tests](../../tests/coordinated-artwork.test.ts).
- Real local HTTP/EJS preview: [fixture](../../scripts/browser-coordinated-art.ts). It injects the preview resolver only inside its isolated test-process EJS engine, not by a production preview flag, URL or DOM image replacement.
- Four widths: **320, 390, 430, 1024px**, all 52 marketplace slots, self/public Profiles, equipment/Land receipts and recorded battle equipment.
- [Browser results](screenshots/verification.json), including exact natural dimensions, paths, `object-fit: cover`, full-bleed crop checks, no overflow or missing assets, and preservation of populated business rows / original 450 synthetic bots. Genuine notification read acknowledgements are excluded from that read-only gameplay comparison.
- Complete CI/recovery status and the tested commit are recorded in the PR description after CI completes. Local checks are not represented as production recovery evidence.

## Status

| Stage | Status |
|---|---|
| Imported | 46 supplied equipment WebPs + 6 canonical Land references |
| Validated | Received source hashes checked; 47 usable runtime mappings; 5 explicit blockers |
| Integrated | 47 inactive preview overrides; all 52 slots inventoried |
| Owner-approved for coordinated release | No; final complete-set review pending |
| Merged | No |
| Protected-deployed | No |
| Production-adopted | No |
| Live-verified | No |
