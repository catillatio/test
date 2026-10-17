# Private Codespaces launch and deployment preparation

Phase 3 dependency installation, TypeScript/build, PostgreSQL and browser tests have run successfully in the development workspace. See [PHASE_3_VERIFICATION.json](PHASE_3_VERIFICATION.json) for the executed gates and limitations. The historical network blockers in older verification files do not describe this phase.

No hosting resources, Codespace, public preview, deployment or merge are created by this work. The supplied container/devcontainer recipes are configuration files; Docker/container builds and provider access policies have not been verified here.

## Existing Codespace and player database

Follow the [README launch steps](README.md#launch-in-an-existing-codespace) from `/workspaces/test/knights-reforged`. Retain the current database URL and secrets. Preserve uncommitted work, stop the old server and back up its PostgreSQL database before migration. Apply the additive migrations using `npm run db:migrate`; no reset, reseed, player deletion or manual SQL edits are required.

The preview helper runs the application and derives its HTTPS origin from Codespaces forwarding variables. An explicitly exported `APP_ORIGIN` wins; update it if it refers to a different origin. Keep port 3000 **Private** in the provider Ports interface and open the authenticated HTTPS browser address from Chrome on Android.

Register a fresh game account and use another browser profile/device for the second player. The provider owner-access boundary is independent of the game's login screen. No demo accounts are created by preview, migration or devcontainer setup.

## New Codespace configuration

The repository-root `.devcontainer/devcontainer.json` points to the application's Compose services. The full Git checkout is mounted at `/workspaces/test`; application commands run in `knights-reforged/`. The PostgreSQL service publishes no host database port and stores its data in a named development volume.

The setup helper uses the lockfile, creates the disposable test database if absent, migrates and runs verification. It does not start a public server or create players. A newly created database is separate from an existing realm: restoring/importing your own backup is necessary if moving player data. Do not remove a volume containing the working realm.

The existing application-local `.devcontainer` entrypoint points at the same checkout/service layout. Existing Codespaces can use their current environment without rebuilding. Creating/rebuilding a cloud environment remains the owner's action; inspect the provider's usage/billing settings first.

## Prepared container hosting

The Dockerfile retains the Fastify/PostgreSQL architecture, builds on Node 24, uses the package lock and runs TypeScript/unit/build gates. The final runtime is non-root and includes compiled code, views, public assets, all immutable catalogs, migrations and deployment helpers.

```bash
cd knights-reforged
docker build -t knights-reforged:phase-3-alpha .
```

No image build has been executed in this workspace. Database tests are not established by the image's unit-only build step. Run the PostgreSQL gates on a designated disposable database before using the image with player data.

Configure secrets/environment through the selected provider:

| Variable | Configuration |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Existing private PostgreSQL connection, with the provider's verified TLS requirements |
| `APP_ORIGIN` | Exact private HTTPS browser origin |
| `HOST` | `0.0.0.0` inside the container |
| `PORT` | Provider-assigned port or `3000` |
| `RUN_MIGRATIONS` | Optional `1` for an explicitly chosen startup migration; otherwise run a separate schema job |

The runtime command is `node deployment/start.mjs`. A separate migration job runs `node deployment/migrate.mjs`. The migration runner uses its advisory lock and immutable-ruleset checks. Startup verifies catalog definitions and schema migration head before listening. Health is `/healthz`.

Use an owner-authenticated forwarding/access boundary if providing a private alpha. The application registration page alone does not make an endpoint private. Deployment and paid/public hosting require a separate owner decision; no such actions are performed here.

## Target-environment checks

```bash
npm ci
npm run db:migrate
TEST_DATABASE_URL=postgres://YOUR_TEST_CONNECTION/knights_test npm run verify
npm run check:static
TEST_DATABASE_URL=postgres://YOUR_TEST_CONNECTION/knights_test npm run test:restart
# With the disposable development server running and Chromium available:
npm run test:browser
```

Test URLs must name disposable `*_test` databases; non-loopback test hosts need `ALLOWED_TEST_DATABASE_HOST`. Do not substitute the working player database. The browser script refuses production mode, restricts requests to its designated application origin and generates its own test accounts.

Actual Android device/WebView behavior, provider HTTPS/private access, container builds and PostgreSQL versions beyond the tested development version remain target-environment checks. A Codespaces browser tab is a responsive client, not an Android APK.
