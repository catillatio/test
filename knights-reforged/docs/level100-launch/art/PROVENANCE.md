# Prepared art provenance — approval remains separate

**Current decision: [artwork frozen](../ART_FREEZE.md).** The prior ordinary
draft selection is rejected. Everything below is preserved provenance, not
approval to generate, recycle or adopt it. Four later unadopted PNG trials are
archived without transformations; their hashes are in `../art-freeze.json`.

Classic atlases, six approved Phase 5.1B Land overrides, five approved equipment
overrides, Crown Harbour and all other pre-existing artwork are unchanged.

## Inventory and sources

The machine-readable [versioned manifest](../../../rulesets/level100-artwork-2/rules.json)
and [runtime provenance](../../../public/art/level100-1/provenance.json) record
45 IDs, names, unlock levels, source/master/runtime SHA-256, dimensions and paths.
The original `level100-artwork-1` definition is retained unchanged.

- **36 shop items + six Land drafts:** newly generated project artwork using
  OpenAI image generation for this review. Applicable OpenAI output terms; no
  third-party stock/game artwork or claim of exclusivity. Original generated
  sources were encoded into versioned review masters. Some early drafts had
  charcoal scene corrections; they remain unapproved. No historical APK artwork
  was copied into these new images. The latest eight rejected charcoal studies
  exist only as labelled review thumbnails, never as runtime replacements.
- **Three Hudson items:** owner-selected original PNGs from
  `assets/king-hudson-reference-art-20261024`, exact commit
  `3721dc4595e237f6f5bf8632e70b60a0e6c157a7`. The byte-identical originals are
  retained in `owner-originals/`; [selection evidence](hudson-selection.json)
  binds each UUID filename to the item ID and original/runtime hashes. Earlier
  small JPGs, human-readable duplicate filenames and generated adaptations are
  not the selected sources. Owner permission to use supplied images is recorded;
  this does not independently establish third-party authorship or exclusivity.

| Exact Hudson original | Item | Original PNG SHA-256 |
| --- | --- | --- |
| `ccb25e5e-239c-4194-b1e7-23d913641f44.png` | Sword | `eff1393d4ae5787c237965a6cca5f7c402ab064b3aafd7bbac6e0c6f4576a3d3` |
| `1df90978-1cde-4080-8bba-dc25fd86b9df.png` | Shield | `ff71f02557c909086a010a1f8b045d95ffd10d9e2039c9442d780d577234943a` |
| `2e7522e3-4f93-40d6-84c6-5e6cfbbce96c.png` | Meteor Shower | `8dd0c069a6f118507d7bc0ba8736e33a4f633aa4550ae387e90d3729586178a8` |

Hudson masters are lossless WebP with original decoded RGB pixels; runtime files
are proportional 512×512 Lanczos resizes encoded losslessly. No repaint, recolor,
filter, border, padding or substitute. Other equipment masters are 1024² and
runtime 512² WebP; Land masters 1536×1024 and runtime 768×512. Original source
dimensions/hashes are retained in the manifest. Runtime uses the existing compact
shared frames and proportional `cover`, without tint/filter or atlas offsets.

Availability is not approval. `status: prepared`, missing framing approval and
missing final approval deliberately block cutover. The [style review](../ART_DIRECTION_REVIEW.md)
documents why the current ordinary-equipment drafts need selective revision.
Do not label this inventory approved, or promote the rejected studies. A later
reviewed immutable art version must bind final approved bytes before activation.

`scripts/package-level100-art.py --previews-only` refreshes contact sheets without
changing any game asset. `--from-masters` is a deliberate packaging operation and
must not be used to silently replace reviewed bytes. Browser/asset tests verify
hashes, mapped IDs, proportional rendering and solid-black edge-strip absence;
owner visual review remains necessary for composition, aesthetic quality and rights.
