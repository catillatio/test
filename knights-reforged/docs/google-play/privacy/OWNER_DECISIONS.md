# Deletion and independent world-state decisions

Review candidate, 2026-11-05. **Production erasure and NPC construction are disabled.**
The owner approved abandoned kingdoms as gameplay, and requested non-fingerprinting
construction. No legal retention exception, anonymity certification or production
installation is inferred. This revision supersedes the exact-estate v2 proposal.

## Implemented revision

Fulfillment physically deletes the human `accounts` row, password hash, sessions,
request, owned personal/social/preferences/mutable-progress records and structured identity
labels. The original character survives only as an inaccessible private integrity
anchor under the proposed exception below. It is not an abandoned kingdom, cannot
be used to log in or recover the account, and earns no further income.

**Erasure creates no NPC.** A separately authorized, private constructor later
creates a complete public roster: 24 standardized kingdoms, only after at least
24 genuine completed erasures have matured for seven days. Closed UTC days, rather
than individual completion times, determine eligibility. No deleted player is
assigned to a roster slot. Equipment, properties, level, calling, health and army
size come exclusively from the versioned public catalog/roster, not a donor, source
configuration, account hash, history, seed or deletion order. All kingdoms have the
generic name **Abandoned Kingdom**, random fresh IDs, fresh clocks, no old activity,
no account and no personal progress. The permanent construction receipt has no
individual intent, account/character ID, private journal root/path or source mapping.

The constructor is a different restricted capability from the eraser. It cannot
read human, battle-history or financial table rows directly, and cannot erase an
account. Its controlled SQL checks aggregate admission and all-row preservation
inside PostgreSQL. The eraser cannot invoke construction. No new privileged service,
credential, scheduler or production role has been provisioned.

This deliberately **does not promise an immediate, one-for-one replica** of each
former kingdom. Low-volume worlds wait for a cohort; human deletion itself must not
wait. The public roster spans the active world's level/strength/income envelope.
Exact personal power, unique grants and estate mixes are not preserved in the NPC.
See [design and evidence](GRAVEYARD_DESIGN.md).

## Gameplay and funds — proposed activation policy

New NPC wallet/Vault start at zero. Former wallet/Vault/treasury/reserves stay sealed
in the private historical anchor: no duplication, redistribution or transfer to the
NPC. Public catalog Land starts a fresh clock and produces only future genuine
income. NPCs are discoverable, attackable and have normal human-origin attack/loot
and repeat restrictions; they are not development bots and never join the 900-bot
population. They cannot log in, recover, invite, post, recruit, buy, spend or attack
autonomously. NPC equipment stays usable without automatic upkeep spending. Existing
human/development-bot upkeep and combat formulas remain unchanged.

Approve the cohort/delay and public power/income envelope, zero-wallet/sealed-fund
handling and NPC-only no-spending policy before activation. This is world-state
construction, not a claim of individual estate equivalence or economy neutrality.

## Verified technical properties versus legal questions

Synthetic PostgreSQL tests establish source-independent inputs, no new NPC during
erasure, strict public rosters, delayed aggregate admission, no double credit,
separate effective privileges, full-row financial preservation, no old activity,
real income, existing loot/conservation, rollback, unreclaimability and restore
fencing. They **do not establish legal anonymity**. Seven days/24 records are
engineering minimization choices, not a k-anonymity or differential-privacy proof.
Administrative access, public observations of departures, low-volume worlds,
backups, SQL/WAL/provider logs and aggregate construction timing can still support
inferences. No claim of “no possible recoverable association” is made.

Independent qualified legal/privacy review must assess the actual threat model and
reasonably available outside information; approve the minimized world-state policy
and each retained category, or require further changes. v3 policy signatures require
that review; individual intents require completed personal-data review. These flags
must reflect evidence, not automatic approval by a helper. Old v1/v2 policy/intent
approvals fail closed. The permanent NPC has no assigned originating human; old
integrity anchors and the suppression ledger are still associated/pseudonymous data.

## Narrow retention decisions still required

| Data | Proposed period / handling | Justification and decision |
|---|---|---|
| Human account, credentials, sessions, personal/social data, request | Delete at fulfillment; restricted request reference in completion proof only | No renamed/disabled-account substitute. Confirm subject-specific free-text review and fulfillment deadline. |
| Old private character anchor, sealed funds, immutable financial/combat/asset journals and compatibility boundary metadata | While shared realm operates; proposed disposal within 30 days of permanent closure under a separately reviewed purge | Preserve other players' integrity and avoid cascade loss. Not a statutory retention claim. Require necessary, proportionate category-specific approval or a shorter tested minimization design. These records can remain identifiable. |
| Public standardized NPC and non-personal cohort receipt | Permanent world state only after independent privacy assessment | No individual estate or assigned human. Receipt proves the public roster and aggregate admission, without private journal roots. Not a permanent personal-data exception. |
| Signed suppression intent, completion receipt and checkpoint | Until last relevant backup destroyed under its own authorization, then 30 days | Prevent resurrection. Contains restricted old identities. No automatic expiry/purge is implemented here. |
| Anonymous admission carry / closed-day cutoff | Permanent aggregate only if legal review accepts it | Consumed days cannot be counted twice. Carry preserves counted unused capacity without retaining individual identities indefinitely. Any future metadata-expiry procedure must reconcile the full erasure fence; uncounted credits may be forfeited rather than retaining personal records for NPC generation. No purge is authorized. |
| Routine future encrypted backups | Proposed maximum 30 days, subject to protected holds/minima | Not a claim about current provider expiry. Legacy/uncertain/emergency copies, including OIDs 106971/129180, remain protected; proposed protected-copy review every 30 days. Suppress erasures on every restore. |
| Active escrow, bot/operator accounts, immutable identifying grants | Hold, never claim fulfilled | Resolve only with separate approved mechanism; no immutable-trigger bypass. |
| Arbitrary personal mentions, provider logs, moderation/support records | Subject-specific review; justified purposes and periods required | Structured IDs cannot locate all free text or provider-side records. Owner/legal review supplies lawful scope and support process. |

Existing protected owner gate, release mutex, exact code/DB binding, signed recovery
proof, independent private journal/head freshness and fail-closed restore startup
remain mandatory. No backup is modified/deleted, signing key regenerated or retention
infrastructure reused without review. Approval of this PR is not activation approval.
