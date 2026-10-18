# Historical Phase 4.3 — first Railway private-alpha initialization

**Historical reference only, for Phase 4.3 commit `99468cc`. The realm is now live. Do not execute the initialization steps for Phase 4.4: current entrypoints reject bootstrap credentials. Use [PHASE_4_4_RELEASE.md](PHASE_4_4_RELEASE.md) to preserve existing data and test a restored copy before upgrade. The password-rotation section below remains operator reference; it does not authorize initialization/reset.**

Repository `catillatio/test`; branch `feature/kingdom-come-phase-4-3-economy-and-progression`; root `/knights-reforged`.

This is a **new Railway realm**, not recovery/import of the original Codespaces database. Do not open, start, migrate, copy, reset or delete the original Codespaces PostgreSQL directory. No deployment or production provisioning was performed from the development workspace; the owner must approve the first deployment below. GitHub autodeploy must stay disabled.

## What changes, and what stays the same

The existing Phase 4.3 equipment, quests, properties, artwork, UI, progression, PvP, bounty escrow/reward limits, army rules, Calling bonuses, income/upkeep and social features are unchanged. The production image defaults to port 8080 and adds an explicitly authorized private-alpha mode.

One pre-deploy operation creates the existing ordinary `dev` character with **50,000 carried gold and ten army participants**, plus **450 existing Phase 4.3 passive rivals**: nine per level through 50, with the existing fantasy identities, quantities, equipment, Land, saved income clocks, maintenance and army cap of ten. Bots remain login-disabled and cannot initiate attacks, post conversations, fund bounties or claim them. Existing bot reward caps remain in effect.

There is no web provisioning endpoint, administrator account, reset-on-startup or password in source code. General `dev:account`, `dev:bots` and demo/reset commands remain prohibited in production. Production private-alpha provisioning requires all of:

- `NODE_ENV=production`, `KINGDOM_PRIVATE_ALPHA=1` and Railway-provided service/environment IDs.
- A PostgreSQL URL whose hostname is the Railway private `*.railway.internal` name, without connection-target overrides. Codespaces/loopback/public-proxy targets are rejected before migration opens a connection.
- The exact temporary confirmation `KINGDOM_ALPHA_INITIALIZE=INITIALIZE_EMPTY_PRIVATE_ALPHA`.
- An empty player realm and a sealed `KINGDOM_DEV_PASSWORD` of 12–128 characters on the first attempt.

The account, bots, starting funds, inventories, properties and completion journal commit in **one transaction**, protected by a provisioning advisory lock and a registration table lock. The bootstrap also applies the migration runner's existing level-milestone entitlements to newly seeded high-level rivals before committing; the next pre-deploy cannot unexpectedly add those records or points. No entitlement formula changes. A failure rolls back all player provisioning. Migration/schema setup is its own controlled transaction; a failed seed can safely be retried after fixing the reported problem.

The immutable `railway-phase43-private-alpha-v1` journal marks completion. Subsequent armed runs return `alreadyInitialized:true` before reading a password or provisioning players. They never restore starting gold, replenish inventories, replace identities, change password hashes or revoke sessions. Future updates preserve the same `dev` account ID. A nonempty realm without the marker is refused; there is no adopt/force/reset option.

The dev account begins with a full ten-member active army under the existing rules. Further recruitment may require leveling to increase capacity. This initialization does not bypass army capacity or bounty eligibility; bounty placement still requires level 3 and five quests.

## 1. Rotate the exposed PostgreSQL password before first launch

Do this in the **Railway PostgreSQL service**, not the Codespace. Do not expose PostgreSQL with a public TCP proxy. Use Railway's authenticated SSH/shell connection to the existing PostgreSQL service. The official PostgreSQL image includes `psql`.

In that PostgreSQL service shell, use its existing environment variables; do not paste passwords into command arguments/history:

```bash
export PGHOST=127.0.0.1 PGPORT=5432
export PGUSER="${PGUSER:-$POSTGRES_USER}"
export PGPASSWORD="${PGPASSWORD:-$POSTGRES_PASSWORD}"
export PGDATABASE="${PGDATABASE:-$POSTGRES_DB}"
psql -X
```

At the `psql` prompt enter this **client command**, which prompts twice without echoing the new password:

```text
\password
\q
```

