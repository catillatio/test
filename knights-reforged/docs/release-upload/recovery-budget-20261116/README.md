# Recovery verification budget correction

> **Released 2026-11-17 UTC:** This source was merged in
> [PR #97](https://github.com/catillatio/test/pull/97) and deployed through
> [protected release 44016282262](https://github.com/catillatio/test/actions/runs/44016282262). See
> [actual Railway timing and artifact evidence](../PRODUCTION_RELEASE_20261117.md).
> The original local-development notes below remain historical.

Local branch `performance/recovery-snapshot-budget-20261116`, based on reviewed
achievement fix `cd1fc8e5052c023bb95f9a808ed7ebe1be4c482a` and release
`dbdd96e1b78f2416044554d8328ca1815a192adb`. No push, hosted CI, merge, deployment,
Railway setting change or production SQL mutation is part of this work.

## Finding and correction

The existing checker already hashes each complete UTF-8 JSON row in PostgreSQL.
The remaining expensive work is its access and transport strategy: a cursor
optimized for partial retrieval walks random UUID primary keys, repeatedly
visiting heap pages, then requests each 500 digests with another SQL round trip.
The checker actually consumes every row. Such cursors also prevent normal
parallel query execution. The previous optimization and digest protocol are
retained; this is not a replacement preservation system.

Fresh restored-fixture plans measured Index Scan for the large journals. In one
initial restored run, `economy_transactions` read 259,191 shared blocks and wrote
104,929 while checking 1,362,737 rows. The candidate read 19,504 blocks with a
sequential/parallel plan. Read-only scans can set transaction hint bits and
generate full-page WAL when checksums are enabled. The controlled repetitions
measure that WAL directly, rather than assuming a logically read-only query is
physically write-free. Physical page visits, dirty-page churn, per-fetch/client
work and SQL serialization/hash cost are distinct contributors.

The runtime correction consists of:

- A transaction-local `enable_indexscan=off` within each complete repeatable-read,
  read-only snapshot. PostgreSQL scans the heap and sorts the projected digest
  plus ordering key. Observed large-table Sort width is 48 bytes; wide battle
  JSON is still fully hashed, not sorted or sent to Node as a complete history.
  PostgreSQL may use parallel sequential scan/Gather Merge when workers are
  available. The setting resets on commit/rollback and affects no app connection.
- A callback-free `pg.Query` row stream for the same complete ordered SELECT.
  This removes fetch round trips and result-array accumulation. Every digest is
  still checked for its 32-byte binary representation and fed to the same ordered,
  domain-separated SHA-256 commitment, with its exact row count.
- Explicit fail-closed stream completion: terminal command must be SELECT, its
  safe-integer row count must match received rows, and retained result rows must
  be empty. Row-processing errors are caught and drained before rollback. Query,
  submit and malformed-completion errors never generate a successful report.
  A configured client query timeout that could make pg accumulate rows is refused;
  existing server and worker deadlines are not increased or disabled.
- Safe aggregate `UPGRADE_TABLE` timing records, forwarded only by the checker's
  existing private worker gate. Records contain phase, validated table name, row
  count and durations. The worker rejects malformed, duplicate, out-of-phase,
  excessive or secret-bearing extra fields. These records do not certify success.

All public base tables, full-row projections, primary-key/fallback ordering,
baseline order reuse across schema changes, duplicate multiplicity, append-only
registries, three complete snapshots, migration replay, both comparisons,
population checks, rollback and source/restore identity guards remain in place.
The digest domain/protocol is unchanged. No snapshot result is cached or reused.
There is no new runtime dependency, database helper function or background job.
The checker remains in the existing candidate fingerprint and worker packaging.

Changing `cursor_tuple_fraction` alone was measured and rejected: it left the
million-row journal index walks and fetch loop intact. On the warmed exploratory
fixture it changed 38.73 seconds to 38.11 seconds. Streaming alone was 35.63
seconds. These exploratory figures are not the controlled full-checker results.
The previously rejected materialized compact-sort experiment was not adopted.

## Repeatable complete-checker measurements

[EVIDENCE.json](EVIDENCE.json) binds the actual source hashes, fixture archive,
settings, individual runs, every phase and per-table medians. The review bundle
also includes all table measurements, actual auto_explain plans/buffers/WAL,
stdout proofs and stderr timings.

The synthetic fixture uses the real 054 schema and original 450-NPC initializer,
all 106 public tables, 1,362,737 entries and transactions, 1,110,000 retained
events and 26,018 wide battle reports. Battle storage is 1,460,649,984 bytes.
The initial snapshot checks 3,877,353 rows; after/replay each include the one
new migration receipt (3,877,354 rows). NPC/account configuration is synthetic;
no real player data or production/recovery copy is used. The reviewed 900-NPC
production population is not regenerated or modified for this experiment.

Four independent fresh restores of the same archive ran sequentially, interleaved
baseline/candidate/baseline/candidate. Each uses the actual checker, actual
population validation, actual migration 055 and actual migration replay. The
fixture hook redirects only the fixed private DB factory boundary to its newly
created loopback database. It observes streaming digests without retaining them.
It does not stub migration, skip tables or substitute a successful report.

Controls: PostgreSQL 18.6, two-CPU cgroup, 8 GiB memory ceiling, 128 MiB
shared_buffers, 4 MiB work_mem, 1 GiB max_wal_size; checksums, fsync and full-page
writes enabled. Each checker child has 128 MiB V8 old-space. JIT is off for both.
Autovacuum is disabled **only in this local cluster**, preventing a background
worker from warming newly restored pages. No VACUUM/ANALYZE or prewarming is run
after restoration. Both versions receive the same auto_explain instrumentation
and digest observer, and no concurrent tests run during measurement. This is
not a recommendation or authorization to disable production autovacuum.

| Complete operation | Baseline seconds | Candidate seconds |
| --- | ---: | ---: |
| Full checker, fresh restore 1 | 168.61 | 94.10 |
| Full checker, fresh restore 2 | 174.36 | 94.64 |
| Median full checker | 171.48 | 94.37 |
| Snapshot before, median | 58.27 | 31.59 |
| Snapshot after, median | 56.56 | 30.84 |
| Snapshot replay, median | 55.32 | 31.21 |
| Initial migration, median | 0.62 | 0.30 |
| Migration replay, median | 0.44 | 0.19 |

The full checker is **44.97% shorter** on this fixture. Both candidate repetitions
finish all three snapshots and comparisons in less than 95 of the existing 600
seconds. Candidate restore plus checker was 219.61–225.32 seconds. This is not
the entire protected worker: backup, encryption, transfer, staging and controller
overhead must still fit their unchanged gates on the real service.

| Table, median across all snapshots/repetitions | Baseline seconds | Candidate seconds |
| --- | ---: | ---: |
| Battles | 21.09 | 21.01 |
| Economy transactions | 13.85 | 2.91 |
| Economy entries | 9.76 | 2.84 |
| Retained treasury events | 11.53 | 4.21 |

Battle serialization/full-row hashing remains measurable necessary work; it was
not omitted or shortcut. The largest journal scans improve substantially.
Table-query round trips decrease from **8,086 to 106 per snapshot**. All 318
table counts match between strategies. Business-table commitments and baseline
registry commitments match across runs; the appended migration receipt has its
own real timestamp in each run. Every actual checker validates registry append
membership and exact after/replay equality, and the observer confirms replay
commitments for every table. Peak Node RSS is 183,448–199,060 KiB for the baseline
and 145,812–146,176 KiB for the candidate; streamed result arrays remain empty.

Baseline checker WAL was 499,118,320–525,451,632 bytes; candidate WAL was
425,405,200–425,405,512 bytes. Sequential sorting trades additional temporary
disk I/O for fewer random heap visits. Raw counters distinguish restored-index
build/temp work from checker work. Do not equate shared buffer reads with physical
volume reads, or treat these local WAL figures as the failed production run's WAL.

Variance: candidate whole-checker repetitions differ by 0.57%, baseline by 3.41%.
An earlier uncontrolled run was 89 seconds; background warming and observer
differences are why it is excluded from the final 94-second comparison. Existing
production phase-only logs cannot retroactively assign the observed 500,687 ms
to individual tables. The local work establishes these mechanisms and a bounded
representative result; real Railway timing remains a protected-release gate.

## Reproduce locally

Install the existing locked dependencies, build, and use an isolated PostgreSQL
18 fixture with the controls above. Supply compatible local pg_dump/pg_restore
through `SNAPSHOT_PG_BIN`. The tools reject remote/non-test URLs, create a fresh
random fixture and remove only their own local database, without FORCE.

```sh
export TEST_DATABASE_URL='postgresql://fixture@127.0.0.1:55491/local_admin_test'
export SNAPSHOT_PG_BIN='/absolute/path/to/postgresql18/bin'
export SNAPSHOT_BUDGET_ARCHIVE='/dev/shm/kr-snapshot-budget.dump'
export SNAPSHOT_BUDGET_OUTPUT='/dev/shm/kr-snapshot-budget-results'
# Optional server logfile for actual per-node auto_explain buffers/WAL:
export SNAPSHOT_PG_LOG='/absolute/path/to/isolated-postgres.log'
node scripts/benchmark-upgrade-budget.mjs --prepare
node scripts/benchmark-upgrade-budget.mjs --measure baseline
node scripts/benchmark-upgrade-budget.mjs --measure candidate
```

The fixed baseline is reviewed commit cd1fc8e; it must exist locally. Preparation
creates the real schema/population and synthetic history before dumping it.
Never point these tools at Railway or use a real-player backup as their fixture.
Raw traces and reports persist outside the removed fixture databases. Their
source fingerprints must match the final reviewed commit's runtime files.

## Migration 055 locking

The reviewed achievement predicate/index is unchanged. Only its installation is
hardened. The 1.11-million-row local build took 73–101 ms. A ten-second statement
ceiling is deliberately fail-closed and preserves any stricter existing nonzero
limit. A fifteen-second transaction ceiling covers remaining Node/SQL validation
while SHARE is held. It leaves a stricter existing transaction timer untouched,
including its deadline; it does not reset that timer to the same value. These
are new bounds, not increases to any release deadline. SHARE NOWAIT refuses a
currently conflicting writer/maintenance operation without queuing.

Ordinary CREATE INDEX is transactional. Reads continue; new journal writers may
wait until commit or timeout rollback. The transaction ceiling is installed
before the lock: even a Node filesystem stall between SQL calls cannot hold it
indefinitely. PostgreSQL terminates the timed-out backend, rolls back both DDL
and migration receipt, and releases its locks. No retry is added. This uses
PostgreSQL 17+ transaction_timeout and fails closed on unsupported servers;
the observed production/recovery and fixture servers use PostgreSQL 18.
CONCURRENTLY is not substituted inside the atomic migration transaction.

Real PostgreSQL tests hold a conflicting writer, cancel slow index DDL at ten
seconds, retain a stricter 100 ms statement and five-second transaction timer,
and deliberately stall Node after the real migration receipt insert. The stall
must produce SQLSTATE 25P04, exit nonzero after one attempt, leave no new index or
receipt, preserve business state and release both table and migration locks.
The paired performance comparison above used the same statement-bound migration
for both verifier versions. A separate final-source full restore/checker run
validates the added whole-transaction guard; its exact SQL hash/result is recorded
under finalSafetyValidation in EVIDENCE.json: all three snapshots and comparisons
passed in 96.33 seconds (216.59 seconds including its fresh restore). Each of the
318 table counts and every comparable business commitment matches the paired
reference. No prior measurements are relabeled.

## Failed run and release boundary

Run [43831109552](https://github.com/catillatio/test/actions/runs/43831109552),
worker `a8cdc493-7f3e-41ae-b223-c5cb22eb0fd0`, remains **UNVERIFIED**. Population,
the first snapshot and migration completed; snapshot-after and the success,
comparison/replay gates did not. See [FAILED_COPY.json](FAILED_COPY.json).
The database is not a recovery anchor, test fixture or promotion authority. Its
name/OID/current holds are not inferred from phase logs. No catalog record,
historical database or encrypted object is changed, deleted or repurposed here.

The inherited achievement/bounty work and every `src/` gameplay module remain
unchanged. The separate security correction remains separate. Future integration
must preserve its restored-SQL ACL guards and both sets of appended release tests.
PR #95, storage, service settings and the cache experiment are untouched.

At the time of this original local review, the next step was to push the candidate,
run required exact-head CI and review the PR; that was later completed. Merge needs separate approval
and successful production-commit checks. Prepare a **new** immutable image for
the merged source; previous image preparations cannot certify this checker.
Promote only through the protected image-release workflow with fresh encrypted
backup, independent restore, all three snapshots/comparisons, retained recovery,
signed approval and owner environment authorization. The 600-second checker,
1,200-second shared worker/report budget and 2,400-second release job are unchanged.
Stop at any failed gate. No cleanup or deadline increase is a recovery shortcut.

Focused test commands/results, exact final head, complete changed-file list,
patch and Git bundle are in the final review bundle. Local verification is not
hosted CI or evidence of production promotion.

## Verified production follow-through — 2026-11-17 UTC

The exact merge `c8222eaac6ee7a2b6392279b13415fadda3d788e` passed required
application CI ([44000561124](https://github.com/catillatio/test/actions/runs/44000561124))
and Android readiness ([44000561987](https://github.com/catillatio/test/actions/runs/44000561987)).
Image preparation [44012465228](https://github.com/catillatio/test/actions/runs/44012465228)
and protected image release [44016282262](https://github.com/catillatio/test/actions/runs/44016282262) succeeded.

The Railway private worker recorded snapshot-before **107.210s**, snapshot-after
**55.396s**, snapshot-replay **53.854s**, and full checker **217.011s** within
its unchanged **600s** deadline. Preservation and migration-replay comparisons
completed; copy registration passed; the release retained encrypted recovery
and independently verified the artifact before promoting the exact image.
This is real restored-copy execution evidence, not a synthetic benchmark.
It does not promise future timings or authorize cleanup of run 43831109552's
**UNVERIFIED** copy. Full release provenance is in
[PRODUCTION_RELEASE_20261117.md](../PRODUCTION_RELEASE_20261117.md).
