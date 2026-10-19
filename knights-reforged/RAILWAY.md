# Phase 4.7 release automation

The current candidate uses the same game Dockerfile, root directory, private database, pre-deploy migration command, port 8080 and health check. See [non-SSH owner setup and guarded release workflow](docs/phase47/OPERATIONS.md) for the dedicated production branch, one approval gate, encrypted independent backup, separate verification PostgreSQL cluster, signed pre-deploy approval and rollback. No live access or deployment is performed by preparing this branch. Preserve the original service/volume; do not run first-time initialization.

The manual SSH sections below are historical operational references, not the automated upgrade path. Railway does not provide the stable, independently attested SSH host pin assumed by the original Phase 4.7 guide. Do not use unverified host keys or unattended first-use trust as a backup/deployment workaround. The current workflow contains no SSH operations.

# Railway deployment — Kingdom Come

Current branch: `feature/kingdom-come-phase-4-6-rivalries-and-polish`.

**For the existing Phase 4.5 live realm, use [PHASE_4_6_RELEASE.md](PHASE_4_6_RELEASE.md) first:** verified independent backup, separately restored-copy upgrade check, additive migration 019 and manual promotion. Never rerun first-time initialization or reset the development account.
Application/root directory: `/knights-reforged` within `catillatio/test`.
This change prepares deployment; it does not create services, deploy, merge, import data or alter player databases.

The historical [Phase 4.3 initialization guide](RAILWAY_INITIALIZATION.md) records the first launch only. The existing realm retains its initialization marker, accounts and 450 rivals; Phase 4.4 migration/start cannot initialize it. The ordinary-production defaults below keep development features off unless the existing Railway-only private-alpha mode is retained explicitly.

## Build failure and fix

The previous repository Dockerfile contains the exact failing instruction:

```dockerfile
RUN --mount=type=secret,id=proxy_ca,required=false ...
```

That optional mount was for the analysis workspace's HTTPS proxy CA, not a game dependency. The reported Railway error rejects the Dockerfile mount syntax before Node starts; it is not a PostgreSQL, session or Origin failure. We do not have the failing Railway builder's full logs/version, so cannot identify its internal parser implementation conclusively.

The replacement Dockerfile uses ordinary `COPY` and `RUN npm ci` instructions, with no secret/cache mounts or custom frontend. `railway.json` explicitly selects `DOCKERFILE`, bypassing Railpack-generated build plans. Do not try to supply `proxy_ca`, disable npm certificate checks, or change gameplay/security to address this parser error.

The multi-stage image installs from `package-lock.json`, compiles TypeScript, prunes development dependencies and runs as the `node` user. Native Argon2 and its runtime dependencies are retained. Runtime includes `dist`, `views`, `public`, every immutable `rulesets` version, all migrations, the production entrypoints and a read-only status helper. The build context is allowlisted: no `.env`, database dumps, research APKs, development dependencies or screenshots. No database connection or migration is attempted during build. Full automated/PostgreSQL tests run separately.

## 1. Configure the existing service without starting a deployment

1. Disable GitHub automatic deployments for this service before updating a connected branch. Keep changes staged; do not choose Deploy until you have reviewed the database, origin and backup steps below. Config-as-code does not control GitHub autodeploy.
2. Select repository `catillatio/test`, branch `feature/kingdom-come-phase-4-6-rivalries-and-polish`.
3. Set **Root Directory** to `/knights-reforged`.
4. Set **Config File Path** to `/knights-reforged/railway.json` (this setting is repository-relative).
5. The configuration selects **Dockerfile** builder with `Dockerfile` relative to the application root. Clear old Railpack/custom build-command overrides. If a `RAILWAY_DOCKERFILE_PATH` override exists, remove it or set it to `Dockerfile`; do not leave a stale path.
6. The resulting settings must be:

