# Protected Railway authorization diagnostic

This is a separate manually triggered workflow. It does not alter `production-release.yml`, release safeguards, or the offline signing/backup diagnostic. It must first be reviewed and merged by the owner; creating its PR does not run it.

## What it verifies

The workflow uses the existing **production** environment and its required owner approval, and runs only for a manual request on **release/production**. It checks out the exact requested commit. The approved diagnostic step binds `RAILWAY_TOKEN` directly from the existing secret and the same four configuration variables used by the release: `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_GAME_SERVICE_ID`, and `RAILWAY_RELEASE_WORKER_SERVICE_ID`. There is no reusable-workflow secret forwarding, additional stored credential, or dependency installation.

It issues at most five authenticated read-only GraphQL queries at Railway's fixed HTTPS API, with redirects forbidden and a 15-second timeout per request. The project-token header is the same one used by pinned Railway CLI v5.70.0. The queried fields are only project, environment, service, and service-instance identifiers:

1. `projectToken { projectId environmentId }` establishes authentication and scope.
2. `project(id: ...) { id }` verifies the exact project.
3. `environment(id: ..., projectId: ...) { id projectId }` verifies the exact environment and project relationship.
4. For each game/worker service, `service(id: ...) { id projectId }` and `serviceInstance(serviceId: ..., environmentId: ...) { serviceId environmentId }` verify both project membership and existence in the exact environment.

The queries were checked against the [pinned v5.70.0 API schema](https://github.com/railwayapp/cli/blob/v5.70.0/src/gql/schema.json) and [project-token authentication implementation](https://github.com/railwayapp/cli/blob/v5.70.0/src/client.rs#L37).

All identities must come back from authenticated metadata; requested IDs alone are never evidence. Services must differ. Missing or inaccessible metadata, HTTP/JSON/GraphQL errors, scope/identity mismatches, invalid configuration, and disabled TLS verification fail closed. Calls stop before service inspection unless project and environment checks both pass. No personal/API-token fallback is allowed.

The diagnostic's only result output is six ordered fixed categories:

```text
RAILWAY_TARGET_CONFIG: PASS
RAILWAY_TOKEN_AUTH: PASS
RAILWAY_PROJECT_ACCESS: PASS
RAILWAY_ENVIRONMENT_ACCESS: PASS
RAILWAY_GAME_SERVICE_ACCESS: PASS
RAILWAY_WORKER_SERVICE_ACCESS: PASS
```

Any category may be `FAIL`; any failure fails the job. The output wrapper discards stderr and unexpected stdout rather than printing provider responses, exception details, credentials, or URLs. GitHub adds ordinary job/step metadata; its standard secret masking protects the token. The four target UUIDs are configuration identifiers, not credentials.

`TARGET_CONFIG` checks the production/manual context, exact UUID syntax, distinct services, and TLS policy. `TOKEN_AUTH` verifies a valid project-token metadata response, even if its scope differs from the expected target. Project/environment categories additionally require the matching token scope and actual target reads. Service categories require the exact returned project/service IDs and environment-specific instance. A FAIL means the check could not be verified, not necessarily that the credential is invalid: network/API failures also fail closed. Later gated categories remain FAIL when earlier prerequisites fail.

## Owner procedure on Android, after review and merge

1. Confirm the normal production-branch checks passed for the merged commit. Keep the production environment's required owner reviewer, branch restriction, and disabled administrator bypass intact.
2. Open **GitHub → catillatio/test → Actions → Railway authorization diagnostic**. Do not select **Owner approved Railway release**.
3. Choose **Run workflow → release/production**. Review the pending job, then approve its existing **production** environment gate.
4. Read only the six result categories and share those results if further investigation is needed. Do not paste credentials or provider output. A failed check must be investigated without broadening token permissions or weakening validation blindly.

No production diagnostic was run during development. All tests use invented tokens and offline response fixtures. Do not put real credentials in local tests.

## Limits and preservation

This verifies read access only. Even six PASS results do **not** prove variable-staging or upload permissions, a successful worker deployment, backup-store access, restored-copy verification, or production release readiness. To distinguish staging from upload failures later, separately reviewed fixed-category markers may be added around existing operations in a future explicitly approved release. This diagnostic never performs those operations as a test.

It installs no Railway CLI and runs no staging, upload, deployment, restart, database connection, migration, provisioning, backup, restore, or moderation command. It receives no database URL, signing key, bucket credential, or initialization credential. It exports no artifacts or metadata reports. Existing release approval, encrypted recovery, independent retention, restored-copy migration testing, exact-commit and promotion requirements are unchanged.

Validate locally with synthetic fixtures:

```sh
node --test tests/railway-authorization.test.mjs tests/release-deployment.test.mjs tests/release-diagnostic.test.mjs tests/release-transport.test.mjs
```

Local verification passed all 36 new authorization cases. The combined release suites passed 109 cases, with one existing hosted-runner network-namespace check skipped locally. TypeScript, production build, JavaScript/Bash syntax checks, all 91 static checks (including 73 EJS render fixtures), and actionlint 1.7.12 across all workflows passed. No real provider request or database connection was made by these new tests. Normal PR checks remain required before owner review and merge.
