# Phase 4.7 — Owner release and recovery procedure

Nothing below has been run against live Railway. The implementation branch is a release candidate; it has not been merged or deployed. Keep the existing URL, service, PostgreSQL volume and `DATABASE_URL` reference. Never run first-time initialization, seed, bot provisioning, dev-account reset or the historical gray grant on an upgrade.

## One-time setup, mainly in the Android browser

Use GitHub's website (Desktop site if Settings is hidden), not the limited mobile app settings. These setup actions are performed by the owner after reviewing the code/checks.

1. **Railway → game service → Settings → Source:** disable GitHub autodeploy. “Wait for CI” alone is not the approval gate. Keep autodeploy disabled for every release. Keep PostgreSQL's public TCP proxy disabled. Confirm Dockerfile builder, Root Directory `/knights-reforged`, Config File `/knights-reforged/railway.json`, pre-deploy `node deployment/migrate.mjs`, start `node deployment/start.mjs`, port 8080 and `/healthz`. One replica; sleeping disabled. `DATABASE_URL` stays a reference to the existing PostgreSQL private URL; `APP_ORIGIN` stays the exact existing public HTTPS origin.
2. **GitHub → Code → branch selector:** create `release/production` from the deployed Phase 4.6 commit `109e475abb010155387be013c8f2b313c257b5bf`. Open a PR from `feature/kingdom-come-phase-4-7-game-feel-and-polish` into `release/production`. Review the release/security notes and successful checks; merge only after owner approval. Do not merge into `main`.
3. **GitHub → Settings → Branches → Default branch:** after the approved merge, select `release/production`. GitHub requires a `workflow_dispatch` workflow on the repository's default branch to expose **Run workflow**. This changes the default branch setting; it neither edits nor merges `main`. Future feature PRs should target `release/production`.
4. **Settings → Rules → Rulesets / branch protection:** protect `release/production`; require a PR and successful `checks`; block force-push/deletion and restrict direct writes. Do not give untrusted contributors release-branch or workflow-editing access. Keep `main` separate.
5. **Settings → Environments → New environment:** create exactly `production`. Add **only the realm owner** (`catillatio`) as required reviewer. Disable administrator bypass. For a sole owner who also clicks Run workflow, leave “Prevent self-review” off: the separate **Review deployments → Approve and deploy** action is still required. Set deployment branches to **Selected branches**, exactly one branch rule: `release/production`. Do not add wildcard or tag rules. If your GitHub plan does not support required environment reviewers for this repository, stop; the workflow intentionally refuses to release. Enable the necessary protection rather than removing the guard.
6. **Railway project → Settings → Tokens:** create a dedicated project/environment-scoped production token. Do not use a broad personal API token. In **GitHub → Settings → Environments → production → Environment secrets**, add `RAILWAY_TOKEN`. Do not store it as an unprotected repository secret.
7. **One-time SSH setup:** current Railway SSH needs a registered SSH key. Use a dedicated automation identity restricted to this project where supported. Generate a separate unattended Ed25519 key on a trusted device/secure terminal, register only its public key through Railway's SSH-key settings, then store the private key as production environment secret `RAILWAY_SSH_PRIVATE_KEY`. Never paste it in chat, commit it or put it in Railway application variables. Registering SSH may require account/workspace permission in addition to the project token; if the rehearsal rejects it, fix the permissions instead of widening the workflow or exposing PostgreSQL.

   ```sh
   umask 077
   ssh-keygen -t ed25519 -f kingdom-release-key -C kingdom-release -N ''
   ```

   A trusted existing Railway SSH connection can supply its verified `ssh.railway.com` known-hosts entry. Store that entry as environment secret `RAILWAY_SSH_KNOWN_HOSTS`. If collecting it with `ssh-keyscan`, compare its fingerprint through an independently trusted Railway source/connection before saving it. The workflow uses `StrictHostKeyChecking=yes`; it never silently accepts a new host key. Key creation/verification is the one setup step that may need a secure terminal; future releases can be approved entirely in the Android browser.
8. **Backup encryption:** create an owner-controlled age identity on a trusted device:

   ```sh
   umask 077
   age-keygen -o kingdom-backup.agekey
   ```

   Keep that **private decryption identity offline**, with a second protected recovery copy. Put only the printed `age1…` public recipient into the repository variable below. Losing the private identity makes encrypted exports unrecoverable. Do not put it in GitHub or the game service.
