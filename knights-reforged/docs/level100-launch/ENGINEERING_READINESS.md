# Non-artwork expansion engineering checkpoint

The E3 implementation is complete for owner review. It is installed **inactive**;
this document is not authorization to merge, deploy, create bots or activate it.
Functional beta art uses [five explicitly temporary placeholders](beta-art/README.md).
Final artwork remains frozen and is not a functional-beta blocker.

| Area | Implemented and verified | Remaining owner/operational decision |
| --- | --- | --- |
| Population | Immutable 450-new-identity manifest, exact original-450 identity binding, disabled new logins, new-only paid lots/Land/wallet/reserve, atomic append and idempotent retries; rollback/collision/concurrency/restart fixtures | Approve exact manifest and financial plan; no production provisioning performed |
| Capital and economy | Reconciles every initial unit/lot to 3,701,553,498 Gold-equivalent; 7/30-day conserved finance, raids/outages, separate bounded original/new schedules; no original-bot reset or policy change | Review substantial income/inflation and new-only autonomy policy; do not assume candidate capital approved |
| Combat and opponents | Existing resolver/rewards, real saved participants, varied green/seasoned/elite gear, 65% XP/tapers unchanged; real bot-versus-bot transactions/retries; actual paginated rival traversal through every level 1–100 | Approve publication/cutover and later autonomy stages; never bot-initiated attacks on humans |
| Performance and storage | Bounded 5+5 scheduling lanes, 20-row rival pages, 900-actor hourly catch-up with zero repeat payout; source/archive/restore/WAL measurements and projected journal growth | Fresh private production/recovery-volume inventory and adequate growth/restore headroom; no deletion or retention activation |
| Human expansion | Existing coordinated 5× capacity, large inventory, frozen XP transition epochs and post-50 curve; six regions/18 quests/36 shop items/six properties preserved | Exact owner plan, current human snapshot, explicit temporary-beta-art review and fresh recovery evidence required |
| Rare equipment | Server-authoritative quest-only acquisition, idempotent hit/miss receipts and normal upkeep; 500 ppm proposal simulated | Probability approval remains separate; no live rare drops enabled |
| Hudson | Exact UUID/account/database-bound 15/15/15 grant, audited zero-cost acquisitions, exact three-item upkeep exemption, rollback and repeated/concurrent grant tests | Future exact account inspection and separate owner grant approval; no live account access or grant |
| Release safety | Literal 025 pin, exact 450-or-known-900 provenance, matching independent restored-copy identity; existing signature, encryption, exact candidate and owner gates preserved | Ordinary protected deployment and later private operations require separate authorization |

The complete normal CI on engineering commit
`b9deead268a3e395d69797631fca88baea450ea3` passed **755/755 tests**, security audits,
browser checks, both containers and the real encrypted independent-restore worker,
including the exact 900-bot fixture:
[run 40146393525](https://github.com/catillatio/test/actions/runs/40146393525).
The preceding run exposed two obsolete exact-SQL test fixtures; only their literal
combined-writer-marker expectations changed, retaining the same read/write bounds.
The final PR records the final-head CI after the additional availability test and
owner freeze documentation; do not mistake earlier evidence for a later commit.

The final focused PostgreSQL traversal covers **every level 1–100**, with at least
27 actual eligible bots at each level, at most 20 rows/page, no duplicates and no
missing eligible IDs. New bot army values match saved recruited participants.
The local aggregate across all 100 full traversals was 24,965 ms; maximum 13
pages. This is not per-page latency or a production SLA. [Evidence](matchmaking.json).

## Explicit limits

Simulation outputs are deterministic fixtures, not live economic telemetry or a
production performance guarantee. The financial isolation fixes bot levels and
omits bot duels; paced progression and actual SQL combat are separate checks.
The proposed economy can accumulate large currency and journal history, and some
bots do not improve equipment. These are documented tradeoffs requiring review,
not permission to silently increase spending or delete history.

Current storage headroom and physical device behavior have not been verified in
production. No live realm, account, key, service, secret, database or deployment
was accessed. Other pending infrastructure/retention/operator PRs remain untouched.
Future final-art integration still requires a reviewed new immutable registry
and frame/provenance checks; no new combat or economic implementation is deferred behind that art.

Follow [OPERATIONS.md](OPERATIONS.md) only after the required separate approvals.
Registration, publication, purchases-only autonomy, full autonomy and Hudson grant
remain distinct operations. Use compatible forward recovery after data activation;
do not roll back to a 450-only binary, erase new identities or recompute earned XP.
