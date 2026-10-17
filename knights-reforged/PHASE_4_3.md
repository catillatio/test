# Kingdom Come Phase 4.3 — economy and progression

Branch: `feature/kingdom-come-phase-4-3-economy-and-progression`, based on Phase 4.2 `fcbfd0283c98d5fe487181121948ca5663910050`, including rendering fix `e12b3d2`. No merge, public deployment, hosting purchase or APK conversion is part of this milestone.

All numerical rules below are reconstructed Kingdom Come balancing decisions. Existing recovered artwork, five-tab navigation, Calling specializations, combat damage, protected Vault, diminishing stolen gold, bounty escrow and social systems are retained. No original Storm8 numerical formula is claimed.

## 1. Bounty-only Kills and Deaths

Both counters now come from the same `bounty_kills` journal: `claimant_id` counts Kills; `target_id` counts Deaths. Its unique bounty/battle identities, existing finishing-attack validation, character locks, escrow lock and receipt replay provide exactly one paired casualty per completed claim. Ordinary knockouts and victories increment neither counter. Wins/Losses remain independent.

Migration 014 archives the previous knockout-derived counter and existing bounty-death count in `legacy_casualty_statistics`. It does not delete or rewrite battles, claims or financial history, and does not guess whether an undocumented knockout was a bounty death. Existing genuine claims already recorded in `bounty_kills`, including the documented older claim reconciliation, retain their credit. Profile explanations and label tooltips describe these rules.

## 2 and 13. Victory XP and progression

Active version: `progression-economy-0.2`; the initial Phase 4.3 definition `progression-economy-0.1` remains immutable and installed. Combat damage remains `alpha-0.3`; gold transfers remain `pvp-economy-0.1`. New reports record the XP ruleset, formula inputs, award, reduction state and both combatants' actual XP separately. Historical reports are not recalculated.

For a full-reward human victory at level `L` against opponent level `D`:

```text
R(L) = existing next-level requirement
B = max(1, min(100, ceil(R(L) × 5 / 100)))
difficulty = clamp(100 + 20 × (D − L), 25, 200)
XP = max(1, floor(B × difficulty / 100))
```

The 100 cap applies to the base, not the final award; a sufficiently stronger eligible opponent can yield 200% of base. The lower bound and integer rounding mean early-level differences may tie at 1 XP.

Attacking humans retain the existing three-full-reward-encounters-per-target rolling-day budget. Passive rivals retain one full-reward encounter per rival and six full-reward encounters in total per rolling 24 hours. After those budgets, a victory still grants **1 XP**, not zero. Ordinary bot gold remains zero after its existing budget and otherwise at most 50 gold after the 3%/pair-diminishing formula. Bounty rewards neither reset those budgets nor mint bot reward funds. Defeats award the attacker zero XP.

Eligible human defensive victories also earn the level-aware award, with a separate three-full-victories-per-attacker budget per rolling day, then 1 XP. Passive NPCs do not gain XP or change assigned levels when defending. A defensive level-up grants its skill points but preserves post-damage Health and resources, so it never revives a knocked-out bounty target. Receipt retries cannot award either participant twice. Reports, Home feeds and public Tales show the correct viewer's saved XP.

The existing requirement curve is unchanged:

```text
Levels 1–9: 12, 18, 30, 45, 60, 80, 105, 135, 165 XP
Level L ≥ 10: R(L) = 200 + 45 × (L − 10)
```

Existing attained levels, level progress, lifetime XP, allocations and milestone IDs are preserved. Supported content stays through level 50; the pre-existing level-55 prestige property is retained, with no new progression expansion or cap rewrite.

| Level | Next level | Equal-level full victory | Eligible weaker / stronger example | Full equal victories | Nearby quest XP |
| --- | ---: | ---: | --- | ---: | ---: |
| 1 | 12 | 1 | Level 1 / 3: 1 / 1 | 12 | 6 |
| 10 | 200 | 10 | Level 8 / 12: 6 / 14 | 20 | 30 |
| 25 | 875 | 44 | Level 20 / 30: 11 / 88 | 20 | 86 |
| 40 | 1,550 | 78 | Level 32 / 48: 19 / 156 | 20 | 165 |
| 50 | 2,000 | 100 | Level 40: 25; no higher-level development bots | 20 | 230 |

