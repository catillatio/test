# E2b activation readiness — not an activation approval

E2a installs compatible infrastructure with all current gameplay policies active. Existing characters can already attain levels above 50; the pending expansion concerns authored content, participation capacity and future pacing, not removing a hard character-level cap.

## Owner decisions still required

1. Approve 5× capacity **and** the larger relationship limit. The default remains the old 101 capacity/100-relationship ceiling. Keep actual membership, consent, 20 invitations/day, cooldowns, militia and equipment ownership authoritative.
2. Approve the proposed +150 post-50 requirement curve and exact grandfathering/cutover semantics. E1's model targets about 22–23 intensive /64–66 regular days, with material schedule/opponent sensitivity. E2a changes no rewards or progression pace.
3. Resolve the legendary equipment value problem before choosing purchase retierings, substitutes or future stats. E1's seven retierings/mirrors are **not adopted**. Already-owned classic quantities, usability, acquisition prices and historical reports must remain valid.
4. Review the final new quest/region/equipment/Land definitions and original/licensed artwork. E1's proposals and capital amounts are not approvals. Preserve all existing selected art and full-bleed compositions.
5. Separately approve any new bot population/capital/autonomy work. E2a retains exactly 450 old identities and existing bot projections/policies. The E1 900-bot capital/storage proposal still needs fiscal and capacity review; it is not part of E2b by implication.

## Implementation before activation

| Dependency | E2a status | Work still required |
|---|---|---|
| Army | Versioned resolver/selection/roster bounds, legacy active | Register a new immutable activation definition selecting the reviewed policy. Use it consistently for character state, combat, lists and recruitment; do not edit compatibility-1 in place |
| Inventory | SQL supports 5,000; current purchases stay 1,000; FIFO prefix bounded | Deliberately select the reviewed application limit. Keep 100-item transactions and all financial guards |
| XP | Future formula/epoch reader/threshold engine and empty metadata table | Implement typed, idempotent epoch initialization under the existing character lock and coordinate a precise writer cutover. New accounts need the selected epoch too |
| Catalog | Separate purchase eligibility, archived ownership, explicit equivalence engine | Register the approved immutable catalog/purchase policy. Integrate the selected version throughout Armory/Profile/receipts/quest previews and validators; current code still serves alpha-0.3 |
| New quests/regions | None installed | Add reviewed definitions and loaders; intentionally update the old ≤21 quest-army validator and prerequisites. Rehearse old/mixed/new equivalents without duplicate consumption or forced repurchases |
| New Land | None installed, economics unchanged | Update the current 140,000-base validation intentionally. Return a bounded valid quote prefix/reason when later progressive prices exceed the treasury; do not clamp prices or crash the marketplace |
| Achievements/tutorial | Legacy summit frozen at identical level-50 meaning; eight lessons unchanged | Use a new expansion achievement ID/version for 100; do not rewrite earned awards or reset tutorial cursors/replay/completion |
| Rivals/autonomy | Existing policies/population unchanged | Establish meaningful eligible opponents before promising E1 progression. Fixed level-50 blueprint references alone have no eligible opponents by 61. Do not assume live bot distribution without authorized evidence |

The new catalog abstraction is equipment compatibility, not an E2b quest/Land implementation or a generic framework. Definitions must remain available for historical/owned IDs even if absent from future sale lists. The public cannot supply equivalent groups or purchase overrides. Any changed item value must receive separate balance review.

## XP cutover requirements

- Freeze each existing character's **current** legacy level, in-level progress and current transition requirement under the authoritative lock. Do not derive its level from lifetime XP. An existing level 100/200/500 character keeps that level and progress.
- Finish the frozen current transition at the old requirement; apply the selected policy only to subsequent transitions. No extra lifetime XP, retroactive points or duplicate resource refill. Command retries replay their original saved receipt.
- Do not preinstall future epochs while legacy writers continue and then assume they describe a later cutover. E2a intentionally ignores future metadata in legacy execution. A mixed old/new deployment could award different thresholds; a source-only policy switch is not a distributed cutover protocol.
- Drain every incompatible game/autonomous writer or use a separately approved brief write-drain procedure. Activate the reviewed version, initialize/verify epochs transactionally, then resume compatible writers. Readers, registration, grants, header requirements, reports and replay paths must agree. Missing/mismatched/invalid metadata fails closed rather than recreating an entitlement from current XP.
- Keep combat XP on its existing difficulty/repeat/65% reward helpers unless a separate reward change is approved. A larger level requirement must not silently increase combat's XP budget.

## Population remains a separate operation

Existing bot membership projections, 450-candidate guards, scheduling, treasury and 5,000-cost purchasing policy remain unchanged. The current policy cannot buy the proposed upper-tier equipment, and larger new NPC armies need reviewed saved contingent metadata. Do not compensate by rewriting old bot estates, granting money or silently raising spending allowances.

Adding accounts is not an ordinary preservation-only migration. The existing protected checks still require exactly 450 and unchanged old business rows. Any future population append requires its own owner-reviewed exact manifest, finite capital, isolated restored-copy rehearsal, retry/concurrency proof and narrowly authorized append protocol. Never accept a bot-count range or rerun initialization/provisioning to fill level gaps. No retention/operator/release redesign is included in E2a.

## Release and rollback gate

Before E2b, run a new populated rehearsal from the then-current exact schema, including old >100 characters, both gear directions, acquisition lots, Land clocks/reserves/arrears, notifications, sessions, tutorials, bounty history and every old bot UUID. Test the distributed cutover and failure/retry boundaries, 320–430px/desktop presentation, and future numeric limits. Benchmark the actual 900-copy workload/storage/recovery separately if a population addition is proposed.

Advance a schema pin only for an actual separately reviewed additive migration, to one exact head with stale/next/missing/commit/bot/restoration rejection tests. Keep encrypted independent recovery, retained artifact verification, signatures, candidate identity and owner deployment approval mandatory.

E2a's SQL widening is backward-compatible storage; it does not make an old protected controller's 022 post-deploy pin correct for a 023 database. Prefer a compatible forward fix retaining schema 023 and legacy policies. Do not downgrade pins to conceal drift. After new content/epochs/large purchases are activated, do not roll back to an old binary that rejects the new IDs/limits or ignores epochs. Preserve all earned history; do not restore an old realm merely to undo an expansion.

No production access, feature activation, bot provisioning, protected workflow dispatch, merge or deployment is authorized by this readiness report.
