# Bot-only calibration — owner review checkpoint

**Historical comparison, superseded:** [owner comment 6305978770](https://github.com/catillatio/test/pull/14#issuecomment-6305978770) selects a conservative small canary without broad liquidation/point spending. The current work is [the 18-slot canary proposal](../canary/REVIEW.md), with five paid additions and 13 controls. Do not treat this older population-wide experiment or its recommendation as current rollout scope or authorization.

This carries out [owner comment 6305431189](https://github.com/catillatio/test/pull/14#issuecomment-6305431189). **No bot balance policy is adopted.** The candidate and transaction prototype exist only in offline/test scripts. The approved report/audio implementation remains byte-identical to `a21b2b0`; no runtime, catalog, ruleset, migration, release, or operator file changes in this checkpoint.

The owner rejected uncapped-linear and logarithmic human armies. Neither is implemented. Original human participation, recruitment, combat, bounties, finite gold transfers, `bot-combat-rewards-2` with 65% XP, and 100/85/70/55/40 pair reductions remain authoritative. PR #14 stays draft; PR #13 stays paused. No live account, bot, or service was inspected or modified.

## Recommendation and decisions

Use this as a **funded, fixed-loadout experiment**, not a release-ready realm adjustment. Keep existing bot members and all human rules unchanged. Compare equipment-only with equipment plus **already available earned defense points**; the second is the numerical candidate reported below. It lowers overpowered ordinary elite encounters while making under-equipped green opponents somewhat stronger.

The point-spending alternative is **not necessary to obtain the overall difficulty mix**. Gear-only versus earned-points averages are seasoned 90.5%/90.3% and elite 51.8%/52.0% attacker wins. Gear-only plans 398 changes, costs 2,183,452, returns 4,543,310 through real sales and spends no skill points; earned-points plans 405 changes, costs 2,278,677, returns 4,726,818 and spends 821. Given that small mean difference, prefer gear-only for a separately approved first canary if avoiding irreversible point allocation is the priority. The actual restored-copy transaction rehearsal below exercises the earned-points version, including all skill-allocation safety checks; a selected gear-only live manifest would need its own authorized copy rehearsal. Both remain unadopted.

Before adoption, the owner must review three real effects:

1. Ordinary-army elite win rates improve, but equipped 21/101-member humans still dominate these small bot armies. Very under-equipped one-member players cannot expect same-level wins at high levels. No fixed bot set can provide the same challenge to all three without a separately reviewed member/content change or dynamic matching, which is excluded here.
2. Normal FIFO sales liquidate surplus equipment. Across the 450 stock fixtures, purchase costs are **2,278,677**, sale proceeds **4,726,818**: **2,448,141 net gold moves from existing equipment into exposed purses**, before 29 total maintenance top-ups (**2,448,112 actual purse increase**). This is a one-time asset sale, not a grant or refill, but it materially changes available loot and must not be hidden as “balances unchanged.”
3. Gear changes reduce aggregate equipment upkeep by **38,697/hour**. Unchanged estates therefore project **3,283,805 → 3,322,502 net/hour**. Existing Land prices, rates, quantities and schedules are untouched. Reduced upkeep is an ongoing economic consequence, not an increased Land rate.

No production rollout mechanism is activated or added. Any adoption needs separate policy and exact financial-effect approval, a legitimate private operator channel, and a fresh restored-copy rehearsal using authorized saved snapshots. The approved report/audio changes can be released independently without adopting or invoking these scripts.

## Participation, storage and acquisition audit

| Path | Existing behavior | Checkpoint decision |
|---|---|---|
| Human active army | `min(101,max(1+2×level,legacy_floor))`, then limited to actual self + militia + accepted allies | Unchanged, including recruitment value |
| Bot runtime | `stateFrom()` clamps militia to 9, participation/capacity/total to 10 and excludes social allies | Unchanged |
| Saved militia | `army_stacks.quantity` is 0–20; legacy floor 1–101 | Unchanged; a cap setting cannot create real members |
| Equipment selection | One owned weapon, armor and spell per participant; selector validates 1–101 and chooses actual best eligible copies | Unchanged; all owned upkeep remains payable |
| Current provisioning | Capacity `min(10,1+floor(level/5),level_capacity)`, multiplied by tier 40/70/100%, rounded, minimum 1 | **Never rerun on an existing realm** |
| Level 15 actual participants | Green 2, seasoned 3, elite 4 | Same before/after |
| Training | Actual saved attack/defense rating, maximum 25; unspent skill points allocated with the existing transactional helper | No fabricated points or attack-training changes |
| Paid gear | Current item catalog/level eligibility, ownership limits, FIFO paid lots, normal purchase/resale journals | Real costs and receipts; no gear grants |

Sources: `src/game.ts:stateFrom`, `src/alpha-rules.ts:activeArmy/selectEquipment`, `src/development.ts:botBlueprint/provisionBots`, `src/inventory.ts`, `src/progression.ts`, migrations 001/003 and current rulesets. In particular, raising only a bot cap would not add members; this checkpoint does not change it or reinterpret stored army relationships.

## Deterministic candidate

`bot-calibration-candidate-1` is an **unregistered experimental identifier**, not a new active reward or combat ruleset.

For each saved bot, search finite legal weapon/armor/spell choices at the current level and lags 2/5, plus eligible already-owned types. Quantities are zero, one, or 40/60/80/100% of the bot's **existing** participants, rounded up. Compare gear-only with spending 0…available earned defense points, stopping at the original training 25 limit. Calling, level, attack training, army and resources do not change.

The fixed ordinary benchmark uses `round(70% × min(10,1+floor(level/5)))` real members (minimum 1), approximately 80% equipment coverage, level −2 catalog and `floor(level/6)` training. Its purpose is to choose a saved loadout once, not to inspect/match an attacking player. Target defense/benchmark-attack ratios by variant are:

| Family | Variant 0 | Variant 1 | Variant 2 | Suggested future label |
|---|---:|---:|---:|---|
| Green | .55 | .62 | .70 | Lightly equipped |
| Seasoned | .80 | .88 | .94 | Seasoned |
| Elite | .96 | 1.00 | 1.04 | Veteran — inspect army/equipment |

These ratios guide inventory search; **they are never applied as combat multipliers**. Real integer item choices, Calling and existing training can prevent an exact target. A label is an equipment family, not a personalized win prediction. Label/UI changes are proposed only; existing approved views are untouched.

Financial constraints: no Vault withdrawal, extra Land, borrowed capital, wallet refill or member grant; keep at least 75% of the original exposed purse and two upkeep hours affordable; gear upkeep ≤35% of property net. Real FIFO sale proceeds may fund real purchases. Paused gear is not automatically rescued; stale/unfunded plans must be reviewed again. Changes with less than max(1 defense,2% benchmark attack) improvement remain unchanged.

**Maintenance-credit finding:** ordinary `refreshMaintenance()` returns stored credit over one hour to the purse when repricing. Provisioned bots can still hold legacy 48-hour credit, whose original funding provenance is not established by this inspection. The prototype therefore keeps all such credit reserved, updates the actual gear rate, records the rate event and uses the normal funding/billing helpers. **Zero credit becomes spendable gold.** This is explicit experimental bot-only repricing; the runtime human helper is unchanged. A future adoption must approve this exact treatment rather than silently calling the generic refund path.

Stock-fixture outcome: **405 planned, 45 unchanged, 0 deferred**, **821 existing points** spent, no members added, no bank withdrawals, no capital grants. Actual live plans may defer after loot, prior spending, arrears, expired quotes or different lots; this report is not a claim about live wallets.

## Before/after outcomes

All 441 independent −10…+10 roll pairs per matchup are enumerated, including defender-winning ties. These are conditional matchup probabilities, not guaranteed outcomes. The full comparison has **3,600 rows**:450 saved fixtures × gear-only/earned-points × starter/ordinary/established/large humans.

Ordinary-army **elite** attacker win rates, variant 0/1/2:

| Level | Before % | Candidate % |
|---:|---|---|
|8|0 /0 /0|68.3 /52.4 /34.7|
|15|0 /0 /0|68.0 /47.6 /33.1|
|17|0.2 /6.8 /6.8|68.9 /47.6 /32.7|
|25|0 /0 /0|67.6 /52.4 /33.3|
|40|0 /0 /0|67.6 /52.2 /33.6|
|50|0 /0 /0|67.8 /47.6 /33.3|

Across all 150 level/variant matchups per family, ordinary benchmark averages are green 100%, seasoned 90.3%, elite 52.0%. The latter includes early catalog limitations. At level 1 all bots have one real member and limited owned gear: elite variants still yield 93.2/99.8/99.8% wins for the equipped benchmark. **This experiment does not provide truly challenging elites at levels 1–2** (level 2 elite average remains 95.3%). Fabricating members/points/stats to claim full coverage would violate the owner's constraints.

The “starter” deliberately retains one member and level 1 gear at every tested level: it measures severe under-equipment, not an expected healthy level 50 build. It cannot beat most high-level bots. Static established fixtures have up to 21 real equipped members; large fixtures up to 101. Both win100% of these bot matchups, preserving their legitimate investment advantage. Ordinary green wins and established weak-opponent1-XP outcomes can therefore remain common; no reward formula is changed to conceal that.

- [Every level 1–50, including gear-only comparison](PER_LEVEL.md)
- [Representative profiles, defense, win rates, XP, upkeep and net income](MATCHUPS.md)
- [Real purchase/sale costs, purses, first-win loot and net income](FINANCES.md)
- [All matchup rows](matchups.csv) · [450 before/after plans and assumptions](candidate.json)

Example: level 15 elite/0 spends 720, sells 2,904 of real paid gear, retains 4 members and spends one existing defense point. Carried gold7,540→9,724; defense366.11→238.12; equipment upkeep92→47/hour; net555→600/hour. First-win loot remains limited by the unchanged formula/ceiling. XP per eligible ordinary-benchmark win falls26→19 because the fight is easier; improving win rate does **not** manufacture extra XP.

## Pacing, farming and future stress

[64 paced sessions](SESSIONS.md), with [complete data](sessions.json), compare 1/2/6 hours at levels8/17/25/40/50 for natural and equipped10-member fixtures, plus six-hour same-bot pressure from one/ten accounts. Existing Spirit/Health regeneration, defeats, defender knockouts, paid healing, level-up refills,65% XP and pair reductions remain in the accepted simulator. Each session asserts finite-purse conservation and unchanged Vaults; a sale's initial cash conversion is not misreported as passive gold generated during play.

Two-hour natural examples:

|Start|Wins/losses before → after|Loot before → after|XP before → after|Final level before → after|
|---:|---|---|---|---|
|8|67/2 →59/10|5,883 →5,702|112 →95|8 →8|
|17|59/15 →63/11|14,532 →15,902|1,312 →1,545|19 →19|
|25|51/23 →45/29|27,393 →26,516|2,238 →2,565|27 →27|
|40|47/27 →54/23|83,966 →106,472|3,761 →5,895|42 →43|
|50|62/9 →63/9|143,243 →153,051|3,795 →3,976|51 →51|

The same-bot six-hour candidate produces13,464 ordinary gold/1,035XP for one player,13,847/1,126 total for ten sequential attackers. Health blocks3,472/35,872 attempts; attackers cannot steal independent copies of a purse. Ten-account results are an adversarial sequential-pressure model, not fair concurrent scheduling. Actual PostgreSQL locks/concurrent retries are tested separately. The existing40% repeat floor remains provisional alpha policy; no new limit is proposed here.

There are [30 additional level 100/200 mechanical cases](STRESS.md), owned armies1/10/21/101/1000, all tiers. Human participation still clamps to 101; real equipment catalog stops at 50, and bot members remain those of the saved level 50 fixture. Hypothetical same-level base-stat stress is explicitly separated from actual encounter eligibility: current level 50 bots are ineligible, so real XP/gold forecast is **null**. This does not certify future content balance or introduce level 100/200 gear/NPCs.

## Populated restored-copy rehearsal and transaction safety

[Machine-readable copy verification](copy-verification.json) records an actual custom-format `pg_dump`, SHA-256 and `pg_restore` into a **different new local disposable database**, not merely a schema clone. All 66 source tables, 452 accounts and450 bots match before/after two no-op migrations. The source fixture then remains unchanged throughout the experiment. All humans, trades, battles, sessions, tutorials and bot identities are synthetic; no production snapshot was available or accessed.

The local prototype:

- Requires explicit test consent, non-production mode, a loopback `_test` target and a dedicated `fixture_<uuid>` schema; rejects invalid targets before connecting where possible. It has no CLI, public endpoint, startup or runtime import and is **not a production authorization mechanism**.
- Re-reads the exact active disabled-login NPC identity, saved paid lots and maintenance state; hashes the reviewed snapshot/plan and recomputes the deterministic plan. Acquires the same character locks as combat. Battles, changed balances/Health/state version, quote expiry or unpaid finances invalidate the plan.
- Uses existing FIFO sales, purchases and skill-allocation helpers in one transaction. It journals actual rate changes, preserves credit and verifies final inventory, points, purse, reserve, membership and Vault before committing an audit receipt containing before/after, plan and child transaction IDs.
- Applies once per bot/candidate, including concurrent same-key/different-key retries. Unexpected receipt kind, policy or intent fails closed. An injected failure after real trades/point allocation proves complete rollback, with all 66 tables unchanged.
- Replays a real ordinary battle before a stale application attempt, verifies an actual attacker victory, then rejects that stale plan. Preserves original militia 20 and selector 101 database/runtime limits.
- Preserves every prior financial/combat receipt and all original identity/account/session/Vault/Land/army/achievement/tutorial rows. Bot gear and earned defense allocation are the deliberate candidate changes. Three hours of normal bot income/upkeep settle once; immediate repeated settlement changes no row or Vault.

No new migration is required for the **local test**. Its receipt is evidence, not a hardened production operator/audit API. A future adopted implementation should add separately reviewed unique(bot,policy-version) audit support and scoped execution authorization; existing command receipts are not being advertised as privileged immutable administration logs. No such schema or role is installed by this PR.

## Proposed safe adoption order — not authorized or executed

1. Owner selects/revises the candidate, including the liquidation and reserved-credit effects and the limited challenge for large armies/level 1. Do not adopt the archived human models.
2. Establish an authorized private operator channel separately; do not repurpose the release worker or resume PR #13 without authorization. Obtain scoped read-only snapshots of existing IDs, lots, membership, finances and entitlements, not a realm regeneration.
3. Use the unchanged protected backup/independent restore process. Rehearse on a restored copy of authorized actual data and produce an exact-ID manifest, real affordability/deferred list and signed off before/after effects. Review any additive audit/execution change separately.
4. Under character locks, settle only ordinary due income/upkeep, re-preview/reapprove stale finances, then run reviewed normal paid transactions. Never use initialization/provisionBots, replace identities, grant gear/points, withdraw Vaults or refund legacy credit into capital. Start with a separately approved small canary and inspect receipts before continuing/resuming.
5. Interrupted transactions roll back; completed exact receipts replay. Stop on any identity/state mismatch. Rollback means halting further calibration and reviewing compensating trades/point corrections against the audit; **never reset wallets, overwrite subsequent player activity or restore a whole realm over new progress**.

The approved report/audio work remains independently reviewable in [the original screenshots](../README.md). No visual or audio bytes changed for this checkpoint. Phone navigation-honk verification is still pending and its live origin remains unconfirmed.

## Local reproduction

Use only a new disposable **local** `_test` database. From `knights-reforged/`, with that local test connection securely set in `TEST_DATABASE_URL`:

```sh
npm run typecheck
npm test
npm run build
npm run check:static
npx tsx scripts/phase491-bot-calibration.ts
```

The dump/restore rehearsal additionally requires a dedicated local PostgreSQL 18 container named `kingdom-bot-calibration-test`, `TEST_POSTGRES_CONTAINER` set to that name and the connection pointing to its disposable test database:

```sh
npx tsx scripts/phase491-bot-copy-test.ts
npx tsx scripts/browser-phase491-audio.ts
```

It creates/drops only its randomly named synthetic copy and fixture. These are developer test instructions, not production operator commands. Actionlint validates existing workflows without edits. See the separate checkpoint evidence for exact validation outcomes; automated success is not policy approval or a claim about live realm safety.
