# Phase 4.7 — Non-SSH owner release procedure

This supersedes the original Phase 4.7 SSH setup. Railway's gateway does not provide an independently verifiable, stable host-key pin. Remove the old automation SSH secrets; do not use `ssh-keyscan`, `accept-new`, disabled verification or an unattended first-connection prompt as a release workaround. No production release in this repository uses SSH.

Nothing in this update has been deployed or run against live Railway. All development tests use disposable synthetic databases. Keep the existing game URL, original PostgreSQL service, volume and `DATABASE_URL`. Never initialize the realm again, seed bots, reset `dev`, replay the historical gray grant or restore over the game database.

## What changes

1. The owner approves the protected GitHub `production` environment once per manual workflow run.
2. GitHub uses Railway's authenticated HTTPS deployment API/CLI to run a separate private verification service from the checked commit. This is a one-shot job with no public endpoint, SSH key, cron schedule or restart loop.
3. The job reads the game database and exports an age-encrypted custom-format PostgreSQL backup to a private S3-compatible bucket. Its only bucket permissions are short-lived, exact-object presigned grants.
4. It downloads that actual ciphertext, verifies its hash, decrypts using an ephemeral job-only key, restores into a **different PostgreSQL cluster**, and runs the candidate's compiled migrations and preservation checks there. The owner-held age identity can independently recover the same archive. The ephemeral identity and all temporary plaintext are removed.
5. GitHub independently downloads the encrypted backup, verifies its size/hash, retains it in Actions, downloads the retained artifact again, and verifies it again.
6. Only then can GitHub sign an exact-candidate migration approval. The game's pre-deploy verifies that signature, target, expiry, candidate fingerprint and restored-copy identity before opening the game database pool. It checks the isolated copy again, then applies the existing additive migrations.
7. Exact-commit health, anonymous login and a second private read-only status job verify the running release and all 450 bots. Failures stop the workflow; no automatic database rollback occurs.

The rehearsal deploys **only the private helper job**, reads the source, and writes the isolated verification cluster and encrypted backup. It does not deploy or migrate the game. Backup files are never transported through logs, SSH or a public PostgreSQL proxy.

Railway documents its same-environment private service traffic as encrypted WireGuard tunnels. PostgreSQL stays on that isolated network; external control and object transfer use verified HTTPS. This design trusts Railway's authenticated control plane and private network rather than an unattested SSH gateway key.

## One-time setup from GitHub/Railway on Android

Use the websites, with Desktop site enabled if necessary. Most setup is form entry; initial key creation and the first offline recovery check need a trusted terminal once. Subsequent releases need only GitHub's web UI.

This design needs two additional private services and a recovery bucket. Their compute/storage costs depend on the Railway plan; review those before creating them. They have not been created by this change.

### 1. Keep the existing protections

- Disable Railway GitHub autodeploy for the game and helper. Keep the original PostgreSQL private; do not enable a TCP proxy or generate a public database address.
- Keep the existing game Dockerfile, Root Directory `/knights-reforged`, config `/knights-reforged/railway.json`, pre-deploy `node deployment/migrate.mjs`, start `node deployment/start.mjs`, port 8080, one replica and `/healthz`.
- Keep protected `release/production`, required exact-commit `checks`, blocked force-push/deletion and reviewed feature PRs. Do not merge into `main`.
- Keep GitHub environment `production` restricted to exactly `release/production`, with only owner `catillatio` as required reviewer and administrator bypass disabled. A sole owner may leave Prevent self-review off; the separate approval action remains mandatory. If the repository plan cannot enforce this protection, stop.
- The manual workflow must exist on the repository's default branch. If not already configured, make `release/production` the default after the owner-reviewed PR and successful checks; this does not edit or merge `main`.
- Retain the project/environment-scoped `RAILWAY_TOKEN` in **production environment secrets**, never a broad personal API token or an unprotected repository secret.
- Delete `RAILWAY_SSH_PRIVATE_KEY` and `RAILWAY_SSH_KNOWN_HOSTS` from the environment. Revoke only the dedicated old automation SSH key in Railway if nothing else uses it. Do not revoke unrelated personal keys.

### 2. Create a separate private verification PostgreSQL service

This is a new scratch cluster; **do not replace, duplicate a volume over, or reconfigure the existing game database**. Allocate capacity for the source database plus restored copies. Copies have unique names and are retained until specifically reviewed for cleanup.

To avoid a database template creating a public proxy, use **New → Empty Service**, name it `KingdomReleaseCopy`, choose Docker image `postgres:18-bookworm`, attach a **new** volume at `/var/lib/postgresql`, and configure:

