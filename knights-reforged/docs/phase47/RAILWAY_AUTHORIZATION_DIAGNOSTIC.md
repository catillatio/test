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

The diagnostic emits the existing six ordered PASS/FAIL checks followed by one allowlisted authentication-detail line:

```text
RAILWAY_TARGET_CONFIG: PASS
RAILWAY_TOKEN_AUTH: PASS
RAILWAY_PROJECT_ACCESS: PASS
RAILWAY_ENVIRONMENT_ACCESS: PASS
RAILWAY_GAME_SERVICE_ACCESS: PASS
RAILWAY_WORKER_SERVICE_ACCESS: PASS
RAILWAY_AUTH_DETAIL: NONE
```

Any check may be `FAIL`; any failure fails the job. Overall success also requires `RAILWAY_AUTH_DETAIL: NONE`. The output wrapper discards stderr and unexpected stdout rather than printing provider responses, exception details, credentials, or URLs. GitHub adds ordinary job/step metadata; its standard secret masking protects the token. The four target UUIDs are configuration identifiers, not credentials.

`TARGET_CONFIG` checks the production/manual context, exact UUID syntax, distinct services, and TLS policy. `TOKEN_AUTH` verifies a valid project-token metadata response, even if its scope differs from the expected target. Project/environment categories additionally require the matching token scope and actual target reads. Service categories require the exact returned project/service IDs and environment-specific instance. A FAIL means the check could not be verified, not necessarily that the credential is invalid: network/API failures also fail closed. Later gated categories remain FAIL when earlier prerequisites fail.

## Issue #17: distinguish the first authentication failure