At Freeblade's existing 108-second Spirit interval, regenerating 12 or 20 attacks takes approximately 22 or 36 minutes, before starting Spirit, level-up refills, skill upgrades, damage, losses and reward budgets. These are arithmetic estimates, not promises of wins or real-player timing. Six equal-level full bot victories yield 6/60/264/468/600 XP at the representative levels; later practice earns 1 XP per win. Quest rewards are unchanged and remain the main repeatable progression route. The early 10–20-minute goal relies on quests, equipment and level-up refills, not farming a single weak bot. The automated full playthrough checks reachability through level 50; human retention/economic balance still needs playtesting.

## 3 and 4. Shopping and Buy More

Weapons, Armor, Spells and Land use visible minus/value/plus controls, default/minimum 1. Quantity inputs are read-only with `inputmode="none"`; Android users can tap controls without typing. Limits reflect level, gold, transaction and ownership restrictions. Displayed totals follow server catalog prices, including successive Land prices. Every POST still validates all costs and limits inside the existing authoritative transaction.

Successful HTML purchases redirect to a private saved receipt at `/game/purchases/:commandId`. It shows the item, purchased quantity, paid cost, owned quantity and current gold. **Buy More** expands another same-item form with quantity controls and a fresh command ID. It can be repeated without returning to the catalog. Refreshing a receipt is a GET, never another purchase. Another account cannot read it. Original purchase endpoints, CSRF fields and JSON response contracts remain available.

No-JavaScript clients can still submit the default one-copy purchase; stepped quantity selection is a progressive enhancement. Sell forms and FIFO 50%-of-recorded-cost resale are preserved.

## 5. Profile army requests

Public profiles now expose **Invite to Army** beside the existing prominent combat/bounty area. Real-player requests use the same persistent `army_links`, invitation codes, consent, pending/accepted/declined states, 30-second invitation pacing, 20/day limit and 24-hour same-pair reinvitation protection. Existing human allies and surplus/standby participation semantics remain unchanged.

With `NODE_ENV=development` or `test`, `ENABLE_DEV_BOTS=1` and **`ENABLE_DEV_BOT_RECRUITMENT=1`**, an available NPC immediately accepts a valid request in the same transaction. It contributes one ally place to the human leader, uses the normal equipment-limited active participation system and requires a free active army place. No scheduled response, fake bot session or automated command is used. Duplicate/retried requests create one link/event. The automatic accepted event is versioned and counts toward invitation spam limits.

Passive NPCs never add human followers to their own army projection, preserving their mandatory cap of ten. Disabling the switch or disabling rivals excludes NPC allies from active human projections without deleting links or any human ally data. Removal remains permitted. Production and staging cannot enable this feature through configuration.

## 6–9. 450 persistent fantasy rivals and real finances

`passive-rivals-5` supplies exactly nine rivals per level for levels 1–50: green, seasoned and elite, each with variants 0–2. Variant zero retains all 150 Phase 4.2 names and identities; only 300 new accounts are added. Names are unique, valid medieval fantasy identities without numerical display suffixes. Registry variants and stable population keys prevent duplication across upgrades or restarts.

Each NPC has:

- At most ten participating/available army members, using existing level capacity, militia and ordinary equipment selection.
- Legal, level-appropriate Weapons/Armor/Spells and owned quantities. Green/seasoned/elite retain their modest army/equipment/training differences; variants vary legal item lag, Calling and estate quantities. No hidden combat power multiplier is added.
- At least three actual properties. If a tier's preferred unlocked estate selection contains fewer than three plots, inexpensive unlocked starter plots fill the difference. Higher-level portfolios use the existing unlocked property bands and progressively larger holdings. Saved acquisition costs and income/upkeep use normal property purchasing code.
- A one-time carried-gold baseline of at least 2,500, with separate protected Vault savings and variation derived from equipment investment, actual net property income, tier and variant.

The carried-gold baseline is:

```text
max(2500, floor((3100 + max(0, netIncome) × 4
  + equipmentInvestment × 0.10) × tierWealthPercent / 100
  × (100 + variant × 7) / 100))
```

Vault savings retain the existing formula based on 24 net-income hours plus 20% of property investment, scaled by tier wealth (80%, 100%, 125%). Initial investments are paid through recorded development endowments and normal purchase/Vault journals. These synthetic development funds are explicit and never attributed to quests, PvP or bounty rewards.

| Level | Carried-gold range | Vault range | Actual plots | Gross hourly income |
| --- | ---: | ---: | ---: | ---: |
| 1 | 2,550–4,587 | 427–892 | 3–4 | 24–32 |
| 10 | 3,169–5,680 | 4,373–6,323 | 3 | 241 |
| 25 | 10,003–45,919 | 49,942–234,740 | 4–12 | 2,700–8,100 |
| 40 | 41,520–152,323 | 275,217–908,220 | 9–19 | 13,970–29,070 |
| 50 | 60,918–232,047 | 437,385–1,447,760 | 9–19 | 20,790–43,330 |

These are catalog baselines; subsequent legitimate income, upkeep, combat loot and elapsed time change actual persistent balances. Rerunning the same-version provisioner grants no new starting capital, inventory lots or Land. Upgrading keeps old accounts, character IDs, histories, holdings and saved rates, and adds only missing minimum holdings. Existing wealth can exceed the new baseline; it is not reset downward.

Bots use the **same** locked `materialize → settleLand → settleMaintenance` path as humans, including offline catch-up, reserve funding, suspension and exact cursor protection. Settlement is lazy, just as for human accounts: viewing their profile, reading their state or attacking settles due periods and persists the result. No background fake conversation or attacker loop is introduced. Repeated profile reads do not duplicate income.

The existing once-daily, bounded development replenishment path is retained; it settles earned Land and old upkeep first, then tops up only a shortfall. It does not repeatedly provision capital or replenish Vault savings. A pre-upgrade v4 NPC continues receiving actual estate income; the larger v5 allowance requires the explicit versioned upgrade. Normal bot loot remains subject to its 50-gold and rolling daily encounter caps, regardless of richer balances. Bots never initiate attacks, place bounties or claim them.

## 10. Income root cause, correction and accounting

The old code displayed the sum of every holding's hourly rates but set `nextPaymentAt` to the **earliest independently scheduled purchase batch**. A fixture with 1,100/hour bought at 00:00 and 2,491/hour bought at 00:03 reproduces the observation: the header shows 3,591/hour; the old 01:00 deadline pays 1,100; the next batch is due at 01:03. This is a verified code/SQL reproduction. The user's live ledger was not available, so these exact live transactions are not asserted as inspected.

The correction is financial scheduling, not a timer-only patch:

1. A persistent `income_cycles` row owns the character's shared hourly boundary.
2. Existing unpaid cursors are adopted under the character lock, anchored to the earliest existing unpaid boundary. Previously settled income is never recalculated or credited again.
3. All eligible holdings accrue to that common boundary. A newly purchased holding earns only its actual elapsed time; buying never shifts the clock.
4. The next deadline advances by complete elapsed hours from the persisted boundary, including offline catch-up. Refreshing or restarting cannot establish a new three-minute property cycle.
5. Full-hour periods retain `land_income_settlements`; fractional/aligned periods use additive `land_partial_settlements`. Both use character/holding locks, durable cursor movement and unique holding/period keys inside the same transaction.
6. Integer numerators retain sub-gold fractions while holdings remain owned. Net and upkeep each use a 3,600,000-millisecond denominator; paid gross is paid net plus paid property upkeep. A sale settles earned partial time before reducing quantity; closing sub-gold remainder stays recorded, not rounded into invented gold.

For the example, the first shared deadline pays **3,466** property gold (the later holding has earned 57 minutes), explicitly marked as a partial first period. Each subsequent complete unchanged hour pays **3,591**. The countdown then starts the next full shared hour, rather than pointing to a second batch three minutes later. The Land screen shows the authoritative next property-payment amount and whether it includes prorating. A late read naturally shows less than 60 minutes remaining; purchase, refresh and page view never restart the cycle.