| Setting | Value |
| --- | --- |
| Builder | `DOCKERFILE` |
| Dockerfile | `Dockerfile` |
| Pre-deploy command | `node deployment/migrate.mjs` |
| Pre-deploy timeout | 300 seconds |
| Start command | `node deployment/start.mjs` |
| Healthcheck path | `/healthz` |
| Healthcheck timeout | 120 seconds |
| Restart policy | `ON_FAILURE`, at most 10 retries |
| Replicas | 1 |
| Application sleep | Disabled |
| Shutdown drain time | 15 seconds |

The runtime command uses compiled JavaScript, not `tsx`, `npm run dev`, or a development server. Railway's build log should show the repository Dockerfile and `RUN npm ci`, with no `proxy_ca` flag. A continued line-8 mount error means the service is building an old commit, another Dockerfile or a stale root/config path.

## 2. Production service variables

Set these on the **Node/game service**, not in Git and not as Docker build arguments:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}`, replacing `Postgres` with the existing PostgreSQL service's exact name |
| `APP_ORIGIN` | The exact final browser origin, e.g. `https://YOUR-GAME.up.railway.app` or your HTTPS custom domain; no path/query |
| `ENABLE_DEV_BOTS` | `0` |
| `ENABLE_DEV_BOT_BOUNTIES` | `0` |
| `ENABLE_DEV_BOT_RECRUITMENT` | `0` |

For this approved private-alpha launch, set `PORT=8080` and the HTTP domain's target port to 8080. The server still honors `0.0.0.0:$PORT`; Docker's default and `EXPOSE` are now 8080. Do not set the internal port to the Codespaces port 3001 or place it in `APP_ORIGIN`. Other deployments can still override `PORT` dynamically.

Use the PostgreSQL **private** connection variable. Verify its resolved hostname is the service's `*.railway.internal` host and that both services are in the same Railway project/environment. Do not use `DATABASE_PUBLIC_URL`, add a public TCP proxy, publish port 5432, or copy the local Codespace URL into Railway. Keep any existing PostgreSQL data volume attached and unchanged. The Node container does not need a persistent volume; all player state is in PostgreSQL.

Railway private networking provides the service-to-service transport. Use the supplied private PostgreSQL URL's supported TLS settings; do not blindly add `sslmode=require` to a database that does not offer TLS. For a database provider requiring TLS, configure its verified CA/TLS connection settings. Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`, `rejectUnauthorized:false`, or npm `strict-ssl=false`.

Remove `RUN_MIGRATIONS`, `ALLOW_DEV_PROVISIONING`, copied Codespaces metadata and old proxy/CA workaround variables. Build/start/restart never provision players. Ordinary production keeps rivals disabled. Remove historical `KINGDOM_ALPHA_INITIALIZE` and `KINGDOM_DEV_PASSWORD` before a live upgrade; current production entrypoints refuse them before SQL. Do not initialize or reseed the already live realm. The persistent runtime switches govern rival discovery, recruitment and player-funded bot bounties; no combat/content/economic rules change.

The deployment entrypoints fail before connecting if production `DATABASE_URL` or explicit HTTPS `APP_ORIGIN` is missing/malformed; diagnostics do not include database credentials. Environment variables take precedence over `.env`, and the image contains no `.env`.

## 3. HTTPS, sessions, Origin and CSRF

Railway terminates browser HTTPS and forwards HTTP to Node. Set the single canonical HTTPS browser address explicitly in `APP_ORIGIN`; restart/redeploy after changing it. Use one canonical domain, redirecting aliases at the edge if necessary. `Origin`, request `Host` and forwarded headers cannot choose the trusted address. There is no wildcard `*.railway.app` allowlist. Do not enable broad `trustProxy` to fix CSRF.

Cookies remain `Secure`, `HttpOnly`, `SameSite=Lax`, host-only and session-backed in PostgreSQL. Form CSRF remains bound to the session, and session rotation/logout revocation remain intact. Do not strip browser Origin/Referer headers. The narrow, existing Codespaces localhost-Origin compatibility path is retained for Codespaces and is not enabled for a Railway origin.

