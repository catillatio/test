# Reproduce the first-stage checks

The active design review is now [Land-only](LAND_ONLY_REVIEW.md); both earlier shared themes were rejected. That page includes the focused capture/comparison commands. The commands below also remain useful for the approved shared transaction safeguards.

Use only a disposable local PostgreSQL database ending in `_test`. Never point these commands at Railway or a database containing real player data. Existing test helpers reject ordinary non-local/non-test targets.

```sh
cd knights-reforged
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55488/phase48_test'
npm run typecheck
npm run build
npm run check:static
npm test
npm run test:browser:phase48
CHROMIUM_NO_SANDBOX=1 npm run test:browser:phase47
```

The example URL belongs to the disposable local container used during development, not an application `.env` or live service. Use the corresponding connection for your own isolated test instance. Browser scripts use the installed Chromium/Chrome selected by `BROWSER_EXECUTABLE` when supplied.

Run the existing `npm run test:restart` only against its own disposable `_test` database: that test explicitly provisions its synthetic 450-bot fixture. This test setup is not an upgrade command and must never be used for production.

No migration or initialization is required by this visual stage. Production release/recovery workflows and operator commands remain unchanged and must not be run to review these screenshots.

The definitive-mockup revision records fresh results in [verification-mockup.json](verification-mockup.json). `test:browser:phase48` now writes to `test-results/phase48-mockup-browser` and visits eight widths, including 1024px for direct composition review. Its checked-in review images are under `docs/phase48/mockup-review/screenshots`. The earlier `screenshots/` directory and `verification-stage1.json` remain historical evidence of the superseded theme.

To reproduce the focused client/PostgreSQL/rendering/security run used for this presentation-only revision:

```sh
npm exec -- tsx --test --test-concurrency=1 \
  tests/phase48-market-client.test.mjs tests/land-client.test.mjs \
  tests/phase43-shopping.test.ts tests/integration.test.ts \
  tests/rendering.test.ts tests/phase44-security.test.ts
```
