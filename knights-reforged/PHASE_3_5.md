# Phase 3.5 — stabilization, fantasy progression and shared-interface refinement

Development branch: `feature/kingdoms-live-phase-3-5-alpha`. Base: `feature/kingdoms-live-phase-3-alpha` at `d17def53469630d6756659da4bed36f639cd82f9`. Main, Land, visual-overhaul and Phase 3 branches are not merged or rewritten.

This phase retains Fastify, PostgreSQL, server-rendered EJS, the five original-style tabs, existing account sessions and authoritative gameplay commands. It expands the content and fixes accounting/session issues without resetting a realm. Active catalog: `alpha-0.2`; all earlier catalog JSON and migrations 001–005 remain unchanged.

## Codespaces session failure

The failure was reproduced from the Phase 3 configuration path: ordinary `npm run dev`/compiled startup retained a copied `APP_ORIGIN=http://localhost:3000`, even when Codespaces supplied its HTTPS forwarding address. GET pages and persisted cookies worked, but the browser's authenticated form POSTs correctly failed the exact Origin check. The old preview helper handled the address separately, so different launch methods behaved differently. A loopback origin also selected non-Secure cookies despite the external HTTPS page.

`src/config.ts` now resolves the origin centrally:

- Validated, server-owned `CODESPACE_NAME`, `PORT` and `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN` produce the current canonical HTTPS origin. The domain defaults to `app.github.dev`.
- A copied loopback `.env`, an unset origin or a previous Codespace URL uses that current address. Explicit custom realm domains remain supported.
- Request `Host`, `Origin`, `Forwarded` and `X-Forwarded-*` headers never establish the allowed origin. Blanket proxy trust remains disabled. An HTTP backend behind TLS termination still issues Secure cookies based on its configured public origin.
- Constant-time CSRF validation, strict Origin comparison, Argon2id login, session rotation, HttpOnly/SameSite cookies and session expiry remain in place. Invalid tokens and foreign origins are rejected separately. Logout clears the cookie with matching flags and revokes the session.
- The preview helper and ordinary launch use the same configuration. Existing account/session rows do not need conversion or deletion; pre-fix non-Secure cookies still authenticate when sent over HTTPS, and the next login rotates to a Secure cookie.

`npm run test:codespaces` runs Chromium through a real local TLS reverse proxy. A CONNECT fixture maps one Codespaces-shaped standard HTTPS hostname exclusively to loopback, forwards HTTPS headers to an HTTP Fastify backend and exercises native browser Origin/cookie behavior. Existing accounts can quest, purchase equipment, buy/sell Land, battle, log out, log in and quest again. The fixture also verifies pre-fix cookies, revoked sessions, forged Origin/forwarded headers and bad CSRF tokens. It contacts neither GitHub's ingress nor a historical game server.

The user's live Codespace was not accessed. Its provider login/access policy and physical Android behavior remain deployment checks, despite this executable reproduction of the relevant HTTPS environment.

## Content and progression

| Catalog | Phase 3 | Phase 3.5 |
| --- | ---: | ---: |
| Weapons | 5 | 20 |
| Armor | 4 | 20 |
| Spells | 4 | 20 |
| Properties | 5 | 21 |
| Repeatable quests | 8 | 40 |
| Quest regions | 2 | 11 |
| Persistent discoveries | 1 | 12 |

All 13 existing equipment entries, five properties and eight quests retain their gameplay fields and IDs. New metadata adds tier names and illustration assignments. Old holdings retain saved prices, rates, versions and clocks. The expanded catalog is a new immutable version; migration/startup rejects changes to any already installed definition.

| Progression | Content direction |
| --- | --- |
| Levels 1–7 | Spears, swords, leather/padded armor, shields, simple wards; fields, woodland, workshops and mills |
| Levels 8–14 | Runic steel, enchanted bows, hauberks and protective magic; Runewood discoveries, estates and mines |
| Levels 15–23 | Stormglass, frostweave, elemental bulwarks and moon magic; the Cinder Peaks and Moonlit Coast |
| Levels 24–35 | Oathbound steel, bone magic, celestial plate and dawn spells; citadels, academies and cathedrals |
| Levels 36–44 | Dragon-forged and astral equipment; Dragon Reach, magical keeps and observatories |
| Levels 45–50 | Crown-of-Ash, seraphic and eclipse artifacts; the Eclipse Crown and level-50 finale |
| Level 55 | Worldroot Bastion, a further property investment goal |

