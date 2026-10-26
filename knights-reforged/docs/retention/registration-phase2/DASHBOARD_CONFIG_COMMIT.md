# Protected dashboard-only registrar configuration commit

Development candidate only. No production patch has been committed, registration
enabled, recovery job dispatched or deployment performed during development.
Reuse the installed catalogs, validated permissions, existing credentials and
existing encrypted recovery chain. Do not reinstall or survey recovery databases.

## Owner procedure after separately approved merge and exact-head checks

1. Keep the three existing variables staged on **KingdomReleaseCheck**, including
   `KINGDOM_COPY_REGISTRATION_ENABLED=0`. Do not recreate them. Keep all other
   Railway editors, automation and operators from changing this environment's
   pending patch until the commit run ends. The GitHub workflow uses the existing
   `kingdom-come-production` mutex; it cannot lock Railway's dashboard/API editors.
2. GitHub → Actions → **Owner approved Railway release** → Run workflow. Select
   `release/production`, operation **registrar-config-inspect**, promotion OFF;
   leave patch inputs blank. Approve the existing protected **production** gate
   for the reviewed exact source commit. This run reads metadata only. Copy the
   **Patch ID** and **Patch digest** from its job summary; these contain no values,
   URLs, cluster digests or credentials.
3. Run that same workflow again on the same reviewed production commit, choosing
   **registrar-config-commit**, promotion OFF, and paste those exact two pins.
   Check **registrar_exclusive_window** only if the change freeze still holds.
   Approve the production gate. This action commits the exact disabled registrar
   configuration with `skipDeploys: true`; it never starts the release job.
4. Require `REGISTRAR_CONFIG_COMMIT: PASS`. The job verifies the configuration
   workflow completed, the exact original patch has a matching `COMMITTED`
   receipt, no current non-empty staged patch remains, and the old
   stopped deployment `ccd3f1b1-c1ba-4f47-9613-352c0b972304` retains identical
   timestamps, exited instance identity/state, active-deployment list and recent
   deployment identities. The Railway dashboard should show no pending patch or
   new worker deployment. Registration remains OFF. Activation and a fresh
   protected recovery rehearsal require separate owner authorization/procedure.

No local CLI, API client or new software is needed. The action uses the existing
protected `RAILWAY_TOKEN`; no new secret or permission is requested. Registrar
password/URL/scope are never entered into GitHub inputs or printed. The helper
reads staged values privately to reject unrestricted users, public hosts, wrong
maintenance database/scope, or an enabled flag. Only stored-ciphertext patch
metadata is hashed for the public review pin. No database connection is made.

## Failures, retries and concurrency limit

### Inspection #54: read-only encrypted-shape diagnostic