Gross Land income, property upkeep, active equipment upkeep and net/hour remain distinct. Equipment maintenance is continuous and uses a prepaid reserve before the wallet. For 4,000 gross, 200 property upkeep and 209 equipment upkeep, a full hour earns **3,591** net. If the 209 upkeep was already reserved, the wallet receives 3,800 while the reserve falls by 209; total spendable-plus-reserved wealth rises by 3,591. The next full hour with no remaining reserve increases the wallet by 3,591. This avoids charging prepaid upkeep twice. Paused equipment is excluded from active net/hour, as before. Detailed explanation is available in a compact disclosure; the existing automatic refresh checks authoritative balances, not client financial accrual.

Regression tests cover the reported numbers, gross/upkeep split, prepaid funding, the next deadline, additional purchases, partial first periods, sales, offline periods, repeated/concurrent reads, rollback, full treasury retention and real compiled-process restarts. No live historical settlements are rewritten or compensation silently granted.

## 11 and 12. Navigation and quest regions

Home no longer has a Bounty List shortcut. Battle and public-profile bounty actions remain intact; relevant historical feed entries remain useful links. Land remains linked only through the Home menu, with its routes and direct access unchanged. The five original bottom tabs are retained.

Quest regions use a larger native disclosure with a clear **Quest region** label, selected region, chevron, expanded-state rotation, keyboard focus and named selection links. Existing nearby/all/region filtering and safe server-selected identifiers remain unchanged.

## 14. Preserved systems

Calling bonuses and change cooldowns, Health/Mana/Spirit recovery, purchased skills, inventory acquisition lots/resale, army selection and invitations, level-50 equipment/quests, Land saved economics, protected Vault, 3% loot and diminishing sequences, one active bounty/target, 1–10,000 bounty amounts, rolling 50-target placements, principal refunds, finishing-only claims, sponsor/ally restrictions, social persistence/moderation, private reports and strict Codespaces HTTPS Origin/CSRF/session handling are retained.

Defensive victory XP and prorated shared income are explicitly versioned changes, not silent alterations of historical results. No gameplay rewards are attached to social posts. No real-player password or managed development-account baseline is reset.

## Database preservation

`014_economy_and_progression.sql` adds `income_cycles`, `land_partial_settlements`, `legacy_casualty_statistics`, zero-valued integer remainder fields on holdings, and a default-zero development-bot variant/index. Existing SQL migrations and immutable catalog JSON are unchanged. New catalogs retain their predecessors in the ruleset registry. There is no destructive migration or automatic database recreation.

[PHASE_4_3_PRESERVATION.json](PHASE_4_3_PRESERVATION.json) records an actual PostgreSQL clone check: 42 original business tables preserve every original column, all 16 human/development accounts and related rows remain unchanged, all 150 original NPC IDs survive, 300 new NPCs are added, and existing historical battles remain unchanged. The preserved source was read only and its before/after hashes matched. Separate populated fixtures include bounties, sessions, old costs, historical knockouts and the direct v4-to-v5 upgrade. Private data and credential hashes are not exported in the report.

## 15 and 16. Verification, delivery and update

Final counts and browser evidence are recorded in [PHASE_4_3_VERIFICATION.json](PHASE_4_3_VERIFICATION.json); screenshots are in [the Phase 4.3 gallery](docs/phase-4-3-preview/README.md). The [acceptance checklist](PHASE_4_3_CHECKLIST.md) maps all sixteen sections and all 26 requested tests to evidence. Browser verification uses actual local Chromium, PostgreSQL and a TLS-terminating Codespaces-shaped proxy, not mocked request headers alone. It does not contact the user's live Codespace or historical servers, and does not establish physical Android/APK compatibility.

Existing recovered navigation/backgrounds, fantasy equipment and simplified property artwork are reused unchanged. Only interface presentation and controls are refined here; no new generated artwork is claimed.

### Update the existing super-winner Codespace