Use a new strong, unique password from a password manager. This changes the currently connected PostgreSQL role's actual password; it does not change tables or player records. Do not use the development-account password for PostgreSQL.

Then, in Railway's **PostgreSQL service variables**, synchronize `PGPASSWORD` and `POSTGRES_PASSWORD` to that same new value using the private/sealed variable editor. Keep the existing username, database name and attached data volume. Update both variable names if both are present; do not introduce a second role or recreate the service. Stage/apply the variable changes deliberately through the owner-controlled workflow.

**Changing those environment variables alone does not rotate a password in an already initialized PostgreSQL cluster.** The hidden `\password` step changes the role; the variables keep future clients and restarts consistent. Do this before the first game startup so there are no active game connections to interrupt. For a future rotation, use a controlled game maintenance window, synchronize references, then manually redeploy the game so its pool uses the new credentials.

The game service's `DATABASE_URL` must be a reference to the updated **private** PostgreSQL URL, normally `${{Postgres.DATABASE_URL}}` with your actual service name. Verify the PostgreSQL service's URL formula uses the updated password variable and `RAILWAY_PRIVATE_DOMAIN`, rather than a hardcoded old URL or `DATABASE_PUBLIC_URL`. If necessary construct the private reference from that service's variables:

```text
postgresql://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
```

Use a generated ASCII alphanumeric password if assembling a URL this way, or correctly URL-encode special characters; do not paste the resolved URL into chat/logs. The pre-deploy connection will fail safely if credentials are not synchronized. No PostgreSQL password or role was changed by this code preparation.

## 2. Configure the game service, without deploying yet

| Railway setting | Exact value |
| --- | --- |
| Repository | `catillatio/test` |
| Source branch | `feature/kingdom-come-phase-4-3-economy-and-progression` |
| Root Directory | `/knights-reforged` |
| Config File Path | `/knights-reforged/railway.json` |
| Builder / Dockerfile | `DOCKERFILE` / `Dockerfile` |
| Pre-deploy command | `node deployment/migrate.mjs` |
| Pre-deploy timeout | 300 seconds |
| Start command | `node deployment/start.mjs` |
| Healthcheck / timeout | `/healthz` / 120 seconds |
| HTTP domain target port | `8080` |
| Replicas | 1 |
| Restart policy | On failure, ten retries |
| GitHub autodeploy | Disabled |

Keep the current PostgreSQL service/volume. Do not reset it. Do not copy a Codespaces `.env`, PostgreSQL folder, backup or connection string. Nothing in the image requires local PostgreSQL files or a persistent Node filesystem.

