# Kingdom Come Phase 4.4 — player experience and controlled release

Branch: `feature/kingdom-come-phase-4-4-player-experience`.
Base: Phase 4.3 `99468ccca2099bd8a76fff14a86e75c1482aa1ba`.
Repository: `catillatio/test`; application root: `/knights-reforged`.

This release preserves the live realm. **No live Railway connection, backup, grant, migration or deployment was performed by Codex.** The owner requested secure operator commands instead of connecting Railway credentials. The commands below are the remaining operator steps, not claims that the live backup or `gray` grant already happened. No original Codespaces PostgreSQL directory or database is involved.

## Changes and acceptance checklist

| Requirement | Implementation and verification |
| --- | --- |
| 1. All Regions/filter | New players default to All Regions; a validated, persistent per-character filter survives navigation. Compact disclosure menu has selected states, chevron, keyboard dismissal and large touch targets. Locked quests still show levels; server prerequisites are unchanged. PostgreSQL and native HTTPS-browser tests cover the defaults/filter/locks. |
| 2. `gray` grant | Separate operator-only inspect/apply command; exact existing non-bot username plus owner-verified account UUID; +50,000 spendable gold in one locked, journaled, idempotent transaction. No Vault/reset/startup grant. Concurrent/retry and wrong-identity tests pass on synthetic identities. **Live execution pending owner steps below.** |
| 3. Tutorial | Optional eight-step contextual guide; server-derived quest/reward/purchase/automatic equipment/attack/victory/Land/skill facts, persistent progress, skip and Profile resume. Existing progress is recognized without resetting anything. Browser and process-restart tests verify persistence. |
| 4. Quest requirements | Do It opens an illustrated exact-shortfall page; item names, missing quantities, current prices, total and insufficient-gold shortfall. Buy Missing Equipment buys only actual shortages atomically. Do Quest remains a separate confirmation with all ordinary costs/prerequisites. Concurrent receipt/revalidation and native form flow tested. |
| 5. Achievements | 23 cosmetic, immutable, server-awarded medals in five categories; ranks/emblems, descriptions, progress, earned date, retroactive-evidence label, Profile collection. No gold/XP rewards. Existing durable records supply evidence; no invented historical dates. Concurrent awarding and restart persistence tested. |
| 6. Rewards | Distinct victory/defeat, quest rewards, actual gold/XP/damage, level progress, newly earned medals and dedicated level-up/skill/unlock presentation. Sub-second CSS glow/sparks, reduced-motion support and per-session receipt replay suppression; animation never sends a reward request. Real quest level-up, victory report, refresh and reduced-motion browser checks. |
| 7. Announcement | Home Royal Announcements displays exactly `PRE ALPHA BUILD, PLEASE REPORT BUGS TO @savism DISCORD`. Owner-editable release data lives only in `src/announcements.ts`; no public editing route. |
| 8. Land marketplace | Restrained dark property rows, unchanged illustrations, clear price/income/upkeep/owned/level and separate Buy/Sell. Payment details remain available in a compact disclosure. No price, income or settlement formula changes. |
| 9. Buy More | Keyboard-free minus/plus and 1/5/10/Max for buys/sales. Server-derived price/refund steps and projected net/hour. Land has an exact five-minute, owner-bound, single-use confirmation; stale state is rejected before charging. Private receipts immediately offer Buy More. Saved FIFO costs/rates and shared hourly clock preserved/tested. Max means the maximum permitted **single transaction**, including the existing Land limit of 25 and equipment limit of 100. |
| 10. Security | Fixed a high-severity affected static-file dependency; production dependency audit is clean at verification time. Explicit static-file restrictions, persistent account-key authentication throttling, account-key gameplay throttling, bootstrap-credential rejection, no web grant/provisioning routes. Existing moderation is also packaged as a guarded compiled operator command, without development dependencies. See `PHASE_4_4_SECURITY.md` for verified protections, provider checks and remaining risks. |
| 11. Preservation | Additive migrations 016/017 and one new immutable experience ruleset; no old catalog/art/history/balance rewrites. A populated Phase 4.3 fixture preserves every pre-existing business-table row, password/session and all 450 bots. Production upgrade requires the separately restored-copy check before connecting to the live database for migration. **Actual live backup/restore test remains an operator prerequisite.** |
| 12. Verification/delivery | TypeScript, build, real PostgreSQL suites, static/template checks, TLS browser flows, mobile widths and isolated production-container backup/restore/restart checks. Exact recorded results are in `PHASE_4_4_VERIFICATION.json`; screenshots are in `docs/phase44/screenshots/`. Actual Railway routing/credentials/device hardware require owner smoke tests. No merge or deployment. |

