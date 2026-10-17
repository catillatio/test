# Provisional Kingdoms Live Land implementation

This feature implements the Land income loop in the existing multiplayer prototype. The 60-minute cycle is a user requirement based on player recollection. Property names, prices, yields, upkeep, ownership limits and the policies below are **provisional recreation choices**, not recovered original Kingdoms Live rules. See [ORIGINAL_GAME_SPEC.md](ORIGINAL_GAME_SPEC.md) for the evidence boundary.

## What is implemented

- A sixth **Land** navigation entry, responsive property catalogue, purchase forms and persistent holdings.
- Gross hourly income, property upkeep, net hourly income, next payment time, a live countdown and an ownership list.
- Authenticated purchases with server-selected prices, rates, timestamps, ownership and quantity limits. Clients submit only a property ID, quantity, command ID and CSRF token.
- Full-hour passive income, including all complete offline hours, settled automatically on character reads and gameplay commands. An offline defender is settled before PvP uses their balance.
- Atomic payment history, persisted income cursors and ledger credits. Concurrent requests and retried purchases use the existing character locks and command receipts.
- Original Kingdoms Live Land menu icon and default castle backdrop, copied unchanged under separate asset names with [provenance](public/art/land-provenance.json).

Existing quest, recruitment, item purchase/equip, account/session and PvP behavior is retained. There is no new unit or equipment upkeep. The initial migration and `recreation-0.1` JSON are unchanged. No account reset or reseeding is required.

## Central configuration

All property definitions and limits are in [rulesets/land-provisional-0.1/rules.json](rulesets/land-provisional-0.1/rules.json). [src/land-rules.ts](src/land-rules.ts) validates that configuration and implements exact integer accrual arithmetic. The current initial property costs 45 gold, so an ordinary new character can purchase it.

The interval is required to be 3,600 seconds in this implementation. Property upkeep cannot exceed income in this version: negative net income, debt and forced asset sales would need an explicit new policy. They are not silently inferred from the historical game.

Ruleset IDs are immutable in the database. To change a live catalogue, create a new version/ID, update the configured JSON file path in `src/land-rules.ts`, then run migrations to register it. Do not edit an already-installed ruleset under the same ID. Each holding snapshots its name, price, income, upkeep, interval and ruleset at purchase, so later catalogue changes do not alter income already promised to existing owners. Removed catalogue entries still appear in the holdings list.

## Provisional payment policy

1. **Each purchase batch starts its own clock.** Its first payment is due exactly 60 minutes after the server purchase timestamp. Buying additional property cannot earn for time before that purchase.
2. **Only full hours pay.** Fractional time is retained. A late read moves the stored cursor forward by the number of full intervals, preserving its original phase rather than resetting it to the read time.
3. **Income minus property upkeep is paid per batch.** Total hourly figures sum all owned quantities and their stored rates. The countdown shows the earliest next batch payment; different purchases can have different payment times.
4. **Offline time accrues without a running browser or background job.** The next successful character materialization calculates every complete missed hour in one transaction. Gold is made available before the next successful purchase, quest or battle. The browser polls for current server state and never issues money itself.
5. **No offline cap or partial-hour payout is applied.** A restart or session change does not erase the cursor or holdings.
6. **Existing integer wallets remain intact.** If the wallet reaches its existing maximum of 2,147,483,647 gold, overflow income remains durable in `land_accounts.pending_gold`. Spending makes room for collection on the next materialization. Income is neither lost nor allowed to overflow the old schema.

These policies are documented so that later historical evidence can replace them deliberately. They are not assertions about original global-hour alignment, tax, Bank protection, unit upkeep, sale/refund behavior or insolvency rules.

## Database changes and duplicate-payment protection

[migrations/002_land.sql](migrations/002_land.sql) adds only:

- `land_holdings`: persistent purchase batches and immutable rate snapshots, with the last accrued timestamp.
- `land_income_settlements`: the paid interval range, interval count, gross income, upkeep and net income. `(holding_id, period_start_at)` is the primary key.
- `land_accounts`: exact pending net income retained until it fits the existing wallet.

The migration runner also registers the separate Land ruleset in the existing `rulesets` table and retains the immutability check for the original gameplay ruleset.

All materialization and commands lock the existing character row before Land rows. PvP retains stable character-ID lock order. A payment inserts settlement history, advances cursors, adds pending income, credits the existing ledger and subtracts the credited pending amount **in the same transaction**. A uniqueness conflict or other error rolls the transaction back. The code does not ignore a conflicting settlement insert. No partial history, cursor or wallet update is committed.

Existing command ledger code is shared through [src/economy.ts](src/economy.ts); its original command behavior remains the default. New Land transactions use their own ruleset ID. Purchase retries retain the existing account-scoped receipt and normalized-intent hash, preventing double charges or creation of a second holding for the same command.

