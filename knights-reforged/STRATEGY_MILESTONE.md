# Kingdom Come — Calling, Rivals and Bounties milestone

Branch: `feature/kingdom-come-strategy-and-bounties`. Base: the working Codespaces Origin fix, `22285c8e109656d4c2dccbd85b2e7eb9fe210ef1`. Nothing is merged or publicly deployed.

Active content remains **alpha-0.3**: 60 equipment entries, 40 quests and 21 properties. New rules are **strategy-0.2** and **passive-rivals-2**. Earlier catalogs remain installed and immutable. The first implementation and balance/verification work are saved in incremental commits. [Verification results](STRATEGY_VERIFICATION.json) and [mobile screenshots](docs/strategy-preview/README.md) accompany this report.

## Fidelity and reconstruction

The five original navigation tabs, dense illustrated lists, resource header and existing gameplay loop are retained. Profile sections and the Bounty List use the later-remake screenshots as presentation references. The newly supplied remake screenshot demonstrates a target-wide bounty-list limit within 24 hours; it does not establish the original Storm8 numerical limit.

Calling bonuses, NPC balance, bounty amounts, fees, eligibility and settlement conditions are original provisional Kingdom Come rules. Exact original server formulas remain unavailable. Alpha contracts pay on an eligible attacking victory; the supplied remake battle image shows a kill-linked claim, and original fulfillment conditions remain unverified.

## Calling

The interface now labels the feature **Calling**. Existing Freeblade, Warden and Spellward selections are preserved; their new specializations apply without changing spent skills, capacities or inventory.

| Calling | Attack power | Defense power | Recovery specialization |
| --- | ---: | ---: | --- |
| Freeblade | +4% | −2% | Spirit interval 108 seconds, from 120 |
| Warden | −2% | +4% | 10 Health per 162 seconds, from 180 |
| Spellward | −2% | −2% | Mana interval 270 seconds, from 300 |

Unmodified resource intervals remain 180 seconds for 10 Health, 300 seconds for one Mana and 120 seconds for one Spirit. A 10% shorter interval provides approximately 11.1% more recovery ticks over time. Capacities, quest costs, gold/XP rewards, Land income, upkeep and equipment prices remain unchanged.

Calling power modifiers multiply the army power after skill training, retaining hundredth-point precision. A maximum +25% trained attack with Freeblade becomes +30% relative to the untrained army; the Calling itself contributes only 4% of trained power. Equipment quality and quantities, army participation and skills remain the main determinants.

The first change to a different Calling is free. Further changes cost 100 carried gold and require 24 hours after the previous change. Choosing the same Calling does not charge or restart the cooldown. Every real change is journaled with its immutable ruleset and command ID. The server settles recovery under the previous Calling, then starts new recovery intervals; switching cannot backdate a faster tick or fill resources. Concurrent changes and repeated command IDs are tested.

The specializations favor attacking, resilience and quest frequency respectively. Their long-term competitive balance remains an alpha playtesting question.

## Temporary passive rivals

Explicit provisioning creates **150 disabled-login accounts: three opponents at every level 1–50**. They rotate Callings and have distinct names, persisted army stacks, quantity inventory, acquisition lots, maintenance reserves, Health and skill training. Battle labels them **Temporary rival** with green, seasoned or elite difficulty.

They use the ordinary server-authoritative combat, automatic equipment selection, damage, loot transfer, Spirit cost, cooldowns, progression and private battle reports. Their army obeys the existing limit of 20 retained militia plus the leader; no player allies or hidden power multiplier are added.

| Tier | Population design |
| --- | --- |
| Green | About 40% of available militia-led participation; about 55% equipment coverage; defensive gear up to six levels below; one training rating per twelve levels |
| Seasoned | Ordinary army size and individual category quantities calibrated during provisioning against a documented reference build; defensive gear eligible at the current level; one rating per six levels |
| Elite | Full militia-led participation and equipment coverage, best eligible defensive gear, one rating per two levels capped at 25 |

