# Phase 4.6 — Hall of Champions, rivalries and player polish

Branch: `feature/kingdom-come-phase-4-6-rivalries-and-polish`.
Base: deployed Phase 4.5, `51bca0f09698bb4129c97b242ce77b5bb172f49d`.

**No Railway deployment, live database access, account adjustment, broadcast cleanup, realm initialization or merge was performed.** Verification uses synthetic, populated local PostgreSQL realms. The owner must verify their actual backup/restored copy and manually promote this branch. Nothing here resets `dev`, provisions bots on an upgrade or repeats the historical `gray` grant.

The supplied later-remake screenshot informed the compact army/equipment presentation. It is a presentation reference, not evidence of original Storm8 server formulas. All numeric gameplay systems remain those of Phase 4.5; existing artwork is reused and no new illustrations were generated.

## Changes

| Requirement | Implementation |
| --- | --- |
| 1. Hall of Champions | Home and Battle link to a compact, read-only Hall. Four lifetime categories; at most twenty ranked human characters per category; separate accurate personal placement outside the twenty. No ranking rewards or seasons. |
| 2. Rivalries | Human public profiles show **Your Rivalry**: wins both ways, ordinary gold stolen both ways, separate completed claims and five actual encounters. Battle contains five recent human rivals, profile/report links and ordinary attack actions. Temporary rivals are excluded from this section. |
| 3. Revenge | An incoming private report names the attacker and offers a prominent **Revenge** form. It submits the existing normal attack command, not a second combat system. Resource, level, zero-Health, account availability, bot and anti-farming rules still apply. |
| 4. Reward explanations | Result pages show outcome, linked names, actual gold/XP, damage, level progress, achievements and the next action. Repeated-reward messaging is one natural sentence. Old receipt notices also cannot redisplay the technical explanation. Detailed saved results/formulas remain unchanged for internal regression inspection; existing combatant-only report API compatibility is retained. |
| 5. Enemy Equipment | Expandable weapons/armor/spells show the names and quantities saved in that encounter, with existing catalog artwork. Your own saved equipment is also available. Historical missing quantities are explicitly unknown, never replaced with present inventory. |
| 6. Land receipt | A full-width **Return to Land** button opens `/game/land`. Buy More remains immediately available, with updated balances/ownership and the same idempotent commands. |
| 7. Broadcast cleanup | Trusted CLI lists/reviews two exact broadcast IDs, then requires an explicit confirmation and reviewed digest. Both hides commit together using existing audited moderation; concurrent repetition does not add duplicate hides. Restore remains available. No cleanup runs in migration, startup or this development session. Owner procedure below. |
| 8. Tutorial Land | **Put Down Roots → Show Me** opens `/game/land#property-smallholding`, highlights a real purchase row and recognizes a saved purchase immediately after its normal redirect. All other lesson destinations have real anchors too. |
| 9. Tutorial redesign | Clear **New to Kingdom Come?** introduction, Start/Continue, eight short lessons with Show Me, persistent Back/Next/Skip/Resume, recognition of completed actions and a dedicated completion/replay view. Completed players no longer see the Home invitation. Help/Profile retain guide access. No tutorial gold, XP or invented achievements. |
| 10. Simplicity | Five original bottom tabs retained. No streaks, seasons, guilds, currencies, bookmarks, new social feeds or competitive reward modifiers. |
| 11. Security/performance/preservation | Additive indexed summaries are derived transactionally from durable records. Suspended humans cannot be attacked through Revenge or normal direct requests. No current purse/Vault/account/session details enter competitive views. No new polling or browser library. Old business records, catalogs and artwork remain unchanged. |
| 12. Verification/release | Focused/full PostgreSQL regressions, populated Phase 4.5 preservation, production compilation/image, native HTTPS and browser/restart checks. Exact results and limits: [verification](PHASE_4_6_VERIFICATION.json), [security review](PHASE_4_6_SECURITY.md), [screenshots](docs/phase46/screenshots/README.md). |

### Ranking policy

