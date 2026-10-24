# Preservation and migration plan — E1 frozen at schema 022

Baseline `7cf9a3a48284c96afe922b3473cce429339bd7e4`; merged 5.1D, current strict head **022_player_foundations.sql**. E1 adds only research/docs/tests. No migration, live inspection, database mutation, provisioning command, service change, production workflow or permission change is performed.

## Invariants

Preserve all accounts/character UUID mappings, credentials/sessions, attained levels/lifetime and in-level XP, gold/Vault/retained balances, inventory quantities/FIFO paid lots, original Land rates/timestamps/remainders, maintenance reserves/arrears, memberships/invitation state, bounties/escrow/claim events, achievements/tutorials/read markers, battle snapshots, rivalry/champion aggregates and all 450 old bot identities/autonomous receipts. Preserve approved art/mappings and full-bleed framing.

Exact candidate signatures, independently exported encrypted recovery, owner-held recovery key verification, retained artifact re-download, separate-cluster restore/migration/replay, health/post-deploy verification and owner approval remain mandatory. Do not run initialization or make the schema head dynamic. Nothing in this report authorizes a new release.

## Future compatibility design

| Area | Safe mechanism | Forbidden shortcut |
|---|---|---|
| Capacity | New immutable 5× resolver + old legacy-floor entitlement; actual member count unchanged | Rewrite army stacks/relationships or grant capacity as members |
| Larger owned stacks | Widen the quantity CHECK and versioned numeric limit without updating any existing row | Rescale quantities, delete spares or change old acquisition costs |
| Prestige purchases | New catalog version/purchase policy; old IDs/stats remain; seven exact grounded mirrors and server-resolved old quest alternatives | Edit immutable old JSON, gate owned use by the new unlock, rewrite old reports |
| Progression | Immutable curve policy plus separate per-character epoch/current-level entitlement metadata | Change `alpha-0.3`, recompute level from lifetime XP or backfill unearned XP |
| New content | New reviewed IDs/ruleset versions, original licensed art, safe quote prefix | Replace old saved rates or accept overflowed prices |
| New NPC army metadata | NPC-only saved contingent table/manifest bound to registered new IDs | Globally reopen human militia recruitment or add hidden damage bonuses |
| 450 new identities | Separately owner-approved typed manifest append, tested on isolated recovery copy | Rerun `provisionBots`, private-alpha initialization or a broad upsert/reset |
| Future clans | Add audited consent/membership intervals later; UUID-based historical evidence | Rewrite personal army links or infer past affiliation from current names |

### Progression epochs and rolling deployment

A separate table is preferable to adding a column to every old character: the current restored-copy checker compares full `row_to_json` business rows. Even an added default column changes those hashes. Use a metadata table keyed by character UUID with approved policy ID, frozen current level/requirement and next-level activation boundary. Populate it lazily under the existing character lock or backfill **only the new table**, using an explicit safe cutover. Existing `attained_level`, `xp`, `level_xp` and award rows remain byte-identical during migration.

Existing level-100/105/etc. accounts are not demoted because fresh players would need more cumulative XP under the new curve. Preserve their current attained level and progress, complete the grandfathered current transition under its frozen requirement, then apply the approved policy to future levels. Never manufacture enough lifetime XP to make old entitlements match a new cumulative threshold. Old successful commands replay their saved receipt, not another XP grant/refill.

Centralize requirement lookup for server progression, state/header/tutorial progress and reports. Keep the existing combat-XP budget helper on the legacy curve unless a **separate reward change** is approved; +150 is a level-up pacing proposal, not a backdoor bot-XP increase. Skill points and all resource recovery remain as implemented.

Do not activate this while a pre-compatibility binary can grant XP or reject the new item IDs. First ship readers/definitions/epoch support with the legacy policy active. After old workers drain, a separately approved activation can use a new immutable activation ruleset in the existing append-only rules registry, read consistently by every supported binary/transaction. Activation and lazy epoch creation must be serialized with character commands; mixed-version/racing legacy grants and receipt replay need explicit tests. A failed later launch may leave the compatible prior binary serving the approved activation, so rollback behavior must be deliberately tested. If this cannot be proved with the platform's rolling cutover, require an owner-approved write-drain maintenance procedure; do not solve it by bypassing signed pre-deploy authorization.

### Owned equipment and old quests

Automatic combat selection already does not filter owned gear by unlock level. Preserve that. Future purchasing uses an explicit versioned unlock resolver for the seven moved IDs, while existing ownership remains valid at any level. Keep the original names/art and all paid costs; the mirror items are new ordinary IDs, not transformations of old lots.

The old quest prerequisite must accept the reviewed classic/mirror pair. Compute missing amounts from actual saved quantities, resolve the cheapest reachable exact equivalent on the server, and keep quote/fingerprint/idempotency behavior. Old completed progress/loot/receipts remain; no compulsory repeat purchases. Historical records use saved equipment snapshots and original ruleset/labels; missing legacy details stay unknown, not invented from current inventory. Update all purchase/quest-equipment/Profile/battle art paths through established shared mappings, preserving full bleed.

### Catalog-derived achievements and existing onboarding

`experienceRules` currently derives the `content-summit` achievement from `alpha.content.maxContentLevel`, while its installed identity remains `player-experience-1`. Raising active content to 100 without separating that dependency would change an immutable definition/hash and relabel an already-earned level-50 award. Freeze the legacy definition at its actual level-50 meaning, keep its ID/earned rows, and add a separately versioned expansion achievement with a **new** level-100 ID. No extra gold/XP/skill-point reward is assumed in this study.

