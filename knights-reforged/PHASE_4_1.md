# Kingdom Come — Phase 4.1 refinements

Branch: `feature/kingdom-come-phase-4-1-refinements`, based on Phase 4 commit `daf90695c8be7f4339c54c4ba199689984b30acc`. No merge, public deployment, hosting purchase, or APK conversion is part of this milestone.

The finalized rules below come from the Phase 4.1 instructions. Numerical combat formulas, Calling bonuses, catalog content and economic balancing remain reconstructed Kingdom Come mechanics; they are not claimed as recovered Storm8 server code. Original recovered navigation/backgrounds and the existing fantasy paintings are preserved.

## Implemented behavior

- **Home-only Land navigation.** Home has the single normal Land shortcut. Header, secondary menus, profiles and the Land page have no other Land navigation link. GET `/game/land`, its API, purchases, sales, saved rates, offline income and maintenance remain intact. The original five bottom tabs are unchanged.
- **Immediate Attack Again.** Neither server commands, SSR eligibility nor browser presentation impose an attack timer. Existing saved future `attack_ready_at` values are ignored; the compatibility column and API field remain. Every new form has a new command UUID, spends Spirit and saves a separate report. Identical retries replay the same transaction. Native duplicate-submit protection does not impose a delay. The existing general HTTP abuse limiter remains; it is not a combat cooldown.
- **Actual combat restrictions remain.** Attacker needs 20 Health and one Spirit; target needs positive Health and must be in the symmetric nearby-level range. Current target Health and a specific restriction appear on the report. Zero-Health targets cannot be attacked until natural recovery. No bot full-heal timer remains.
- **Quest repeat styling.** Available Do Again uses the active gold button. Only genuine server-derived Mana, level, equipment, discovery or army restrictions disable it. Authenticated resource updates synchronize its disabled state with `state.quests[].ready`.
- **Automatic income display.** The manual Refresh Income link is removed. Purchases/sales and other POSTs render fresh state. Income/recovery deadlines, visible-page return, online recovery and back/forward-cache return trigger authenticated reads; a visible-only 60-second fallback catches external changes. Land owns its screen's shared refresh channel, avoiding a second resource-header request. Overlaps coalesce, network failures back off, stale state versions are rejected, and the browser never adds gold or computes economic rates. No-JavaScript navigation still settles completed offline hours.
- **Heraldic outcomes.** Shared shield/ribbon SVG statuses distinguish gold/green Victory from bronze/red Defeat. They have no button interaction. Report and player links remain separate, working controls in histories and feeds.
- **Public Tales From the Field.** Own/public Profile → Battles shows persistent encounters, outcomes, names/profile links, timestamps, gold/XP and damage. Pages use 20-entry microsecond-precision keyset cursors. An explicit public projection excludes snapshots, wallets, account/session identifiers and aggregate power. Full reports remain combatant-only. Unknown legacy detail is labeled unrecorded rather than fabricated.
- **Profiles.** Aggregate Attack Power and Defense Power, including the former Skills total-power line, are hidden. Actual skill allocations, bounded training bonuses, automatic loadouts, individual Armory statistics and saved private combat calculations remain.
- **Comments.** Home and Profile share compact parchment input areas, restrained textured panels, linked authors, clearer timestamps, separation, and report/moderation controls. Persistence, pagination, rate limits, escaping, reporting and operator moderation are unchanged.

## Finalized bounty rules and edge cases