Regions are available through a compact expandable selector. The default shows nearby unlocked/upcoming regions; players can view all or select a region explicitly. Quests remain repeatable, use Mana and preserve prerequisite equipment. Later quests combine multiple copies, army participation and persistent discoveries. The finale requires 18 participants, three equipment categories and the Eclipse Key from Hold the Last Meridian. Unlock text identifies the actual required discovery rather than hardcoding the early Watchtower Map.

The XP curve, starting 100 Health/20 Mana/3 Spirit/60 gold, recovery intervals, capacity limits, skill costs and level refills are unchanged. A new character needs 43,750 lifetime XP to reach level 50. Level 50 then needs 2,000 XP for its next level. No existing level or XP total is recomputed.

Level milestones grant 1 point at levels 5, 10, 20 and 30, then 2 at levels 40 and 50. The previous level-5 ID is reused so it cannot pay twice. Ten quests and the first initiated victory retain their existing rewards. Migration grants only newly eligible milestone entitlements; spent points stay spent.

Quest costs range from 2 to 13 Mana. No quest requires a Mana-capacity build merely to attempt it. Every level through 50 has reachable repeatable content and each story gate has a reachable, acyclic discovery source. Paid militia alone can meet quest participation requirements; real consenting allies still support the multiplayer army loop.

## Economy and combat balancing

The combat model, rival eligibility, health damage, Spirit costs, cooldown, zero-sum gold transfers and repeat-target reward caps are unchanged. Equipment is limited by owned quantities and participating army members. Attack and defense still select separately; lower-level defensive or offensive specialists can remain useful after a higher-level unlock. All owned maintained copies contribute to upkeep, including unused reserves of equipment.

Equipment strength rises gradually, with a catalog maximum of 110 Attack and 106 Defense per item. Fixed participation caps prevent an unlimited stack of unused gear from contributing. For one fully equipped participant, the best available attacking combination has these illustrative budgets; these exclude character/militia base stats:

| Level | Equipment Attack / Defense | Purchase cost | Equipment upkeep/hour |
| --- | --- | ---: | ---: |
| 1 | 11 / 5 | 66 | 0 |
| 10 | 53 / 38 | 660 | 12 |
| 20 | 97 / 65 | 2,770 | 33 |
| 30 | 147 / 86 | 7,250 | 72 |
| 40 | 183 / 131 | 13,600 | 114 |
| 50 | 242 / 194 | 25,400 | 174 |

Defensive selection differs: at level 50 its available per-member combination provides 171 Attack/233 Defense, costs 22,000 and maintains at 156/hour. These are arithmetic examples, not recovered original stats or a claim that competitive balance is finished.

Properties retain 10% successive same-type price scaling, 100/type ownership and 25-unit bulk limits. New properties extend from Copper Workshop (160 gold, 22 net/hour before equipment) to Eclipse Citadel (120,000; 3,100 gross, 500 property upkeep) and Worldroot Bastion (140,000; 3,400 gross, 600 property upkeep). Higher new tiers generally lengthen first-unit payback from about 7.3 to 50 hours; old property contracts are untouched. Additional same-type units cost more without multiplying their individual income, encouraging varied investment.

Wallet limits and retained treasury remain unchanged. Every permitted individual property quote fits the carried-gold limit. A bulk quote above it returns a validated transaction error rather than PostgreSQL integer overflow. Rewards, sales and income still retain excess credit durably.

Purchases do not require passive income. The safe maintenance policy remains: due Land receipts and available reserve/wallet fund maintenance; a shortfall suspends paid-upkeep gear, caps arrears at one hourly bill, waives the rest and stops further charges until resumed. Zero-upkeep gear stays usable. Resuming funds arrears plus one hourly reserve. No inventory is destroyed. Partial sales now immediately return reserve above the new hourly bill, preventing a large old reserve being trapped behind one cheap remaining item. Historical arrears are preserved.

