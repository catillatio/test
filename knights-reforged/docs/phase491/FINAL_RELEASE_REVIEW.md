# Phase 4.9.1 — final alpha release-readiness review

[Owner decision 6306433839](https://github.com/catillatio/test/pull/14#issuecomment-6306433839) approves finalizing PR #14 now. The runtime remains the accepted battle-result/audio baseline `a21b2b0`. This finalization adds release documentation and evidence, not a new game policy. Merge and production promotion require separate owner authorization.

## Frozen release scope

| Included | Preserved / excluded |
|---|---|
| Victory/Defeat hierarchy, prominent actual ordinary gold/XP, separate bounty, secondary damage/level progress | No reward, combat formula, economy or historical-record rewrite |
| Both armies' recorded participating gear; category previews and expandable additional real items | No present-day inventory substituted for an absent historical loadout; unavailable values say “Not recorded” |
| Prominent Attack Again/Revenge with current Spirit/Health and normal eligibility | Existing authentication, CSRF/Origin, idempotent commands, cooldowns and authorization remain authoritative |
| Routine gestures no longer create/resume/preload the audio engine; legacy click fallback removed | Approved orchestral cue mappings/recording bytes, reward deduplication, autoplay protection and saved volume/mute retained |
| Pending reward audio cancelled on departure, mute and suspension; history/reload does not replay it | No background music, new audio assets or copyrighted game-asset substitution |
| Newly registered humans start muted at the existing default volume | No existing account preference update, credential/session reset or backfill |

The [scope audit](final-release/scope.json) compares against current `release/production` **793f747a7920a7b1dc000230a3050482e98393f2** (merged Phase 4.9). Exactly **nine runtime files** differ: `src/app.ts`; `public/phase491.css`, `sound.js`, `status.js`; `views/layout.ejs`, `report.ejs` and three battle partials. The sole application-code change is the new-registration sound default. The approved runtime and ten screenshots remain byte-identical to `a21b2b0`.

All **22 audited protected objects** match production, including deployment/release, every workflow, migrations, rulesets, Dockerfile, Railway configuration, dependencies/lockfile, authentication/configuration, combat/commands, bot provisioning, trade, Land/economy and progression. Runtime artwork and audio directories are identical to production. No rejected audition or new APK-derived asset enters the release.

## Bot research is inactive, not a release gate

The 18-bot canary, five purchase candidates, earlier models and disposable-copy results stay archived as documentation/test evidence. **No bot calibration is adopted, applied or scheduled.** No additional balancing experiment or calibration purchase was executed during finalization. Ordinary regression tests retain pure model/guard assertions; they do not call the database calibration executors. The dedicated model/report/copy-calibration entrypoints were not run.

The game Dockerfile compiles only `src` and copies only runtime assets/catalogs/migrations and whitelisted deployment files. Research scripts, tests and documents do not enter the game image. The controller's verification-worker upload whitelist excludes those research paths, and the worker's final `/bundle` also excludes them. No runtime, migration, start command, package lifecycle hook or workflow invokes the experiments. Synthetic manifest IDs are not production authorization.

Human combat/army participation, bot difficulty/finances, wallet-funded gold, `bot-combat-rewards-2` **65% XP / 100–85–70–55–40 repeats**, quests, Land, upkeep, recruitment and bounties remain unchanged. Future living-bot progression/army work belongs to Phase 5. PR #13 remains inactive and untouched; the username correction is withdrawn and Gray requires no moderation.

## Verification and preservation

[Machine evidence](final-release/verification.json) records the completed exact executable-source CI at **c8ac08b79ff5ae73ebe30d06ec54dc674f263221**, [run 39532411306](https://github.com/catillatio/test/actions/runs/39532411306), and fresh local finalization checks. Final documentation-head CI must also pass before marking PR #14 ready; its exact SHA/run are recorded in the PR checks/description. Neither run is a protected production-release dispatch.

| Check | Result / boundary |
|---|---|
| Full PostgreSQL-backed CI suite | **474 tests, 474 passed, 0 failed, 0 skipped**; includes report authorization/history/XSS, default mute, concurrent/retried economy/combat, security, preservation, recovery/signing and diagnostic regressions |
| Fresh local TypeScript / production build / static / actionlint | PASS; **99 static checks, 77 EJS fixtures**, no workflow change |
| Fresh production dependency audits | Game and controller: **zero reported vulnerabilities**; no dependency change |
| Populated preservation | Existing [whole-schema verification](verification/preservation.json): **66 tables, 452 accounts, 450 bots**, all business rows unchanged through no-op migration/replay, reconstructed app/session reads and existing enabled/muted preferences. The same regression remains in the full CI suite. |
| Fresh compiled-process restart | PASS; accounts/sessions, inventory, progression, Land, Vault, social/army/bounty/tutorial/achievement/rivalry/ranking state retained; three missed human/bot income periods settled exactly once across restart/repeated reads |
| Fresh real navigation/audio browser | PASS; touch and mouse through all five tabs, full-page transitions, reload and back/forward produce **zero Web Audio source starts or audio-engine creation/resume**. Confirmed rewards/Settings preview still play; repeated events, delayed decode, mute, navigation and history suppression pass. [Trace](final-release/navigation-audio.json) |
| Fresh full orchestral playback | PASS; unchanged approved arrangements play fully, one cached AAC sprite, gesture gating, volume/mute persistence, interrupted-fetch recovery and deduplication. [Evidence](final-release/orchestral-audio.json) |
| Fresh report browser/accessibility | PASS; **9 groups / 10 temporary captures** at 320/390/430/1024px, actual saved rewards/loadouts after inventory changes, no horizontal overflow, keyboard details, five tabs, ≥44px follow-up buttons, zero-Spirit Revenge blocked. Approved tracked screenshots remain untouched. [Evidence](final-release/reports-browser.json) |
| Exact-code production container | CI PASS: **21 groups**, non-root image, no published ports, secure cookies/logout/Origin/CSRF, controlled migration, native restore/replay, session/state continuity and synthetic operator-tool regressions. No operator activation or live mutation. |
| Exact-code independent recovery worker | CI PASS: **15 groups**, separate PostgreSQL clusters, encrypted export/independent download/decrypt/archive/restore/replay, conditional immutable objects, corruption/TLS/same-cluster/replay/storage rejection, current signed candidate/changed-copy rejection and read-only post-verification. All credentials/data are synthetic. |

The local browser rerender changed only its temporary screenshot output directory, leaving every assertion and approved asset unchanged. Local data is disposable and synthetic. No production records, service settings, keys or credentials were inspected. Automated results support controlled alpha testing; they are not a blanket security certification.

## Blockers versus alpha limitations

**Code/release-preparation blockers:** none identified in the completed checks. Mark ready only after the final PR head's complete CI is green and the base/head remain as reviewed. Owner merge approval is still pending.

**Mandatory future promotion gates, not waived:** separate owner release authorization, resulting production merge commit's successful **push** CI, existing autodeploy-disabled/private-network/protected-environment configuration, valid established recovery/signing setup, fresh actual encrypted backup, independent separate-cluster restored-copy verification, GitHub retention and independent retained-artifact checks, exact-candidate signed pre-deploy approval, health and saved-realm post-verification. These are not claimed verified live by this development task. Any failure blocks promotion.

**Documented alpha limitations:**

- The original audible live navigation “honk” did not reproduce in the permitted local baseline, so its exact device/runtime origin remains unconfirmed. Corrected paths are instrumented silent locally. Physical Android Chrome/iPhone Safari, old restored tabs, hardware mute, phone output and actual OS suspension remain owner device checks. The new cache revisions require a future authorized release before affecting live browsers.
- Old battles without saved equipment/XP/damage cannot gain invented historical detail. The UI clearly identifies missing data. On 320px screens, the complete report/follow-up section still requires scrolling.
- Existing easy bots, large-army advantages, legitimate 1-XP low-strength wins, finite depleted purses and provisional repeat-floor/farming economics remain unchanged. They do not justify activating the archived calibration. Further work belongs to separately reviewed Phase 5 design.
- Browser viewport/keyboard/reduced-motion checks do not certify physical-device or full assistive-technology compatibility. The owner-approved alpha visual/audio baseline remains in place.

[Approved mobile/desktop screenshots](README.md#review-material). [Existing-process protected release, stop and rollback guide](../../PHASE_4_9_1_RELEASE.md). **Pause for owner merge approval. No merge, deployment, protected workflow dispatch, production access or operator action is authorized/performed here.**
