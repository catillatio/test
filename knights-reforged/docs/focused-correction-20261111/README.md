# Focused local correction of reviewed 536fb2d

Continues `feature/complete-gameplay-rebuild-20261111` in
`/dev/shm/kingdom-complete-rebuild` from reviewed commit
`536fb2d58d52190b595c03073d8bb29f6b4160c5`. The independent QA was read from
Drive file `11wpEKYQDEFUkjw-ItvjiayFCcx0_bJ69`. No other implementation branch
or Play PR #88 is incorporated. The review bundle identifies the final local
commit, commands, results, changed files and artifact checksums.

## NPC armies: improved locally, legacy cap still unresolved

`funded-npc-armies-2` replaces the local planner; the exact v1 definition and
historical receipts remain valid. It uses each saved NPC's green/seasoned/elite
tier rather than assigning an unrelated strength band. Weak, matched and elite
armies approach their existing legal capacity with deterministic variation;
application never reduces an existing roster.

The old whole-army equipment bundle could skip a category even when individual
useful items were affordable. The new planner buys balanced marginal upgrades
at actual shop prices, within the saved wallet, item eligibility, inventory and
transaction limits, and the existing 70% property-income upkeep budget. It
funds actual stored militia, accounting for preserved roster floors. Genuine
due Land income and maintenance are settled under the actor lock before
quoting; application requires a matching fresh quote. Paid memberships, shop
receipts, reserve movements and rollback/retry protections are retained. No
endowment, Vault withdrawal, Land grant or equipment grant is introduced. Both
preparation and application require a loopback `*_test` database and `fixture_*`
schema. There is no live adjustment route.

The reviewed 15–30 sample has **164 NPCs: 144 legacy and 20 expanded**. All
144 legacy NPCs are hard-capped at **10 participants** by the existing combat
policy. Their human recruitment is intentionally nonreciprocal; the removed
Gold-recruitment endpoint cannot provide extra NPC allies. The 20-paid-militia
storage limit is separate from the legacy cap. Thus **87.8% at ten or fewer
cannot be corrected by spending alone**. The corrected planner removes very
small armies and improves equipment, but this requested distribution remains
**partial / policy blocker**.

The smallest proposed owner decision is to let legacy NPCs use the active
level-based army projection while retaining the **20 paid-militia limit**,
**12 Gold per actual new member**, real equipment prices and upkeep checks.
This would permit up to 21 participants without inventing reciprocal allies or
raising the paid allowance. **It is not implemented or activated.** Evidence
includes an explicitly unapplied membership-only forecast, not an equipment
quote, production inventory or live funding approval.

Bundle `npc-evidence.json` records unadjusted → funded-v2 rosters, quotes,
actual debits, upkeep/reserves and saved battle reports. It also compares the
retained genuine v1 output from the reviewed bundle, whose SHA-256 is pinned in
`tests/fixtures/npc-army-reviewed-536fb2d.json`. These runs use the same public
named/level blueprints; legacy UUIDs are fresh in each independently provisioned
fixture. This is not a claim that v2 was applied to the historical v1 database.
Within v2, identities are checked unchanged and before/after fights use identical
synthetic human builds. No live wallet or NPC was inspected or changed.

## Nonzero XP evidence; ranker unchanged

`tests/rival-quality-fixture.ts` adds 45 synthetic humans with varied levels,
legal militia, shop equipment and training to the saved 900-NPC population.
Real victories establish repeat reductions. The independent reference enumerates
the actual resolver's full combat roll grid and calls current XP formulas; it
does not import the recommendation scorer.

Tests require at least 20 positive-XP targets, distinct positive scores,
contested wins, unwinnable opponents and positive targets beyond the first
80 UUIDs. **Every eligible target** is compared against every ranked page:
no higher score may be hidden later; the positive first page exceeds the second
and its minimum equals or exceeds the maximum on all later pages. Coverage,
duplicates, cursor rereads, refresh tie shuffles, stale cursors after level
change and fresh level-21 recommendations are checked. Existing query budgets
and private-field restrictions remain. The ranker passed; no ranking, XP, loot
or combat formula was changed. Nine real before/after NPC fights reconcile
saved armies, XP and pair-wallet conservation.

## Crowns presentation only

One page title; distinct Crown balance; compact availability notice; one
iron-textured offer collection with fine dividers and readable copy. Existing
Mana/Stamina artwork and the original Crown mark are reused. Desktop has three
columns; mobile has compact rows. Home and Settings/Rules links stay. The
consolidated Crowns CSS block is replaced, with a forced-colors icon fallback.
No other interface component or class portrait is changed.

Actual Chromium comparisons use the same synthetic account/database, viewport,
zoom and scroll position, an exact archived 536fb2d renderer and the current
renderer at **320, 390, 1280**. Viewport and full-page captures show all scrolling
content. Commerce POSTs still reject, Crowns and Gold remain unchanged,
achievement payouts remain disabled, and no SDK/provider path is added. These
are real game renders, not concept images.

## Verification and boundaries

Focused final-head checks cover typecheck, build, static contracts, the test
manifest, migration/financial preservation, the complete NPC/rival file and
the Crowns browser test. Counts/timings are recorded externally after the final
commit, not inferred from earlier development runs. No unrelated full historical
audit or hosted CI is rerun. Normal CI, container/recovery and protected release
gates remain pending before any future authorized release.

No push, PR, merge, deployment, Railway configuration, real account/NPC write,
achievement-payout activation, premium activation or Play PR #88 change occurs.
Class portraits remain untouched for owner review. NPC adjustment/generation
stay local-only, sponsorship stays off, and no live scheduler is activated.
