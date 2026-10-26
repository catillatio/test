# Recovery-copy retention — owner review

**Phase 2:** PR #25 is merged at `9ae9a15`; its post-merge CI passed.
The [registration implementation and enablement review](registration-phase2/README.md)
records the exact live/source divergence, restricted read-only preflight,
unchanged installed SQL and first-observation acceptance plan. This earlier
retention assessment remains reference material; no registration or retirement
enablement is authorized by the merge or catalog validation.

**Current status: empty catalogs INSTALLED and READ-ONLY VALIDATED by the owner.**
Both SQL hashes/install postchecks passed. The subsequent owner summary confirms
matching target/cluster, definitions, roles, explicit grants and effective
permissions; five empty tables, 23 protected copies, unchanged scoped ownership
and both emergency OIDs. [Installation evidence](OWNER_INSTALLATION_RESULT.json)
and [validation evidence](OWNER_CATALOG_VALIDATION_RESULT.json) are separately
attributed, point-in-time owner reports, not SQL executed by Codex.
**Do not repeat installation or this completed validation.**
[The next non-destructive registration readiness plan](POST_INSTALL_VALIDATION_AND_REGISTRATION.md)
is prepared; code delivery, registrar credentials/scope and enablement still need
separate owner approval. No registration, adoption, retirement or scheduling is
active. The official integration has no private SQL/Console execution tool.

This revision resumes PR #25 from `cf22204`, integrating the current protected
production baseline (`d48ab91`, schema 026 and exact 450/900 population evidence).
No gameplay changes, production SQL, deletion, installation, workflow dispatch,
volume/configuration/credential change, PR merge or deployment was performed by
Codex. The separate owner-executed metadata installation is recorded above.

## Implemented and inactive

- Optional verified-copy registration remains **OFF** unless separately enabled.
  It observes actual OID/cluster/owner/run/attempt/deployment after successful
  independent restore and report upload. It does not adopt ownership. The current
  900-bot report must match the installed immutable population definition, including
  identical restored population evidence. Only constrained scalars and a sanitized
  population evidence digest enter registration; no URLs/secrets/raw reports.
- Read-only inventory enumerates actual names, OIDs, owners, sizes and connections;
  joins installed adopted/observed provenance; optionally measures WAL with existing
  permission. Missing catalog means protected uncertainty, not invented eligibility.
- Planner retains current/active-SHA, pending, durable/owner-pinned, unclosed,
  connected, unknown/mismatched and observed-only copies. At least **two newest
  present verified copies and 24 hours since first server observation** remain.
- Emergency OIDs **106971 and 129180** are unconditional exclusions in planning,
  privileged provenance import, cleanup and the installed SQL event guard. This
  revision has **no override**. Future replacement needs separate reviewed code,
  exact identity evidence and explicit owner authorization.
- Exact short-lived Ed25519 batch authorization, separate non-destructive permit
  registration, runtime guard-definition/ownership/grant checks and durable intent
  before non-FORCE DROP remain mandatory. SQL also independently checks age,
  newest-copy minimum and closed/active references before accepting an intent.
- Cleanup binds the signed plan/state to an exact repository/workflow/run/attempt/
  job/head SHA. Fixed read-only GitHub APIs verify that job is running and its
  owner gate succeeded; local GitHub context must agree. This supplements the
  original-release completion/health checks. A signed lock Boolean alone fails.
- The **inactive** [workflow template](../../deployment/release/retention/workflow.yml)
  places owner approval **before** the execution job acquires the existing
  `kingdom-come-production` concurrency group. The production release already holds
  that same repository group for safety, prepare, restore, artifacts, promotion
  and post-deployment verification. No change to that workflow is required.
- A bounded private handoff (180 seconds, within a five-minute job) allows fresh
  inventory/signature/permit preparation after the execution mutex is held. A
  separate authorizer publishes `ready.json` last; it contains SHA-256 of the four
  exact private input files. Expiry/queue delays fail; no automatic re-signing.
- Durable pin/unpin INSERTs also require that same exclusive session lock in
  an installed trigger, eliminating the intent-to-DROP pin race. A concurrent
  pin fails instead of silently committing behind the running retirement.
- The PostgreSQL session lock `61824087` in the **same maintenance database** is
  held throughout execution. Cooperating manual restores must acquire it too.
  No FORCE, connection termination, database connection disabling, filesystem
  deletion, backup-object deletion or automatic unpinning is implemented.
