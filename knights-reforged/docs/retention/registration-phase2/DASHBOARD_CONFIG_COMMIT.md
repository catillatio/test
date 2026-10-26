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
   workflow completed, the environment has zero unmerged changes, and the old
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

The first inspection at merged PR #46 (`e443605`) failed in
[run 40401018436](https://github.com/catillatio/test/actions/runs/40401018436).
The safety job passed and the release job was skipped. Its single generic error
does **not** establish API authentication/permissions, patch validation or worker
identity as the cause. Read-only Railway metadata still shows the three-variable
staged patch and unchanged original worker. Do not rotate credentials, broaden
permissions or edit the staged values based on that opaque message.

The follow-up diagnostic emits only `REGISTRAR_CONFIG_FAILURE: <FIXED_CATEGORY>`.
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