## Routes and client

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/game/land` | Authenticated HTML screen; materializes due income |
| POST | `/game/land/buy` | HTML purchase; CSRF and command ID required; redirects with 303 |
| GET | `/api/v1/land` | Authenticated current Land projection, gold and server timestamp |
| POST | `/api/v1/land/purchases` | JSON purchase using session, CSRF token and UUID idempotency key |
| GET | `/api/v1/me` | Existing character projection, now including `state.land` |

The Land request body is `{ propertyId, quantity }`. HTTP validation rejects zero, negative, fractional, boolean, missing and excessive quantities. Rates, ownership, historical timestamps and client prices are ignored. Unknown property IDs and unaffordable purchases are rejected on the server.

`public/land.js` displays API values and estimates the countdown using server time plus monotonic elapsed time. At the payment boundary it refreshes server state, and it also refreshes every 30 seconds or after returning to a visible tab. An offline request never invents a payment. Without JavaScript the UTC payment time and manual refresh link still work. Mobile navigation contains six entries; existing desktop navigation is retained.

## Run in your existing Codespace

Apply the supplied patch on a separate branch, as described in the ZIP's `TRANSFER_TO_CODESPACE.md`. Preserve your current `.env` and database. From `knights-reforged/`, with dependencies and your existing development PostgreSQL available:

```bash
npm install
npm run typecheck
npm run db:migrate
npm run dev
```

Do not run the demo reset or recreate the working database to install this feature. `/game/land` becomes available after the additive migration. For a compiled start, run `npm run build` and `npm start` using the same configuration as the existing prototype. No hosting deployment or merge is part of this package.

## Tests and limitations

The following **ran successfully in the restricted cloud workspace**:

```bash
npm run test:land:offline
npm run test:land:client
node scripts/check-project.mjs
```

- **12 calculation/configuration tests:** exact hourly boundaries, full offline catch-up, fractional phase, no retroactive purchase credit, restart serialization, future clock, exact large integer income, invalid inputs/configuration, fixed 60-minute interval and retained treasury overflow.
- **6 client tests:** countdown against server time, no browser-created gold, one in-flight refresh, server income/availability display, offline reconnection, no-holdings behavior and exact large pending-amount display. They execute the real browser script against a small DOM/clock/fetch harness, not Chromium.
- **41 offline source/interface checks with 32 template fixture cases:** TypeScript syntax, import references, template subsets, links/forms/IDs, CSRF and command contracts, local asset integrity, JavaScript syntax and responsive CSS checks. This renderer is not production EJS.

The optional dependency-free TypeScript test helper requires Node 24 here; the normal installed test suite uses the project's existing `tsx` tooling.

The **22-test PostgreSQL/Fastify suite**, including **15 Land integration tests**, is written but could not execute here. It covers real migrations, account/CSRF isolation, the existing gameplay loop, purchases, limits, concurrency, replayed commands, ledger totals, offline settlement, transactional rollback, offline defenders, app recreation and treasury overflow. In a networked Codespace, run:

```bash
npm test
TEST_DATABASE_URL='postgres://USER:PASSWORD@HOST:PORT/knights_test' npm run test:postgres
```

Use a disposable test database whose name ends in `_test`. Tests create uniquely named fixtures and do not erase the working game database. A remote designated test host also needs `ALLOWED_TEST_DATABASE_HOST`. Production must not be used as the test database.

`scripts/browser-test.ts` is extended to visit all six screens on desktop and phone viewports and purchase Land/check a running countdown while preserving the existing two-player gameplay loop. It requires an already-running disposable development game and a Chromium executable; it was not run here.

**Exact blockers in this environment:**

- Git clone failed before reaching GitHub: `Failed to connect to proxy port 8080`. The current GitHub HEAD could not be inspected.
- npm installation failed with `connect EPERM 172.31.0.221:8080`. The supported extra-network permission attempt was interrupted without an installation result. Further attempts were stopped as requested; no dependencies or lockfile were installed.
- `npm run typecheck` could not start TypeScript: `tsc: not found`. `npm test` could not start the full suite: `tsx: not found`.
- Docker access failed with `dial unix /var/run/docker.sock: connect: operation not permitted`; no PostgreSQL executable was available. No PostgreSQL migration or integration test was executed.

Consequently full TypeScript type checking/build, Fastify startup, production EJS, PostgreSQL SQL/transactions, Chromium layout/interaction and the real Android browser remain unverified here. Passing calculation/client/source checks is not a claim that those unavailable checks passed. [LAND_VERIFICATION_STATUS.json](LAND_VERIFICATION_STATUS.json) records this distinction.

## Source and delivery status

Work is on the **local** branch `feature/kingdoms-live-land` in `/workspace/knights-reforged-land-feature/`. Because GitHub access was blocked, this branch starts from the preserved workspace snapshot, not a verified GitHub commit. It has not been pushed, merged or deployed. The original `/workspace/knights-reforged/` project remains unchanged.

The transfer ZIP includes the changed files and a binary-capable patch. Apply the patch with `git apply --check` first against the real `catillatio/test` checkout. If it reports differences, compare the supplied changed files with the current code instead of overwriting the working game wholesale. The original APK/reference analysis is not recopied by the feature patch.
