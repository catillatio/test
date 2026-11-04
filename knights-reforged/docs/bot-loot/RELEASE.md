# Progressive ordinary bot gold

## Cause and correction

Production baseline `f48a14247c0b624d5bd864bce4b20869ba6a08be` used `botVictoryRewards()` → historical `victoryLoot45()` → both a 15,000 base ceiling and `min(3000,50+floor(1.25*min(targetLevel,50)^2))`. Bot pair percentages were applied afterward. The live image/health commit and retained image-preparation manifest were independently reconciled before development.

The active bot function now uses:

```text
R = floor(exposed_wallet × 3 / 100)
S = R                                      if R ≤ 20,000
S = 20,000 + floor(10,000 × ln(1 + (R − 20,000) / 10,000)) otherwise
payout = floor(S × existing_pair_percentage / 100)
```

The first eligible win uses 100%. Subsequent percentages remain 85%, 70%, 55%, then 40%. `recordVictory()` retains its existing ordered-pair window, resetting 24 hours after its first victory; losses and receipt replays do not advance it. The active v2 policy already removed the old shared daily reward quota and one-win cutoff. This change neither adds nor removes an encounter quota. Existing rival eligibility, natural recovery and autonomous duel pressure limits remain in force.

| Unscaled R | Prior maximum at level 50–100 | New first eligible payout |
| ---: | ---: | ---: |
| 3,000 | 3,000 | 3,000 |
| 10,000 | 3,000 | 10,000 |
| 20,000 | 3,000 | 20,000 |
| 30,000 | 3,000 | 26,931 |
| 50,000 | 3,000 | 33,862 |
| 100,000 | 3,000 | 41,972 |
| 200,000 | 3,000 | 49,444 |
| 500,000 | 3,000 | 58,918 |

The explicit formula takes precedence over approximate balancing examples: floor gives 33,862 rather than 33,863, and 58,918 rather than 58,922. Integer flooring creates occasional one-gold plateaus, never a decrease. The underlying continuous curve joins exactly at 20,000 and has decreasing slope beyond it. There is no replacement payout ceiling or level-based gold factor.

## Arithmetic and source funds

The 3% and pair percentage floors use BigInt intermediates. `progressiveBotLoot()` reduces the rational logarithm argument by powers of two, then computes positive atanh-series lower/upper bounds using integer arithmetic. A geometric tail bound and explicit rounding allowance cover the omitted series. A result is accepted only when both bounds establish the same integer floor. Precision refinement is bounded; an unresolved result fails the existing transaction rather than guessing. No floating logarithm, unsafe wallet-sized Number product or dependency is introduced.

`resolveBattle()` still debits the defender's actual exposed wallet and credits the identical amount through the existing ledger/`creditGold()` path. Destination overflow remains in the existing retained-credit journal. Protected Vaults and bounty escrow are separate. Nothing funds rewards from retained savings, grants new gold, replenishes purses, changes Land income or resets accounts. The current spendable-wallet capacity is unchanged; pure numerical helpers are also tested through safe-integer inputs.

## Versioning and compatibility

- New immutable, digest-pinned definition: `bot-combat-rewards-3`.
- Original v1/v2 definitions and historical capped helpers remain unchanged and registered.
- The existing migration registry adds v3 with its normal conflict/immutability checks. No DDL migration, business-row update, population provisioning, pair reset or historical reward recalculation is needed.
- Bot XP still uses the exact existing difficulty calculation, 65% multiplier and repeat reduction/minimum floors. Battle notes recognize v3 while preserving v1/v2 reports.
- Human gold remains in the unchanged `humanVictoryLoot()` implementation: uncapped 3% with its existing 100/75/50/25/10 repeats. Bounty payouts, combat, equipment, damage and eligibility are unchanged.
- Autonomous bot-versus-bot duels already share the bot reward resolver, so their ordinary wallet transfers use this same curve. Their activation, population, equipment, resources, decision budget and incoming/outgoing limits are unchanged.

## Validation and economic risk

Focused tests cover numerical threshold/floor boundaries, large inputs, levels 50–100, repeat windows, the absence of a shared bot quota, low/zero wallets, concurrent attacks, duplicate commands, rollback, destination overflow, protected Vault/bounty funds, human PvP and unchanged historical receipts/reports/ledgers. Existing 900-bot population and independent encrypted recovery checks remain required in full CI. Independent 100-digit Decimal calculations matched 3,400 numerical oracle cases during development.

The [economic report](ECONOMIC_SIMULATION.md) uses the actual 900 authored bot slots with finite wallets, ordinary earned income, natural resources, level eligibility and existing pressure/repeat rules. All 36 farming cases and both duel cases conserve currency exactly. These source-informed simulations are not production wallet telemetry.

The change materially increases accessible high-level wealth. Starting-blueprint aggregate first-win quotes rise about 1.23×; a frozen-spending, 30-day estate-stockpile scenario rises about 20.6×. A level-100 attacker making 12 successful attacks in that stocked first day receives 430,284 rather than 18,900 gross gold. More sustained farming can transfer much more. This creates no direct gold faucet, but faster acquisition, spending and future estate growth may amplify economic effects; those feedbacks are not a calibrated live forecast. No extra cap, sink or quota was silently added to compensate.

## Protected release and actual live evidence

Use the existing `production-release.yml` image workflow only: green exact-head CI, normal protected PR merge, green exact post-merge CI, fresh `image-prepare`, authenticated candidate artifact, then owner-authorized `image-release` with promotion and the exclusive edit window. Keep first-install registry credential copying OFF for the already configured game service. Existing production approval, mutex, exact image/commit binding, backup, independent restore, preserved-data checks, encrypted retention, signing and health gates remain unchanged. Never use direct Railway redeploy or reuse expired proof.

The application startup verifies that v3 is installed with its exact definition. Post-deployment acceptance must separately reconcile Railway SUCCESS, configured image digest and `/healthz` commit, then observe genuine new bot battles using v3 and their original financial journals. No synthetic battle or forced recovery is evidence of actual live adoption. If private Console execution is the only available observation path, use the complete read-only packet in [LIVE_VERIFICATION.md](LIVE_VERIFICATION.md); zero matching battles means waiting for an observation, not success. No credential values are required in chat.
