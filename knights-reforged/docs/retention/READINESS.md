# Recovery storage lifecycle readiness

**Registration is working; controlled retirement is implemented but not activated.**
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
| Production execution boundary | **Not installed.** Existing service discovery found only game, source PostgreSQL, recovery PostgreSQL and verification worker. No worker repurposing or generic self-hosted-runner fallback. |
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

1. Review this PR and exact-head CI; merge approval is separate.
2. Approve an enforceably isolated private execution/durable handoff boundary and
   separate cloud signer/permit-issuer custody. The workflow's restricted runner
   group must actually be supported and restricted to the reviewed protected ref;
   if not, hold for an approved private job-delivery solution. The payload is not
   a runner installer or credential broker. No owner-PC command is required.
3. Supply only the existing restricted runtime/authorizer credentials to those
   isolated boundaries and a dedicated retention public/private signing-key pair
   with the private half withheld from runtime. Keep privileged adoption separate.
   Approve GitHub enablement only after private isolation, journal persistence,
   scoped platform identity, role/guard drift checks and owner gate are ready.
4. Use the non-destructive adoption-review mode for separately approved exact
   future copies. After the hold and retained anchors exist, review a fresh
   one-copy dry run and explicitly approve/sign that batch in `retire` mode.
   No adoption, deletion, configuration, schedule, merge or deployment occurs here.

See [the complete operator sequence and limitations](LIFECYCLE_COMPLETION.md),
[historical classification](HISTORICAL_COPY_CLASSIFICATION.json),
[authenticated historical reconciliation](PROVENANCE_RECONCILIATION.md), and
[completed catalog validation](OWNER_CATALOG_VALIDATION_RESULT.json).
The pre-registration readiness assessment remains preserved in Git history at
`e9165c34ef8ddaba4e04488438ba110cc2020376`; it is not a current activation instruction.
