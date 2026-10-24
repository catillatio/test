# Release controller failure categories

The original category-only change described below changed failure reporting in `deployment/release/run.mjs` only. [Issue #21 report-readiness handling](REPORT_READINESS.md) subsequently added bounded 403/404 report polling and fixed `PRIVATE_REPORT_READ` diagnostics; the existing terminal failure categories and all approval/evidence gates remain unchanged.

The subsequent [worker-completion gate](WORKER_REPORT_COORDINATION.md) adds bounded, read-only metadata polling before report retrieval; it introduces no staging/upload/deployment retries or new HTTP-error retries. The existing terminal categories and all recovery/approval requirements remain.

For the original category-only change: No workflow, approval, credential, Railway command/argument, request count, retry policy, worker, encryption, backup gate, signature, migration, or promotion order changes. No additional provider operation is performed to test permissions.

When the controller fails, stderr includes exactly one of these fixed category lines, followed by the existing generic safety message. The process still exits unsuccessfully. Success output is unchanged; no extra PASS markers or diagnostic values are emitted.

| Fixed line | Controller boundary |
| --- | --- |
| `WORKER_VARIABLE_STAGING: FAIL` | The existing worker `variable set --skip-deploys` command failed. |
| `WORKER_UPLOAD: FAIL` | The existing worker `up --detach --json` command failed before returning a successful CLI result. |
| `DEPLOYMENT_IDENTITY: FAIL` | A worker upload result could not be parsed/validated or independently matched to the expected deployment/project/environment/service; also covers a valid report naming a different worker deployment. |
| `BACKUP_RESTORE_VERIFICATION: FAIL` | Worker evidence could not be obtained or validated; independent encrypted recovery download/checksum or manifest retention failed; or the post-deployment preservation evidence failed. |
| `RECOVERY_PROOF_PREPARATION: FAIL` | Promotion's owner-key attestation/artifact-reference gate, downloaded recovery revalidation, exact candidate/target binding, ciphertext checksum, or signed release-proof preparation failed before game staging. |
| `GAME_VARIABLE_STAGING: FAIL` | The existing game `variable set --skip-deploys` command failed; game upload was not attempted. |
| `GAME_UPLOAD: FAIL` | The existing game `up --detach --json` command failed before returning a successful CLI result. |
| `GAME_DEPLOYMENT_IDENTITY: FAIL` | The game upload result could not be parsed/validated or independently matched to the exact deployment/project/environment/game service. |
| `RELEASE_SAFETY: FAIL` | An unclassified common precondition, local preparation/cleanup, health, or other safety check failed. This avoids falsely blaming provider permissions. |

These are failure boundaries, not provider diagnoses. For example, an unavailable worker report can result from a worker build/startup failure, report storage access, timeout, or a failed backup/restore check. A failed upload command does **not** prove that Railway queued nothing; it might have accepted the upload before the CLI failed. Identity verification can likewise fail after a deployment was queued. No Railway staging/upload/deployment retry, cancellation, restart, or rollback is added. Exact-object report GET polling is described separately in [REPORT_READINESS.md](REPORT_READINESS.md).

The controller records categories privately by error identity. It replaces exceptions with a fresh generic error and never inspects or prints provider error messages, response bodies, error properties, stacks, causes, credentials, signed URLs, or connection strings. An exception's own text or category-like properties cannot select a logged category. Existing provider stdout/stderr suppression remains. Cleanup behavior is unchanged; an unclassified cleanup error remains a generic safety failure.

Independent recovery artifact upload/download and `check-recovery.mjs` still run in their existing named Actions steps outside this controller; this change does not alter or bypass them. Production owner approval, exact-commit checks, encrypted independent recovery, restored-copy migrations/preservation, owner-key verification, signed pre-deploy authorization, and health checks remain required.

## Promotion investigation: runs 40048297250 and 40049209822

Both [run 40048297250](https://github.com/catillatio/test/actions/runs/40048297250) and [run 40049209822](https://github.com/catillatio/test/actions/runs/40049209822) used production commit `2470d7b74aaf4c968993affe6bb4cb89547305ac`. Their safety/build, private worker completion, encrypted recovery export, artifact retention/download and independent candidate/ciphertext verification steps succeeded. Promotion then emitted only `RELEASE_SAFETY: FAIL`, about 5.96 and 4.63 seconds after its step began. The owner reports no new game deployment and healthy existing production; no production query was made to independently establish deployment state.

Read-only inspection of the existing GitHub logs established these fixed diagnostic results for both runs, without reproducing any configuration values:

```text
PROMOTION_OWNER_ATTESTATION: PASS
PROMOTION_ARTIFACT_REFERENCE: PASS
PREPARE_PROMOTE_CONFIG_CONSISTENCY: PASS
PROMOTION_TOKEN_BINDING: PASS
```

These mean the attestation and artifact-reference prerequisites were present in the logged promotion step, the logged target/verification configuration matched preparation, and a masked token binding was present. They do **not** prove Railway game-write permissions or successful staging/upload. These inspection results are not new controller output or release authorization.

The confirmed defect is a diagnostic blind spot: signing preparation, game staging and game upload could all produce the same generic category. Historical logs do not retain the suppressed exception, so neither its provider cause nor its exact failing operation can be reconstructed safely. No permission, token, public-key, schema or infrastructure cause is asserted. The patch adds the four promotion-specific boundaries above using the existing private error-identity map; it changes no assertions, signed payload, CLI arguments, provider calls, retry policy, workflow or promotion order.

Recovery-proof failure stops before game staging; game-staging failure stops before game upload. Upload or identity failure can occur after a provider accepted work, so those categories must **not** be treated as automatic retry permission. If the owner later authorizes a protected release, use its fixed category to select the next focused investigation; independently inspect the exact deployment state before considering another release. No release, redeploy or permission change is part of this investigation.

Focused regressions exercise missing/corrupt/wrong-commit/wrong-candidate/failed-restore retained evidence, missing owner attestation/artifact reference, signing failure, hostile exception-property getters, game staging/upload failure, malformed/missing deployment IDs, unavailable metadata and wrong game-service identity. Ordered offline traces enforce fail-closed sequencing and no extra network/provider operation. Valid staged proofs are checked by the real Ed25519 verifier against the synthetic exact candidate, service and retained artifact. Worker categories and successful preparation output stay unchanged. The final normal exact-head CI result is linked on the draft PR.

Promotion follow-up local results: all **35 controller tests** passed; the combined release/authorization regression set passed **326 tests, 0 failures, 1 hosted-runner-only skip**. The locked production build and JavaScript syntax checks passed. A syntax-tree comparison with `2470d7b` confirmed identical assertions, signed payload and provider/verification arguments in the same order. No production connection, protected workflow dispatch or extra provider operation was used.

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
