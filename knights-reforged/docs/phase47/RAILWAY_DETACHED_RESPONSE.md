# Railway v5.70 detached deployment response

This correction affects the release controller only. No workflow trigger, approval, secret, game code, database migration, worker task, recovery gate, or promotion order changes.

## Confirmed compatibility defect

For an existing project, pinned Railway CLI v5.70.0 returns this shape from `up --detach --json`:

```json
{"deploymentId":"<UUID>","logsUrl":"<provider URL>"}
```

The old controller required `projectId`, `environmentId`, and `serviceId` in that output. Those fields belong to a different CLI code path, not this existing-service response. The assertions ran **after** the upload could queue a deployment. The absence of the controller's queued marker or recovery artifact therefore does not establish that nothing was queued.

Pinned sources: [existing-service response](https://github.com/railwayapp/cli/blob/v5.70.0/src/commands/up.rs#L318), [API schema](https://github.com/railwayapp/cli/blob/v5.70.0/src/gql/schema.json), [project-token authentication](https://github.com/railwayapp/cli/blob/v5.70.0/src/client.rs#L37), [HTTPS API origin](https://github.com/railwayapp/cli/blob/v5.70.0/src/config.rs#L415).

The controller now validates `deploymentId` as an exact UUID and independently requests only `id`, `projectId`, `environmentId`, and `serviceId` from `deployment(id: ...)` at Railway's fixed HTTPS API endpoint. It uses the same dedicated project/environment token as the CLI. The returned ID and all three identities must match the approved target. Upload-supplied identity fields and `logsUrl` are never used as evidence or followed. Both worker and game uploads use the check.

Authentication/network/HTTP/JSON/GraphQL failures, missing metadata, and identity mismatches stop the release; they do not fall back to trusting CLI arguments. Requests time out after 15 seconds, reject redirects, and preserve TLS verification. Errors do not propagate provider text, assertion values, URLs, or credentials into logs. A failed check does not cancel or restart a deployment that may already have been queued; any operational action remains separately owner-authorized.

## Run #4: read-only owner review

The owner reviewed `KingdomReleaseCheck` in Railway production and reported **no deployment in run #4's requested time window**. The development workspace has no authenticated Railway access to corroborate that through the API. Do not assume the upload succeeded: the compatibility defect is confirmed in code, but the earliest runtime failure in run #4 remains unlocalized and could precede response parsing (token access, variable staging, or upload).

On Android, open Railway in the browser, select the exact configured project and production environment, open **KingdomReleaseCheck → Deployments**, and review records around **October 19, 2026, 19:09:58–19:10:01 UTC (3:09:58–3:10:01 PM Eastern)**. Allow a small timestamp margin. The upload message would be `Kingdom Come 1b7c10e1e9b236d86025b69205d444d876ecb84b`. Review immutable deployment ID, creation time, status, and message only. Do not redeploy, restart, change variables, inspect secrets, or run the release again for this check. Matching time/message is correlation evidence; preserve the exact record for authenticated identity verification rather than assuming a display name proves its target.

A separate protected read-only token/target diagnostic is recommended to narrow that remaining uncertainty; propose it separately for review and owner approval. It can verify project-token access/scope, worker identity, and matching deployment records. It cannot prove permissions for variable staging or uploads without performing those writes. Distinguishing those later failures requires separately reviewed fixed-category progress markers around the existing approved release operations, not a diagnostic that quietly stages variables or starts a service. No such workflow, operation, or extra log output is introduced by this correction. The existing three PASS results cover local signing and backup presigning only.

## Validation and review

From `knights-reforged`, run:

```sh
node --test tests/release-deployment.test.mjs tests/release-transport.test.mjs tests/release-diagnostic.test.mjs
npm run typecheck
npm run build
npm run check:static
```

The focused tests use synthetic tokens and injected responses, make no provider requests, and cover the actual detached shape, worker/game identity, invalid IDs, wrong/missing identity fields, unavailable metadata, and redacted failures. Existing release tests continue to require encrypted independent recovery, restored-copy preservation and migration verification, exact commit binding, and owner approval before promotion. Provider acceptance still requires authenticated metadata; local tests do not establish live token permissions.

Local results: all 38 new deployment-verification cases passed; the combined release suites passed 73 cases with one existing hosted-runner network-namespace test skipped locally. TypeScript, production build, JavaScript syntax checks, all 91 static checks (including 73 EJS render fixtures), and actionlint 1.7.12 for every workflow passed. No PostgreSQL or provider operation was needed for these controller tests. The normal PR checks remain required independently.

Review and merge the PR manually only after required checks pass. This change does not dispatch a diagnostic or release, approve an environment, deploy the candidate, or access production PostgreSQL.