- `cli.mjs reconcile` handles interrupted jobs without issuing DROP: original
  permit/signature is independently validated, only an existing durable intent's
  actual name **and** OID absence can append `absent`, with zero reclaimed bytes.
  Present identities require a fresh approved plan; reused/renamed identities fail.
  It may reconcile an expired original authorization but can never renew it or
  start/resume a deletion. Current owner-approved job coordination is still needed.

## Actual inventory: owner-observed; retirement BLOCKED

The owner ran read-only SQL in the production KingdomReleaseCopy Console and
reported the following on 2026-10-26. These are owner-observed results; Codex did
not execute new production SQL. The exact inspection timestamp/full private
identity listing was not supplied here.

| Finding | Owner-observed result |
| --- | --- |
| Total / recovery-copy databases | 27 / 23 |
| Owners | All displayed as `postgres` |
| Recovery-copy connections | All 23 had zero at inspection time |
| Recovery-copy total / largest / smallest | Approximately 6.3 GB / 495 MB / approximately 8 MB |
| Emergency OID 129180 | Exists; approximately 304 MB; protected |
| Emergency OID 106971 | Exists; approximately 235 MB; protected |
| Advertised volume capacity | 20 GB |
| Exact inspected maintenance DB / user / version | `Railway` (capital R) / `postgres` / PostgreSQL 18.6 |
| Retention schemas / five expected roles | Installed and definition/permission-validated by owner; no activation |
| Worker maintenance name | Owner confirmed existing worker restore URL names `Railway` exactly |
| Cluster digest | Owner Console comparison matches the retained restore-cluster evidence |
| Owner summary comparison | 17 live names match retained prepares; six remain unmatched; 18 historical names not currently matched |
| Current reference / emergency OIDs | Current reference and both emergency OIDs are present in owner summary |
| WAL usage | 960 MB (owner-observed; included in filesystem usage) |
| Data directory | `/var/lib/postgresql/18/docker` |
| Filesystem / mount | `/dev/zd28000` at `/var/lib/postgresql`; data and WAL share it |
| Filesystem snapshot | 18 GiB size; 7.1 GiB used; 11 GiB available; 41% usage (reported rounded values) |
| `release_retention.copies` | Owner-validated installed and empty; previously NULL |
| `release_observations.verified_copies` | Owner-validated installed and empty; previously NULL |

**No copy is currently eligible under PR #25. All 23 remain protected.** There is
no adopted provenance in the installed empty catalog, and no existing copy
is owned by the restricted cleanup owner. Zero connections, a matching name or a
small database is not successful verification, lifecycle closure or retirement
permission. The four remaining databases are also preserved; their identities
and roles must not be guessed. The two emergency copies are already included in
the 6.3 GB aggregate, not additional storage.

The earlier 5 GB / 2.33 GB figures are superseded historical observations. The
6.3 GB logical recovery-database total is neither reclaimable storage nor a basis
to calculate free space as 20 minus 6.3 GB. Original-OID provenance for legacy copies, six unmatched names and
external/pending/rollback holds remain unresolved. WAL and filesystem space are
owner-observed: 960 MB WAL and
11 GiB available on the shared data/WAL mount. Do not add WAL to the 7.1 GiB used
or subtract it again from available bytes. Advertised GB and reported GiB are
different units; preserve the rounded observations without inventing exact
byte accounting. This snapshot does not certify headroom for every future restore.

[The retained-evidence reconciliation](PROVENANCE_RECONCILIATION.md) verifies 35
historical prepare manifests and archive digests across 51 protected runs. The
latest retained post-deployment receipt matches the active game and latest worker
verification deployments. No historical report captured a database OID or worker
maintenance name. The owner has now supplied a privacy-safe live-name comparison;
historical OIDs and the six unmatched names remain unresolved.

The owner has confirmed both the exact worker maintenance name **`Railway`**
and the private cluster-digest equality. The summary-only Console result at
**26 October 2026, 03:12:51 EDT** associates **17** live names with the verified
prepare evidence, leaves **six** live names unmatched, and finds **18** historical
names not currently matched. These are not proofs of deletion, rename/reuse
absence or unchanged original OIDs. All owners remain `postgres`.

[The completed comparison handoff](PRIVATE_COMPARISON_HANDOFF.md) and
[sanitized owner result](OWNER_COMPARISON_RESULT.json) preserve the evidence.
The current release reference is present. The two most recent verified prepares
among the matched evidence are runs **40270052123/1** and **40261837458/1**; keep
both. The emergency OIDs remain unconditional exclusions, potentially overlapping
these groups. The other 15 matched names and all six unknown names also remain
protected: there is no adopted catalog provenance, reviewed legacy-OID binding,
restricted-copy ownership or signed retirement approval.