- **Battle Victories:** actual saved wins, attacking or defending, matching the existing battle-win statistic. Legitimate temporary-rival encounters count toward a human's lifetime wins; bots themselves never qualify for any Hall category. A reduced-reward win remains a real battle, not a new gold/XP allowance.
- **Bounty Hunters:** matching `bounty_kills` and completed `bounties` records, including preserved historical claim credits. Active, expired or canceled listings and ordinary knockouts never count. Player-funded temporary-target claims follow the existing alpha rules.
- **Wealthiest Kingdoms:** `sum(remaining quantity × recorded unit purchase price)` across actual Land holdings. FIFO sales remove the sold value; old purchases keep their saved cost. This is a gold valuation of property, not spendable money, current replacement prices, Vault wealth or another currency.
- **Highest Level:** attained level descending, then accumulated XP descending. No level cap is added.
- Other ties: earlier character creation time, then ascending stable UUID. These provide unique, deterministic places; renaming does not change a tie. Microsecond creation timestamps are preserved for the personal-rank comparison.
- Wins/claims/Land require a positive relevant statistic to qualify. New accounts can qualify for Highest Level immediately. Inactive but available human accounts retain lifetime honors. Login-disabled accounts and all development bots are excluded, including inactive bots. A social posting mute alone does not suspend gameplay or ranking.
- Top rows and personal position read one consistent, read-only database snapshot. Personal rank is calculated over the whole eligible category, not merely the visible twenty.

### Rivalry and history policy

Pairs use sorted immutable character IDs. Wins include attacking/defensive victories; ordinary stolen gold is recorded only where the saved PvP-economy result establishes an attacking-only transfer. Earlier ambiguous loot is excluded from gold totals and the view explains how many older encounters lack supported transfer data. No estimate is made from today's balances, equipment or names. Bounty claims are separate counts from verified claim records; their escrow principal never becomes ordinary stolen gold.

Five recent battles retain their exact IDs/timestamps/outcomes and remain private to their combatants. Names link to current character identities. Recent Rivals groups encounters by human pair; individual reports remain accessible. Unavailable humans are omitted from competitive/public profile views. Private participants can still read their historical report, with a disabled Revenge explanation and no fabricated current Health.

### Tutorial policy

The original eight evidence IDs and `player-experience-1` catalog remain unchanged. New lesson text/anchors live in `src/guide.ts`, independently of immutable historical achievement rules. A new cursor stores presentation position/replay state; old `tutorial_steps`, completion flags, achievement dates and region filters are not reset.

Actions already proved by purchases, quest records, battles, owned Land and skill allocations still count. New actions advance the contextual guide after the ordinary server response. Back allows reviewing completed lessons. Next only turns a page; it cannot spend resources or mark an achievement earned. A player may finish by reading all eight lessons rather than being forced to buy something. This completes the educational guide, not fictional gameplay evidence. Explicit replay preserves permanent completion and all real progress. The brief completion effect respects reduced motion and presentation replay suppression.

## Migration 019

`019_champions_and_rivalries.sql` adds:

- `champion_standings`: cached win/loss and completed bounty counts, remaining recorded Land value, level/XP and eligibility; indexed per category.
- `rivalry_totals`: human-pair win/theft/claim totals, unsupported historical-gold count and latest encounter; indexed for each participant's recent rivals.
- A composite battle-pair/time index for five-row history reads.
- `tutorial_guides`: presentation cursor, replay flag and new completion timestamp; existing tutorial evidence/preferences are untouched.
- Transactional triggers for committed battles, claim credits, actual Land changes, level/XP, account availability and bot classification. Updating an existing battle's display metadata does not count it again. Retried commands do not insert another battle or claim.

Backfill is a one-time scan under the existing migration transaction/advisory lock. It briefly locks its source tables against writes to prevent a gap between historical backfill and trigger installation. Plan a short maintenance window; no queued action may be assumed failed merely because its browser response is interrupted—reuse the existing command receipt rather than creating duplicate requests.

Ordinary profile and achievement battle counters now read the same primary-key summary, avoiding a growing battle recount in every page header. Hall queries do not scan battle history, and rivalry history has a five-record bound. The scale fixture checks 1,202 characters and 21,200 stored battles. Query plans are recorded in `docs/phase46/query-plans.json`.