| Rule | Behavior |
| --- | --- |
| Amount | Whole integers from **1 to 10,000 gold**, inclusive |
| Listing fee | Existing 10% policy, rounded **up**, minimum **1 gold**; 1-gold bounty therefore costs 2 gold total |
| Confirmation | Profile and Rivals forms open a server-calculated review of principal, exact nonrefundable fee and total; only confirmation commits funds |
| Eligibility | Real players, level 3 and five completed quests, nearby levels; no self or accepted-ally placement |
| Active target | Exactly one active contract, enforced by the existing partial unique database index plus transaction serialization |
| Placement race | First committed placement wins; losing attempts charge nothing and create no successful placement record |
| Shared target limit | 50 successful placements in `(now − 24 hours, now]`, across **all** sponsors and statuses |
| Relisting | Immediately after claim, cancellation or expiry, including at 0 Health; only the shared rolling target limit and ordinary eligibility apply |
| Expiry | Exactly 24 hours after placement; no midnight reset |
| Refund | Full recorded principal once, whether canceled or expired; only the recorded disclosed listing fee is retained |
| Cancellation | Original one-hour minimum retained; only the sponsor may cancel |
| Claim | Eligible finishing **attack** reduces the target from positive Health to 0; earlier damage has no share |
| Reward | Escrow principal goes exactly once to the finisher, separate from ordinary loot; **exactly one kill** is recorded |
| Exclusions | Self, sponsor, temporary bots, and accepted allies of sponsor or target cannot claim |
| Defeat | Target remains at 0 until normal Health recovery; no forced revival or additional attack delay |

The old sponsor active/day caps, sponsor-target relisting delay and hunter daily/pair/sponsor-payment caps are superseded. They would conflict with the finalized immediate-relisting/finishing rules. There is no hidden replacement cooldown. Ordinary PvP's three rewarded encounters per rival per rolling day and the separate bot reward limits remain unchanged. Bounty eligibility and escrow are independent of whether ordinary encounter loot is exhausted.

Review is a quote, not a reservation. Confirmation revalidates funds, eligibility, the active target and rolling count. A stale/conflicting quote fails without charge. Existing HTTP/API placement endpoints and receipt replay remain compatible. New browser confirmations bind the displayed immutable ruleset version; they do not accept client-supplied fees or rewards.

Escrow operations acquire the same PostgreSQL advisory transaction lock before character locks. Refund sponsors and combatants lock in deterministic order. Receipt insertion, funds, fees, bounty state, battle result, financial journal, bounty event and kill credit commit atomically. A partial unique active-target index and unique kill keys (`bounty_id`, `battle_id`) add database safeguards. Expiry/refund work drains bounded batches under the lock, including more than 100 contracts, and updates sponsor state versions so older header responses cannot hide a refund.

At the exact expiry timestamp, expiration takes precedence: the creator receives the principal; the battle cannot claim it. A valid attack by an ineligible claimant can still cause ordinary damage but leaves the contract unclaimed. If the sponsor delivers the knockout, they receive no bounty or kill; another eligible hunter must wait for natural recovery and deliver a qualifying finish. An extremely wounded defender can win the army-strength contest yet reach 0 from retaliation: the finishing attacker receives the bounty, while the army outcome remains a loss. Wins, losses, deaths and bounty kills are distinct statistics. Claim eligibility uses the saved pre-combat levels, so a legitimate finishing hit does not lose its reward when its ordinary XP levels the attacker out of that rival range.

Paid contracts transfer existing gold and consume a disclosed fee; they create no new bounty gold. Coordinated multi-account kill trading cannot be identified perfectly during alpha. The target-wide cap, actual funded principal, fee sink, ally exclusions, normal Spirit and immutable records bound and expose it. No undisclosed account-identity rule or extra relisting delay has been added.

Expiry uses authoritative request-time settlement, consistent with the rest of the application. Expired contracts disappear from the active query at their deadline; the board, escrow actions and the returning creator settle refunds durably. No always-running worker is needed while a private Codespace sleeps.

## Temporary rivals

`passive-rivals-3` retains all 150 NPC identities: green, seasoned and elite rivals at each level 1–50. NPCs use ordinary owned inventories, automatic selection, Calling modifiers and combat; they have no hidden damage multiplier.

The comparison company grows one place per five levels, capped at ten including its leader. Green/seasoned/elite use 40%/70%/100% of that company, with 60%/85%/100% equipment coverage, item-level lags of five/two/zero, and bounded training growth. Early green rivals initially have no armor/spell copies; other profiles equip all three categories. Each selected quantity is limited by actual ownership and participating members. The defense-oriented loadouts use increasingly strong, illustrated catalog equipment through level 50.

