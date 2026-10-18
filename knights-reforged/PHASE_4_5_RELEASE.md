# Kingdom Come Phase 4.5 — gameplay refinement

Repository `catillatio/test`, application `/knights-reforged`.
Branch: `feature/kingdom-come-phase-4-5-gameplay-refinement`.
Base: deployed Phase 4.4, `1f1aec5eda3710b8c809b4c6b228a048ec4d48fc`.

**No live Railway connection, player adjustment, deployment, initialization or merge was performed.** This update uses disposable local PostgreSQL fixtures. The owner requested secure operator commands for the live backup and upgrade. Those steps remain prerequisites; local results do not verify the owner's actual backup or provider configuration.

## Release notes and acceptance map

| Section | Implementation and evidence |
| --- | --- |
| 1. Gold healing | Tap the Health meter to see Health/missing/cost/purse and Heal Now. Free recovery settles first. Restoration is a locked, receipted transaction, with a separate immutable journal. Full Health is free. The optional client maximum is a spending ceiling, never an authoritative price. Concurrent identical/distinct requests, insufficient gold, natural recovery, stale cost and competing Land expenditure are tested. |
| 2. Social recruitment | Removed both HTML/API gold-militia routes, all purchase buttons, and the command implementation for new orders. An old completed receipt can still be read internally without purchasing again. Existing militia/army links/participation remain. Recruit and public-profile invitations still use ordinary consent and capacity rules, including explicitly enabled auto-accepting development rivals. A fresh level-50 playthrough uses real invitations rather than bought militia, with no administrative gold/XP/equipment grants. |
| 3. One-tap marketplace | Equipment and Land buys/sales submit directly once, then redirect to durable owner-bound receipts with updated balances and an always-visible Buy More quantity form. Prices, quantity steps, total, projected income and affordability remain visible before acting. Native command IDs, server validation and double-submission protection remain. Old Land quote records/validation are retained for stale open forms/history. Buying missing quest equipment still requires a separate Do Quest action. Bounty escrow review remains because its fee/target decision merits confirmation. |
| 4. Shared Land clock | Retained the existing persistent player-wide hourly clock and exact-integer accrual. All of a player's holdings join one saved schedule. No new per-purchase or realm-UTC timer. Tests buy at 1/30/59 minutes, settle concurrently, catch up offline and restart. Existing holdings/rates/cursors/history are untouched by migration. |
| 5. Upcoming payment | Header now shows `+1,250 Gold · 24 min` or a negative/zero amount. Server state supplies the next boundary and projected actual purse movement. Open the indicator for gross eligible earnings, property upkeep, equipment costs due, already prepaid costs, net economic earnings and next UTC boundary. Device clock/ticks never mint gold. Every transaction/navigation and due-boundary refresh updates state. Full-treasury retention and paused equipment remain authoritative. |
| 6. Bounty count | Battle categories show Bounty List (N), including zero. One shared visibility predicate excludes inactive/expired/hidden targets and disabled bot targets. Board query returns full visible count before its 100-row display limit; other Battle screens use one lightweight count query. Refresh optionally obtains the count in the existing state request and checks the next expiration without adding a separate poller. |
| 7. Celebrations | Stronger victory banner/quick golden flash, 550ms gold/XP count-ups, achievement shields and a distinct decisive-victory accent; defeat stays subdued. Quest completion is prominent with immediate eligible Do Again. Level-up has the largest level number/radiance, skill points, real catalog unlocks, medals and Spend Skill Points. Per-receipt session replay suppression, reduced-motion and nonblocking navigation remain. No audio or large animation library. |
| 8. PvP economy | Wealth-based direct loot transfers; no attacker-level gold multiplier. Higher exposed-gold cap and level-aware bot safety cap; identical diminishing sequence/Vault/bounty separation. New XP uses level and relevant physical army strength, with minimum 1 for eligible repeat wins and low rewards for overwhelming encounters. Exact formulas/comparisons below; no old battle repricing or retroactive awards. |
| 9. Mobile UX | Consistent tappable Health/Mana/Spirit/XP/income disclosures, compact status spacing, outside-tap/Escape dismissal, one open panel, readable narrow-phone totals and full exact breakdowns. Existing region chooser, property artwork, five bottom tabs, Home-only Land and social layout remain. |
| 10. Focused refinements | Immediate working/resolving feedback; next unlocks and XP remaining accessible in the header; practical empty-state guidance; no new image payloads. Bot identity projection is reused instead of re-querying on ordinary character state assembly. Bounty self/sponsor exclusions avoid needless reads, and board reads no longer queue concurrent SQL on a single transaction client. Existing top-level current-state catalog metadata remains available to older clients. Interrupted healing stores only action ID/cost ceiling in tab storage and offers an explicit safe retry with current CSRF. Refreshing a receipt cannot repeat a transaction. |
| 11. Security/preservation | New financial actions use existing strict Origin/CSRF/authentication, sorted character locks, receipts and immutable journals. Migration adds tables/catalog only. Populated Phase 4.4 test compares every old business row, including passwords, sessions, wallet/Vault, 450 bots, Land, equipment, achievements, tutorial, history and old receipts. No human/bot starting balance grants occur. |
| 12. Verification/release | TypeScript, build, full real-PostgreSQL suite, focused concurrency/security/migration checks, production EJS fixtures, TLS/native browser flows, restart persistence and isolated production-container backup/restore/restart rehearsal. Recorded totals and limitations are in `PHASE_4_5_VERIFICATION.json`; screenshots in `docs/phase45/screenshots/`. Manual owner procedure below. |