The reference is a Freeblade with 70% militia-led army capacity, 80% equipment coverage, attack-selected equipment two levels below its level and one training rating per six levels. Calibration searches legal persisted quantities, never runtime combat coefficients. It also leaves a margin below the elite tier.

`npm run balance:strategy` enumerates all 441 possible combat-roll pairs for each tier at all 50 levels: **66,150 arithmetic encounters**. The reference build wins **47.6–52.4%** against the middle tier at every level. This describes one reference build; individual players with different equipment, skills, Callings or allies can have very different odds. Tests additionally execute real PostgreSQL/HTTP bot fights at levels 1, 10, 20, 30, 40 and 50, including both well-equipped victories and an unprepared level-50 defeat.

Reward safeguards:

- At most six rewarded initiated bot encounters per player in a rolling 24 hours, and one per individual bot. Losses consume a rewarded encounter too. Later practice encounters still consume Health/Spirit and create reports, with zero gold/XP transfers.
- Ordinary loot is at most 50 gold and a winning attack awards at most five XP: **300 gold and 30 XP per player per day** from bots. Ordinary one-time milestones remain one-time awards.
- A bot's daily allowance is 100 + 30 × level, replenished at most once per 24 hours when accessed. Its development maintenance reserve covers 48 hours. These synthetic funds are disclosed in the interface and provision journal.
- Normal Health recovery continues; development rivals also refill Health when accessed after a ten-minute recovery interval. They never initiate attacks, run background combat, join player armies or participate in bounties.
- Accounts cannot authenticate, and even a manually manufactured session cannot authenticate as a bot. No bot password is provided to players.

`ENABLE_DEV_BOTS=1` enables discovery and attacks in development. The default is disabled. Production forces this availability off even if that variable is set. An explicit `dev:bots -- --disable` marks only managed bots inactive and retains records. Reprovisioning the same population version is idempotent. A population upgrade changes only managed NPC data while preserving character/account IDs, wallets, player records and historical battle snapshots; existing reward-window counts still refer to the same targets.

## Persistent development account

The local development database has a managed **dev** account, provisioned with the supplied credential through the hidden prompt. Its identity was checked across repeat initialization. It has **50,000 gold**, **nine retained militia plus its leader for an army of 10**, full resources and normal level-gated gameplay. A stored participation floor makes the specified testing army usable at level 1. It has no administrator role, grant endpoint or special combat formula.

This workspace's PostgreSQL records are separate from the user's Codespace database. The initialization command below creates or refreshes the account in that Codespace using its existing connection; Git does not transfer player databases or passwords.

Both provisioning commands require `NODE_ENV=development` and `ALLOW_DEV_PROVISIONING=1` (the isolated automated tests also allow test mode). They reject production before opening the database or reading a credential. Password input is hidden, or it can come from a `KINGDOM_DEV_PASSWORD` secret. The existing registration validation and Argon2id password hasher are used. No credential is committed, put in a fixture or printed.

`npm run dev:account` creates the managed identity once. Subsequent runs on the same strategy version leave progress and gold alone. On a new strategy version, or with explicit `-- --reset`, it restores the testing baseline once and journals the gold adjustment. Reset behavior:

- Preserve account/character IDs, selected Calling, level/XP, skills, equipment, discoveries, quests, Land ownership/payment phases, accepted allies and all transaction/battle history.
- Set retained militia to nine, carried gold to 50,000, resources to their current capacities and clear the attack cooldown. Accepted allies remain and may add to the ten-member baseline.
- Settle old Land income and maintenance first, so an old offline bill cannot immediately consume the new baseline.
- Store the supplied password through Argon2id and revoke only the dev account's sessions when a baseline/password is applied. Other accounts and sessions are untouched.

An unmanaged existing account named dev is never adopted or overwritten automatically; the command stops with a clear error. This protects a normal account from being mistaken for the testing identity. Provisioning is a terminal-only operator action, never an automatic server startup step.

## Bounty List