[Issue #17](https://github.com/catillatio/test/issues/17) follows release run `39647183726` and diagnostic `39648349344` at `ab451b77302927450bdcaf70ee7f79f68431ec08`. Target format passed and a nonempty masked token binding was supplied, but `TOKEN_AUTH` failed; subsequent identity checks were gated, not independently failed. This patch adds diagnostic information only. It does not establish the cause of either past run or change `run.mjs`.

The same existing token query runs once. Local credential failures make **zero** requests; authentication failures make **one**, with no retries or follow-on identity calls. Success still permits the original maximum **five** read-only requests. No new query, variable read/write, CLI operation or permission probe is introduced. Tokens remain opaque: no guessed UUID format, trimming, correction or alternate authentication is attempted. Whitespace, control and non-ASCII bytes are rejected locally rather than placed in the request header. No provider message, exception property, response body content, credential or scope value is included in output.

| `RAILWAY_AUTH_DETAIL` | Confirmed meaning / minimum owner action |
|---|---|
| `TOKEN_MISSING` | No usable token value was supplied. Review the existing protected environment's `RAILWAY_TOKEN` binding. |
| `TOKEN_FORMAT_INVALID` | The value is not a string or contains whitespace/control/non-ASCII characters. Securely correct only the confirmed malformed binding using the intended complete project/environment token; never paste it into logs/chat. |
| `CONFLICTING_API_TOKEN` | A nonempty `RAILWAY_API_TOKEN` is also present. Review that unexpected runtime binding; no fallback or broader credential is used. |
| `HTTPS_TRANSPORT_FAILURE` | The authentication fetch did not yield a response. DNS, TLS, timeout, connection failure and blocked redirects share this category. Investigate connectivity/provider availability; retain TLS verification. |
| `HTTP_401` / `HTTP_403` | The auth request returned that status. Review the intended token's type, active status, scope and provider access policy. Status alone does not prove revocation or justify broader permissions. |
| `HTTP_429` | Rate-limited. Pause and review provider limits before a separately authorized diagnostic retry; no automatic retry. |
| `HTTP_5XX` | A 500–599 response. Investigate provider availability rather than changing credentials blindly. |
| `HTTP_OTHER` | Another unsuccessful HTTP response. Review the documented endpoint/provider contract; only this fixed bucket is printed, without URL or body. |
| `GRAPHQL_RESPONSE_INVALID` | A successful HTTP response had an unreadable/invalid JSON envelope or malformed `errors` field. Review provider/protocol behavior, not token permissions by assumption. |
| `GRAPHQL_REJECTED` | The successful HTTP response contained GraphQL errors, even with partial data. No error text is inspected or emitted; this is not proof of a specific token defect. |
| `TOKEN_METADATA_INVALID` | No GraphQL errors, but `projectToken` lacked valid project/environment UUID metadata. Verify the intended project-token type/provider contract. |
| `TOKEN_SCOPE_MISMATCH` | Valid authenticated metadata differs from the configured project or environment. Verify the intended target and correct only the confirmed ID/token mismatch; never switch to an unexpected scope automatically. `TOKEN_AUTH` can still be PASS. |
| `NONE` | Token metadata is valid and matches the expected scope. The six existing identity checks still decide overall success; this does not prove write access. |
| `UNVERIFIED` | Authentication was not attempted because of an earlier target guard, or the child/output protocol failed unexpectedly. Review the six checks; no arbitrary child output escapes. |

The fixed detail describes **only the first authentication query**, not later project/service reads. A FAIL on an early check leaves later checks FAIL by design. Read the first failed check and its detail; do not conclude that all target identities are incorrect. The shell wrapper requires all seven lines in the correct order and a known literal detail, suppresses stderr, and rejects extra text, missing lines or contradictory all-PASS results.

After owner review and a separately authorized merge, require production-branch CI, then separately authorize **only the existing Railway authorization diagnostic**, select `release/production` and approve its production environment gate. Share only the seven fixed result lines. Apply only a confirmed narrow correction through existing owner controls. Do not change tokens, permissions, signing keys, services or configuration merely because the older combined `TOKEN_AUTH` check failed.

If all identity checks pass, worker-variable write permission remains unproven: this patch deliberately performs no write probe. Any later protected release still requires separate owner authorization, a fresh backup/independent restore/retained-artifact/signature chain and the existing exact-commit safeguards. Keep both autonomous features OFF. No release rerun or diagnostic execution is authorized by implementing this patch; PR #13 stays untouched.

## Owner procedure on Android, after review and merge

1. Confirm the normal production-branch checks passed for the merged commit. Keep the production environment's required owner reviewer, branch restriction, and disabled administrator bypass intact.
2. Open **GitHub → catillatio/test → Actions → Railway authorization diagnostic**. Do not select **Owner approved Railway release**.
3. Choose **Run workflow → release/production**. Review the pending job, then approve its existing **production** environment gate.
4. Read only the seven fixed result lines and share those results if further investigation is needed. Do not paste credentials or provider output. A failed check must be investigated without broadening token permissions or weakening validation blindly.

No production diagnostic was run during development. All tests use invented tokens and offline response fixtures. Do not put real credentials in local tests.

## Limits and preservation

This verifies read access only. Even six PASS results do **not** prove variable-staging or upload permissions, a successful worker deployment, backup-store access, restored-copy verification, or production release readiness. The release controller already distinguishes worker staging, upload, identity and backup/restore failures. This read-only diagnostic refines authentication only and never performs those operations as a test.

It installs no Railway CLI and runs no staging, upload, deployment, restart, database connection, migration, provisioning, backup, restore, or moderation command. It receives no database URL, signing key, bucket credential, or initialization credential. It exports no artifacts or metadata reports. Existing release approval, encrypted recovery, independent retention, restored-copy migration testing, exact-commit and promotion requirements are unchanged.

Validate locally with synthetic fixtures:

```sh
node --test tests/railway-authorization.test.mjs tests/release-deployment.test.mjs tests/release-diagnostic.test.mjs tests/release-transport.test.mjs
```

Issue #17 focused verification passes **68/68 tests, zero failures/skips**: 50 authorization cases plus 18 unchanged-controller failure regressions. Coverage includes fixed HTTP buckets, format/conflict rejection, GraphQL/metadata/scope errors and adversarial output suppression. JavaScript/Bash syntax, actionlint and the four-file diagnostic-only scope check pass. All provider responses and credentials are synthetic; network entry points are blocked by the fixture. The earlier baseline passed 36 authorization cases; its broader release suites passed 109 cases with one existing hosted-runner network-namespace check skipped locally. TypeScript, production build, JavaScript/Bash syntax checks, all 91 static checks (including 73 EJS render fixtures), and actionlint 1.7.12 across all workflows passed. No real provider request or database connection was made by these new tests. Normal PR checks remain required before owner review and merge.