### References and visual assets

Existing original Storm8 references inform compact information, repeat actions and rewarding level-up pacing. The later remake screenshots inform practical Land/Buy More presentation; they are not evidence of original Storm8 server formulas. No additional original-video observation is claimed. Existing recovered navigation/backgrounds, all 81 catalog illustrations, property sheets, achievements and medieval identity are retained. New effects/panels are lightweight authored HTML/CSS/JavaScript, not newly generated paintings.

## Healing and recruitment balance

`cost = (maximum Health − naturally recovered current Health) × ceil(attained level / 10)`.

Examples: 25 missing Health at level 8 costs 25; at level 17 costs 50; at level 50 costs 125. Full Health costs zero. Healing never changes Mana, Spirit, maximum capacities, equipment, progression or other accounts. It does not bypass ordinary attack eligibility/Spirit rules. Duplicate action IDs replay once; distinct simultaneous heals see the first restored state and cannot charge for already restored Health.

Army quest gates remain unchanged (up to 21 participants). Each accepted ally contributes one available member within the existing level-dependent cap and uses the leader's inventory, not a copied ally loadout. The existing 30-second invitation spacing, rolling 20 invitations/day, same-pair rules and consent remain. The automated no-grant quest playthrough reaches the level-50 finale with social recruitment; its simulated recovery waits are documented rather than presented as human session timing.

## Exact PvP formulas

### Gold: wealth, not attacker level

For an attacking victory, using the target's locked, materialized **unbanked** gold `G`:

```
base = min(15000, floor(G × 3 / 100))
multiplier = [100, 75, 50, 25, 10][min(pairVictoryNumber − 1, 4)]
ordinaryLoot = floor(base × multiplier / 100)
```

The sequence resets 24 hours from its first qualifying victory, not from the last hit. Defeats neither steal nor advance it. The former maximum was 5,000; below 166,667 exposed gold this cap change has no effect. A 300-gold opponent yields 9; 100,000 yields 3,000; 1,000,000 yields 15,000 (formerly 5,000), at any eligible attacker level. A single uncapped first hit removes at most 3%; the 15,000 ceiling further limits richer purses. Vault stays untouched. Each gold comes from the defender, including retained treasury accounting when the winner's integer purse is full.

Bots additionally cap an available reward at:

```
botCap = min(3000, 50 + floor(1.25 × min(targetLevel, 50)²))
```

Apply the smaller of ordinary loot and botCap. Keep **one full-reward encounter per bot, six total per attacker in a rolling 24 hours**. Later eligible bot wins give zero ordinary gold and 1 XP, still costing Spirit/damage. Failed encounters continue to consume existing full-encounter budgets as before. Player-funded bounty escrow neither creates bot funds nor resets these budgets. Sponsors cannot claim their own bounty. No instant wallet refill, free reserve top-up or Vault withdrawal occurs when a bot is attacked.

### XP: matched progression and actual difficulty

The next-level requirement `R(L)` is unchanged. Cumulative thresholds for levels 1–10 are `0,12,30,60,105,165,245,350,485,650`. From level 10 the next-level requirement is `200 + 45 × (L − 10)`. No attained level, in-level XP, skill allocation or historical reward is rewritten; authored gameplay still reaches level 50 with the existing level-55 prestige property. No new level cap/progression expansion is introduced.