Battle now has **Attack Rivals** and **Bounty List** tabs. Real rival rows contain a compact placement form. The list shows targets, levels, Calling, actual participating army, reward, sponsor and expiry. It explains ineligibility before allowing a hunt. A successful private battle report displays bounty gold separately from ordinary loot. Own records include placed, claimed, expired and canceled contracts.

| Rule | Provisional value |
| --- | --- |
| Sponsor, target and hunter eligibility | Real players, level 3+, at least five completed quests |
| Target level range | Existing nearby-level rival eligibility |
| Stake | 100–10,000 carried gold |
| Placement fee | 10%, rounded up, minimum 10 gold |
| Active contracts | One per target; at most three per sponsor |
| Rolling placement limits | Five per sponsor per 24h; three per target per 24h; one sponsor/target placement per 24h |
| Expiry | 24 hours |
| Cancellation | Sponsor only, after one hour |
| Refund | Full principal for cancellation/expiry; placement fee retained |
| Completion | An eligible hunter wins an attacking battle before expiry |
| Hunter limits | Three claims and 20,000 bounty gold per rolling 24h |
| Pair limits | One claim against a target per 24h; one payment from the same sponsor per seven days |

No self-bounties, bot contracts or ally-target placements are allowed. Sponsors cannot claim their own contracts. Accepted allies of the sponsor or target cannot claim. Canceled and expired placements still count toward posting limits. Normal attack eligibility, Health, Spirit and cooldowns also apply.

The principal is debited into escrow and the fee is debited separately in one transaction. Claim settlement credits only the escrowed principal. Bounty operations acquire the escrow advisory lock before character locks, then lock/update the active contract atomically. Commands retain session-bound CSRF, strict Origin validation, intent fingerprints and idempotent receipts. Concurrent successful attacks can record only one paid claim; a refunded or claimed contract cannot pay again. Overflow refunds/rewards are retained through the existing exact-integer treasury policy.

Expiry is lazy, authoritative settlement: Bounty List reads, attacks and bounty commands process up to 100 expired contracts per transaction. Principal refunds persist when settled; an idle realm does not require a timer process to remain correct. A claim exactly at expiry is excluded. The resource header is read after list-triggered refunds so it displays the updated balance.

Funded escrow, fees, qualification and rolling limits prevent currency creation and bound transfers. Coordinated unlinked alternate accounts cannot be identified perfectly in this alpha. The system does not claim to solve identity abuse; the fees and limits still apply to those accounts. Original Storm8 bounty formulas and eligibility are undocumented.

## Land artwork and presentation

The five-tab navigation, original gradients/icons, dark background, compact item rows and Buy/Sell forms are preserved. The Land economy is unchanged.

Image generation produced a simplified edit of the property sheet: 21 recognizable buildings/environments, bolder silhouettes and fewer small competing details, retaining the existing identities and color progression. The new versioned WebP sheet is approximately 484 KiB, loaded through `strategy.css`; the old sheet is preserved. All 21 atlas assignments and row bounds are recorded and checked in `public/art/land-simple-0.1/provenance.json`. No equipment artwork was replaced.

## Migration, integrity and verification

Migration **010_strategy_and_bounties.sql** is additive: nullable Calling-change time, disabled-login flag defaulting false, Calling journals, managed-development registries and bounty escrow/events. No existing player row is deleted, re-leveled, re-equipped or repriced. Old Land snapshots, acquisition-cost resale, balances, sessions and battle records remain in their existing tables. Existing immutable content/rulesets are retained and checked at migration/startup.

Available verification passed:

| Gate | Result |
| --- | --- |
| TypeScript check and production build | Passed |
| Full automated suite with PostgreSQL 18.4 | 142 passed; zero failed/skipped |
| Explicit PostgreSQL integration gate | 83 passed; zero failed/skipped; overlaps the full suite |
| Static asset/form/navigation/template checks | 52 passed, including 36 EJS fixtures |
| Existing late-game browser gameplay | Passed at 330, 360, 390 and 1366px |
| HTTPS browser milestone flow | Native registration, login/logout, Calling, quests, equipment, Land, PvP, bounty placement/claim, private reports and passive rival combat passed |
| Mobile milestone layouts | Profile/Skills, Land, Battle and Bounties passed at 330, 360, 390 and 1366px without horizontal overflow |
| Compiled server restart | Sessions, progression, inventory, Land, Calling, a funded bounty and both players' private battle access survived |
| No-grant progression regression | Reached level 50 and its finale through 421 quest runs; elapsed recovery/income time was simulated, not human session timing |
| Populated compatibility | Before/after hashes matched all 27 existing business tables containing 15 local accounts before development content was added; old-version migration fixtures also passed |