| Variable | Value |
| --- | --- |
| `POSTGRES_USER` | `postgres` |
| `POSTGRES_DB` | `railway` |
| `POSTGRES_PASSWORD` | A new strong generated secret, preferably 64 hexadecimal characters; keep it only in Railway |
| `PGDATA` | `/var/lib/postgresql/18/docker` |
| `DATABASE_URL` | `postgresql://postgres:${{KingdomReleaseCopy.POSTGRES_PASSWORD}}@${{KingdomReleaseCopy.RAILWAY_PRIVATE_DOMAIN}}:5432/railway` |

Use one replica, persistent storage, no sleeping and no public domain/TCP proxy. Start only this new scratch database deliberately. Do not deploy all project changes together. The source PostgreSQL is unchanged. The worker checks that the two clusters have different system identifiers; a hostname alias to the source fails.

### 3. Create a dedicated private recovery bucket

Railway → New → Bucket; name it for Kingdom Come recovery. Its Credentials tab supplies **BUCKET**, **ENDPOINT**, **REGION**, **ACCESS_KEY_ID** and **SECRET_ACCESS_KEY**. Use the API bucket name, not the display name. Provision only this new bucket, not the game's staged changes.

Keep it private. Railway currently has no object versioning, object lock or server-side encryption; this workflow encrypts before upload and uses conditional writes. After the first upload, the worker resends the identical ciphertext and requires HTTP 412 to prove the bucket actually enforces `If-None-Match: *`. A provider that rejects the condition or silently ignores it fails the rehearsal; do not remove this check. The repeated upload cannot change the archive even if the provider ignores the condition. A compatible private S3 provider can be used instead.

Record the bucket's URL style. For current virtual-hosted buckets, endpoint `https://t3.storageapi.dev` and API bucket `realm-recovery-EXAMPLE` give origin `https://realm-recovery-EXAMPLE.t3.storageapi.dev`. For a legacy path-style bucket, use the base endpoint origin and set path style `true` below. Copy real values from Credentials.

### 4. Create the private one-shot verification service

Create another **Empty Service**, `KingdomReleaseCheck`. Do not connect it to GitHub or copy the game service settings. Its source is a dedicated, whitelisted bundle uploaded by the workflow, containing its own root `Dockerfile` and **no game Railway config file**.

- Root Directory `/`; Dockerfile builder with root `Dockerfile`.
- Start Command `node deployment/release/worker.mjs`.
- **No pre-deploy command**, healthcheck, public domain, TCP proxy, attached volume or cron schedule.
- Restart Policy **Never**, one replica, sleeping off. Leave it undeployed until the approved rehearsal.

Set these runtime variables; references keep database credentials entirely inside Railway:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `KINGDOM_PRIVATE_ALPHA` | `1` |
| `KINGDOM_RELEASE_WORKER` | `1` |
| `APP_ORIGIN` | Reference the existing game service's `APP_ORIGIN` |
| `DATABASE_URL` | Reference the existing game service's private `DATABASE_URL` |
| `KINGDOM_RESTORE_DATABASE_URL` | `${{KingdomReleaseCopy.DATABASE_URL}}` |
| `KINGDOM_BACKUP_ORIGIN` | Exact HTTPS bucket origin from step 3 |

Railway injects project, environment, service and deployment IDs. Do not invent these. The worker verifies them against the approved request. Do not give the worker permanent bucket credentials, a release-signing key, owner age identity, initialization credential or migration flag. Its PostgreSQL source operations are read-only; database creation/restoration occurs only in `KingdomReleaseCopy`.

### 5. Preserve the owner backup key and create a signing key

Reuse the existing offline age identity and public recipient. **Do not regenerate or discard the identity protecting earlier backups.** If none exists yet, generate one on a trusted device with `age-keygen`; store two protected offline recovery copies. Only its `age1…` public recipient goes to GitHub.

Generate a separate Ed25519 release-signing key once, in a private existing directory, from the reviewed checkout's `knights-reforged` application directory:

```sh
umask 077
mkdir -p .local/release-keys
node deployment/release/create-signing-key.mjs .local/release-keys
```

The command does not access a database/network and does not print private key bytes. Its `wx` files cannot overwrite an existing key. Open the files privately to copy them into the web forms:

- **Private** `kingdom-release-signing.pem` → GitHub **production environment secret** `KINGDOM_RELEASE_SIGNING_KEY` only.
- **Public** `kingdom-release-verify.pem` → GitHub **repository variable** `KINGDOM_RELEASE_VERIFY_KEY` and the **existing game service's Railway variable** of the same name.
- In the game service, also stage `KINGDOM_RESTORE_DATABASE_URL=${{KingdomReleaseCopy.DATABASE_URL}}`.

