# Phase 4.7 live-realm release candidate

See [Phase 4.7 release notes](PHASE_4_7_RELEASE.md), [security findings](PHASE_4_7_SECURITY.md), [audio inventory](docs/phase47/AUDIO.md) and [owner approval / Railway operations](docs/phase47/OPERATIONS.md). This branch is not deployed automatically. Upgrade only after backup and restored-copy verification; never initialize or reseed the existing realm. Phase 4.6 features and historical records are preserved. The new game-feel ruleset versions equipment resale and the narrow XP adjustment separately from unchanged loot and Calling mechanics.

The release workflow now uses a private Railway verification job, separate scratch PostgreSQL cluster, authenticated HTTPS encrypted export and signed exact-candidate pre-deploy approval. It requires no SSH keys or host-key exceptions. [Updated Android-friendly setup](docs/phase47/OPERATIONS.md).

# Phase 4.6 live-realm update

Use [PHASE_4_6_RELEASE.md](PHASE_4_6_RELEASE.md) for Hall of Champions, rivalries, Revenge, tutorial polish, one-time reviewed broadcast moderation, backup/restored-copy verification and manual Railway deployment. Do not rerun old initialization or reset player data. Security: [PHASE_4_6_SECURITY.md](PHASE_4_6_SECURITY.md). Reward and income formulas remain those documented in [Phase 4.5](PHASE_4_5_RELEASE.md).

# Kingdom Come — connected multiplayer alpha

Previously Knights Reforged. The application directory, database identifiers and historical research names are retained for compatibility.

A server-rendered medieval multiplayer RPG inspired by Storm8 Kingdoms Live. Five original-style tabs connect repeatable quests, Mana, quantity equipment, automatically equipped armies, Spirit-based PvP, Land income and character progression. All gameplay calculations run on the server.

**Active rules: `game-feel-1` for equipment resale and the narrow XP refinement, `gameplay-refinement-1` for retained healing/loot policy, `alpha-0.3` content, `strategy-0.2` specializations/rewards, `passive-rivals-5` development population, `community-0.1` social policy and `refinements-0.1`, `pvp-economy-0.1` and `progression-economy-0.2` combat/economic rules.** The content, economic policy and combat formulas are reconstructed Kingdom Come rules. No original Storm8 server formulas are claimed as recovered. Earlier immutable catalogs remain installed.

Application: `knights-reforged/` in `catillatio/test`. Development branch: `feature/kingdom-come-phase-4-7-game-feel-and-polish`, based on deployed Phase 4.6, retaining the Codespaces Origin fix. No branches are merged and nothing is deployed automatically.

For the `refinements is not defined` rendering hotfix, use [RENDERING_FIX.md](RENDERING_FIX.md). It requires a fresh build and server restart, with no migration, reset or account/bot provisioning commands.

See [PHASE_4_1.md](PHASE_4_1.md) for finalized bounty rules, immediate repeat combat, public Tales, migration details, verification and exact Codespace commands. [Phase 4.1 screenshots](docs/phase-4-1-preview/README.md) and the [Android packaging assessment](APK_READINESS.md) accompany the milestone. No Android compatibility is claimed from browser tests.

Earlier [PHASE_4.md](PHASE_4.md) and [STRATEGY_MILESTONE.md](STRATEGY_MILESTONE.md) preserve their historical implementation records. Current rules supersede their former combat/bounty limits. The strategy report also covers Calling bonuses, temporary rivals, development-account provisioning, funded bounties, verification and the port-3001 Codespace update. [Earlier milestone screenshots](docs/strategy-preview/README.md) remain available.

See [PHASE_4_3.md](PHASE_4_3.md) for the current XP formula, shared hourly income correction, bounty-only casualties, 450-rival upgrade and data-safe Codespace commands. [All sixteen acceptance sections](PHASE_4_3_CHECKLIST.md) and [current screenshots](docs/phase-4-3-preview/README.md) accompany the milestone. Earlier reports remain historical.