All original five bottom tabs and Home-only Land navigation remain. Immediate Attack Again, Spirit checks, bounty-only kills/deaths, escrow, anti-farming limits, diminishing loot, Vault protection, Callings, income, recruitment and social systems retain their existing rules.

### Reference provenance and scope

The supplied original Storm8 screenshots inform missing-equipment and level-up/achievement pacing. The later Knights Reforged remake screenshots inform compact Land rows and Buy More; remake behavior is not presented as verified Storm8 behavior. The historical video was not available at its attachment path in this workspace; no new video observations or recovered server formulas are claimed. All 81 existing fantasy paintings, property sheets and original recovered navigation/background assets are reused unchanged. The new achievement shields and reward accents are hand-authored HTML/CSS; no new generated artwork is claimed.

The existing game authors content through level 50 (some existing properties through 55) but has **no hard character level cap**. This release preserves that architecture and every existing level/XP value. The requested maximum-level medal is therefore honestly called the **current content summit**, with threshold 50 read from the existing catalog; it does not falsely claim an enforced hard cap. The separate Level 50 achievement remains. A future cap change would need its own balance/data review.

## Database changes

- `016_player_experience.sql`: preferences, tutorial steps, permanent achievement awards, expiring owner-bound trade confirmations and query indexes. Consumed confirmation IDs cannot be reused with another command. Existing tables receive indexes only.
- `017_security_and_operator_grants.sql`: immutable authorized-grant journal and durable hashed-identity authentication counters. No grant is executed by this migration.
- `player-experience-1` is the new immutable cosmetic/tutorial catalog. All older SQL/catalog versions remain unchanged.
- Retroactive awards use verified current level, durable battle wins, completed bounty claims, quest totals, recorded property acquisition/holdings, active net income and recruited units/accepted allies. Earned date is the actual recognition time; it is not backdated to an unverified historical event. Awards remain unlocked if holdings later decrease.
- Existing passwords/sessions, player and bot identities, wallets/Vaults, inventory acquisition lots, Land saved rates/cursors, army links, comments, broadcasts, battle/bounty/financial records are not reset or rewritten by migration. New gameplay awards/guide progress are stored only as players use the game.
- Do not run first-time initialization, `db:seed`, `db:reset-demo`, `dev:account --reset`, `dev:bots`, database-reset or volume-recreation commands during this update.

## Owner procedure: prepare and verify the backup first

Keep Railway GitHub autodeploy **off**. Do not choose Deploy yet. Confirm the current game is connected to its existing private PostgreSQL service and volume. These commands require your authenticated Railway dashboard/CLI; the CLI/provider shell syntax was not exercised against your account here. If access or export fails, stop without migrating.

### 1. Create a consistent logical backup in the PostgreSQL service

Open the existing **PostgreSQL service's authenticated SSH shell**, not the game shell and not the original Codespaces database. The PostgreSQL image supplies version-compatible database tools. Use its existing injected credentials without printing them or placing them in command arguments/history:

```bash
set -eu
umask 077
export PGHOST=127.0.0.1 PGPORT=5432
export PGUSER="${PGUSER:-${POSTGRES_USER:-}}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-}}"
test -n "$PGUSER" && test -n "$PGPASSWORD" && test -n "$PGDATABASE"
# Only non-secret identity/counts; expect the EXISTING live realm and 450 bots.
psql -X -v ON_ERROR_STOP=1 -c \
  'SELECT current_database(), current_user, (SELECT count(*) FROM accounts) AS accounts, (SELECT count(*) FROM development_bots) AS bots;'
# Refuse accidental replacement of a previous backup at this path.
test ! -e /tmp/kingdom-phase44-predeploy.dump
pg_dump --format=custom --no-owner --no-acl \
  --file=/tmp/kingdom-phase44-predeploy.dump
pg_restore --list /tmp/kingdom-phase44-predeploy.dump \
  > /tmp/kingdom-phase44-predeploy.dump.list
sha256sum /tmp/kingdom-phase44-predeploy.dump
wc -c /tmp/kingdom-phase44-predeploy.dump
```

If accounts/tables/bot count are wrong, stop. File size alone is not backup verification; the separate restore below is required. `pg_dump` takes a consistent snapshot while the game is running. For an exact cutover recovery point, briefly pause player writes using your owner access boundary and keep a final backup through the deployment.

### 2. Export an independent protected copy

From a trusted terminal with the Railway CLI already authenticated/linked to the correct project/environment (the existing Codespace terminal is acceptable as a file-transfer client; do not read its PostgreSQL files):