```
p(L) = 5                                  when L <= 10
       5 + 0.5 × (L − 10)                when 11 <= L <= 16
       min(12, 9 + 0.375 × (L − 17))      when L >= 17
baseXP = min(300, ceil(R(L) × p(L) / 100))
levelPercent = clamp(100 + 10 × (opponentLevel − L), 25, 150)
strengthRatio = opposingRelevantPower / max(1, winningRelevantPower)
strengthPercent = clamp(floor(100 × strengthRatio), 1, 125)
XP = max(1, floor(baseXP × levelPercent × strengthPercent / 10000))
```

Use pre-roll server army powers including actual selected equipment, participation, skills and Calling. An attacking winner uses attack versus target defense; a defensive winner uses defense versus incoming attack. If strengthRatio < 0.35, or a full-XP budget is exhausted, award **1 XP**. Damage, chance of winning, gold and eligibility are not changed by XP. Decisive presentation uses resolved roll results only and does not increase rewards.

Human budgets remain three full-reward encounters per attacking pair in a rolling day and the existing separate three-full-defensive-win budget. Passive bots do not level from defensive wins. Defensive human level-up still preserves combat Health and does not revive the loser. Every eligible human victory remains at least 1 XP; retrying the same action cannot award again.

### Before/after comparison from real functions

Unrepeated, equal level, equal relevant pre-roll powers; this describes the reward **if** the player wins, not a guaranteed victory. At 75% opposing strength the new reward is lower as shown. Quest comparison uses the highest currently unlocked authored quest. Gold remains based on the target wallet rather than this level table.

| Level | XP needed | Old win XP | New matched XP | New XP at 75% strength | Matched level progress | Equivalent quest XP / Mana | Matched full wins / level |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 8 | 135 | 7 | 7 | 5 | 5.19% | 24 / 5 | 20 |
| 17 | 515 | 26 | 47 | 35 | 9.13% | 50 / 7 | 11 |
| 25 | 875 | 44 | 105 | 78 | 12.00% | 86 / 8 | 9 |
| 40 | 1,550 | 78 | 186 | 139 | 12.00% | 165 / 11 | 9 |
| 50 | 2,000 | 100 | 240 | 180 | 12.00% | 230 / 13 | 9 |

Spirit normally recovers once per two minutes (Calling can improve it); quests use the separate Mana pool and retain their rewards. Full-win counts exclude defeats, weaker armies, changing levels, resource waits and repeated budgets. Six perfectly matched full bot victories yield at most 72% of a later level requirement before strength/level factors; repeats are 1 XP. Harder valid opponents can exceed this matched estimate, bounded by both factors/caps. This is a testable alpha balance, not a promise of real session duration. Reproduce with `npm run balance:phase45`; exact quest gold ranges, all 50 bot bands and recorded PostgreSQL examples are in [balance.json](docs/phase45/balance.json).

The PostgreSQL examples include level 8 versus a poor target, level 17 versus a wealthy target, level 25 versus a level-29 bot, a reward-exhausted repeat, and simultaneous attacks. They record actual transferred gold, remaining purse and strength-aware XP. In the concurrent 1,000-gold example two different winners receive 30 and 29, leaving 941; no gold is created or stolen twice. A repeat bot can retain residual gold yet yield zero after its budget: depletion of the reward allowance is distinct from an empty purse.

### Recorded PostgreSQL examples

These use actual catalog equipment/army fixtures and server combat, not a simplified battle model. Powers differ from the equal-strength arithmetic table above. Gold transfers are ordinary loot; bounty escrow is separate.

| Encounter | Exposed gold before | Actual stolen | Defender remaining | Winner XP | Safeguard |
| --- | ---: | ---: | ---: | ---: | --- |
| Level 8 defeats a poor level-8 player | 300 | 9 | 291 | 3 | 54% opposing strength; no level-based gold bonus |
| Level 17 defeats a wealthy level-17 player | 1,000,000 | 15,000 | 985,000 | 29 | 62% opposing strength; 15,000 cap; Vault unchanged |
| Level 25 defeats a level-29 green bot | 12,198 | 365 | 11,833 | 58 | Real 40% opposing strength plus relative level; target bot cap 1,101 |
| Same bot, reward allowance exhausted | 11,833 | 0 | 11,833 | 1 | One full encounter per bot / six total per rolling day; no instant refill |
| Two simultaneous level-17 winners | 1,000 shared | 30 and 29 | 941 | 18 each | Sorted target locks; second transfer uses remaining 970; no duplicate payout |

The example fixtures assign carried gold/resources explicitly for reproducible accounting; they do not grant anything to live players. See the JSON for saved rule IDs and multiplier/strength details.

