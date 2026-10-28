# Verified typed image-source transition

## Evidence and exact correction

Release 40638383544 staged an image source with `repo:null` but did not complete
the configuration commit. Its exact retained record had a repository-source
error and no applied timestamp. This establishes a failed source operation;
the sanitized error did not establish a more specific provider implementation bug.

The owner-approved isolated `kingdom-source-transition-canary` then established:

1. A pinned public GitHub fixture was applied with `skipDeploys:true`; no deployment.
2. A source-image-only staged delta committed with `skipDeploys:true` applied the
   exact synthetic image but retained the GitHub repository and commit. Omission
   is a merge, not source removal. This proposed fix was rejected.
3. Typed `serviceInstanceUpdate` with exactly `source.image` and `source.repo:null`
   returned true. Independent authenticated reads confirmed the exact image,
   effective repository null, absent GitHub commit/branch fields, no pending
   changes/work, zero deployments and unchanged unrelated configuration.

[Reviewable evidence summary](typed-source-canary-evidence.json). It contains no
tokens, variable values, private provider bodies or credentials. The canary is
preserved; this PR neither cleans it up nor authorizes cleanup.

Contracts: [published typed schema](https://github.com/railwayapp/cli/blob/master/src/gql/schema.json),
[service API](https://docs.railway.com/integrations/api/manage-services).
`serviceInstanceUpdate` returns Boolean, has no `skipDeploys` parameter and accepts
`ServiceInstanceUpdateInput.source` containing nullable image/repository strings.
Its schema warns that a non-fork environment update propagates to other non-fork
environments. Scope must not be inferred from merely passing `environmentId`.

## Protected promotion sequence

The workflow, owner authorization, exact-candidate/image authentication, signed
v3 recovery proof, independently encrypted backup/restore, production mutex,
health/login checks and post-release preservation remain unchanged.

1. Before recovery, authenticate the normal target and a complete project
   environment enumeration. Require exactly one undeleted environment, matching
   the intended production target. Missing pagination evidence, truncation,
   additional environments (including presumed forks) and wrong identities fail.
   Include this non-secret scope in the exact pre-backup target digest.
2. After all recovery gates, stage only the seven proof-bound release variables
   and optional owner-approved registry credentials. No source key is allowed.
   Require every effective variable/credential to match exactly. A field omitted
   from the provider delta must be proven from authenticated applied data, never
   assumed unchanged or accepted when redacted/missing.
3. Freshly compare the target, complete environment scope, original source,
   full private configuration, patch identity/revision/content and values. Commit
   once with `skipDeploys:true`. Require the workflow acknowledgment, successful
   workflow completion, exact immutable committed receipt, cleared pending patch,
   exact applied values and unchanged running deployment/original source.
4. Read again. Apply one typed source update containing only the approved exact
   image reference and `repo:null`. Require an exact Boolean true acknowledgment.
   Do not retry an uncertain response, restage, disconnect or fall back to tags.
5. Read and independently verify the exact effective source and serialized
   source. The serialized source permits only image and optional literal-null
   repository; old branch/commit fields and unknown source fields fail. Recheck
   receipt, scope, pending changes, every release/credential value, unchanged
   full private configuration outside authorized fields and exact old runtime.
6. Read once more immediately before one `serviceInstanceDeployV2`. Authenticate
   the returned exact deployment ID/target/image, then run the unchanged health,
   migration-proof, login and independent preservation verification.

Full private configuration equality is in memory only. Neither credentials nor
signed proofs are hashed into public target/approval digests or printed.
Historical source-patch validators remain strict for the incident-bound read-only
diagnostic; operational promotion always uses the configuration-only contract.

## Safe progress and failure boundaries

| Fixed marker | Meaning |
| --- | --- |
| `PATCH_STAGED` | Exact variables/credential delta checked; no commit confirmation |
| `CONFIG_COMMITTED_NO_DEPLOY` | Exact committed configuration and unchanged source/runtime verified |
| `SOURCE_UPDATE_REQUESTED` | One source-update attempt is about to be made; outcome may be uncertain |
| `SOURCE_VERIFIED_NO_DEPLOY` | Typed acknowledgment and fresh exact source/configuration/runtime checks passed |
| `DEPLOYMENT_QUEUED` | Exact explicit deployment identity/reference verified |

Every write is single-attempt. A lost response can leave configuration or the
source applied even though the controller stops. Preserve that state and reconcile
read-only; never rerun the job, repeat the setter/commit, reset credentials or
automatically roll back. An expired proof is never reused. A fresh release requires
separately approved exact-commit artifacts and recovery evidence.

The API exposes no demonstrated compare-and-swap across enumeration, reads,
commit, source update and deploy. The required owner-exclusive edit window must
exclude dashboard edits, new environments and other automation throughout the
release. The GitHub mutex alone cannot prevent external edits. Scope/configuration
are checked before and after writes; they cannot undo an external race already
committed by the provider. If exclusivity cannot be enforced, HOLD.

## Dashboard-only owner procedure after separate approval

1. Review this draft and its exact-head CI. Merge only with separate owner approval;
   wait for green post-merge CI at the resulting exact production commit.
2. Use **Railway authorization diagnostic** on `release/production` with only
   `image_target_inspection` ON; approve its existing production gate. Require
   MATCH, including the new complete single-environment guard. No backup runs.
   Unexpected pending configuration, unknown source or additional environments
   require read-only reconciliation; do not delete/change them to bypass the guard.
3. Verify existing protected image publication/privacy flags, Private package and
   restricted read-token setup remain valid. No token recreation, Railway Source
   edits or new production credential is required for this PR.
4. With separate publication approval, run **Owner approved Railway release**:
   branch `release/production`, operation `image-prepare`, promotion OFF,
   credential-installation OFF, remaining selectors blank/OFF. Approve the gate.
   Retain the exact run ID, candidate artifact ID and manifest digest.
5. With separate production-release approval, run that workflow once on the same
   exact SHA: operation `image-release`, exact image run/artifact/digest, exclusive
   window ON, promotion ON. For the first GitHub-to-image transition select
   `image_install_registry_credentials` ON. Existing exact credentials omitted
   from a delta are privately verified; different authorized credentials are
   committed with the proof-bound variables. Leave registrar selectors OFF/blank
   and approve the production gate. Never use a rehearsal merely for diagnostics.
6. Require all five progress markers plus the existing final health/login,
   exact-image and preservation evidence. Only after the actual first private-image
   deployment passes may the owner confirm Registry Ready for later releases with
   installation OFF. The configuration canary alone is not that confirmation.

Any new production commit needs a newly prepared image; old release #78 evidence
and stale artifacts cannot authorize this implementation. No production workflow,
image publication, recovery or deployment is executed by this PR.

## Tests and remaining limits

Focused synthetic tests cover all mutation acknowledgments, receipts, partial
commits, six/seven-variable deltas, existing/partial/omitted credential deltas,
source-view disagreements, legacy field retention, full private configuration
drift, multiple/incomplete environment lists and changed active deployments.
HTTP integration runs the actual controller/client against a stateful disposable
provider while a synthetic game remains healthy. It verifies the signed image
recovery proof at the explicit-deployment boundary and tests lost acknowledgments
without retries. These are synthetic integration fixtures, not another Railway run.
The full exact-head CI retains actual container proof, PostgreSQL, browser,
encrypted recovery, population, schema and retention delivery regressions.

The real canary had no running game; the running-service continuity tests use a
synthetic HTTP service. The first actual production handoff still relies on the strict
live runtime/source/configuration checks above. This implementation intentionally
does not support projects with multiple environments. Provider-filtered or
incomplete enumeration is not permission to assume a single-environment scope;
the owner must also verify the project inventory for the exclusive window.
