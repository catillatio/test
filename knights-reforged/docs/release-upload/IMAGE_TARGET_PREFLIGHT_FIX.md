# Image target preflight: active deployment versus latest attempt

## Evidence from protected run #74

[Run #74](https://github.com/catillatio/test/actions/runs/40613310487) used
`58a8d875fc188a59e429898485aa775c991f8931`. Request authorization and exact
prepared-image authentication passed. Target preflight failed before the backup,
configuration staging, configuration commit or deployment steps ran. Do not
rerun this attempt.

Authenticated read-only Railway inspection confirmed:

- Project merry-patience, environment production, game service test.
- Latest attempt `3e59e16d-c02e-4771-8da5-6d378e461496`: FAILED at SNAPSHOT_CODE.
- Sole authoritative active deployment
  `d9bcc888-d55b-4047-836a-0a8cd1779a97`: SUCCESS; one running replica and none
  crashed. It was not selected by scanning history for an older success.
- Source catillatio/test, root /knights-reforged, expected start/migration commands
  and /healthz; no staged changes in the environment or game service.
- Legacy numReplicas is null. Explicit regional configuration is
  multiRegionConfig.iad.numReplicas = 1.
- Live /healthz returned HTTP 200 and status ready, commit
  `1f95053e5179a02bb6d26186839ec964a4e60c28`.

The old validator required latest.status = SUCCESS, latest = active[0], and
legacy numReplicas = 1. These predicates contradict this healthy authenticated
state. The generic #74 failure line does not establish which assertion was
evaluated first; no raw provider response was retained in its logs. The integration
does not expose every raw service-instance field (notably healthcheckTimeout and
restartPolicyType); their strict existing checks remain unchanged. Current
railway.json specifies 120 seconds and ON_FAILURE respectively. No default is
invented for either field.

## Correction and preserved controls

The active-deployment list is authoritative. Require exactly one SUCCESS,
non-stopped deployment, with exactly one RUNNING instance, in the exact expected
project/environment/service. Latest is separately authenticated: it must either
equal that active record, or be a later FAILED, REMOVED or SKIPPED attempt with no
running instance. Unknown or in-progress latest attempts remain rejected.

A server-filtered deployments query checks all in-flight status classes, bounded
to one result: any result blocks release. This detects competing queued work even
when it is not the latest record or in the active list. The public Railway schema
defines activeDeployments as currently deployed/running deployments and supports
DeploymentListInput.status.in. No history truncation is used to establish safety.
The complete inspection query also passed GraphQL validation against the
[official CLI schema](https://github.com/railwayapp/cli/blob/5ba0b00c62d7fd5cdade53f0c3869ed4ba1de2e1/src/gql/schema.json)
in a disposable cloud test; no production API mutation was used.

Null legacy replicas require explicit regional counts summing to exactly one.
Missing, fractional, string, negative, zero-total or multiple configured replicas
are rejected. Both legacy and regional counts, both deployment identities and
timestamps, and running instance identity enter the target snapshot. Every fresh
pre/post-commit read validates the same conditions and exact snapshot digest.
Restarted instances, new failed attempts, competing deploys and changed regional
configuration invalidate the approval. Source identity is checked before staging
and again before commit; only the reviewed image-source change is permitted.

Environment config is handled privately. Only selected non-secret replica counts
enter the snapshot; variable values and registry credentials are neither logged
nor hashed. The protected edit window and production mutex remain necessary:
Railway's commit API has no compare-and-swap parameter. A race after the last read
cannot be eliminated by client checks; strict staged-patch/receipt verification,
unchanged-state reads and no mutation retries remain mandatory.

No changes to owner approval, candidate/image identity, package privacy, signing,
encrypted independent backup/restore, migration/schema preservation, health
verification, cleanup safeguards or gameplay. No production mutation was made.

## Verification and next owner action

Focused tests cover failed latest plus healthy active, legacy/regional replicas,
wrong scope/source, unhealthy or multiple active deployments, all in-flight
classes, missing evidence, configuration and instance races on either side of
commit, secret-independent snapshots, exact receipts and single-mutation behavior.
Full exact-head CI and disposable recovery results are linked on the draft PR.

Review the PR; do not rerun #74. After separately approved merge and green exact
production push CI, a newly prepared image must match that new source commit.
Use the existing protected image-prepare, then separately owner-approved
image-release procedure with its exact new run/artifact/digest selectors. Keep
first-transition credential installation and the exclusive edit window explicit
for that eventual release. This assignment authorizes neither workflow dispatch
nor image publication, recovery or production deployment.