Gold allowance before tier scaling is `100 + 150 × level + 20 × level²`; tier multipliers are 80%/100%/125%, rounded down. At level 50 this is 46,080 / 57,600 / 72,000 gold. Health, Mana and Spirit capacities also grow with level; Health recovers by the normal Calling interval. Wallet top-ups and synthetic NPC maintenance funding remain development-only and journaled. Larger visible wallets do not change the **50 gold per encounter, six rewarded bot encounters per rolling 24 hours, one per bot** ceilings: at most 300 ordinary bot gold and 30 XP per attacker per window under current combat rules.

The population can be disabled through existing configuration/operator provisioning. Production still disables it. Bots cannot authenticate, submit gameplay commands, initiate attacks, place/claim bounties, post social messages or become consenting allies. The explicit registry check remains protective even if an NPC login flag is accidentally changed.

Upgrading is an explicit guarded `dev:bots` operation. It keeps character/account IDs, historical reports, completed rewards and real-player rows. It changes only registered NPC loadouts, training, capacities and budget; current Health is capped rather than restored, and recovery clocks/0 Health are preserved. Repeating the same catalog upgrade is idempotent. The managed `dev` account is not reset by this milestone.

Difficulty labels are relative to these test rivals, not promises against every player build. A fully equipped human army larger than ten can outgrow the NPC population; meaningful human PvP still depends on participation, gear and skills. `npm run balance:strategy` enumerates all 441 combat-roll pairs at every level for a documented capped-company reference build. It is arithmetic evidence, not a claim of human balance testing.

## Migration and preservation

`012_refinements.sql` widens bounty amount/fee constraints to the new minimums, adds an indexed legacy knockout archive and a uniquely keyed bounty-kill journal, and indexes returning sponsors' expired contracts. Earlier SQL/catalog files are unchanged. New immutable definitions are `refinements-0.1` and `passive-rivals-3`; the former versions remain installed and historical rows retain their ruleset IDs.

Old battle JSON, wallets, accounts, sessions, inventories, Land holdings/payment clocks, allocations, community records and financial history are not rewritten. Existing active contracts keep their principal, recorded fee and expiry; new finishing requirements govern future claims. Previously completed claims remain completed under their historical rules.

The former derived “Kills” statistic counted ordinary health knockouts. Migration archives that value as **pre-Phase 4.1 knockouts** and explicitly credits one `legacy_claim` kill per already claimed bounty, without making new payments or battles. New claims have `finishing_claim` credit. Profiles explain the archive when nonzero. This is a documented statistic transition, not a retroactive rewrite of combat records.

Migration tests compare all existing rows, and the preserved workspace development database was also checked: **40 pre-existing business tables unchanged**, 166 accounts/characters, five battles, ten holdings and ten old catalog definitions retained. Separate NPC-upgrade verification compares all human-linked rows and keeps the 16 real/development characters intact. These checks apply to this workspace, not the user's remote Codespace.

The local packaged PostgreSQL distribution does not include `pg_dump`. A private exact-text logical row snapshot was saved outside the repository, and row/catalog comparisons passed. This limitation did not prevent migrations, real PostgreSQL tests or restart checks. No database contents or credentials are committed.

## Verification and screenshots

See [PHASE_4_1_VERIFICATION.json](PHASE_4_1_VERIFICATION.json) for final counts and [the screenshot gallery](docs/phase-4-1-preview/README.md) for native-browser captures. Verification covers TypeScript, production compilation, unit/regression tests, real PostgreSQL migrations and concurrency, compiled-process restart, ordinary native-form multiplayer, the level-50 catalog loop, and a local TLS proxy reproducing Codespaces Origin rewriting.

The HTTPS fixture tests actual native registration/login/logout and authenticated forms with Secure/HttpOnly/Lax cookies, canonical HTTPS Origin and both localhost rewrite variants. Forged Origin/forwarding headers and invalid CSRF still fail. Mobile layout/accessibility checks cover 320, 360, 390, 412 and 430px plus 1366px desktop, with named controls, labels, working links, five tabs, no horizontal overflow, safe comments and keyboard navigation. The live super-winner Codespace and a physical Android WebView/APK are **not** accessible/verified from this workspace.

