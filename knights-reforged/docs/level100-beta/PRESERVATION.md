# Compatibility and verification

## Data model and rollout

No migration or schema change. Schema 025 and its strict release population
contract remain byte-identical. One new immutable presentation definition is
registered additively at migration and checked at startup. Ordinary installation
has no presentation effect, no new account, no credit, and no activation.

Numerical catalogs, quest prerequisites and item IDs are unchanged. State/inventory
projection changes display names only after authorization; gear selection still
uses the same category, owned quantity, stats, upkeep and participation policy.
Both attack and defense selection preserve complete authoritative quantities.
Purchase/FIFO/ledger paths retain the original IDs, prices, paid costs and rulesets.
No accounts, sessions, army links, items, Land, bot histories or XP are rewritten.

New equipment purchase receipts record display name/policy; new battle snapshots
copy that policy from the authoritative selection. Old snapshots use their own
saved names and original definition's art; old receipts use saved names or the
original catalog fallback. Current UI never relabels those historical events.
There is no attempt to infer historical identity from today's display name.
HUD gear remains quest-exclusive, attack-focused, minimum ordinary level 71;
Hudson-only entitlement still exempts exactly the three approved IDs, never names.

The immutable activation event stores presentation ID, canonical digest and an
explicit boolean review. New cutovers require these fields in the exact approved
plan. Existing PR #34/#35 activation rows without this evidence retain their
legacy presentation, allowing compatibility rather than retroactive activation.
An already activated old realm needs a separately reviewed future presentation
adoption procedure; this PR does not silently write one. No live state was read
to assume whether a particular realm is activated.

The protected release already authenticates the exact code/asset/ruleset candidate.
This PR additionally binds current approved-art file hashes and exact presentation
digest at startup/cutover. All five beta paths/hashes/provenance and its explicit
`temporaryBetaArtworkReviewed` gate remain intact. No dynamic schema acceptance,
new endpoint, feature flag, credential, cleanup or release-system bypass.

## Checks

- Focused presentation tests: all 99 slots and unchanged numeric definitions,
  gap traversal, unique names/category, known donors/placeholders, regional IDs,
  unknown/malformed policies and asset hashes.
- PostgreSQL: previous installed schema with the new definition removed, populated
  accounts/inventory/FIFO/economy/session/battle/receipt snapshots compared before
  and after additive installation; no changed business rows; migration replay.
- Current/public Profiles, old and new receipts, retry identity and actual new/old
  battle snapshots. Forged activation-event digest rolls back and fails closed.
- Existing E2b integration: pending/drop-off rules, XP boundaries/new accounts,
  actual quests, achievements, safe grants, ordinary upkeep, concurrency and
  rollback. Existing E2a tests cover level-500 capacity/inventory/XP compatibility.
- Existing complete 450→900 fixture: old business rows retained, manifest exact,
  collision/rollback/concurrent append/idempotency, all 100-level eligible rival
  pages, autonomy pause/purchases-only/enabled and late-pause fences. It now also
  rejects omitted/false/string/forged presentation approval.
- Real HTTP Chromium: 96 shop slots at each of 320/390/430/1024, exact display/art
  source, image decoding, five tabs, no horizontal overflow, current/public
  inventory, receipts, region navigation and historical/current reports.
- One final exact-head normal CI includes all gameplay/security/regression,
  schema-025 preservation, encrypted independent recovery and exact-900 fixture,
  game/worker containers, typecheck, build and security audits. Link/result is
  recorded in the draft PR after completion.

Physical-device Safari/Android and a fresh actual production restore-capacity
inventory are not simulated by browser/fixture success. No production readiness
claim is made from local models alone. Database-owner/superuser privileges remain
trusted: they can alter tables/functions or fabricate authorization rows; these
internal owner tools are not a restricted public administration boundary.
