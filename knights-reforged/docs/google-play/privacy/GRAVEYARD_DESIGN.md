# Independent abandoned-kingdom population

PR #88 revision from `636eef4`, 2026-11-05. **Construction and account erasure remain
disabled. No installation, scheduling or production writes are authorized.**

## Independent data flows

Account deletion creates, schedules and credits **nothing** toward this population.
It physically removes the human account/credentials and reviewed personal records;
its protected financial-retention exceptions and suppression journal remain separate
activation blockers. No estate, account, completion count/date or individual intent
is supplied to population management. No world-state decision is required by the
v4 erasure policy. The personal erasure key/journal is not a population credential.

A separately signed `kingdom-graveyard-population-policy-v1` authorizes a desired
population, cap and per-operation limit. A fresh construction-v2 permit binds an
exact vacant-slot plan, prior population/operation count, public-definition digest,
active catalog, immutable code/candidate and target DB/OID/cluster. Existing ≤15-minute
approval, protected production mutex/exclusive owner window, external-hold review,
independently verified encrypted recovery ≤2 hours old and no-retry behavior remain.
Policy/permit schemas reject deleted-account identifiers, old admission fields and
erasure policy packets. Private signing uses the existing Ed25519 architecture;
no key, role, credential or service is installed by development.

`graveyard-world-2` defines public equipment, level, health, calling, garrison,
zero-progress compatibility markers and modest Land holdings. No player-derived
seed, unique estate, personal name or historical activity enters construction.
UUIDs are fresh cryptographic random values, names always **Abandoned Kingdom**.
The first 12 slots cover every ordinary rival band in either active catalog (1–50
or 1–100); the following 12 use alternate public garrisons, then the plan repeats
within the explicit cap. NPCs are distinct from the 900 development bots. No NPC is
assigned to an erased person or intended as a successor to anyone.

The old `graveyard-world-1` definition is retained as immutable historical reference
for the requested economic comparison only. No active selector or admission function
uses its deletion counts, hold or excessive Land endowments. Migration 028 is still
unreleased; its empty installation now has population operations/slots instead of
deleted-account count, cutoff or carry metadata. Existing character rows are unchanged.

## Recommended controlled policy — awaiting owner approval

| Control | Recommended | Reviewed implementation bound |
|---|---|---|
| Desired population | 12 | 0–configured cap |
| Configured maximum population | 12 | 1–96; increases require new explicit signed policy |
| Maximum new kingdoms per operation | 6 | 1–12, further bounded by configured cap |
| Scheduling / automatic creation | Off | No scheduler or public creation endpoint |
| Replenishment | Fill exact never-used vacant slots below desired target | Fresh signed operation each time; no repeat/implicit retry |
| Starting wallet / Vault | 0 / 0 | No initial gold grant or replenished wallet |

This cap bounds **entities**, not gold earnings or loot. Recommended endowments are
two Smallholdings at level 1 (net14/hour), two Woodlands at level 3 (net30/hour),
and one River Mill at other template levels (net55/hour). Those are existing catalog
rates, prices and Land rules; only the proposed new NPC's starting property selection
changes. Recommended 12-NPC income is 594/hour. No human or development-bot property,
price, equipment, balance, entitlement or formula is changed.

Replenishment is idempotent target reconciliation, not endless spawning. Defeat,
low HP, a looted wallet, elapsed time, player departures and deletion never free a
slot or create another NPC. NPCs recover normally and remain permanently unclaimable.
There is no retirement/reset/replacement function. An established member missing
from a restored or damaged registry is an integrity failure, **not** a refill signal.
Lowering the target/cap does not delete existing NPCs, reset wealth or stop their
existing Land income; it prevents additional creation. A higher target needs fresh
explicit authorization. No automatic player-count-derived scaling is introduced.

## Gameplay and preservation

NPCs remain discoverable/attackable through normal level eligibility and retain
normal human-origin PvP loot, repeat sequences, combat health and stamina behavior.
Only actual exposed wallets fund loot; Vault and bounty escrow remain protected.
Future genuine Land income is the sole new gold source. No autonomous combat,
recruitment, posting, account recovery, purchases or spending is possible. Public
gear remains usable without NPC equipment spending, as in the approved direction.

A separate restricted constructor cannot SELECT human/financial table columns,
write tables directly or invoke erasure. It can execute the three reviewed fixed
functions plus cluster-identity read; review-only grants are in GRAVEYARD_ROLE_REVIEW.sql.
Private operator flags/key/code/window are `KINGDOM_GRAVEYARD_*`, separate from
`KINGDOM_ERASURE_*`. SQL does not verify Ed25519 itself: the immutable private operator
verifies authorization before invoking the controlled capability. Credential custody,
restricted private execution and the existing mutex remain essential trust boundaries.

The constructor holds the existing exclusive realm writer lock, fresh-reads the
population and enforces exact vacant slots/cap again in SQL. Existing full-row
preservation witnesses remain inside PostgreSQL in an owner-only temporary table;
no personal rows or credential digests are exposed to the constructor. They cover
all original tables, including erasure audit rows as **unchanged data**, never as
admission inputs. Unknown schema, financial drift, stale state, competing approvals,
partial insertions or expired proofs roll back the entire operation. Statements
remain bounded at120 seconds and the transaction at300 seconds. No timeout is raised.

Immutable population operations retain public policy/permit, slots and new members;
there are no personal IDs, erasure counts/dates, journal roots or admission credits.
Exact receipt reconciliation can recognize the original successful operation after
an uncertain response. Never automatically retry or issue another mutation.

## Independent recovery fences

Human erasure retains its original signed external journal/receipt/checkpoint fence,
exact-copy replay and independent freshness/custody requirements. Population verification
uses its own public key (`KINGDOM_GRAVEYARD_VERIFY_KEY`) and signed public receipts.
Neither fence substitutes for the other. Startup and the existing protected independent
recovery worker enforce both. A missing/wrong population key with existing world records
blocks startup/promotion; empty worlds need no population setup or personal journal.

A backup before creation restores no NPC. A backup after creation restores its original
members/slots, never replacement IDs or extra kingdoms. Original source permits cannot
write a restored database/OID. The standard encrypted backup, independent restore,
migration/full-row preservation checks run unchanged first; the additional separate
population fence follows. No backup is rewritten or recovery protection weakened.

## Owner activation boundary and limits

Review the [economics](ECONOMIC_SIMULATION.md), proposed endowments, cap and no-spending
behavior. Approve an independent population policy and key custody, then separately
install reviewed least privileges/private runtime under existing protections. Public
verification keys must be configured on both game and recovery worker before a first
world write. Production erasure is a different decision, requiring the still-unapproved
retention exceptions and private suppression installation; it is not a prerequisite
for independently configured NPCs and is not activated by population approval.

Technical tests establish no source-person data flow, independent authorization,
financial conservation and recovery integrity. They do not certify legal anonymity,
lawful retention, provider log expiry, physical Android coverage or production capacity.
Retained former-player records remain associated data and require qualified review.
No permanent account-deletion claim may be made from the existence of these NPCs.
