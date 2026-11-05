# Deletion and abandoned-kingdom decisions

Review candidate, 2026-11-05. **Erasure remains disabled. No legal retention
exception, de-identification assessment or production installation is approved.**
The owner approved the gameplay direction, not a finding of legal anonymity.

## Implemented candidate

The human `accounts` row, password hash, sessions and deletion-request rows are
physically deleted. Personal names, consent/preferences/tutorial/social records,
invitation codes, mutable quest/loot progress, skill-allocation records, progression
awards and owned command receipts are removed; typed identity labels and
private account/invitation metadata in shared mutable reports are redacted.
A fresh accountless `abandoned` character becomes a permanent world NPC, separate
from the old character UUID. There is no predecessor/successor foreign key, mapping,
receipt field or suppression-journal pointer. It has no account recovery, login,
invitation, social controls, purchasing, spending or autonomous combat. It never
joins `development_bots` or changes the 900-bot population.

The new estate retains level, resource capacities/current resources, calling,
training, its own garrison/legacy floor, equipment counts and Land quantities/rates.
Human army relationships are removed, so allied-player contributions do not survive.
It receives fresh asset IDs and clocks, no historical XP/progress, old battle record,
achievement, acquisition lot, entitlement or timestamps. Protected special-grant
accounts remain held; their exemptions are never silently lost.

**Proposed wallet disposition:** the new wallet and Vault start at zero. Former
wallet/Vault/treasury/reserves stay sealed in the inaccessible historical anchor;
they are neither duplicated, granted, transferred to the NPC nor redistributed.
The estate's fresh Land clock earns only future genuine income under the existing
Land rules. No backdated income is copied. The former anchor never accrues income.
The NPC cannot spend; equipment remains usable without automatic upkeep debits or
funding. This NPC-only behavior needs explicit policy/product acceptance before
activation. Ordinary human and development-bot upkeep behavior is unchanged.
Human attacks use the existing human-origin PvP gold/XP eligibility and repeat
restrictions, not the development-bot progressive-loot policy. Defensive NPC wins
do not create progression, tutorials or player-controlled actions.

## Privacy assessment — unresolved, activation blocker

**Separate identity is not sufficient evidence of genuine de-identification.**
An unusual loadout, Land mix, strength, deletion timing or an older backup/battle
snapshot can identify the originating player. The candidate does not claim that
removing a direct mapping eliminates those links. Existing shared records retain
old character IDs and numeric facts for integrity; the private suppression ledger
retains old account/character IDs to prevent resurrection. They remain associated,
pseudonymous data, not anonymous NPC data.

Before any real fulfillment, qualified privacy/legal review must establish which
estate characteristics are genuinely de-identified in the actual available data,
including reasonably available backups, SQL/WAL/provider logs and public historical
knowledge. Atomic transition timing and statement parameters can themselves be
linking evidence even without an application mapping. If exact
estates fail that test, **do not activate this candidate** or merely sign away the
risk: revise/minimize the inheritance, or choose another reviewed world-state
construction. No claim of meeting the owner's “no recoverable link” requirement
can currently be made. The v2 policy requires approved estate review and every
signed subject intent requires `estateDeidentificationReviewed: true`; old
rename-only v1 approvals are rejected. These attestations require real evidence,
not automatic completion by the signing helper or a passing synthetic test.

## Narrow retention decisions still required

| Data | Proposed period / handling | Justification and remaining decision |
|---|---|---|
| Human account, credentials, sessions, personal/social records and request | Delete at fulfillment; request reference only in protected completion proof | No disabled-account substitute. Other players' comments on the deleted wall are also removed. Confirm scope and fulfillment deadline. |
| Old character integrity anchor, balances and immutable financial/combat/asset journals | Private/inert while the shared realm operates; proposed disposal within 30 days of permanent closure under a separately reviewed purge procedure | Prevent cascade loss of other players' transactions/history. This is **not** a statutory retention claim; approve a necessary, proportionate category-specific exception or require a shorter tested minimization design. Exact records may remain re-identifiable. |
| Independent world NPC | Permanent only if the inherited state passes actual de-identification review | Gameplay approval exists. Privacy approval does not; no permanent associated-personal-data exception is inferred. |
| Signed suppression intent, completion receipt and checkpoint | Until the last relevant backup is destroyed under its own authorization, then 30 days | Prevent resurrection and prove fulfillment. Contains restricted old identifiers/evidence, never the new NPC ID. No automatic expiry implemented. |
| Routine future encrypted backups | Proposed maximum 30 days, subject to existing holds/minima | Not a claim about current provider retention. All legacy/uncertain/emergency copies remain protected, including OIDs 106971/129180. Protected copies require a proposed 30-day policy review and suppression on every restoration. |
| Active escrow, bot/operator accounts, immutable identifying grants | Hold; never claim fulfillment | Resolve only through separately approved mechanisms. No immutable-trigger bypass. |
| Unlinked personal mentions, provider logs, moderation/support obligations | Private subject-specific review before execution | Structured ownership does not identify arbitrary free text. Owner supplies justified purposes/periods, provider practice, response deadline and alternative support verification. |

No erasure role, signing credential, journal storage or restore guard has been
installed in production by this PR. The protected owner operation, existing release
mutex, exact code/DB binding, fresh signed recovery proof, independent journal
freshness/custody and fail-closed startup remain mandatory. No backup is modified
or deleted, and no existing retention signing key is silently reused.
