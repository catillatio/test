# One compact battle-list UI

Pinned release baseline: `502354b1ba11728a92b74e74b1aaeb1c600bda5e`, including the approved Bounty List from PR #57. Branch: `fix/rivals-match-bounty-list`.

Attack Rivals now uses the existing `bounty-list`, `bounty-row` and `bounty-target` classes. Rows contain the gold linked name, smaller level/class and right-aligned Attack button. They use the Bounty List's class labels, typography, padding, dividers, background, button sizes and responsive break point. No bounty amount, Health/army values, bot labels, placement shortcuts or explanatory paragraphs appear in rival rows.

The shared stylesheet keeps all approved Bounty rules unchanged. Its small rival modifier reserves the same mobile row rhythm without rendering gold, and uses two desktop columns. This is one styling system, not a separate rival skin. The page heading uses the existing Bounty heading treatment. The approved `bounties.ejs` template is byte-for-byte unchanged.

Refresh, More rivals, Hall of Champions and the `#rival-list` guide target remain. Recent battles are available in a native disclosure. Player links and ordinary attack forms retain their target IDs, CSRF and idempotency fields; no contract ID is submitted by an ordinary rival row. Disabled buttons use the same styling and native accessible tooltips as Bounty List, while retaining the resource-recovery flag for eligible targets.

No backend, targeting query, level range, bot flag, attack/XP/gold policy, migration, stored record, recovery/retention or deployment code changed. No new search/filter behavior is introduced.

## Before and after

| Width | Before | After |
|---|---|---|
| 320px mobile | [Before](screenshots/before-320.png) | [After](screenshots/after-320.png) |
| 1280px desktop | [Before](screenshots/before-1280.png) | [After](screenshots/after-1280.png) |

Both stages use real localhost Fastify/EJS and isolated PostgreSQL. Before runs the pinned unmodified checkout. Fixtures use actual registered accounts and funded contracts, with long names, three classes, an exhausted target and 28 eligible rivals across two pages. Independently prepared fixture UUIDs and ordinary random quest results can differ between captures. No image editing or DOM replacement is used.

## Verification

The new CI-registered browser test checks 320/390/430/1280px, DPR 1/2/3 and 125% text. Ten responsive list pages compare Bounty/Rival typography, padding, dividers, backgrounds, enabled/disabled button styling and dimensions. All four shared characters have matching row heights within the one-pixel last-divider difference. The test verifies exact row content, no bounty field, unique pagination through 28 targets, refresh, both tabs, profile selection, empty results, exhausted hunter/target states, level-range rejection, a genuine native ordinary attack and idempotent replay. Read-only views preserve financial and battle records.

Local baseline comparison additionally serves the approved Bounty page and candidate Bounty page against the **same prepared database**. Their list screenshots are byte-identical in all five viewport/text configurations. The approved Bounty template SHA-256 is `cb1aaed28643f55b16852695016c7afebf07c7d542e296fcd685d43c5c2c96ed`; the CI test guards it as well. Pixel comparisons require the local baseline checkout; ordinary CI checks current shared styles and behavior without a second checkout.

Local checks include 15/15 PostgreSQL targeting/combat/rendering regressions, typecheck/build and static 99/99 with 77 production EJS fixtures. Browser results and final exact-commit CI totals are recorded in the draft PR and delivery evidence. The existing tutorial browser selector now targets the shared row class; its gameplay assertions remain.

The older manual `browser-phase46-test.ts` reaches the native Rival attack and then fails its later Land “Buy more Smallholding” visibility assertion at line 64. The unmodified release baseline fails at the identical assertion. That unrelated Land assertion is retained, not relaxed; this manual runner is outside the existing required CI manifest. Both diagnostic logs are included with the delivery evidence.

Stop at a draft PR. No merge, deployment, production SQL or settings operation is part of this change.
