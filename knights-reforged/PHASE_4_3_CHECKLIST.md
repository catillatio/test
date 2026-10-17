# Phase 4.3 acceptance checklist

This checklist maps the request to implementation and executable evidence. Final execution counts, failures/skips and environment limits are in [PHASE_4_3_VERIFICATION.json](PHASE_4_3_VERIFICATION.json). Detailed policy, formulas and update commands are in [PHASE_4_3.md](PHASE_4_3.md).

## All sixteen required sections

| # | Implemented requirement | Verification evidence |
| --- | --- | --- |
| 1 | Kills and Deaths derive only from the same successful bounty-claim journal; old knockout counters are archived safely | `bounties.test.ts`, `community-combat.test.ts`, `training.test.ts`, `phase43-migration.test.ts` |
| 2 | Every eligible human victory earns at least 1 XP, including defensive wins; difficulty scaling and transparent bot reduction | `phase43-economy.test.ts`, `strategy.test.ts`, `pvp-economy.test.ts`, saved reports and native HTTPS flow |
| 3 | Keyboard-free minus/value/plus and current total for Weapons, Armor, Spells and Land | `phase43-shopping.test.ts`, TLS browser native plus/minus purchases in every category, responsive layouts |
| 4 | Private durable receipts with same-item Buy More, updated gold/ownership and fresh action IDs | `phase43-shopping.test.ts`, native equipment/Land repeat purchases, five receipt viewport sizes |
| 5 | Real profile invitations retain consent and states; development bot invitations immediately accept with capacity and duplicate protection | `phase43-recruitment.test.ts`, native real profile invitation/acceptance and NPC auto-acceptance |
| 6 | 450 stable named NPCs, nine per level, legal equipment and armies no larger than ten | `fantasy-rivals.test.ts`, `strategy.test.ts`, `phase43-migration.test.ts`, deterministic catalog report |
| 7 | Every new baseline carries at least 2,500 gold, with level/tier/variant variation and protected Vault funds | `fantasy-rivals.test.ts`, deterministic catalog report, repeat-provision snapshots |
| 8 | Every NPC has at least three actual legal property plots; higher-level portfolios grow | All 450 blueprint/state checks in `fantasy-rivals.test.ts`, saved acquisition costs, public profiles |
| 9 | Actual bot hourly income and upkeep, offline catch-up and idempotent provision/settlement | `fantasy-rivals.test.ts`, `phase43-economy.test.ts`, provision snapshots and clone check |
| 10 | Reproduced 3,591/1,100/three-minute mechanism; shared persistent payment cycles, exact prorating, reserve-aware net and restart coverage | `phase43-economy.test.ts`, `integration.test.ts`, `fantasy-integration.test.ts`, compiled restart and native timer/credit checks |
| 11 | Home Bounty List shortcut removed, Battle/profile access retained | `phase43-shopping.test.ts`, navigation/static and responsive browser checks |
| 12 | Clear, tappable, expandable quest-region selector with selected label and chevron | Native selection/expanded-state tests, template/static checks and all viewport widths |
| 13 | Existing XP curve retained, representative rewards/pace documented through level 50 | `phase43-balance.ts`, `phase43-economy.test.ts`, existing full level-50 API playthrough |
| 14 | Phase 4.2 mechanics, accounts, security, social records, Land, inventories and original five tabs retained | Full regressions, TLS security, all old migration fixtures and preserved-database clone |
| 15 | TypeScript/build, automated/real PostgreSQL, native HTTPS, ordinary/fantasy browser, mobile/desktop, restart and preservation checks | Exact commands/results in verification JSON; physical Android/APK and live Codespace not claimed |
| 16 | Separate branch, incremental commits, documented rules/migration, formulas, preservation report, screenshots and safe update commands | This checklist, milestone report, gallery, preservation and verification JSON; no main merge or public deployment |

## All 26 requested acceptance tests

| # | Acceptance condition | Evidence |
| --- | --- | --- |
| 1 | Ordinary knockouts never increase Deaths | Repeat-attack and training tests assert 0 Deaths after a non-bounty knockout |
| 2 | Successful claims award exactly one Kill and one Death | Concurrent finishing claims, 50 funded claims and unique journal assertions |
| 3 | Eligible winning attacks earn positive XP even after old budgets | Real/bot repeat combat tests; minimum-XP regression and native bot finishing claim |
| 4 | XP scales with relative level | Exact integer formula tests and representative balance report |
| 5 | Equipment controls work without keyboard typing | Native readonly/inputmode checks, plus/minus clicks and purchases in all three categories |
| 6 | Land controls work without keyboard typing | Native multi-property plus/Buy More flow and readonly template checks |
| 7 | Buy More works for all purchase categories | All three native equipment categories and Land, fresh command IDs and saved GET receipts |
| 8 | Real recruitment works from profiles | Native public-profile Invite to Army, pending state and recipient acceptance; HTTP persistence tests |
| 9 | NPC requests automatically accept | Native profile button plus transactional accepted-link/state assertions |
| 10 | Army capacity and quantity-limited gear still apply | Full bot-recruitment capacity rejection, disabled-feature projection and normal equipment-selection regressions |
| 11 | 450 bots span every level | SQL groups show 50 levels × 9; provisioning reports exactly 450 active |
| 12 | Names are valid, unique and stable | All 450 blueprint identities; repeat provisioning; v4 migration and preserved source NPC IDs |
| 13 | At least three actual properties per bot | Blueprint and persisted state checks for every NPC |
| 14 | At least 2,500 initial carried gold per bot | Exact formula/baseline checks for every NPC and deterministic range output |
| 15 | Equipment and wealth progress with level | Legal item level/quantities, tier tests, saved investments and representative economic ranges |
| 16 | Bot hourly income accrues | Real offline estate/maintenance test, actual wallet and reserve assertions |
| 17 | Bot settlement never duplicates periods | Locked saved cursors, unique settlement journals, repeated reads and repeat-provision snapshot |
| 18 | Human full-period net matches authoritative accounting | Exact 4,000 gross − 200 property − 209 equipment = 3,591 regression, with and without reserve |
| 19 | Countdown reflects actual next payment | Shared timestamp assertions, no purchase reset, native due balance update and approximately one-hour next countdown |
| 20 | Offline/restart income remains correct | Real compiled-process restart settling three unpaid cycles once; offline/concurrent API tests |
| 21 | Home has no Bounty List menu shortcut | HTML/template assertion and updated Home screen |
| 22 | Battle keeps Bounty List access | HTTP assertion and native bounty lifecycle |
| 23 | Region selector is clear and filters correctly | Native disclosure open state, All regions selection, chevron and rendering checks |
| 24 | Existing records and journals survive | Populated old-schema fixtures, v4-to-v5 test and read-only-source/disposable-clone preservation report |
| 25 | Codespaces HTTPS security remains enforced | Real TLS proxy/native forms; Secure/HttpOnly/Lax cookies, session rotation, foreign Origin/CSRF rejection |
| 26 | Mobile 320/360/390/412 and desktop remain usable | Native checks at these widths plus 430 and 1366; named controls, labels, five tabs, no overflow/missing images |

Browser tests establish Chromium behavior at the specified viewports. They do not certify physical Android keyboards, WebView/APK behavior or the user's live Codespace. Numerical pace is a documented arithmetic model plus automated reachability, not measured multi-day human retention.
