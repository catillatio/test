# Knights Reforged — Phase 3 multiplayer alpha

A server-rendered medieval multiplayer RPG inspired by Storm8 Kingdoms Live. Five original-style tabs connect repeatable quests, Mana, quantity equipment, automatically equipped armies, Spirit-based PvP, Land income and character progression. All gameplay calculations run on the server.

**Active rules: `alpha-0.1`.** The content, economic policy and combat formulas are reconstructed Knights Reforged rules. No original Storm8 server formulas are claimed as recovered.

Application: `knights-reforged/` in `catillatio/test`. Development branch: `feature/kingdoms-live-phase-3-alpha`. No branches are merged and nothing is deployed automatically.

## What works

- Persistent accounts and sessions; registration/login/logout, Argon2id, CSRF and strict Origin checks.
- Health, Mana and Spirit with independent offline recovery, levels, skill points, capacity upgrades and milestones.
- 13 equipment entries across Weapons, Armor and Spells; quantity Buy/Sell, FIFO acquisition-cost resale and automatic attack/defense selection.
- Eight repeatable quests with level/equipment/army requirements, separate requirement purchases and persistent story loot.
- Five property types, increasing purchase prices, FIFO selling, 60-minute offline income and separate equipment upkeep.
- Paid militia and consenting player allies, capped participation, nearby-level rivals, Spirit-funded PvP and private persistent reports.
- Compact illustrated phone/PC screens, original recovered navigation/backgrounds, server-synchronized resource and income countdowns, and working forms without JavaScript.

See [PHASE_3_ALPHA.md](PHASE_3_ALPHA.md) for formulas, maintenance policy, compatibility, fidelity and limitations. Current execution results are in [PHASE_3_VERIFICATION.json](PHASE_3_VERIFICATION.json). The older Land/visual audit and verification files describe earlier stages.

Representative tested phone screens are in [the alpha preview gallery](docs/phase-3-preview/README.md).

## Launch in an existing Codespace

Use Node 22 or newer; Node 24 is recommended. PostgreSQL must already exist and be reachable. Keep the existing game's `DATABASE_URL` and player database. Stop the old application and take a database backup before migration; do not run demo reset or recreate the database.

From the Codespaces terminal:

```bash
cd /workspaces/test
git fetch origin feature/kingdoms-live-phase-3-alpha
git switch feature/kingdoms-live-phase-3-alpha
cd knights-reforged
npm ci
npm run db:migrate
npm run verify
node deployment/preview.mjs
```

If the branch is not yet local, Git normally creates it from the fetched remote branch. If you have uncommitted work, preserve it before switching; do not force the switch.

The preview helper derives the HTTPS application origin from Codespaces variables. An exported `APP_ORIGIN` takes precedence: set it to the exact forwarded HTTPS address if it points to an old local address. In **Ports**, keep **3000 Private**, then choose **Open in Browser**. Sign into GitHub in Chrome on Android to use the private forwarded address. This work does not create a Codespace, hosting service or public URL.

Register your own game accounts. Two browser profiles/devices need separate game sessions; the provider's private access still applies. No demo seed is needed.

For a new Codespace, the repository-root `.devcontainer/devcontainer.json` selects Node plus an internal PostgreSQL service and preserves the full Git checkout at `/workspaces/test`. Its setup installs dependencies, migrates and verifies; it creates no players. A new development database does not automatically contain accounts from an existing realm: retain or restore your own database when transferring it. The container recipe has not been built in this workspace.

## Local launch

Use the existing PostgreSQL connection, or the optional development Compose service:

```bash
cd knights-reforged
npm ci
# Only for a new local installation:
cp .env.example .env
# Optional when you want the supplied PostgreSQL container:
docker compose up -d db
npm run db:migrate
npm run dev
```

Do not copy `.env.example` over an existing configuration. Default local origin: `http://localhost:3000`. `APP_ORIGIN` must match the browser origin exactly. HTTPS enables Secure cookies. Historical Blue Paw and Storm8 hosts are rejected.

