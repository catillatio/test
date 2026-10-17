# Knights Reforged — local multiplayer prototype

A TypeScript/Fastify modular backend, PostgreSQL schema, and responsive server-rendered interface for a small Knights Reforged recreation. The original server's gameplay formulas were not recovered. All costs, progression, damage, regeneration, and rewards here belong to the documented provisional `recreation-0.1` ruleset.

## Provisional Kingdoms Live Land feature

Land adds persistent property purchases and 60-minute passive income, including full offline hours, with a visible countdown, property upkeep and net income. It uses a separate `land-provisional-0.1` configuration; the existing gameplay ruleset is unchanged. Apply the additive `002_land.sql` migration using `npm run db:migrate` before starting this version. No demo reset or reseeding is required.

See [LAND_SYSTEM.md](LAND_SYSTEM.md) for the provisional policy, configuration, routes, migration instructions and exact testing limitations. The feature's verification is recorded separately in [LAND_VERIFICATION_STATUS.json](LAND_VERIFICATION_STATUS.json). Calculation and countdown tests can run without npm dependencies on Node 24 using `npm run test:land:offline` and `npm run test:land:client`.

## Current verification status

The source for accounts, cookie sessions, persistent characters, all six screens, quests, recruitment, weapon purchase/equip, and two-player battles is written. The templates reuse 11 Knights Reforged artwork files plus two separately recorded Kingdoms Live Land assets. A battle report is authorized for its two participants and persists in the database.

**This project has not yet been started against PostgreSQL or exercised in a browser.** Dependency installation and Docker work were deferred at the user's request. The checks completed so far are offline syntax/reference checks, template-tag-subset rendering with fixtures, HTML form/link/asset checks, and artwork hashes. These checks do not establish TypeScript type correctness, production EJS rendering, SQL correctness, concurrency behavior, or actual browser layout. See [test-results/static-checks.json](test-results/static-checks.json) for the latest local inspection output.

The Fastify/PostgreSQL integration tests and browser smoke script below are implemented but unrun. An Android WebView wrapper has not yet been implemented; the current client is responsive HTML intended for PC and Android browsers. This is not yet a verified completion of the full first milestone.

## Code and endpoints

| Component | Files / behavior |
| --- | --- |
| Application and routes | [src/app.ts](src/app.ts), [src/http-contracts.ts](src/http-contracts.ts) |
| Accounts | [src/auth.ts](src/auth.ts): Argon2id hashes, rotated opaque session cookies, hashed session tokens, CSRF |
| Persistent character reads | [src/game.ts](src/game.ts): health/energy regeneration, owned equipment, army, opponents, authorized reports |
| Gameplay | [src/commands.ts](src/commands.ts): database transactions, idempotency keys, sorted character locks, economy entries |
| PostgreSQL | [migrations/001_initial.sql](migrations/001_initial.sql), [src/migrate.ts](src/migrate.ts) |
| Provisional rules | [rulesets/recreation-0.1/rules.json](rulesets/recreation-0.1/rules.json); also rendered at `/rules` |
| Interface | [views/layout.ejs](views/layout.ejs), six primary view files and supporting views, [public/styles.css](public/styles.css) |
| Artwork | `public/art/`; [source paths and hashes](public/art/provenance.json) |

HTML pages: `/login`, `/register`, `/rules`, `/game/home`, `/game/quests`, `/game/battle`, `/game/armory`, `/game/army`, `/game/land`, and `/game/battles/:id`.

HTML commands: `POST /register`, `/login`, `/logout`, `/game/quests/:id/run`, `/game/army/recruit`, `/game/armory/buy`, `/game/armory/equip`, and `/game/battle/attack`. Successful commands redirect with HTTP 303. All changing forms require CSRF; gameplay forms additionally contain a unique command ID. Every gameplay outcome is calculated on the server.

JSON reads: `GET /api/v1/me`, `/api/v1/opponents`, `/api/v1/battles/:id`. JSON commands: `POST /api/v1/quests/:id/runs`, `/api/v1/army/recruitments`, `/api/v1/inventory/purchases`, `/api/v1/equipment`, `/api/v1/battles`. Authenticate with the same session cookie, and send `X-CSRF-Token` from `/api/v1/me` and a UUID `Idempotency-Key`. A replay returns the stored command result with a current character projection. Prices, rewards, actor identity, and damage supplied by the client are ignored.

## Run locally when dependencies and PostgreSQL are available

Requirements: Node 22 or newer (Node 24 is used for the offline syntax checker), npm, and PostgreSQL. The provided Compose file offers PostgreSQL 17 on loopback port 54329; an existing PostgreSQL instance also works. The following are setup instructions, not commands verified during the source-only development pass.

