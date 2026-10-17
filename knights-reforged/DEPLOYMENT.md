# Deploying or privately previewing from a phone

This package is prepared for an environment with working npm access and PostgreSQL. **Neither a deployment image nor a cloud development environment has been built or launched here.** Local dependency installation is blocked by the sandbox proxy connection. See `VERIFICATION_STATUS.json` for the exact current verification status.

All 53 original project files are retained. New deployment helpers are additive. The separate pre-verification ZIP preserves the original 53 files byte for byte.

## Private browser preview without running a PC

An owner-authenticated cloud development environment with private port forwarding, such as GitHub Codespaces, can run this project. The included `.devcontainer/` configuration runs Node and an internal PostgreSQL service. It publishes no PostgreSQL port.

No Codespace or hosting service has been created. Cloud providers can charge for compute/storage or usage beyond an allowance. Creating one requires your approval and checking the account's billing settings first; a free allowance must not be assumed.

After approving the provider/usage, these steps can be performed in a phone browser:

1. Extract this ZIP using a phone file manager. Put the project contents at the root of a **private** repository through the provider's browser interface. Include the hidden `.devcontainer` directory. If the phone's upload interface cannot include hidden folders, use the provider's web editor to create the two supplied `.devcontainer` files. No PC-hosted server is needed.
2. Open that repository in a cloud development environment that supports the supplied devcontainer. The setup script installs dependencies, creates a disposable `knights_test` database, runs migrations, and runs the typecheck/tests/build. If any check fails, stop and fix its reported error; this package is not pre-certified to pass those checks.
3. In the browser terminal, run `node deployment/preview.mjs`.
4. In the provider's **Ports** interface, confirm port 3000 is **Private / owner-only**, then use its authenticated Open in Browser action. Do not change visibility to public or organization-wide. The devcontainer requests forwarding but cannot enforce or verify the provider's access policy.
5. Sign in to the provider on Android when prompted. Register a fresh game account with a private password. The setup does not create demo players. Use a second authorized device/browser session to test multiplayer.
6. Stop/delete the cloud environment when finished according to the provider's billing/storage policy.

The preview helper derives `APP_ORIGIN` from Codespaces forwarding variables when available, so the game's Origin and secure-cookie checks match the HTTPS preview address. For another provider, set `APP_ORIGIN` to its exact private HTTPS origin. A browser tab in a private Codespace is not an installed Android WebView wrapper.

## Container hosting

The root Dockerfile builds the existing Fastify/PostgreSQL application without converting its architecture. It performs a TypeScript check, unit tests, and build, then uses a non-root runtime with only production dependencies. SQL integration tests need a separate PostgreSQL-backed verification stage; they cannot be claimed from the image's unit-test step alone.

Build in an approved environment with working npm access:

```bash
docker build -t knights-reforged:0.1 .
```

A managed build that requires its session CA can pass `--secret id=proxy_ca,src=/path/to/approved/ca.pem`. TLS verification is not disabled. If a package lock is present, the image uses `npm ci`; otherwise it uses `npm install`. A lockfile is not currently available because dependency resolution has not completed. Generate and retain it after the first successful install.

Configure these values through the hosting dashboard's secret/environment settings, not in source control:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Private PostgreSQL connection URL; use the provider's verified TLS configuration |
| `APP_ORIGIN` | Exact owner-protected HTTPS application origin |
| `HOST` | `0.0.0.0` |
| `PORT` | Provider-assigned port, or `3000` |
| `RUN_MIGRATIONS` | `1` for startup migrations, or omit after running a separate migration job |

The runtime starts with `node deployment/start.mjs`. A separate schema job can run `node deployment/migrate.mjs`. Startup migrations use the existing advisory lock and migration ledger; the database role must have the required schema privileges. The health endpoint is `/healthz`.

**The application login/registration screen is not an owner-only hosting boundary.** Before exposing a container endpoint, configure the provider's private ingress, owner-authenticated port forwarding, or an identity-aware access proxy that allows only your approved identity. If the provider cannot enforce that, do not expose the service. No public deployment or access proxy has been configured by this work.

Do not run the old demo seed commands in an accessible preview. The original seed files are preserved as requested, but the deployment helpers never invoke them. No demo credentials should be posted, embedded in a URL, or shared to authenticate a preview. Create fresh accounts behind the provider access boundary.

## Required verification in the working environment

```bash
npm install
npm run typecheck
npm run build
npm run db:migrate
npm test
TEST_DATABASE_URL=postgres://YOUR_TEST_CONNECTION/knights_test npm run test:postgres
```

Use a disposable database ending in `_test`. For a designated non-loopback test host, set `ALLOWED_TEST_DATABASE_HOST`. Do not point integration tests at production data. Run the supplied browser smoke test only against an approved disposable development realm, with an existing Chromium executable.

The compile, database tests, browser gameplay, and private phone access must all be checked on the target environment. Preparing these files does not establish that any of those runtime checks have passed. No resources were provisioned and no hosting costs were incurred here.
