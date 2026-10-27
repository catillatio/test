# Source-upload reliability investigation

This change adds bounded, secret-safe upload diagnostics and a protected,
default-disabled immutable-image transport. The isolated private-image canary
succeeded and was removed. No game image was published and no production
configuration, recovery or deployment was changed during this work.

## Established facts

- Protected release [71](https://github.com/catillatio/test/actions/runs/40562249523)
  failed at GAME_UPLOAD / SNAPSHOT_CODE before a build or runtime process existed.
  Railway reported no snapshot identity or additional diagnosis.
- Release [70](https://github.com/catillatio/test/actions/runs/40556813339)
  succeeded. The three changed CI files in 71 are excluded from the game upload.
- The checksum-verified Railway 5.70.0 binary recreated both game uploads as
  byte-identical gzip archives: 474 files, **13,601,887 compressed bytes**,
  15,720,040 file bytes. The successful worker fixture is 13,588,783 compressed
  bytes. Every selected file matched Git; there were no traversal paths,
  symlinks, duplicate entries or missing Docker COPY inputs.
- The CLI uses one authenticated application/gzip POST. Game packaging preserves
  `knights-reforged/` for the configured service root; worker packaging deliberately
  uses its standalone root. Both use the same authenticated HTTP client.
- Whole promotion in 71 took approximately 25.8 seconds, below the CLI's default
  90-second HTTP timeout and the controller's 120-second ceiling. This does not
  establish a timeout as the cause.

These are recreations, not the original 71 request capture. The original HTTP
status/body/archive were not retained. A provider-side snapshot-ingestion failure
is consistent with the evidence; its exact internal cause remains unknown.
Neither a reproducible archive defect nor a credential-scope defect was found.

## What changes

`deployment/release/upload.mjs` wraps only the existing `railway up` calls. It
enables the pinned CLI's `--verbose` preamble, privately verifies its service and
environment, and strips it before the unchanged independent deployment-identity
verification. All signing, encrypted recovery, schema, preservation, staging,
health, owner authorization and production mutex checks remain in place.

`RELEASE_UPLOAD` emits two allowlisted JSON events per attempted upload:

| Field | Meaning |
| --- | --- |
| component | GAME or WORKER |
| event / category | Fixed completion/failure names; no exception strings |
| elapsed_ms | Controller-observed child-process duration |
| pre_upload_ms | Time to observe the complete archive-size preamble, including CLI discovery and packaging; not compression alone |
| transfer_wait_ms | Remaining elapsed time, including HTTP/server wait; not network transmission alone |
| upload_bytes | CLI-reported compressed archive size; null if not observed |
| controller_timed_out | The controller's own timer fired |
| cli_timeout_hint | A recognized timeout phrase in a known CLI error; not authoritative |
| http_status_hint / http_status_evidence | Recognized 413/HTTP error text, always UNVERIFIED_CLI_TEXT, or null/UNAVAILABLE |
| exit_code / signal / termination_observed | Bounded exit metadata; an unacknowledged hard termination never succeeds |
| cli_code | A fixed recognized code or UNKNOWN |

CLI 5.70.0 prints only the provider message for HTTP 400, but includes status text
for other HTTP failures. A 400 message can imitate that text. Consequently the
status is a **hint**, never an authenticated status or permission to retry.
Successful CLI completion likewise does not prove snapshot creation or deployment
success: the existing authenticated exact-deployment check and subsequent health
verification still decide that.

Raw stdout/stderr, URLs, service/environment identifiers, exception objects,
tokens, request bodies, archives and provider responses are never emitted or
persisted by this wrapper. Output is bounded to 2 MB combined; stderr is discarded.
The original 120-second controller ceiling and 90-second CLI default remain.
Timeout/overflow sends TERM, then bounded KILL; an unknown termination is reported
as unknown. There is **one upload attempt**, no automatic retry or latest-deployment
fallback. A failed or uncertain upload requires read-only state reconciliation.

## Tested behavior

- Unit and existing controller-failure tests exercise malformed output,
  authentication, timeout, overflow, child errors, substituted identities,
  status spoofing and the unchanged release failure boundaries.
- An isolated TLS server and the actual pinned CLI exercised game/worker success,
  HTTP 400, 503, 413 and a real CLI HTTP timeout. Synthetic credentials only;
  Docker internal network, verified fixture CA, no provider network route.
  The binary uses generic `ERROR` for a propagated reqwest timeout; the diagnostic
  reports CLI_FAILURE plus a timeout hint rather than inventing a transport cause.
- CI's existing actual game Docker build now runs
  `scripts/test-release-image-preflight.mjs`: non-root amd64, expected entrypoint,
  candidate contents matching the locked host compiler, and unsigned production
  migration rejected **before database access**. Network is disabled for these
  probes. Evidence is retained with the existing recovery-verification artifact.

See [verification.json](verification.json) for sanitized fixture evidence and
[IMAGE_TRANSPORT_DESIGN.md](IMAGE_TRANSPORT_DESIGN.md) for the no-support alternative.

## Exclusions and transport decision

Keep the current root allowlist and monorepo prefix. It already excludes the
large research corpus, source references, screenshots, recovery artifacts,
credentials and local dependencies. The worker succeeds with nearly the same
payload size. Removing required art or flattening the game root is unjustified.
`.dockerignore` runs after source ingestion and cannot fix SNAPSHOT_CODE.

Do not increase timeouts without timeout evidence, switch to an unpinned CLI,
replace authenticated transport with curl, change builders on ambiguous metadata,
or retry promotion with stale proofs. None is an established correction here.

No additional production rehearsal is needed to validate these diagnostics.
The independently actionable alternative is now implemented behind explicit
owner-controlled flags, using the completed private registry/digest-pull canary.
See [transport design and evidence](IMAGE_TRANSPORT_DESIGN.md) and the
[dashboard-only owner procedure](IMAGE_OPERATIONS.md). Registry and target checks
precede recovery; the existing encrypted recovery, exact identity, signature,
health and owner-approval gates remain mandatory. Review/merge, private game-package
setup, publication and production activation remain separate owner actions.
