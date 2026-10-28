# Read-only first image handoff inspection

Protected run #76 passed image authentication but stopped at target preflight.
Its generic error and retained artifacts do not identify the first assertion.
Connected Railway tools expose normalized service summaries, not every raw
timeout, instance lifecycle or pending-patch field. No actual mismatch is claimed
from those omissions. No acceptance rule is changed by this inspection.

## Shortest dashboard-only procedure

1. Review this PR. After separately authorized merge and green production CI,
   open **GitHub → Actions → Railway authorization diagnostic → Run workflow**.
2. Select **release/production**. Check **image_target_inspection**, then run it.
3. Approve the existing **production** environment gate when prompted.
4. Open **Inspect exact first image handoff assertions without writes**. Return
   the `IMAGE_TARGET_FIRST_REJECTION` line. If the header says UNVERIFIED, return
   that header instead. Relevant `IMAGE_TARGET_FIELD` lines are also sanitized.

Do not rerun #76 or launch the **Owner approved Railway release** workflow for
this inspection. No image preparation, backup, recovery, deployment, Console SQL,
token creation, variable changes or local/Windows software is needed.

A rejected assertion makes this diagnostic red by design. MATCH only means that
the current provider-state checks matched; every result explicitly states
`authorizesRelease: false`. It is never a release approval. If the cause is an
API failure, UNVERIFIED and a fixed category distinguish that from an assertion.
Do not share raw GraphQL responses, runner environment headers or credentials.

## Exact authenticated queries and checks

The job uses the existing protected `RAILWAY_TOKEN` and target IDs at step scope.
It uses `railwayClient` (project-access-token header, verified HTTPS, no redirects,
no cache, bounded body, 15-second timeout). It accepts only the exact exported
`imageInspectQuery` and `imageReceiptQuery` from
[image-deploy.mjs](../../deployment/release/image-deploy.mjs).
These are the same queries used by the operational preflight, with the exact
configured project/environment/game IDs. No query or endpoint is user-supplied.

There is one inspection read, and at most one additional receipt read when the
existing pending record is COMMITTED. The transport rejects every other operation
and limits total reads to two. No mutation, CLI, child process or database client
is available through this inspection. It publishes no artifacts or private inputs.

`inspectImageTargetState` is the shared provider-state portion of the existing
preflight. An optional observer labels each existing assertion immediately before
it runs. It cannot skip or override an assertion. Operational callers omit the
observer; the existing accepted/rejected cases and exact snapshot remain intact.
This avoids maintaining a second, drifting copy of the acceptance rules.

The first rejection prints only a fixed field name, expected-condition label and
sanitized actual value/type. The other field lines include lifecycle statuses,
replica counts, nullness, valid-timestamp flags and expected-value matches.
IDs, timestamps, paths, commands, source URLs, patch contents, variable values,
credentials, assertion messages/diffs, provider responses and secret hashes are
never included. `OTHER_STRING` means a string outside the fixed safe enum list;
its value is withheld. API errors emit only existing fixed failure categories.

The API necessarily returns private config/patch data for the existing receipt
and snapshot checks; it is compared only in memory. Only explicitly selected
nonsecret metadata reaches output. No full response or approval digest is saved.
The inspection shares the production release mutex and does not cancel an active
release. The original authorization-only mode remains the unchecked default.

## Verification and remaining boundary

Tests exercise the real shared checks, the actual CLI and authenticated transport
with synthetic offline data; they cover first-failure order, lifecycle, replicas,
pending representations, zero-write request traces, secret-safe output, invalid
contexts and API failures. Synthetic null/REMOVED examples are test cases, not
production findings. Full exact-head CI is recorded on the draft PR.

The owner must run this one protected read-only inspection after the reviewed code
is available on production. Until its authenticated result is returned, the exact
first rejection remains unverified. A later correction must use that evidence;
no fallback, default, weaker check or new release attempt is justified meanwhile.
