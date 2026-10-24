# Army scaling study — current, historical 5× and contingency

Research baseline `7cf9a3a48284c96afe922b3473cce429339bd7e4`; no army formula, cap, recruitment command or saved army changes. Original 5× evidence is owner-confirmed, not a claim that current reconstructed code already implements it.

## Actual implementation

`src/alpha-rules.ts::activeArmy` uses `capacity = min(101, max(1 + 2×level, legacyFloor))`; `participants = min(capacity, 1 + militia + acceptedAllies)`. The leader is one slot. Current bot projections separately clamp to 10 in `game.ts`, `bot-economy.ts` and the bot catalog. Raising only `alpha.limits.participants` would leave the 2× formula and multiple bot-specific clamps intact.

`selectEquipment` chooses at most one weapon, armor and spell **per participating slot**, independently for attack and defense. It ranks the relevant stat, other stat, lower upkeep, then stable item ID. It uses actual quantities; 500 participants can use 1,500 total copies, but owning 3,000 offensive/defensive copies is valid. All owned upkeep copies, including unused spares, are charged. Zero-upkeep gear remains usable during suspension.

## Capacity and actual-member comparison

The contingency is **uncapped `1 + 2×level`**, not logarithmic equipment support. It tests the genuine recruitment/capital bottleneck while preserving a familiar growth rate. It is not recommended over 5× if the funding/recruitment requirements are accepted.

| Level | Current 101 ceiling | Historical 5× | Uncapped 2×+1 | 5×: 20 allies | 5×: 20 militia + 50 allies | Full gear copies used | Outbound days to fill 5× |
|---|---|---|---|---|---|---|---|
| 1 | 3 | 5 | 3 | 5 | 5 | 15 | 1 |
| 10 | 21 | 50 | 21 | 21 | 50 | 150 | 3 |
| 25 | 51 | 125 | 51 | 21 | 71 | 375 | 7 |
| 50 | 101 | 250 | 101 | 21 | 71 | 750 | 13 |
| 75 | 101 | 375 | 151 | 21 | 71 | 1,125 | 19 |
| 100 | 101 | 500 | 201 | 21 | 71 | 1,500 | 25 |
| 200 | 101 | 1,000 | 401 | 21 | 71 | 3,000 | 50 |
| 500 | 101 | 2,500 | 1,001 | 21 | 71 | 7,500 | 125 |


The last column is an invitation-days lower bound, not guaranteed consent: `ceil((capacity−1)/20)`. Current code permits 20 outgoing invitations in a rolling day, 30 seconds apart and 24 hours before reinviting a pair. Incoming accepted requests can accelerate growth; they are not guaranteed. Enabled development-rival invitations auto-accept, human invitations require consent. No gold militia recruitment exists. Current retained militia are preserved, not granted to new players.

At level 100, current/5×/contingency capacity is 101/500/201. A fresh player has only one participant until recruitment succeeds. At 21 days, outbound invitations alone permit approximately 420 accepted allies, not 499; at least 79 additional incoming acceptances would be needed to fill all 500 slots. Level 500's 2,500 capacity takes 125 outgoing invitation days. This is a long-term social/economic goal, not a reason to conjure members at each level.

## Recommended model

Future `capacity = max(5×level, existingLegacyFloor)` and `participants = min(capacity, 1 + actual militia + eligible accepted allies)`, with safe-integer validation. Preserve rare grandfathered floors that exceed 5× at a very low level. Do not retain a hidden 101 ceiling or convert capacity directly into owned members. Do not impose a new character-level cap at 100 or 500.

At 50, 5× expands the potential army 101→250; at 100, 101→500. Linear equipment power is intentional: five times the owned/participating gear costs five times the purchase gold and upkeep, while progressive Land acquisition grows faster than linearly. The equipment study supports 500 real participants at 100 without numeric failure; no simulation justifies an arbitrary logarithmic combat modifier. The smaller contingency reduces outfitting/social demand but abandons the strongest confirmed historical rule. Use it only if the owner declines that demand after testing.

## Concrete implementation constraints

| Constraint today | Consequence / future work |
|---|---|
| `selectEquipment` validates participants ≤101 | Change the general numeric guard and capacity resolver together; the offline adapter is not installed code |
| Per-item inventory ≤1,000 in JSON and `003_alpha.sql` | 500 and 1,000 stacks fit; 2,500 do not. Widen the CHECK and versioned limit, e.g. 5,000 per item, without updating a single quantity |
| Equipment transaction ≤100 | Keep it; 500 copies require five purchase commands per item, six sets require 30. Do not make a 500-item atomic price bypass |
| Human `army_stacks.quantity` CHECK 0–20 | Keep this human militia rule. Large new NPC armies need separately audited cohort-contingent metadata, not a global human gold-recruitment reopening |
| Quest army validation ≤21 | Author/gate new quests against actual participant counts; proposed 51–100 quests require 25–94, never the entire 500-capacity army |
| Legacy floor CHECK 1–101 | No new large floor is needed. Keep old values; derive normal future capacity from level |
| Bot caps/blueprints/schedulers assume 10/50/450 | Treat as coordinated future cohort work, not a one-line human-cap patch |

## Computation and display scaling

Selection is O(item types log item types), with integer quantity arithmetic; it must not instantiate one object per soldier. Battle snapshots already store selected item ID/quantity rows, not 1,500 separate icons. Preserve compact rows and the approved assets.

Two practical optimizations are needed before large armies: (1) `readInventory` currently expands up to 100 values **for every FIFO lot before slicing** to 100 resale units; iterate only the required prefix, retaining exact saved-cost ordering. (2) `armyLinks` currently loads the complete roster and derives counts from that array. Introduce authoritative aggregate counts plus bounded roster pagination. Never accidentally compute combat membership from only the displayed page. Preserve the same human/bot visibility predicates and unresolved-invitation counts.

Gold costs use actual quantities and progressive property quotes. Inventory upkeep counts every owned offensive/defensive set. Skills retain the current capped percentage bonuses; high levels need not multiply base stats exponentially. See [numeric results](docs/level100-e1/numeric.json) for levels 1–500 and [equipment results](docs/level100-e1/equipment.json) for actual sets. These are proposal-domain tests; active `selectEquipment(...,500)` still rejects today, as required.