Paste full PEM text with real newlines; do not add quotes or literal `\n`. Never put the signing private key in Railway. Never put either PostgreSQL URL/password in GitHub. Keep changes staged; do not deploy the game. `KINGDOM_AUTOMATED_RELEASES` and the signed approval are staged by the workflow only after recovery checks succeed.

### 6. GitHub environment secrets and repository variables

Under **Settings → Environments → production → Secrets**, retain `RAILWAY_TOKEN` and add:

| Secret | Source |
| --- | --- |
| `KINGDOM_BACKUP_ACCESS_KEY_ID` | Dedicated bucket Credentials tab |
| `KINGDOM_BACKUP_SECRET_ACCESS_KEY` | Same dedicated bucket |
| `KINGDOM_RELEASE_SIGNING_KEY` | Private Ed25519 PEM from step 5 |

The bucket credential is scoped to the dedicated recovery bucket. Railway's bucket credentials may permit both reads and writes; the worker never receives them, and Actions' independent retained artifact is still mandatory. Restrict access to workflow edits and environment secrets.

Under **Settings → Secrets and variables → Actions → Variables**, keep existing owner/project/environment/game/source-PostgreSQL IDs, canonical production origin and age recipient. Add/update:

| Variable | Value |
| --- | --- |
| `KINGDOM_RELEASE_TRANSPORT` | `private-job-v2` |
| `RAILWAY_RELEASE_WORKER_SERVICE_ID` | Exact `KingdomReleaseCheck` service UUID |
| `RAILWAY_VERIFY_PG_SERVICE_ID` | Exact `KingdomReleaseCopy` service UUID |
| `KINGDOM_DATABASE_HOST` | Existing game's private PostgreSQL hostname, without port |
| `KINGDOM_DATABASE_NAME` | Existing game's database name, normally `railway`; verify it |
| `KINGDOM_RESTORE_DATABASE_HOST` | `KingdomReleaseCopy` private hostname |
| `KINGDOM_BACKUP_ENDPOINT` | Exact base HTTPS endpoint from bucket Credentials |
| `KINGDOM_BACKUP_BUCKET` | API bucket name, not display name |
| `KINGDOM_BACKUP_REGION` | Credentials value, often `auto` |
| `KINGDOM_BACKUP_PATH_STYLE` | `false` for virtual-hosted; `true` only if Credentials says path-style |
| `KINGDOM_RELEASE_VERIFY_KEY` | Public PEM from step 5 |
| `KINGDOM_BACKUP_KEY_VERIFIED` | Initially `false`; change only after successful owner-key recovery below |
| `KINGDOM_RAILWAY_AUTODEPLOY_DISABLED` | `true`, after verifying the provider setting |
| `KINGDOM_RELEASE_ENABLED` | `true`, only after all protections and private resources are ready |

The retained existing variables are `KINGDOM_RELEASE_OWNER=catillatio`, `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_GAME_SERVICE_ID`, `RAILWAY_PG_SERVICE_ID`, `KINGDOM_PRODUCTION_ORIGIN`, and `KINGDOM_BACKUP_RECIPIENT`. All service IDs must be different. No missing value triggers a guessed default or first-time initialization.

Remove old initialization/provisioning variables from game and worker: `KINGDOM_DEV_PASSWORD`, `KINGDOM_ALPHA_INITIALIZE`, `ALLOW_DEV_PROVISIONING`, `RUN_MIGRATIONS`. Enable appropriate Railway-managed game-database backups in addition to the independent export. Keep private credentials and keys out of chat, screenshots, commits and logs.

## First rehearsal and regular release — Android web UI

1. Review the feature PR into `release/production`. After owner approval and merge, wait for successful `checks` on that **exact production commit**. No merge into `main` is needed or performed by the workflow.
2. **Actions → Owner approved Railway release → Run workflow**, select `release/production`, leave **Deploy after all gates?** off.
3. The unprivileged safety job verifies branch protection, exact-commit CI and the sole-owner environment rule. Use **Review deployments → Approve and deploy** for the credential-bearing job. This is the one explicit owner approval per run.
4. The helper job backs up the populated realm, performs the encrypted-object round trip and tests the separate restored database. Check the successful workflow and recovery artifact: source hostname/database, exact SHA, 450 bots, human account count, archive bytes/hashes and unchanged migration replay must match expectations. A tiny/empty backup, stale request, wrong cluster, TLS error, overwrite attempt or preservation failure stops everything.
5. Download `kingdom-recovery-RUN-ATTEMPT`. On a trusted device, verify the owner age identity can recover it:

   ```sh
   umask 077
   sha256sum realm.dump.age
   age --decrypt -i /secure/path/kingdom-backup.agekey \
     -o /secure/path/kingdom-recovery.dump realm.dump.age
   sha256sum /secure/path/kingdom-recovery.dump
   pg_restore --list /secure/path/kingdom-recovery.dump > /secure/path/kingdom-recovery.list
   ```

   Compare ciphertext hash with `report.backup.encryptedSha256` and recovered archive hash with `report.backup.sha256` in `backup-manifest.json`. Use PostgreSQL 18 or newer tools. Keep the independent encrypted export and offline identity in durable owner storage. Only after this succeeds set `KINGDOM_BACKUP_KEY_VERIFIED=true` in GitHub. The worker's temporary second recipient is deleted and is not a replacement for the owner identity.
