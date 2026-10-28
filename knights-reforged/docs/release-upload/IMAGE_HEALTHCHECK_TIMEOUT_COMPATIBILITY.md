# Verified image preflight compatibility correction

## Authenticated evidence

[Protected read-only diagnostic #5](https://github.com/catillatio/test/actions/runs/40623167100)
at `d0b8d70fddae2c9ce81aee9accba65de30d73159` identified the first rejection:
game.healthcheckTimeout, expected 120, actual null. Its sanitized metadata also
establishes one SUCCESS/non-stopped active deployment with two instance records:
REMOVED and RUNNING. The latest failed attempt has zero instances. Regional
configuration is one replica; there is no in-flight deployment. Root, start,
migration, health path, restart policy and source match. The pending record is
STAGED with null appliedAt/error, valid timestamps and only empty containers.

The captured sanitized fields are retained in
[the regression fixture](../../tests/fixtures/railway-image-target-observation-5.json).
No IDs, timestamp values, credentials or raw responses were retained in it.
Tests wrap these observed fields in explicitly synthetic identity envelopes.
Additional authenticated read-only config inspection found no serialized timeout;
name-only rendered-variable inspection confirmed no RAILWAY_HEALTHCHECK_TIMEOUT_SEC
override. No variable values were read or published.

## Timeout semantics and correction

[Railway healthchecks](https://docs.railway.com/deployments/healthchecks#healthcheck-timeout)
document a **300-second default startup deadline**. A configured health endpoint
must serve 2xx before Railway makes a deployment active. An unsuccessful startup
times out as FAILED. Null is supported by the
[config reference](https://docs.railway.com/config-as-code/reference#healthcheck-timeout).
It is an unset setting, not an instruction to disable healthchecks.

Null is **not numerically equivalent to 120**. The correction accepts the existing
explicit 120 or the verified unset representation with the documented 300-second
service fallback. Other explicit values and missing/undefined fields still fail.
Null additionally requires known serialized deploy config with no explicit
timeout override. Service/shared timeout-variable overrides or unknown variable
map shapes fail closed on every read; no secret value needs to be examined.

Config-as-code can override settings for an individual deployment without updating
the service's API/dashboard fields. Consequently the null service field does not
prove the historical deployment used 120. The repository still declares 120; it
is unchanged. The supported service fallback is 300. No production timeout is
written, substituted or silently normalized.

Both supported startup budgets fit the existing 120-by-5-second health polling
window. Its checks remain unchanged: exact deployment SUCCESS, ready health JSON,
expected release and **exact candidate commit**, followed by image identity and
independently verified saved-realm preservation. Failed/crashed deployments are
rejected. Accepting the bounded service fallback does not waive readiness or
permit a deployment that failed healthchecks. The current service remains online
with one running replica. Raw null remains null in the immutable target snapshot;
changing it to 120 during a protected operation invalidates that snapshot.

## Instance history correction

The active deployment's instances include retained REMOVED history. The guard now
requires exactly one RUNNING instance, unique nonempty instance IDs, and only
REMOVED records alongside it. Two RUNNING instances, zero RUNNING instances and
all other lifecycle states remain rejected. This does not select an older
deployment: the sole authoritative active deployment must still be SUCCESS and
non-stopped in the exact target scope. Latest-attempt checks are unchanged.

Every instance record, including REMOVED IDs/statuses, remains in the before/after
snapshot. History changes, restarts, competing deployments, staged edits and any
raw timeout change still invalidate approval. No recovery, identity, signature,
receipt, schema, owner-review or no-retry control is weakened.

## Verification and owner action

Tests replay every captured sanitized field, exercise the complete synthetic
handoff, and reject unsupported timeouts/overrides, unsafe lifecycle states,
duplicate IDs and changes before or after commit. Full exact-head CI is linked
on the PR and uses disposable fixtures only.

Review this correction. After separately approved merge and green production CI,
run the existing **Railway authorization diagnostic** with image_target_inspection
checked. Require MATCH before preparing a fresh exact-commit image and separately
authorizing its protected release. Do not rerun #76 or reuse an older image after
the source commit changes. No Railway configuration change or credential setup
is required for this correction. No production workflow was dispatched here.