```bash
cp .env.example .env
npm install
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:3000**. Alternatively, set `DATABASE_URL` in `.env` to your existing database, omit the Compose command, then run migration/seed/start. The database must exist and the role must have permission to create its tables. Migrations are explicit; server startup does not mutate the schema automatically.

To compile and start the production-form entrypoint locally:

```bash
npm run typecheck
npm run build
npm start
```

`APP_ORIGIN` must match the origin used in the browser because POST Origin validation is enforced. For a physical Android phone on your LAN, set it to `http://YOUR_LAN_IP:3000`, keep `HOST=0.0.0.0`, and open that same address from PC and phone. For an Android emulator browser, use a host-access address appropriate to the emulator and set `APP_ORIGIN` accordingly. Local HTTP disables the cookie's Secure flag; production configuration requires HTTPS. The historical production hostname is never a default and is rejected as an application origin.

## Play with two accounts

The optional seed command creates two **normal persisted player accounts**:

| Account | Password |
| --- | --- |
| `arthur` | `DemoKnights!2026` |
| `morgan` | `DemoKnights!2026` |

Use separate browser profiles, a private window, or two devices. Signing into a second account in the same cookie jar replaces that session. You can also register your own account. Other players appear on the Battle screen; refresh the page after they join.

Play the loop: complete a border patrol, recruit militia, purchase the iron sword, equip it, then challenge another character. Both accounts can open the saved report from recent battles. Resources regenerate on server reads/actions; refresh to see updated values. No continuously running client simulation is used.

For development resets:

```bash
npm run db:reset-demo
```

This deletes/recreates only the two named demo accounts and their dependent records, including their battle records. It is a development CLI command, not a public endpoint, and is disabled when `NODE_ENV=production`. It does not reset other players. Seeding without `--reset-demo` keeps existing demo accounts unchanged.

## Checks and tests

The offline inspector requires only Node built-ins:

```bash
node scripts/check-project.mjs
```

It parses TypeScript syntax without resolving packages, checks local imports and declared dependency names, verifies package entrypoints, compiles/renders the EJS tag subset used by the templates with 32 UI fixture cases, checks form/link/asset contracts, and validates recovered-art hashes. It deliberately identifies runtime/database/browser checks as unverified. It does not install anything or open a network connection.

After dependencies are installed:

```bash
npm run typecheck
npm test
```

`tests/rules.test.ts` covers progression thresholds, regeneration fractional time/caps, deterministic combat outcomes for fixed rolls, loot/health limits, and origin configuration. PostgreSQL integration tests skip explicitly when `TEST_DATABASE_URL` is missing; a passing unit-only run does not establish database correctness.

For integration tests, first create a **disposable** database whose name ends in `_test`. For the provided Compose database, for example:

```bash
docker compose exec db createdb -U knights knights_test
TEST_DATABASE_URL=postgres://knights:knights_local@127.0.0.1:54329/knights_test npm run test:postgres
```

These tests apply the real SQL migrations and exercise Fastify injection, actual EJS rendering, account/session security, all six pages, the full gameplay loop, tampered input, report ownership, simultaneous command retries, concurrent wallet spending, concurrent attack cooldowns, ledger consistency, and state surviving application recreation. They create uniquely named test accounts and leave test data in the disposable test database. `test:postgres` fails if the test URL is omitted. A non-loopback test database requires an explicit `ALLOWED_TEST_DATABASE_HOST` setting. These tests have **not** yet been run in this environment.

The browser smoke script requires an already running disposable development realm and an existing Chromium executable:

```bash
BROWSER_EXECUTABLE=/path/to/chromium npm run test:browser
```

It creates two accounts, visits all six screens at PC and phone widths, checks image loading/horizontal overflow, plays the form-driven quest/recruit/purchase/equip/battle loop, and compares the two players' stored report. It restricts requests to `APP_ORIGIN`. It writes screenshots under `test-results/browser/`. It does not download a browser, and a phone viewport does not verify an Android WebView wrapper or physical device. This script has **not** yet been run.

## Scope still requiring verification or implementation

Dependency resolution and a package lock, a full TypeScript check/build, live PostgreSQL migration and concurrency tests, Fastify startup, production EJS rendering, browser interaction/layout, and real process/database restart behavior remain unverified. The Android wrapper and on-device WebView checks remain to be implemented. Hospital, Vault, account recovery, premium purchases, and additional content are later milestones.

No historical server requests are needed to run or test this project. The original PHP implementation, database, delivered game pages, native signer, and combat rules are not being claimed as recovered.