Existing accounts/password hashes migrate unchanged. An old Codespaces browser cookie is scoped to its Codespaces hostname; users log in again at the Railway hostname. A new domain does not require resetting accounts or sessions. Replicas would share persisted sessions, but the alpha uses one replica because current request rate limits are process-local.

The registration page alone does not make a service private. For a restricted alpha, configure the owner's approved access boundary before enabling an internet-facing game domain. This work does not provision a public endpoint or an access service.

## 4. Controlled migrations and existing data

Before the owner's first approved deployment, take a backup and decide which database contains the authoritative realm. Creating an empty Railway PostgreSQL service does **not** transfer Codespace accounts. To move the realm, restore a consistent Codespace dump into a separate, empty Railway database while the source game is stopped, verify it, then point the game at that database. Retain the original Codespace database and backup. Do not deploy an empty realm and assume the player data moved.

At an approved deployment, Railway runs `node deployment/migrate.mjs` in the built image, in the private network with runtime variables. No development dependencies are required. It applies only unapplied versioned SQL migrations, uses the existing transaction/advisory lock and validates immutable catalogs. If migration fails or exceeds 300 seconds, the deployment fails; no new server is promoted. Phase 4.5 adds **018** for immutable healing and real-cost bot-finance journals, retaining Phase 4.4’s 016/017 experience/security tables. Prior migrations/catalogs and existing player records are unchanged. The first initialized private-alpha upgrade requires the separate restored-copy check described in the release guide before live migration.

The web start command never applies migrations. `RUN_MIGRATIONS=1` fails with instructions to use pre-deploy. The server verifies schema **017** and installed rulesets before listening. Private-alpha mode additionally requires the durable initialization marker from additive migration `015_private_alpha_initialization.sql`. Restarts cannot reseed players, regrant starting funds or repeat previously committed migration work.

Manual equivalent, only in an approved environment connected to the intended database:

```bash
node deployment/migrate.mjs
node deployment/start.mjs
```

Do not run `db:seed`, `db:reset-demo`, `dev:account --reset`, `DROP DATABASE`, remove PostgreSQL volumes or apply destructive rollback SQL. For an application rollback, prefer a known-compatible prior image against the unchanged database; do not roll back SQL by hand.

## 5. Backup and restore without public PostgreSQL

Use PostgreSQL backups before migration/import and keep an independent, access-controlled copy. Dumps contain private account/session records and password hashes: do not commit them, attach them to issues or place them under `public/`. Railway's Node filesystem is ephemeral; a dump there is not durable backup. Check the plan's retention/cost before enabling scheduled volume backups. No backup schedule or paid service is created by this change.

For Railway-native volume backups, select the existing PostgreSQL volume's **Backups** controls, take a manual backup and verify its completion. Use the Railway plan's documented restore/clone procedure and retain an independent logical dump; never delete the only source volume to test recovery.

The current release uses a private verification job deployed through Railway's authenticated HTTPS API. Follow the [non-SSH owner release procedure](docs/phase47/OPERATIONS.md) for setup, encrypted export, checksum verification, isolated restored-copy migration tests and owner approval. The helper restores only to a separate private PostgreSQL cluster. No SSH gateway key, first-use trust or public database proxy is required.

For independent owner recovery, download the retained encrypted artifact, check the ciphertext hash, decrypt locally using the offline age identity, check the archive hash, and inspect it with PostgreSQL 18-or-newer `pg_restore --list`. Exact commands and expected manifest fields are in that procedure. Keep the encrypted owner copy independently of Actions retention. Never upload plaintext backups to a public URL.

For the original local Codespace database, a local `pg_dump` may use its existing private `PG*` variables on the trusted machine. That is a separate operator recovery task; the release workflow never accesses or resets Codespaces PostgreSQL.

