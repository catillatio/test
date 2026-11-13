# Focused follow-up — local owner review

This continues `feature/complete-gameplay-rebuild-20261111` at clean source
`e508bca1cef210f0eb8816d68c35d718f10bf9c5`. No new layout or full-screen
mockup was adopted. The owner Drive package
`1rQxeO0eRGPx8MwExvHEGeMdLk0bbt8KV` and both circled screenshots were read.
The old Storm8 pixels are reference-only and are not shipped.

## Exact scope

| Item | Local result | Evidence |
| --- | --- | --- |
| Small Profile image | Three original transparent SVG silhouettes in the existing 60×60 slot. Barbarian/fur/axe, Tank/helmet/shield, Mage/hood/staff; restrained crimson, emerald and cobalt rims. Viewed character determines the asset and accessible name. Text, tabs, container and navigation retain their measured geometry. Existing painted assets remain intact. | `public/art/class-silhouettes-1/`, `views/profile.ejs`; `tests/focused-followup-browser.test.ts`, `tests/focused-followup-assets.test.ts` |
| Class labels | Battle and Bounty List used raw stored keys. Both now use the existing `callingName` formatter. Profile, Calling, recruitment and bounty review already used it. Reports/feeds preserve historical names and player-authored text. No internal key or API changes. | `views/battle.ejs`, `views/bounties.ejs`; actual three-class browser assertions and rendered bounty |
| Comments/broadcasts | Replaced only the consolidated `.activity-comment/.activity-broadcast .message-text` treatment: smoked charcoal, warm ivory body text, subdued stone border. No battle/bounty/feed-wide recolor. Existing escaping, wrapping, moderation and controls retained. | `public/realm-iron-brass.css`; same-state 320/390/1280 Chromium pairs |
| Notifications | Demonstrated client defect: failed acknowledgments left observed events queued but scheduled no retry; a second visible document had no cross-tab wakeup. Added three bounded transient retries (750/2,000/5,000ms), fixed failure/retry UI, focus reconciliation and a nonsecret localStorage change signal. Original exact-ID server ownership checks and read batches unchanged. | `public/player-experience.js`, `views/partials/notification-read.ejs`; `tests/focused-notifications-browser.test.ts`, existing finance/browser cases |
| NPC bounties | Existing mechanism works with disposable accounts and 450 saved synthetic NPCs. Demonstrated funded listing, claim, cancellation, expiry, replay, two-active/three-daily limits, target cooldown, self restriction and empty-purse rejection. No runtime bounty policy changed. | `tests/focused-npc-bounties.test.ts`; rendered NPC-funded Bounty List and ledger evidence |
| Matchmaking freeze | Algorithm, snapshot migration and independent fixture are byte-identical to the supplied preservation package. No MOBSTAS work. | Pinned Git blobs below; regression in `tests/focused-followup-assets.test.ts` |

Notification coverage includes five old/off-page comments → zero through the
real unread route **without Mark all read**, lost acknowledgments, another
visible tab, session restart, a pending Army invitation that remains pending,
bounded retry plus explicit retry, foreign-account rejection, 45 same-timestamp
events over three keyset pages, stale cursor/read replay and a late commit.
The existing `/game/notifications` link below Recent Activity remains the real
route for historical alerts. Optional Mark all read keeps its fixed-ID snapshot.

## Production evidence, read-only

Observed November 12, 2026: protected release
[43113551849](https://github.com/catillatio/test/actions/runs/43113551849)
completed successfully. Public `/healthz` reported `ready` and merge
`062f70c969930d2d5c79b7f1624323386b98d44b`, whose application tree matches
the e508 base. Railway reported successful deployment
`c32d39c6-a7c7-4398-a2db-459d8627116b`, exact source image
`ghcr.io/catillatio/kingdom-come-deploy-canary@sha256:b7e99086e295d38b7efbd416ae28af8846b133b38101513cdeecd5b72b03f65f`,
no staged patch, and no `ENABLE_NPC_SPONSORSHIP` variable. Source defaults that
absent flag to **off**. Therefore the package's older “unmerged feature” premise
is stale; the original notification implementation is deployed. This follow-up
is not deployed. No authenticated player session or authorized user-level
production diagnostic was available: the owner's exact five alert kinds and
whether they have cleared are **not established**. The client defect is proven
locally, not asserted as the proven cause of those particular live alerts.

## Frozen source

| Path | Git blob |
| --- | --- |
| `src/rival-recommendations.ts` | `6baa815ecc531e3382d9381bdccd56dfea013c62` |
| `migrations/050_rival_recommendation_snapshots.sql` | `b53e8aa6e3bb5df4014d9462743e1e7bd39ebf94` |
| `tests/rival-quality-fixture.ts` | `6ae447060b0d9fa4afcc97f45eb244f2e61854eb` |

The supplied nested matchmaking ZIP is retained unchanged in the local review
bundle. No database, combat, XP, reward, financial, population, activation,
release or Android code was changed. PR #88 is untouched. The ten-member NPC
limit, achievement payout gate and hard-disabled Crowns operations are unchanged.

## Reproduce and review

Use existing dependencies, Chromium and a disposable loopback `*_test`
PostgreSQL database. No dependencies or hosted CI are required. Run:

```sh
npm run typecheck
npm run build
npm run check:static
node scripts/ci/run-tests.mjs --files=tests/focused-followup-assets.test.ts,tests/focused-followup-browser.test.ts,tests/focused-notifications-browser.test.ts,tests/focused-npc-bounties.test.ts,tests/complete-rebuild-finance.test.ts,tests/complete-rebuild-browser.test.ts,tests/home-theme.test.ts --workers=1
```

For actual before/after captures only, set `KC_FOLLOWUP_BASELINE` to an isolated
extraction of the e508 application with its existing dependencies. The test
verifies the compared source bytes before importing it. Both renderers use the
same synthetic database, viewport, zoom and component scroll alignment. Read
acknowledgments are intercepted in visual pairs so badges do not mutate between
captures; the separate notification test exercises real acknowledgments.
No runtime theme switch or screenshot-only app content is introduced.

Generated screenshots and sanitized evidence are under
`test-results/focused-followup/`: Profile, Battle and comments at 320/390/1280,
three native-size 60px portraits and Profile identity crops, an actual populated
NPC bounty list, and notification states/retry. The external review bundle adds
pixel-preserving comparison sheets, test logs, exact local commit, a Git bundle
and patch. Its final verification record is authoritative for test counts and
source SHA; earlier development failures are not reported as passing.

Owner review of the small silhouettes and local follow-up remains required.
Only a separately authorized protected release can update live presentation and
notification behavior. NPC sponsorship remains off and needs its own explicit
activation approval. No push, PR, hosted CI, merge, deployment, Railway mutation,
production SQL, live account/NPC operation or feature activation occurred here.
