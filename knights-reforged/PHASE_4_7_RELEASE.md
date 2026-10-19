# Phase 4.7 — Game feel and economy polish

The release transport was subsequently corrected to remove SSH entirely. See [the workflow correction and verification](PHASE_4_7_RELEASE_WORKFLOW_UPDATE.md) and [the current owner setup guide](docs/phase47/OPERATIONS.md). Earlier verification files remain historical evidence, not a claim that the obsolete SSH setup is usable.

Branch: `feature/kingdom-come-phase-4-7-game-feel-and-polish`.
Base: `109e475abb010155387be013c8f2b313c257b5bf` (Phase 4.6).

No live Railway database was accessed. No deployment, production promotion, merge, initialization, bot regeneration, development-account reset, human grant or live broadcast moderation was performed. All database/browser evidence uses disposable synthetic realms. Existing accounts, sessions, catalogs, artwork, balances and historical receipts are preserved by the upgrade.

## Implementation checklist

| Requirement | Delivered behavior |
| --- | --- |
| 1. Comprehensive audio | Nineteen original cues, one small AAC sprite, gesture-unlocked Web Audio, muted default, persistent character volume/mute, subdued routine feedback, one prioritized cue per confirmed receipt, rapid-event suppression and a visible Play result fallback when the browser blocks automatic playback. No music, external audio service or predicted financial success. [Inventory and license](docs/phase47/AUDIO.md). |
| 2. Tutorial terminology | Visible Adventure Guide references become Tutorial. Existing stable tutorial IDs, evidence, cursor, skip/replay and completion dates remain intact. |
| 3. Gold/buttons | Restrained gold highlights, metal gradients, consistent pressed/focus/disabled states, selected tabs and clearer transaction feedback. Existing artwork and five bottom tabs remain. |
| 4. Redundant navigation | Remove the duplicated Home/Rules strip and repeated own-name Profile link. Existing global Profile remains. Repeated gameplay titles remain available to assistive technology without consuming visible space. Land retains its context heading and Home-only menu access. |
| 5. Compact status | Compact Gold/XP/Level row, readable upcoming payment, retained Health/Mana/Spirit disclosures. Skill points move into the XP disclosure and remain available to screen readers rather than overflowing beside Level. |
| 6. Two broadcasts | Existing reviewed-ID, reversible moderation tooling retained. [Exact owner procedure](docs/phase47/OPERATIONS.md#two-broadcasts-review-before-hiding). The two live IDs, contents and times are not available here; neither message is claimed removed. |
| 7. Tutorial Step 6 | Explain Tales from the Field and explicitly say **Tap View Battle**. The durable objective is a recorded victory, recognized automatically; opening a page does not fabricate one. Next remains available without winning or spending. |
| 8. Callings | Freeblade → Barbarian; Warden → Tank; Spellward → Mage, for display only. Option values, database keys, snapshots, attributes, bonuses and change cooldowns remain unchanged. Mage's description accurately explains faster Mana recovery and the existing martial tradeoff, not an invented spell-damage bonus. |
| 9. Bot finances | Bounded server worker settles actual due Land/upkeep at startup and every minute, under the same locks/cursors as combat. It processes at most 450 due bots per pass, skips locked rows and retries safely. No profile view, attack or restart grants capital. [Audit evidence](docs/phase47/balance.json) and read-only owner audit below. |
| 10. Sign Out | Distinct restrained copper/red treatment, labeled icon, accessible name, focus and pressed states. Existing authenticated CSRF-protected session deletion remains intact. |
| 11. Equipment resale | Two-thirds of each copy's recorded acquisition cost, floored per copy, consumed FIFO. Exact server quote before Sell; actual ledger uses `game-feel-1`. No compensation for historical sales; Land resale unchanged. |
| 12. Idle purchases | Shared selection persistence and in-place submission recovery for Land/Armory buys/sales and Buy More. Refresh authenticated state before submitting; preserve immutable pending intent/ID after an uncertain response; retry that same action. Expired sessions offer sign-in returning to the same allowlisted marketplace/receipt. Unaffordable selections remain visible and disabled instead of silently changing. |
| 13. Victory XP | A measured adjustment only for eligible non-trivial opponents with 35–50% relevant strength: use at least a 50% strength factor. Matched/challenging rewards, level curve, loot and encounter gates remain unchanged. The “Decisive” presentation label never enters the formula. |
| 14. Focused polish | Fast feedback, persistent safe selections, clearer unavailable states, compact header, consistent disclosures, sound synchronized to confirmed outcomes, preserved Hall/Rivalry/Revenge/equipment reports. No unrelated gameplay systems. |
| 15. Preservation/security | Additive 020, immutable new ruleset, real PostgreSQL races/replays, populated 019 fixture, all old rows compared, secured sessions/Origin/CSRF, private operator commands, no production provisioning. [Security assessment](PHASE_4_7_SECURITY.md). |
| Additional release automation | Protected `release/production`, exact-commit CI verification, sole-owner environment approval, disabled-by-default setup gate, private one-shot Railway verification job, separate PostgreSQL restore cluster, encrypted HTTPS export, independent retained backup, signed exact-candidate pre-deploy approval and exact-release health/status checks. No SSH. Default manual run is a backup rehearsal. [Updated Android-friendly setup](docs/phase47/OPERATIONS.md). |

## Investigations and balance

**Purchase menus — confirmed root cause.** The shared quantity container used `data-level` for the equipment requirement. The resource refresher selected every `[data-level]` element and assigned `textContent = state.level`, replacing the entire quantity menu on an asynchronous background refresh. It now uses the distinct `data-required-level` attribute. This fixes the same underlying bug on Land, Armory, sales and Buy More. An explicit real server-state event in the idle browser regression verifies the inputs remain attached. The source also had transient-only quantities, refresh-driven clamping and native POST error navigation with no in-place recovery. Reproduced network/session failures and prolonged browser-clock idle are now covered at the shared control/submission layer. No quote/security expiry is extended. After an uncertain response, changing quantities cannot turn a retry into a second purchase. A visual review also caught generic button CSS overriding `hidden`; the hidden attribute now wins, including retry controls. Physical OS tab eviction remains a device acceptance check.

**Bots.** Phase 4.5 removed attack-triggered refills, but settlement remained lazy: unseen bots' stored purses could stay stale until accessed. Phase 4.7 adds scheduled ordinary settlement; it does not invent a live diagnosis. In the populated fixture all 450 existing portfolios are solvent, so no one-time grant, portfolio replacement or provisioning is justified. The owner can audit actual drift/overdue clocks using `node deployment/audit-bots.mjs` inside the authenticated private service. That command is read-only, does not materialize income and never changes humans. Importantly, old attacks already materialized their target before computing loot: a low battle reward alone does not prove a poor wallet. Per-bot caps and exhausted encounter allowances can explain it even when the purse is wealthy. The live cause remains unverified until the owner reviews the audit.

Representative existing seasoned/variant-0 bots below are synthetic Phase 4.6 records, not live accounts. Holdings, rates and equipment are unchanged. Wallet growth can temporarily exceed economic net while an existing prepaid upkeep reserve is consumed; the test verifies **wallet + reserve** changes by exactly `net × 72` and that the Vault never changes.

| Level | Initial exposed gold | Vault | Plots | Gross/hour | Equipment upkeep/hour | Fully funded net/hour | Exposed after 72 hours |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5 | 3,443 | 2,093 | 3 | 91 | 3 | 81 | 9,419 |
| 8 | 3,762 | 4,087 | 3 | 181 | 7 | 157 | 15,402 |
| 17 | 5,946 | 15,681 | 3 | 738 | 69 | 578 | 50,874 |
| 25 | 20,428 | 111,171 | 7 | 4,850 | 168 | 3,962 | 313,756 |
| 40 | 75,696 | 503,328 | 13 | 20,390 | 576 | 16,574 | 1,296,672 |
| 50 | 113,440 | 800,180 | 13 | 30,310 | 870 | 24,600 | 1,926,400 |

Gold remains an actual transfer of `min(15,000, floor(defender unbanked gold × 3%))`, multiplied by the unchanged 100/75/50/25/10% pair sequence, then floored. Bot loot additionally uses `min(3,000, 50 + floor(1.25 × min(level,50)²))`. One full encounter per bot and six total per rolling day remain; later practice yields zero ordinary gold and 1 XP. Vault funds and bounty escrow remain separate. No new bot capital or Land is added by migration or worker. For the sample bots above, first-encounter ordinary loot before → after 72 hours is: level 5, 81 → 81; level 8, 112 → 130; level 17, 178 → 411; level 25, 612 → 831; level 40, 2,050 → 2,050; level 50, 3,000 → 3,000. Repeated exhausted bot encounters still yield zero ordinary gold. These unchanged caps deliberately prevent accumulated income becoming an unlimited farming source.

**XP.** Existing +1 results can be correct: exhausted encounter allowances, an opponent below 35% relevant pre-roll strength, or integer rounding at very early levels. There is no unconditional “Decisive Victory” bonus.

Let `R(L)` be the unchanged next-level XP requirement. Cumulative thresholds through level 10 remain 0, 12, 30, 60, 105, 165, 245, 350, 485, 650. From level 10, `R(L) = 200 + 45 × (L − 10)`; attained levels remain uncapped.

The existing base percentage is 5% through level 10; add 0.5 percentage points per level from 11–16; at 17 use 9%, then add 0.375 points per level, capped at 12%. `B = min(300, ceil(R × percentage / 100))`. Level factor `D = clamp(100 + 10 × (defenderLevel − winnerLevel), 25, 150)`. For a full, non-trivial victory, `S = clamp(floor(100 × opposingRelevantPower / winnerRelevantPower), 50, 125)` and `XP = max(1, floor(B × D × S / 10,000))`. Existing trivial/repeat gates return 1. Defense uses its existing separate reward budget. Saved reports display exactly the XP actually granted.

| Level | R(L) | Matched before → after | Eligible 40%-strength before → after | Trivial / exhausted before → after | Equivalent-level quest XP |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 8 | 135 | 7 → 7 | 2 → 3 | 1 → 1 | 24 |
| 17 | 515 | 47 → 47 | 18 → 23 | 1 → 1 | 50 |
| 25 | 875 | 105 → 105 | 42 → 52 | 1 → 1 | 86 |
| 40 | 1,550 | 186 → 186 | 74 → 93 | 1 → 1 | 165 |
| 50 | 2,000 | 240 → 240 | 96 → 120 | 1 → 1 | 230 |

Arithmetic assumes equal levels and a full reward allowance. It does not guarantee a win or change eligibility. Approximately 20, 11, 9, 9 and 9 full matched wins fill those respective levels before resource recovery/losses. Quests and progression thresholds are unchanged. See machine-readable assumptions and examples in [balance.json](docs/phase47/balance.json).

| Recorded cost/copy | Previous resale | New resale |
| ---: | ---: | ---: |
| 5 | 2 | 3 |
| 12 | 6 | 8 |
| 40 | 20 | 26 |
| 75 | 37 | 50 |
| 120 | 60 | 80 |
| 9,000 | 4,500 | 6,000 |
| 175,000 | 87,500 | 116,666 |

## Migration and verification

`020_game_feel.sql` adds character sound preferences (default off), an indexed due-income lookup, and a bounded latest-income presentation pointer maintained from real committed ledger entries. It changes no existing business row. `game-feel-1` is installed alongside all old immutable rulesets. Existing bot/player IDs, Calling keys, passwords, sessions, owned costs/rates, financial and combat records remain untouched. Tutorial records are neither rewritten nor reset. The server requires 020; the first private-alpha 019→020 pre-deploy refuses to proceed without a separately restored-copy gate.

The owner copy checker now streams sorted rows in 500-row batches and hashes them, preserving exact old business-table comparisons without holding all battle history in Node memory. Only small append-only schema/rules registries retain their original row lists for subset verification. Migration replay must be unchanged.

Final command counts, screenshots and limitations are recorded in [PHASE_4_7_VERIFICATION.json](PHASE_4_7_VERIFICATION.json) and [the screenshot index](docs/phase47/screenshots/README.md). A populated Phase 4.6 fixture includes 450 bots, 454 accounts, sessions, all three tutorial cursor states, achievements, inventory lots, estates, Vaults, claims, active escrow, comments, broadcasts, battle history and rivalry/leaderboard summaries. No live data is used.

## Release status

This is a prepared, locally verified controlled-alpha candidate. Railway authentication, private verification-service/bucket setup, actual backup/artifact retention, production environment approval and physical Android/iPhone listening remain owner acceptance steps. The revised automation removes the unsupported SSH pinning requirement. It is not claimed to have deployed or been authenticated here. Two broadcasts remain pending exact-ID review. Do not initialize, seed, reset `dev`, repeat the old `gray` grant or regenerate bots during this upgrade.
