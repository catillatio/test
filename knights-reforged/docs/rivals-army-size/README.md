# Restore participating Army Size in Attack Rivals

Baseline: `35ea9ef43869dbe48455b6ff9df47c679c433d40` on `release/production`, including the approved compact Attack Rivals from #58. Branch: `fix/rivals-army-size`.

Each rival now shows `Army Size: X` directly below Level/Class, using `opponent.armySize`. Both rival-pagination paths already derive this field from `resolveArmy(...).participants` or the existing bot-specific `botArmy(...).participants`. No backend or calculation change is needed.

The additional line inherits the existing secondary typography. A rival-only CSS adjustment puts all target details in one compact block and removes the previously reserved empty mobile grid row. Gold linked names, row padding/dividers, dark background and right-aligned Attack styling stay shared with the approved list. The stylesheet cache revision is bumped. Bounty markup and base styling are unchanged.

Historical review: the master Kingdoms Live PvP reference, `historical/kingdoms-live/pvp/1000032205.jpg` from PR #44, shows each opponent's Army Size. This correction preserves that information in the owner-requested position beneath Level/Class while retaining the approved compact design.

| Width | Approved compact baseline | Corrected |
|---|---|---|
| 320px mobile | [Before](before-320.png) | [After](after-320.png) |
| 1280px desktop | [Before](before-1280.png) | [After](after-1280.png) |

Screenshots are native localhost Fastify/EJS pages backed by disposable PostgreSQL. Each stage uses actual registered accounts, paid contracts and server calculations. UUID-based rival rotation can give different ordering between independently prepared stages. No DOM replacement or image editing is used.

The existing CI browser test now verifies exact row text including Army Size, line placement beneath Level/Class, matching secondary typography, button clearance and compact height. Fixtures exercise leader-only (1), accepted ally plus militia (6), capacity-limited (19 participating from 21 total) and exhausted (10) armies. Every displayed value is compared with the rival API, and these cases are checked against authoritative character state.

Coverage retains 28 unique rivals across two pages, refresh, both tabs, profile navigation, a native ordinary Attack, resource costs, range/exhaustion rejection, empty results and idempotent replay. It checks 320/390/430/1280px, DPR 1/2/3 and 125% text: ten responsive list pages. Five additional local same-database Bounty comparisons against the pinned baseline are pixel-identical; its approved template hash is guarded in CI. Read-only navigation preserves financial and battle records.

Local results: the browser evidence run passes; 10/10 PostgreSQL army/profile, rotation and rendering regressions pass; typecheck/build and static 99/99 with 77 production EJS fixtures pass. Before/after JSON records are beside these screenshots. Final exact-commit CI results are recorded in the draft PR and delivery evidence.

No matchmaking, eligibility, combat, resource, economy, pagination, policy, migration, recovery or deployment code changes. No merge, deployment, production SQL or settings operation is part of this correction.