For Railway, use [RAILWAY.md](RAILWAY.md): repository Dockerfile, private PostgreSQL, explicit HTTPS origin, a controlled pre-deploy migration, backup/restore and health/restart settings. No Railway resource or deployment is created by these files.

**Current live Railway update:** follow [PHASE_4_6_RELEASE.md](PHASE_4_6_RELEASE.md) for migration 019 and manual promotion from the existing Phase 4.5 realm. Do not repeat the historical `gray` grant, initialize the realm or reset `dev`. The earlier Phase 4.3/4.4/4.5 guides remain historical records, not this upgrade procedure.

## What works

- All Regions quest filtering with persistent preferences, direct missing-equipment purchases and separate Quest confirmation.
- Optional persistent eight-step tutorial, 23 cosmetic achievements, victory/quest rewards and lightweight level-up celebrations with reduced-motion support.
- Compact property marketplace, keyboard-free 1/5/10/Max quantity controls, server-derived income/refunds, single-use Land confirmations and Buy More.
- Royal Announcements, patched static-file dependency, durable authentication throttling and safe operator-only audited gold adjustment. [Phase 4.4 screenshots](docs/phase44/screenshots/README.md).

- Attack Again with current target Health, finishing attacks to zero, Spirit/resource/reward checks without a combat cooldown and linked public profiles.
- Illustrated saved-rate property holdings on private/public profiles, alongside authoritative income and inventory summaries.
- Persistent Home All/Battles/Comments/Broadcasts feeds, shared profile comments, plain-text rendering, posting/report limits and auditable terminal moderation.
- Compact Home grid, Profile Comments tab, Settings and Recruit/My Army/Dashboard with persistent invitation codes and recipient consent.

- Three persistent Calling specializations, modest combat/recovery tradeoffs and guarded 24-hour switching.
- A funded Bounty List: 1–10,000 gold, exact fee confirmation, one active contract per target, shared 50-placement rolling daily limit, finishing-only claims and kills, cancellation and full principal refunds after 24 hours.
- 450 optional passive development rivals across levels 1–50, armies capped at ten, progression-based equipment/gold, natural recovery and bounded daily rewards.
- Existing persistent `dev` identity; live updates never reset or provision it. The historical development initializer remains local-only.
- Persistent accounts and sessions; registration/login/logout, Argon2id, CSRF and strict Origin checks.
- Health, Mana and Spirit with independent offline recovery, levels, skill points, capacity upgrades and milestones.
- 60 equipment entries: 20 Weapons, 20 Armor and 20 Spells through level 50; quantity Buy/Sell, FIFO acquisition-cost resale and automatic attack/defense selection.
- 40 repeatable quests across 11 regions, through level 50, with level/equipment/quantity/army requirements, separate requirement purchases and 12 persistent discoveries.
- 21 properties through level 55, increasing purchase prices, FIFO selling, 60-minute offline income and separate equipment upkeep.
- Paid militia and consenting player allies and opt-in immediately accepting development rivals, capped participation, nearby-level rivals, Spirit-funded PvP and private persistent reports.
- Four-tab owner Profile with account age, bounty-claim kills/deaths and archived legacy knockouts, illustrated quantity inventories, persistent Attack/Defense training, resource skills, paginated public Tales with private full reports, Gold Flow and account/logout controls; the resource header displays actual active net gold per hour.
- 81 distinct AI-generated fantasy paintings in four efficient WebP sheets; recovered navigation/backgrounds, compact phone/PC screens, server-synchronized countdowns and working forms without JavaScript.
- Shared Codespaces HTTPS origin handling for ordinary development, compiled startup and the preview helper; Secure cookies, CSRF and strict Origin checks remain enforced.

