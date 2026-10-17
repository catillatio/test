# Phase 4.2 — PvP economy and fantasy rivals

Branch: `feature/kingdom-come-phase-4-2-pvp-economy`. Base: Phase 4.1 rendering fix `e12b3d2ea972e840d371ef97f6d45c639e8ca9d7`. No main/Land/earlier feature branch is merged or overwritten. No public service or APK is deployed.

## What changes

Public profiles now place **Attack** and **Add to Bounty List** together directly below character identity and Health, before statistics, equipment or holdings. Both actions remain visible for temporary rivals; an unavailable action has an explanation. Profiles retain their existing information, compact five-tab foundation, public Tales, comments and illustrated holdings. Aggregate attack/defense ratings remain hidden. Land is still linked only from the Home menu; direct Land URLs and transactions remain available.

The bounty link opens a compact placement page with name, level, Health, eligibility, amount, fee, available unbanked gold and total. Enhanced quotes are requested from the server only when the amount changes, not polled or calculated in JavaScript. A stale response cannot replace a newer amount's quote. Native Review works without JavaScript and displays the exact principal, fee and total before confirmation. Confirmation rechecks eligibility, target availability, rolling limits and funds; previewing does not reserve a listing. Failed placements charge nothing. Existing HTML/API command routes remain supported.

The **Vault** is a small new persistent banking destination on Home. It was necessary because Phase 4.1 had no bank balance or deposit/withdraw service. Deposits/withdrawals move gold atomically between the existing purse ledger and a separate protected account. Both have zero fees, no interest and a 2,147,483,647-gold balance limit. Each movement has a durable journal and idempotent command receipt. Existing players start with a zero Vault balance; no carried gold moves automatically. Banked gold is never used for loot, bounty funding, purchases or equipment upkeep. Withdraw first. Public profiles/API projections do not expose a real player's purse or bank balance.

## Ordinary battle loot

New battles retain alpha-0.3 damage, Calling, skills, quantity-limited equipment selection, army participation, Spirit costs, recovery and eligibility. An **attacking victory** alone transfers ordinary loot from the defender's currently available purse:

```text
base = min(5,000, floor(current defender unbanked gold × 3 / 100))
loot = floor(base × sequence percentage / 100)
percentages = 100%, 75%, 50%, 25%, 10%, 10%, ...
```

Each attacker–defender pair has a persisted sequence beginning with its first new victory. It resets exactly 24 hours after that first victory, not at midnight or 24 hours after the latest attack. Defeats do not transfer gold, advance a sequence or reset its clock. A victory with zero available loot still counts as a victory. New sequences start after this migration; historical battles are not backfilled or recalculated.

A 100,000-gold purse loses **3,000; 2,182; 1,422; 700; 278; 277** across its first six uninterrupted qualifying victories. The 3% base uses the remaining purse each time. Bank, escrow and retained overflow treasury balances are outside the loot base. Credits that would overflow the attacker's purse use the existing retained-gold journal rather than disappearing.

The pair update, Spirit/damage, purse debit/credit, XP, battle snapshot and receipt commit together under the existing sorted character locks and alpha escrow-operation lock. A repeated command returns its original result; a changed intent cannot reuse its ID. Concurrent attacks cannot calculate loot against the same stale purse. There is no Attack Again cooldown. A zero-Health defender cannot be attacked until natural recovery. Existing attacker Health, rival range, Spirit and HTTP abuse protections remain.

Human **XP** retains the previous three-rewarded-encounters-per-target rolling-day limit. This is independent of ordinary human loot: fourth and subsequent victories still transfer the specified diminished gold. Reports explain reduced loot and XP restrictions separately. Stored `rewarded` continues to represent the existing XP/bot allowance; it no longer means all human gold is forbidden when false. New reports add `pvpRulesetId` and `lootDetails` while keeping damage's `rulesetId: alpha-0.3`. Old reports keep their saved meaning, including historical defensive loot.

### Temporary-rival reward limits

For an allowance-eligible bot victory, calculate the same 3% base and pair percentage **first**, then apply a **50-gold maximum**. The existing limits remain **one rewarded encounter per bot and six across all bots per attacker per rolling 24 hours**, so ordinary bot rewards cannot exceed 300 gold/30 XP per attacker per window. Existing encounter accounting, including a rewarded loss consuming an encounter allowance, is retained. Later attacks still spend Spirit and cause normal damage but grant zero ordinary bot gold/XP.