[#54 / run 40410711691](https://github.com/catillatio/test/actions/runs/40410711691)
at `346d823042653a24276b886f2761b8334eac7005` passed the preceding metadata and
worker guards, then stopped at `PATCH_ENCRYPTED_SHAPE`. The release job was
skipped. Independent Railway summaries still show the three approved variable
additions, but omit their raw objects. That evidence does not identify which
encrypted-shape assertion failed. Railway's GraphQL `EnvironmentConfig` scalar
does not define its internal JSON shape; no acceptance-rule correction is justified
from these summaries alone.

On this failure only, **registrar-config-inspect** now also prints one
`REGISTRAR_CONFIG_SHAPE` JSON line containing:

- The top-level staged-patch key names.
- The worker patch object's key names, without its service ID.
- Each approved variable's own key names and JSON types, without nested content.

Only recognized metadata key names can appear. Unexpected provider keys are
represented by `<REDACTED_KEY>` because a key itself could contain an ID or
credential. Their types are withheld too; no arbitrary names are echoed. There
are no values, ciphertext, lengths, fingerprints, IDs, secret hashes or response
bodies. No encrypted-value contents or decrypted fields are traversed for this
report. The existing acceptance rules, failure category and nonzero exit status
are unchanged. Commit mode never prints this shape diagnostic. A failing
inspection emits no review pins and authorizes no mutation or retry.

**Next owner action:** after reviewing/merging this diagnostic and its exact-head
checks, perform only step 2 above: a new `registrar-config-inspect`, promotion OFF,
blank patch inputs, with the existing production approval. Return only the fixed
failure category and `REGISTRAR_CONFIG_SHAPE` line. Do not proceed to the commit
step, enable registration or start recovery. Use that observed structure to make
one evidence-based API-shape correction, with regression tests; do not relax the
scope checks speculatively. The existing catalog/permission validation remains
applicable and need not be repeated.

### Earlier metadata and transport investigations

Inspection [#53 / run 40406048608](https://github.com/catillatio/test/actions/runs/40406048608)
at `5427755` exposed an API-contract bug: the helper asserted
`environment.unmergedChangesCount === 3`. The official Railway schema defines
that field as a **nullable Int**; the official integration describes it as changes
not merged from a **forked environment**, unrelated to staging. Read-only
`get-status` returned `null` for production while `get-staged-changes` showed the
three expected variable leaves. Comparing `null` with `3` rejects this valid state.
The same unrelated field was incorrectly used as a post-commit zero-count test.

The corrected helper does not query/use this fork counter. Exact staged scope is
established from the complete patch: only the worker service, only its variables,
and exactly the three approved names. Postchecks instead read the exact original
patch by ID, require a `COMMITTED` receipt with unchanged ciphertext/creation
identity and valid applied/revision timestamps, then inspect the current staged
record. Only that same committed receipt or an explicitly empty staged record is
accepted. Missing/erroring data, another non-empty patch, wrong receipts and changed
payloads fail closed, regardless of any fork counter.

Patch ID, environment ID, status, nullable applied/error fields and each timestamp
retain strict checks, now with individual fixed failure categories. No ID/date
coercion, nullable-error bypass or fallback approval is added. The retained #53
tag grouped these assertions, so no claim is made that nullable values absent
from the integration were independently observed. The wrong fork-counter
assertion is a confirmed blocker; additional mismatches, if any, remain rejected
and will identify their exact field on the next approved read-only inspection.

The first inspection at merged PR #46 (`e443605`) failed in
[run 40401018436](https://github.com/catillatio/test/actions/runs/40401018436).
The safety job passed and the release job was skipped. Its single generic error
does **not** establish API authentication/permissions, patch validation or worker
identity as the cause. Read-only Railway metadata still shows the three-variable
staged patch and unchanged original worker. Do not rotate credentials, broaden
permissions or edit the staged values based on that opaque message.

The earlier follow-up diagnostic emits `REGISTRAR_CONFIG_FAILURE: <FIXED_CATEGORY>`.
It distinguishes HTTP/GraphQL authentication and permission codes, query rejection,
transport/response failures, target/worker checks, encrypted/decrypted patch shape,
disabled flag, registrar URL and scope. Missing/unknown GraphQL codes remain
`API_GRAPHQL_REJECTED`; provider message text is not evidence for an auth diagnosis.
After separately reviewed merge and exact-head checks, run **only**
`registrar-config-inspect` with promotion OFF and blank patch inputs, approve its
existing production gate, and return only the fixed category if it fails. No
commit/recovery retry or production configuration change is authorized by that
diagnostic. Existing successful validation evidence remains applicable.

- Missing/extra variables, unrelated services, volumes, networking, shared
  settings, deploy commands, unexpected patch state, wrong scope, changed patch
  ID/revision/ciphertext or worker drift stop before the mutation.
- Writes are never automatically retried. **Re-run jobs** cannot execute a commit:
  the write path requires `GITHUB_RUN_ATTEMPT=1`. A new dispatch must supply the
  same reviewed pins; another pending patch is rejected rather than adopted.
- After any failure or lost acknowledgement, do not run a release/recovery or
  click Railway Deploy. Inspect the patch and old deployment read-only. If the
  patch already cleared, do not attempt another commit. If it remains, a fresh
  protected inspection/review is required before a new commit request. The
  action does not undo settings, restart the worker, or repeat a backup.
- The official Railway API exposes `environmentPatchCommitStaged(environmentId,
  commitMessage, skipDeploys)`, **without an expected patch ID/version parameter**.
  It cannot provide an atomic compare-and-swap against an independent dashboard
  edit. Pinning and immediate revalidation protect retries and detectable changes;
  postchecks detect drift but cannot undo an intervening administrative edit.
  **An exclusive owner change window is a necessary operating prerequisite. If
  that cannot be guaranteed, do not run the commit action.** No claim is made that
  GitHub concurrency locks external editors, and no unsupported API/ETag/header
  is used to pretend otherwise.

All 23 historical recovery copies, emergency OIDs **106971 / 129180**, later
protected copies, catalogs, ownership and audit records remain untouched.
Registration activation, adoption, retirement, scheduling, game promotion,
backup/restore, migrations and signing are outside this action.

## API contract and validation

The transport uses only the fixed HTTPS Railway endpoint, project-token header,
redirect rejection, bounded request timeouts and fixed failure diagnostics.
Provider bodies/errors, values, workflow IDs and exception details are not logged.
Only read-only configuration-workflow status polling follows the single mutation.

Official Railway CLI v5.70.0 sources:

- [Commit staged patch with skipDeploys](https://github.com/railwayapp/cli/blob/v5.70.0/src/gql/mutations/strings/EnvironmentPatchCommitStaged.graphql)
- [API schema](https://github.com/railwayapp/cli/blob/v5.70.0/src/gql/schema.json)
- [Existing project-token authentication](https://github.com/railwayapp/cli/blob/v5.70.0/src/client.rs)

Focused synthetic tests exercise inspection/no-write, exact scope/disabled values,
pin/revision checks, no retry after uncertain writes, worker restart/queue/instance
drift, completion timeout, cleared-patch verification, secret-safe output and
workflow separation. Final exact-head full CI is linked in the draft PR; no
protected production workflow is dispatched for development or testing.
