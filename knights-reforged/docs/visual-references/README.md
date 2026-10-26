# Kingdom Come visual references

65 user-supplied screenshots, preserved byte for byte with original filenames, dimensions, encoding, and embedded content. This documentation collection supports comparison of compact layouts, navigation, equipment presentation, profiles, quests, PvP, bounties, income, and social interaction.

## Evidence boundaries

`historical/kingdoms-live/` and `historical/knights-reforged/` contain historical game references, not Kingdom Come gameplay requirements. The older unbranded captures are grouped with Knights Reforged because their interface matches the explicitly titled Knights Reforged series; their exact source is not independently verified. Per-image attribution notes are in the categorized index. Kingdoms Live captures form a separate interface series.

`current-captures/kingdom-come/armory/` contains newer Kingdom Come armory captures plus one captured art discussion. These are dated visual evidence only, not proof of the deployed application, approved artwork, or gameplay policy. Do not import screenshots into application assets or infer formulas, prices, limits, equipment statistics, or permissions from them.

Current gameplay authority remains the repository's reviewed implementation, immutable rulesets, approved decisions, and independently verified deployment state. Nothing in this collection changes those sources.

## Preserved source documents

- [Master context](kingdom_come_master_context.md): original October 26, 2026 project snapshot, preserved unchanged; operational and gameplay statements may become stale and require verification.
- [Original image index](IMAGE_INDEX.csv): unchanged filename-only index; resolve each filename through the categorized index.
- [Original archive README](VISUAL_REFERENCE_README.md): unchanged supplied interpretation, retained as source context rather than new rule approval.
- [Categorized image index](CATEGORIZED_IMAGE_INDEX.csv): all 65 filenames, locations, categories, dimensions, byte counts, SHA-256 and Git blob hashes, with attribution notes.
- [Integrity manifest](INTEGRITY_MANIFEST.json): source ZIP hash, image inventory and preserved-document checksums. Identical source files under different filenames remain separate entries; none were deduplicated or omitted.

## Browse by game and topic

| Reference series | Topic | Images |
| --- | --- | ---: |
| kingdom-come | [Armory](current-captures/kingdom-come/armory/) | 5 |
| kingdoms-live | [Armory](historical/kingdoms-live/armory/) | 2 |
| kingdoms-live | [Land](historical/kingdoms-live/land/) | 1 |
| kingdoms-live | [Pvp](historical/kingdoms-live/pvp/) | 1 |
| kingdoms-live | [Quests](historical/kingdoms-live/quests/) | 1 |
| knights-reforged | [Bounties](historical/knights-reforged/bounties/) | 14 |
| knights-reforged | [Home](historical/knights-reforged/home/) | 6 |
| knights-reforged | [Land](historical/knights-reforged/land/) | 2 |
| knights-reforged | [Profiles](historical/knights-reforged/profiles/) | 18 |
| knights-reforged | [Pvp](historical/knights-reforged/pvp/) | 6 |
| knights-reforged | [Quests](historical/knights-reforged/quests/) | 1 |
| knights-reforged | [Skills](historical/knights-reforged/skills/) | 3 |
| knights-reforged | [Social](historical/knights-reforged/social/) | 5 |

## Verification

The archive CRC check, decoding of all 65 images, exact extracted-byte comparisons, and source-document comparisons passed before upload. Every uploaded Git blob must match the locally calculated Git blob SHA; the final committed tree must contain all 65 expected screenshot paths with those hashes and sizes. The manifest provides SHA-256 values for independent checks after checkout.

Changes are confined to this documentation directory. No application code, live assets, rulesets, production configuration, merge, or deployment is part of this archive import.

## Historical bounty and skills addendum

[Browse the addendum](historical/knights-reforged/bounty-addendum/README.md), including the original historical mechanics document, original image manifest, and 21 unchanged screenshots. These record testimony and future proposals; this import does not approve or implement those proposals. The original 65-image inventory remains unchanged. Combined: **86 image file entries, 74 distinct filenames**; 12 screenshots recur in both packages and are retained in each package's context.

[Combined archive manifest](COLLECTION_MANIFEST.json) records every imported source file, the two ZIP checksums, and exact-byte integrity values. The original master context and filename-only index remain unchanged.