Stop the application with Ctrl+C. Keep the current PostgreSQL process/data directory, `.env`, `DATABASE_URL`, accounts and credentials. Preserve local changes before switching branches; do not force checkout, reset or delete them. No dependency version changes or installation are needed if the current working app already has its dependencies.

Back up using the existing PostgreSQL tooling before migration. From `/workspaces/test/knights-reforged`, the following keeps the connection string out of command arguments and shell history:
```bash
node --input-type=module <<'NODE'
import 'dotenv/config';
import {mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
if (!process.env.DATABASE_URL) throw new Error('Keep the existing DATABASE_URL configured.');
mkdirSync('.local/backups', {recursive:true, mode:0o700});
const file = '.local/backups/before-phase43-' + new Date().toISOString().replaceAll(':','-') + '.dump';
const backup = spawnSync('pg_dump', ['--format=custom', '--file', file], {
  stdio:'inherit', env:{...process.env, PGDATABASE:process.env.DATABASE_URL}
});
if (backup.error || backup.status !== 0) throw new Error('Resolve the backup failure before migration.');
console.log('Backup saved: ' + file);
NODE
```

If `pg_dump` is unavailable, use the existing database backup tooling; do not recreate PostgreSQL. Then run:

```bash
cd /workspaces/test
git status --short
git fetch origin feature/kingdom-come-phase-4-3-economy-and-progression
git switch -c feature/kingdom-come-phase-4-3-economy-and-progression FETCH_HEAD
cd knights-reforged
npm run db:migrate
NODE_ENV=development ALLOW_DEV_PROVISIONING=1 npm run dev:bots
npm run typecheck
npm run build
export NODE_ENV=development HOST=0.0.0.0 PORT=3001
export ENABLE_DEV_BOTS=1 ENABLE_DEV_BOT_BOUNTIES=1 ENABLE_DEV_BOT_RECRUITMENT=1
export APP_ORIGIN=https://super-winner-4r7ppp6g7p4hq4rv-3001.app.github.dev
npm start
```

If this branch already exists locally, replace the `git switch -c … FETCH_HEAD` line with:

```bash
git switch feature/kingdom-come-phase-4-3-economy-and-progression
git pull --ff-only origin feature/kingdom-come-phase-4-3-economy-and-progression
```

Persist the three development flags in the **existing** `.env` if desired, without replacing its connection settings. All bot features are disabled by configuration in production. Keep forwarded port **3001 Private**, reload open forms after restarting, and open the current forwarded HTTPS address. Do not run demo seeding/reset, `dev:account --reset`, delete volumes or use the player database as `TEST_DATABASE_URL`.

For local verification, use a separately designated disposable local `*_test` database:

```bash
TEST_DATABASE_URL=postgres://YOUR_LOCAL_TEST_CONNECTION/kingdom_test npm run verify
TEST_DATABASE_URL=postgres://YOUR_LOCAL_TEST_CONNECTION/kingdom_test npm run test:postgres
TEST_DATABASE_URL=postgres://YOUR_LOCAL_TEST_CONNECTION/kingdom_test npm run test:restart
TEST_DATABASE_URL=postgres://YOUR_LOCAL_TEST_CONNECTION/kingdom_test npm run test:codespaces
npm run check:static
npx tsx scripts/phase43-balance.ts
```

The browser checks require existing Chromium; the HTTPS fixture also uses OpenSSL. Container-only `CHROMIUM_NO_SANDBOX=1` is a browser-test option, not an application launch requirement. Never aim tests or fixture provisioning at a production database.

### Remaining release work

Permanent HTTPS hosting, durable PostgreSQL/backups, production rate/abuse monitoring, account recovery and physical-device tests remain necessary before public release. Numerical balance and the 10–20-minute human-session target still require real playtesting. The existing global escrow lock prioritizes correctness over high-concurrency scale.

The next substantial milestone should be permanent hosting and Android packaging, not more gameplay expansion. [APK_READINESS.md](APK_READINESS.md) remains applicable: a small first-party WebView shell is the initial packaging option after a stable HTTPS realm exists. Authentication, CSRF, secure cookies and multiplayer persistence stay server-side. Browser viewport results are not an APK/device certification.
