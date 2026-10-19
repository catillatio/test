# Private verification worker substage diagnostics

Release run #5 reached `independent-verification-cluster`, which previously
covered six prerequisites under one label. This change only splits that existing
label. It adds no database query, subprocess, file operation, network request,
retry, permission, configuration change, or release operation.

The existing terminal failure message now names one of these fixed substages:

| Fixed substage | Existing prerequisite |
| --- | --- |
| `independent-verification-database-connection` | Construct the verification pool and connect to its configured private database. |
| `independent-verification-working-directory` | Create the temporary working directory. |
| `independent-verification-cluster-identity` | Read `pg_control_system()` and require a cluster identifier different from the source. |
| `independent-verification-advisory-lock` | Acquire the existing verification advisory lock. |
| `independent-verification-copy-absence` | Require that the uniquely named restored-copy database does not already exist. |
| `independent-verification-storage-capacity` | Read temporary filesystem capacity and require more than five times the source database size plus 128 MiB. |

The message includes no URL, credential, SQL result, identifier value, exception
message, stack, or provider response. The labels describe the operation that was
active; they do not diagnose a particular password, permission, network, or
storage problem. Existing cleanup is unchanged, including failure propagation
from cleanup. Earlier and later gates retain their original labels.

All original assertions and their ordering remain. Backup export cannot begin
until all six prerequisites pass. Source status and export remain read-only;
administrative restore operations remain confined to the independent cluster.
The controller, protocol, encryption, report upload, recovery retention,
owner approval, signed promotion, and workflows are unchanged.

## Offline regression checks

`node --test tests/release-worker-substages.test.mjs` executes the real worker in
isolated subprocesses with synthetic configuration. Only external-operation
boundaries are mocked. The real request/environment checks, cluster and storage
assertions, report validation, cleanup and terminal catch still execute.

The 20 cases cover each substage's operation failure, rejected cluster identity,
busy lock, existing copy, insufficient space, the exact storage threshold,
successful preparation, a successful one-byte-above-threshold preparation,
earlier and later failures, and read-only post-deployment verification. Exact
ordered traces check that failed prerequisites cannot reach backup or report
upload, and that successful backup/encryption/conditional upload/round-trip/
restore/migration/report ordering remains unchanged. Synthetic exception
properties and subprocess stderr must never appear in the worker output. Real
network, DNS, provider subprocesses and unexpected operations are blocked.

These tests do not establish live PostgreSQL credentials, permissions, disk
capacity, bucket write access or the exact cause of run #5. Nothing in this patch
restarts a worker or dispatches a release. Review a fixed substage from a future
separately owner-approved execution before changing that prerequisite.

Local validation passed actionlint 1.7.12 for every workflow, JavaScript syntax,
TypeScript, production build, and all 91 static checks including 73 EJS fixture
cases. The complete automated test command passed 240 tests, with 113 existing
database/hosted-runner tests skipped because no disposable PostgreSQL URL or
hosted runner was supplied. A syntax-tree comparison with production commit
`5fc3e17` confirmed that removing diagnostic `gate` assignments leaves identical
worker code, including every operation, argument, assertion and cleanup path.

## Separate failure-report mechanism evaluation — not implemented

The worker still only uploads successful reports. On failure it logs the fixed
gate and exits; the controller can still wait up to 20 minutes for a missing
report. This patch deliberately leaves that transport behavior unchanged.

A prompt failure mechanism requires a separate protocol/controller review and
independent tests. At minimum it must:

1. Use an explicit failure message type containing `passed: false` and a fixed
   allowlisted stage only. Never include the caught exception or runtime values
   beyond the existing release-identity fields.
2. Bind evidence to the exact nonce-bearing job ID, mode, commit, candidate
   digest, project, environment, game service, worker service, and independently
   verified worker deployment ID. Validate the request before trusting any
   supplied upload grant. Failures before that point remain local-only.
3. Retain verified HTTPS and bounded, exact-object, conditional upload grants;
   do not give the worker durable bucket credentials, a signing key, or owner
   recovery keys. Define races, replays, expiry, duplicate uploads, transport
   failures and conflicting success/failure evidence conservatively.
4. Have a terminal rejection path in the controller. A failure envelope must
   never become successful `checkJobReport` evidence, a backup manifest, retained
   recovery evidence, a signed approval, or permission to promote. Missing,
   malformed, stale, mismatched or conflicting evidence must still stop release.
5. Independently test spoofed identities, wrong deployments, stale jobs, unknown
   stages, success/failure confusion, leaked exception text, failed uploads,
   concurrency, and that every failure path leaves all recovery and promotion
   gates closed.

The existing `checkJobReport` requirement that `passed` equal `true` is untouched.
The new worker tests also verify that prerequisite failures do not attempt any
report upload, and that a failed report upload does not try an
unreviewed fallback. No failure-envelope support or additional grants are added
in this diagnostic patch.
