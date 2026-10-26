# Phase 6 — Living economy and player competition

Development candidate based on `67ba668` (merged PR #39). No production access,
merge, deployment, automation activation, rare-drop activation or Hudson grant
was performed. This is one coordinated review candidate; the existing level-100
activation, 900 identities, catalogs, artwork and economic policies stay intact.

| Area | Development status | Production boundary |
| --- | --- | --- |
| New-cohort purchases-only | PASS: real wallet-funded purchases; combat requires a prior purchases-only stage and a distinct review | UNVERIFIED live state; separate exact-plan authorization required |
| Economic evaluation | PASS: reproducible 7/30-day planner models, attacks/outages, 900-bot SQL preservation and read-only aggregate monitor | HOLD any spending/funding adjustment; 169 timing-starved bots documented |
| Quest rarity | PASS: existing draws/accounting finalized, saved discovery UI, separate append-only authorization | BLOCKED on explicit rate/equipment approval and fresh signed recovery; remains off unless separately authorized |
| Hudson | PASS: existing exact 15/15/15 grant, item/UUID-specific entitlement, retries/rollback tests; CLI now requires current signed recovery | BLOCKED on private target inspection and exact owner approval; no grant executed |
| Cross-level bounty hunts | PASS: explicit exact-contract intent; ordinary attacks/Revenge retain level limits | Functional after an approved protected deployment |
| Competitive history/UI | PASS: verified human finishing deaths, directed rival records, seven paginated human halls, public profile statistics and deduplicated bounty notifications | Historical claims preserved; only reliable finishing evidence backfilled |
| Invitation wait | PASS: different recipients may be invited immediately | Existing 20/day, 24-hour same-person reinvite, pending/membership/capacity/authentication checks remain |
| Recovery/release | Schema **026_living_competition.sql**, strict pin and rejection tests updated | Mandatory exact-head CI/recovery evidence is linked in the draft PR; no protected release dispatched |

## Player-facing changes

- Bounty List attacks carry the exact active contract ID. Server authorization
  bypasses only ordinary rival-level matching, preserving costs, qualification,
  ally/sponsor exclusions, bot flags, Health, Stamina, escrow and claim locks.
  A 100→5 or 5→100 hunt is valid. An expired, mismatched or closed contract fails
  without turning into an ordinary attack. Attack Again polling retains that
  context only while valid. Revenge remains ordinary range-bound combat.
- Human bounty finishing actions with saved positive-to-zero Health evidence
  count as kills/deaths, even if the defender wins the combat calculation.
  Ordinary defeats/knockouts do not create deaths. Existing historical claim
  counters and reports are not rewritten. Duplicate claims/events are rejected.
- Public Profiles show kills, deaths, K/D and claims; existing Stats retain wins
  and losses. Rival histories add attack/defense direction and finishing records
  to existing five recent encounters, ordinary gold and bounty history.
- Hall categories: victories, kills, K/D, claims, Most Wanted, Land and level.
  Humans only, 20 entries/page; stable score/date/UUID ordering (level uses XP
  before date). K/D requires kills and deaths; zero-death killers are shown as
  undefeated on Profiles and remain eligible for the kills hall. Most Wanted
  means current unexpired bounty gold, not an invented lifetime achievement.
- Bounty history shows claimant, time, reward and known combat/death evidence.
  Saved private combat links remain limited to participants. Sponsor visibility
  follows the existing public model. No new anonymity policy is introduced.
- New bounty placement/claim unread events go to the actual target and sponsor
  as appropriate, never the claimant's own action. A finishing claim replaces
  that attack's badge; other incoming attacks remain separate. Installation-time
  starts prevent historical bounty spam and preserve existing unread attacks.
  Existing visible-event observer and CSRF-protected native read form are reused.
- Rare discoveries show the real item, artwork, quantity, Attack/Defense/upkeep
  and inventory link in the saved quest confirmation. Existing reward audio and
  reduced-motion behavior remain; no new art or sounds were introduced.

## Compatibility and integrity

026 adds derived statistics/facts, indexes, new attention start markers and a
separate rarity authorization journal. It only widens the existing notification
kind check; no old business rows are rewritten. Migration uses the established
transaction/locking/replay mechanism. Reliable historical deaths are derived;
ambiguous old claims retain their original credit without invented deaths.
Historical 019/022 read-only rehearsals retain their original schema baselines;
readers omit uninstalled competitive additions, but an installed, incomplete 026
fails closed. First-page halls use at most three bounded business queries.
Append-only event guards reject rewrites and fabricated unsupported death facts.
They do **not** defend against a database owner who replaces triggers/functions
or fabricates all underlying trusted records. No public administrative endpoint
or new privilege was added.

The original expansion activation and pending immutable rarity proposal are
unchanged. Later enable/pause uses exact database/policy/plan identity, serialized
state transitions and an append-only journal. Approval expiry gates execution,
not the duration of an already approved ongoing policy. CLI verifies existing
signed recovery and its exact identity again before rarity or Hudson writes.
Historical draws cannot be rerolled under a later authorization. Client draw,
reward, quantity and upkeep fields cannot authorize an acquisition.

Future clan support can aggregate immutable character UUID pairs, battle IDs,
bounty IDs and timestamped competitive facts. No clan, season, faction war,
new currency, defender reward or combat formula is implemented here. Existing
bounty placement eligibility (including placement level range), 1–10,000 amounts,
10% listing fees, one active contract/target and 50 placements/target/rolling day
remain. The unverified historical 25/250 figures were not adopted.

## Evidence and reproduction

- [Economic/rarity findings](ECONOMY_AND_RARITY.md), [private operation sequence](OPERATIONS.md).
- [Models](models.json), [169-bot slot diagnosis](stalled-diagnosis.json), [browser assertions](browser.json).
- New tests: phase6-combat, experience, rarity, preservation, models and browser.
  Existing E2b Hudson, population, financial, security, interface and protected
  recovery suites remain required. The final exact-head CI link/result belongs
  in the draft PR rather than a self-referential source commit.
- Disposable local PostgreSQL 18 tests verify baseline 025→026 upgrade and replay
  with all 450 originals and every old business row; 900-bot append/publication,
  purchases-only work, pause races, continued hourly settlement and unchanged
  identity/financial histories are independently exercised. Protected recovery CI
  performs actual encryption, independent decryption, restore/replay for 450/900.

```sh
node --import tsx scripts/phase6-models.ts
# Local/designated disposable *_test database only:
node scripts/ci/run-tests.mjs --files=tests/phase6-combat.test.ts,tests/phase6-rarity.test.ts,tests/phase6-experience.test.ts,tests/phase6-preservation.test.ts --workers=1
node --import tsx scripts/browser-phase6.ts
```

Set `TEST_DATABASE_URL` to the approved disposable fixture and
`BROWSER_EXECUTABLE` to local Chromium. No production URL is accepted by these
fixtures. Browser captures use actual authenticated commands, saved reports and
server-side test-process-only RNG control; no client/production draw switch exists.

| Screen | 320px | 390px | 430px | 1024px |
| --- | --- | --- | --- | --- |
| Hall | [view](screenshots/320-champions.jpg) | [view](screenshots/390-champions.jpg) | [view](screenshots/430-champions.jpg) | [view](screenshots/1024-champions.jpg) |
| Rival Profile | [view](screenshots/320-rival-profile.jpg) | [view](screenshots/390-rival-profile.jpg) | [view](screenshots/430-rival-profile.jpg) | [view](screenshots/1024-rival-profile.jpg) |
| Bounty history | [view](screenshots/320-bounty-history.jpg) | [view](screenshots/390-bounty-history.jpg) | [view](screenshots/430-bounty-history.jpg) | [view](screenshots/1024-bounty-history.jpg) |
| Bounty report | [view](screenshots/320-bounty-report.jpg) | [view](screenshots/390-bounty-report.jpg) | [view](screenshots/430-bounty-report.jpg) | [view](screenshots/1024-bounty-report.jpg) |
| Rare discovery | [view](screenshots/320-rare-discovery.jpg) | [view](screenshots/390-rare-discovery.jpg) | [view](screenshots/430-rare-discovery.jpg) | [view](screenshots/1024-rare-discovery.jpg) |

Screenshots are synthetic fixtures, not production observations. They preserve
current artwork resolution, including Hudson's separate outstanding framing
review. No unsupported claim of live activation or production performance is made.