See [KINGDOM_COME_REFINEMENTS.md](KINGDOM_COME_REFINEMENTS.md) for the rename, new remake evidence, Player/Skills/Battles tabs, bounded Attack/Defense allocation and preservation guarantees. See [PHASE_3_5.md](PHASE_3_5.md) for the session fix, new content, balancing, artwork, migration compatibility and verification limits. Earlier Phase 3.5 results are in [KINGDOM_COME_PHASE_3_5_VERIFICATION.json](KINGDOM_COME_PHASE_3_5_VERIFICATION.json). [PHASE_3_ALPHA.md](PHASE_3_ALPHA.md) preserves the earlier formulas and implementation record; its catalog counts and nominal-net display description are superseded by Phase 3.5.

Representative tested phone screens are in [the Phase 3.5 preview gallery](docs/phase-3-5-preview/README.md). The earlier gallery remains intact.

- Keyboard-free quantity steppers and private Buy More receipts for equipment and Land.
- Profile army requests, persistent immediately accepted development allies, shared hourly payment previews and at least 1 XP per eligible human victory.

## Launch in an existing Codespace

Use Node 22 or newer; Node 24 is recommended. PostgreSQL must already exist and be reachable. Keep the existing game's `DATABASE_URL` and player database. Stop the old application and take a database backup before migration; do not run demo reset or recreate the database.

From the Codespaces terminal:

```bash
cd /workspaces/test
git status --short
git fetch origin feature/kingdom-come-phase-4-4-player-experience
git switch -c feature/kingdom-come-phase-4-4-player-experience FETCH_HEAD
cd knights-reforged
npm ci
npm run db:migrate
npm run typecheck
npm run build
export NODE_ENV=development HOST=0.0.0.0 PORT=3001 ENABLE_DEV_BOTS=1 ENABLE_DEV_BOT_BOUNTIES=1 ENABLE_DEV_BOT_RECRUITMENT=1
export APP_ORIGIN=https://super-winner-4r7ppp6g7p4hq4rv-3001.app.github.dev
npm start
```

These commands are only for a separate development Codespace with its own existing backed-up database, not the live Railway update. They install the patched lockfile and additive migrations without any seeding. If this feature branch already exists locally, switch to it and pull with `git pull --ff-only origin feature/kingdom-come-phase-4-4-player-experience`. Preserve uncommitted work before switching. Do not run bot provisioning, `dev:account --reset` or demo resets during this update. For the live game use the Phase 4.4 Railway release guide instead; the original Codespaces database remains outside this task.

Without an explicit public `APP_ORIGIN`, launch methods derive the HTTPS origin from `CODESPACE_NAME`, `PORT` and `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN` (default `app.github.dev`); copied loopback defaults use that address too. An explicit public origin takes precedence, including a Codespaces URL. Update a copied old preview URL explicitly. The preview helper loads `.env` before choosing its port; exported environment variables take precedence over `.env`. Restart the application after updating it; existing accounts and sessions are retained. In **Ports**, keep the running port (normally **3000**, or **3001** when configured) **Private**, then choose **Open in Browser**. Sign into GitHub in Chrome on Android to use the private forwarded address. This work does not create a Codespace, hosting service or public URL.

For the port-3001 `ORIGIN_REJECTED` fix and exact update commands, see [ORIGIN_FIX.md](ORIGIN_FIX.md). Codespaces can rewrite a browser's public Origin to localhost. The server handles that specific rewrite only with a matching canonical HTTPS Referer, same-origin browser metadata and the existing valid session-bound CSRF token; foreign Origins remain rejected.

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

Install the isolated release-controller dependencies for the release safety tests. They are not part of the game runtime:

