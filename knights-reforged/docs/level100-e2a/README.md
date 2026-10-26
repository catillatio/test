# E2a — compatibility engine, expansion inactive

Base: `735a1caf1ca5d1e74ed4f89007e079301da01b9b`, the merged E1 PR #32. All seven E1 reports were reviewed. Their proposed balance/content/population figures remain research inputs, not installed gameplay. The legendary retiering/value conflict is explicitly deferred.

## Installed behavior versus dormant infrastructure

| Area | E2a live-code default | Prepared, but inactive |
|---|---|---|
| Army capacity | `min(101,max(1+2×level,legacyFloor))` | `max(5×level,legacyFloor)` |
| Membership | Leader + actual militia + eligible accepted allies | Same ownership-based count at larger capacity |
| Relationship limit | 100, unchanged | 5,000 under the future army policy |
| Inventory purchases | 1,000/type; 100/transaction, unchanged | 5,000/type storage/validation policy |
| Equipment selection | Existing 101-participant guard and ordering | Quantity-based selection through 5,000 participants; tested at 500/1,000/2,500 |
| XP | Existing curve, earned levels and resource-refill behavior | +150/level after 50; frozen current-transition epoch |
| Catalog | `alpha-0.3`: 60 items, 40 quests, 21 properties | Explicit server-authored purchase overrides, archived definitions and nonoverlapping equivalent groups |
| Bots | Existing 450 identities, projections and autonomy policies | No population/cohort changes |

`expansion-compatibility-1` is a new immutable installed definition, not an activation flag. Its active selectors are legacy. The JSON and exported nested objects are frozen; startup/migration verifies the installed canonical definition. Unknown policy IDs fail closed. There is no environment switch, public registration/activation endpoint, command option or administrative API for selecting a future policy. Future activation must use a separately reviewed version, never edit an installed definition.

## Implementation

- `src/compatibility-rules.ts`: versioned capacity, selection/roster bounds and inventory limits, with safe-integer validation. `activeArmy` delegates to the legacy default. Future capacity never grants members; existing militia and the legitimate 1–101 legacy floor remain unchanged. Bot-specific projections remain unchanged.
- `src/inventory.ts`: SQL retrieves a bounded FIFO prefix (at most 100 positive lots per item, then filters to the units needed). The preview accumulates at most 100 refunds once; it does not expand all historical lots. Sales preserve the full **positive-lot quantity SUM** consistency check in SQL, while locking only the bounded FIFO prefix. This is not a claim that integrity checking examines no lots. Original per-unit rounding, cost, receipt, transaction and upkeep semantics remain intact.
- `src/progression-policy.ts`: immutable curve lookup, pure epoch preparation/validation, threshold advancement and an explicit future-metadata reader. Existing `grantExperience` uses the legacy default and takes the character lock itself, preserving caller locks and receipt idempotency. Header/state requirement lookup uses the same compatibility interface. Combat XP helpers still use the original curve/rewards.
- `src/catalog-compatibility.ts`: purchase eligibility is separate from definition lookup for owned/archived gear. Definitions are cloned and deeply frozen. Equivalents must be explicitly server-authored, known, disjoint and in the same category. A shared group's demands are summed, so an owned copy cannot satisfy two requirements twice. Missing purchases select a reachable approved equivalent deterministically by actual price/ID. Neither arbitrary substitutions nor client-supplied catalog policies are accepted. The active catalog has **no overrides, archives or equivalences**; current purchases, acquisition ruleset IDs, quest requirements, prices, artwork and stats are unchanged.
- `src/army-roster.ts`: one authoritative aggregate plus a 25-row presentation page, using identical visibility predicates. Cursor ordering is `(status,name,UUID)`; the cursor is bound to the viewer and selected filter and is validated/parameterized. It is a navigation hint, not authorization. Every query independently enforces ownership/visibility. All/Allies/Incoming/Sent filters keep pending invitations accessible beyond the first page. Combat and Dashboard counts never depend on the displayed page. Public profiles retain their existing explicit field allowlist.
- `src/experience-rules.ts`: freeze the legacy summit at its already-installed level-50 value. Its serialized definition, achievement ID and eight tutorial lessons remain identical; a future catalog horizon cannot relabel that earned award. No new achievement is installed.

The previously hardcoded 100-relationship recruitment check is now a legacy policy bound. E1's proposed 5× rollout must select its larger roster bound as well as its capacity; E2a does neither. Daily invitation limits, consent, cooldowns, retained militia and recruitment commands are unchanged.

## Migration 023

`023_expansion_compatibility.sql`:

