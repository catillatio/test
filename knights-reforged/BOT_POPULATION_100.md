# Bot population toward 900 — preservation-first proposal

E1 does not connect to a database, call `provisionBots`, create accounts, seed a realm, change flags or activate autonomy. Baseline `7cf9a3a48284c96afe922b3473cce429339bd7e4`; [population/capital/load model](docs/level100-e1/population.json). `synthetic-existing:*` IDs represent blueprint slots only, **not discovered production UUIDs**.

## What exists

The immutable passive-rivals-5 blueprint covers levels 1–50, three tiers and three variants: 450 original slots. Live bots have persistent UUID/account identity and can legitimately change level, inventory, Land, gold and XP through autonomous work. Therefore current level is **not** a safe seed-slot identity. The old `provisionBots` implementation can match by current attained level/tier/variant and reset equipment/army data during an upgrade path. Do not call or extend that loop to create the expansion.

Reuse unique `development_bots.population_key` and a new reviewed namespace/manifest for additions. Reconcile old records by immutable UUID/population key, never by display name or current attained level. Leave all old accounts, password hashes/login-disabled flags, sessions, balances, acquisitions, memberships, bounties and history unchanged.

## Proposed additions and actual member counts

Exact nine-per-level distribution would add nine at every level 51–100. The recommended prototype instead adds **400** at 51–100 (eight each) and **50** stronger mid-level rivals (five each at 10,15,20,25,30,35,40,45,48,50). This keeps all 450 originals and addresses weak-midgame opponents without rewriting them.

New upper slots: three green, three seasoned, two elite, with the last elite a stronger challenger. Actual members are 20%/45%/60–80% of 5× capacity, equipment coverage 60%/85%/100%, and legal gear lag 12/5/0 levels. These are declared proposal parameters, not hidden NPC damage multipliers. Skill/Health/Stamina allocations fit existing level/milestone budgets; old blueprint exceptions are left untouched. Actual outcomes include losses, not guaranteed human victories.

**Current schema cannot install these armies:** `army_stacks.quantity` is capped at 20. Prefer a small NPC-only initial-contingent table keyed to registered bot UUID and the reviewed manifest, with bounded real quantity, source capital and audit identity. Keep human militia 0–20 and player recruitment rules unchanged. Count these actual saved NPC members in the shared participant/equipment path; do not turn capacity into members or a power multiplier. The cohort resolver must explicitly distinguish legacy 10-member projections from the new saved contingent, consistently in public profiles, bot purchases and combat. This dependency is not implemented here.

No bot-initiated human attacks, social spam, bounty sponsorship/claim powers, free instant healing or on-profile wallet refill. New NPCs need finite approved authored starting assets; subsequent income/upkeep and acquisitions use the ordinary saved economy.

## Eligibility from finite starting snapshots

| Player level | Current blueprint rivals | Proposed rivals |
|---|---|---|
| 1 | 27 | 27 |
| 10 | 45 | 50 |
| 25 | 90 | 100 |
| 50 | 90 | 185 |
| 75 | 0 | 232 |
| 100 | 0 | 144 |
| 200 | 0 | 0 |
| 500 | 0 | 0 |


These counts precede Health depletion, visibility, competition and future level drift. Static level-50 originals stop providing eligible rivals at player 61; a level-100 catalog still does not provide rivals forever at 200/500. Future compatibility is not a claim that those populations/content already exist.

## Capitalization, income and storage — real decision gate

| Fixture | Initial paid lots | Nominal 30d hourly lot rows | Property net/h | Equipment upkeep/h | Surplus/h | Held cash/Vault/reserves |
|---|---|---|---|---|---|---|
| 450 blueprint reference | 3,603 | 2,594,160 | 3,409,887 | 126,082 | 3,283,805 | 129996616 |
| 900 prototype | 8,243 | 5,934,960 | 38,477,432 | 11,859,085 | 26,618,347 | 1652559508 |


The new 450 prototype accounts add **1,522,562,892** held currency and **8,658,396,919** of Land/equipment investment. Total initial authorization would exceed **10 billion Gold-equivalent** across the cohort. It is finite, explicit synthetic setup, **not money earned by old bots or approval to mint it in production**. Per-account purses remain within the existing treasury cap; global totals need not fit one wallet.

Do not label this fiscal setup a routine seed. The owner must approve/revise its budget and estate design before E3. Lowering every army or disabling upkeep would undermine the combat study; simply granting old bots money would violate preservation. If that capitalization is rejected, rerun the exact lower-capital population alternatives before implementation rather than quietly retaining these progression claims.

New estates deliberately minimize paid-lot count by buying the largest unlocked ordinary property, not hundreds of cheapest low-tier lots. The observed maximum new estate is **37 paid units**. Every progressive unit still has its real distinct acquisition price. No financial history is aggregated/deleted. Human portfolio comparisons intentionally use a different, greedy marginal-ROI strategy.

The nominal row estimate assumes normal hourly uptime: one receipt per active paid lot/hour. Offline `interval_count` batching can reduce it; new acquisitions increase it. At an extreme two Land purchases per bot/day, 900 bots could add 54,000 lots/month (a logical upper bound, not a forecast), greatly increasing later writes. Reuse [Phase 5 measured settlement work](docs/phase5/milestone1/SETTLEMENT_REVIEW.md) and the [30-day economy evidence](docs/phase5/milestone1/LONG_TERM_REVIEW.md): the original quiet 450-bot run already produced about 6.69 million settlement rows/month after purchases. Current production bytes/free space/WAL were **not inspected**. No DB byte/latency guarantee follows from these row counts. Storage capacity, backup size and restore duration must be tested on a separate populated mirror before 900 activation; PR #25/retention and all live cleanup remain independent.