Restore only to a separately named, fresh private recovery database after explicitly verifying its identity and emptiness. Do not use `--clean`, restore over the live realm, delete its volume, or change the game's database reference automatically. Compare migration heads, accounts, sessions, wallets, Vaults, inventory, Land, ledgers, battles, bounties and comments before an owner-approved recovery switch. The routine upgrade does not restore the game database at all.

## 6. Health, restart and operator checks

`/healthz` runs `SELECT 1`, returns HTTP 200 and `{ "status": "ready", ... }` only with working database access, and does not create a session/cookie. It is compatible with Railway's healthcheck Host and internal HTTP forwarding. No login or Origin exemption is added for gameplay POSTs.

Railway's configured healthcheck gates deployment readiness; it is not a continuous uptime monitor. `ON_FAILURE` restarts a crashed process up to ten times. Set owner-approved monitoring/alerts separately for a running process that hangs or a later database outage. Docker also includes a local-port healthcheck. SIGTERM closes Fastify and its PostgreSQL pool; 15-second draining allows normal transactions to complete.

After an owner-approved deployment, check:

1. Build says Dockerfile, then clean lockfile install and TypeScript compilation; no proxy mount error.
2. Pre-deploy migration succeeds, with no seed/reset commands or database URL printed.
3. Startup reports the intended canonical HTTPS origin, assigned port and `secureCookies:true`; `/healthz` is ready.
4. Native browser registration, returning-account login, quests, purchases, Land, Vault, PvP and logout work at that exact HTTPS address. Foreign Origins and invalid CSRF still receive HTTP 403.
5. A controlled server restart preserves accounts/sessions and does not reapply income, escrow, loot or starting grants. Compare actual financial ledgers after any data import.

Do not use the live player database as `TEST_DATABASE_URL`. Full regression tests require a separate designated `*_test` database. No provider deployment, production-database mutation, public PostgreSQL or Android compatibility verification is performed by these preparation steps.

## Verification record

See [PHASE_4_4_VERIFICATION.json](PHASE_4_4_VERIFICATION.json) for current checks and [PHASE_4_4_SECURITY.md](PHASE_4_4_SECURITY.md) for the pre-alpha security review. [RAILWAY_INITIALIZATION_VERIFICATION.json](RAILWAY_INITIALIZATION_VERIFICATION.json) retains the historical first-launch checks. [RAILWAY_VERIFICATION.json](RAILWAY_VERIFICATION.json) retains the earlier deployment-only results before migration 015. Both distinguish the local managed-proxy CA accommodation from provider checks still requiring the owner. Railway project access, service settings, domain/TLS issuance and deployment promotion are outside local verification.

Repeat the portable image/runtime check on a normal Docker-enabled Linux host:

```bash
cd knights-reforged
docker build -t kingdom-come:railway-check .
docker pull postgres:18-bookworm
npm run test:container
```

The checker creates uniquely named disposable containers/databases and a private network, publishes no ports and removes only its own resources. It ignores the current `DATABASE_URL`. It checks an unmigrated startup failure, all eighteen pre-deploy migrations, native Argon2, runtime assets, dynamic port binding, real HTTP gameplay, duplicate-command handling, repeated migration preservation, custom-format backup/restore equality, graceful shutdown, persisted sessions and income schedules. `KINGDOM_TEST_PRIVATE_ALPHA=1 npm run test:container` additionally checks a populated Phase 4.4 realm upgrading with all 450 rivals, hidden database-password rotation and redeployment without bootstrap secrets on port 8080. It requires the managed/local Docker socket at `/var/run/docker.sock` and does not automatically install Docker or pull images. The workspace's intercepting HTTPS proxy requires a temporary CA mount for local npm build steps; that local-only validation Dockerfile is not the committed Railway Dockerfile, and no workspace CA is installed into the runtime image.

Official references checked during preparation: [Dockerfiles](https://docs.railway.com/builds/dockerfiles), [config as code](https://docs.railway.com/config-as-code/reference), [pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command) and [current configuration schema](https://railway.com/railway.schema.json).
