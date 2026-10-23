# Phase 5.1C — player experience

Prepared on `feature/kingdom-come-phase-5-1c-player-experience` from **`da8e2aef55d1b63a09806f87977421b974b24358`**, after merged PRs #26 (5.1A) and #27 (5.1B). One draft PR targets `release/production`. No deployment, production inspection, protected workflow dispatch or feature activation is authorized.

## Eight implemented features

1. **Stamina:** current resource labels, timers, skill descriptions, Calling explanations, tutorial/help, battle restrictions, saved-report labels and live combat-refresh fallback use the new name. Internal `spirit` fields, API payloads/error codes, timers, costs, maximums and installed rulesets stay unchanged. Existing receipt bodies replay verbatim; the known old skill-notice wording is translated only for display. Player names containing “Spirit” are not rewritten.
2. **Profile equipment inspection:** Weapons, Armor and Spells disclose Attack, Defense, hourly upkeep, unlock level and the already authorized owned quantity on both self/public Profiles. Definitions come from the authoritative catalog; quantities come from the existing inventory projection. Native details support tap/toggle, keyboard focus/Enter/Escape and a Close action; desktop hover also works. Popovers stay inside the viewport and above the fixed navigation. Historical missing definitions are identified rather than assigned invented stats.
3. **Optional Calling introduction:** lesson four’s existing automatic-equipment explanation now contains a collapsed optional Calling lesson. It describes the existing Barbarian/Tank/Mage effects, links selection to the same protected Calling command and returns to the tutorial. First change, cost, cooldown and server validation are unchanged. Next/skip never require selection or spending. All eight persistent IDs, cursor semantics, completion/skip evidence and replay remain intact; the installed tutorial ruleset is not edited.
4. **Personal All feed:** global broadcasts are excluded, including the player’s own broadcasts. Broadcasts retain their own tab and existing moderation. Battles, comments, army events and bounty events retain existing identity-based relevance, timestamp/UUID ordering and cursors. Unrelated bot-versus-bot history is excluded without altering or deleting records.
5. **Genuine attention badges:** Home counts unread incoming attacks and visible comments on the player’s own Profile. Recruit counts actual pending incoming requests. Five navigation tabs remain; counts use small, accessible muted-red badges with no sound or animation. Details below explain persistence and acknowledgement.
6. **Varied rivals:** an indexed cyclic identity traversal gives each viewer a reproducible varied first page, changes its seed after attacks and each UTC day, and provides explicit Refresh Rivals. Eligibility, regenerated Health, army participation, bot disclosure and attack authorization remain unchanged. Every eligible rival remains reachable; details below explain fairness and compatibility.
7. **Battle rewards:** recorded gold and XP share a compact coin/XP grouping; zero, loss and reduced values remain visible. A genuine saved level-up gets a compact congratulations/skill-point banner near its rewards. Bounty escrow remains explicitly separate. Real participating equipment, legacy missing-loadout messages, Attack Again and Revenge are preserved. Repeated readiness text is shortened, with costs still displayed. Existing deduplication and reduced-motion handling remain.
8. **Efficient bulk trades:** the selected item’s existing artwork, owned quantity and purse accompany its name. Buy/Sell tabs keep each direction’s quantity and command/recovery state. Presets and stepper stay at least 44px; equipment shows resulting owned upkeep, and Land retains server-supplied progressive totals/net projections. Typical 390–430px panels are about 20% shorter. Existing one-tap marketplace rows and no-script purchases remain.

## Before / after evidence

These are actual authenticated local game pages, with synthetic accounts and normal saved transactions. The baseline is a detached `da8e2ae` checkout; after captures use this branch. Both use the same fixture recipe and viewport dimensions. Combat damage variation can differ between independently resolved fixtures; no screenshots supply authoritative game values.

- [Bulk trading comparison](screenshots/compare-390-armory-bulk.png)
- [Profile inspection comparison](screenshots/compare-390-profile-preview.png)
- [Battle rewards / genuine level-up comparison](screenshots/compare-390-battle-victory.png)
- [Calling lesson comparison](screenshots/compare-390-tutorial-calling.png)
- [Personal feed comparison](screenshots/compare-390-personal-feed.png)
- [Resource header, rivals and unread badges comparison](screenshots/compare-390-battle-rivals.png)

