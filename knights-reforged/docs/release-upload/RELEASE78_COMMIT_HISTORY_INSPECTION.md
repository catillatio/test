# Release 40638383544: protected read-only commit history

The owner calls this incident release #78. Its authoritative GitHub run is
[40638383544](https://github.com/catillatio/test/actions/runs/40638383544),
job `122650716187`, source commit
`ec3e24d7cd1d0df4ec46f3279189d81cd23fa4fc`.

The owner observed a matching Railway Activity entry with the exact protected
commit message and ten applied changes. Independent prior reads found applied
registry-credential fields and image-variable names, but GitHub remained the
reported source and no new deployment existed. Read-only diagnostic
[40640979031](https://github.com/catillatio/test/actions/runs/40640979031)
confirmed the controller's service-instance view also had a null image source.
No later reversal was visible in the Activity entries inspected by the owner;
that absence is not proof that no rollback occurred.

This mode retrieves the missing stored commit record. It changes no release
validation, image postcondition, recovery, database, credentials or Railway state.
It does not execute during CI or automatically after a merge.

## Exact scope

`inspect-image-commit-history.mjs` binds the expected project/environment/game,
exact commit message, intended immutable image and observed failure window in
`release78HistoryContext`. There is no arbitrary receipt, query, URL or source
commit input. It rejects an unmerged branch, a nonmanual event, another job,
rerun attempts, another target, a conflicting API token and disabled TLS.

Only three allowlisted GraphQL **queries** are permitted. The existing
`railwayClient` keeps its fixed HTTPS endpoint, project-token authentication,
redirect rejection, 15-second request deadline and bounded responses.

1. Search metadata only, at most eight pages of 25 records. Require a unique
   exact commit message in the observed operation window, allowing the existing
   60-second clock tolerance. Creation time is not used to identify the attempt:
   an old empty staging record may be reused. No provider sort order is assumed.
   Missing, duplicate, malformed, incomplete or over-limit history fails closed.
2. Independently retrieve the selected `environmentPatch` by its server-issued
   ID. Bind its metadata back to the history entry and inspect `status`,
   `appliedAt`, `lastAppliedError` and the game service's source fragment.
3. Read both current source views: `serviceInstance.source` and the game source
   in `environment.config`. They are classified separately so a disagreement is
   visible instead of being normalized away. Empty versus nonempty pending
   changes are reported without modifying either.
4. Inspect at most eight later records for game-source changes. Variable-only
   records are not reported as source reversals; staged edits are distinguished
   from committed records. Exceeding this secondary limit is explicitly LIMITED.
5. Re-read the exact receipt and current source. A changed record or source
   yields UNVERIFIED. Read failures are not retried. At most 18 reads are possible.

The source-fragment JSON fields necessarily return other private configuration
data as part of their scalar. `decryptVariables:false` is requested, but is
**not** treated as a guarantee of encryption or redaction. Provider bodies,
variable values, registry credentials, messages, IDs and timestamps remain only
in memory. They are never printed, hashed into an approval, written to a file,
placed in a step summary or uploaded as artifacts. No rendered database-variable
query, registry token, signing key or database credential is needed.

## Sanitized result and limits

Output is one `IMAGE_COMMIT_HISTORY_INSPECTION` report. It includes only closed
categories: exact-record binding, receipt status, applied-time presence/timing,
error presence/classification, recorded/current image and repository classes,
pending-change class and any observed later source changes.

`lastAppliedError.presence` distinguishes literal null, empty string and present
text. `code` prints only a small known JSON error-code allowlist. `mentions`
contains fixed vocabulary matches such as IMAGE_SOURCE or AUTHORIZATION, never
provider text or fragments. These are observations of error text, not an inferred
root cause. Unknown errors remain PRESENT/UNCLASSIFIED; they are never silently
treated as success.

The expected image is reported as EXACT_PIN; other image values are not printed.
Applied timestamps are checked privately and reported relative to the observed
failure, including whether application occurred after the job had failed.

`INSPECTED` means the read completed with a stable exact record. It does **not**
mean the commit succeeded, the image persisted or deployment is authorized.
Every result has `authorizesRelease:false`. A committed receipt with an error,
a source mismatch or null applied timestamp remains visible. No automatic
rollback conclusion is drawn from missing later records. Completed pagination
describes the retrieved history, not an atomic audit snapshot or proof that no
unlogged/internal reversal occurred. The original failing assertion was not
retained by the release job and is not invented by this reader.

## Owner instructions: dashboard only

1. Review the focused draft PR and its CI. Merge only after separate explicit
   owner approval. Keep the production environment restricted to
   `release/production`; do not execute this mode from the development branch.
2. After that approved merge and green exact production CI, open GitHub Actions
   → **Railway authorization diagnostic** → **Run workflow**.
3. Select branch `release/production`. Enable **image_commit_history_inspection**.
   Leave **image_target_inspection** and **image_handoff_inspection** OFF.
   Selecting multiple modes fails without querying Railway.
4. Approve the existing production environment gate for this new diagnostic run.
   It uses the existing `RAILWAY_TOKEN`, exact checkout and production mutex;
   no credential setup or Windows/local software is required.
5. Return only the single sanitized `IMAGE_COMMIT_HISTORY_INSPECTION` line.
   Do not rerun the failed image release, click Railway Deploy, restage or discard
   configuration, renew evidence or initiate recovery based on this result.

Production execution and the actual history result remain pending owner approval.
Local tests use synthetic provider fixtures only. The production release workflow,
pinned-image postcondition and all production/recovery safeguards are unchanged.