```bash
npm ci --ignore-scripts --prefix deployment/release
```

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
TEST_DATABASE_URL=postgres://YOUR_TEST_CONNECTION/knights_test npm run test:codespaces
TEST_DATABASE_URL=postgres://YOUR_TEST_CONNECTION/knights_test npm run test:browser:fantasy
```

Create that test database separately. Never use the player database for tests. A designated non-loopback test host also needs `ALLOWED_TEST_DATABASE_HOST`; the included devcontainer sets it to its internal database hostname. Tests create uniquely named accounts, and migration tests create/drop their own temporary schemas. No existing player database is reset.

The non-SSH release rehearsal has its own disposable Docker PostgreSQL clusters and HTTPS object-store fixture. With both local images built, run `KINGDOM_CONTAINER_IMAGE=kingdom-come:checked KINGDOM_RELEASE_WORKER_IMAGE=kingdom-come:release-worker-checked node scripts/test-release-worker.mjs`. CI builds the game Dockerfile and `deployment/release/Dockerfile` first. This test uses no Railway token, live database or pre-existing volume.

With a disposable development server running and a local Chromium executable:

```bash
BROWSER_EXECUTABLE=/path/to/chromium npm run test:browser
```

The ordinary browser script creates fresh players and exercises real forms on desktop and 390px/360px phone viewports. Requests are confined to `APP_ORIGIN`. `test:browser:fantasy` starts its own loopback test realm and qualified late-game fixtures in the designated test database; it checks all paintings and the late-game loop at 330, 360, 390 and 1366px. `test:codespaces` uses a real local TLS proxy, a self-signed test certificate and a Codespaces-shaped hostname mapped exclusively to loopback; it contacts no provider. These scripts require local Chromium; the HTTPS fixture also requires OpenSSL. Screenshots and summaries go into ignored `test-results/`. `CHROMIUM_NO_SANDBOX=1` is available for an isolated test container that cannot start Chromium's sandbox; normal application launch does not need it.

Try this manual loop in two game sessions:

1. Run three border patrols; spend the level-up point on Mana.
2. Buy the Clear the Old Road requirements, then repeat that quest. Visit all three Armory categories.
3. Recruit militia, buy extra equipment copies and inspect attack/defense loadouts.
4. Invite the other character using their Recruit army code; accept in the second session.
5. Attack a nearby rival and open the same report from both participants.
6. Open Home → Land, buy a property, inspect the countdown, sell an item/property, return after a full hour, and verify income.
7. At level 3, search the Fallen Abbey for the Watchtower Map; work toward later army-gated quests.

The 10–20 minute human-session target remains a playtesting goal. Automated runs establish that progression and the interconnected loop are reachable without administrative grants; they do not establish long-term balance.

## Project map

| Area | Main files |
| --- | --- |
| HTTP and authentication | `src/app.ts`, `src/auth.ts`, `src/http-contracts.ts` |
| Authoritative commands and projection | `src/commands.ts`, `src/game.ts` |
| Equipment and progression | `src/inventory.ts`, `src/progression.ts`, `src/alpha-rules.ts` |
| Economy and Land | `src/economy.ts`, `src/land.ts`, `src/estate.ts`, `src/maintenance.ts` |
| Immutable catalogs | `alpha-0.3`, `strategy-0.2`, `passive-rivals-3`, `community-0.1`, `refinements-0.1`; previous versions retained |
| Social, profiles and allies | `src/community.ts`, `src/feeds.ts`, `src/profiles.ts`, `scripts/moderate.ts` |
| Compatible SQL | Compatible migrations through `012_refinements.sql`; all earlier migrations retained |
| Interface and art | `views/`, `public/alpha.css`, `public/refinements.css`, `public/realm.js`, `public/art/` |
| Fidelity and evidence | `ORIGINAL_GAME_SPEC.md`, `VISUAL_OVERHAUL.md`, `PHASE_3_ALPHA.md`, `PHASE_3_5.md` |

All earlier HTTP gameplay endpoints remain available, including manual equip as a compatibility action. New skill, sale, maintenance, prerequisite-purchase and membership routes are listed in `src/http-contracts.ts`. JSON commands use the session cookie, `X-CSRF-Token` from `/api/v1/me`, and a UUID `Idempotency-Key`.

This alpha is for private playtesting. A separate Bank/Hospital, premium systems, account recovery and an installable Android client are outside this phase. Bounties and persistent social systems are implemented. Responsive browser play is implemented; physical Android testing, multi-day economy balance, hostile-load testing and cloud/container deployment remain separate verification tasks.
