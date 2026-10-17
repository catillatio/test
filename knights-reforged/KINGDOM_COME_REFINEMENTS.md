# Kingdom Come — Phase 3.5 reference and playability refinements

The game is now **Kingdom Come**. This continues `feature/kingdoms-live-phase-3-5-alpha`; it does not create a merge into main or rewrite earlier commits. The prior Phase 3.5 implementation is preserved at `b19528d`.

Active UI titles, login branding, accessibility labels, footer, server banner, package/lock metadata, development labels and current run instructions use the new name. The repository remains `catillatio/test`, and the application stays in `knights-reforged/`. Database names/users/volumes, environment settings, cookie name, existing URLs and saved IDs stay compatible. Historical APK names, research, immutable catalog provenance, recorded generation prompts and earlier verification artifacts retain their truthful original names.

## Evidence and reconstruction

The [four new screenshots](original-reference/remake-2026-10-17/README.md) are preserved byte for byte with hashes. They are supplied later-remake evidence; the precise build/date are unknown.

| Detail | Evidence | Kingdom Come implementation |
| --- | --- | --- |
| Compact five bottom tabs and illustrated equipment rows | Original APK/screenshots/video and remake references | Existing recovered icons, selected states, gradients, safe areas and dark backgrounds retained. |
| Player/Skills/Battles navigation, compact stats and income sections | Directly visible in supplied remake references; preserved original video independently shows Info/Skills and Gold Flow | Three functioning server-rendered tabs: Player, Skills and Battles. The layout is adapted, not presented as an exact original screen. |
| Separate Attack/Defense Increase controls | Directly visible in `skills.png` | Persistent optional allocations added. Point costs, effect and cap are original provisional rules; the original formula remains unverified. |
| Kills/deaths and account age | Directly visible in remake Player screenshot | Account creation date comes from saved accounts. Kills/deaths count supported saved zero-Health outcomes. The zero-Health definition is reconstructed; the screenshot does not establish its formula. |
| Illustrated inventory with owned quantities | Visible in remake Player image and original Armory references | Weapons/Armor/Spells summaries use actual owned quantities and the existing fantasy illustrations. |
| Both armies' equipment participation | Visible in remake battle screenshot; original help independently supports quantity-limited automatic equipment | Saved attacking and defending quantities are illustrated. Current inventory is never substituted for historical usage. |
| Damage, gold, XP, victory and defeat | Visible in original/remake battle references | Each viewer sees their own damage dealt/received and signed gold/XP rewards from the saved result. |
| Charisma/Strength labels, very large armies, shown skill values and bounty payout | Visible remake examples | Not imported as original formulas, population limits or terminology. The approved Mana/Spirit roles and alpha participation cap remain. |
| Comments, reporting, blocking and bounties | Visible remake controls | Deferred. No fake forms, empty social tabs, invented payouts or unrelated backend systems added. |

## Character skills and balance

New immutable catalog `rulesets/alpha-0.3/rules.json` preserves **all 60 equipment items, 21 properties, 40 quests, XP curves, resource rules, combat reward/damage settings, economy and maintenance fields from alpha-0.2**. It adds a versioned `combatSkills` section. All earlier catalogs remain installed and unchanged.

- One unspent skill point adds one Attack or Defense training rating.
- Each rating adds 1% to the relevant army power, capped at 25 ratings/25% per attribute. Attack does not increase Defense, and Defense does not increase Attack.
- Power includes the existing character, participating army and quantity-selected equipment contributions. A rating applies to that total; it does not create copies, expand participation or make suspended equipment usable.
- Hundredth precision preserves small early-game gains: base Attack 5 becomes 5.05 at one rating. Combat stores rounded fixed-point power as before. Zero training preserves every previous integer power and roll result exactly.
- Max Health/Mana/Spirit costs and gained-capacity behavior are unchanged. No existing allocation is refunded, reassigned, filled or reinterpreted. Training defaults to zero; only an explicit validated action spends points.
- Both training dimensions together can consume 50 points. They compete with resource capacity, so players retain a meaningful build choice. The bounded effect avoids an unlimited percentage multiplier. Competitive balance still needs human playtests.