Bounty principal is a distinct player-funded escrow transfer. Claiming it never resets the pair window, bot reward budget, Spirit cost or maintenance obligations, and grants no extra XP. Higher bot wallets or Land income cannot bypass the ordinary bot allowance.

## Bounty rules

| Rule | Phase 4.2 behavior |
| --- | --- |
| Principal | 1–10,000 whole gold, taken only from the creator's unbanked purse |
| Listing fee | 10%, rounded up, minimum 1 gold; separately disclosed and nonrefundable |
| Eligibility | Real sponsors/hunters: level 3 and five quests; similar-level rivals; no self or accepted-army-ally contracts |
| Real targets | Existing level-3/five-quest requirement retained; zero Health does not prevent relisting |
| Bot targets | Active registered rivals only, and only with both development flags enabled; they are exempt from the human quest-completion prerequisite, not rival-level checks |
| Active target | One active bounty; existing partial unique index plus serialized placement; first committed placement wins |
| Rolling target limit | 50 successful placements in the preceding 24 hours across **all** creators and statuses; failed attempts never count |
| Relisting | Immediate after claim, cancellation or expiry, including at zero Health, subject to the rolling limit |
| Expiry | 24 hours from placement; refund full principal once, retain disclosed fee |
| Cancellation | Existing one-hour waiting period, creator only; full principal returned once, fee retained |
| Claim | An eligible attacker delivers a server-recorded positive-to-zero Health finishing action after placement and before expiry |
| Kills | Exactly one uniquely journaled kill per successful bounty claim; no ordinary-victory/knockout kills |
| Exclusions | Creator cannot claim their own funded contract; self/accepted-allied hunters are excluded; bots never sponsor, claim or initiate attacks |

An expiry/finishing race at the exact deadline refunds the sponsor and pays no claimant. Finishing attacks that lose the army contest can still qualify if their legitimate damage reduces the defender to zero; wins and kills remain separate. The target stays at zero Health, with no automatic revival. Multiple finishing attackers cannot duplicate escrow or kills. Refund/claim overflow retains funds through the existing treasury mechanism. Historical principal, fee, expiry, claims, kills, financial entries and battle snapshots remain unchanged.

Refund settlement is request-driven, consistent with offline Land: the board and escrow commands settle due contracts, and a returning sponsor receives their due refunds through normal state loading. Expired rows are excluded from the active listing immediately by their expiry timestamp. No continuously running worker is required while a private Codespace sleeps.

### Development bot bounty switch and testing identities

```bash
export NODE_ENV=development ENABLE_DEV_BOTS=1 ENABLE_DEV_BOT_BOUNTIES=1
```

`ENABLE_DEV_BOT_BOUNTIES` defaults off, requires enabled rivals and is accepted only in development/test; production forces it off. Disabling it does not delete active contracts: they remain historical/escrow-backed and may be canceled or expire/refund normally, but bot-target claims are blocked until re-enabled. Bot logins and all bot commands remain rejected by both account status and explicit registry checks.

**A single identity cannot both fund and claim its own contract.** One human tester can use two existing sessions—e.g. their player and the existing managed `dev` account—in normal/incognito browser windows. Both sponsor and hunter need the displayed level/quest qualification. No additional human participants are needed. If only one player identity exists, a second ordinary test identity is required by the no-self-funded-claim rule; no disguised bot sponsor, minted bounty or self-claim exception was introduced. Never reset the existing `dev` account merely to test this feature.

## Passive fantasy rivals, levels 1–50

`passive-rivals-4` contains 150 deterministic unique names, one green/seasoned/elite identity per level. Names follow existing 2–28-character validation, with varied surnames and occasional Ser/Lady titles. Only registered NPC character names change; account/character IDs, existing profile URLs, bounties and recorded battle names remain intact. Real players are not renamed. No fake historical battles, quests, account ages or social conversations are fabricated.

The ten-member company cap, difficulty profiles, Calling modifiers, legal equipment coverage and training curve are retained. Green/seasoned/elite use 40%/70%/100% of a capped company, 60%/85%/100% equipment coverage and item-level lags of five/two/zero. Inventory quantities constrain participation normally. Defense-oriented loadouts may retain an older ward with better defense; no hidden NPC multipliers are added. High-level rivals use the existing illustrated fantasy catalog. An especially well-equipped human army larger than ten can outgrow these rivals; difficulty labels are relative.

Real estate portfolios use existing unlocked catalog properties and saved purchase prices/rates, including the normal 10% price increase for additional copies:

| Level | Portfolio policy |
| --- | --- |
| 1 | No property |
| 2–10 | One modest unlocked property |
| 11–20 | Two unlocked property types |
| 21–35 | Three types with multiple copies |
| 36–50 | Four prestigious types with larger holdings |

The green/seasoned/elite copy budgets vary by 70%/100%/130%. Public profiles group the actual persistent holdings and sum saved gross income, property maintenance and active equipment upkeep. All portfolios pay through ordinary hourly/offline settlement.

Wealth is based on actual investment and income, not an arbitrary huge number. Before the 80%/100%/125% tier scaling, purse allowance is `100 + four hours of positive net income + 10% of equipment investment`; initial Vault savings are `24 hours of positive net income + 20% of property investment`. Initial gear lots record real catalog costs. Development endowments fund those costs, property purchases and Vault deposits through durable journals; they are explicitly synthetic test capital and cannot sponsor bounties. Initial equipment reserve is the existing 48-hour NPC maintenance budget.

At levels 25 and 50, representative seasoned rivals have respectively 4/7 participating members, 17,428/110,440 carried gold, 111,171/800,180 banked gold and 3,962/24,600 net gold per hour at provisioning. Later wallets reflect actual Land settlements, maintenance and battles. Before a daily allowance/reserve refresh, the game now settles the rival's **old** income and upkeep interval, preventing a refresh from erasing due maintenance or granting cash before earned income is considered. Saved maintenance fractions are retained. Top-ups remain bounded, logged development support; bank balances are never automatically topped up during combat. Unupgraded Phase 4.1 rivals retain their old purse policy until explicit provisioning.

Provisioning skips already installed v4 rivals, so restarts/repeated initialization do not regrant investments or restore Health. Upgrades settle existing obligations, preserve holdings and clocks, cap current resources rather than refill them, retain historical lots/journals and never reset human records or the managed development account. `ENABLE_DEV_BOTS=0` hides combat availability; guarded `dev:bots --disable` deactivates the registry without deleting history.

## Migration and verification

`013_pvp_economy.sql` adds four tables: `pvp_loot_sequences`, `vault_accounts`, `vault_entries`, `development_bot_estates`. Existing SQL and immutable catalogs are not edited. New immutable definitions are `pvp-economy-0.1` and `passive-rivals-4`; prior definitions remain installed. No old battle's loot, kills, skill allocation, inventory, Land clock or escrow is recalculated. Provisioning is a separate, explicit development-only operation.

See [PHASE_4_2_VERIFICATION.json](PHASE_4_2_VERIFICATION.json) for final test counts and [the mobile gallery](docs/phase-4-2-preview/README.md) for actual browser captures. Existing recovered navigation art, fantasy equipment sheets and simplified Land illustrations are reused unchanged; no artwork was generated in this iteration.

The populated compatibility test starts at migration 012, retains sessions, holdings, an active bounty and a historical NPC battle, applies 013 twice, and upgrades the same NPC identity. A separate disposable PostgreSQL **clone of the preserved workspace database** verified all 42 original business tables unchanged after migration, all 16 human/development identities and linked business rows unchanged after upgrading 150 bots, and historical rows retained. The source database was read only and its before/after hashes matched. See [PHASE_4_2_PRESERVATION.json](PHASE_4_2_PRESERVATION.json); no database contents, hashes of credentials or passwords are committed. Populated migration fixtures separately exercise bounty preservation; the preserved source itself had no bounty rows.

Testing includes exact loot arithmetic and fixed-window boundaries, concurrent/replayed attacks and Vault movements, human/bot bounty races, 50 successive funded finishing claims, cancellation/expiry and conservation, normal zero-kill knockouts, 150 legal stable identities, real offline rival Land/upkeep, old-account migrations, private/public projections and Codespaces security. The existing level-50 API playthrough remains part of the full suite.

The HTTPS browser fixture uses a local TLS proxy and Codespaces-shaped port-3001 hostname with native registration/login/logout and form submissions, real Secure/HttpOnly/Lax cookies, canonical Referers and localhost-rewritten Origins. Forged Origins, invalid CSRF and spoofed forwarding headers remain rejected. It checks 21 screens at 320, 360, 390, 412, 430 and 1366px, plus ordinary and late-game browser loops. It does not contact GitHub's live forwarding service or historical servers. Physical Android/APK compatibility and the user's live Codespace are not verified by these tests.

## Updating the existing super-winner Codespace

Stop the current application with Ctrl+C. Preserve local changes if `git status` reports any; do not force checkout, reset or delete them. Keep the current PostgreSQL service/data directory, `.env`, `DATABASE_URL` and credentials. No dependency versions changed; existing installed dependencies suffice.

