# Phase 5.1A — owner review

Four interface changes on `feature/kingdom-come-phase-5-1a-ui-polish`, based on
`release/production` at `e7f54934e20de62fd76f9df46710573aff09aa32`.
This is development evidence, not authorization to merge, deploy or change data.

## Changes

- Remaining tutorial lesson/completion/done, quest completion and achievement
  fills use charcoal and bronze. Existing success text, teal resources, error
  feedback, focus behavior and reduced-motion rules remain.
- Self/public Profile holdings sort by unlock level, then catalog order, then
  stable ID. Unknown historical properties follow the catalog. Grouping uses
  saved holding names/rates/quantities, never current catalog economic values.
- Ordinary and bulk equipment/Land purchases return to the appropriate category
  and item anchor. One compact confirmation beside the purchased item shows the
  saved quantity and actual cost and links to its private historical receipt.
  Both native HTML POST/303/GET and enhanced JavaScript paths are updated.
  Shared pending-intent storage, retry identity, validation and accounting stay.
- All four Hall categories show the character's actual attained level below their
  name. One additional column in the existing bounded query; no per-row queries,
  changed eligibility, scores, ordering, tiebreakers or top-twenty limit.

Saved receipt bookmarks remain usable. Partial receipts show only available
recorded details; retired/unknown catalog items get read-only saved confirmation
without invented equipment or unusable Buy More actions. Another account cannot
read those receipts or expose confirmation through a `command` query parameter.

## Current-state audit and reference use

The Phase 4.9 neutral panels, Home Calling, compact Hall and approved marketplace
rows already existed. The computed-style baseline nevertheless found green fills
on guide lessons/done feedback, quest rewards and achievement rows/toasts/emblems.
Profile still sorted by gross income; both native and enhanced purchases still
navigated to the separate receipt; Hall's existing query omitted displayed level.

All ten supplied historical screenshots were inspected locally. `01`, `08`, `09`
inform compact profile hierarchy; `02`-`04` inform readable reward hierarchy only;
`05` confirms quick navigation density; `06`, `10` are social reference outside
this scope; `07` confirms simple action hierarchy. Broken historical thumbnails,
contradictory battle wording, proprietary graphics and old blue/green styling
were not adopted. Original screenshots are not included in this repository or
runtime assets. No new artwork/audio/dependencies were introduced.

The [specific brief](OWNER_BRIEF.md) scopes this PR to four areas. The broader
[master backlog](MASTER_CODEX_BACKLOG.txt) remains planning material; its extra
requests are not authorization to implement them here.

## Verification

- Focused PostgreSQL tests cover grouping/legacy saved rates, public/self order,
  concurrent single/bulk purchases, same-command replay, private receipt access,
  missing/partial/retired receipts, unchanged JSON, Origin rejection, all Hall
  categories/authoritative levels and unchanged standings.
- Existing trade-quote, purchase-recovery, session-expiry, competition and rendering
  tests remain. Browser harnesses explicitly open historical receipt links when
  testing Buy More; normal purchases no longer require that stop.
- [Before evidence](before-browser.json) and [after evidence](after-browser.json):
  36 views each across 320/390/430/1024 widths, no horizontal overflow, five tabs,
  unchanged computed teal header, neutral target fills, mobile targets, real
  purchases, no-JavaScript single purchase and safe receipt refresh.
- The normal CI `npm test` also executes `phase51a-browser.test.mjs`: fresh isolated
  real-route views, native no-JS purchase, target/focus checks and back/forward
  preservation. Full exact-head CI status/results are recorded in the draft PR.
- Local TypeScript/build/static rendering and focused security tests pass.
  The full normal CI checkpoint covers existing migration/preservation, security,
  audio, game-container and encrypted backup/restore/release regressions.

No database migration is needed. Deployment/recovery code, workflows, catalogs,
financial/combat rules, bot flags, initialization and production were not changed.
PRs #13, #20 and #25 remain separate and untouched.

## Screenshots

Before images render the unchanged base commit in a detached local worktree;
after images render this feature branch. Only synthetic accounts and a local
PostgreSQL fixture are used. Clock, names and layouts are fixed. Normal quest
reward randomness is retained, so a few displayed gold values can differ; the
screenshots are not an accounting comparison. Responsive captures use Chromium,
reduced motion, 844px mobile height and 1000px desktop height.