9. **Settings → Secrets and variables → Actions → Variables:** create these non-secret repository variables. Obtain Railway IDs from the existing project/environment/service settings; use IDs, not guesses or display names.

   | Variable | Value |
   | --- | --- |
   | `KINGDOM_RELEASE_ENABLED` | `true`, after completing protection and credential setup |
   | `KINGDOM_RAILWAY_AUTODEPLOY_DISABLED` | `true`, only after verifying that setting in Railway |
   | `KINGDOM_RELEASE_OWNER` | `catillatio` |
   | `RAILWAY_PROJECT_ID` | Existing project UUID |
   | `RAILWAY_ENVIRONMENT_ID` | Existing production environment UUID |
   | `RAILWAY_GAME_SERVICE_ID` | Existing game service UUID |
   | `RAILWAY_PG_SERVICE_ID` | Existing PostgreSQL service UUID |
   | `KINGDOM_PRODUCTION_ORIGIN` | Exact current `https://…` origin, without a path/query |
   | `KINGDOM_BACKUP_RECIPIENT` | Owner's `age1…` public recipient |

   Ensure initialization credentials/flags have been removed from Railway: `KINGDOM_DEV_PASSWORD`, `KINGDOM_ALPHA_INITIALIZE`, `ALLOW_DEV_PROVISIONING`, `RUN_MIGRATIONS`. Keep the already-enabled private-alpha and individual bot feature switches; do not reinitialize anything. Rotate/revoke old exposed credentials using Railway's private password-rotation procedure and update the referenced database secret together. No credentials are included in this release.
10. Enable Railway managed PostgreSQL volume backups/appropriate retention too. Allow capacity for a separate full restore plus a 128 MiB margin. The script checks database-volume and temporary free space before dumping/restoring. Configure GitHub encrypted artifact retention (90 days in this workflow); download an independent encrypted copy to durable owner storage before that expires. GitHub artifacts and `/tmp` are not indefinite disaster-recovery storage.

## First rehearsal and subsequent releases

1. Wait for **Kingdom Come checks → checks** to succeed for the exact `release/production` commit. Feature-branch checks alone are not sufficient; merge commits have different SHAs.
2. Open **Actions → Owner approved Railway release → Run workflow**. Select `release/production`. Leave **Deploy after all gates?** off for the first rehearsal.
3. The safety job verifies the exact protected branch, successful push checks, sole-owner reviewer, disabled bypass and exact deployment branch restriction. It has no Railway/SSH credentials. The release job pauses at the environment gate. The owner must use **Review deployments → Approve and deploy**. There is one explicit production-environment approval per release run.
4. The approved rehearsal verifies the actual game service's HTTPS/private-alpha/port configuration and that the selected PostgreSQL service matches the game's private host and database. It exports a custom-format backup inside PostgreSQL, verifies export SHA-256/size/archive readability, encrypts the independent runner copy, restores a **new** `kc_gh_<run>_<attempt>_restore_test` database, then runs the candidate's actual compiled migrations against that copy. Every pre-existing business row and all 450 bots must be preserved; a second migration must be unchanged. The original database is never used as a test target.
5. The encrypted backup and report are uploaded, downloaded independently and checked again before promotion. Any failure stops the job. The rehearsal performs no deployment or source-database migration. Native SSH/project-token authorization, host-key setup, actual managed backup retention and provider capacity must be established by this real owner-run rehearsal; they were not available in the development workspace.
6. Download the recovery artifact and verify decryption locally once:

   ```sh
   umask 077
   # From the downloaded artifact directory; keep the key path private.
   sha256sum realm-gh_RUN_ATTEMPT.dump.age
   age --decrypt -i /secure/path/kingdom-backup.agekey \
     -o /secure/path/phase47-recovery.dump realm-gh_RUN_ATTEMPT.dump.age
   sha256sum /secure/path/phase47-recovery.dump
   pg_restore --list /secure/path/phase47-recovery.dump > /secure/path/phase47-recovery.list
   ```

   Compare encrypted and plaintext SHA-256 values with `backup-manifest.json`. Use PostgreSQL tools at least as new as the server. The automated private restored-copy result demonstrates database restoration and migration, while this owner check verifies that the offline key can recover the independent encrypted artifact.
7. For the actual release, **Run workflow again**, select `release/production`, enable **Deploy after all gates?**, and approve the new environment request. The backup/restore checks run again with a fresh snapshot. Only after an independently retained encrypted backup passes does the job stage `KINGDOM_RESTORE_TEST_DATABASE` and the exact `KINGDOM_RELEASE_SHA` using `--skip-deploys`, then call the pinned Railway CLI's deliberate deployment command. No seed or initialization command exists in the upgrade path.
8. Pre-deploy verifies the restored copy again before applying 020 to the real target. Health must report both `phase4.7` and the exact commit. The job resolves the new service instance, checks schema/450 bots/no bootstrap credentials and confirms the anonymous login page. Failure stops; it does not reset or restore the live database automatically.
9. Owner smoke test on the unchanged public URL: an existing session and login/logout; purse/Vault/inventory/Land/army/old reports; upcoming income; repeated quest/attack; Buy More after backgrounding; sound opt-in/volume on physical Android Chrome and iPhone Safari; mute after reload. Listen to the cues at normal device volume. Recheck after an hourly payout. A broader public-test recommendation still depends on these provider/device checks.