6. Run the workflow again with **Deploy after all gates?** enabled and give its one environment approval. A fresh backup/rehearsal runs first. Only after Actions upload/download verification does the approved job sign and stage the exact candidate's one-hour migration approval, then deliberately deploy the game through Railway's HTTPS API.
7. Pre-deploy rejects missing/altered/expired signatures, wrong service/source/copy identities and mismatched runtime fingerprints before opening the source pool. The isolated copy is checked again, and its current full-data digest must equal the digest in the signed approval. A copy changed after rehearsal cannot authorize source migration. Normal restarts only start the game; they do not redo provisioning or migration.
8. Check the successful exact-commit health/login/private-status results. Smoke-test an existing session, purse/Vault/inventory/Land/army, old reports, quests, repeated attacks and the next income payment. Physical Android/iPhone audio and browser-interruption acceptance remain owner checks.

Future releases: reviewed PR → exact-commit checks → Run workflow → one owner environment approval. Do not copy backup/restore/migration commands through Codespaces. Never use manual redeployment to bypass a failed or expired approval; run a fresh approved workflow instead.

## Retention, failures and rollback

- Source database operations during rehearsal are read-only. Restored data lives in the separate verification service, not the player's PostgreSQL volume. Temporary plaintext/ephemeral keys are removed; unique restored databases and encrypted durable recovery objects are retained. Review named old test copies and storage usage before any separately authorized cleanup; this workflow never drops a database or deletes recovery objects.
- Actions recovery artifacts expire after 90 days. Railway Buckets have no object-lock/versioning protection. Retain an independent encrypted owner copy before expiry and keep Railway-managed backups. Do not treat an ephemeral job filesystem as a backup.
- No failed safety check is relaxed automatically. Missing project-token access, unsupported conditional S3 uploads, bad TLS, insufficient temporary/verification storage, unavailable owner approval, failed copied-data migration or a bad signing key stops promotion. Keep the existing game running; correct the specific prerequisite and rehearse again. There is no SSH fallback.
- A code/UI rollback keeps the original database and volume. Prepare a reviewed rollback commit restoring the known-compatible application behavior while retaining these release guards and all installed migrations. Run exact-commit CI, the copied-data rehearsal and a fresh approved release for that commit. An expired proof or historical image predating these wrappers is not a valid reason to disable the guard; do not assume Railway's Redeploy button can safely bypass pre-deploy. Do not down-migrate, remove journals, reset the realm or restore over later player progress. For a failed current pre-deploy, keep the existing deployment active, correct the prerequisite and rerun.
- For confirmed database damage only: stop writes in an owner-approved maintenance window, verify/decrypt the chosen recovery artifact, restore to a **new private recovery database**, compare counts and preserved records, and approve any connection switch. Keep the original database untouched for investigation. No snapshot includes gameplay after its capture; no automatic reward replay or disaster restore occurs.

## Broadcast moderation remains separate

The two Gray / Development Night broadcasts remain unchanged. Exact-ID read-only review, digest-bound owner approval, reversible hiding and audit records are still required. The moderation CLI remains in the game image, but this release worker accepts only `prepare` and read-only `verify`; it cannot run moderation or arbitrary shell commands. Do not reuse the superseded SSH instructions for unattended moderation. A separately reviewed authenticated operator job is needed for that task if no trusted operator channel is available.

## Documentation and verification limits

This design uses Railway's documented [private-network pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command), [encrypted private networking](https://docs.railway.com/networking/private-networking), [HTTPS deployment upload](https://docs.railway.com/cli/up), [private storage buckets](https://docs.railway.com/storage-buckets), [presigned object URLs](https://docs.railway.com/storage-buckets/uploading-serving), and [Never restart policy](https://docs.railway.com/deployments/restart-policy). The game keeps its existing service configuration; the new helper uses dashboard settings and a standalone source bundle, without relying on the game's legacy config file.

Local tests exercise real PostgreSQL, encryption/decryption, verified TLS, isolated restoration, signed approvals, migration replay and preserved accounts/bots. Authenticated Railway deployment, bucket conditional-write compatibility, provider permissions, actual backup retention and owner-key recovery still require the owner-approved rehearsal. No provider promotion is claimed verified solely from local tests.
