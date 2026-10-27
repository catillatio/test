> **Delivery update:** the verified engine/policy below is preserved. The old
> runner-group and manual-spool delivery instructions are superseded by
> [EXECUTION_DELIVERY.md](EXECUTION_DELIVERY.md), including the GitHub-hosted
> coordinator, separate authorizer identity, protected signer and dashboard setup.
> No production setup or deletion has been performed by the delivery change.

# Recovery storage lifecycle completion

This implementation completes the controlled **future-copy** path. It does not
activate retirement or make the 23 legacy copies eligible. Production execution
remains blocked on a reviewed private execution/signing boundary, explicitly
approved exact-copy adoption, and an owner-approved signed retirement batch.
No command in this guide belongs on the owner's Windows PC. Commands are for
future approved cloud operator jobs/Consoles only; GitHub/Railway dashboards are
the owner's controls. Do not install software or request local credentials.

## Established evidence and limits

- Owner-confirmed protected [release 62](https://github.com/catillatio/test/actions/runs/40439630950),
  attempt 1, commit `e9165c34ef8ddaba4e04488438ba110cc2020376`, promotion OFF.
  The matching worker logged `COPY_REGISTRATION: PASS`; the owner found one
  observation and confirmed exact manifest binding, live identity, server receipt
  and both emergency OIDs. These are completed owner-observed acceptance facts,
  not a new production query or another requested rehearsal.
- The retained artifact/archive digest and ciphertext hash/size were independently
  checked during that investigation. No private manifest, name, OID, URL, cluster
  digest or credential is published here. The observation alone adopts nothing.
- Historical tuple preservation across registration remains **UNVERIFIED**. No
  real pre-run tuple baseline was retained. A future retirement baseline has a
  different purpose and cannot retroactively certify that earlier operation.
- The prior 23-copy / approximately 6.3 GB inventory and 960 MB WAL / 11 GiB free
  filesystem snapshot are historical observations. Do not treat them as today's
  inventory/capacity or calculate free space by subtracting database totals.
- Read-only service discovery found only game, production PostgreSQL, recovery
  PostgreSQL and verification worker services. **No retention operator service is
  installed.** The existing official integration exposes no private SQL execution.
  Do not repurpose any of those four services as a privileged retirement runner.

## Completed code path

| Stage | Implementation and authority |
| --- | --- |
| Observation | Existing restricted registrar, after successful independent recovery/report upload; unchanged. |
| Inventory | Existing read-only `inventory.mjs`; real database identity, owner, size, connections and adopted/observed provenance. No eligibility from a name or zero connections. |
| Adoption | Hardened `register.mjs` / `adoption.mjs`: explicitly reviewed original file hash, captured original OID, exact durable registrar observation, current cluster/maintenance DB, closed job and current/pending/pinned protections. Ownership transfer and provenance INSERT are one transaction under the existing release lock. |
| Holding | New catalog `first_observed_at` is server-derived; **another minimum 24h starts at adoption**, never a caller backdate. Newest anchors can be adopted non-destructively but cannot be retired. |
| Planning | Existing planner keeps at least two newest present adopted verified copies, plus all observed-only, current/active, pending, pinned/rollback, unknown, connected and unclosed copies. This may conservatively retain more than two total. Emergency OIDs are unconditional exclusions. |
| Authorization | Existing independent Ed25519 exact plan/state/job signature, maximum five-minute grant (signer issues four minutes), separate least-privilege permit issuer, fresh protected job/owner gate and health/release reads. No standing deletion grant. |
| Retirement | Existing shared repository mutex and same-maintenance PostgreSQL session lock, durable intent, revalidation before each non-FORCE DROP, server-measured logical bytes and append-only outcome. |
| Postcheck | New comparison of actual pre/post name/OID/owner/template tuples: exact target absence and every untargeted identity preserved, including every emergency tuple present before the operation. Unexpected additions/reuse/owner changes fail verification. |
| Interruption | Existing absence-only reconciliation; new optional original-baseline postcheck. It never resumes DROP, renews approval, fabricates a deletion outcome, or credits newly reclaimed bytes. |

`bootstrap.sql` and `observations.sql` are **byte-unchanged**. No catalog reinstall,
permission migration, live grant, schema-head change, registration change or
protected production-release workflow change is needed by this PR. The separate
manual retention workflow is shipped default-disabled in this PR.

The old `register.mjs --verified-at ...` manual pre-transfer import is removed.
A guessed current OID or a matching legacy database name cannot enter the normal
path. Older catalog evidence lacking original identity is protected by the planner.
Atomic adoption has no unsafe interval between owner transfer and catalog import;
a lost acknowledgement can be retried against the identical observation/manifest.

## What is still OFF and what the owner must approve

1. **Review and merge code separately.** Full exact-head CI must pass. This PR
   includes `.github/workflows/recovery-copy-retention.yml`, identical to its
   reviewed source template. It is manual-only and its owner gate is OFF unless
   the separately approved repository variable
   `KINGDOM_RETENTION_EXECUTION_APPROVED=1` is configured. Merge alone cannot start
   a private job. There is no schedule. Do not dispatch recovery or deploy merely
   to investigate storage.
2. **Approve a trusted private execution boundary and durable private handoff.**
   The reviewed `deployment/release/retention/workflow.yml` requires an
   ephemeral runner restricted to that exact reviewed workflow on protected
   `release/production`, with its owner gate before the existing production mutex.
   Validate that the account's runner-group controls can enforce those restrictions;
   a generic repository runner/label is **not** an equivalent substitute. If that
   isolation cannot be enforced, hold installation for an explicitly reviewed
   private job-delivery mechanism; do not weaken the template or move execution
   onto the game, recovery worker or owner's PC.
3. **Use the packaged executor payload.** The dedicated retention Dockerfile
   includes the existing Node/pg toolchain, checked definitions and fixed job
   entrypoint; it is non-root/default-OFF and includes no game server, signing,
   authorizer, bootstrap installer or adoption tool. It is **not** a runner
   installer, credential broker, or proof of execution isolation. Provisioning any
   private runner/service remains separately authorized infrastructure work.
4. **Keep privileges separated.** Runtime gets only `kc_retention_runtime` and the
   dedicated public verify key; permit issuance gets only `kc_retention_authorizer`.
   The independent signer can be an owner-gated cloud job: no PC command is needed.
   It receives only the dedicated retention private key, never source/restore-admin,
   runtime or bootstrap credentials. Adoption uses a separately approved short-lived
   privileged operator boundary; its bootstrap credential must never reach runtime,
   registrar or authorizer. Existing roles/catalogs must not be reinstalled.
5. **Make private journals survive runner destruction.** Back `/run/kingdom-retention`
   with reviewed private durable storage/archival handoff, retained beyond runner
   cancellation/removal. Reuse approved private storage where possible; do not
   provision a volume/service without approval. Files/directories must meet the
   existing 0600/0700 and no-symlink checks. New pre-operation journals use exclusive
   creation plus file/directory fsync before DROP. fsync alone does not make tmpfs,
   an ephemeral container or a runner work directory durable.
6. **Approve exact future-copy adoption separately.** Authenticate the retained
   artifact using GitHub's exact run/attempt/commit/digest; retain original manifest
   bytes privately and bind their SHA-256. Supply fresh owner-reviewed live state,
   including rollback references in `pinnedCopies`. The operator's reviewed command
   is `register.mjs --scope ... --state ... --manifest ...
   --expected-manifest-sha256 ... --expected-oid ... --owner-reviewed`.
   No raw values go in GitHub dispatch inputs, logs, artifacts or chat. Use the
   non-destructive `adoption-review` mode first, approve its production gate, and
   run the privileged producer only while its `retire` job holds the release mutex.
   The adoption command now checks that exact live job/owner gate, current health,
   release quiescence and completed original recovery attempt before transfer.
   `--ready-out` publishes hashes of `scope.json`, `state.json` and `manifest.json`
   only after the atomic adoption commits. Runtime then performs a read-only exact
   adoption postcheck; this mode has no retirement plan or DROP path. Do not
   transfer ownership first, backfill old OIDs or adopt the emergency copies.
7. **Approve one exact small batch only after the hold and anchors exist.** Fresh
   live state must include actual active/staged recovery references, external/manual
   pins, pending jobs and explicit lifecycle closure. The current accepted copy
   alone cannot yield a deletable copy: it is observed-only and must remain protected.
   Do not create extra recoveries just to populate retention slots. Use ordinary
   future verified releases, their captured identities and separately approved adoption.

The indispensable missing approvals are execution isolation/private durable
handoff, separated credentials/key custody, exact adoption, and an exact signed
batch. They are not another registrar installation or a gameplay/code redesign.
There is currently no authorized production plan, signed retirement permit,
managed database, enabled retirement workflow or deletion schedule.

## First small batch through dashboards

After the preceding setup has been separately approved and validated:

1. Select one genuinely obsolete adopted copy, retain at least the two newest
   verified anchors and every other protected reference, and verify both emergency
   OIDs remain outside runtime ownership. Capture a **new real per-operation**
   tuple baseline; missing historical registration baseline is not repaired.
2. In GitHub select `operation=retire` and supply only the private package's
   `request_id` (the default operation is non-destructive `adoption-review`); approve
   its existing protected production owner gate. Verify no queued/active releases
   or cooperating manual recovery work before dispatch. Do not queue cleanup
   behind a release or assume GitHub concurrency provides FIFO admission.
3. While `retire` holds `kingdom-come-production`, the isolated private operator
   prepares fresh state/plan. Owner reviews the exact one-copy selection. The
   isolated cloud signer issues its short-lived signature; separate authorizer
   rechecks eligibility, installs the permit and publishes `ready.json` last with
   hashes of the four exact private spool files. Do not publish these as Actions
   artifacts/outputs. The 180-second handoff and five-minute job stay bounded.
4. Runtime revalidates the actual job, gate, live health, absence of other release
   activity and exact completed original recovery attempt before each deletion.
   CLI exclusively creates `<result>.before.json` and fsyncs it before the first
   DROP. Journal failure stops execution. Never use FORCE or terminate sessions.
5. Check private audit and result. `verification.allUntargetedIdentitiesPreserved`
   and `targetIdentitiesAbsent` must be true. Require both expected emergency OIDs
   in the contemporaneous baseline (postcheck reports their observed count).
   Compare actual filesystem usage/free space on the **database volume** afterward,
   without a new backup, restart or filesystem deletion. Keep ciphertext unchanged.
6. On failure/cancellation/lost acknowledgement, stop. Read the original audit,
   journal and current identity before another approved job. A later coordinated
   `operation=reconcile` job can reconcile only actual absence and verify original
   survivors. The private cloud producer uses `stage-reconciliation.mjs --scope ...
   --state ... --before <original-result>.before.json --prior-approval <UUID-file>
   --ready-out ...` to publish the four exact input hashes. The executor calls
   `cli.mjs reconcile`, not cleanup; it verifies the immutable original signature
   from the database, without issuing or renewing a destructive grant. Present
   targets require fresh eligibility and a new signed batch; never resume old DROP.
   CLI refuses to overwrite a prior journal/result. Cancellation must close the
   private database session; GitHub job state alone does not prove lock release.

These are future dashboard/operator actions, not permission to execute them now.
Only the `retire` mode calls cleanup, and only with its four signed input files.
`adoption-review` accepts three manifest/state files and only verifies adoption;
`reconcile` accepts the original journal and approval UUID and never calls DROP.
Wrong-mode packages fail closed.

The database administrator, cloud signer and private handoff operator remain
trusted; PostgreSQL superusers/catalog owners can alter evidence, and native
copy ownership allows a compromised runtime to DROP owned databases outside the
wrapper. No PostgreSQL DROP-only privilege exists. If the owner will not accept
that authority, execution must remain blocked pending a separately reviewed
constrained broker. Do not call native ownership or audit records tamper-proof.

## Historical copies and storage relief

The [machine-readable classification](HISTORICAL_COPY_CLASSIFICATION.json) preserves
17 known name-to-run associations and six unknown names, with emergency/current/
newest protections overlaid without double-counting. All 23 remain protected;
**zero are eligible with available evidence**. No exact 23-row tuple worksheet can
be reconstructed from the retained summary. There is no reason to repeat a broad
inventory just to restate that block.

The reviewed 35 historical manifests lack original copy OIDs; their matching names,
passed recovery reports, sizes, inactive connections and absence of newer reports
cannot establish immutable identity. Normal adoption now fails closed without
that identity AND the exact durable registration observation. Existing authentic
external creation/audit evidence, if retained privately, can be reviewed, never guessed.

A separately reviewed **manual legacy-disposal policy** could eventually identify
an exact contemporary non-emergency tuple, resolve every purpose/reference/hold,
independently encrypt and verify recovery of that specific historical database to
an approved replacement, preserve minimum anchors, and require explicit bounded
owner authorization plus release/restore exclusion. That would be a new disposal
policy recording original-identity uncertainty, **not** backfilled original
verification or normal automated eligibility. This PR implements no bypass,
legacy adoption, disposal command or emergency override. Production execution of
such a policy is not authorized.

An eligible future batch reports the actual sizes of its targeted databases at
intent. The historical approximately 6.3 GB is **not** currently reclaimable.
`filesystemBytesReclaimed` is always null unless separately measured externally;
WAL retention, shared files, ongoing writes and filesystem accounting prevent a
logical size sum from proving physical bytes freed. No WAL purge/checkpoint,
backup-object expiration or volume operation is added.

Recommend owner-approved periodic small batches with capacity monitoring, not
unattended cleanup. Registration does not bound storage by itself: the owner must
operate the reviewed lifecycle or pause additional recoveries when verified
headroom is inadequate. A schedule is neither needed nor authorized here.

## Verification

[Machine-readable focused evidence](LIFECYCLE_TEST_EVIDENCE.json).

The disposable PostgreSQL test exercises real restricted registration, read-only
inventory, original-identity-bound atomic adoption, rollback after transfer,
concurrent/restart idempotency, fresh hold rejection, protected current/pending/
rollback/unknown copies, signed one-copy authorization, exact protected-job/API
fixtures, non-FORCE DROP, replay/reconciliation and postchecks. Its six synthetic
copies contain 900 bots plus two humans; an untouched populated realm is checked
byte-for-byte. Elapsed age is seeded by a privileged **test-only fixture** after
proving the real new hold; there is no production timestamp override API.
The original PostgreSQL suite covers emergency SQL guards, live connections,
permission drift, rename/OID reuse, intent/outcome ordering, expiry and interruption.
New unit tests reject collateral identity changes and any assertion of unmeasured
physical relief. CI additionally builds/tests the default-disabled isolated
payload and runs the existing full schema-026, gameplay, browser, population,
container and encrypted independent recovery suites at the exact candidate head.
