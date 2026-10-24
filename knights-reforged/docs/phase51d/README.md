# Phase 5.1D — player foundations

Development only, based on merged production commit `710df05d524a6b28cea89b15ca716e1afcd19f44` (including Phase 5.1C). No production database, Railway setting, protected workflow or other draft PR was used or changed. No new dependencies, artwork, combat/bounty policy, bot automation or expansion content.

## Implemented scope

| Feature | Change | Main components / evidence |
|---|---|---|
| A: automatic human upkeep | Shared Land settlement credits earned money; existing upkeep accrues once; affordable old debt and the existing one-hour reserve are funded atomically. Paused gear can also recover after a legitimate command credit. | `maintenance.ts`, `game.ts`, `commands.ts`, `payment.ts`, immutable `automatic-upkeep-1`; accounting and race tests below |
| B: Unicode display names | NFC, grapheme-aware validation for new characters, readable scripts/symbols/emoji, controls and obvious mixed-script impersonation checks. | `content-policy.ts`, registration; no username/authentication/name-change changes |
| C: new-content policy | Same conservative server-side policy for new display names, comments and broadcasts; readable refusal, minimal rejection metadata. | Existing registration and social command paths; no historical moderation |
| D: current branding | Audit confirms browser metadata/title, auth, navigation, help, account/settings and current notices already say Kingdom Come. | Static render checks plus authenticated/public route checks; historical references, source paths, provenance, service names and Android remain untouched |
| E: Recruit destination | Only the five-tab footer's Recruit URL becomes `/game/army?tab=dashboard`. | Existing icon/label/badge, three internal tabs, direct `/game/army` Recruit default and all invitation commands remain intact |
| F: accepted invitations | A human's actual acceptance notifies the original inviter, with Profile and Dashboard links. | Existing `army_events`, notification summary/read API, visible-event observer and native acknowledgement form |

Phase 5.1C integrations are limited to E/F, the upkeep forecast disclosure and the explicitly authorized strict schema-head advancement. Its eight features are not rebuilt or redesigned.

## Accounting and payment order

The only hourly income clock remains `income_cycles.next_payment_at`. Existing lot accrual, exact fractional remainders, offline batching, retained treasury, maintenance accrual/capped-arrears/pause rules and journals are unchanged. The new immutable funding policy executes under the existing character lock and transaction:

1. Settle legitimately earned Land income through the existing shared boundary and overflow-safe wallet credit.
2. Settle already-active equipment's actual elapsed upkeep, using existing reserve then carried gold, exactly once.
3. For a human at that settlement (or already-paused human when actual funds become available), use existing reserve against old arrears, then existing carried gold against remaining arrears.
4. If affordable in full, retain/replenish the existing one-hour upkeep buffer and resume gear; leave remaining earnings spendable. Otherwise preserve the debt and existing pause state. Insufficient reserve *top-up* alone does not pause still-funded active gear.

There is no new payout loop, second income source, future-income advance or Vault withdrawal. The existing bot finance and autonomous command paths are unchanged. Ordinary human upkeep settlement already occurred when an offline opponent was materialized; its automatic funding now uses that same transaction, before the authoritative exposed wallet is used for combat. Combat formulas/rewards themselves are unchanged.

For hourly rate `r`, reserve `R`, arrears `A`, actual carried wallet `W` after normal settlement:

```
fromReserve = min(R, A)
remainingReserve = R - fromReserve
topup = max(r - remainingReserve, 0)
walletCost = A - fromReserve + topup
apply only if walletCost <= W
W' = W - walletCost; R' = remainingReserve + topup; A' = 0
W' + R' = W + R - A
```

Reserve refill is a transfer of the player's existing assets, not additional income or a second upkeep expense. `maintenance_events.charged_gold` records old debt paid; the existing ledger records wallet movement with `automatic-upkeep-1`. The payment disclosure separately shows reserve refill, old arrears, economic net and actual next purse change. The updated client is cache-versioned.

### Before / after examples

Numbers below use saved synthetic hourly holdings and rate 10. Existing pricing/rates are not changed. Old behavior means the previous manual-funding path at the same instant, not rewritten historical data.

