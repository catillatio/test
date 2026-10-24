# Proposed 51–100 catalog and retained-content plan

**Every entry below is an uninstalled proposal.** The authoritative existing 60 equipment definitions, 40 quests and 21 properties remain unchanged at `7cf9a3a48284c96afe922b3473cce429339bd7e4`. [Complete typed-field JSON](docs/level100-e1/proposed-content.json) has `researchOnly:true`, `installed:false`; it is outside `rulesets/` and is never loaded by the game. No art is generated or adopted.

Candidate keys use `proposal-` to prevent confusing them with installed IDs. Freeze final production IDs and all cross-references in the approved implementation manifest before the first save; a checked mechanical removal of that prefix is possible because no candidate has production records. Never rename an existing stable ID.

## Regions

| Candidate region ID | Name | Unlock | Through |
|---|---|---|---|
| proposal-iron-marches | The Iron Marches | 51 | 59 |
| proposal-crown-frontier | The Crown Frontier | 60 | 69 |
| proposal-warring-kingdoms | The Warring Kingdoms | 70 | 79 |
| proposal-imperial-sieges | The Imperial Sieges | 80 | 89 |
| proposal-ashen-crown | The Ashen Crown | 90 | 95 |
| proposal-eclipse-reach | The Eclipse Reach | 96 | 100 |


The first four emphasize troops, frontiers, fortified roads, royal hosts, siege lines and kingdoms. The last two concentrate the rare Ash/Eclipse fantasy identity. This is ordinary repeatable quest content in the existing loop, not another gameplay system.

## Classic prestige purchase retiering and compatibility mirrors

Recommended future purchase unlocks:

| Existing stable ID | Current unlock | Proposed purchase unlock | Owned stats/use/cost/history |
|---|---|---|---|
| astral-conductor | 40 | 80 | unchanged |
| astral-archon-robes | 40 | 80 | unchanged |
| astral-tempest | 40 | 80 | unchanged |
| crown-of-ash-blade | 45 | 90 | unchanged |
| eclipse-greatsword | 50 | 100 | unchanged |
| eclipse-citadel-plate | 50 | 100 | unchanged |
| eclipse-invocation | 50 | 100 | unchanged |


Do **not** edit `alpha-0.3`, rewrite old inventories or require a new level to use already-owned gear. Current selection is ownership-based and has no item-level check; preserve that behavior. Separate future purchase unlock policy from owned use. Already-owned quantities, FIFO costs, upkeep, saved battle selections, artwork and historic receipts remain authoritative.

To retain grounded progression and avoid breaking original level-40/45/50 quest requirements, propose these seven numerical-equivalent new items:

| Classic requirement / equivalent | Candidate new ID | Grounded display name | Unlock | Gold | A/D | Upkeep/h |
|---|---|---|---|---|---|---|
| astral-conductor | proposal-banner-marshals-sceptre | Banner Marshals Sceptre | 40 | 5,700 | 74/54 | 42 |
| astral-archon-robes | proposal-high-marshal-mail | High Marshal Mail | 40 | 5,300 | 34/72 | 42 |
| astral-tempest | proposal-royal-battle-invocation | Royal Battle Invocation | 40 | 5,000 | 67/48 | 42 |
| crown-of-ash-blade | proposal-crownforged-greatblade | Crownforged Greatblade | 45 | 7,200 | 95/44 | 50 |
| eclipse-greatsword | proposal-imperial-steel-greatsword | Imperial Steel Greatsword | 50 | 9,000 | 110/50 | 60 |
| eclipse-citadel-plate | proposal-imperial-citadel-plate | Imperial Citadel Plate | 50 | 8,800 | 32/106 | 60 |
| eclipse-invocation | proposal-royal-war-invocation | Royal War Invocation | 50 | 8,600 | 92/60 | 60 |


An old quest requiring a moved classic may use actual copies from either reviewed equivalent, without double-counting the same copies across requirements. Existing classic owners do not rebuy; a new player buys the reachable grounded item. Server-side missing-item quotes/validation must resolve the pair; clients cannot choose arbitrary substitutes. Keep old quest IDs, progress, loot keys and completed receipts. This is compatibility between ordinary catalog items, not manual loadouts or enhancement.

Retiering alone does not make a classic item best-in-slot. With its original stats and inexpensive price preserved, it becomes a cost-efficient, visually prestigious alternative; several new grounded or legendary items are stronger. If every classic must instead be a numerical capstone at its new unlock, this recommendation needs a separately reviewed versioned stat/value design. Do not quietly buff existing owned gear or claim that moving its level changes its power.

Alternative owner decision: retain every old purchase level and add only new prestige variants. That is simpler, but some new intermediate items then compete with cheap old legendary items and the desired visual hierarchy is weaker. It needs its own value audit; do not silently switch between alternatives in implementation.

