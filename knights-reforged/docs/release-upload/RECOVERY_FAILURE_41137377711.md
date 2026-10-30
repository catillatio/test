# Recovery verification failure: run 41137377711

This investigation used retained GitHub/Railway evidence and the exact source at `ae9a665b46250e7e29d0b84bf48edb9bb4fcd8e2`. No protected workflow was rerun, no production SQL was executed, and no Railway configuration, recovery database, role, registration or retirement state was changed.

## Confirmed findings

| Evidence | Finding |
| --- | --- |
| [Protected run](https://github.com/catillatio/test/actions/runs/41137377711), job 124343223305 | Image authentication and target preflight passed. Backup/restore verification failed before signing or image promotion. No recovery artifacts were uploaded to this GitHub run. |
| Exact private worker 89e79f8a-728b-41f2-b184-ffe8f3c68c71 | Railway reports CRASHED. Its own fixed failure message names `copy-migrations-and-preservation`. No more detailed provider failure reason or automatic diagnosis was available. |
| Worker runtime logs | Container start 18:23:47 EDT; failure 18:38:36 EDT on October 30 (22:23:47Z–22:38:36Z). This is approximately 14m49s for the **whole worker**, not a measured child duration. |
| Recovery PostgreSQL log | `unexpected EOF on client connection with an open transaction` at 22:38:35.937Z, about 0.14s before the worker's failure message. The log line does not identify its database/client; timing alone cannot prove it is the checker connection. |
| Code comparison with pre-UI production c773bbb | Worker, upgrade checker, migration implementation and SQL migrations are unchanged. The UI merge did not introduce a migration-code change. |
| [Post-merge CI](https://github.com/catillatio/test/actions/runs/41134741420) | Passed at the exact merge commit. Existing recovery tests establish semantics on small synthetic populations, not production-sized preservation throughput. |
| Previous successful protected recovery 40773042182 | Its preparation worker completed successfully in about 8m14s overall on October 28. The checker implementation is identical; child phase timings were not retained in that run either. |

The PostgreSQL checkpoint entries in this window are normal **LOG** records. The connector labels their stderr stream as error severity; that label is not evidence of an SQL ERROR.

Four-hour Railway service summaries sampled at 30 seconds reported worker memory peak 2.154 GB and recovery-PostgreSQL memory peak 4.310 GB, with reported memory limits up to 24 GB. Recovery-volume usage peaked at 18.567 GB against a configured 50,000 MB volume. These service/window aggregates do **not** prove exact-deployment peaks, exclude short spikes or V8 heap exhaustion, or measure actual filesystem free space. They provide no affirmative OOM/disk-full finding. No PostgreSQL ERROR/FATAL, provider OOM disposition or disk-full error appeared in the bounded logs inspected.

## What cannot be established retrospectively

The checker child has a 600,000 ms deadline. The original wrapper discarded child stderr, ignored the close signal and collapsed timeout/spawn/nonzero/signal/output-limit failures into the same message. There was no child-start or checker-phase record. Consequently, the original termination category, duration and precise failing operation cannot be reconstructed from these retained records.

The checker covers population validation, three preservation snapshots, two migration invocations and the preservation/replay comparisons. A gate name covering all of these does not establish that an SQL migration failed.

The open-transaction EOF is consistent with abrupt process termination or connection loss. It is not proof of timeout, OOM, corruption or a particular migration error. Ordinary handled snapshot/migration exceptions attempt rollback.

## Plausible mechanisms, not proven causes

- **Deadline:** the whole checker can exceed 600 seconds, but there is no retained child-start timestamp or timeout flag for this run.
- **Slow preservation:** every snapshot orders all complete JSON row values before fetching 500-row batches. This can sort/spill and repeatedly serialize wide battle histories. There are three snapshots. Cursor batching bounds rows per fetch, not bytes or database sort work.
- **Child memory pressure:** 500 wide rows can occupy substantial heap. Sampled service memory is insufficient to exclude a brief or V8-specific failure.
- **SQL/connection/preservation assertion:** the child can fail in any of these paths. Its raw error was intentionally suppressed, and no specific error was retained.

There is no evidence-backed basis here to increase the timeout, change resource limits, alter SQL/snapshot ordering or weaken a preservation assertion.

## Narrow correction

The demonstrated defect is loss of safe failure metadata. This change records fixed subprocess categories, elapsed time and validated exit/signal metadata, plus strictly allowlisted checker phase timing. It keeps raw stderr, SQL, identifiers, values, credentials and provider messages private.

The eight phase names are fixed: population, snapshot-before, migrate, snapshot-after, preservation-compare, migrate-replay, snapshot-replay and replay-compare. A completion event follows the actual successful operation. Progress is diagnostic only and cannot authorize a report, registration or promotion.

The 600-second deadline, output ceiling, three canonical snapshots, both migrations, all comparisons, operator/private-target guards, advisory lock, encrypted export/round-trip, report validation, signing and protected owner gate remain. Both changed runtime files were already covered by candidate fingerprinting and worker-bundle whitelists. No new runtime helper or endpoint is added.

This correction does **not** claim to fix an established timeout, OOM or migration defect.

## Recovery boundary

1. Keep the current live game in place. The failed request never reached image configuration commit or deployment. Authenticated inspection found no pending Railway patch and no new game deployment from this run.
2. Preserve the failed independent copy and durable encrypted object. Reaching this gate proves earlier export/round-trip and single-transaction restore commands returned successfully; it does not certify migration preservation. Verified report upload and registrar execution occur later, so this failure cannot produce a certified registration.
3. Do not adopt/drop the failed copy, delete backups, loosen recovery holds, or infer retirement eligibility. Preserve emergency OIDs 106971 and 129180.
4. Review the focused PR and its CI. No production action is part of this investigation. If more read-only performance analysis of the existing failed copy is desired, first establish its exact private request identity; use metadata/planner inspection and EXPLAIN without ANALYZE. Do not execute EXPLAIN ANALYZE, SQL ANALYZE or migrations. Do not guess a database from its name or size.
5. Any future attempt requires separate owner authorization through the existing protected workflow, a new request/job/copy identity and fresh exact-commit image/evidence binding. Do not use “Re-run jobs” on this failed request or reuse expired proof. The current architecture has no approved metadata-only resume that can certify this failed verification.
6. A future release must still pass fresh target preflight, encrypted backup, independent restore, all preservation/replay checks, retained-artifact verification, signing, approval and post-deployment health checks. A failure stops promotion with no automatic retry.

The immediate owner action is review of the diagnostic-loss correction. An underlying performance/resource fix or a new production attempt remains a separate decision; none has been executed or silently authorized.