No prior SQL migration, balance formula, immutable catalog, artwork file or old business row is edited by 019. No initialization, bot refresh, grant or broadcast moderation occurs. The server refuses to start without 019; an initialized Phase 4.5 Railway realm requires the restored-copy gate before pre-deploy applies it. Application rollback to Phase 4.5 is compatible with the extra tables/triggers; do not down-migrate.

## Manual Railway upgrade

These are **owner commands**, not actions already performed here. Keep GitHub autodeploy disabled. Do not reuse the original Codespaces PostgreSQL cluster or run tests against the live URL.

1. Open the existing **PostgreSQL service's authenticated private shell**. Use injected credentials without displaying them. Verify existing account and bot counts, then take a fresh custom-format backup. Use PostgreSQL clients at least as new as the server.

```bash
set -eu
umask 077
export PGHOST=127.0.0.1 PGPORT=5432
export PGUSER="${PGUSER:-${POSTGRES_USER:-}}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-}}"
test -n "$PGUSER" && test -n "$PGPASSWORD" && test -n "$PGDATABASE"
psql -X -v ON_ERROR_STOP=1 -c \
 'SELECT current_database(), (SELECT count(*) FROM accounts) AS accounts, (SELECT count(*) FROM development_bots) AS bots, (SELECT count(*) FROM battles) AS battles;'
# Stop if this is not the existing realm with its human accounts and 450 bots.
test ! -e /tmp/kingdom-phase46-predeploy.dump
pg_dump --format=custom --no-owner --no-acl --file=/tmp/kingdom-phase46-predeploy.dump
pg_restore --list /tmp/kingdom-phase46-predeploy.dump > /tmp/kingdom-phase46-predeploy.dump.list
sha256sum /tmp/kingdom-phase46-predeploy.dump
wc -c /tmp/kingdom-phase46-predeploy.dump
```

2. Export an independent protected copy from your authenticated, linked terminal. Replace `Postgres` with the actual service name. Compare its SHA-256 with the server digest. `/tmp` alone is not durable backup storage; verify managed volume backup completion/retention too.

```bash
set -eu
set -o pipefail
umask 077
mkdir -p .local/backups
backup_file=".local/backups/kingdom-phase46-$(date -u +%Y%m%dT%H%M%SZ).dump"
railway ssh --service Postgres -- base64 /tmp/kingdom-phase46-predeploy.dump \
 | tr -d '\r' | base64 --decode > "$backup_file"
pg_restore --list "$backup_file" > "$backup_file.list"
sha256sum "$backup_file"
```

If your CLI adds output or does not support passthrough, use its supported authenticated file transfer and verify the digest. Stop if export cannot be verified. No public PostgreSQL TCP proxy is needed. A final backup during a brief player maintenance window provides the clearest recovery point.

3. In the PostgreSQL shell, restore **only to a fresh, separately named test database**. Do not use `--clean`, overwrite an old copy, restore over the source, detach its volume or reset anything.

```bash
set -eu
restore_database=kingdom_phase46_restore_test
test "$restore_database" != "$PGDATABASE"
createdb --owner="$PGUSER" "$restore_database"
pg_restore --single-transaction --exit-on-error --no-owner --no-acl \
 --dbname="$restore_database" /tmp/kingdom-phase46-predeploy.dump
psql -X -v ON_ERROR_STOP=1 --dbname="$restore_database" -c \
 'SELECT current_database(), (SELECT count(*) FROM accounts) AS accounts, (SELECT count(*) FROM development_bots) AS bots, (SELECT count(*) FROM land_holdings) AS holdings, (SELECT count(*) FROM battles) AS battles;'
```

`createdb` must fail if that name already exists. For another rehearsal choose another new name ending `_restore_test` and use it consistently. The existing game database role needs private access to the copy. Do not change `DATABASE_URL` to the copy.

4. Stage the existing game service configuration, keeping automatic deployments off:

| Setting | Value |
| --- | --- |
| Branch | `feature/kingdom-come-phase-4-6-rivalries-and-polish` |
| Root directory | `/knights-reforged` |
| Config file | `/knights-reforged/railway.json` |
| Builder | Dockerfile, `Dockerfile`; no Railpack/custom CA mount override |
| Pre-deploy | `node deployment/migrate.mjs` |
| Start | `node deployment/start.mjs` |
| Health | `/healthz`, target port 8080 |
| Environment | Existing `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=8080`, exact HTTPS `APP_ORIGIN` |
| Database | Existing private `${{Postgres.DATABASE_URL}}` service reference and persistent volume |
| Private alpha | Keep `KINGDOM_PRIVATE_ALPHA=1` and the previously approved bot switches |
| Replicas | 1; existing restart policy |
| First-upgrade gate | `KINGDOM_RESTORE_TEST_DATABASE=kingdom_phase46_restore_test` |

Remove obsolete `KINGDOM_ALPHA_INITIALIZE`, `KINGDOM_DEV_PASSWORD`, `ALLOW_DEV_PROVISIONING` and `RUN_MIGRATIONS` values if still present. Do not add initialization or moderation confirmation variables as permanent service settings.

5. Choose **Deploy Latest Commit manually**. Pre-deploy first migrates/verifies the separate restored copy, compares every old business-table row and immutable catalog, requires all 450 bots and verifies migration replay. Expect `passed:true` and `liveDatabaseConnected:false` from that copy checker. Only then does the runner apply 019 to the live target. A missing/failed copy gate blocks the first 019 upgrade. Startup never initializes or migrates.

6. Require a healthy `/healthz`, then run in the authenticated **game-service** shell:

```bash
node deployment/status.mjs
```

Expect `release: phase4.6`, schema head `019_champions_and_rivalries.sql`, all existing humans/450 bots and no bootstrap credentials. Sign in with an existing account and verify its Vault, purse, equipment, Land, income, army, achievements and old reports. Check all Hall categories/personal place, human rivalry links, incoming Revenge eligibility, saved Enemy Equipment, Return to Land/Buy More, tutorial Resume and logout/login. Verify existing sessions on the unchanged domain. The backup/copy verification and provider/device smoke tests are owner acceptance steps, not claimed as completed here.

7. After acceptance remove `KINGDOM_RESTORE_TEST_DATABASE` so routine restarts do not recheck an outdated copy. Keep all backups, the known Phase 4.5 image and new journals. Never run seed/reset, bot provisioning, `dev` baseline reset, the historical grant or test commands against live.

## One-time owner-authorized broadcast moderation

This is separate from deployment. **No live IDs or messages have been identified or hidden by Codex.** In an authenticated game-service operator shell, first list public broadcasts:

```bash
ALLOW_REALM_MODERATION=1 node deployment/moderate.mjs broadcasts
```

Review author, full text, date and immutable ID. Select exactly the two intended existing broadcasts; do not select a newer message or a comment. Set non-secret shell variables to those reviewed IDs:

```bash
broadcast_one='REPLACE_WITH_FIRST_REVIEWED_UUID'
broadcast_two='REPLACE_WITH_SECOND_REVIEWED_UUID'
ALLOW_REALM_MODERATION=1 node deployment/moderate.mjs \
 review-broadcasts "$broadcast_one" "$broadcast_two"
```

This second command is still read-only and prints both records plus `reviewSha256`. **Stop here until the realm owner explicitly approves these exact two records.** Only after approval, copy the digest and execute:

```bash
review_sha='REPLACE_WITH_PRINTED_REVIEW_SHA256'
ALLOW_REALM_MODERATION=1 \
REALM_MODERATOR_LABEL='realm-owner' \
KINGDOM_BROADCAST_REVIEW="$review_sha" \
KINGDOM_BROADCAST_CONFIRM=HIDE_REVIEWED_BROADCASTS \
node deployment/moderate.mjs hide-broadcasts "$broadcast_one" "$broadcast_two"
```