Future updates follow the same feature PR → successful production-commit checks → Run workflow → one owner environment approval sequence. No backup/restore/migration commands need to be copied through Codespaces. Keep GitHub autodeploy disabled in Railway. The workflow does not change that provider setting itself; the variable records the owner's attestation.

The private restore database and PostgreSQL-side dump are deliberately retained for review/recovery. They have unique names and are never overwritten or automatically dropped. Review storage usage and archive the independent backup before owner-approved cleanup of specifically identified old **test copies**. Never point `DATABASE_URL` at a test copy during normal deployment.

## Manual fallback when automation is not configured

Do not deploy without a verified backup. Use your authenticated Railway terminal, with `KC_PROJECT_ID`, `KC_ENVIRONMENT_ID`, `KC_GAME_ID` and `KC_PG_ID` set to the reviewed existing UUIDs (non-secret). Do not set or print a PostgreSQL URL in this terminal.

Open the **PostgreSQL service** shell, not the Codespace's PostgreSQL:

```sh
railway ssh --project "$KC_PROJECT_ID" --environment "$KC_ENVIRONMENT_ID" --service "$KC_PG_ID"
```

Inside PostgreSQL's private shell:

```sh
set -eu
umask 077
export PGHOST=127.0.0.1 PGPORT=5432
: "${PGDATABASE:?}" "${PGUSER:?}" "${PGPASSWORD:?}"
psql -X -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS accounts FROM accounts; SELECT count(*) AS bots FROM development_bots;'
test ! -e /tmp/kingdom-phase47-before.dump
pg_dump --format=custom --no-owner --no-acl --file=/tmp/kingdom-phase47-before.dump
pg_restore --list /tmp/kingdom-phase47-before.dump > /tmp/kingdom-phase47-before.list
sha256sum /tmp/kingdom-phase47-before.dump
wc -c /tmp/kingdom-phase47-before.dump
```

Review the identity/counts (all 450 bots, existing humans). Stop on a tiny/empty archive or unexpected counts. Record the SHA-256, then exit back to the authenticated local terminal. Export an independent protected copy:

```sh
set -euo pipefail
umask 077
cd /path/to/test/knights-reforged
mkdir -p .local/backups
test ! -e .local/backups/kingdom-phase47-before.dump
railway ssh --project "$KC_PROJECT_ID" --environment "$KC_ENVIRONMENT_ID" --service "$KC_PG_ID" -- base64 /tmp/kingdom-phase47-before.dump \
 | tr -d '\r' | base64 --decode > .local/backups/kingdom-phase47-before.dump
pg_restore --list .local/backups/kingdom-phase47-before.dump > .local/backups/kingdom-phase47-before.list
sha256sum .local/backups/kingdom-phase47-before.dump
```

The independent SHA-256 must equal the PostgreSQL-side value exactly. Keep this file private; it includes hashed credentials and sessions. Encrypt a durable recovery copy using the owner-controlled age recipient and verify decryption as above. Never put a dump or private key in Git. If the CLI adds output to the transfer, the digest must fail; stop and use its supported authenticated SFTP transfer instead.

Return to the same PostgreSQL private shell and restore **only a new copy**:

```sh
set -eu
export PGHOST=127.0.0.1 PGPORT=5432
restore_database=kingdom_phase47_restore_test
test "$restore_database" != "$PGDATABASE"
createdb --owner="$PGUSER" "$restore_database"
pg_restore --single-transaction --exit-on-error --no-owner --no-acl \
 --dbname="$restore_database" /tmp/kingdom-phase47-before.dump
```

`createdb` must fail if that name exists; choose a new uniquely named `*_restore_test` copy for another attempt. Never use `--clean`, overwrite the source, reset it or detach its volume. Leave `DATABASE_URL` pointing to the original database.

In Railway's existing game service, manually select `feature/kingdom-come-phase-4-7-game-feel-and-polish` as the source branch, keep GitHub autodeploy **disabled**, retain the existing Docker/root/origin/private-database settings, and stage `KINGDOM_RESTORE_TEST_DATABASE=kingdom_phase47_restore_test`. Remove any old initialization credentials/flags. Choose **Deploy Latest Commit** deliberately, after approving the verified backup/copy. The candidate pre-deploy image verifies/migrates the copy and requires every old row to survive before opening the source pool for real migrations. No local Codespace database is used.

After deployment, in the authenticated existing game shell:

