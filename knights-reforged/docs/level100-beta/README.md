# Final level-100 functional beta preparation

This follows merged PR #35 (`e61258c`). It adds a dormant equipment **presentation**
policy, not another balance/catalog rewrite. No new images, numerical changes,
new bot identities, migrations, protected-release changes or production writes.
Strict schema remains `025_level100_population.sql`.

## Implemented

- All **99 exact equipment slots** map through immutable
  `level100-equipment-presentation-1`: original names, IDs, unlocks and numerical
  definitions remain installed unchanged. See [three complete progression tables](EQUIPMENT_PROGRESSION.md)
  and [machine-readable mapping](equipment-mapping.json).
- Runescar Saber (real level 12), Verdant Aegis (10) and Silverroot Ward (10)
  remain earlier anchors. Existing level-80 slots adopt Stormglass Pike,
  Argent Sentinel Plate and Runic Convergence. Intervening slots have regional
  identities; no invented extra records or arbitrary prices.
- Astral identities occupy selected level-80 slots, Ash/Seraphic/Sovereign
  identities selected level-90 slots, and Eclipse Greatsword / Citadel Plate /
  Invocation level-100 slots. Their **existing approved** artwork is reused
  byte-for-byte; no escalation above current level-50 visual prestige.
- Lower early progression is largely unchanged. Retained legacy slots at
  28–50 use grounded names and temporary icons, preserving every earned item.
  New regional middle tiers use the same five lightweight beta assets from PR #35.
  Placeholders intentionally cannot demonstrate distinct final silhouettes;
  per-slot future briefs record that outstanding art work.
- Six approved cultures are explicitly mapped to existing E2b region IDs.
  Current quest-region descriptions show culture without changing titles, area
  references, prerequisites, saved cursors or eligibility.
- Shared rendering covers Armory, self/public Profiles, inventory, requirements,
  unlock previews and new receipts/reports. New battle selection snapshots and
  equipment purchase receipts record the exact presentation ID and displayed name.
  Historical reports/receipts retain recorded identities and original artwork
  when no presentation snapshot exists. No stored history is updated.
- Installation registers one immutable ruleset only. No remap is applied until
  the exact reviewed expansion cutover. The plan defaults `presentationReviewed`
  false and pins ID/digest; missing, string, unknown and mismatched approvals fail.
  Immutable activation-event evidence is checked on realm-policy reads.
  All original beta artwork, capital, population, recovery, XP and owner gates remain.

## Review evidence

[Preservation and verification](PRESERVATION.md) · [finance, rarity and current storage](FINANCE_STORAGE_RARITY.md)
· [exact future activation sequence](ACTIVATION.md) · [browser assertions](screenshots/verification.json).

The following screenshots are actual HTTP rendering against disposable PostgreSQL,
not concepts. Each width also includes armor, spells, current/public Profiles,
quests, receipts, new battles and historical battles in [screenshots](screenshots/).

| Width | Original weapon slots | Remapped same slots | Legendary upper ladder |
|---|---|---|---|
| 320 | [Before](screenshots/320-before-weapon.jpg) | [After](screenshots/320-after-weapon.jpg) | [80–100](screenshots/320-endgame-weapon.jpg) |
| 390 | [Before](screenshots/390-before-weapon.jpg) | [After](screenshots/390-after-weapon.jpg) | [80–100](screenshots/390-endgame-weapon.jpg) |
| 430 | [Before](screenshots/430-before-weapon.jpg) | [After](screenshots/430-after-weapon.jpg) | [80–100](screenshots/430-endgame-weapon.jpg) |
| 1024 | [Before](screenshots/1024-before-weapon.jpg) | [After](screenshots/1024-after-weapon.jpg) | [80–100](screenshots/1024-endgame-weapon.jpg) |

[Side by side: weapons](screenshots/compare-390-weapon.webp) · [armor](screenshots/compare-390-armor.webp) · [spells](screenshots/compare-390-spell.webp). These compare the same authoritative slots at 390×844, with labels added outside the captures.

## Inactive / owner decisions

The presentation, 5× capacity, XP epoch cutover, new content, publication of new
450 bots and autonomy remain inactive on installation. Capital **3,701,553,498**
Gold-equivalent and new-cohort economic policies remain pending. Proposed rare
probability remains pending; launch with `rareDrops=false`. Hudson's exact
15/15/15 grant remains separately authorized and unexecuted. Current source and
recovery storage must pass fresh private inventory/headroom checks before release
and again before population/autonomy. Final bespoke artwork and physical-device
verification remain later work; they do not turn temporary icons into final art.

No production deployment, activation, grant, provisioning or merge performed.