### Sustainable bots without a capital reset

All 450 existing blueprints (nine per level) already have positive net hourly Land portfolios, adequate progression-scaled exposed gold and protected savings. The audit therefore justifies **no new starting-gold grant** and no changes to identities, equipment, land, Callings, army caps or seed distribution. Sample seasoned blueprints: level 8 purse 3,762 / net 157 per hour; level 17 5,946 / 578; level 25 20,428 / 3,962; level 40 75,696 / 16,574; level 50 113,440 / 24,600. The complete ranges include all variants in `balance.json`.

Existing saved estates generate persistent eligible income. Normal settlement pays maintenance from existing reserves/purse and suspends unfunded gear under the same human policy. Once per newly settled saved boundary, a bot can pay its own arrears/one-hour reserve from its own gold through the existing ledger. A new journal/cursor prevents another funding attempt on repeated views. Initial adoption makes no adjustment. Long downtime settles actual estate/upkeep periods, then makes one funding attempt; viewing/attacking cannot mint money. Existing legacy prepaid reserves are preserved, not clawed back.

## Land payment proof and header semantics

The existing character-wide `income_cycles.next_payment_at` is reused. This means all **your** holdings pay together; it does not move every existing player to a new realm-wide UTC schedule. The first existing/purchased estate establishes the saved clock; later purchases never shift it.

At each due boundary, holdings earn from their saved accrued-through timestamps using exact millisecond numerators. New land purchased part-way through a cycle earns only its eligible fraction, with sub-gold remainder carried forward. Selling settles only actual earned time before reducing FIFO acquisition lots, keeps the shared boundary and adds the normal saved-cost refund; it cannot create an extra hourly payout. Missed full boundaries are caught up transactionally, preserving history and fractional time. Character locks, cursor advancement and unique immutable history prevent repeated/concurrent payment.

The headline forecasts **future spendable-purse movement through the next boundary**, given current holdings/rates and no intervening actions. It is not a new client-calculated hourly rate. It subtracts future wallet-funded active upkeep and separately shows prepaid upkeep already paid. Consequently a full period of 3,800 net property income and 209 equipment upkeep gives 3,591 economic earnings; if the entire equipment bill was already reserved, the purse receives 3,800, with reserve falling by 209. The panel makes both amounts explicit. Remaining-period costs can change as ordinary upkeep is settled; current-state forecasts update accordingly. Retained overflow is disclosed, not discarded. No-Land shows zero / No Land; equipment still follows its normal maintenance policy without pretending there is a property payout. Negative future purse movement is displayed negative.

Tests cover the previous 3,591 discrepancy, prorated first period, 1/30/59-minute buys, reserved/unreserved/paused maintenance, concurrent settlement, offline catch-up and process restart. The 1/30/59 example with four total starter plots pays 16 eligible gold at the first saved boundary and uses a full next hour without resetting.

## Additive migration and preservation

`018_gameplay_refinement.sql` adds `health_restorations`, `bot_finance_cycles`, and immutable `bot_finance_events`, plus their constraints. `gameplay-refinement-1` records the new rules. No existing column, balance, row or saved catalog is updated/deleted. Historical commands/battles/fees/refunds, Phase 4.4 quote records and legacy bot event journals remain. New orders cannot use the retired militia route, while an already completed internal legacy receipt replays without charging.

No `gray` adjustment, dev reset or bot provisioning runs during upgrade/startup. The old separately authorized grant tool remains available historically; **do not rerun grant or initialization as part of this release**. Achievements/tutorial/sessions persist. The populated 017 fixture and native restored-copy gate compare every old business-table row before and after migration and require all 450 bots.

## Manual Railway upgrade — backup and restored copy first

Keep GitHub autodeploy **disabled**. Do not deploy until the backup/export/restore steps succeed. These require owner-authenticated Railway access and were not run against the live service here. Never use the old Codespaces PostgreSQL cluster.

1. In the existing **PostgreSQL service's private authenticated SSH shell**, use its injected credentials; do not print URLs/passwords. Confirm this is the existing realm, then create a new, consistent custom-format backup:

```bash
set -eu
umask 077
export PGHOST=127.0.0.1 PGPORT=5432
export PGUSER="${PGUSER:-${POSTGRES_USER:-}}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-}}"
test -n "$PGUSER" && test -n "$PGPASSWORD" && test -n "$PGDATABASE"
psql -X -v ON_ERROR_STOP=1 -c \
 'SELECT current_database(), (SELECT count(*) FROM accounts) AS accounts, (SELECT count(*) FROM development_bots) AS bots;'
# Expect existing human accounts and 450 bots. Stop otherwise.
test ! -e /tmp/kingdom-phase45-predeploy.dump
pg_dump --format=custom --no-owner --no-acl --file=/tmp/kingdom-phase45-predeploy.dump
pg_restore --list /tmp/kingdom-phase45-predeploy.dump > /tmp/kingdom-phase45-predeploy.dump.list
sha256sum /tmp/kingdom-phase45-predeploy.dump
wc -c /tmp/kingdom-phase45-predeploy.dump
```

2. Export a durable independent copy from your authenticated, linked terminal. Substitute the actual PostgreSQL service name if needed. Use a PostgreSQL client at least as new as the server; keep the dump outside Git/public directories:

```bash
set -eu
set -o pipefail
umask 077
mkdir -p .local/backups
backup_file=".local/backups/kingdom-phase45-$(date -u +%Y%m%dT%H%M%SZ).dump"
railway ssh --service Postgres -- base64 /tmp/kingdom-phase45-predeploy.dump \
 | tr -d '\r' | base64 --decode > "$backup_file"
pg_restore --list "$backup_file" > "$backup_file.list"
sha256sum "$backup_file"
```

Compare the server/local digest. `/tmp` in Railway is not a durable independent backup. Verify managed volume backup completion/retention too. If the CLI adds output or does not support passthrough, use the owner's supported authenticated file transfer and recheck the digest; stop if export cannot be verified. No public PostgreSQL TCP endpoint is needed. For a final cutover recovery point, pause player writes using your private owner access boundary and retain a final backup through the upgrade.

3. Back in the PostgreSQL shell, restore only into a **new distinct** verification database. `createdb` must fail rather than overwrite an existing copy:

```bash
set -eu
restore_database=kingdom_phase45_restore_test
test "$restore_database" != "$PGDATABASE"
createdb --owner="$PGUSER" "$restore_database"
pg_restore --single-transaction --exit-on-error --no-owner --no-acl \
 --dbname="$restore_database" /tmp/kingdom-phase45-predeploy.dump
psql -X -v ON_ERROR_STOP=1 --dbname="$restore_database" -c \
 'SELECT current_database(), (SELECT count(*) FROM accounts) AS accounts, (SELECT count(*) FROM development_bots) AS bots, (SELECT count(*) FROM land_holdings) AS holdings, (SELECT count(*) FROM battles) AS battles;'
```

No `--clean`, database reset, source restore, volume deletion or first-time provisioning. The game role must have access to migrate this copy privately; do not expose the database.

4. Keep the existing private PostgreSQL reference/volume and exact HTTPS `APP_ORIGIN`. Select branch **`feature/kingdom-come-phase-4-5-gameplay-refinement`**, root `/knights-reforged`, config `/knights-reforged/railway.json`, **Dockerfile** builder. Keep `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=8080`, the existing private `${{Postgres.DATABASE_URL}}` reference (actual service name), `KINGDOM_PRIVATE_ALPHA=1` and the previously approved bot feature switches. Keep one replica. Do not use Railpack or a workspace CA override.
5. Remove `KINGDOM_ALPHA_INITIALIZE`, `KINGDOM_DEV_PASSWORD`, `ALLOW_DEV_PROVISIONING` and `RUN_MIGRATIONS`. Add **`KINGDOM_RESTORE_TEST_DATABASE=kingdom_phase45_restore_test`** to the game variables. Do not change `DATABASE_URL` to that copy.
6. Choose **Deploy Latest Commit manually**. Pre-deploy remains `node deployment/migrate.mjs`; it validates/migrates the separate restored copy before opening the live pool, compares every old business-table row, checks immutable catalogs, requires 450 bots and verifies replay. Expect `passed:true` and `liveDatabaseConnected:false`. Only then does the controlled runner apply additive 018 to live. A missing/failed restored-copy check blocks the first 018 upgrade. Startup remains `node deployment/start.mjs`; it does not initialize or migrate.
7. Require `/healthz` healthy on target port **8080**. In the authenticated game-service shell run:

```bash
node deployment/status.mjs
```

