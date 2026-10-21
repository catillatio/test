# Phase 5 — separate conservative activation plan

**Proposed owner procedure only; not executed or authorized.** Release both systems OFF first using [the protected guide](../../PHASE_5_RELEASE.md). `living-bot-economy-1` and `living-bot-duels-1` are frozen; no spending, reward, scheduling or combat changes are proposed. [Readiness and evidence](FINAL_READINESS.md).

## Prerequisites before requesting activation

- An OFF deployment has passed all protected backup, independent restore, artifact, signature, migration, health and post-deployment checks at recorded commit **M**. Owner has observed at least **24 hours** including an hourly payout, normal human gameplay and one ordinary service restart if separately authorized. Do not restart solely for this plan without authorization.
- Confirm the exact existing project/environment/game service and deployed **M**, one replica, private database/volume, valid private-alpha metadata and `ENABLE_DEV_BOTS=1`. Keep existing recruitment/bounty settings unchanged. No unrelated pending Railway changes, unexpected deployments or initialization credentials may remain.
- Have an already authorized private **read-only** observation channel, an owner on watch, Railway CPU/memory/restart/HTTP measurements, and database storage/WAL/backup headroom. The existing `deployment/audit-bots.mjs` can report wealth/Land/upkeep through a trusted owner shell; it does not report duel decisions or configure access. No trusted shell/channel is established by this task. If unavailable, leave activation **on hold** and separately arrange approved least-privilege private observation; do not expose PostgreSQL, activate PR #13, add a public endpoint or repurpose the release worker for arbitrary queries. An owner-controlled isolated restore can support delayed financial audits, but is not live alerting.
- Establish baseline HTTP p95/error rates, pool/lock waits, bot overdue-income age, database bytes/day, settlement row growth and backup duration. Confirm capacity for at least the next **seven days** at the observed/projected rate plus retained backups/WAL; keep a proposed **30% free headroom**. These are recommended operational thresholds, not new code assertions or measured production capacity. The prior 6.69-million-row synthetic month is a warning estimate, not a storage allowance.
- Owner explicitly accepts startup-only controls and protected-redeployment stop latency. No instant kill switch, per-bot whitelist, percentage ramp or dynamic hot toggle exists. Five-candidate scheduling is an activity bound across the existing population, **not** a subset canary. If immediate selective disable is required operationally, do not activate until separately reviewed work supplies it.

## Stages — separate owner authorization at each transition

| Stage | Purchase flag | Duel flag | Suggested observation / advance condition |
|---|---|---|---|
| 0: protected code release | absent/`0` | absent/`0` | ≥24h OFF baseline; ordinary saved income continues, no new autonomous receipts/battles. |
| 1: purchases only | `1` | `0` | Watch first hour continuously; inspect hourly for first day, then keep **72h** before adding duels. Confirm real funded useful purchases, legitimate waits and stable settlement/storage/HTTP behavior. Full population becomes eligible; no forced first purchase. |
| 2: add bounded duels | `1` | `1` | Owner present for first **2h**; inspect each 5-minute slot initially, then every 15–60 minutes for **24h**, then daily for **seven days**. Keep actual limits 2 initiations/day, 4 incoming/day and 1 incoming/hour. Advance only with reconciled journals/resources and acceptable human opponent availability/latency. |
| Hold / disable | `0` for affected system | `0` for affected system | Separate approved protected deployment; disabling both is simplest if the cause is unclear. Continue existing passive Land income/upkeep. Do not turn off development bots or reset holdings to stop autonomy. |

These windows are owner review points, not scheduled jobs or automatic promotions. Losses/waits are valid results; do not increase allowances to make a quiet period appear successful. Do not run further long synthetic studies or later milestones as part of activation.

## Exact configuration/promotion path

For each separately approved transition, record the desired **two flags**, exact code SHA, services, observation baseline and rollback decision. Have the owner review any pending changes. In an **already authenticated trusted owner CLI** using the established Railway v5.70 tool/project-environment token, the existing controller-compatible `variable set --skip-deploys` operation can update only the approved non-secret switches without starting a deployment:

```sh
# Template only: do not run until the owner authorizes the exact transition.
# Use verified immutable IDs, never a guessed service/name or URL/secret.
railway variable set \
  --project '<verified project UUID>' \
  --environment '<verified environment UUID>' \
  --service '<verified game-service UUID>' \
  --skip-deploys \
  'ENABLE_LIVING_BOT_ECONOMY=1' 'ENABLE_LIVING_BOT_COMBAT=0'
```

That example is **Stage 1 only**; Stage 2 sets both to `1`; a full stop sets both to `0`. Do not omit `--skip-deploys`. Updating startup variables alone does **not** change the currently running process. Do not use Railway's Apply/Deploy/Redeploy/Restart controls to apply them. If no trusted CLI path exists, request the minimum authorized operator setup separately rather than falling back to an unguarded UI deployment.