```bash
set -eu
set -o pipefail
umask 077
mkdir -p .local/backups
backup_file=".local/backups/kingdom-phase44-$(date -u +%Y%m%dT%H%M%SZ).dump"
# Substitute the ACTUAL existing database service name if it is not Postgres.
railway ssh --service Postgres -- base64 /tmp/kingdom-phase44-predeploy.dump \
  | tr -d '\r' | base64 --decode > "$backup_file"
# Use a PostgreSQL client version at least as new as the server.
pg_restore --list "$backup_file" > "$backup_file.list"
sha256sum "$backup_file"
```

Compare the digest to the server digest. Do not commit or upload the dump publicly: it contains accounts, password hashes and sessions. Retain it independently of Railway's ephemeral `/tmp`; also verify any existing managed volume backup/retention. Do not create a public database TCP proxy for backup access. If your CLI does not support command passthrough without extra output, use the owner's supported authenticated file-transfer workflow and recheck the hash; never treat an unverified export as a backup.

### 3. Restore into a distinct disposable verification database

In the **same PostgreSQL service shell** with the private `PG*` values from step 1:

```bash
set -eu
# createdb fails if this name already exists: never overwrite a prior copy.
restore_database=kingdom_phase44_restore_test
test "$restore_database" != "$PGDATABASE"
createdb --owner="$PGUSER" "$restore_database"
pg_restore --single-transaction --exit-on-error --no-owner --no-acl \
  --dbname="$restore_database" /tmp/kingdom-phase44-predeploy.dump
psql -X -v ON_ERROR_STOP=1 --dbname="$restore_database" -c \
  'SELECT current_database(), (SELECT count(*) FROM accounts) AS accounts, (SELECT count(*) FROM development_bots) AS bots, (SELECT count(*) FROM land_holdings) AS holdings, (SELECT count(*) FROM battles) AS battles;'
```

This must be a separate copy, with all 450 rivals and the expected human records. Never use the live database as `restore_database`. Keep the original volume and dump. Do not use `--clean`, `--create`, `DROP`, or restore over the source. If your game uses a different, restricted database role, ensure it can connect to and migrate this **copy only** before proceeding; do not broaden public network access.

## Manual Railway upgrade

1. Keep autodeploy off and the existing PostgreSQL volume, service and private connection unchanged. Select branch `feature/kingdom-come-phase-4-4-player-experience` **only after the backup steps succeed**. Root `/knights-reforged`, config `/knights-reforged/railway.json`, Dockerfile builder, pre-deploy `node deployment/migrate.mjs`, start `node deployment/start.mjs`, health `/healthz`, target port **8080**, one replica. No Railpack or proxy-CA override.
2. Retain `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=8080`, the exact existing HTTPS `APP_ORIGIN` and private `${{Postgres.DATABASE_URL}}` reference (substitute your actual service name). Retain existing `KINGDOM_PRIVATE_ALPHA=1` and explicitly approved `ENABLE_DEV_BOTS=1`, `ENABLE_DEV_BOT_BOUNTIES=1`, `ENABLE_DEV_BOT_RECRUITMENT=1`. These runtime switches do not provision anyone.
3. **Remove** `KINGDOM_ALPHA_INITIALIZE`, `KINGDOM_DEV_PASSWORD`, `ALLOW_DEV_PROVISIONING` and `RUN_MIGRATIONS`. Do not reset `dev` or reinitialize the realm. Phase 4.4 entrypoints refuse leftover provisioning credentials before SQL.
4. Add game variable **`KINGDOM_RESTORE_TEST_DATABASE=kingdom_phase44_restore_test`**. Do not change `DATABASE_URL` to the copy: the verifier derives only the separate database name privately, without logging credentials.
5. Choose **Deploy Latest Commit manually**. Pre-deploy checks the restored copy **before opening the live pool**, upgrades that copy, compares every pre-existing business-table row, requires all 450 bots, validates immutable catalogs and checks migration replay. It logs `passed:true`, counts, a digest and `liveDatabaseConnected:false`. Only then does the controlled pre-deploy runner apply additive 016/017 to the live database. The web server does not run migrations or initialization at startup. Missing/failed copy verification aborts deployment.
6. Require `/healthz` healthy, then use the exact configured HTTPS origin: register a test account, log in/out, complete a quest, buy missing equipment then explicitly run it, preview/confirm Land, Buy More/sell, visit achievements, skip/resume guide, attack a rival and inspect XP/loot/bounty separation. Verify an existing account's Vault, Land, inventory and history. Keep the old image available.
7. In the authenticated **game service shell**, run `node deployment/status.mjs`. Expect schema head 017, 450 active rivals, no bootstrap credentials. It does not reset anything. Verify the provider settings listed in the security report.
8. After successful verification, remove `KINGDOM_RESTORE_TEST_DATABASE`. Future migrations/restarts see 017 and do not require or rerun the first-upgrade backup check. Do not remove backups. Any variable change/redeploy should remain an explicit owner action.