Two accounting fixes are covered by regressions:

1. Distinct instantaneous funding actions can share a timestamp. Funding is unique by character/command ID; accrual remains unique by character/time period. A retry cannot fund twice.
2. Same-instant Land bulk contracts receive a durable purchase sequence for FIFO resale. Historical ties are backfilled in their previous acquired-at/ID order. Their prices, quantities, acquired times and income cursors are not changed. New bulk units sell in actual acquisition order rather than random UUID order.

`npm run balance:report` produces all quest efficiencies, property paybacks, directional loadout budgets and extreme-cap arithmetic. At all property caps, acquisition spend is 74,420,242,336 gold, gross income 1,907,900/hour and property upkeep 299,000/hour. Owning 1,000 copies of every item would add 1,063,000/hour upkeep. These remote bounds expose the economy for review; they do not establish a healthy mature economy. Long idle accumulation, late-game military costs and alternate-account farming require human closed-alpha observation before a wider release. Further balance changes must use another catalog version.

## Profile and net hourly gold

The top-right link is now Profile. Logout is a CSRF-protected form in Profile's Account section. Profile includes Info/Skills/Loot/Account anchors, character identity and level, XP to next level, quest/experience/win/loss statistics, Gold Flow, participating army, quantity-based loadouts, skill allocation and the existing cosmetic calling selection.

The layout follows the preserved original recording's Info/Skills structure, two-column statistics and Gold Flow block. No new profile screenshot was accessible with this request, so an exact match to that missing attachment is not claimed. No kills, comments, premium features or untracked statistics were invented. The recovered app portrait icon is reused.

Every state response now has an authoritative `economy` projection:

`netHourlyIncome = saved gross Land income - saved property upkeep - active equipment upkeep - other implemented upkeep`

Other recurring upkeep is currently zero. Active equipment upkeep is zero while maintenance is paused; the scheduled bill remains separately available. One-time gold rewards, purchases, sales and battle transfers are excluded. The resource header displays signed, grouped gold/hour in muted green, red or neutral text. Land and Profile use the same actual projection. Client code formats the server value and refreshes it; it never computes income eligibility or creates payments.

For compatibility, the older `state.land.netHourlyIncome` and `state.land.equipmentUpkeep` fields retain their nominal-rate semantics. New UI code and `/api/v1/land` use `economy`; its full state is also returned. Income remains discrete completed-hour payments per purchase phase, so the header is a rate, not a promise of continuously increasing wallet gold.

## Visual assets and performance

The original recovered five-tab icons/selected states, 50px tab content, safe-area padding, navigation gradients and dark screen backgrounds are preserved byte for byte. Armory and Land retain compact illustrated rows, ownership counts, quantity inputs, classic buttons and their original form actions/CSRF/command fields.

Four original Knights Reforged illustration sheets were actually generated with `image_gen.imagegen`: Weapons, Armor, Spells and Properties. They provide 81 assigned, distinct paintings plus three spare property vignettes. Grounded iron/leather develops into runic, elemental, dragon, astral and eclipse imagery in a coherent painted medieval style. These are new illustrations, not recovered Storm8 artwork.

Runtime assets in `public/art/fantasy-0.2/`:

| Sheet | Dimensions | Bytes |
| --- | --- | ---: |
| Weapons | 960 × 1,200 | 156,344 |
| Armor | 960 × 1,200 | 296,830 |
| Spells | 960 × 1,200 | 348,390 |
| Properties | 960 × 1,440 | 487,488 |
| Total | Four requests, cached and reused | 1,289,052 |

WebP encoding uses FFmpeg at quality 84. No game-time image generation, external image host or per-item fetch is required. Shared EJS/CSS selects each painting, including miniature quest requirements. Observed uneven generated row boundaries are mapped explicitly in CSS so adjacent scenes do not bleed into an item's cell. The original PNGs remain unchanged in the cloud workspace; portable runtime WebPs, all prompts, mappings and SHA-256 provenance are included in Git. The old SVG placeholders also remain available.