1. Widens the existing inventory quantity CHECK from 0–1,000 to 0–5,000. No quantity or acquisition row is updated. Application purchase validation remains at 1,000.
2. Adds a partial positive-lot FIFO index and low/high member-status roster indexes.
3. Creates **empty** `character_progression_epochs`, keyed by the existing character UUID, with known policy IDs, frozen level/requirement/progress and server-generated creation time. An UPDATE guard prevents accidental epoch rewriting. Account deletion still uses the existing cascade; no deletion/account policy is changed.

No existing character column is added, defaulted or backfilled. Ordinary registration, login and grants create no epoch. The current legacy execution ignores future metadata; only an explicitly requested future-policy reader consumes it and requires a valid matching row. This prevents installation from reinterpreting existing XP. It is **not** a production cutover mechanism: E2b must initialize epochs transactionally and drain incompatible writers before activation.

The application/database owner can replace guards or alter tables; this is not a separate least-privilege administration boundary. No new database credentials, roles, ownership or operator powers are introduced. Future typed epoch initialization and its authorization still require review.

The migration uses the existing serialized transaction. Constraint/index installation takes normal PostgreSQL DDL locks; independent restored-copy verification must measure its duration before a release. Injected interruption after executing the new DDL rolls back the tables, constraint change and all old rows. Replaying the migration changes nothing.

## Protected release compatibility

The strict post-deployment schema assertion advances from **022** to exactly **023_expansion_compatibility.sql**. Current fixtures follow it. Stale 022, unexpected 024, missing schema, wrong commit and invalid total/active bot counts are rejected. Prepare-mode restoration/export failures remain rejected at their existing phase.

The protocol diff is this one literal schema head only. All other signature, exact candidate, encrypted export, retained independent recovery, isolated restore/replay, account preservation, exact-450, deployment-identity and owner-approval checks remain unchanged. The historical 021→022 test now explicitly stops/replays at 022; it was not relabeled as an E2a test. Recovery volume retention, worker/controller infrastructure, workflows and credentials are untouched.

## Evidence

[preservation-evidence.json](preservation-evidence.json) is **local synthetic test evidence**, not a release authorization or a production inspection. It records 453 accounts, all 450 bot identities, per-table pre-upgrade row hashes, rollback/replay and restart/session preservation. No credentials, production records, private keys or signed URLs are included. Random synthetic IDs/timestamps mean fresh runs have different hashes; the invariants must match.

Focused coverage includes:

- Legacy policy parity and immutable definitions; unknown/forged policy rejection; unchanged 60/40/21 catalog and transaction limits.
- 5× capacity at levels 1/10/25/50/75/100/200/500; legacy floors; incomplete actual armies; safe-integer rejection; 500/1,000/2,500 selected-copy arithmetic and paused equipment.
- Lazy FIFO prefix, original paid prices/rounding, 2,500 saved copies, active 1,000 purchase restriction, concurrent sales, duplicate receipt replay and inconsistent-lot rollback.
- Legacy XP parity, frozen epoch boundary, existing attained level without lifetime-XP reinterpretation, serialized grants, exactly one crossing/refill and no refill on zero-award replay. A manually inserted synthetic future epoch remains dormant.
- Current/classic purchase eligibility, owned usability, archived definitions, approved equivalent groups, duplicate-use prevention and deep-copy isolation.
- Empty and 2,540-entry rosters, duplicate/Unicode/HTML names, complete authoritative counts, pending filters, page traversal, foreign/malformed cursors, unchanged legacy invitation limits and declined relationships.
- Populated 022→023 upgrade, injected transactional interruption, every old business row unchanged, exact bot UUID preservation, empty metadata table, replay and process restart/session persistence.
- Existing human transactions/recruitment, historical preservation, autonomous purchases, bot-versus-bot combat, multi-worker retries and economic rollback.

Reproduce from `knights-reforged` using a disposable local/designated PostgreSQL 18 `*_test` database:

```sh
npm ci --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund --prefix deployment/release
npm run typecheck
npm run build
npx tsx --test --test-concurrency=1 tests/level100-e2a.test.ts tests/level100-e2a-integration.test.ts tests/level100-e2a-preservation.test.ts tests/release-transport.test.mjs
```

Set `TEST_DATABASE_URL` only to the disposable test database. Existing helper guards reject undesignated hosts/non-test database names. Do not use production credentials. The final exact-head full normal CI result and link are recorded on the draft PR after all implementation commits; no protected workflow is dispatched.

See [E2B_ACTIVATION_READINESS.md](E2B_ACTIVATION_READINESS.md). E2a does not authorize activation, provisioning, migration on production, merging or deployment.