| Scenario | Initial wallet / reserve / arrears | Earned net Land | Previous wallet / reserve / arrears / state | New wallet / reserve / arrears / state |
|---|---|---:|---|---|
| Surplus, one hour | 0 / 10 / 0 | 30 | 30 / 0 / 0 / active | 20 / 10 / 0 / active |
| Income equals upkeep | 0 / 10 / 0 | 10 | 10 / 0 / 0 / active | 0 / 10 / 0 / active |
| Below upkeep, two offline hours | 0 / 10 / 0 | 8 | 0 / 0 / 2 / paused | 0 / 0 / 2 / paused |
| Existing wallet plus income | 20 / 0 / 0 | 4 | 14 / 0 / 0 / active | 4 / 10 / 0 / active |
| Paused with debt | 0 / 0 / 10 | 30 | 30 / 0 / 10 / paused | 10 / 10 / 0 / active |
| Prepaid credit and old debt | 0 / 25 / 10 | 0 | 0 / 25 / 10 / paused | 0 / 15 / 0 / active |
| Four offline hours, funded active gear | 0 / 10 / 0 | 120 | 90 / 0 / 0 / active | 80 / 10 / 0 / active |

Paused income 10/rate 10/debt 10 cannot recover after just one earned payment: it still needs the one-hour buffer. The second actual payment makes recovery affordable. Already-suspended time is not retrospectively reactivated or charged; the existing pause policy remains. Automatic recovery happens when state/commands next materialize, including after restart, rather than through a new human background scheduler. This deliberately avoids inventing fees or erasing accrued liabilities.

Tests cover a wallet raided immediately before payment, purchase/sale racing settlement, two submissions with one command ID, multiple concurrent reads, retained overflow, legitimate quest-credit recovery, state/application reconstruction, rollback after an injected funding interruption, unchanged Vault, ledger reconciliation and one-time lot settlement. For each financial case:

`final wallet + reserve + retained = starting wallet + reserve + legitimately earned gold − actual upkeep paid ± real trade transfers`.

## Unicode and new-content policy

Only **new character display names** are normalized to NFC. Existing `accounts.username`, credentials, sessions, names and UUID relationships are never rewritten. New names have 2–28 graphemes, at most 96 Unicode code points, 256 UTF-8 bytes and 12 code points in one grapheme. Appropriate accents, native scripts, symbols, flags and valid pictographic ZWJ sequences are allowed. C0 controls, lone surrogates, bidi/default-invisible controls, deceptive markup and Latin mixed with Greek/Cyrillic lookalikes are rejected. Native Greek/Cyrillic names remain allowed. Role-only labels such as Administrator/Official Support/Kingdom Come are reserved after normalization.

Examples accepted: `Éowyn ⚔️`, `勇者 🐉`, `Марина`, `Αλέξανδρος`, `👩‍🚀 Star`, `🇬🇧 Knight`. Canonically decomposed `Éowyn` becomes `Éowyn`. Hidden controls, `Pаul` with a Cyrillic `а`, `<script>…`, oversized clusters and lone surrogates are rejected. Names continue to use escaped templates/JSON in Profile, saved reports, personal feeds and rankings.

`realm-content-1` compares **new** names/comments/broadcasts using compatibility normalization, diacritic/default-format removal for comparison, a finite lookalike map, common leetspeak and bounded separator/repeated-letter handling. It rejects whole-word explicit variants of fuck, shit, cunt and the listed anti-gay/anti-Black slurs. The exact finite list is in `content-policy.ts`; no aggressive substring block on ass/cock/hell, Scunthorpe, Nigel, assistant, grass or shiitake-like ordinary words. Returned messages ask the player to choose another name/reword their message. Text is not silently censored.

Rejection audit: server UUID/time, scope, `realm-content-1`, reason code, optional actor/command UUID. No rejected raw content, credentials, IP address or content digest. Failed command transactions roll back gameplay first; the metadata insert survives separately and repeated identical command IDs deduplicate by actor/scope. Registration refusals have no created player identity and are separate attempts. Existing mute/report/rate-limit, CSRF/Origin/auth checks and successful historical command replays remain authoritative.

Limitations: this is a deliberately finite English-language policy, not multilingual abuse detection or a complete UTS #39 confusable-name registry. Contextual false positives (including the British cigarette sense of one blocked word) can occur; reports/owner moderation remain necessary. Ordinary duplicate display names remain allowed as before; identity is UUID-based, not name matching. The application only appends rejection metadata, but the existing database owner can still modify it; this is not PR #13's tamper-resistant operator audit system. No new moderation privileges or public audit/admin endpoints are introduced.

## Notification semantics and migration

For normal human acceptance, the saved `actor_id` is the accepting character and `target_id` is the inviter. Only `accepted` records targeting the signed-in inviter qualify. Self actions and events involving a development bot cannot create acceptance unread counts. The actual membership/acceptance commands and idempotent event creation are untouched. Home shows “Character accepted your army invitation.” and links to that character and Army Dashboard.

