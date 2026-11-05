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

**Erasure creates, schedules and counts toward no NPC.** This owner decision is
implemented without an admission cohort, waiting period, completion count/date or
private-journal dependency in population management. Human erasure is independently
authorized by the v4 policy and original request/intent/recovery safeguards.

A different private population policy authorizes generic kingdoms from public
catalog configurations. It uses fresh random IDs and no source assignments, inherited
estates, personal history or actor-derived seed. Existing direct erasure capability
cannot invoke population construction, and the constructor cannot read personal
rows directly or invoke erasure. No role, key, credential, service or scheduler has
been installed. See [the independent design](GRAVEYARD_DESIGN.md).

## Gameplay and funds — proposed activation policy

New NPC wallet/Vault start at zero. Former wallet/Vault/treasury/reserves stay sealed
in the private historical anchor: no duplication, redistribution or transfer to the
NPC. Public catalog Land starts a fresh clock and produces only future genuine
income. NPCs are discoverable, attackable and have normal human-origin attack/loot
and repeat restrictions; they are not development bots and never join the 900-bot
population. They cannot log in, recover, invite, post, recruit, buy, spend or attack
autonomously. NPC equipment stays usable without automatic upkeep spending. Existing
human/development-bot upkeep and combat formulas remain unchanged.

Approve the independent population cap/endowments and public power envelope, zero-wallet/sealed-fund
handling and NPC-only no-spending policy before activation. This is world-state
construction, not a claim of individual estate equivalence or economy neutrality.

## Verified technical properties versus legal questions

Synthetic PostgreSQL tests establish no player-state inputs or assignments,
separate authorization, zero-history construction, erasure/population state
independence, restricted privileges, financial preservation, real income, existing
loot, rollback, no reclaim and independent restore fences. They do not establish
legal anonymity. Old integrity anchors, shared records and the suppression ledger
remain associated/pseudonymous data under an unapproved retention proposal; no
world-generation requirement justifies retaining them.

Qualified independent privacy/legal review must approve necessary retained fields,
purposes, access and periods, or require further minimization before erasure
activation. Personal-data review remains mandatory on each signed intent. The
population policy cannot authorize erasure and erasure approval cannot authorize
population writes. Old mixed policy/intent versions are rejected. Independent NPCs
are public world state, not retained former-player configurations; no legal compliance
certification is inferred from that technical separation.

## Narrow retention decisions still required

| Data | Proposed period / handling | Justification and decision |
|---|---|---|
| Human account, credentials, sessions, personal/social data, request | Delete at fulfillment; restricted request reference in completion proof only | No renamed/disabled-account substitute. Confirm subject-specific free-text review and fulfillment deadline. |
| Old private character anchor, sealed funds, immutable financial/combat/asset journals and compatibility boundary metadata | While shared realm operates; proposed disposal within 30 days of permanent closure under a separately reviewed purge | Preserve other players' integrity and avoid cascade loss. Not a statutory retention claim. Require necessary, proportionate category-specific approval or a shorter tested minimization design. These records can remain identifiable. |
| Independent public NPC and population operation | Permanent generic world state | Separate owner-approved population policy; no former human or deletion evidence. This is not a personal-data retention exception. |
| Signed suppression intent, completion receipt and checkpoint | Until last relevant backup destroyed under its own authorization, then 30 days | Prevent resurrection. Contains restricted old identities. No automatic expiry/purge is implemented here. |
| Routine future encrypted backups | Proposed maximum 30 days, subject to protected holds/minima | Not a claim about current provider expiry. Legacy/uncertain/emergency copies, including OIDs 106971/129180, remain protected; proposed protected-copy review every 30 days. Suppress erasures on every restore. |
| Active escrow, bot/operator accounts, immutable identifying grants | Hold, never claim fulfilled | Resolve only with separate approved mechanism; no immutable-trigger bypass. |
| Arbitrary personal mentions, provider logs, moderation/support records | Subject-specific review; justified purposes and periods required | Structured IDs cannot locate all free text or provider-side records. Owner/legal review supplies lawful scope and support process. |

Existing protected owner gate, release mutex, exact code/DB binding, signed recovery
proof, independent private journal/head freshness and fail-closed restore startup
remain mandatory. No backup is modified/deleted, signing key regenerated or retention
infrastructure reused without review. Approval of this PR is not activation approval.

## Remaining product decision

Recommend target12/cap12, up to6 new kingdoms per explicitly signed operation, no
scheduler, modest catalog Land endowments producing594 gold/hour total. See
[long-term economics and timings](ECONOMIC_SIMULATION.md). The hard reviewed bound
is96; it is not an approved setting. Passive gold accumulation is permanent; loot
transfers rather than destroys it. No source-to-NPC inheritance or cohort decision
remains. Activation still needs separately approved population configuration/key
custody and restricted installation; erasure needs its own retention approval.
