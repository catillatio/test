# Issue #21 — private worker report readiness

## Diagnosis and evidence

The controller starts polling immediately after independently establishing the queued worker deployment's identity. The worker conditionally uploads `prepare.json` **after** backup, encryption, export/download verification, isolated restore, migrations and preservation checks. A successful worker completion message is printed only after its report PUT succeeds and cleanup finishes. It does not prove the controller could GET that report.

Historical GitHub evidence from [run 39874021235](https://github.com/catillatio/test/actions/runs/39874021235) (attempt 1, release #15):

| Event | UTC timestamp |
| --- | --- |
| Prepare starts | 2026-10-22 23:47:45.848 |
| Worker queued/identity established | 2026-10-22 23:47:49.283 |
| `BACKUP_RESTORE_VERIFICATION: FAIL` | 2026-10-22 23:47:54.625 |

The controller stopped **5.343 seconds after queuing**, not after its 20-minute polling allowance. Recovery retention, independent artifact download and promotion were skipped; the run has no artifacts. The issue describes commit `ab451b7`; the accessible matching run actually uses `f252c9d`. The controller, transfer, store, worker, protocol and production workflow are byte-identical between those commits, so this discrepancy does not change the code diagnosis.

The later successful Railway worker completion (~one minute) is owner-reported in Issue #21, not independently inspected in Railway. No production connection or provider storage request was made during this investigation. The historical generic failure does not identify its HTTP status or prove a bucket permission/signature problem. A malformed or mismatched report also shares that terminal category.

**Confirmed defect:** `getReport(...,{wait:true})` previously retried only 404, rejecting 403 immediately. An offline sequence of missing-object 403 followed by a valid 200 fails after its first GET under the old code. A worker can therefore succeed after its controller has already stopped.

[Amazon S3's GetObject documentation](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html#API_GetObject_Permissions) states that a nonexistent object returns 404 when `s3:ListBucket` is allowed and 403 when it is not. A compatible provider can exhibit this ambiguity. This establishes a realistic race, **not** proof of Railway's actual historical status or bucket policy. Invalid/expired signatures, rotated credentials, denied GET access and clock skew can also produce 403; status alone cannot distinguish them. No body-message heuristic is used to guess the reason, and no broader bucket permission is required by this fix.

## Minimal correction

- Poll **only the same exact report GET** on 403 or 404 when `wait:true`. Reuse the original presigned URL with no new grants, credentials, bucket listing, writes or Railway operations.
- Retain the 3-second cadence and maximum 20-minute window; honor a shorter supplied deadline and cancellation. Clamp each 15-second request/body timeout to the remaining window. Do not make another GET or accept a late response after the deadline.
- Persistent 403/404 ends unsuccessfully. An invalid signature still cannot yield approval; because 403 is ambiguous, it may now take the bounded window to fail. Grants remain one hour; their lifetime is not extended or renewed. Request expiry and all existing protocol rules remain unchanged.
- Other HTTP failures, including 401, 429 and 5xx, remain fatal. TLS, redirect, transport, invalid JSON, oversized/incomplete body and report validation failures are not converted into readiness.
- Only a 200 response with bounded (100,000-byte) JSON reaches the **unchanged** report checks. Non-waiting reads and independent ciphertext downloads do not inherit 403/404 polling.

The controller emits a deduplicated, fixed `PRIVATE_REPORT_READ: <category>` line. For a non-200 response whose status is an integer from 100–599, the category is exactly `HTTP_<three-digit-status>` (for example `HTTP_400`); `HTTP_OTHER` is reserved for an invalid/out-of-range/non-integer status. The status is captured once, range-checked without coercion, and never interpolated otherwise. Other categories are `HTTP_REJECTED`, `JSON_RECEIVED`, `DEADLINE`, `ABORTED`, `TRANSPORT_FAILURE`, `BODY_REJECTED`, `REPORT_TOO_LARGE`, and `INVALID_JSON`. Each appears at most once per job. `HTTP_403` describes an ambiguous response, not a successful read or confirmed missing object. `JSON_RECEIVED` means parsed JSON, **not** accepted recovery evidence. No response body, headers, URL, signature, credentials or exception text is logged; only the validated numeric status is exposed. The terminal controller category remains `BACKUP_RESTORE_VERIFICATION: FAIL` on retrieval/validation failure.

Unchanged: HTTPS/TLS verification, fatal redirects, per-object conditional writes and grant lifetimes; exact job/SHA/candidate/project/environment/service/copy binding; independently verified worker deployment ID; independent source/restore clusters; all 450 bots and populated-realm checks; encryption, size/hash verification, separately retained/downloaded recovery artifact, owner-key confirmation, Ed25519 approval, signed pre-deploy gate, exact-commit CI, owner environment approval and post-deployment verification. No workflow, worker operations, database schema, credential, game/runtime or deployment configuration changes.

## Diagnostic-only follow-up (owner comment 6354762546)

[Backup-only run 39880006786](https://github.com/catillatio/test/actions/runs/39880006786), attempt 1 at production commit `6d9c122`, logged worker queuing at **October 22, 2026, 8:46:18.018 PM EDT**, `HTTP_404` at **8:46:18.369 PM**, then `HTTP_OTHER`, `HTTP_REJECTED` and `BACKUP_RESTORE_VERIFICATION: FAIL` at **8:46:26.659 PM**. This is confirmed from the historical GitHub log. The numeric status was discarded by the earlier eight-status allowlist; it cannot be reconstructed from these category lines. The worker's later success is owner-reported and does not establish controller GET access. No production or recovery-store request was made to recover that value, and no particular status (such as 400) or root cause is inferred.

The follow-up changes **only status observation** in `transfer.mjs`: capture `response.status` once and emit its exact three-digit category only for a numeric integer in 100–599. Invalid statuses stay `HTTP_OTHER`, with no coercion or provider-text interpolation. HTTP 200 retains `JSON_RECEIVED` after parsing. Existing deduplication and terminal categories are unchanged. A synthetic 400 is a test example, not a diagnosis of the historical run.

**No new retries:** the only waiting statuses remain 403 and 404. All other non-200 responses, including 201/204/206, redirects, 400/401/429 and every other 5xx, still stop immediately. Deadlines, aborts, TLS, grant lifetimes, conditional writes, validation, all recovery/signature/owner gates and promotion logic are unchanged. Regression tests cover every non-200 integer 100–599, representative formerly hidden statuses in polling mode, invalid/adversarial values, a changing getter, 404→400→unused 200, existing readiness/success/deadline/abort cases and the real controller's redacted failure boundary.

After review, exact-commit CI and an owner-approved merge, the owner may **separately authorize one fresh backup-only rehearsal** (`promote=false`) through the existing protected workflow. Read the fixed `PRIVATE_REPORT_READ: HTTP_<nnn>` line immediately before `HTTP_REJECTED` to learn the actual response; share only those categories. `HTTP_OTHER` now indicates an invalid response status, not an unlisted valid code. Stop on failure and investigate that evidence before changing retries, credentials or permissions. Do not rerun a protected workflow during development, reuse old worker evidence, or infer a safe promotion from worker logs alone.

Follow-up local release/authorization regression: **242 passed, 1 existing hosted-runner-only test skipped** (243 total), using CI's exact Node 24.22.0 with `tsx`. JavaScript syntax, actionlint and a normalized source comparison also passed; the comparison confirms status observation is the only runtime change. Normal PR CI supplies the remaining full-suite and disposable recovery evidence.

## Verification and safe recovery

Deterministic offline tests cover 404→200, 403→200, mixed statuses, a one-minute-delayed report, persistent 403/404 through 20 minutes, shorter deadlines, cancellation during requests/waits/body reads, request/body timeouts, other HTTP failures, invalid signature/expiry/clock-skew error bodies, malformed/oversized/interrupted JSON and identity/restore mismatches. Real-controller subprocess tests prove 403→200 still proceeds through validation, ciphertext export and manifest retention; persistent denial cannot reach export or promotion. Network/provider operations are mocked and unexpected operations are blocked.

Original readiness-fix local release/authorization regression: **217 passed, 1 existing hosted-runner-only check skipped** (218 total). TypeScript, production build, static checks, syntax and actionlint are also required; ordinary PR CI runs the full regression suite and disposable PostgreSQL/container recovery tests. CI evidence belongs to the PR's exact commit. No protected workflow is dispatched as part of testing.

Owner sequence after review (not executed):

1. Review/merge this draft PR only after exact-commit CI passes. Preserve the existing protected environment and release settings.
2. Separately authorize a **fresh backup-only rehearsal** (`promote=false`) on the resulting `release/production` commit through the existing required owner approval. Do not reuse the failed job's report/object/artifact or manually promote the earlier worker's backup.
3. If `HTTP_403`/`HTTP_404` is followed by `JSON_RECEIVED` and all existing prepare/retention/independent-download checks pass, report readiness is resolved for that run. This is not itself promotion authorization.
4. Persistent `HTTP_403` plus `DEADLINE` establishes retrieval denial/unavailability, not its cause. Stop; review current bucket/credential/GET-grant configuration through the owner's authorized channel. Do not grant broader access speculatively, rotate keys as a workaround, skip an artifact, or promote on worker logs alone. Other fixed categories identify separate transport/status/JSON failure boundaries.
5. Only after all existing fresh backup/recovery/signing checks pass may a separately authorized protected production promotion proceed.