## New upper-tier equipment — proposed numbers

| Candidate ID | Name | Level | Category / role | Price | Attack | Defense | Upkeep/h |
|---|---|---|---|---|---|---|---|
| proposal-marcher-greatsword | Marcher Greatsword | 51 | weapon/offense | 7,500 | 115 | 36 | 43 |
| proposal-fortress-glaive | Fortress Glaive | 51 | weapon/defense | 7,000 | 54 | 65 | 38 |
| proposal-captains-brigandine | Captain's Brigandine | 51 | armor/offense | 7,400 | 46 | 78 | 45 |
| proposal-siegeguard-plate | Siegeguard Plate | 51 | armor/defense | 8,200 | 24 | 116 | 45 |
| proposal-battlebrand | Battlebrand | 51 | spell/offense | 7,600 | 98 | 44 | 44 |
| proposal-rampart-ward | Rampart Ward | 51 | spell/defense | 7,400 | 38 | 92 | 43 |
| proposal-royal-warblade | Royal Warblade | 60 | weapon/offense | 10,500 | 128 | 44 | 54 |
| proposal-guard-captains-halberd | Guard-Captain's Halberd | 60 | weapon/defense | 9,800 | 62 | 80 | 48 |
| proposal-kings-marshal-harness | King's Marshal Harness | 60 | armor/offense | 10,200 | 54 | 94 | 55 |
| proposal-citadel-harness | Citadel Harness | 60 | armor/defense | 11,500 | 29 | 134 | 56 |
| proposal-banner-of-embers | Banner of Embers | 60 | spell/offense | 10,800 | 110 | 52 | 53 |
| proposal-stonewall-oath | Stonewall Oath | 60 | spell/defense | 10,000 | 44 | 108 | 50 |
| proposal-sovereigns-zweihander | Sovereign's Zweihander | 70 | weapon/offense | 15,500 | 140 | 52 | 69 |
| proposal-march-wardens-poleaxe | March Warden's Poleaxe | 70 | weapon/defense | 14,500 | 72 | 96 | 62 |
| proposal-ducal-warplate | Ducal Warplate | 70 | armor/offense | 15,000 | 63 | 110 | 70 |
| proposal-fortress-bastion-plate | Fortress Bastion Plate | 70 | armor/defense | 17,000 | 35 | 153 | 73 |
| proposal-royal-battlefire | Royal Battlefire | 70 | spell/offense | 15,800 | 124 | 66 | 67 |
| proposal-ironwall-covenant | Ironwall Covenant | 70 | spell/defense | 14,800 | 51 | 125 | 65 |
| proposal-imperial-greatblade | Imperial Greatblade | 80 | weapon/offense | 23,000 | 148 | 62 | 85 |
| proposal-high-castellans-hammer | High Castellan's Hammer | 80 | weapon/defense | 21,000 | 81 | 113 | 76 |
| proposal-imperial-assault-harness | Imperial Assault Harness | 80 | armor/offense | 22,000 | 72 | 126 | 87 |
| proposal-crownwall-bastion-plate | Crownwall Bastion Plate | 80 | armor/defense | 25,500 | 42 | 171 | 91 |
| proposal-astral-siegefire | Astral Siegefire | 80 | spell/offense | 23,500 | 140 | 80 | 83 |
| proposal-sanctuary-of-banners | Sanctuary of Banners | 80 | spell/defense | 21,800 | 58 | 141 | 80 |
| proposal-ash-crowned-warblade | Ash-Crowned Warblade | 90 | weapon/offense | 34,000 | 159 | 72 | 103 |
| proposal-throneguard-polehammer | Throneguard Polehammer | 90 | weapon/defense | 31,000 | 90 | 131 | 92 |
| proposal-ashen-marshal-harness | Ashen Marshal Harness | 90 | armor/offense | 33,000 | 81 | 140 | 101 |
| proposal-sovereigns-war-bastion | Sovereign's War Bastion | 90 | armor/defense | 36,500 | 48 | 189 | 108 |
| proposal-ashen-coronation | Ashen Coronation | 90 | spell/offense | 34,500 | 156 | 95 | 98 |
| proposal-crown-of-wards | Crown of Wards | 90 | spell/defense | 31,800 | 65 | 156 | 93 |
| proposal-imperial-eclipse-greatsword | Imperial Eclipse Greatsword | 100 | weapon/offense | 48,000 | 180 | 82 | 120 |
| proposal-eclipse-gatehammer | Eclipse Gatehammer | 100 | weapon/defense | 44,000 | 98 | 150 | 110 |
| proposal-eclipse-war-marshal-plate | Eclipse War-Marshal Plate | 100 | armor/offense | 45,000 | 90 | 155 | 115 |
| proposal-imperial-eclipse-bastion | Imperial Eclipse Bastion | 100 | armor/defense | 50,000 | 55 | 205 | 125 |
| proposal-astral-war-invocation | Astral War Invocation | 100 | spell/offense | 46,000 | 165 | 110 | 110 |
| proposal-eclipse-aegis | Eclipse Aegis | 100 | spell/defense | 44,000 | 72 | 170 | 105 |