Preserve the eight existing tutorial lesson IDs, cursor, skipped/completed/replay state and 5.1C Calling integration. Do not casually change the tutorial ruleset identity when adding expansion achievements. Separate achievement extensions from the persistent guide's unchanged rules. Update active content/horizon/help data to 100 without rewriting old earned descriptions, historical catalogs or installed hashes. This is a mandatory compatibility test, not a cosmetic afterthought.

### Additive schema and strict verification heads

Future migration names/numbers are assigned only after inspecting then-current production. Do **not** install an illustrative 023 file now. Ordinary catalog/capacity/epoch/schema work must preserve every old business row and remain replay-idempotent. New tables and widened constraints can do that; rewriting old character/bot rows cannot.

At each future candidate, advance the strict schema pin to the **one exact reviewed head**, with valid/current and stale/next/missing/commit/bot/restoration rejection tests. Current E1 stays pinned to 022 and exactly 450 bots. Do not broaden the checker to accept ranges or tolerate drift.

### Why population growth is a separate protected operation

Today's `deployment/check-upgrade.mjs` requires unchanged old business tables; only migration/rules registries may append. Adding accounts, characters, wallets, inventory or holdings is not a schema-only change. Both population guards and post-deploy report validation require 450. Therefore adding 450 rows through an ordinary migration or changing an assertion to “≥450” would violate preservation, not solve it.

A future exact-manifest design must be separately reviewed/authorized before implementation:

1. Freeze the candidate and new-only manifest (450 exact UUIDs/account mappings, keys, definitions, saved quantities/rates, bounded capital journals, expected before/after counts, activation policy). Reject any collision with an old account/key/UUID; names/attained levels are not identity.
2. Export/retain/independently verify a fresh encrypted source backup through the established chain. Restore only to the independent cluster.
3. Run ordinary additive migrations and their unchanged strict old-row checker/replay first. Separately rehearse the typed append on that copy; verify old rows unchanged, only exact allowlisted new rows/relationships/capital added, and a retry does nothing. No arbitrary SQL payload or generic administration endpoint.
4. Bind the exact manifest digest, candidate, source/restore identities, recovered ciphertext, expected 450-before/900-after population and expiry into a separately reviewed owner authorization/proof version. A successful population report must not substitute for encrypted recovery or migration evidence.
5. In live execution, a scoped typed transaction/advisory cutover lock may insert only authorized new identities/capital. Use a repeatable snapshot to distinguish this transaction's old-row changes from concurrent legitimate player actions; verify all existing rows are unmodified by the operation. Partial batches/retries must compare the exact manifest-owned rows and journals, not credit the same capital twice. Never lock out/overwrite unrelated human progress.
6. Verify exact expected UUID set/count and the reviewed active-cohort profile, independent recovery and post-deploy health. Use a 900-aware compatibility/forward-fix path if later checks fail; retain all legitimate history. No automatic broad rollback/deletion or rerunning initial realm setup.

This is a required future approval/design boundary, **not code in E1 or permission to relax the current protocol**. Keep operator PR #13, Android PR #20 and retention PR #25 independent. New-cohort provisioning and autonomy activation are distinct authorizations; old autonomous behavior must remain stable across the reviewed boundary.

## Required implementation verification matrix

- Populated 022 fixture with all 450 old UUIDs, humans including Development Knight, real sessions, receipts, current/inactive tutorials, notifications, inventories, mixed historic Land lots, maintenance, bounties and durable battle/rivalry/champion rows. Byte/hash compare every old row; replay; injected rollback faults.
- Current/new/grandfathered levels and in-level XP, including old >100 characters; large awards, late concurrent grants, boundary level-up/refills, multi-session/server restart and mixed-version activation. No double awards or level recomputation.
- Every old/mirror item singly/mixed/partially owned; old receipts and no-JS quotes; unlock enforcement on new purchases; FIFO sale returns original cost; stock/transaction limits; concurrent buy/sell/attack/settlement; no client-authoritative price or substitutions.
- 1/100/250/375/500/1,000/2,500 actual participants, incomplete gear, both directional sets, paused/free gear, retained militia/legacy floors, empty/tiny rosters and paged Army counts. No million-object equipment expansion.
- Level 1–100 paced sessions plus 200/500 numeric stress, finite shared opponents, bot loss/win/loot/XP budgets, Health/Stamina, downtime, no-target intervals and independent gold/resource reconciliation.
- New-only 900-copy rehearsal: exclusion of all bots from Hall/personal human feeds, no fabricated unread events, wrong UUID/key/account/version, existing row touched, insufficient/duplicate capital, collisions, interrupted batches, two workers, missed slots, policy-version cutover, negative/overflow treasury and exact bot counts.
- Measure 900-copy DB/SQL/pool/lock behavior, paid-lot rows, WAL/backup/restore size/time and storage headroom. Current synthetic slot counts and old 450 benchmarks do not establish production capacity.
- 320/390/430/1024px rendering, keyboard/touch/reduced motion, compact quantity controls, actual selected-quantity displays and all full-bleed art frames/provenance.
- Entire exact-head normal CI, including authentication/CSRF/Origin/IDOR/XSS/idempotency, current gameplay, container/restart, crypto/recovery, strict schema/population and invalid evidence rejection. No protected workflow dispatch during development.

## E1 verification/reproduction

The new research tests validate the unchanged active 101 guard, all three capacity models, owned-use compatibility, mirror equivalence, future quote overflow handling **in the model only**, exact currency/resource/XP arithmetic, finite/no-target cases, fixed-seed replay, synthetic old-450 prefix preservation and current scheduler rejection of 900. The 72 committed simulations have no free resource or money source hidden in their outcomes. Source hashes and JSON/CSV are reproducible using the commands in the master plan. The final draft PR records the exact SHA and one complete final normal CI result; no protected release is run.
