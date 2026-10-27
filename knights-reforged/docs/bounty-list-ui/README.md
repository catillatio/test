# Compact Bounty List

Presentation-only pass, October 27, 2026. Pinned release baseline: `a17713f54f8fb8b8af073d529735c7255998307d` (includes merged PRs #55 and #56).

Open listings now contain exactly four visible elements: target name, level/class, bounty gold and Attack. Small screens stack gold below the target; wide screens align gold and action in columns. The original dark theme, five destinations and Battle tabs remain. There is no introductory paragraph or extra open-contract heading.

Removed from open rows: sponsor/expiry, Health/army, quota counts, repeated rules/warnings and visible new-event badges. Rules and personal records are collapsed below the list. Existing cancellation and read actions stay in personal records. Quota detail stays on profile placement/review screens; unavailable attack reasons use the disabled button's native tooltip/accessibility description. No per-entry details cards or extra navigation were added.

The notification event remains attached to the row so existing view-based acknowledgement works without a badge. Resource exhaustion disables an otherwise eligible button while preserving `data-attack-ready` for natural recovery. Self, sponsored and defeated targets retain disabled buttons. Forms still submit the exact bounty/target IDs, CSRF token and command ID to the same route.

No application backend, ruleset, migration, economy, stored record, recovery/retention logic or deployment setting changed. The 25/250 rules and claim behavior remain server-authoritative.

## Evidence

The historical reference collection's simple name/level/value rows informed the density and hierarchy; existing game artwork/styling is retained. Original screenshots are reference material, never rewritten assets.

| View | Before | After |
|---|---|---|
| 320px mobile | [Before](screenshots/before-320.png) | [After](screenshots/after-320.png) |
| 1280px desktop | [Before](screenshots/before-1280.png) | [After](screenshots/after-1280.png) |

Before uses an unmodified checkout at the pinned release; after uses this implementation. Both run the same eight-contract scenario with synthetic, legitimately funded accounts. Fixtures include long names, different classes/amounts and self/sponsored/zero-Health targets. Captures start at the top of the page; no DOM replacement or image editing is used. Fixture UUIDs and ordinary random quest/combat results can differ between runs.

The existing browser suite now verifies the four-field rows, no overlap/overflow, compact heights, 44px actions, disabled restrictions, collapsed details and successful disclosure opening. It covers 320/390/430/1280px, DPR 1/2/3 and 125% text. Each stage checks 35 views and a real Attack-button submission that preserves the exact contract and spends one Stamina. Read-only views preserve wallets, contracts, ledger entries, battles, events and receipts. The exhausted-hunter check retains eligibility for automatic resource recovery.

Local validation: 19/19 real PostgreSQL bounty/combat regressions, 35 browser views per stage, exact-contract button flows, typecheck/build and static 99/99 with 77 production EJS fixtures. Required CI status and exact totals are recorded in the draft PR and delivery evidence.

The existing Phase 6 browser scenarios open Records before inspecting historical claims or using the no-script read action. The obsolete page-wide prose match is replaced by assertions for the four-field listing, exact saved contract/target, normal Stamina cost, one settled claim/Kill, removal from the open list and the actual claimant/amount/report in history. Notification, cross-level follow-up, native no-script and persistence assertions remain. No removed product copy is restored.

No merge, deployment or production database/settings operation is part of this pass.