**32 before and 32 after screenshots** cover the following eight views at 320×844, 390×844, 430×844 and 1024×1536. [Before evidence](before-browser.json) · [After evidence](after-browser.json).

| View | 320px after | 390px after | 430px after | 1024px after |
|---|---|---|---|---|
| Stamina / rivals / badges | [View](screenshots/after/320-battle-rivals.png) | [View](screenshots/after/390-battle-rivals.png) | [View](screenshots/after/430-battle-rivals.png) | [View](screenshots/after/1024-battle-rivals.png) |
| Equipment bulk | [View](screenshots/after/320-armory-bulk.png) | [View](screenshots/after/390-armory-bulk.png) | [View](screenshots/after/430-armory-bulk.png) | [View](screenshots/after/1024-armory-bulk.png) |
| Land bulk | [View](screenshots/after/320-land-bulk.png) | [View](screenshots/after/390-land-bulk.png) | [View](screenshots/after/430-land-bulk.png) | [View](screenshots/after/1024-land-bulk.png) |
| Profile inspection | [View](screenshots/after/320-profile-preview.png) | [View](screenshots/after/390-profile-preview.png) | [View](screenshots/after/430-profile-preview.png) | [View](screenshots/after/1024-profile-preview.png) |
| Victory / level-up | [View](screenshots/after/320-battle-victory.png) | [View](screenshots/after/390-battle-victory.png) | [View](screenshots/after/430-battle-victory.png) | [View](screenshots/after/1024-battle-victory.png) |
| Defeat / Revenge | [View](screenshots/after/320-battle-defeat.png) | [View](screenshots/after/390-battle-defeat.png) | [View](screenshots/after/430-battle-defeat.png) | [View](screenshots/after/1024-battle-defeat.png) |
| Personal feed | [View](screenshots/after/320-personal-feed.png) | [View](screenshots/after/390-personal-feed.png) | [View](screenshots/after/430-personal-feed.png) | [View](screenshots/after/1024-personal-feed.png) |
| Optional Calling | [View](screenshots/after/320-tutorial-calling.png) | [View](screenshots/after/390-tutorial-calling.png) | [View](screenshots/after/430-tutorial-calling.png) | [View](screenshots/after/1024-tutorial-calling.png) |

Matching before captures use `screenshots/before/<width>-<view>.png`.

### Measured bulk-panel height

The same selected Oathbound Greatsword / Tempest Port and actual DOM bounding boxes are compared. [Machine-readable measurements](bulk-comparison.json).

| Width | Equipment before → after | Reduction | Land before → after | Reduction |
|---|---|---|---|---|
| 320px | 352.0 → 347.9px | 1.2% | 377.0 → 351.2px | 6.8% |
| 390px | 352.0 → 281.1px | 20.1% | 377.0 → 302.2px | 19.8% |
| 430px | 352.0 → 281.1px | 20.1% | 377.0 → 302.2px | 19.8% |
| 1024px | 352.0 → 287.1px | 18.4% | 377.0 → 311.2px | 17.4% |

At 320px, a separate row for quantity/presets and a wrapped item name preserve readability and 44px targets. The 20–25% objective is met approximately at typical 390–430px widths, not claimed at every width. No trade formula changed to achieve these figures.

## Notification semantics and security

- `notification_state.started_at` is derived by PostgreSQL when migration 021 installs for existing characters. Older attacks/comments are not backfilled as unread. A small transactional trigger creates the baseline for newly registered characters; login/navigation does not reset it.
- Counts come from persisted battles/messages and current pending army links, not client counters. Own attacks/comments, broadcasts and unrelated bot duels never count. Hidden/deleted comments cease counting. Pending requests remain attention items until the existing accept/reject/cancel actions resolve them, even after visiting Recruit.
- Each Home read marker is keyed by **character ID + event kind + immutable event UUID**. The source record must belong to that signed-in recipient and be in the new observation window. No client timestamp or owner ID is accepted. Acknowledging one page cannot consume an unseen later commit or a different event sharing its timestamp/UUID.
- JavaScript acknowledges incoming entries only when at least half of the entry (or the incoming report heading) is visible in a foreground document. A manual **Mark shown events read** form remains available without JavaScript. Merely fetching a page does not write acknowledgements.
- Both acknowledgement routes require an authenticated account and the existing Origin/CSRF protections. Payloads are bounded to 40 events. Writes are transactional, serialize per recipient and use `ON CONFLICT DO NOTHING`. Invalid/foreign records cannot mark another player’s activity read. Interrupted multi-kind writes roll back together.
- Server-rendered badges refresh on navigation. Foreground return, bfcache return and reconnect refresh counts; visible entries are re-observed. Browser requests are serialized so a stale count response cannot overwrite a later acknowledgement. Multiple sessions share the same durable markers. No push service or new polling loop is introduced.

