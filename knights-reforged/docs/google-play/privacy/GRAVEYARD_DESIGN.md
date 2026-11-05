# Source-independent abandoned kingdoms — implementation review

2026-11-05; PR #88 continuation from `4370e0c`. Disabled candidate, not a legal
anonymization certification. No production account, role or recovery copy touched.

## Data flow and why it changed

The rejected exact-inheritance design could fingerprint a former player through a
rare loadout, property mix, training, level or immediate successor creation. Fresh
UUIDs did not resolve this. The revised human-erasure transaction creates **zero**
world NPCs and passes no estate or successor identity to any constructor.

A separate private batch operation consumes aggregate matured capacity and builds
all 24 entries of `rulesets/graveyard-world-1/rules.json`. Public catalogs and roster
bytes are the only character/configuration inputs. The same roster is used for any
cohort in the same active world. There is no account-derived random seed, per-player
band selection or private source-to-slot assignment. IDs come from PostgreSQL's
cryptographic UUID generation. Names are generic. History, old resource values,
acquisition lots, entitlements, human army relationships and old income clocks are
not copied. Expanded worlds receive a fresh zero-progress compatibility marker computed
from the public template level using the existing progression function; no former
XP entitlement is copied. Special-grant accounts remain held by the original erasure rules.

The roster uses normal unlocked catalog weapons/armor/spells and one catalog
property holding per kingdom. Watch/garrison variants provide different strength
without personal configurations. Existing army/equipment/training/calling formulas
calculate combat power; there is no alternative NPC loot formula.

| Active catalog | Public levels | Garrison | Max health | Net Land gold/hour per NPC | Full batch gold/hour |
|---|---|---|---|---|---|
| alpha-0.3 | 1–50 | 1–101 | 102–200 | 14–15,600 | 106,416 |
| level100-content-1 | 1–100 | 2–500 | 102–300 | 14–133,200 | 442,576 |

These are catalog-derived capacities, **not** measured live population distribution
or promised average loot. Every playable rival level band has a public opponent.
The higher tiers replace broadly comparable world combat/income capacity, not the
specific erased player's strength. No starting gold is created. Future normal Land
income is a real existing gold source, so permanent non-spending NPCs can accumulate
wealth; the batch envelope and long-term supply require owner product/economic review.
No hidden balance cap or wallet replenishment compensates for that tradeoff.

## Admission and timing

A batch needs 24 completed `erased` receipts at least seven days old. Only completed
closed UTC days are counted. The full source erasure fence must be independently
verified before the owner issues a fresh construction permit. There is no automatic
scheduler or singleton fallback, and low-volume batching never delays account erasure.

Each immutable batch records the public roster digest, code/database-bound signed
approval, aggregate count, closed-day cutoff and remaining anonymous carry. Only
completions newer than the previous cutoff can add credits; each batch consumes 24.
A second batch on the same cutoff can use carry but cannot recount those days.
No subject list, erasure operation, private journal path/root or donor ID appears in
this record. Permanent world-receipt verification uses public records and aggregate
admission, not the private ledger as an NPC ownership index. The independent human
suppression ledger remains mandatory for recovery and is not shortened here. Future
approved expiry must reconcile that fence; it must not retain personal data merely
to earn more construction credits. Purging or retention activation is not implemented.

## Capabilities and transaction integrity

The existing private signing/operator entry points gain a separate construction
mode. A fresh ≤15-minute signed permit binds public roster/catalog, policy, exact
code/candidate, database name/OID/cluster, expected aggregate state and independently
verified encrypted recovery evidence ≤2 hours old. It attests a verified source
suppression fence, external holds and protected owner window. No private key enters
the runtime. Erasure authorization alone cannot enable world construction.

Proposed `kc_graveyard_builder` has no table/column SELECT, INSERT, UPDATE, DELETE,
TRUNCATE, role membership/ownership, schema CREATE or human-erasure capability. It
can execute three fixed reviewed SECURITY DEFINER functions and read cluster identity.
They expose aggregate admission and public world entities, never human rows. The
separate eraser cannot construct. Review-only grants are in `GRAVEYARD_ROLE_REVIEW.sql`;
no credentials, role or service have been installed. Database capability credentials
are security-sensitive: SQL does not verify Ed25519 itself; the private immutable
operator verifies signatures before invoking the restricted capability. Effective
privilege checks do not claim to sandbox a compromised database owner.

The realm's existing exclusive writer lock serializes admission/construction with
erasure, recovery and gameplay. Exact schema/column contracts reject unknown data.
PostgreSQL keeps before-state SHA-256 full-row witnesses in an owner-only temporary
table. It compares complete row multisets afterward, excluding only validated new
entities/batch. Every existing table/column, including credentials/financial/history
rows, remains covered; no private rows or hashes are returned to the constructor.
The assumption is the same cryptographic collision resistance as the existing
preservation witnesses. Node never materializes battle history. Statements remain
bounded at 120 seconds and the transaction at 300 seconds; unmeasured real-realm
performance is not asserted. A timeout rolls back, never weakens preservation.

A lost acknowledgement does not authorize retry. Read-only receipt reconciliation
can identify an exact already-completed batch under its original approval; a fresh
batch cannot spend the same capacity twice. SQL error/interruption/preservation
mismatch rolls back entities, finances and audit together. Immutable append-only
batch/registry guards and restore validation reject missing or forged world evidence.

## Restoration

Human erasure retains the complete original signed journal/receipt/checkpoint fence.
An older backup is suppressed using its original intent and a fresh exact-copy
restore permit; this makes no NPC and cannot duplicate the world population. A
backup predating construction contains no cohort; a backup after construction
contains the original roster/receipt, never a regenerated substitute. Source-only
permits cannot mutate a recovered DB. Independent encrypted backup and migration
verification still run first. No backup bytes or existing immutable rows are rewritten.

## Verified boundaries and remaining review

Tests use synthetic humans, fixture Ed25519 keys and owned PostgreSQL/real pg_dump
restores only. They verify source-independent standardized construction, delayed
admission, carry/no-recredit, no direct personal-table access, preserved old rows,
no initial gold, genuine income and existing repeat/loot conservation, no login or
reclaim, rollback on financial side effects, immutable receipts and restore fencing.
They do not certify anonymity, provider log erasure, real-world semantic free-text
detection, lawful retention or production performance. Delayed aggregate creation
still leaks population activity; external observations/admin data may support
inference. No formal anonymity guarantee is asserted from a batch size or replaced ID.

Independent legal/privacy review must decide whether this non-assigned public world
state and aggregate metadata meet the actual policy/threat model. It must separately
justify retained private anchors, immutable records, journal and backups. The owner
must approve batching/income/no-spending tradeoffs and the exact retention proposal.
Then separately authorize protected installation and operational acceptance. Both
`KINGDOM_ACCOUNT_ERASURE_ENABLED` and `KINGDOM_GRAVEYARD_CONSTRUCTION_ENABLED` remain
unset/disabled in production; this task creates no activation path around those gates.