## Update the existing super-winner Codespace

Stop the existing application with Ctrl+C. Preserve any local edits before switching; do not force checkout or reset. Keep the existing `.env`, `DATABASE_URL`, PostgreSQL data directory/service and credentials.

From `/workspaces/test/knights-reforged`, take a backup using the existing PostgreSQL client. This avoids printing the connection string:

```bash
node --input-type=module <<'NODE'
import 'dotenv/config';
import {mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
if (!process.env.DATABASE_URL) throw new Error('Keep your existing DATABASE_URL configured.');
mkdirSync('.local/backups', {recursive:true, mode:0o700});
const file = '.local/backups/before-phase41-' + new Date().toISOString().replaceAll(':','-') + '.dump';
const result = spawnSync('pg_dump', ['--format=custom', '--file', file], {
  stdio:'inherit', env:{...process.env, PGDATABASE:process.env.DATABASE_URL}
});
if (result.error || result.status !== 0) throw new Error('Database backup failed; resolve the backup before continuing.');
console.log('Backup saved: ' + file);
NODE
```

If `pg_dump` is absent, take a backup through your existing database tooling before continuing. A Codespace rebuild/database reset is not required.

Then update only the new feature branch:

```bash
cd /workspaces/test
git status --short
git fetch origin feature/kingdom-come-phase-4-1-refinements
git switch -c feature/kingdom-come-phase-4-1-refinements FETCH_HEAD
cd knights-reforged
npm run db:migrate
NODE_ENV=development ALLOW_DEV_PROVISIONING=1 npm run dev:bots
npm run typecheck
npm run build
export NODE_ENV=development HOST=0.0.0.0 PORT=3001 ENABLE_DEV_BOTS=1
export APP_ORIGIN=https://super-winner-4r7ppp6g7p4hq4rv-3001.app.github.dev
npm start
```

If the new branch already exists locally, replace its `git switch -c … FETCH_HEAD` line with `git switch feature/kingdom-come-phase-4-1-refinements` followed by `git pull --ff-only origin feature/kingdom-come-phase-4-1-refinements`. Resolve/preserve local work if Git refuses. Existing installed dependencies are sufficient; no package versions changed. Keep forwarded port 3001 **Private** and reload open game tabs to load the versioned clients. Do **not** run demo reset, `dev:account --reset`, remove PostgreSQL volumes, copy `.env.example` over `.env`, or switch the player database to a test URL.

In two browser sessions: verify login, Home-only Land, an available gold Do Again, immediate attacks until Spirit/Health stops combat, a reviewed 1-gold bounty funded by a third qualified account, its finishing claim and single kill, public Tales, comment/report flows, automatic income return and logout. Run automated database suites only on a separately created disposable `*_test` database.

## Remaining alpha limits and the next milestone

No Android APK compatibility or live-Codespaces result is inferred from viewport tests. Physical Android touch/accessibility testing, multi-day economic playtesting, hostile-load/abuse testing, account recovery and operational hosting readiness remain. The deterministic bot comparison cannot establish universal matchup fairness, and funded coordinated kill trading needs operator monitoring before public access.

The next work should be **permanent HTTPS hosting with durable PostgreSQL/backups**, followed by a narrowly scoped Android shell proof of concept, not additional gameplay expansion. The existing [APK assessment](APK_READINESS.md) still favors a small first-party WebView shell initially: load only the stable realm HTTPS origin, preserve first-party secure session cookies, handle Back/external links deliberately, avoid unnecessary JavaScript bridges and never bypass TLS checks. Server-rendered changes and player data stay on the hosted backend; installing an APK does not embed PostgreSQL or remove the need for persistent multiplayer hosting. A TWA is a later alternative once a permanent owned domain, Digital Asset Links and the required browser/PWA behavior are verified. Neither approach should use a sleeping/private Codespace as permanent hosting. Hosting costs, public exposure and release signing require a separate authorized hosting/packaging milestone.