Read state uses existing exact `(character_id, kind, event_id)` markers and authenticated, Origin/CSRF-protected acknowledgements. Home and Dashboard acknowledge only displayed qualifying records through the existing visible-event observer; no-JavaScript players use “Mark shown events read.” GET, opening a tab, or viewing someone else's Profile does not silently mark events read. Pending incoming invitations retain the independent Recruit badge until resolved. Multiple sessions, retries, simultaneous timestamps and restart do not duplicate or clear unrelated events.

Migration **`022_player_foundations.sql`**:

- Widens only the display-name column (`characters.name`) to `varchar(96)`; no data update.
- Creates indexed `army_attention_starts` with an installation baseline per existing character and an AFTER INSERT trigger for new notification-state rows. Old acceptances never become a historical unread backlog. A new table is used so existing `notification_state` rows and their preservation hashes remain unchanged.
- Extends the existing read-kind constraint to `army_accepted` and adds a targeted accepted-event index.
- Creates the minimal content-rejection metadata table/indexes.

No destructive migration, reseeding, bot regeneration or startup action. Populated 021→022 tests preserve every old business row byte-for-byte: 453 accounts (including Development Knight fixture), all 450 bot identities, sessions, wallets/Vault, inventory/Land, receipts, old messages, battles, tutorial and existing read markers. Immutable-rule and migration registries only append; replay changes nothing. The production restored-copy preservation checker is **unchanged**.

The protected protocol accepts **exactly `022_player_foundations.sql`**, with current verification fixtures/container expectations updated. Historical 019/020/021 baseline tests remain. Focused tests reject stale 020/021, unexpected 023, missing/null schema, wrong candidate, 449/451 or missing/inactive bots and invalid restore evidence. Encryption, independent recovery, signatures, candidate identity, deployment identity, backup retention and owner authorization are unchanged. Existing older code can read the widened column, but validated rollback needs the established protected procedure; there is no automatic schema downgrade.

## Focused evidence and final verification

- Policy/accounting/research plus affected alpha/Phase 4.5 regressions: **42 passing, no skips**.
- Social/invitation tests: human/bot orientation, retries, IDOR, CSRF/Origin, cross-session/reconstructed-app read state, HTML/API content enforcement and escaped Unicode in Profile/feed/report/rankings.
- Populated migration/replay: `tests/phase51d-preservation.test.ts`; machine evidence is included in the normal CI artifact as `phase47-phase51d-preservation.json`.
- Focused release protocol: **28 passing**, no skipped checks.
- Static production-template check: **99 passing**, 77 fixture renders; TypeScript and build pass.
- [Browser evidence](browser.json): 11 actual local-route captures, 320/390/430/1024px, no horizontal overflow, five 44px+ navigation targets, keyboard navigation/reduced motion, actual hourly recovery and real JavaScript/native exact-event acknowledgements. No external network or production accounts. The browser check also runs in the normal test suite.
- One final exact-head normal CI result and commit are recorded in the draft PR after it completes. That suite includes all existing PostgreSQL, browser/audio, marketplace/combat/bounty, bot automation, migration/preservation, production-container and independent release-worker tests, dependency audits and protected-release regressions. No protected production workflow is dispatched.

### Review captures

| Width | Personal acceptance and badge | Recruit → intact Dashboard |
|---|---|---|
| 320 | [Home](screenshots/320-acceptance-home.png) | [Dashboard](screenshots/320-army-dashboard.png) |
| 390 | [Home](screenshots/390-acceptance-home.png) | [Dashboard](screenshots/390-army-dashboard.png) |
| 430 | [Home](screenshots/430-acceptance-home.png) | [Dashboard](screenshots/430-army-dashboard.png) |
| 1024 | [Home](screenshots/1024-acceptance-home.png) | [Dashboard](screenshots/1024-army-dashboard.png) |

Upkeep: [paused before earned payment](screenshots/390-upkeep-before-payment.png), [authoritative next-payment breakdown](screenshots/390-upkeep-payment-breakdown.png), [automatically resumed after payment](screenshots/390-upkeep-after-payment.png). Synthetic names/balances only; no Phase 5.1C redesign or artwork change.

## Research and remaining owner decisions

[COMBAT_BOUNTY_DECISIONS.md](../../COMBAT_BOUNTY_DECISIONS.md) and the reproducible [numeric model](combat-bounty-model.json) distinguish existing defensive XP from a possible future 1%/5,000 exposed-wallet defensive transfer. They model repeat/poor/unequal/alt cases, conservation, resource-limited 1/6-hour stress sessions and levels 8–200. Bounty placement and claim eligibility are reviewed separately, including escrow/fee/refund conservation and concurrency. These are recommendations only: no defender reward, bounty range, combat balance, bot population or future expansion policy is installed. Owner decisions are needed before any such future implementation; PR #13/#20/#25 remain independent.