New rent is not automatically human income. Ordinary bot loot is still min(actual 3% exposed purse, 3,000) before repeat taper and real Health/Stamina constraints. The large new surplus can saturate NPC treasuries and flatten reward differences between upper bots at that cap. Review the macroeconomy explicitly; no new reward multiplier, daily cutoff or stealth refill is introduced.

## Autonomous buying and development

Current `living-bot-economy-1`: one unit/opportunity, up to two scheduled opportunities/day, 5% purse budget, 5,000 hard cost cap, two hours of surplus-income budget, four hours of upkeep liquidity, ≥90% purse retained, ≤35% property income spent on upkeep, ≤2% per-purchase income growth, deterministic saving/choice rules. All 36 upper-item prices exceed 5,000, so **no amount of saving can purchase them through the current policy**. Even the existing top items already cross that cap.

A future version may use a reviewed level-aware cost budget while retaining true purse funding, liquidity, upkeep and idempotency protections. It requires a separate table of affordable targets and long-term tests; E1 does not authorize larger allowances. Two single-copy purchases/day also take years to replace thousands of copies: do not promise rapid fleet-wide equipment growth. Ensure some bots remain easier, comparable and challenging through authored initial diversity and legitimate later purchases, not resets of the old population.

## Scheduler and workload model

Current purchase and duel schedulers both reject >450 candidates. Simply inserting new bots would stop them. The income sweeper processes 25×18 =450 due bots/call; 900 can be caught up in two existing one-minute invocations, with cursor/lock rechecks retained. No second income clock is needed.

The following is **one deterministic synthetic ID distribution**, not production UUIDs or a latency benchmark. Both schedules nominate each bot twice/day over 144 fixed slots; the cap drops excess nominations. Purchase opportunities may legitimately become wait decisions; duel eligibility/Health/pressure reduce actual battles further.

| Population | Max candidates/tick | Nominal nominations/day | Selected | Missed | No opportunity that day | Population rows read/day, two workers types |
|---|---|---|---|---|---|---|
| 450 | 5 | 900 | 848 | 52 | 5 | 259,200 |
| 450 | 10 | 900 | 900 | 0 | 0 | 259,200 |
| 450 | 12 | 900 | 900 | 0 | 0 | 259,200 |
| 900 | 5 | 1,800 | 1,302 | 498 | 105 | 518,400 |
| 900 | 10 | 1,800 | 1,776 | 24 | 3 | 518,400 |
| 900 | 12 | 1,800 | 1,792 | 8 | 1 | 518,400 |


Recommend benchmarking a **10-candidate** 900-policy first: it loses 24/1,800 nominations in this fixture versus 498 with five. Twelve reduces that to eight, but costs a larger bounded transaction burst. Keep 144 slots, missed-slot semantics, per-bot initiation/incoming caps and one-replica conservative operation. Never change policy/version salts in the middle of an uncoordinated slot: old and new receipt IDs differ. Use an explicit activation boundary and drain prior work; retain all receipts and deterministic locks. Three workers may invoke the same selected command three times, but must commit it once; the model reports unique intents versus duplicate invocations, **not a new PostgreSQL concurrency benchmark**. Existing actual concurrency/restart regressions remain in full CI.

Query work stays bounded: candidate metadata at most 900, at most ten selected actors; no N² full-history scans or unbounded random ordering. Retain relevant `(actor,target,time)`/receipt and income-cycle indexes. Profile/army pages need aggregate counts plus bounded roster lists so larger armies do not force thousands of HTML rows. Measure SQL, pool/lock latency, rows/WAL/day and independent recovery on a real disposable 900-copy fixture in E3. No operational feature flag, batch size or live service is changed by E1.

## Exact addition and rollback

New-only manifest keys, UUIDs, names, initial levels, saved members, skill budgets, inventory lots/paid costs, Land units/rates/costs, finite capital entries and expected counts must be frozen and signed/reviewed. Unique-key collisions, changed existing rows, mismatched accounts, partial capital or unexpected counters fail closed. Idempotent retries verify exact existing planned rows and never credit money twice. Do not rerun private-alpha initialization or infer a missing bot from an attained-level gap.

Current release checks require exactly 450 bots and unchanged business tables. A normal schema migration cannot add 450 account/wallet rows and honestly satisfy that contract. A future separately approved **typed, exact-manifest population extension** must first rehearse the append on the isolated restored copy, verify every old row unchanged and only whitelisted new identities/capital appended, then bind that plan and exact 450→900 expectations into owner authorization. Keep the ordinary migration preservation checker strict; never replace it with “count increased, looks fine.” No such extension is written in E1.

After additions have participated in gameplay, rollback must use a 900-aware compatibility build or a reviewed forward fix; deleting new bots/restoring an old realm would erase legitimate subsequent human history. Autonomous cohort activation is separate from registering accounts. Preserve old bot behavior while keeping new work inactive until the reviewed cutover, or use another explicitly approved activation plan. Do not assume current 450-count binaries are safe rollback targets.