Then follow the existing **Owner approved Railway release** workflow on the approved `release/production` SHA, with exact-commit push CI, a fresh backup/independent restore/artifact chain and explicit protected-owner approval. The workflow can redeploy the same reviewed production SHA with fresh proof when its exact push CI remains valid; a new commit is not required just to change flags. Hold the branch/configuration steady. No workflow input or controller change is introduced. The existing signature binds code/candidate/recovery/service identity, **not these feature switches**; their exact reviewed variable snapshot is an additional owner operational check. Confirm the resulting deployment snapshot and private receipt metrics; `/healthz` alone does not expose flags.

## What to observe and when to stop

Successful tick totals returned by workers are not currently logged/published. Observe existing durable receipts, indexed recent battles and financial journals through the approved private channel; keep output aggregate and time-bounded. Do not dump accounts, sessions, URLs, keys, raw snapshots or credentials. Use read-only transactions with statement/time bounds, and scope by activation timestamp/UUID or existing actor/date indexes; do not repeatedly scan whole financial history. Human play can legitimately change balances/progress concurrently, so attribute movements to their own command IDs rather than expecting a frozen whole live database.

| Metric/source | Expected behavior / proposed stop condition |
|---|---|
| `command_receipts.kind='bot_economy'`, `result.policy='living-bot-economy-1'` | Separate wait/replay from actual Land/equipment decisions; count units/cost/top-up by recent window/actor. ≤5 candidates/slot and ≤2 opportunities/bot/UTC day, one unit/paid decision. Any duplicate charge, unregistered/human actor, reserve-funded purchase or policy-budget violation: **stop**. |
| `battles.result.botDuelPolicyId='living-bot-duels-1'` and `bot_duel` receipts | Both identities must be registered bots; ≤5 candidates/slot, ≤2 initiations/actor/UTC day, ≤4 incoming/target/UTC day and ≥1h between incoming autonomous duels. Match each receipt to one battle. Actual wins/losses/Health/Spirit/XP and 65%/repeat rewards must match authoritative saved results. Any violation, human targeting or bounty/escrow mutation: **stop**. |
| Wallet/maintenance/retained and ordinary acquisition/loot journals | Purchases debit true cost/top-up, Land earns at existing rates, upkeep is charged normally. Each loot debit equals winner credit plus any established overflow-retained accounting. No Vault movement, grant or negative balance. Reconcile scoped transactions; any unexplained currency creation/loss: **stop and preserve evidence**. |
| Saved `income_cycles`, lot cursors, full/partial receipts | Due periods paid once, new Land keeps the shared schedule; missed autonomy slots stay missed. Alert on oldest due bot exceeding **two hourly cycles** or duplicate/overlapping payment ranges. Any duplicate payout: immediate stop/escalation. |
| Equipment/Land distribution, purse/income percentiles, attacking win rate and human target availability | Compare daily with baseline and prior synthetic ranges, including poor/stalled bots and offense-heavy selection. There is no guaranteed purchase/win/gold/XP rate. Owner review before expanding duration if bots become persistently unavailable to humans, growth/upkeep diverges, or farming dominates. Do not grant refills or rebalance on the fly. |
| Runtime/resource metrics and fixed failure logs | Preserve one replica. Pause progression for repeated worker failures (e.g. **3 consecutive slots**), restarts, connection exhaustion, significant lock waits or sustained request regression (proposed **p95 >2× baseline for 15 minutes** / elevated 5xx). Lack of success logs is not proof of a stopped worker; use receipts. |
| Database/WAL/history/export size and recovery duration | Compare actual bytes/day with seven-day capacity/headroom; no retention deletion is authorized. Stop activation/expansion if headroom falls below the agreed bound, storage alarms fire or the protected backup/restore can no longer complete within its existing timeouts. Never raise timeouts or remove backup gates to conceal capacity problems. |

## Safe stop, retries and recovery

A normal stop requires separately approving `0` for the affected flag(s), staging only those variables with `--skip-deploys` and promoting through the unchanged protected flow with fresh backup/proof. **Current workers may continue while that deployment prepares or if it fails**; a failed disable deployment does not stop the old active process. New timers do not start when OFF; on SIGTERM/SIGINT the old process stops scheduling and drains pending transactions. A hard interruption rolls back uncommitted work; persisted receipts prevent committed transactions from repeating. Offline slots are skipped after restart, while legitimate missed Land income still settles. Verify the OFF snapshot and absence of new autonomous receipts across at least two slots after the old process is drained.

There is no promised instant feature-only emergency stop. If urgent harm requires service interruption, use a separately authorized owner incident procedure that accounts for human downtime; do not improvise database edits, disable safety controls or call an expired signed deployment. Keep the observation channel and recovery evidence available.

Completed funded purchases, genuine combat transfers/XP/level-ups and settled income are legitimate durable realm history. Other play may already depend on them. Disabling/reverting cannot safely "undo" them; never delete receipts, edit purses, revert levels, regenerate bots or restore an old realm to erase them. Any confirmed corruption needs a separately reviewed transaction-specific repair or independent recovery plan, not automatic compensation.

**No production configuration, command, monitoring query, restart or activation in this plan has been executed. Pause for final owner review and separate future authorization.**