Do not run development tests against the live connection. All `TEST_DATABASE_URL` commands are for designated independent test databases only.

### Authorized `gray` grant — separate, once only

After backup and the successful owner-approved upgrade, open the authenticated **game service shell**. It already has the private database configuration. There is no web grant endpoint and no password to paste:

```bash
node deployment/grant-gray.mjs inspect
```

Verify the output says exact username **gray**, is the intended existing human account and has the correct account/character identity. If absent, disabled, a bot or ambiguous, **stop**; do not create or guess an account. Compare the UUID/name/level with the known player's identity, then use the inspected account UUID:

```bash
export KINGDOM_GRAY_ACCOUNT_ID='PASTE_THE_VERIFIED_ACCOUNT_UUID'
export KINGDOM_GRAY_GRANT_CONFIRM=GRANT_GRAY_50000_PHASE44
export KINGDOM_OPERATOR_REFERENCE='Realm owner approved Phase 4.4 gray gold adjustment'
node deployment/grant-gray.mjs apply
unset KINGDOM_GRAY_ACCOUNT_ID KINGDOM_GRAY_GRANT_CONFIRM KINGDOM_OPERATOR_REFERENCE
```

The fixed authorization `phase44-authorized-gray-50000-v1` can credit **exactly once**, including concurrent/retried commands. It records before/after balances, operator reference and immutable ledger transaction. Vault and progress remain unchanged; a full purse refuses rather than granting a partial amount. A repeat reports `alreadyApplied:true`. Never put these variables in normal service startup settings. This grant is **not yet applied to the live account** by this implementation.

### Report handling in the production image

The previous `npm run realm:moderate` needs repository development tools, which the production image intentionally excludes. Phase 4.4 packages the **same existing moderation functions** for the authenticated game-service shell. No account becomes an administrator and no web moderation endpoint is added.

```bash
export ALLOW_REALM_MODERATION=1
export REALM_MODERATOR_LABEL='Realm owner'
node deployment/moderate.mjs queue
# Run actions only after reviewing a specific report and substituting its UUID:
# node deployment/moderate.mjs hide MESSAGE_UUID 'Reviewed abusive content'
# node deployment/moderate.mjs restore MESSAGE_UUID 'Review completed'
# node deployment/moderate.mjs mute CHARACTER_UUID 24 'Repeated posting abuse'
# node deployment/moderate.mjs unmute CHARACTER_UUID 'Restriction reviewed'
unset ALLOW_REALM_MODERATION REALM_MODERATOR_LABEL
```

Hide/restore/mute/unmute retain the existing durable moderation journal; a posting mute never changes combat, gold or character progression. Author-deleted messages cannot be restored. Do not paste reports containing personal information into public logs.

## Recovery and credential handling

- Failed copy verification: retain the old running release, source database and backup; fix only the separate copy/permissions. No live migration is attempted.
- Interrupted migration: the existing migration transaction/advisory lock prevents a half-applied migration; inspect logs without resetting/reseeding. Restart only after a clean migration result.
- UI/application rollback: restore the known-compatible Phase 4.3 image/branch against the **same** existing database. New tables/indexes are additive and ignored by old code; do not run down-migrations, undo the audited grant or delete achievement records. Verify this choice in the owner's environment before reopening writes.
- Disaster recovery: restore the verified dump into **another fresh database**, validate accounts/450 bots/holdings/history, then intentionally change the game private reference to that recovered database. Never restore over the only surviving realm or delete its volume. Preserve any post-backup journal before a cutover; rollback of balances after a backup is an owner recovery decision.
- Never print/commit database URLs, passwords, backups or session cookies. If a previously exposed PostgreSQL password still needs rotation, use the private PostgreSQL shell's hidden `psql` `\password` prompt, update the corresponding sealed provider credential/reference together and test a fresh private connection before restarting the game. Existing pooled connections do not prove a new password works. See `RAILWAY_INITIALIZATION.md`'s historical rotation section for the same operator sequence; do not rerun its initialization steps.

## Remaining operator gates

Live backup digest/export/restore verification, exact `gray` identity/grant, actual Railway private networking/health/edge configuration, removal of historical secrets, real-device Android/iPhone checks and owner moderation/abuse monitoring remain unverified here. The supplied tests support a **controlled pre-alpha test**, not a production-security certification or Android APK compatibility claim. See the security report before widening access.
