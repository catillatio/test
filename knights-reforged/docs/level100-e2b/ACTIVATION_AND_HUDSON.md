# Separate future activation and Hudson authorization

**Nothing in this document authorizes production execution.** Both operations are prepared only. Do not run them during this PR, a routine release, startup or migration. The existing release/recovery pipeline is not an operator SQL channel and has not been repurposed. PR #13 remains untouched.

## Installation versus activation

024 installs empty control/audit/acquisition tables. `realm_expansion_state` must remain empty for the dormant release. Installed definitions are checked against their immutable database versions. Legacy capacity, inventory limit, XP and catalog remain selected; all 450 existing bots retain their existing policies, identities and financial history.

A future activation requires reviewed binaries, assets, probabilities if enabling drops, opponents and recovery headroom together. The private activator currently **fails closed** because artwork is unapproved. It also rejects unknown catalog/art/policy digests, expired or changed plans, unexpected prior epochs, wrong database/cluster identity, mismatched bot counts and insufficient upper-level opponent bands. New unreviewed catalog selection cannot be supplied through a browser or environment variable.

The exact 450-bot contract is deliberate. E3 adding bots must introduce separately reviewed population/engine/release expectations before activation; do not change a live count or suppress this assertion to make a plan pass.

## Minimal future operator channel

Use an **already authorized trusted private operator checkout/host**, with existing private PostgreSQL connectivity, running the exact reviewed compatible source and build. The standalone `deployment/expansion.mjs` is a repository-only manual entrypoint; it is deliberately excluded from the existing game-image and release-worker allowlists. Its core functions are compiled into the candidate-bound `dist` tree, but this convenience entrypoint is not shipped or called by the game, migrations, release worker or workflow. No public endpoint, new service or production credential is created here. It accepts only a private `*.railway.internal` PostgreSQL host and fixed operation names, and logs fixed PASS/FAIL labels.

A Railway Console containing only the running game image is not sufficient by itself to run the repository-only entrypoint. If the reviewed checkout, private connection and credential are unavailable, stop. Separately authorize a trusted private administration channel with the ability to read `pg_control_system()`, lock the realm/characters, insert the new authorization and audit rows and apply only the necessary inventory/maintenance changes. This PR does not provision it or broaden any Railway token. Do not expose a database publicly, stage variables, redeploy for a shell, copy a database URL into GitHub, or reuse a production release to execute arbitrary commands.

These are privileged operator operations, not a new restricted-role administration system. A PostgreSQL owner/superuser can change grants, disable triggers or fabricate data. Append-only triggers and exact manifests protect ordinary paths and accidental rewrites, not a hostile database owner. Restrict and audit the trusted channel; the paused operator PR is a separate future hardening project.

## Future coordinated cutover, after new owner authorization

1. Review and deploy compatible E2b binaries through the established protected release, with exact-head CI, fresh encrypted backup, independent restored-copy migration/preservation, retained artifact verification, signing and owner approval. This step alone leaves expansion inactive.
2. Adopt separately approved original/licensed full-bleed artwork in a **new immutable asset version**. Obtain owner review of the rare probability in a new immutable reviewed policy if enabling drops. Never edit an already installed pending ruleset in place. Verify all asset hashes and responsive crops in the exact binary. Deploy that exact activation-ready asset/rate candidate through a new protected release with fresh independently verified recovery evidence. Confirm that every serving writer and the private operator checkout match its approved commit, catalog and artwork digests before producing the cutover plan. The earlier dormant deployment cannot authorize assets from a different checkout.
3. Resolve E3 opponent/capital/scheduler/population contracts or demonstrate sufficient real eligible humans. Review volume headroom, encrypted recovery, restoration capacity and maximum writer duration. No bots or capital are created by this activator.
4. Drain all gameplay writers and autonomous jobs through a separately reviewed operational window; do not run mixed legacy writers. Keep legitimate requests stopped while producing and reviewing the one-hour plan. The application barrier is a final safeguard, not a traffic-draining system.
5. In the trusted private shell, run the separately authorized read-only inspection:

   ```sh
   ALLOW_EXPANSION_OPERATOR=1 node deployment/expansion.mjs inspect-expansion /secure/expansion-plan.json
   ```

   The mode writes a new 0600 plan with database name/OID, cluster identity, exact content/policy/art digests, frozen-human-state digest, population bands and server-derived expiry. No credentials or signed URLs are written. Have the owner review the exact plan and independently verified storage/recovery/opponent facts. The three `*Reviewed` fields start false; only a separately approved plan can assert them. `rareDrops` starts false. Save the owner approval and exact canonical plan digest in the change record.