Take a database backup using the existing client/tooling before migration. From `/workspaces/test/knights-reforged`, this command avoids putting the connection string in shell history or command arguments:

```bash
node --input-type=module <<'NODE'
import 'dotenv/config';
import {mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
if (!process.env.DATABASE_URL) throw new Error('Keep the existing DATABASE_URL configured.');
mkdirSync('.local/backups', {recursive:true, mode:0o700});
const file = '.local/backups/before-phase42-' + new Date().toISOString().replaceAll(':','-') + '.dump';
const backup = spawnSync('pg_dump', ['--format=custom', '--file', file], {
  stdio:'inherit', env:{...process.env, PGDATABASE:process.env.DATABASE_URL}
});
if (backup.error || backup.status !== 0) throw new Error('Resolve the backup failure before migration.');
console.log('Backup saved: ' + file);
NODE
```

If that client is unavailable, use your current database backup tooling; do not reinitialize PostgreSQL. Then:

```bash
cd /workspaces/test
git status --short
git fetch origin feature/kingdom-come-phase-4-2-pvp-economy
git switch -c feature/kingdom-come-phase-4-2-pvp-economy FETCH_HEAD
cd knights-reforged
npm run db:migrate
NODE_ENV=development ALLOW_DEV_PROVISIONING=1 npm run dev:bots
npm run typecheck
npm run build
export NODE_ENV=development HOST=0.0.0.0 PORT=3001
export ENABLE_DEV_BOTS=1 ENABLE_DEV_BOT_BOUNTIES=1
export APP_ORIGIN=https://super-winner-4r7ppp6g7p4hq4rv-3001.app.github.dev
npm start
```

If the Phase 4.2 branch already exists locally, replace `git switch -c … FETCH_HEAD` with `git switch feature/kingdom-come-phase-4-2-pvp-economy` and `git pull --ff-only origin feature/kingdom-come-phase-4-2-pvp-economy`. If Git refuses because of local changes/divergence, preserve that work and resolve it; do not force overwrite. Keep forwarded port 3001 **Private** and reload open pages. No GitHub branch other than Phase 4.2 needs updating.

Do not run demo seeding/reset, `dev:account --reset`, delete volumes, replace `.env` with the example, or point the player app at a test database. The guarded NPC operation upgrades only registered rivals. For automated suites use a separate disposable local `*_test` database, never your player `DATABASE_URL`:

```bash
TEST_DATABASE_URL=postgres://YOUR_TEST_CONNECTION/kingdom_test npm run verify
TEST_DATABASE_URL=postgres://YOUR_TEST_CONNECTION/kingdom_test npm run test:postgres
TEST_DATABASE_URL=postgres://YOUR_TEST_CONNECTION/kingdom_test npm run test:codespaces
```

Use your actual localhost PostgreSQL test connection, not that placeholder. The TLS/browser suites also require existing Chromium and OpenSSL; no real Codespaces forwarding or public deployment is needed. `npm run check:static`, `npm run test:restart` and the browser scripts are documented in package.json. Never put development passwords in committed files or logs.

Manual checks in two existing qualified player sessions: view a human and bot profile, review a 1-gold bounty (2 gold total), fund it, claim with the other identity's finishing attack, verify one kill/zero Health and immediate relisting; test an immediate repeat attack and its reduced ordinary loot; deposit/withdraw Vault gold; confirm Home-only Land, hourly income, comments, army invitations and logout.

## Remaining limits and next work

No known failing automated acceptance check is left in the final verification record. This does not establish bug-free balance, physical Android behavior or live-Codespace availability. Multi-day human economic playtesting, coordinated-account abuse monitoring, production load/operations, account recovery, stable hosting/backups and device accessibility remain work before public release. Alpha's existing global escrow-operation lock favors correctness over high concurrency; no scalability rewrite was attempted. Funded kill trading between distinct accounts cannot be perfectly detected, but costs real escrow plus a fee and creates no bounty gold/XP.

The next milestone should be **permanent HTTPS hosting with durable PostgreSQL/backups, then Android packaging**, not additional gameplay expansion. [APK_READINESS.md](APK_READINESS.md) still recommends a small first-party WebView shell initially, loading the stable HTTPS realm with normal secure cookies, strict Origin/CSRF and deliberate Back/external-link handling. Multiplayer data remains on the server. A TWA is an alternative after a permanent owned origin and Digital Asset Links/browser behavior are verified. No hosting, spending, public release or native conversion was performed here.