## Rival rotation and fairness

The initial pivot is a hash of the viewer’s immutable ID, latest outgoing battle ID, UTC date and optional validated refresh UUID. At most two bounded UUID-index seeks fetch up to 21 rows for a 20-row page. The opponent query keeps the prior level, account availability, bot activation/disclosure and army/Health calculations; it does not sort the realm with `ORDER BY random()`.

The versioned cursor carries its pivot, traversal half and last identity. It holds the traversal steady if another attack finishes while the player paginates; the second half wraps once and stops. If the first visible row is the just-attacked rival and alternatives exist, it swaps with the second row without changing the page boundary. Tiny/empty populations remain valid. All eligible identities remain reachable, and old timestamp/UUID cursors still use the original chronological path. Live eligibility changes can naturally alter a later page; refreshing restarts traversal against the current population. No target immunity, reward rule or bot-initiated human attack is added.

## Migration, preservation and compatibility

**Only additive migration `021_player_attention.sql`:** two UX-state tables with primary keys, four supporting indexes, and one invoker-rights trigger/function to initialize new-character attention state. It does not alter business rows, installed rulesets or historical records, and does not run initialization/seeding. Existing sessions and old `spirit` clients remain compatible. Ordinary signed migration/start and independent restored-copy gates remain mandatory.

The populated pre-021 fixture contains **452 accounts and all 450 bots**, prior sessions, purchases and saved human/bot battle history. Tests hash/compare every pre-existing table row across the upgrade and repeated migration, check old history starts read, and confirm bot-heavy rival pagination. The new attention tables are the only added data model. A fresh app instance and a second session observe the same read state. No audit/admin permissions, credentials or public administrative route is added.

All Phase 5 bot purchase/duel code, activation flags, scheduling and reward policies remain untouched. The only combat-command change is its player-facing Stamina error wording. Trading financial commands only gain current presentation wording for skill notices; purchase/sale implementations are unchanged. All catalogs, approved Land/equipment images, mappings, source hashes, Crown Harbour and every spell remain unchanged. No dependency, protected workflow, release controller, Dockerfile, Android, retention or operator change.

## Verification and review boundary

Focused results: notification/privacy/CSRF/Origin, event-kind collision, atomic rollback, duplicate/concurrent acknowledgements, multi-session/restart visibility; new/skip/complete/replay tutorial accounts and Calling cooldown; catalog-authoritative/escaped Profile previews; old spirit receipt replay; progressive Land and equipment buy/sell idempotency; tiny/large/disabled/bot-heavy rival populations and cursor compatibility. The affected legacy regression set passed **28 tests**. Static validation passed **99 checks / 77 EJS fixtures**; TypeScript passed.

The browser regression runs through the normal test command: all four widths, no horizontal overflow, preserved five tabs, hover/touch/focus/Escape, popup/nav separation, reduced motion, visible-event acknowledgements, true saved rewards, quantity persistence/projections, rapid duplicate submission, and native no-script purchase/acknowledgement. Read-only view checks leave saved battle, wallet and non-tutorial receipt rows unchanged; later explicit purchase checks deliberately commit and verify their legitimate costs.

**Final complete exact-head CI** is linked and reported on the draft PR so its results do not require editing the already tested commit. It must include the full PostgreSQL suite, populated preservation, security/release regressions, build/static/type checks, dependency audits, browser/audio compatibility, production container/restart tests, and encrypted independent backup/restore worker tests. Focused evidence does not substitute for that run.

Known limits: these are automated Chromium mobile/desktop viewports, not physical iPhone/Android signoff. Notifications refresh on the specified revisits/foreground events rather than instantaneous push. At 320px the bulk height reduction is smaller. Bulk presets require JavaScript; ordinary one-item forms and explicit read acknowledgement retain native fallbacks. No requested feature is blocked or deferred. Stop at final draft-PR owner review; do not merge, deploy, activate settings or access production.