```sh
node deployment/status.mjs
node deployment/audit-bots.mjs
```

Expect release `phase4.7`, schema `020_game_feel.sql`, original initialized marker, 450 bots and no bootstrap credentials. The bot audit is read-only; it shows actual holdings, gross/upkeep/net, purses/Vaults, due hours, last settlement and funding events. It grants nothing and exposes no human balances. If portfolios have drifted from the tested catalog, review the audit before authorizing any separate correction.

## Two broadcasts: review before hiding

The unwanted Gray / Development Night messages have **not** been identified or hidden here. Author names alone are insufficient. The owner must inspect immutable IDs, full contents and timestamps. This is separate from release/backup workflows and never runs on startup or migration.

Open the existing game's authenticated Railway shell (replace identifiers with the same reviewed project/environment/game IDs used above):

```sh
railway ssh --project PROJECT_UUID --environment ENVIRONMENT_UUID --service GAME_UUID
```

Inside that shell, read-only queue inspection:

```sh
ALLOW_REALM_MODERATION=1 REALM_MODERATOR_LABEL=realm-owner \
 node deployment/moderate.mjs broadcasts
```

Copy **only the two exact IDs matching the reviewed author/content/times**, then request a read-only digest-bound review:

```sh
broadcast_one=EXACT_FIRST_UUID
broadcast_two=EXACT_SECOND_UUID
ALLOW_REALM_MODERATION=1 REALM_MODERATOR_LABEL=realm-owner \
 node deployment/moderate.mjs review-broadcasts "$broadcast_one" "$broadcast_two"
```

Stop here for explicit owner approval of **both full records**. Do not approve merely because the author looks familiar. After that review/approval, use its exact digest:

```sh
review_sha=EXACT_REVIEW_SHA256
ALLOW_REALM_MODERATION=1 REALM_MODERATOR_LABEL=realm-owner \
 KINGDOM_BROADCAST_REVIEW="$review_sha" \
 KINGDOM_BROADCAST_CONFIRM=HIDE_REVIEWED_BROADCASTS \
 node deployment/moderate.mjs hide-broadcasts "$broadcast_one" "$broadcast_two"

ALLOW_REALM_MODERATION=1 REALM_MODERATOR_LABEL=realm-owner \
 node deployment/moderate.mjs review-broadcasts "$broadcast_one" "$broadcast_two"
```

Verify both are hidden and the public Broadcasts page still works. IDs/content changes, duplicate IDs, non-broadcasts or absent approval/digest cause atomic rejection. Repeating the approved exact operation is idempotent. Unrelated messages, comments and battle activity are untouched. Reverse an incorrect hide through the existing audited mechanism:

```sh
ALLOW_REALM_MODERATION=1 REALM_MODERATOR_LABEL=realm-owner \
 node deployment/moderate.mjs restore EXACT_UUID 'Owner reviewed restoration'
```

Do not put moderation flags or review tokens in persistent service variables. Close the operator shell afterward.

## Rollback and disaster recovery

For a code/UI problem, use Railway deployment history to manually redeploy the known Phase 4.6 image/commit `109e475abb010155387be013c8f2b313c257b5bf`, keeping the same `DATABASE_URL`, origin and volume. The additive 020 tables/trigger and new ruleset are compatible with Phase 4.6; do not down-migrate, remove new journals or restore over current player progress. Old-code resale/XP presentation follows that release until a corrected deployment is approved.

If migration fails, its transaction rolls back and deployment stops. If post-deployment checks fail, the workflow stops and retains recovery evidence; it intentionally does not perform an unreviewed automatic database rollback.

Only for confirmed database damage: stop writes through an owner-controlled maintenance window, verify/decrypt the selected backup, restore to a **new separately named private recovery database**, compare account/bot counts and preserved records, run migration/preservation tests there, and explicitly approve a connection switch after reviewing the recovery point. Keep the original database untouched for investigation. A snapshot cannot include gameplay committed after its capture; do not fabricate or blindly replay rewards. Maintain Railway native backups and independent encrypted exports. No disaster restore is performed by this workflow.

## Reference and verification limits

Workflow syntax is checked with checksum-verified actionlint; action revisions and Railway CLI 5.70.0 are pinned. Provider behavior is based on Railway's [SSH](https://docs.railway.com/cli/ssh), [tokens](https://docs.railway.com/cli/login), [deployment](https://docs.railway.com/cli/up) and [variable staging](https://docs.railway.com/cli/variable) documentation. Local production containers exercise native backup/checksum/restoration and candidate migration preservation. A GitHub/Railway authenticated end-to-end promotion has **not** been run. Credentials, protection-plan availability, provider SSH permissions, host keys and actual Railway backup retention remain setup/acceptance gates.
