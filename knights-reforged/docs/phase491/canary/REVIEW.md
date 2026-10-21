# Conservative bot canary — owner review

Implements the **development/test preparation** in [owner comment 6305978770](https://github.com/catillatio/test/pull/14#issuecomment-6305978770), continuing from `ffd11c5`. **No active policy, live bot, human rule, release mechanism or production resource changes.** PR #14 stays draft and PR #13 stays inactive. Gray needs no action; the username task is withdrawn.

## Proposed experiment

Select **18 fixed representatives**: green/seasoned/elite at levels 5, 8, 15, 25, 40 and 50. Variant = `(level-band index + tier index) mod 3`. Selection is independent of wallets, favorable outcomes and any individual attacker. Missing/duplicate/disabled or wrongly mapped identities fail closed; there is no automatic replacement with a more convenient bot.

Only **five** purchases satisfy the conservative bounds. The other **13 are unchanged controls**, not falsely counted as equipment adjustments. All 450 identities persist; 445 bots are entirely unmodified by calibration. This is deliberately a small paid experiment, not an attempt to repair every difficulty gap.

| Slot | Bot | Exact addition | Cost | Carried gold before → after | Extra upkeep/hour |
|---|---|---|---:|---|---:|
|5:green:0|Thrain Nightbloom|Hazeltwig Longbow ×1|22|2,754 → 2,732|0|
|15:green:2|Jessam Stonebriar|Verdant Aegis ×1|330|7,212 → 6,882|5|
|40:green:1|Isen Runefell|Argent Sentinel Plate ×1|480|47,848 → 47,368|7|
|50:green:2|Una Thornvale|Frostweave Mantle ×1|720|80,172 → 79,452|9|
|50:seasoned:0|Gwyneira Emberfall|Astral Conductor ×1|5,700|113,440 → 107,740|42|
|**Total**|||**7,252**|**−7,252 exposed gold**|**63/hour**|

Funding is **only each bot's own saved exposed purse**. No equipment is sold or removed, no paid lots are consumed, and no Vault, training point, member, property or resource grant is used. Existing maintenance credit stays reserved; this fixture needs **zero top-ups/refunds**. Gear owned but not selected still incurs normal upkeep. Land gross rates, ownership and payment clocks remain unchanged; aggregate bot net income decreases **3,283,805 → 3,283,742/hour** because equipment costs more to maintain. No new progression or purchasing loop runs.

The proposal enforces at most 10% purse spend per bot, **7,500 total purchase gold / 75 total extra upkeep per hour**, at most two copies of one eligible item type per change, positive net income, affordable four-hour operating cash, and existing inventory limits. Both attack and defense growth are capped at 8%; the largest observed is **6.70%**. All old gear is retained. Already-punishing opponents are controls; no proposed purchase lowers any fixed benchmark's win rate by over 15 percentage points (observed maximum **14.51**).

The **[exact 18-slot manifest](MANIFEST.md)** includes every control, current/after attack and defense, members, purchase, purse, reserve, upkeep and net income. **[Per-bot evidence](BOT_EVIDENCE.md)** adds actual gear, reasons for controls and eligible starter/ordinary/established/large-army XP/loot scenarios. [Machine manifest](manifest.json) binds all fields by SHA-256. Its IDs/clock are synthetic; it is **not production authorization**. The [separate PostgreSQL manifest and audit transactions](copy-manifest.json) contain actual immutable IDs from the disposable copy, explicitly labeled synthetic.

## Results

- **1,800 matchup rows** cover all levels 1–50, all 450 bots and four unchanged human investment profiles. Every before/after encounter enumerates all **441** roll pairs. Only the five paid loadouts differ; there is no adaptive per-attacker difficulty or hidden power multiplier. [Full matrix](matchups.csv).
- **600 short-session runs** cover every starting level 1–50, one/two/six active hours and natural/equipped-ten-member players, before/after. **24 targeted runs** test six hours against each purchased bot plus an unchanged elite control, with one/ten attackers. **20 daily runs** compare one/two hours per day over seven calendar days. [Readable pacing](PACING.md), [all 644 sessions](sessions.json).
- Maximum transferred-gold change is **5.77%**; XP change is **10.68%** when baseline XP is at least 100; final character levels differ by at most **one**. These are deterministic paired-seed observations, not statistical confidence or guaranteed earnings. Gold remains actual purse transfers, and every run conserves wallet+reserve after existing Land income, upkeep and healing. [Proposed objective gates](gates.json).
- Example: two-hour natural level 17 play remains 59 wins/15 losses and 1,312 XP, with 14,532 → 14,522 gold transferred. Two-hour level 50 stays level 51. Seven-day one/two-hour daily runs have **unchanged final levels** at every representative start; legitimate level advancement beyond50 remains possible under the existing architecture.
- Six-hour level 50 seasoned-target play changes 126/44 → 121/70 wins/losses, 149,278 → 143,048 gold and 6,683 → 6,699 XP. Stronger real equipment causes more losses/healing, while difficult wins may earn slightly more under the **unchanged** XP formula. Ten attackers share one purse/Health pool, not ten copies of either.
- **30 hypothetical level 100/200 cases** retain the current level 50 gear and saved members/training. The original human participation limit remains; hypothetical owned armies above101 still cannot contribute beyond it. Actual current level 50 bots are ineligible, so real future XP/gold forecasts are **null**. [Stress data](stress.json).
- [Funding stress](funding.json) tests 100/50/10/0% remaining purse and present/zero maintenance credit. Poor or paused bots become controls; reserves cannot finance purchases. Future authorized saved-state plans may therefore contain fewer changes or no viable experiment.

Original human combat/recruitment/bounties and bot `bot-combat-rewards-2` **65% XP / 100–85–70–55–40 repeats** remain intact. No gold formula, Vault protection, cooldown, recovery, level-up refill or historical receipt changes.

## PostgreSQL and preservation

[Verification](VERIFICATION.md) and [copy results](copy-verification.json) document a checksummed custom-format dump restored into **two different fresh databases**, with all **66 tables, 452 accounts and 450 bots** matching before two no-op migrations. One copy isolates adversarial/race tests; the other rehearses the exact paid canary. Neither is production data; the populated source remains byte-for-byte unchanged.

Real PostgreSQL tests cover an actual purchase followed by injected failure/complete rollback, concurrent same/different-key retries, a real battle invalidating a stale plan, simultaneous ordinary PvP/calibration sharing character locks, wrong identities/command kinds, quote expiry, old paid-lot/history preservation and replay after expiry/reconnection. Every actual runtime attack/defense projection matches its reviewed paid loadout. Three hours of ordinary Land income minus upkeep conserve totals and settle once across reconnection. The copy's normalized economic-intent hash matches the offline manifest even though disposable UUIDs differ.

No SQL migration, active balance ruleset, startup routine, public endpoint, privileged operator credential or live execution mechanism is added. Local test consent/schema guards are **not** production authorization. The old population-wide liquidation/point-spending experiment remains historical evidence, explicitly superseded by this restricted canary.

## Limits and owner decisions

This does **not** solve the existing difficulty gap for large legitimate player armies, nor make every elite approachable: the level 15 elite control still defeats the ordinary fixed fixture. Levels1–2/catalog limits remain. No members are added: current bot caps/storage/provisioning do not provide a legitimate paid/consented acquisition path for new bot members, and none of the stock 450 owns an unused member above the runtime cap. Increasing a number would fabricate an army, so participation growth needs separate future design/approval.

The simulator uses fixed starting human gear/army during each session, one seed and synthetic finances. Its target selector knows pre-roll strengths and favors eligible meaningful opponents; that is an optimistic strategy, not a feature exposed in the player UI or adaptive server difficulty. Quest activity, shopping, changing recruitment, real player choices and depleted live purses can differ. Sequential ten-account scheduling is adversarial pressure, not fair concurrent scheduling; actual locks are tested independently. Current level 50 content cannot establish future 100/200 content balance. Phase 5 autonomous progression remains a separate question.

**Development gates pass; production execution remains NO-GO.** Please review the five paid changes, 13 controls, financial ceilings, observed matchup effects and [authorization/monitoring/correction boundaries](BOUNDARIES.md). Fresh authorized live-ID inspection, verified backup/actual-data copy rehearsal, a separately reviewed private execution mechanism and exact-target owner mutation approval are still required. This PR supplies none of those production permissions.

Approved report/audio files and mobile screenshots remain unchanged and **independently releasable** through the existing protected process; bot adoption is not a prerequisite. Phone navigation-honk verification remains a separate owner device check. Nothing was merged, released or deployed.
