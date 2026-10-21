# Phase 5 required follow-ups

| Item | Status and evidence | Next acceptance boundary |
|---|---|---|
| Sparse wallet-funded Land/equipment decisions | Provisionally approved `living-bot-economy-1`; [7/30-day review](milestone1/LONG_TERM_REVIEW.md). Policy and production default OFF unchanged. | Approved development baseline; [final readiness](FINAL_READINESS.md) and separate [activation plan](ACTIVATION_PLAN.md) under owner review. No activation authorized. |
| Land settlement SQL amplification | Approved development checkpoint: batched per-lot writes; [checkpoint](milestone1/SETTLEMENT_REVIEW.md). No receipt aggregation/deletion, migration or payout change. | Differential financial/receipt equality, bounded batches, rollback/retry/restart/concurrency and human/450-bot preservation. Durable history growth remains an operational limitation. |
| Low-level affordability stalls | **Open, intentionally unchanged.** Three starter Smallholdings yield 21/hour, while the next copy can exceed the two-hour income budget despite cash savings. | Separate reviewed policy proposal before changing allowances/eligibility. Do not hide the stall with grants or increased spending. |
| Offense-heavy equipment selection | **Open, intentionally unchanged.** Day-30 level-40 example: selected attack 678→932, defense 1062→1062. [Review](milestone1/LONG_TERM_REVIEW.md). | Evaluate real bot duels before proposing a new selector policy; preserve actual paid inventory/upkeep and existing combat balance. |
| Genuine bot-versus-bot combat | Approved development baseline at `3eadf35`, default OFF; [Milestone 2 review](milestone2/REVIEW.md). Current player command still rejects bot actors. | Final release review, exact-head CI and separately approved staged activation/operational monitoring. No bot-human attacks. |
| Later Issue #15 milestones | Not started. Bot-human aggression, login rewards, visual/social follow-ups remain later design backlog. | Separate authorization. No implementation/activation is implied by Milestone 1 approval. |

No production records, settings or services are inspected or modified by this work. Keep PR #16 draft and PR #13 paused. No merge, deployment, protected workflow dispatch or Railway configuration change is authorized.