Changed browser scripts and the refinement stylesheet include the active catalog version in their URL. A player returning with Phase 3 files in the one-hour static cache therefore loads the new actual-net-income client immediately after upgrading.

## Migration and preservation

Run `npm run db:migrate` with the current database connection after stopping the old server and taking a backup. Do not reset, reseed, overwrite `.env`, delete a database/volume or run downgrade SQL.

- `006_fantasy_progression.sql`: additive history-query indexes. The migration runner registers immutable `alpha-0.2` and grants only missing milestone entitlements.
- `007_maintenance_event_identity.sql`: replaces the overly broad funding timestamp uniqueness rule with separate accrual-period and funding-command identities; all event rows remain.
- `008_land_purchase_order.sql`: additive acquisition order with historical tie order preserved; clocks, costs and holdings remain intact.

Both migration and runtime startup validate every installed catalog against its immutable file. Migration is transactional under the existing advisory lock. Re-running it does not regrant spent milestones. The server refuses startup before the new schema head is installed.

The populated Phase 3 fixture checks accounts/password hashes, sessions/CSRF, character IDs/XP/levels/capacities/resources, wallet/retained balances, inventory/recorded costs, old slots, army links, Land phases/rates/sales/settlements, skill history, quest runs/loot, all economy/maintenance journals, old receipts and battle snapshots. Only entitled unspent milestone points and the new acquisition-order field differ. An old receipt replays its saved outcome; an old authenticated session still opens Profile. Old `alpha-0.1` scaled battle reports retain their original formatting under the new active catalog. Earlier prototype-to-alpha migration regressions also remain.

## Verification and limits

Executed commands, environment versions and results are recorded in [PHASE_3_5_VERIFICATION.json](PHASE_3_5_VERIFICATION.json). The suite includes real PostgreSQL migrations, concurrency/retry/rollback, recovery, inventory costs, active maintenance suspension/resumption, income boundaries, new tier purchases/sales, quest gates, persistent reports and both populated upgrade paths. Production EJS renders, local imports/routes/assets, artwork hashes and original navigation are checked separately.

The no-grant progression test starts a normal 60-gold character and uses actual HTTP gameplay commands with real PostgreSQL. A test-only adapter advances the server's explicit clock read; there is no production time-control flag, endpoint or timestamp rewrite. It purchases requirements, recruits militia, earns all XP/gold, invests in properties and reaches level 50's finale across all eleven regions. The run takes roughly 421 quest completions and seven simulated days, varying with randomized gold. This is accelerated mechanical reachability, not seven days of human testing or proof of session duration. Level refills and early free/cheap equipment preserve immediate first-session goals.

Chromium checks cover the full early loop with two ordinary accounts and a no-JavaScript quest, plus qualified late-game fixtures at 330, 360, 390 and 1366px. All 81 artwork cells load distinctly; profiles, quantity trades, level-50 properties/finale, gated level-55 investment, skills, PvP/reports, logout and maximum-wallet header layout are exercised. Representative screenshots are in [the new gallery](docs/phase-3-5-preview/README.md).

Remaining alpha limitations:

- Physical Android Chrome/WebView and the user's live Codespaces ingress/private-login boundary still need confirmation. Headless phone viewports are not device tests. No native APK was built.
- Human 10–20 minute pacing, long-term inflation, build balance, accessibility across devices and hostile-load/multi-account abuse need playtesting. The anti-farming cap is unchanged and is not a full abuse-prevention system.
- PvP retains the Phase 3 gold/XP reward caps. Its late-game incentives need review alongside the larger quest rewards before claiming balanced competitive progression.
- Content ends at the level-50 quest finale, with one extra property goal at 55. Progression is not capped, so later repeatable play can continue but has no new quest tiers.
- Callings remain cosmetic. Bank/Hospital, Bounties, account recovery, comments and leaderboards remain deferred. No unrelated systems were introduced.
- Container images and paid/public hosting were not built or deployed. No legacy game server was contacted.

For exact update and test commands, use [README](README.md#launch-in-an-existing-codespace) and [DEPLOYMENT](DEPLOYMENT.md).