| Surface | 320px | 390px | 430px | 1024px |
|---|---|---|---|---|
| Tutorial lesson | [Before](screenshots/before/320-tutorial.png) / [After](screenshots/after/320-tutorial.png) | [Before](screenshots/before/390-tutorial.png) / [After](screenshots/after/390-tutorial.png) | [Before](screenshots/before/430-tutorial.png) / [After](screenshots/after/430-tutorial.png) | [Before](screenshots/before/1024-tutorial.png) / [After](screenshots/after/1024-tutorial.png) |
| Tutorial completion | [Before](screenshots/before/320-tutorial-complete.png) / [After](screenshots/after/320-tutorial-complete.png) | [Before](screenshots/before/390-tutorial-complete.png) / [After](screenshots/after/390-tutorial-complete.png) | [Before](screenshots/before/430-tutorial-complete.png) / [After](screenshots/after/430-tutorial-complete.png) | [Before](screenshots/before/1024-tutorial-complete.png) / [After](screenshots/after/1024-tutorial-complete.png) |
| Quest completion and achievement toast | [Before](screenshots/before/320-quest-completion.png) / [After](screenshots/after/320-quest-completion.png) | [Before](screenshots/before/390-quest-completion.png) / [After](screenshots/after/390-quest-completion.png) | [Before](screenshots/before/430-quest-completion.png) / [After](screenshots/after/430-quest-completion.png) | [Before](screenshots/before/1024-quest-completion.png) / [After](screenshots/after/1024-quest-completion.png) |
| Achievements | [Before](screenshots/before/320-achievements.png) / [After](screenshots/after/320-achievements.png) | [Before](screenshots/before/390-achievements.png) / [After](screenshots/after/390-achievements.png) | [Before](screenshots/before/430-achievements.png) / [After](screenshots/after/430-achievements.png) | [Before](screenshots/before/1024-achievements.png) / [After](screenshots/after/1024-achievements.png) |
| Hall of Champions | [Before](screenshots/before/320-champions.png) / [After](screenshots/after/320-champions.png) | [Before](screenshots/before/390-champions.png) / [After](screenshots/after/390-champions.png) | [Before](screenshots/before/430-champions.png) / [After](screenshots/after/430-champions.png) | [Before](screenshots/before/1024-champions.png) / [After](screenshots/after/1024-champions.png) |
| Own holdings | [Before](screenshots/before/320-profile-holdings.png) / [After](screenshots/after/320-profile-holdings.png) | [Before](screenshots/before/390-profile-holdings.png) / [After](screenshots/after/390-profile-holdings.png) | [Before](screenshots/before/430-profile-holdings.png) / [After](screenshots/after/430-profile-holdings.png) | [Before](screenshots/before/1024-profile-holdings.png) / [After](screenshots/after/1024-profile-holdings.png) |
| Public holdings | [Before](screenshots/before/320-public-holdings.png) / [After](screenshots/after/320-public-holdings.png) | [Before](screenshots/before/390-public-holdings.png) / [After](screenshots/after/390-public-holdings.png) | [Before](screenshots/before/430-public-holdings.png) / [After](screenshots/after/430-public-holdings.png) | [Before](screenshots/before/1024-public-holdings.png) / [After](screenshots/after/1024-public-holdings.png) |
| Equipment purchase | [Before](screenshots/before/320-armory-purchase.png) / [After](screenshots/after/320-armory-purchase.png) | [Before](screenshots/before/390-armory-purchase.png) / [After](screenshots/after/390-armory-purchase.png) | [Before](screenshots/before/430-armory-purchase.png) / [After](screenshots/after/430-armory-purchase.png) | [Before](screenshots/before/1024-armory-purchase.png) / [After](screenshots/after/1024-armory-purchase.png) |
| Land purchase | [Before](screenshots/before/320-land-purchase.png) / [After](screenshots/after/320-land-purchase.png) | [Before](screenshots/before/390-land-purchase.png) / [After](screenshots/after/390-land-purchase.png) | [Before](screenshots/before/430-land-purchase.png) / [After](screenshots/after/430-land-purchase.png) | [Before](screenshots/before/1024-land-purchase.png) / [After](screenshots/after/1024-land-purchase.png) |

## Limits and deferred work

Real Android/iPhone hardware and Safari were not exercised locally. Existing bulk
quantity presets require JavaScript; native single-item forms and server-side bulk
POSTs retain their behavior. No broader quantity-control redesign is included.
Historical missing metadata cannot be reconstructed; confirmation falls back to
saved text instead of guessing. Missing-catalog holdings have no trustworthy
unlock level, so are placed after known catalog holdings by stable ID.

No combat/bounty/economy change, new art/audio, Stamina rename, equipment tooltip
feature, social/notification/Unicode policy, tutorial restructure, Android work or
administrative functionality is included. Stop at draft PR owner review.
