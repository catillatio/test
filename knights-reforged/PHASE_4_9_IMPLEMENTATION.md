# Phase 4.9 — Alpha candidate, approved economy/interface/art and orchestral audio

**Current owner direction:** [comment 6303697572](https://github.com/catillatio/test/pull/12#issuecomment-6303697572) approves the orchestral set at `087e1a8` for alpha adoption, closes Gray moderation following voluntary removal, and **drops the username correction entirely**. PR #13 is paused/draft and untouched. No new operator system, broader redesign, bot-finance adjustment or level expansion belongs in this candidate. [Final release-readiness review](docs/phase49/FINAL_REVIEW.md) and [protected release procedure](PHASE_4_9_RELEASE.md) are the current checkpoint; earlier stage counts below are historical.

The owner has **approved the 65% XP checkpoint**, all **five interface refinements**, and the **Wyrmcrest Keep / Gold Mine artwork direction**. Immutable `bot-combat-rewards-2`, bot gold, pair percentages and economy/recovery rules remain unchanged.

The two approved original illustrations are now integrated. Current property displays say **Gold Mine**, retaining **`moonwell-sanctuary`** and every existing economic value/record. Historical receipt headings retain the saved name. No schema migration or immutable catalog edit is introduced. [Runtime screenshots and preservation details](docs/phase49/art-integration/README.md), [verification](docs/phase49/art-integration/verification.json). Latest full verification: **452 tests / 451 pass / 0 fail / 1 hosted-only local skip**; TypeScript/build, 99 static checks / 77 EJS fixtures, four art viewport groups / 16 captures and 64 audio/recovery responsive visits PASS.

The previous **four impact/chime clips are REJECTED**, archived explicitly and barred from adoption. The approved [orchestral set](docs/phase49/audio-orchestral-audition/README.md) uses CC0 French horn, trumpet, harp, bowed strings and soft bells. Runtime `phase49-orchestral-1` retains the full approved arrangements (3.9/3.9/4.0/5.3 seconds); decisive uses the same approved Victory. The pinned source/license/score/master hashes are retained, with mobile AAC packaging and versioned cache URLs. Ordinary controls/navigation remain silent; event priority, gesture unlocking, mute/volume, receipt matching, replay suppression and navigation recovery are preserved.

[Approved UI checkpoint screenshots/evidence](docs/phase49/ui-review/README.md). [Complete persistent backlog](docs/phase49/BACKLOG.md). PR #12 remains draft; no merge, deployment, production-data access or release-infrastructure change.

**Administration scope:** no Gray or Development Knight moderation, restoration or record inspection. Both removals are owner-reported, not independently verified here. No username change is requested. [Historical investigation, explicitly inactive](docs/phase49/BROADCAST_REVIEW.md). No moderation or production operation was executed.

[Current required backlog](docs/phase49/BACKLOG.md). PR #12 remains draft; no merge, deployment or release-infrastructure change.

---

## Approved bot-balancing checkpoint (retained evidence)

Branch: `feature/kingdom-come-phase-4-9-bot-combat-rewards`; draft PR #12 targets `release/production`.
Production source baseline: `b305fa011d9428b7e00e68a7cc38026e0bcdb256`.
Current immutable policy: **`bot-combat-rewards-2`**. The **40% repeat floor remains provisional**.

This is a development balancing checkpoint, **not the entirety of Phase 4.9** or a production-promotion recommendation. [All outstanding requirements](docs/phase49/BACKLOG.md) remain tracked with actual status, components, dependencies, acceptance criteria and evidence. No merge, deployment, production workflow dispatch, Railway access, production-data write, key change or release-infrastructure change occurred.

## Implemented

- Both bot hard cutoffs remain removed: no shared six-win/day allowance and no one-rewarded-win-per-bot limit.
- Bot gold retains the approved **100/85/70/55/40** pair multipliers, 3% exposed-purse calculation, existing bot ceiling and actual wallet transfers. No bot wealth, Land, income, reserve, Vault, damage, Calling, recovery or level-curve changes.
- **v2** scales the unchanged full difficulty XP to **65% first**, then applies the same pair multiplier. Integer floor and minimum 1 XP apply at both stages. Universal balancing is not mislabeled as a repeated/weak-opponent penalty.
- Existing fixed 24-hour pair counts/windows are retained. Losses, rejections and same-key retries do not advance them; successful zero-loot wins do. Different accounts compete for the same finite bot Health/purse.
- Reports save the policy, original full XP, scaled full XP, repeat multiplier and actual award. Human/quest XP, human gold rules, bounties and Kill/Death accounting are unchanged.
- Historical v1 and legacy receipts remain unchanged and replay without additional awards. No startup provisioning, seed, reset, retrospective rewards or administrative grant.

## Exact formulas

`W` is actual exposed defender gold after normal due income/upkeep; `D` is target level; `F` is the existing fixed-window pair percentage.

```text
B = min(15,000, floor(3 × W / 100))
K = min(3,000, 50 + floor(125 × min(D, 50)² / 100))
bot gold = floor(min(B, K) × F / 100)
full XP = unchanged victoryExperience47(..., true, actual pre-roll powers)
scaled XP = max(1, floor(full XP × 65 / 100))
bot XP = max(1, floor(scaled XP × F / 100))
```

Difficulty calculations and the storage limit remain authoritative. Cosmetic Decisive Victory provides no extra XP. Characters remain uncapped; the bot catalog remains levels 1–50. No client/environment XP override was introduced; 100/40% candidates are offline simulator inputs only.

## Balancing evidence

[Full comparison and interpretation](docs/phase49/XP_BALANCE_REVIEW.md) and [216 raw scenarios](docs/phase49/xp-comparison.json) cover three seeds, starting levels 5/8/10/17/25/40/50, fourteen days of 1-hour and 2-hour daily sessions, sustained six-hour play, natural/established equipment, shared-bot multi-account contention, losses, gold transfers, healing costs, recovery and normal level-up refills.

| Level | First matched XP at 100% | 65% | 40% |
|---|---:|---:|---:|
| 8 | 7 | 4 | 2 |
| 17 | 47 | 30 | 18 |
| 25 | 105 | 68 | 42 |
| 40 | 186 | 120 | 74 |
| 50 | 240 | 156 | 96 |

From Level 17, six-hour final ranges are **34–35 / 25–26 / 20** at 100/65/40%. The central 65% run wins 198 and loses 27, transfers **82,400 gold**, earns **6,905 XP**, naturally regenerates **196 Spirit**, and receives **27 Spirit from existing level-up refills**. First one-/two-hour sessions end at Level 18/19, with **7,405/14,573 gold** and **686/1,308 XP**. One-hour daily sessions for fourteen days end at Level 39–40; two-hour daily sessions end at 45.

These are fixed-gear, combat-only pressure tests with informed opponent selection, not a novice leveling forecast. No free shopping, recruitment, skill spending, human Land income or quest rewards are modeled. Slower XP may improve later win rates/gold by keeping fighters matched to their gear/catalog; gold formulas are identical.

**Early-level tradeoff:** a full matched Level-5 award of 3 floors to 1 at 65%; at Level 8, repeated matched victories reach 1 by the fifth win. Quests remain unchanged and provide alternative early progression. Existing weak-opponent reductions remain. All scenario totals conserve currency and preserve Vaults. Removing quotas still increases distributed multi-account farming opportunity; the provisional floor needs controlled-alpha review, not an assertion of immunity to farming.

## Preservation and migration

No SQL migration: schema head remains `020_game_feel.sql`. Controlled migration registers v2 alongside unchanged v1. From an installed v1 realm, only the v2 definition is added; from Phase 4.8, both policy definitions are registered. Definitions grant no gold/XP and never provision bots.

The populated synthetic v1/legacy fixture contains **66 tables, 452 accounts and all 450 bots**, wallets, Vaults, inventory lots, Land, financial history, active bounty, achievements, tutorial progress, sound preferences, saved sessions, old battles and pair windows. Before/after/repeated-migration snapshots retain all business rows byte-for-byte. Both historical receipt formats replay unchanged; an existing session authenticates after application reconstruction. No production fixture or account is used.

## Verification and reproduction

[Machine-readable verification](docs/phase49/verification.json) records final results. Focused tests cover nested rounding and minimums, more than six different funded rivals, repeated rewards, exact 24-hour reset, unchanged humans, empty-purse XP, recorded policy/displayed XP, concurrent purse debits, duplicate keys, Spirit races, forged reward fields, legitimate level-up refills without target revival, daily offline recovery and deterministic reconstruction.

```bash
cd knights-reforged
npm run typecheck
npm run build
npm run check:static
npm run balance:phase49:xp
# Only a designated disposable local *_test PostgreSQL URL:
TEST_DATABASE_URL="$LOCAL_TEST_DATABASE_URL" npm test
TEST_DATABASE_URL="$LOCAL_TEST_DATABASE_URL" node_modules/.bin/tsx scripts/browser-phase49-test.ts
npm audit --omit=dev
npm audit
```

Actual new-policy receipts: [390px repeated rival](docs/phase49/screenshots/390-repeat.png), [weaker rival](docs/phase49/screenshots/390-weak.png), [empty purse](docs/phase49/screenshots/390-empty.png); [all 320/390/430px captures](docs/phase49/screenshots). The approved interface is unchanged.

## Final checkpoint and remaining limitations

The approved balance, five UI changes, property integration and four orchestral cues are implemented. [BACKLOG.md](docs/phase49/BACKLOG.md) distinguishes verified delivery from owner-closed/withdrawn administration and deferred cosmetic work. No additional agreed alpha-blocking interface requirement was identified in the source audit. Tutorial/result flows and existing accomplishments remain intact; professional sound refinement, broad redesign, level 100/200 content and administration dashboard remain future work.

Physical iPhone/Android audio/OS interruptions and sustained live-alpha economy observation cannot be established by desktop browser emulation. The 40% same-bot floor and long-term pace remain provisional. The final evidence and remaining release gates are recorded in [FINAL_REVIEW.md](docs/phase49/FINAL_REVIEW.md). Keep PR #12 draft and pause for owner review; do not merge or deploy until separately authorized.

[Original 100% proposal](docs/phase49/V1_IMPLEMENTATION.md) and [66 original simulations](docs/phase49/paced-simulations.json) are retained as historical evidence, not the active 65% policy. No merge or deployment is authorized by this report.