**The owner reports completed metadata installation; no reinstall is authorized.**
An empty catalog does not adopt the six unknown copies. Their unknown provenance does not
justify deleting them or blocking unrelated safe development. External holds and
legacy identity review remain additional gates before any adoption/retirement.
Do not repeat completed schema/role/capacity/cluster reads solely for this report.

[The owner-inventory follow-up](OWNER_INVENTORY_FOLLOWUP.md) preserves the
historical read-only checks and archived installation procedure.
All 23 current copies, both emergency OIDs, current/pending/pinned/unknown and
rollback references remain protected. No repeated installation, ownership change,
credential setup, retirement enablement or deployment is authorized.

## Dry-run evidence

[Reproducible synthetic report](SYNTHETIC_DRY_RUN.json) is explicitly **not a
production plan or authorization**. Regenerate with:

```sh
node scripts/retention-dry-run.mjs
```

Eight synthetic copies illustrate one eligible older verified copy (1 MiB) and
seven retained: emergency OID, pending, pinned, unknown, recent observation and
two newest/current references. Actual PostgreSQL tests additionally measure real
disposable database sizes/OIDs, validate both catalog-installed and no-catalog
inventory, and prove that inventory creates no audit events/deletion permission.
No live reclaimable-space estimate is reported without live evidence.

## Minimum production setup, in order — NOT authorized here

1. Preserve the owner-observed Console inventory above, complete only the missing
   [read-only checks](OWNER_INVENTORY_FOLLOWUP.md), and reconcile **each exact OID**
   with retained release manifests/run attempts/deployments and independently
   retained encrypted recovery evidence. Verify current **active and staged**
   deployment recovery references and pending/manual recovery work. Pin ambiguous
   copies. Independently verify current capacity/free space for the next restore.
2. Review the finalized code/CI. Owner approval to merge is separate. A separately
   approved normal protected release may deploy only the non-destructive optional
   registration helpers; registration remains OFF. Never dispatch a release for
   cleanup or repurpose the verification worker for arbitrary SQL.
3. **Owner reports both metadata installations complete. Do not rerun them.**
   They are not game migrations and do not alter schema 026. The exact
   definitions/effective permissions are now owner-validated with the prepared
   read-only packet. Do not rerun that completed assessment. Future drift needs
   separate review, never automatic guard overwrites,
   grant repairs or bootstrap replay. SQL and JavaScript must match exactly.
4. Separately supply registrar, runtime and authorizer credentials to their
   respective isolated execution boundaries. Bootstrap/catalog ownership remains
   privileged and withheld from all three. No release private key, archive key,
   production DB URL or Railway API token belongs on the retention executor.
   Review effective grants, installed guards and runtime native-ownership risk.
5. Review **non-destructive ownership adoption**, individually by exact OID, with
   full provenance and operator audit. Never bulk-transfer names. Emergency,
   active, pending, unknown and pinned copies must not be transferred. A transfer
   and provenance import must finish before the executor is permitted to run;
   runtime refuses any owned database missing an exact catalog identity. Start
   the 24-hour observation hold at import, never backdate it. Observation alone
   continues to protect all newly created copies. Automated ownership adoption
   is deliberately not enabled or inferred from registration.
6. If later approving private job execution, provide a dedicated **ephemeral**
   private-network runner in the reviewed operator Railway service; verify its
   platform service/project/environment IDs against scope. Its GitHub runner group
   must allow **only** the reviewed retention workflow at the protected production
   ref, never PRs/arbitrary workflows. Use short-lived runner registration and
   repository token. Keep bootstrap, authorizer and signing secrets outside that
   runner. A private broker stages immutable input files without sharing those
   credentials. No such runner/service is provisioned by this PR; absent this
   trusted channel, destructive execution stays blocked.
7. Separately approve copying the template to its exact expected workflow path,
   `.github/workflows/recovery-copy-retention.yml`. Review the existing protected
   production environment owner reviewers/prevent-self-review and branch policy,
   runner-group restrictions and shared mutex. Test against disposable PostgreSQL
   first. There is no schedule and default runtime enablement remains OFF.
8. Enable optional observation separately, then review a first **private dry run**.
   Confirm emergency protection and retained/current/pending references. Arrange
   all prerequisites before an exact cleanup authorization; retain offline owner
   signing-key separation. No standing/unattended deletion approval is introduced.
