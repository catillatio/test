# Issue #21 — wait for the exact private worker before report retrieval

The old controller treated authenticated detached upload/identity verification as permission to start fetching a report immediately. Upload completion means **queued**, not finished. The worker only PUTs its report after backup/export, independent restored-copy migrations/preservation and report validation; its success message follows cleanup. Early report GETs therefore raced both worker startup and report creation.

## Evidence and HTTP 400/408 uncertainty

The latest accessible [GitHub run 39884323789](https://github.com/catillatio/test/actions/runs/39884323789), attempt 1 at `b56c990`, logs these events on **October 22, 2026 (EDT)**:

| Time | Fixed event |
| --- | --- |
| 9:30:51.164 PM | Exact worker deployment queued/identity established |
| 9:30:51.549 PM | `PRIVATE_REPORT_READ: HTTP_404` |
| 9:31:40.696 PM | `PRIVATE_REPORT_READ: HTTP_408`, then `HTTP_REJECTED` |
| 9:31:40.697 PM | `BACKUP_RESTORE_VERIFICATION: FAIL` |

The owner comment describes **400**, but the accessible run actually records **408**. Neither is treated as missing-object readiness or success. The worker's later completion and presence of `prepare.json` / encrypted backup are owner-reported, not independently inspected in Railway or the bucket. No production/storage request was made during this investigation.

Timing explains **why GETs happened before the report existed**, not why a provider returned 400 or 408. Standard S3 missing-object behavior is 404, or 403 without bucket-list access; 400 is not established as a normal missing-object response. It can indicate request/signature/parameter problems. [HTTP 408](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.9) is a request-timeout response and can originate from a server/intermediary. The status alone cannot establish which component caused it. No provider error code, request ID, response body or authenticated bucket diagnostics were available/inspected.

The source uses `GetObjectCommand`, signs the exact report key once for one hour, and passes the unchanged HTTPS URL to `fetch` (GET, no body, no redirects). Official-SDK offline signing regressions pass; no malformed method/path or grant-renewal bug was reproduced. This does **not** validate real credentials, clock alignment, provider parameter support or GitHub-to-storage transport. No speculative signing, credential, permission or HTTP retry change is included. A later 400/408 must still stop release even with a completed worker.

## Completion contract and minimal change

The [Railway CLI v5.70.0 public schema](https://github.com/railwayapp/cli/blob/v5.70.0/src/gql/schema.json) exposes `deployment(id)` identity, `status`, `deploymentStopped` ("instances have all stopped") and `instances { id status }`. Its deployment-status enum has **no `COMPLETED` value**. [Railway lifecycle documentation](https://docs.railway.com/deployments/reference#deployment-states) distinguishes active containers from zero-exit completed jobs; [deployment actions](https://docs.railway.com/deployments/deployment-actions#restart-a-crashed-deployment) explains that a cleanly exited deployment can retain `Success`. Thus `SUCCESS` alone cannot establish job completion.

Before the **first** report GET, the controller now polls only the independently verified, exact deployment ID using the existing authenticated read-only API. Every response must match the expected deployment/project/environment/worker service. Completion requires all of:

- Deployment status `SUCCESS`.
- `deploymentStopped === true`.
- Exactly one instance, status `EXITED`, with the same opaque instance ID if previously observed.

A running process, manual stop, crash, removal, restart/replacement, additional instance, missing/unknown state, GraphQL/HTTP/transport failure or identity mismatch cannot satisfy this gate. Metadata errors fail immediately; no API-error retry or “latest deployment” fallback is added. Known pending states are polled every five seconds. The service remains the existing private, single-instance, restart-Never worker; no configuration changes are needed or made.

Completion polling and existing report polling share **one maximum 20-minute deadline**, additionally bounded by request expiry. Individual metadata calls use at most 15 seconds, shortened to remaining time. Aborts and deadlines stop further work. The original presigned URL/grant lifetime and existing 403/404-only report waiting remain unchanged. HTTP 400/408 and other non-200 statuses still fail immediately. No worker, store, transfer, encryption, protocol, workflow, migration, game or database changes.

Only fixed `PRIVATE_WORKER_COMPLETION` categories are logged, deduplicated per wait: `WAITING`, `COMPLETED`, `CONFIGURATION_REJECTED`, `API_REJECTED`, `IDENTITY_REJECTED`, `STATE_REJECTED`, `TERMINATED`, `DEADLINE`, `ABORTED`. They contain no provider states/text, URLs, IDs, credentials or body data. Worker-gate failure remains `BACKUP_RESTORE_VERIFICATION: FAIL`.

**Completion is coordination, not release authorization.** The report still must pass every existing job/candidate/source/restore/preservation check and match the independently authenticated queued worker deployment ID. Independent ciphertext download/hash, GitHub retention and independent artifact verification, owner-key confirmation, signing, exact-commit checks, protected owner approval and pre-/post-deployment safeguards are unchanged. Worker success without valid evidence cannot create recovery authorization.

## Verification and owner recovery

Local affected release/authorization regression: **303 passed, 1 existing hosted-runner-only check skipped** (304 total), on Node 24.22.0 with `tsx`; syntax and actionlint passed. Deterministic tests cover queued/building/deploying/running/exited transitions, early status-field updates, identity changes on later polls, instance replacement, failure/removal/manual stop/restart, metadata errors, malformed state, timeouts/deadlines/abort and the one shared budget. Real-controller traces forbid a report call before completion, retain all evidence ordering and prove 400/408 after completion still stop before backup download. Existing report/signature/recovery regression cases remain. Normal exact-commit PR CI supplies full regression and disposable PostgreSQL recovery evidence.

After owner review/merge and passing CI, the owner may separately authorize a **fresh backup-only rehearsal** through the unchanged protected workflow (`promote=false`). Expect `PRIVATE_WORKER_COMPLETION: WAITING` (if pending), then `COMPLETED`, before any `PRIVATE_REPORT_READ` line. Require report validation, encrypted recovery retention and independent verification as before. A state/API failure or later 400/408 requires stopping and investigating that fixed evidence through an authorized provider channel; do not widen permissions or retries, reuse old worker objects, or promote from completion logs alone. No rehearsal is dispatched by this PR.