The HTTPS fixture reproduces public HTTPS on a Codespaces-shaped port-3001 hostname, a real TLS proxy, localhost Origin rewriting and an HTTP backend. Secure/HttpOnly/SameSite cookies, session rotation/revocation, CSRF, foreign/null/wrong-port Origin rejection and forged forwarding headers remain tested. The working Origin-validation module is preserved. Test accounts, artificial clocks and synthetic grants run only in guarded disposable test databases, with isolated schemas for the new NPC/bounty suites and HTTPS fixture.

The browser uses Chromium 154 with emulated phone viewports. Physical Android and the user's actual private Codespace remain target-environment checks. No current automated failures remain. Human economy/pacing and competitive Calling balance still need playtesting. The global escrow lock and 100-listing board are deliberate small-alpha scale limits.

## Update the existing super-winner Codespace

Stop the app with Ctrl+C. Preserve uncommitted code changes and take a database backup through the existing backup workflow. Keep the current PostgreSQL service and `.env`/`DATABASE_URL`.

```bash
cd /workspaces/test
git status --short
git fetch origin feature/kingdom-come-strategy-and-bounties
git switch -c feature/kingdom-come-strategy-and-bounties FETCH_HEAD
cd knights-reforged
npm run db:migrate
NODE_ENV=development ALLOW_DEV_PROVISIONING=1 npm run dev:bots
NODE_ENV=development ALLOW_DEV_PROVISIONING=1 npm run dev:account
npm run build
export NODE_ENV=development HOST=0.0.0.0 PORT=3001 ENABLE_DEV_BOTS=1
export APP_ORIGIN=https://super-winner-4r7ppp6g7p4hq4rv-3001.app.github.dev
npm start
```

If the local feature branch already exists, use `git switch feature/kingdom-come-strategy-and-bounties` and `git pull --ff-only origin feature/kingdom-come-strategy-and-bounties` instead of creating it. Dependency versions and the lockfile are unchanged; the working installed dependencies are sufficient. No database reset, volume recreation or Codespace rebuild is involved.

At the hidden password prompt, enter the development credential already supplied. Nothing is echoed. For an explicit dev-only baseline reset later:

```bash
NODE_ENV=development ALLOW_DEV_PROVISIONING=1 npm run dev:account -- --reset
```

To disable the temporary population while preserving history:

```bash
NODE_ENV=development ALLOW_DEV_PROVISIONING=1 npm run dev:bots -- --disable
```

Alternatively restart without `ENABLE_DEV_BOTS=1`. Reprovisioning re-enables managed bots; a population upgrade preserves their IDs and old battle records. Keep port **3001 Private**, with HTTP internally and the public HTTPS address opened from Chrome.

Smoke-test registration, dev login, a quest, equipment Buy/Sell, Land Buy/Sell, Calling, a temporary rival and Profile → Sign out. Human bounties need three separate game sessions: sponsor, target and hunter. Reach level 3 and complete five quests for each; the sponsor funds the contract and another player wins the attack. Bots are deliberately excluded.

Optional regression commands require a separate `TEST_DATABASE_URL` ending in `_test`, never the live player database:

```bash
npm run verify
npm run test:postgres
npm run check:static
npm run test:codespaces
npm run test:browser:fantasy
npm run test:restart
npm run balance:strategy
```

Build before the restart check. Browser tests require local Chromium and OpenSSL for the HTTPS fixture. Database suites explicitly skip or refuse to run without the disposable connection. The repository does not contain the supplied dev password, database contents or environment secrets.