Set these **game-service** variables:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=8080
APP_ORIGIN=https://YOUR-EXACT-APP-DOMAIN
DATABASE_URL=${{Postgres.DATABASE_URL}}
KINGDOM_PRIVATE_ALPHA=1
ENABLE_DEV_BOTS=1
ENABLE_DEV_BOT_BOUNTIES=1
ENABLE_DEV_BOT_RECRUITMENT=1
```

`APP_ORIGIN` is the actual HTTPS browser origin, with no path/query or internal port. Railway terminates HTTPS; the game binds HTTP internally at `0.0.0.0:8080`. Keep Secure, HttpOnly, SameSite cookies, session storage, CSRF and strict Origin validation enabled. Do not set broad `trustProxy`, wildcard Origins or TLS-verification bypasses.

`RAILWAY_SERVICE_ID` and `RAILWAY_ENVIRONMENT_ID` must be supplied by Railway itself. Do not invent them or copy Codespaces metadata. Remove `RUN_MIGRATIONS`, `ALLOW_DEV_PROVISIONING`, `CODESPACE_NAME`, `CODESPACES`, test database variables and prior proxy-CA workarounds from this service.

Private-alpha mode is an operator deployment authorization, **not an internet access firewall**. Configure the owner's chosen private-alpha access boundary before enabling an internet-facing domain. The game login page alone does not make an endpoint private. No domain, access service or public deployment is created here.

## 3. Arm the single first-deployment operation

Add these temporary game-service variables:

```text
KINGDOM_ALPHA_INITIALIZE=INITIALIZE_EMPTY_PRIVATE_ALPHA
```

Add **`KINGDOM_DEV_PASSWORD` as a sealed secret** using the previously established development-account credential. Enter it only in the trusted Railway variable editor. Do not put it in Git, `.env.example`, a command argument, the Dockerfile, a screenshot or chat. Do not set `NODE_ENV=development` to bypass production safeguards.

No manually entered SQL is required for initialization. Choose **Deploy Latest Commit** for the configured Phase 4.3 branch, rather than redeploying an older failed build. When the owner starts that first manual deployment:

1. Docker builds the existing game; no database or player provisioning happens during build.
2. `node deployment/migrate.mjs` validates the explicit private target, refuses unmarked existing player data, then applies migrations 001–015 and immutable catalogs.
3. The armed operation creates `dev` and the 450 rivals atomically, including the ordinary financial/ownership records.
4. The log emits `event: "private_alpha_initialization"`, `initialized: true`, `botsCreated: 450`. It never prints the password.
5. `node deployment/start.mjs` verifies schema/catalogs and the initialization marker, discards the unneeded password from the server process environment, then listens on 8080.
6. `/healthz` must return HTTP 200 with `status: "ready"`.

If initialization fails, inspect its error and fix the missing variable/credential/connection. Retry the same manually approved deployment. Do not clear tables, remove the journal, delete the database, reset accounts or run seed/reset commands. An unmarked nonempty realm requires investigation, not automatic adoption.

## 4. Disarm and verify persistence

After the first successful initialization, remove **`KINGDOM_ALPHA_INITIALIZE` and `KINGDOM_DEV_PASSWORD`** from Railway variables. Keep `KINGDOM_PRIVATE_ALPHA=1` and the three explicit rival feature flags for this approved alpha. Apply these changes with a manual redeploy when ready.

The marker makes accidental reruns harmless even if the confirmation is temporarily left behind and the password has been removed. Changing/readding the bootstrap password later does **not** rotate the existing dev password or reset the account. The startup process has no provisioning path.

From the authenticated game-service shell, this compiled operator command reads status without settling income or changing records:

```bash
node deployment/status.mjs
```

Initially expect `initialized:true`, one `dev` at 50,000 gold/army ten, 451 total accounts, 450 bots, 50 level groups with nine rivals each, maximum bot army ten and minimum three plots. After real play, the dev balance/level/army may legitimately differ and human account count may exceed 451. The command shows **current stored values**, not promises to restore baselines. It never prints passwords, hashes or session tokens.

Runtime switches can independently disable bot bounties or recruitment. Set `ENABLE_DEV_BOTS=0` to disable all rival gameplay without deleting any accounts, records or holdings. Ordinary production without the Railway-only private-alpha opt-in still disables rivals. Bots never gain human conversation or active attack behavior.

## Deployment acceptance checklist

- [ ] The exposed PostgreSQL role password was changed with the hidden prompt and Railway references now use the new private credential.
- [ ] Root/config path, Docker builder, branch and port 8080 match the table; autodeploy remains off.
- [ ] Original Codespaces PostgreSQL remains untouched and is not the deployment target.
- [ ] The first approved pre-deploy installed 015 and logged exactly one completed bootstrap.
- [ ] Status shows `dev` and all 450 rivals; no administrator privileges or seed/reset endpoint exists.
- [ ] Browser login as `dev` succeeds using the established secret; registration, logout and authenticated POSTs work over the exact HTTPS origin.
- [ ] Quests, quantities/Buy More, Land, Vault, army, bot rivals, combat, bounties and social screens function under their existing eligibility/capacity rules.
- [ ] Foreign Origin and invalid CSRF requests remain rejected; cookies remain Secure/HttpOnly.
- [ ] Bootstrap flag/password are removed. A manual redeploy retains account ID, spent gold, XP, inventory, property clocks, history and sessions.
- [ ] Owner-controlled PostgreSQL backups are established and restore-tested separately before meaningful play. Do not treat a tiny empty archive as a verified game backup.

Use [RAILWAY.md](RAILWAY.md) for private backup/restore and provider details. `PGDATABASE` is a **plain database name**, not a complete connection URL; older milestone snippets that assign the full URL to it are invalid and must not be used. No new backup of the original Codespace is made by this initialization.

Executed automated, container and browser checks and the exact provider-access limitations are recorded in [RAILWAY_INITIALIZATION_VERIFICATION.json](RAILWAY_INITIALIZATION_VERIFICATION.json). Actual Railway migration/initialization, provider private DNS, private-access policy and browser-domain validation require the owner's manual first deployment; they are not claimed from local tests.
