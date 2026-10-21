# Verification, security and preservation

All database and browser tests use disposable local PostgreSQL 18 and synthetic accounts. No production or Railway service/database was contacted; no release workflow was dispatched. No keys, credentials, deployment settings or protected release logic were changed.

The results below describe the approved report/audio baseline at `a21b2b0`. The subsequent owner-requested **bot-only development checkpoint has [separate verification](bot-only/VERIFICATION.md)**, including the new full regression run, paid transactions and an actual populated dump/restore rehearsal. Baseline screenshots and runtime changes are retained exactly; the archived human army alternatives were rejected by the owner and remain offline historical evidence only.

## Results

The clean full suite completed with **461 tests: 460 passed, 0 failed, 1 existing hosted-runner-only skip** (565.15 seconds). Eight new focused cases are included. [Machine-readable results](verification/automated.json).

| Check | Evidence |
|---|---|
| TypeScript and production build | `npm run typecheck`, `npm run build` |
| Static security/rendering contracts | 99 checks, 77 production EJS fixture cases |
| Focused Phase 4.9.1 tests | 8 pass: report perspectives, real snapshot equipment, unknown history, large-loadout disclosure/XSS escaping, default/fallback sound hints, army model equivalence/limits, policy identity, populated preservation |
| Populated no-op migration and application restart | [66 entire tables, 452 accounts, 450 bots unchanged](verification/preservation.json); original cookies remain valid, enabled/39 and muted/22 retained, repeated migrations no-op |
| Real compiled-server process restart | Existing `scripts/test-restart.ts` passes with a separate disposable database: sessions, progression, inventory, Vault, Land, Calling, army invitations, social records, rankings, rivalry, achievements and tutorial retained; exactly three due human/bot Land periods settled once |
| Navigation/audio browser | [Every Web Audio source start is instrumented](verification/navigation-audio.json); full five-tab navigation, back/forward/reload, forbidden fallback events, delayed decode/mute, departure and simulated persisted-page return |
| Approved orchestral playback | [Four complete cues plus decisive alias](verification/orchestral-audio.json); gesture gate, saved mute/volume, no replay, duplicate suppression, hidden page, interrupted fetch/retry |
| Report mobile/desktop browser | [9 groups, 10 screenshots](verification/reports-browser.json), 320/390/430/1024px, actual resolved encounter, both saved loadouts open, current-resource disable, keyboard disclosures, 44px attack buttons, five tabs, zero overflow/browser errors |
| Existing competition browser | [Phase 4.6, 56 responsive visits](verification/competition-browser.json) |
| Existing gameplay/security/recovery browser | [Phase 4.7, 64 responsive visits](verification/gameplay-browser.json), transactions, lost response, exact retry, expired session and login restoration, healing, quests, gear, tutorial and reduced motion |
| Marketplace browser | [Phase 4.8](verification/marketplace-browser.json), double taps, one-item/bulk, three simulated idle hours, interrupted completion, exact sale refund, session expiration and compact Land density |
| Actionlint | Existing workflows validate; no workflow edits |
| Scope/policy/assets | [Matching Git object IDs](verification/scope.json) for workflows, deployment, migrations, rulesets, artwork/audio, dependencies and combat/economy runtime |
| Balance analysis | 3,744 deterministic matrix rows, 11,232 matchups, all 441 roll pairs each; 48 paced accepted-policy sessions with actual resource recovery, losses, level-up refills, finite purses and conservation assertions |

The first full pass caught two presentation compatibility failures: the report's established bounty-vs-loot wording and its definition-list damage markup. Both were corrected while preserving the requested secondary damage layout. The bounty and training suites then passed; a clean full pass was run after those corrections. The populated fixture also needed its existing level-milestone entitlements reconciled before taking a complete Phase 4.9 baseline. No migration/protection was relaxed to make it pass.

## Security review

- No reward, participant, loadout, gold, XP or eligibility calculation moved into the browser. Battle rendering reads the same authorized saved record; historical omissions stay unknown. Current holdings cannot replace a saved loadout. Enemy gear names and other user content use escaped EJS output; unknown IDs receive an explicit neutral placeholder.
- Attack Again/Revenge retain authenticated POST, Origin/CSRF checks, immutable command IDs, current target/Health/Spirit checks and server locks. The existing concurrent bounty, trade, healing, purse-transfer, receipt replay and anti-farming regressions remain in the full suite.
- No schema change, balance correction, bot provisioning, realm initialization or account/preference backfill was added. New-account default mute changes registration only. Existing password/session hashes, inventories, wallets, Vaults, armies, historical reports, Land journals, achievements and tutorial records are covered by whole-table preservation.
- Audio playback is presentation-only. It requires a meaningful confirmed hint or explicit preview, respects mute/volume/gesture gates, suppresses replay and cancels asynchronous work when departing. A playback retry does not call a game command. Old click/navigation cue IDs cannot select the historical sprite segments.
- Release/backup/recovery/operator code and permissions are unchanged. PR #13 remains open, draft and untouched. There is no new administrative endpoint or production data operation.

## Limits / owner checks

- The original live honk is not reproduced or conclusively attributed by this local audit. The pre-fix trace had audio-context operations but no audible source starts; see [the investigation](AUDIO_INVESTIGATION.md). Local corrected navigation is silent at the source-start level. A separately authorized deployment and physical-device verification are still necessary before declaring the live symptom fixed.
- Chromium mobile emulation verifies layout, AAC decoding, gesture/focus behavior and scripted visibility/history events. It does not certify iPhone Safari, physical speakers, hardware mute, mobile OS suspension or actual bfcache retention.
- The hosted-runner network-namespace test is host-specific and is skipped locally by its existing guard. Its fail-closed controller regressions still run; no guard was bypassed.
- New army curves and bot strength adjustments are **proposals**, not an adopted combat policy. The owner rejected uncapped-linear and logarithmic human models. Only the separately documented funded bot-loadout experiment proceeds; original human rules remain unchanged. No free wealth, members, points or equipment are granted.
- These checks support controlled alpha review; they do not claim production security or certify current live data/configuration.

## Reproduce locally

Use a **new disposable local** PostgreSQL database whose name ends `_test`; never substitute the live connection. Set `TEST_DATABASE_URL` securely in that test shell, then run from `knights-reforged/`:

```sh
npm ci
npm --prefix deployment/release-tools ci
npm run typecheck
npm test
npm run build
npm run check:static
actionlint
npx tsx scripts/phase491-army-audit.ts
npx tsx scripts/phase491-paced.ts
npx tsx scripts/browser-phase491-reports.ts
npx tsx scripts/browser-phase491-audio.ts
```

For the existing orchestral/browser regressions, use the already documented local Chromium configuration; this environment uses `/usr/bin/chromium`. The new scripts confine browser requests to their own loopback app. `scripts/test-restart.ts` needs **another isolated disposable `_test` database**, because it intentionally edits synthetic clock fixtures while testing restart settlement. No command above is an owner production-operation instruction.