9. For an explicitly approved manual job, first verify there are no queued/pending
    releases or recoveries, then dispatch only that reviewed workflow,
   approve its owner gate, then while its execution job holds the shared mutex:
   prepare fresh state/plan, sign exact targets, install the permit through the
   isolated authorizer, privately stage mode-0600 files and publish the raw-file
   SHA-256 `ready.json` last (`permit.mjs --ready-out /private/ready.json`
    creates this only after permit COMMIT; its four input files must match the
    private spool bytes). State has a maximum five-minute age; signature four
   minutes. Bounded private handoff/queue expiry requires a new reviewed state/
   plan/signature, **never** extended evidence. No secrets/plans in GitHub inputs,
   logs, chat or artifacts. The sole dispatch input is a request UUID.
10. Verify private durable audit, surviving two newest/current/emergency copies,
    independent recovery and measured storage after the first separately approved
    execution. Decide future monitoring/cadence and automatic adoption/authorization
    policy separately; **no unattended schedule or deletion is approved/installed**.

This ordering is an installation/execution guide, not a request to perform it now.
Steps 1, 3–10 require separate production-access/installation/action authorization.

## Recovery, concurrency and privilege limits

A DROP is not transactional with its durable audit; it is irreversible. Retained
encrypted archives are never deleted. If a retired old copy is needed, restore its
verified archive to a **new**, separately authorized database; do not guess a
replacement OID or edit old signed evidence. Unexpected identity, signature,
installed-guard, permission, API or connection states stop the batch.

A failed attempt may have deleted a prefix of its signed batch. Read the journal
before retrying. Within the same original execution/validity window, identical
retries are idempotent; terminal refusals require a new approval. After a crash
and expiry, a separately owner-approved coordinated job may run:

```sh
node deployment/release/retention/cli.mjs reconcile \
  --scope scope.json --state fresh-state.json \
  --prior-approval '<original approval UUID>' --out reconciliation.json
```

The original signed plan/permit is fetched from immutable catalog history, not
re-signed, renewed or modified. Present copies remain intact. A new destructive
attempt always requires fresh eligibility, exact signed authorization and permit.

GitHub API observations do not themselves create a mutex. Exclusivity rests on
the reviewed immutable workflow definition plus GitHub's shared repository group,
verified exact current job, and the live PostgreSQL session lock. The runtime also
checks originating release completion and no queued/running/waiting releases;
this is conservative and may abort cleanup rather than delay a release. GitHub's
concurrency facility is not a durable FIFO queue: newer pending work can replace
older pending work. Quiescence must be checked before manual dispatch as well as
during execution. Do not add scheduled/unattended dispatch without separately
reviewing queue admission and cancellation behavior. Manual
restore tools/operators must use the same maintenance-database lock for their
**whole** operation. Superusers that ignore this contract cannot be constrained
by advisory locks. Cancelling a job must terminate its private executor and close
its PostgreSQL session; do not forcibly release locks or assume GitHub cancellation
proves a private process exited. The worker's lock refuses a still-running cleanup.

PostgreSQL has no DROP-only permission. `kc_retention_runtime` inherits native
ownership **only of explicitly adopted copies**, not catalog objects or source
production. It can bypass an application wrapper for databases it owns. Emergency
OIDs must never be assigned to that role; the runtime refuses any such privilege
and any owned unknown/reused identity. SQL guards and the reviewed executor protect
normal execution, but cannot make a compromised native database owner obey the
wrapper. Owner acceptance of that residual authority is required before setup;
otherwise hold execution for a separately reviewed constrained broker. Do not
claim least privilege means protection against PostgreSQL superusers/native owners.

The audit is append-only against runtime/authorizer/registrar, with server times,
actors, exact permit/target and measured intent size. It observes database state,
not incontrovertible DROP causality or physical volume reclamation. Privileged
catalog owners/superusers remain able to alter it. Independent review of retained
signed envelopes and external owner/operator evidence remains necessary.

## Verification checkpoint

Focused tests cover exact identities, actual PostgreSQL read-only inventory,
unknown observations, emergency OIDs, freshest two and age guard, mutex/job/owner
proofs, cancellation/malformed/denied APIs, permission loss/guard replacement,
concurrent permit and registration retries, rollback, connection races,
interrupted outcome recovery, name reuse and populated 900-bot plus human record
preservation. Final exact-head CI also includes existing browser, schema-026,
900-bot preservation, encrypted backup/isolated restoration and container checks.
The final PR body links the exact candidate CI and reports its actual outcome.
