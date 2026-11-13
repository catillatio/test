# Release 103 target preflight correction

Prepared locally from production source
`98756a0449b2b260c62c26d52491a23954f82788`. This is a controller and diagnostic
correction; it changes no application behavior, feature flags, schema or data.

## Confirmed rejection

[Protected release 43401151789](https://github.com/catillatio/test/actions/runs/43401151789)
passed image authentication and failed `IMAGE_TARGET_PREFLIGHT`. Backup,
independent restore and promotion were skipped.

[Owner-approved read-only diagnostic 43405827600](https://github.com/catillatio/test/actions/runs/43405827600)
queried the production target once and identified the first rejected assertion:

| Field | Expected by released controller | Authenticated actual |
| --- | --- | --- |
| `latest.instances.status` | `ALL_EXITED` | `[REMOVED]` |
| `latest.status` | Terminal attempt | `FAILED` |
| `latest.deploymentStopped` | Boolean | `true` |
| `active.status` | `SUCCESS` | `SUCCESS` |
| `active.instances.status` | One running, removed history permitted | `[REMOVED, RUNNING]` |
| `inFlight.count` | `0` | `0` |
| `pending.patch.onlyEmptyContainers` | `true` | `true` |

The newer failed pre-deploy attempt is separate from the authoritative healthy
active deployment. Its retained removed instance failed the controller's
EXITED-only historical-instance assertion. Seventy preceding diagnostic
assertions passed. The sanitized fixture contains no credentials, variable
values, provider bodies or deployment/instance identifiers.

## Narrow correction

The controller continues accepting `EXITED` historical instances. It additionally
accepts `REMOVED` only for an explicitly stopped `FAILED` latest attempt.
Every live, uncertain or unrecognized instance state still rejects. The sole
active deployment, one running instance, identity, health, source, no-concurrency
and empty-staging checks remain intact. Raw instance statuses, identifiers and
the stopped flag remain bound into the exact snapshot; they are not normalized.

The diagnostic separately forced `registrySetup: install-read-only`. That mode
requires a GitHub source with no image and is inappropriate for the current
preconfigured pinned-image release. The inspection now uses `preconfigured`,
matching release with credential installation OFF. The shared source checks
still validate either the initial GitHub handoff or the already pinned private
image; installation mode's own restrictions are unchanged. This mode mismatch
was after the failed instance assertion and did not cause the observed first
rejection.

## Verification and release boundary

The captured shape reproduces the original operational failure. Local tests
exercise corrected diagnostic and operational preflight, complete synthetic
promotion, HTTP provider/controller integration with signed proof and a
continuously running synthetic game, missing stopped evidence, other terminal
deployment statuses, live/unknown instance states, and raw snapshot drift before
and after commit. Existing receipt, credential, concurrency and lost-response
tests remain required.

No protected release has been retried. The existing production deployment
`8084fa33-e185-46ae-a553-cd5b475b77b9` remained successful and `/healthz` returned
HTTP 200 / ready at source `98756a0449b2b260c62c26d52491a23954f82788` after the
diagnostic. No Railway configuration, database or backup was changed here.

Before another release, review and authorize this correction, pass required
exact-head CI and production push checks, and confirm MATCH in the corrected
protected target diagnostic. That remains a fresh provider check, not a claim
that a synthetic fixture authorizes release. Any subsequent NPC sponsorship
activation requires its separately authorized protected prepare/release sequence
with fresh recovery evidence. Achievement payouts, NPC combat, rare drops and
other features are outside this correction and are not activated.