Compiled entrypoint:

```bash
npm run build
npm start
```

Startup checks the installed alpha rules and migration head. Migrations are explicit and do not run automatically during ordinary startup.

## Test the alpha

```bash
npm run verify
npm run check:static
npm run balance:report
```

Without `TEST_DATABASE_URL`, database suites explicitly skip. For the complete automated suite, supply a **disposable database ending in `_test`**:

```bash
TEST_DATABASE_URL=postgres://YOUR_TEST_CONNECTION/knights_test npm run verify
TEST_DATABASE_URL=postgres://YOUR_TEST_CONNECTION/knights_test npm run test:postgres
TEST_DATABASE_URL=postgres://YOUR_TEST_CONNECTION/knights_test npm run test:restart
```

Create that test database separately. Never use the player database for tests. A designated non-loopback test host also needs `ALLOWED_TEST_DATABASE_HOST`; the included devcontainer sets it to its internal database hostname. Tests create uniquely named accounts, and migration tests create/drop their own temporary schemas. No existing player database is reset.

With a disposable development server running and a local Chromium executable:

```bash
BROWSER_EXECUTABLE=/path/to/chromium npm run test:browser
```

The browser script creates fresh players and exercises real forms on desktop and 390px/360px phone viewports. Requests are confined to `APP_ORIGIN`. Screenshots and machine-readable summaries go into ignored `test-results/`. `CHROMIUM_NO_SANDBOX=1` is available for an isolated test container that cannot start Chromium's sandbox; it is not needed for normal application launch.

Try this manual loop in two game sessions:

1. Run three border patrols; spend the level-up point on Mana.
2. Buy the Clear the Old Road requirements, then repeat that quest. Visit all three Armory categories.
3. Recruit militia, buy extra equipment copies and inspect attack/defense loadouts.
4. Invite the other character using their Recruit army code; accept in the second session.
5. Attack a nearby rival and open the same report from both participants.
6. Buy Land, inspect the countdown, sell an item/property, return after a full hour, and verify income.
7. At level 3, search the Fallen Abbey for the Watchtower Map; work toward later army-gated quests.

The 10–20 minute human-session target remains a playtesting goal. Automated runs establish that progression and the interconnected loop are reachable without administrative grants; they do not establish long-term balance.

## Project map

| Area | Main files |
| --- | --- |
| HTTP and authentication | `src/app.ts`, `src/auth.ts`, `src/http-contracts.ts` |
| Authoritative commands and projection | `src/commands.ts`, `src/game.ts` |
| Equipment and progression | `src/inventory.ts`, `src/progression.ts`, `src/alpha-rules.ts` |
| Economy and Land | `src/economy.ts`, `src/land.ts`, `src/estate.ts`, `src/maintenance.ts` |
| Immutable catalogs | `rulesets/alpha-0.1/`; both earlier catalogs retained |
| Additive SQL | `migrations/003_alpha.sql` through `005_maintenance_audit.sql` |
| Interface and art | `views/`, `public/alpha.css`, `public/realm.js`, `public/art/` |
| Fidelity and evidence | `ORIGINAL_GAME_SPEC.md`, `VISUAL_OVERHAUL.md`, `PHASE_3_ALPHA.md` |

All earlier HTTP gameplay endpoints remain available, including manual equip as a compatibility action. New skill, sale, maintenance, prerequisite-purchase and membership routes are listed in `src/http-contracts.ts`. JSON commands use the session cookie, `X-CSRF-Token` from `/api/v1/me`, and a UUID `Idempotency-Key`.

This alpha is for private playtesting. Bank/Hospital, Bounties, premium systems, account recovery and a native Android wrapper are outside this phase. Responsive browser play is implemented; physical Android testing, multi-day economy balance, hostile-load testing and cloud/container deployment remain separate verification tasks.
