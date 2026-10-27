# Recovery storage lifecycle readiness

**Registration is working; controlled retirement and hosted delivery are implemented but not activated.**
The owner accepted the first genuine observation after protected
[run 62](https://github.com/catillatio/test/actions/runs/40439630950), promotion OFF:
worker PASS, exactly one observation, exact manifest/live identity/server receipt,
and both emergency OIDs. [Owner-attributed evidence](registration-phase2/OWNER_FIRST_OBSERVATION_ACCEPTANCE.json).
Do not repeat installation, registrar configuration, registration diagnostics,
recovery rehearsals or catalog initialization.

Historical tuple preservation across that registration remains **UNVERIFIED**:
no genuine pre-run name/OID/owner inventory was retained. Future operation journals
cannot reconstruct it. The prior approximately 6.3 GB / 23-copy observation is not
a current reclaimable-space estimate. No historical copy is authorized for deletion.

## Implementation decision

| Question | Result |
| --- | --- |
| Controlled future-copy engine | Implemented: inventory, explicit atomic adoption, eligibility, exact signed permit, coordinated non-FORCE retirement, reconciliation and postchecks. |
| Protected manual workflow | Included, identical to the reviewed template, default-disabled by unset `KINGDOM_RETENTION_EXECUTION_APPROVED`. Manual-only; default operation is adoption verification. |
| Production execution boundary | **Not installed.** Hosted coordinator + separate private Railway executor/authorizer + isolated GitHub signer are implemented. The unsupported runner group is removed. No production provisioning/configuration occurred. |
| Newly registered copy | Observed-only/protected. Requires separate exact adoption, server-derived 24-hour hold, retained anchors, current reference/hold review and exact signed retirement authorization. |
| Historical copies | All 23 protected; zero eligible with the evidence currently available. 17 name associations and six unknown names do not establish original OIDs. |
| Emergency copies | OIDs **106971 and 129180**, unconditional protection with no override. |
| Storage relief | Future batch reports actual logical database bytes measured at intent. Physical filesystem relief remains unmeasured/null until independently observed on the database volume. |
| Unattended operation | Neither necessary nor authorized. Recommend owner-approved periodic small batches and capacity monitoring. |

## What changed

- Privileged adoption now requires an independently authenticated manifest file
  hash, its original captured OID, the exact immutable registrar observation,
  scoped maintenance/cluster identity and a live owner-gated coordinated job.
  Ownership transfer and catalog insertion commit atomically. No pre-transfer,
  caller backdate or legacy name-only import remains.
- The planner rejects missing/fabricated original identity even if a catalog
  digest is recomputed. Current/pending/active/pinned/rollback/unclosed/unknown/
  connected/emergency copies stay protected; retirement keeps at least two newest
  adopted verified copies and a minimum 24h since server observation at adoption.
- The manual workflow has mode-bound private packages for `adoption-review`,
  `retire` and `reconcile`. Only `retire` calls cleanup and needs a signed permit.
  The other modes cannot initiate deletion. All hold the existing release mutex.
- CLI writes/fsyncs a private exclusive pre-DROP identity baseline. Postchecks
  prove exact target absence and preservation of every untargeted tuple. Absence
  reconciliation can check the original baseline without renewed deletion authority.
- A credential-free, non-root/default-OFF operator payload and full disposable
  PostgreSQL lifecycle tests are included. Required CI also exercises its module
  packaging/defaults and the existing independent encrypted recovery suites.

Installed `bootstrap.sql` and `observations.sql`, the strict game migration pin,
protected production-release controller/workflow, backup/signing/recovery chain,
registrar implementation and all gameplay/artwork remain unchanged.

## Minimum remaining owner decisions

1. Review the delivery PR and final exact-head CI; merge/deployment are separate.
2. Approve the two new private services, dedicated journal volume, private handoff
   bucket and protected GitHub execution/signing environments. Use the fixed
   `initialize-journal` and `install-disabled` operations with execution OFF.
3. Approve restricted credential/key configuration separately. Runtime, authorizer,
   signing key and bootstrap credentials remain in distinct boundaries.
4. Validate actual platform setup and durable/non-root journals; only then approve
   execution enablement. This is not authorization to delete a copy.
5. Separately authorize exact privileged adoption and its read-only verification.
   After the hold/anchors/closure/reference checks, review one exact future target,
   compare the non-credential digest, and approve signing with its exact comment.

The complete dashboard sequence, exact configuration names, interruption behavior,
resource-cost assumptions and test limits are in [EXECUTION_DELIVERY.md](EXECUTION_DELIVERY.md).
Do not use the superseded runner-group installation instructions in older history.
The original lifecycle engine/policy discussion remains in
[LIFECYCLE_COMPLETION.md](LIFECYCLE_COMPLETION.md). Historical evidence remains in
[HISTORICAL_COPY_CLASSIFICATION.json](HISTORICAL_COPY_CLASSIFICATION.json) and
[PROVENANCE_RECONCILIATION.md](PROVENANCE_RECONCILIATION.md).
