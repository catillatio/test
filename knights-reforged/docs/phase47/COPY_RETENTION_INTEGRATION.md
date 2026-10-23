# Minimum integration proposal — not implemented or activated

Review of PR #25 at `99d2eaa` confirms that it cannot yet prevent indefinite
accumulation: nothing calls registration automatically, and no execution channel
or schedule is installed. Registration and reporting alone also do not reclaim
space. A recurring **authorized cleanup** is necessary. The existing release
controller, worker, workflow, signing, recovery and migration gates remain unchanged
in this revision. This document proposes their smallest next integration patch;
it is not permission to install, schedule or execute it.

## 1. Automatic provenance registration — non-destructive

Reuse the existing verification worker, its validated independent-cluster
connection, and its already-held advisory lock. After all mandatory backup,
restore, migration/replay, preservation and report validation have passed, and
successful report upload is confirmed, append one verified-copy observation.

The observation must bind job/run/attempt, exact candidate and worker deployment,
project/environment/services, actual cluster identity, actual database name/OID,
observed creator owner, the cleaned public manifest/report hash, and **server-side**
first-observed/verified timestamps. Never store temporary grant URLs or secrets.
Use a registration-only append function/role; no schema ownership, permit issuance,
pinning/unpinning, DROP or production access. No tables are installed at startup.

Do **not** automatically transfer every new database to `kc_release_copy_owner`.
That would give the cleanup credential native ownership of fresh, pending and
current recovery databases. The current `copies.owner_name` assumes prior cleanup
adoption, so this needs a small explicit schema change: separate observed creator
ownership from required cleanup ownership/adoption (or append observations to a
separate table). Unadopted copies remain protected. Observations are provenance,
not deletion eligibility or a claim that the GitHub release is terminal.

Make registration opt-in after separately reviewed bootstrap and identity setup.
Add only its explicit helper paths to the worker bundle/image allowlists. Keep
all existing mandatory assertions and reports intact. A bounded metadata-only
failure must leave the copy protected, emit a fixed failure category and raise
an operational alert; it must never turn a failed backup/restore into success.
The independently retained public manifest is the replay/outbox source for an
idempotent registration retry, without creating another restore. Catch only this
optional registration boundary; never widen an existing release catch.

This removes routine manual manifest import for **future** verified copies. It
does not authorize inferred/backdated adoption of legacy or failed copies.

## 2. Scheduling — inventory/report only

First run manually; later schedule a bounded, separate private inventory/report
job using a **read-only observer credential**, without cleanup ownership, permit
INSERT or the retention private key. Reuse registered observations and exact
GitHub run/attempt terminal-state reads. Unknown/pending states remain protected.
Collect fresh active/staged recovery references and durable pins through a reviewed,
authenticated read path. If that cannot establish references, report a blocker.

Keep this outside mandatory release gates. A missed report or registration alert
must not silently fail open or certify a release. Report database/WAL/volume
measurements with their existing uncertainty; alert on copy counts, unregistered
copies and 70/85/95% volume usage. Define an owner cleanup cadence before enabling
registration: automatic registration plus an unattended report alone will still
allow storage to grow forever.

Do not reserve the production concurrency group indefinitely while a scheduled
job awaits owner approval. The admission/approval/execution ordering and bounded
timeouts need a concrete test before scheduling is enabled. Do not reuse the
DROP-capable runtime credential merely because the command is called dry-run.

## 3. Cleanup authorization and exclusive coordination — separately reviewed

Initially retain manual, exact-batch owner approval. After reviewing the plan and
fresh references, the owner signs it. A separate limited authorizer validates that
signature and registers immutable permits with their exact target plans; it has no database ownership.
Only a separately isolated cleanup execution receives the DROP-capable credential.
Obsolete-copy ownership adoption, where necessary, is a distinct privileged,
audited action bound to the same reviewed OIDs. Never mass-transfer current,
pending, pinned or unknown copies to the cleanup role.

Before any unattended destructive execution, implement and review all of:

* Exclusive coordination across the **whole** protected release (prepare through
  promotion/post-verification), retention staging/execution, and every manual
  restore entry point. The worker's database-local lock alone does not cover the
  controller between jobs. Share `kingdom-come-production`, disable cancellation,
  and test admission order, pending releases, failed jobs and runner interruption.
* Fresh authenticated active/staged recovery references, pins and exact terminal
  run/attempt identities. Unavailable evidence means no deletion. Retain the
  existing conservative protection of all copies for the active game commit.
* A private execution transport with exact Railway service/cluster identity,
  no accidental service restart/autodeploy, no game startup/migration command,
  no public endpoint/database, and real credential separation between observer,
  authorizer and cleanup. Do not place the authorizer credential on the cleanup
  service and merely hide it from a child process.
* No restore/deletion concurrency, connection termination, FORCE, artifact/archive
  deletion, automatic unpin or signature/proof substitution. Bound retries and
  preserve the journal for interrupted operations.

The private executor can reuse existing verification infrastructure **only if**
its entire staging/execution lifecycle is exclusive and its configuration and
credential boundaries can be verified. Otherwise keep manual operation through
an already trusted private channel. This proposal creates no new service, broad
API token, administration system or production workflow.

## Decision before owner approval

The current PR is a default-off tooling/security foundation, **not a completed
automatic storage-control rollout**. Recommended next approval is the narrow
non-destructive registration integration above, with a reviewed schema/adoption
contract and focused worker/backup regressions. Reporting and destructive execution
must have separate review/enablement. Unattended cleanup remains blocked until
exclusive coordination and private execution are implemented and independently
validated. Native database-owner bypass remains a separate risk requiring owner
acceptance or a future ownership/broker redesign; see `COPY_RETENTION.md`.