The existing character transaction/ordered lock protects allocations against simultaneous commands. Atomic point/cap checks and database constraints prevent overspending or exceeding 25. Identical UUID retries return their prior result; a different intent with the same UUID is rejected. Client-provided bonus amounts are ignored. New allocations record their immutable ruleset ID.

## Profile and combat presentation

**Player** shows character name, level/calling, joined date/account age, quests, experience, kills/deaths, wins/losses and actual Attack/Defense power. Its income section separates gross Land income, property upkeep, active equipment upkeep, total upkeep and net hourly rate. Paused equipment is excluded, and a link leads to Land's separate payment countdowns. One-time rewards remain outside hourly flow.

Weapons, Armor and Spells each have a compact illustrated ownership grid, names, quantities and links to their Armory category. A collapsed section preserves access to automatic attacking/defending loadouts and discoveries. The existing account/calling forms and CSRF-protected Sign Out remain accessible on every tab.

**Skills** has five validated Increase rows with descriptions and costs, remaining points, actual power effects and caps. **Battles** lists the character's private recent reports. Original routes and form actions remain. Tab selection is a whitelisted query parameter; forms and navigation work without JavaScript.

Reports show Your army/Their army from the authenticated viewer's perspective, resolved power, health, participation and saved training. Illustrated equipment figures use **recorded used quantities**, even if an item is later sold. Missing legacy metadata is explicitly marked unrecorded rather than invented. Canonical participant IDs come from the battle row for older results that omitted them. Reports remain private to the two participants and are never recalculated using current stats.

Kills/deaths derive from immutable battle rows and verified numeric zero-Health outcomes, including the pre-refill damage field when available. Unknown legacy Health does not count as zero. There is no permanent character death or inventory deletion; normal recovery continues. A retried attack cannot create another kill/death.

The new textured section headings are CSS. All 81 existing generated fantasy paintings and recovered navigation/background artwork are reused; no new generated artwork is claimed for this refinement. Current screenshots are in [the preview gallery](docs/phase-3-5-preview/README.md).

## Migration and verification

`009_combat_training.sql` adds zero-default Attack/Defense columns and their caps, extends the allowed allocation types, and adds a nullable allocation ruleset reference. Earlier allocation rows are left unchanged with unknown historical allocation ruleset IDs left null. Accounts, sessions, spent/unspent points, XP/levels, capacities, inventory costs, Land clocks/holdings, journal entries and existing battle records are preserved.

Migration/startup still enforce immutable catalogs. The server requires migration 009 before listening. Upgrades are transactional; repeated migration cannot regrant spent points. Keep the current `.env` and database, stop the old server, back up, then run `npm run db:migrate`. No reset or seed is required.

The regression suite includes:

- Original prototype and Phase 3 populated upgrades plus a populated Phase 3.5-to-training upgrade preserving Health/Mana/Spirit allocations and the old session.
- Zero-rating combat equivalence, small early bonuses, directional effects, the 25% cap, concurrent allocation, idempotent retries and rejected attribute manipulation.
- All three Profile tabs, recorded account age, owned quantities, true hourly flow, private history, zero-Health counters and immutable report art/counts after sales or further training.
- The entire original gameplay suite, normal first-session play, the no-grant level-50 path, offline income, economy concurrency, migration and build gates.
- Real local TLS/Codespaces-origin forms, including Attack allocation after login rotation; a compiled-process restart preserving training; desktop and narrow phone browser checks.

Current executed results are recorded in [KINGDOM_COME_PHASE_3_5_VERIFICATION.json](KINGDOM_COME_PHASE_3_5_VERIFICATION.json). Earlier `PHASE_3_5_VERIFICATION.json` remains the prior build's record.

Remaining target checks are physical Android and the user's live private Codespace ingress, human first-session/long-term economy and PvP balance, accessibility across devices, and abuse/load testing. No hosting deployment, public preview or branch merge is part of this work.
