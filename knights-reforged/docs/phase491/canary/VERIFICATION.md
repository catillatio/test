# Canary development verification

All records are synthetic; no production connection, Railway request, live inspection or release dispatch occurred. This checkpoint adds only experiment/test/report files and an optional fixed-target selector in the **offline simulator**. Approved report/audio assets, runtime formulas, migrations and release infrastructure are unchanged.

| Check | Evidence |
|---|---|
| Full suite | **474 tests: 473 pass, 0 fail, 1 existing hosted-runner-only skip**, 629.27 seconds. [Final counts, log hash and skip reason](automated.json) |
| New focused cases | Seven tests: fixed 18 selection/identity uniqueness; all 450 funded plans retain old gear/members/skills/Vault/Land; conservative power/control bounds; poor/paused/reserve-only rejection; exact15-minute manifest binding/tampering; original roll/65%/repeat policy; test-consent rejection before connecting and eligible fixed-target simulation |
| TypeScript/build/static | `npm run typecheck`, `npm run build`,99 static contracts/77 production EJS render fixtures and actionlint |
| Full-level matchup model | [1,800 rows](matchups.csv), all 450 bots/levels 1–50 and four human investment profiles, 441 roll pairs per before/after encounter |
| Progression and farming | [644 sessions](sessions.json):600 ordinary1/2/6-hour runs across every starting level 1–50,24 six-hour fixed-target one/ten-account runs, 20 seven-calendar-day runs at one/two active hours/day; finite-purse conservation, real recovery/losses/healing/level-up refills and unchanged Vaults |
| Future mechanics | [30 hypothetical100/200 cases](stress.json), current catalog and members only, original participation limits; actual old bots ineligible, reward forecasts null |
| Poor-finance stress | [144 scenarios](funding.json):18 selections × four purse fractions × present/zero reserved credit; no capital grants or reserve-funded acquisitions |
| Real dump/restore | [copy-verification.json](copy-verification.json): checksummed custom archive, two **different fresh disposable databases**, 66 tables, 452 accounts, 450 bots, original rows and two no-op migrations all match |
| Real transaction races | Same/different-key concurrent application; actual normal battle invalidates a reviewed snapshot; simultaneous combat/purchase uses the normal character locks; wallet+reserve conservation includes only a committed purchase cost |
| Fail closed / rollback | Wrong consent, production/nonlocal targets, humans/unselected identities, changed plan, wrong-kind command, expired/premature quote; an injected failure after a real purchase leaves all tables unchanged |
| Audit and preservation | [Actual disposable-ID manifest/child receipts](copy-manifest.json):five purchases, 13 controls; old paid lots and financial/combat receipts retained; all 450 identities, 445 bots unaffected by calibration, human accounts/sessions/inventory/Land/social/achievements/tutorial and existing catalogs preserved |
| Normal income / reconnect | Three exact hourly periods conserve wallet+reserve after Land/property/equipment upkeep; settlement repeated after reconnect changes no rows. Identical completed candidate receipts also replay after expiry/reconnect with no extra charge |
| Model/copy identity | Normalized economic-intent SHA-256 matches across model and PostgreSQL copy. Full manifest hashes differ appropriately because actual disposable UUIDs/state metadata differ. Exact UUID hashes are retained separately, never substituted for one another |
| Navigation audio | [Refreshed source-start trace](navigation-audio.json): real touch/mouse tab navigation, full transitions/history/reload, old click/navigation fallback rejection, mute/departure cancellation and approved AAC reward deduplication |
| Independent release scope | [scope.json](scope.json): approved src/public/views/screenshots/rulesets/migrations/deployment/workflows/dependencies remain unchanged from `a21b2b0`; PR #13 unchanged at `f6243463` |

An initial broad suite attempt exhausted local disk after pulling an additional PostgreSQL image and was **not counted as passing**. Only this task's container/image were removed; the existing test service, PR #13 resources and application source were untouched. Testing resumed on the already cached PostgreSQL 18-bookworm image with space available. The separate-database rehearsal and the full suite were rerun; no assertion or production safeguard was weakened. The final counts in automated.json describe the clean rerun.

The model's fixed-source assumptions, one deterministic seed and synthetic balances are limits. They do not certify current live finances, physical iPhone/Android behavior, future level 100/200 content or production authorization. Low-level catalog limits and overpowering established human armies remain. Passed experimental gates do not prove the full bot population is balanced. The unchanged [approved mobile screenshots](../README.md) remain the visual evidence; no new UI or audio is adopted.

## Reproduce locally

Create a **new local disposable PostgreSQL 18-bookworm test instance** named `kingdom-bot-canary-test`, bound only to 127.0.0.1:55593, with a new database ending `_test`. Set `TEST_DATABASE_URL` securely in that local test shell and `TEST_POSTGRES_CONTAINER=kingdom-bot-canary-test`. Never substitute a production/service URL, mount original PostgreSQL files, initialize an existing realm or run these developer helpers on a live database.

From `knights-reforged/`:

```sh
npm run typecheck
npm test
npm run build
npm run check:static
actionlint
npx tsx scripts/phase491-canary-report.ts
npx tsx scripts/phase491-canary-copy-test.ts
npx tsx scripts/browser-phase491-audio.ts
```

The copy script additionally verifies the dedicated loopback port, test container and matching PostgreSQL system ID. It creates only its own synthetic fixture and random separate copy databases, drops those copies/fixture and removes the synthetic dump afterward. The report script is offline and cannot inspect or mutate any database. Local test helpers refuse production mode; no live executor or privileged administration channel is supplied.