6. Only after explicit approval of that exact operation, use `definitionDigest(plan)` from the exact binary to obtain the canonical SHA-256 (not the whitespace-sensitive file hash), and provide it as `APPROVED_EXPANSION_PLAN_SHA256` to `activate-expansion` with the same plan path. The CLI does not accept SQL or arbitrary target identifiers.
7. In one exclusive transaction, the controller revalidates database/definitions, approved assets/rates, unchanged human progress and eligible population; locks characters; inserts each human epoch; inserts one immutable realm activation plus audit evidence; and commits. Shared writer barriers precede character locks. Exclusive lock acquisition has a 10-second timeout. An in-flight old writer receives serialization failure while the exclusive lock is held; after activation incompatible writes fail closed. Bots receive no epochs or rewrites.
8. Verify no old writer is serving. Verify each sampled human's level, current in-level XP, points/resources and current frozen threshold; actual army participation, roster pagination, catalog/regions/quotes, receipts and legacy gear. Verify bots remain unchanged and enabled jobs keep their existing policies. Resume traffic only after the approved verification.

An existing human at level 80 keeps the original 3,350-XP current transition; level 81 then uses 8,045. Installation/cutover does not change lifetime XP, attained level, progress, points or resource timers. Only a real subsequent level-up awards the normal existing point/refill. A new post-cutover human initializes its epoch in the ordinary registration transaction.

## Separate exact Hudson operation

Target character: `55742e75-70c9-4792-8136-fe6ead2b83e0`. The current account UUID/username/name have **not** been read from production. They must be inspected and reviewed before any future grant. The immutable manifest is `hudson-equipment-grant-1`, operation `db21b413-31bb-4165-bb0c-c07e767c5be1`:

| Item ID | Quantity | Paid acquisition cost |
|---|---:|---:|
| king-hudsons-sword | 15 | 0 |
| king-hudsons-shield | 15 | 0 |
| king-hudsons-meteor-shower | 15 | 0 |

The manifest's item price is a balancing reference, never paid value or resale entitlement. No ordinary purchase, copied name, different character UUID, browser flag or quest below 71 can invoke this grant.

After expansion has been independently authorized and activated, the future owner may separately authorize:

```sh
ALLOW_EXPANSION_OPERATOR=1 node deployment/expansion.mjs inspect-hudson /secure/hudson-plan.json
```

Review exact character-to-account mapping, current names, database name/OID and cluster identity, manifest digest, operation ID and server timestamps. Retain the exact plan and separate explicit owner authorization. It expires after one hour for a new mutation. Only then supply its canonical digest to `grant-hudson`, using `APPROVED_EXPANSION_PLAN_SHA256` and the same private plan file. Do not put database credentials in commands or logs. No grant is authorized now.

The grant locks that character, verifies the exact binding and manifest, rejects a disabled/bot target, unexpected partial evidence or insufficient inventory room, settles old liabilities at the old rate, and adds 45 copies with three acquisition lots, transaction/provenance rows, one grant receipt, three exact-item entitlements and one append-only audit event atomically. Existing legitimate copies are retained; they become exempt only from the authorized effective time. No historical charges are erased.

A committed retry of the identical reviewed plan verifies all original acquisition quantities/zero paid costs and entitlements and returns its receipt, even if copies have since been legitimately sold. A new/different plan, wrong account/name/UUID/manifest or receipt-less partial acquisition fails closed. An interrupted transaction leaves no partial grant. Never repair an unexpected partial state by rerunning a broader grant or rewriting the immutable evidence; investigate separately.

### Accounting example

An ordinary character owning 15 of each item has **7,650 gold/hour** upkeep. Hudson's same 45 copies add **zero** effective upkeep, while his unrelated gear retains its normal rate. The global item rates stay 175/170/165. With other maintained equipment paused, only genuinely free or entitled equipment remains available; army limits and ordinary selection still apply.

The existing settlement may legitimately pay earlier arrears from existing funds or return an excess prepaid reserve after a rate change. Those are ordinary ledgered liabilities/owned reserve returns, not a new gold grant, income source or retrospective charge refund. No Vault debit, payment clock reset or synthetic offset is introduced.

## Failure recovery

- Before cutover: safe retry of the exact plan, within expiry, after investigating the cause. After expiry/state drift, obtain a new inspection and owner approval. No epochs/control/audit row partially commits.
- Unknown network outcome: inspect the immutable operation/approval receipt before another attempt. Never assume failure means the transaction did not commit. Keep the exact plan for idempotent receipt verification.
- After activation: **forward recovery with a compatible binary**. Do not delete epochs/control rows, revert the XP threshold or re-enable a legacy writer. Older binaries are fenced; a normal Git revert is not a data rollback.
- Catastrophic recovery uses only the existing separately approved encrypted recovery procedure and its verified exact backup. No automatic restore or deletion is added here.