Expect `release: phase4.5`, schema head `018_gameplay_refinement.sql`, all existing accounts/450 bots and no bootstrap credentials. This command is read-only. Sign in as an existing account; verify Vault/holdings/gear/achievements/history, heal after damage, buy/sell once/Buy More, run a quest, attack/repeat, inspect XP/actual loot and active bounty count, check income breakdown and logout/login. Test Android/iPhone hardware separately.
8. After acceptance remove `KINGDOM_RESTORE_TEST_DATABASE`; later restarts see 018 and do not rerun the first-upgrade gate. Retain verified backups and the old image. Keep every service-variable change/deploy a deliberate owner action.

Never run `npm test`, development seeds, `dev:bots`, `dev:account`, resets, the old initialization command or the old `gray` grant against live during this upgrade. Tests require independent disposable `_test` databases.

### Recovery

- Failed backup/copy verification: stop and retain the current release, source volume and dumps. Fix only the separate copy/access; no live migration is attempted by the verifier.
- Failed migration: the existing migration transaction/advisory lock prevents half-applied schema. Inspect logs; never reseed/reset.
- Application rollback: restore the known Phase 4.4 image on the same database. 018 adds tables/catalog only; old code ignores them. This restores the old reward/refill behavior for future actions, so keep rollback brief and deliberate. Do not delete new journals, reverse completed transactions or run down-migrations.
- Disaster recovery: restore the verified dump into another fresh database, verify all accounts/450 bots/history and intentionally repoint the private reference only after owner review. Preserve original data and post-backup journals; do not restore over the only realm. Any lost post-backup gameplay is an owner recovery decision.
- Credentials: use existing sealed Railway variables. Never print/commit database URLs, dumps, session cookies or credentials. If an older credential still needs rotation, use the private `psql` hidden `\password` prompt, update the sealed service variable/reference together, verify a fresh private connection and manually restart; pooled old connections are not proof. Do not rerun initialization.

## Verification and remaining gates

Verified against the final runtime source:

| Check | Result |
| --- | --- |
| Full unit / PostgreSQL / HTTP suite | 238 passed, 0 failed, 0 skipped |
| Dedicated PostgreSQL suite | 166 passed, 0 failed, 0 skipped |
| Production EJS / assets / form contracts | 85 checks passed across 67 rendered fixtures |
| Native Codespaces-shaped HTTPS | 56 native POSTs, strict Origin/CSRF and Secure cookies; 0 browser errors |
| Mobile layouts | 320, 360, 375, 390, 393, 412, 430px plus 1366px desktop; 40 status-panel checks and 8 Buy More layouts |
| Existing responsive matrix | 150 existing screen visits plus 48 quest/reward/achievement visits, alongside baseline and fantasy browser suites |
| Standard production container | 10 checks passed, dynamic port 32123, exact backups/restores and persistent sessions |
| Private-alpha production container | 19 checks passed, port 8080, populated 017→018 restored-copy upgrade, all 450 bots retained |
| Compiled server process restart | Sessions, progression, social/financial history and three offline income periods preserved without duplicates |
| Production dependency audit | 0 known advisories at verification time |

The local production-image build uses a temporary, uncommitted build-only managed proxy CA accommodation for npm. TLS validation remains enabled. The committed Railway Dockerfile stays mount-free and the runtime contains no CA secret. Initial container runs hit the workspace disk quota; final sequential runs passed after removing only unused build cache and superseded task images. No database or backup was removed for cleanup.

See [PHASE_4_5_VERIFICATION.json](PHASE_4_5_VERIFICATION.json) and [PHASE_4_5_SECURITY.md](PHASE_4_5_SECURITY.md). Tests use a populated synthetic Phase 4.4 realm, not a downloaded live database. The separate owner-run restored-copy gate is required to verify actual live data. Real Railway edge/private networking, secrets, live backup retention, owner smoke tests and physical Android/iPhone behavior remain unverified here. No APK compatibility claim is made. No gameplay expansion follows this milestone; permanent hosting operational checks and Android packaging remain next.

## Optional Codespace source update (no database operations)

For a first checkout of this new branch in the existing repository:

```bash
cd /workspaces/test
git status --short
# Stop if you have local tracked changes; preserve them before switching.
git fetch origin
git switch --create feature/kingdom-come-phase-4-5-gameplay-refinement \
 --track origin/feature/kingdom-come-phase-4-5-gameplay-refinement
cd knights-reforged
npm ci
npm run typecheck
npm run build
```

If the local branch already exists, use `git switch feature/kingdom-come-phase-4-5-gameplay-refinement` and `git pull --ff-only` instead of creating it. These commands update source/dependencies only. Do not run local migrations, seeds, resets or the game against the original Codespaces database. The manual private Railway upgrade above is separate.