Offense and defense have different useful choices, costs and silhouettes. Balanced ownership is expensive because both sets accrue upkeep. Upper stats are roughly incremental, not exponential. The level-51 offense weapons/spells deliberately clear the existing level-50 numerical anchor so the first new tier is meaningful even for grandfathered classic owners.

## New quests

Each region's first quest grants its existing-style, nonconsumable prerequisite proof on the first successful completion; later completions use the authored 25% chance. These are ordinary saved quest-loot flags like Eclipse Key, **not** a new spendable currency or crafting material. The first region uses the actual old `eclipse-key` prerequisite. Requirements stay owned; none are consumed.

| Candidate quest | Level | Mana | XP | Gold range | Actual army | Owned requirements | Required proof |
|---|---|---|---|---|---|---|---|
| proposal-scout-the-iron-marches | 51 | 14 | 250 | 2000–2600 | 25 | proposal-marcher-greatsword ×2, proposal-siegeguard-plate ×2, proposal-battlebrand ×1 | eclipse-key |
| proposal-break-the-border-siege | 55 | 14 | 275 | 2400–3120 | 27 | proposal-marcher-greatsword ×2, proposal-siegeguard-plate ×2, proposal-battlebrand ×1 | proposal-region-seal-0 |
| proposal-raise-the-marcher-standard | 59 | 15 | 300 | 2900–3770 | 29 | proposal-marcher-greatsword ×2, proposal-siegeguard-plate ×2, proposal-battlebrand ×1 | proposal-region-seal-0 |
| proposal-secure-the-kings-road | 60 | 15 | 310 | 3300–4290 | 35 | proposal-royal-warblade ×3, proposal-citadel-harness ×3, proposal-banner-of-embers ×2 | proposal-region-seal-0 |
| proposal-defend-the-frontier-keep | 64 | 15 | 335 | 3900–5070 | 37 | proposal-royal-warblade ×3, proposal-citadel-harness ×3, proposal-banner-of-embers ×2 | proposal-region-seal-1 |
| proposal-unite-the-border-garrisons | 69 | 16 | 365 | 4600–5980 | 39 | proposal-royal-warblade ×3, proposal-citadel-harness ×3, proposal-banner-of-embers ×2 | proposal-region-seal-1 |
| proposal-escort-the-royal-host | 70 | 16 | 380 | 5500–7150 | 45 | proposal-sovereigns-zweihander ×5, proposal-fortress-bastion-plate ×4, proposal-royal-battlefire ×3 | proposal-region-seal-1 |
| proposal-storm-the-river-fortress | 74 | 17 | 410 | 6500–8450 | 47 | proposal-sovereigns-zweihander ×5, proposal-fortress-bastion-plate ×4, proposal-royal-battlefire ×3 | proposal-region-seal-2 |
| proposal-settle-the-war-of-crowns | 79 | 18 | 445 | 7600–9880 | 49 | proposal-sovereigns-zweihander ×5, proposal-fortress-bastion-plate ×4, proposal-royal-battlefire ×3 | proposal-region-seal-2 |
| proposal-build-the-siege-lines | 80 | 18 | 460 | 8800–11440 | 55 | proposal-imperial-greatblade ×7, proposal-crownwall-bastion-plate ×5, proposal-astral-siegefire ×3 | proposal-region-seal-2 |
| proposal-breach-the-imperial-walls | 84 | 18 | 490 | 10200–13260 | 57 | proposal-imperial-greatblade ×7, proposal-crownwall-bastion-plate ×5, proposal-astral-siegefire ×3 | proposal-region-seal-3 |
| proposal-hold-the-crownwall | 89 | 19 | 525 | 11800–15340 | 59 | proposal-imperial-greatblade ×7, proposal-crownwall-bastion-plate ×5, proposal-astral-siegefire ×3 | proposal-region-seal-3 |
| proposal-defend-the-ashen-throne | 90 | 19 | 540 | 13600–17680 | 70 | proposal-ash-crowned-warblade ×8, proposal-sovereigns-war-bastion ×6, proposal-ashen-coronation ×4 | proposal-region-seal-3 |
| proposal-break-the-ember-host | 93 | 19 | 560 | 15100–19630 | 72 | proposal-ash-crowned-warblade ×8, proposal-sovereigns-war-bastion ×6, proposal-ashen-coronation ×4 | proposal-region-seal-4 |
| proposal-restore-the-crown | 95 | 20 | 580 | 16700–21710 | 74 | proposal-ash-crowned-warblade ×8, proposal-sovereigns-war-bastion ×6, proposal-ashen-coronation ×4 | proposal-region-seal-4 |
| proposal-cross-the-eclipse-reach | 96 | 20 | 590 | 18000–23400 | 90 | proposal-ash-crowned-warblade ×10, proposal-sovereigns-war-bastion ×8, proposal-ashen-coronation ×5 | proposal-region-seal-4 |
| proposal-hold-the-last-citadel | 98 | 20 | 605 | 20000–26000 | 92 | proposal-ash-crowned-warblade ×10, proposal-sovereigns-war-bastion ×8, proposal-ashen-coronation ×5 | proposal-region-seal-5 |
| proposal-defend-the-hundred-kingdoms | 100 | 20 | 625 | 22000–28600 | 94 | proposal-imperial-eclipse-greatsword ×10, proposal-imperial-eclipse-bastion ×8, proposal-astral-war-invocation ×5 | proposal-region-seal-5 |


