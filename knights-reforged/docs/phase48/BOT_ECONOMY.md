# Phase 4.8 bot economy review

This audit uses the existing deterministic catalog and disposable PostgreSQL fixtures. **Live Railway balances, variables and journals were not accessed.** It establishes a code defect and tests the saved-income model; it does not claim to diagnose every current live zero-gold result.

## Confirmed eligibility defect and correction

Previously the bot allowance counted every battle with `rewarded=true`. A defeat could be stored with that flag while the allowance was available, despite awarding the attacker no loot or XP. That consumed both the opponent-specific and shared daily reward budget.

The corrected bot query counts only `rewarded=true AND outcome='attacker_win'`. It aggregates pair and total counts in one query under the existing actor transaction lock. New bot losses store `rewarded=false`; historical loss flags, snapshots and receipts are unchanged. New bot battle JSON records `botRewardEligibilityPolicy: victories-only-1` for audit. Existing idempotent receipts remain authoritative.

**Unchanged limits:** one fully rewarded victory per bot and six total per rolling 24 hours. Subsequent eligible victories still receive the existing minimum 1 XP and zero ordinary bot gold. Bounty escrow never refills this allowance. Human reward eligibility and formulas are unchanged.

## Why gold can still be zero

- That bot already yielded its rewarded victory within the window.
- Six rewarded bot victories have already been used across opponents.
- The target has fewer than 34 spendable gold; 3% rounds down to zero. Vault savings are excluded.
- The attacker lost: defeats never pay attacking loot.

A 0-Health target is ineligible for a battle, rather than a special zero-loot victory. No instant refill, view-triggered grant, retroactive reward or new capital adjustment is introduced.

## Deterministic progression remains intact

There are 450 stable identities: nine at every level 1–50, covering three tiers and three variants. Existing equipment requirements, actual properties, Calling bonuses, ordinary automatic equipment selection and the army cap remain. Across all 450 catalog portfolios, fully funded net income is positive (minimum 21/hour), every bot has at least three plots and no army exceeds 10.

Representative **seasoned variant 0** starting states, from [the reproducible offline report](bot-economy.json):

| Level | Army | Plots | Exposed gold | Fully funded net/hour | First eligible victory loot | Same-window repeated victory loot |
|---|---:|---:|---:|---:|---:|---:|
| 5 | 1 | 3 | 3,443 | 81 | 81 | 0 |
| 8 | 1 | 3 | 3,762 | 157 | 112 | 0 |
| 15 | 3 | 3 | 5,826 | 596 | 174 | 0 |
| 17 | 3 | 3 | 5,946 | 578 | 178 | 0 |
| 25 | 4 | 7 | 20,428 | 3,962 | 612 | 0 |
| 40 | 6 | 13 | 75,696 | 16,574 | 2,050 | 0 |
| 50 | 7 | 13 | 113,440 | 24,600 | 3,000 | 0 |

These are unchanged catalog examples, not current live purse values or promises that an attacker wins. Loot uses the actual remaining wallet at resolution, the existing 3%/15,000 cap, fixed pair multipliers and bot cap `min(3000, 50 + floor(1.25 × min(level,50)²))`. It is always transferred from the target. Earlier losses no longer turn the first eligible victory's amount into zero; all other reductions remain.

The level-15 example's actual named equipment, legal quantities, property types and protected savings are included in the JSON. Its three-member army is deliberate natural progression, not an oversized or hidden multiplier.

## Income reliability and preservation

The existing background bot-income worker settles saved holdings independently of profile visits. It shares combat locks and skips busy rows. A 72-hour offline test verifies all 450 bots' **wallet + prepaid reserve** change equals exactly `72 × fully funded net income`; Vault and Land ownership remain unchanged. Concurrent workers settle once, repeated same-boundary execution pays nothing, and a disabled worker performs no settlement.

An actual compiled-server restart test verifies three offline property periods for a passive rival, unchanged Vault savings and no second payment on repeated reads. This verifies the existing mechanism without inventing a new economy. No bot-finance correction is justified by the deterministic fixture; a live audit remains an owner-side task if deployed purses still look inconsistent.

Focused HTTP/PostgreSQL tests cover: a legitimate loss, an immutable legacy rewarded-loss record, a subsequent rewarded win, same-ID concurrent retries, multiple simultaneous distinct wins sharing the six-win cap, zero-gold repeat victories, unchanged minimum XP and rolling-window reset. Existing suites retain loot conservation, protected Vault, bounty claims, equipment/Calling progression and full bot-identity preservation checks.

## Migration / release

No schema or catalog migration is added. Do not rerun initialization, provisioning, seeds or any account grant. No human gold, bot starting wealth, holdings, inventory, army, level, XP or historical record is changed by startup or upgrade. Production release/recovery controls remain untouched.