The CLI requires production Railway private-alpha metadata/private networking, explicit operator enablement, two distinct broadcast IDs, owner confirmation and the matching review digest. It locks both rows in stable order. Wrong/changed IDs, comments, author-deleted records or missing approval change nothing. A concurrent replay returns `alreadyHidden` without another audit entry. Only those messages become `hidden`; their bodies and existing records remain. New posts and comments/battles are untouched. Nothing is added to startup or migrations.

To reverse a hide deliberately using the existing moderation mechanism:

```bash
ALLOW_REALM_MODERATION=1 REALM_MODERATOR_LABEL='realm-owner' \
node deployment/moderate.mjs restore "$broadcast_one" 'Owner reversal of Phase 4.6 broadcast cleanup'
ALLOW_REALM_MODERATION=1 REALM_MODERATOR_LABEL='realm-owner' \
node deployment/moderate.mjs restore "$broadcast_two" 'Owner reversal of Phase 4.6 broadcast cleanup'
unset broadcast_one broadcast_two review_sha
```

Author-deleted messages cannot be restored. Do not store these one-time confirmation variables in Railway service settings or an automatic deployment command.

## Rollback and recovery

- If backup/export/restored-copy checks fail, stop before promotion. Keep the existing game and source volume; fix only the separate copy/access. Do not initialize or reset.
- A failed migration rolls back atomically under the migration lock. Inspect diagnostics; do not rerun first-launch provisioning.
- For an application problem, manually redeploy the known Phase 4.5 commit/image (`51bca0f…`) on the same database and canonical domain. 019 is additive; the old code ignores its tables, while compatible triggers continue maintaining actual history. Leave the new schema, records and completed actions intact. No down-migration or balance reversal.
- Disaster recovery requires an explicit owner decision: restore the verified backup into **another new** database, check every account/450 bots/history, then intentionally change the private database reference. Retain the original volume and later journals. A snapshot restore can lose actions after the backup; never silently overwrite the only realm.
- Keep secrets sealed. No credential, dump or session token belongs in Git, chat, browser code or command output. Do not use the original Codespaces database for this release.

## Verification and limits

### Recorded verification

| Check | Result |
| --- | --- |
| TypeScript and production compilation | Passed |
| Full automated suite with real local PostgreSQL | 249 passed, 0 failed, 0 skipped |
| Dedicated PostgreSQL suite | 177 passed, 0 failed, 0 skipped |
| Production template/static contracts | 91 passed; 73 EJS fixtures |
| Phase 4.6 browser | 56 responsive visits across eight widths; eight screenshots; no browser errors |
| Native HTTPS forwarding | 56 real browser POSTs; Secure cookies, canonical/rewritten Origin handling, CSRF, logout/login and interrupted-action replay passed |
| Restart | Sessions, standings, rivalries, guide/awards, inventory/Vault/Land/army/social/bounties and exactly three offline shared income cycles passed |
| Production containers | 10 ordinary-production checks and 21 private-alpha checks passed, at ports 32123 and 8080, with no published ports |
| Populated Phase 4.5 migration | All 61 pre-existing tables checked; existing business rows unchanged; 454 accounts including all 450 bots; migration replay unchanged |
| Query scale | 1,202 characters; 21,200 battles including 20,000 head-to-head; indexed top/pair queries and six fixed Hall statements |
| Production dependency audit | Zero known advisories at verification time |

Full suites cover the unchanged gameplay/server logic; the last cosmetic podium/return-button edits were additionally checked through compilation, templates, native browser flows and both final production-container rehearsals. Initial container initialization hit the workspace disk quota; unused build cache and this task's superseded test images were removed, then the complete rehearsals passed. No realm data or operator backup was removed to reclaim space. Local builds use a temporary build-only managed proxy CA accommodation; the committed Railway Dockerfile remains mount-free and TLS validation stays enabled.

These are local production-container/PostgreSQL and headless-browser checks, not a live Railway audit, real-world multiplayer soak test, physical Android/iPhone, Safari, WebView or APK verification. Native provider backup retention, domain/network/secrets, final restored-copy data and owner smoke tests remain acceptance gates. See the exact evidence and remaining operational risks in the linked verification/security reports. After acceptance, hosting and Android packaging remain the next priority; no further gameplay expansion is included here.