All Mana costs fit the base 20-capacity resource; new army gates 25–94 require recruitment, not full 500-member saturation. The current validator's ≤21 quest-army bound and requirement unlock check must be updated deliberately in the future catalog loader/alias resolver. Existing quest rewards, requirements and mastery records are not rewritten here. First-guaranteed loot, idempotent completion and no-JavaScript command behavior remain the established implementation.

## New Land

| Candidate ID | Name | Level | Base price | Gross/h | Property upkeep/h | Net/h | First-copy payback |
|---|---|---|---|---|---|---|---|
| proposal-marcher-stronghold | Marcher Stronghold | 56 | 180,000 | 4,200 | 600 | 3,600 | 50.0h |
| proposal-royal-border-fortress | Royal Border Fortress | 60 | 300,000 | 6,000 | 900 | 5,100 | 58.8h |
| proposal-crown-river-port | Crown River Port | 70 | 500,000 | 9,000 | 1,400 | 7,600 | 65.8h |
| proposal-imperial-siegeworks | Imperial Siegeworks | 80 | 850,000 | 13,500 | 2,200 | 11,300 | 75.2h |
| proposal-sovereign-castle | Sovereign Castle | 90 | 1,400,000 | 19,000 | 3,200 | 15,800 | 88.6h |
| proposal-eclipse-crown-citadel | Eclipse Crown Citadel | 100 | 2,200,000 | 27,000 | 4,800 | 22,200 | 99.1h |


The first new property is level **56**, after the retained level-55 Worldroot Bastion, preserving a sensible income/unlock hierarchy. The other existing IDs/rates and all saved lots remain unchanged. Gold Mine keeps `moonwell-sanctuary`; Crown Harbour and Tempest Port keep their approved art. New purchases still use progressive 10% per-copy pricing, exact hourly/partial settlement, 100/type ownership and original saved rates thereafter. Bases require reviewed quote-validation changes; no price check is relaxed in E1.

## Artwork/asset implementation plan — no artwork today

- New weapons: distinct two-handed blades, poleaxes/hammers and command weapons recognizable at 76px; prestige comes from construction, silhouette and fittings. Limit glow to the few upper legendary families.
- New armor: readable offensive articulated harness versus broad defensive plate/shield silhouettes; credible metal, dark cloth and restrained bronze/gold.
- Magic: battle banners, wards and modest fire/stone motifs at 51–70; selective Astral/Ash/Eclipse compositions only at the top. No beginner spell or approved existing equipment image changes.
- Land: Marcher Stronghold = working stone frontier fort; Royal Border Fortress = larger defended approach; Crown River Port = inland merchant quays/custom houses, distinct from Tempest Port's sea gate; Imperial Siegeworks = grounded workshops/engines; Sovereign Castle = prestigious inhabited royal fortress; Eclipse Crown Citadel = exceptional upper-tier fortified skyline.
- Commission/document original project art or clearly redistributable licensed assets; maintain hashes, provenance, versioned per-ID mappings and owner auditions/previews before adoption. Do not reuse historical copyrighted game artwork.
- Permanent full-bleed composition: no artificial black mattes, side gutters, blur/mirror padding or distortion. Plan actual crops at 68×49, 80×58, 90×60, 198×116, Profile 60×60 and receipt 64×72; preserve architectural focal points and recognizable equipment silhouettes.

Forty-three new equipment assets (seven mirrors plus 36 upper items) and six property assets are the proposed future art budget. The existing eleven Phase 5.1B selections, Crown Harbour, all other art, and every current atlas/override remain untouched in E1. New assets and their redistribution rights remain a future approval dependency.
