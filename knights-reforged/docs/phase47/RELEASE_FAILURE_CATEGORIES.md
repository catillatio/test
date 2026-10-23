# Release controller failure categories

The original category-only change described below changed failure reporting in `deployment/release/run.mjs` only. [Issue #21 report-readiness handling](REPORT_READINESS.md) subsequently added bounded 403/404 report polling and fixed `PRIVATE_REPORT_READ` diagnostics; the existing terminal failure categories and all approval/evidence gates remain unchanged.

For the original category-only change: No workflow, approval, credential, Railway command/argument, request count, retry policy, worker, encryption, backup gate, signature, migration, or promotion order changes. No additional provider operation is performed to test permissions.

When the controller fails, stderr includes exactly one of these fixed category lines, followed by the existing generic safety message. The process still exits unsuccessfully. Success output is unchanged; no extra PASS markers or diagnostic values are emitted.

| Fixed line | Controller boundary |
| --- | --- |
| `WORKER_VARIABLE_STAGING: FAIL` | The existing worker `variable set --skip-deploys` command failed. |
| `WORKER_UPLOAD: FAIL` | The existing worker `up --detach --json` command failed before returning a successful CLI result. |
| `DEPLOYMENT_IDENTITY: FAIL` | A successful upload result could not be parsed/validated or independently matched to the expected deployment/project/environment/service; also covers a valid report naming a different worker deployment. Applies to worker and game deployment identity checks. |
| `BACKUP_RESTORE_VERIFICATION: FAIL` | Worker evidence could not be obtained or validated; independent encrypted recovery download/checksum or manifest retention failed; retained recovery validation before promotion failed; or the post-deployment preservation evidence failed. |
| `RELEASE_SAFETY: FAIL` | An unclassified precondition, local preparation/cleanup, game staging/upload, health, or other safety check failed. This avoids falsely blaming worker permissions. |

These are failure boundaries, not provider diagnoses. For example, an unavailable worker report can result from a worker build/startup failure, report storage access, timeout, or a failed backup/restore check. A failed upload command does **not** prove that Railway queued nothing; it might have accepted the upload before the CLI failed. Identity verification can likewise fail after a deployment was queued. No Railway staging/upload/deployment retry, cancellation, restart, or rollback is added. Exact-object report GET polling is described separately in [REPORT_READINESS.md](REPORT_READINESS.md).

The controller records categories privately by error identity. It replaces exceptions with a fresh generic error and never inspects or prints provider error messages, response bodies, error properties, stacks, causes, credentials, signed URLs, or connection strings. An exception's own text or category-like properties cannot select a logged category. Existing provider stdout/stderr suppression remains. Cleanup behavior is unchanged; an unclassified cleanup error remains a generic safety failure.

Independent recovery artifact upload/download and `check-recovery.mjs` still run in their existing named Actions steps outside this controller; this change does not alter or bypass them. Production owner approval, exact-commit checks, encrypted independent recovery, restored-copy migrations/preservation, owner-key verification, signed pre-deploy authorization, and health checks remain required.

## Validation

From `knights-reforged`:

```sh
node --test tests/release-failures.test.mjs tests/release-deployment.test.mjs tests/release-diagnostic.test.mjs tests/release-transport.test.mjs tests/railway-authorization.test.mjs
npm run typecheck
npm run build
npm run check:static
```

The new tests execute the real controller in subprocesses, replacing its external-operation boundaries with offline fixtures. Its real configuration/crypto guards, deployment identity checks, report validation, retained-backup assertions, and terminal catch still run. Network, DNS, additional subprocesses, and unexpected provider calls are blocked. Synthetic CLI stdout/stderr and exception text deliberately contain sensitive-looking data to verify complete redaction. Ordered traces prove one staging command and one upload at most, no continuation after failure, unchanged successful preparation, cleanup, retained-backup gating before game promotion, and no worker labels on game staging/upload failures.

Local verification: all 18 new controller tests passed. Combined release/authorization regression suites passed 127 tests with one existing hosted-runner-only namespace check skipped locally. TypeScript, production build, 91 static checks including 73 EJS fixtures, JavaScript syntax, and actionlint 1.7.12 for all workflows passed. A syntax-tree comparison against base `95addbe` confirmed all existing assertions and provider/verification calls retain their arguments and order. Existing workflows, guards, worker, encryption/proof code, and migrations remain byte-identical.

The tests do not establish real write permissions, queue a worker, access production data, or dispatch a release. This change only adds information to a future release that the owner explicitly authorizes through the existing gate. Review and merge the PR manually after required checks pass; nothing is automatically executed or promoted by this patch.
