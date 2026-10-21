# Phase 5 — The Living Realm: milestone 1

Implements only [Issue #15's first milestone](https://github.com/catillatio/test/issues/15): existing computer-controlled rivals occasionally buy real Land and equipment with their saved exposed gold. Base: merged Phase 4.9.1, `127a6849134403d569c2bc217db9d04da2886fae`. Branch: `feature/kingdom-come-phase-5-living-realm-economy`.

## Small implementation, real purchases

`src/bot-economy.ts` contains the deterministic policy, bounded background worker and scheduler. `src/server.ts` starts/drains it; `src/config.ts` provides the opt-in. There is no new service, queue, endpoint, dependency, migration or release-workflow change. Existing command receipts provide durable decision IDs; ordinary Land/equipment journals record real acquisitions.

**Default: OFF.** `ENABLE_LIVING_BOT_ECONOMY=1` also requires `ENABLE_DEV_BOTS=1`; production additionally requires the existing private-alpha controls. Invalid configuration fails closed. Disabled workers perform no SQL or purchase activity. This PR does not set a Railway variable or authorize activation.

Policy `living-bot-economy-1`:

- Each saved bot UUID has a stable five-minute decision slot every **12 hours**. Every process derives the same candidates/command IDs from the database clock. At most **five candidates globally per slot**, at most **one unit per decision**, at most **two scheduled opportunities per bot per UTC day**. This is a fixed schedule, not a rolling-day promise. Excess slot candidates rotate deterministically; disabled/busy/completed candidates are not replaced with a sixth bot.
- Only the current slot is eligible. Missed decisions are skipped; restarts/offline time never generate a purchase backlog. Ordinary saved Land income still settles normally. Roughly one quarter of decision seeds choose to save; other decisions prefer Land or useful gear, with an affordable fallback.
- Cost **including any equipment upkeep top-up** must fit all three limits: **5% of the settled exposed purse**, **two hours of current saved net income**, and **5,000 gold**. Cash left must cover at least four hours of the new equipment upkeep. No Vault withdrawal, reserved-credit spending/refund, grant, free gear, sale, army change or skill allocation finances a purchase.
- Property prices include the ordinary owned-quantity increase. Level/ownership limits apply. A purchase adds at most **2% of existing property net income**, with a **7/hour starter allowance** because one Smallholding is indivisible. The shared payment time is retained; partial first income follows existing rules.
- Equipment must improve actual ordinary army selection, fit level/ownership limits and keep total upkeep at most **35% of saved property net**, with positive net income. Existing gear and paid lots stay owned and maintained. Bots defer gear while excess prepaid credit would otherwise be refunded by the normal purchase path. Paused/indebted/inconsistent-upkeep or insolvent portfolios wait.
- Character, bot-registry and account locks protect identity, eligibility and funds. Standard transactions wrap settlement, purchase, upkeep, decision receipt and state revision. Unique completed receipts make retries/restarts read-only. A busy bot can finish its first decision on a same-slot retry; it cannot complete it twice.

This changes bot holdings only through real purchases when enabled. It does not change a combat formula, difficulty multiplier, human participation rule, bot army, Calling, XP/level, recruitment, quest or bounty policy. `bot-combat-rewards-2`, 65% XP and 100/85/70/55/40 repeats remain unchanged. Real purchased gear can naturally improve a bot's ordinary combat loadout. New property income is legitimate additional Land income, not combat currency creation.

## Verification and observed impact

Full local PostgreSQL suite: **480 tests, 479 passed, 0 failed, 1 existing hosted-runner-only skip**. No gameplay/preservation test was skipped. TypeScript, production build, **99 static checks / 77 EJS fixtures**, actionlint and both production dependency audits passed (zero reported vulnerabilities). [Verification](docs/phase5/milestone1/verification.json).

The six new tests cover deterministic/limited decisions, paused/poor/inactive/invalid actors, preserved prepaid credit/Vaults, forged receipts, held locks, concurrent PvP and multiple workers, actual post-purchase rollback, exactly-once paid lots/journals, timer non-overlap/shutdown and fresh compiled-worker process restarts. A fully populated 66-table/452-account/450-bot source survives migration replay with no row changes before activation. During the worker test, every human row, original identity, paid lot and immutable financial-history row remains intact; original holdings only gain normal settlement cursors. Personal activity is unchanged.

The compiled **game server** also passes its real process-restart test with the new opt-in left off: saved sessions/gameplay survive, and exactly three missed human/bot income cycles settle once. Separate compiled **worker** processes reconnect to the same populated fixture with autonomy enabled and replay completed decisions without another charge.

[Actual synthetic purchase evidence](docs/phase5/milestone1/purchases.json) covers **288 five-minute slots**: 592 Land buys, 27 equipment buys and 235 saving/waiting decisions. Capital spent on acquisitions: **86,300 gold**. Existing income/upkeep and those purchases reconcile every purse/reserve movement; aggregate net hourly income rises **13,414/hour** through real holdings minus new gear upkeep. No grant is used. These are observations from this fixture, not guaranteed player earnings; newly generated fixture UUIDs change the deterministic schedule.

| Bot / level | Real acquisition | Price + reserve top-up | Exposed purse | Net hourly change |
|---|---|---|---|---|
| Lysandra Hearthguard · 5 | Smallholding ×1 | 55 + 0 | 3,611 → 3,556 | +7/hour |
| Yorick Riverthorn · 5 | Stonebinding ×1 | 90 + 2 | 3,115 → 3,023 | -2/hour |
| Jessam Stonebriar · 15 | Copper Workshop ×1 | 160 + 0 | 9,606 → 9,446 | +22/hour |
| Torin Ravenfen · 25 | Woodland ×1 | 90 + 0 | 12,483 → 12,393 | +15/hour |
| Cedric Ebonhart · 40 | Woodland ×1 | 90 + 0 | 92,846 → 92,756 | +15/hour |
| Ysolda Ivorymere · 50 | Watchtower ×1 | 180 + 0 | 247,094 → 246,914 | +30/hour |

These are saved before/after receipts. New equipment reserve funding stays reserved; old prepaid credit is not refunded. Much of the initial stock has long prepaid upkeep, so its gear purchases wait while normal upkeep consumes that credit. Land purchases can proceed without touching it.

## Operational load and rollout safety

One timer per game process runs every five minutes, independently of player profile views. Each tick reads at most **451 ID rows** (more than 450 fails closed) and handles at most five candidates. Receipt lookups use the existing `(account_id, command_id)` primary key; there is no growing-history scan. Ordinary transaction locks and `SKIP LOCKED` coordinate income, PvP and multiple workers. The timer does not overlap itself and drains on graceful shutdown. Unexpected failures abort the current transaction and log a fixed message without database/provider details.

Original accounts, credentials, sessions, Vaults, identities, existing gear/lots, holdings, receipts, financial history and all human progress remain preserved. No fake public activity is emitted, and personal Home Recent Activity is unchanged by autonomous purchases. Bots retain the existing computer-controlled labels.

This is a conservative alpha slice: expensive assets above the budget wait; decisions are not guaranteed; a paused/poor bot is not rescued with free capital; a busy or offline slot can be missed. The 24-hour synthetic observations do not establish long-term inflation, player earnings or production performance. Existing ownership limits, rising Land prices, the small income-growth gate and finite purchase budget bound progression; review actual alpha behavior before expanding the policy.

**Owner review before rollout.** Keep this draft PR unmerged and the switch off. No production setting, record or service was inspected or changed. Any later activation requires separate owner authorization through the established protected deployment process, including its backup/independent restore/signing/approval gates. Do not apply a Railway variable change or source redeploy as an activation shortcut. Disabling future purchases does not undo legitimate completed trades; retain receipts, holdings and financial history.

No later Phase 5 milestone is implemented: no bot battles/attacks, bot XP/leveling, login rewards, new emblems/currency, achievement/rivalry changes or UI/tutorial work. The old 18-bot calibration remains archived and inactive. PR #13 remains untouched; username/Gray actions remain withdrawn/closed.
