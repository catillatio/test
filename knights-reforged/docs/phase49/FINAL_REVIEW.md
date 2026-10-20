# Phase 4.9 alpha candidate — final owner review

Scope follows [owner comment 6303697572](https://github.com/catillatio/test/pull/12#issuecomment-6303697572). Work stays on draft PR #12. PR #13 is paused and untouched. No merge, production access, moderation, workflow dispatch, deployment, configuration change or key rotation was performed.

## Delivered and reviewed scope

| Requirement | Candidate behavior / evidence |
|---|---|
| Bot rewards | Approved immutable `bot-combat-rewards-2` unchanged: 65% full difficulty XP before pair percentages, minimum 1 XP. No bot shared six-win cutoff or per-bot first-win cutoff. Actual purse transfers, 3% base, bot ceiling, Vault protections and 100/85/70/55/40 fixed-window pair percentages retained. `phase49-{rewards,xp,simulation}.test.ts`; existing paced comparisons retained. |
| Five UI refinements | Silent routine navigation/buttons; expandable Profile Stats/Income; Home Calling beside Hall; compact four-category Hall; neutral panels with identical teal resource geometry. `phase49-interface.test.ts`, UI/browser screenshots below. |
| Property art and names | Approved original keep and mine art; Gold Mine display alias with stable ID `moonwell-sanctuary`. Historical receipt names, holdings and all financial definitions remain unchanged. `phase49-properties.test.ts`, whole-schema preservation and property screenshots. |
| Musical rewards | Only the four owner-approved arrangements at `087e1a8`, packaged without musical edits. Stereo AAC: Victory/Defeat 3.9s, Quest 4.0s, Level-up 5.3s. Decisive aliases Victory. Other existing meaningful cues and priority rules unchanged. No new sound design loop. |
| Audio rights and runtime | CC0 VSCO 2 Community Edition recorded instruments, original CC0 project arrangements, pinned sources/license/score/master hashes; full source and arrangement licenses ship in `public/audio/`. The 441,263-byte sprite is loaded once per document after interaction, not on muted/fresh untouched pages. No runtime external audio or background music. |
| Administration | Gray cleanup closed solely on owner report of voluntary removal. Development Knight excluded. Username correction withdrawn entirely: no account/character changes, production inspection, operator workflow or PR #13 activation. Earlier moderation notes are explicitly inactive history. |
| Future work | Broader cosmetic overhaul, professional audio refinement, new bot systems/admin dashboard, tutorial/result cosmetic polish and level 100/200 content are deferred, not marked complete. Current progression architecture/catalogs remain unchanged. |

## Current verification

Current results are in [final-review/verification.json](final-review/verification.json), with [runtime/source audit](final-review/change-audit.json) and the individual evidence summaries in that folder. Earlier stage JSON reports remain historical and are not substituted for this candidate run.

| Check | Result |
|---|---|
| Full automated suite with real disposable PostgreSQL 18 | **453 tests: 452 passed, 0 failed, 1 hosted-runner-only namespace test skipped locally**. No PostgreSQL gameplay/preservation test was skipped. |
| TypeScript / production build / static / actionlint | PASS; **99 static checks / 77 production EJS fixtures**. No workflow edits. |
| Account/bot/receipt preservation | PASS; **66 tables, 452 accounts, 450 bots**, no business-row changes from migration/replay. Existing account/password/session/preference rows remain intact. |
| Approved audio | PASS; asset/source/license hashes, byte-reproducible packaging, historical-generator overwrite refusal, actual AAC decoding, full-length real Web Audio and five browser check groups. AAC measurements stay within 0.1 LUFS of the approved −20 LUFS target; true peaks remain below −4 dBTP. |
| Responsive browsers | PASS; **64** audio/recovery visits, **56** marketplace visits, **9** actual reduced/weak/empty-reward receipts; 19 current UI captures and 16 property captures. Widths include 320/390/430px and desktop; 44px trade/Hall targets, keyboard disclosures, reduced motion and overflow checks. |
| Production game container | PASS; **21 groups**, no published web/database ports, controlled migration, restored-copy preservation, non-root packaging, real HTTP/CSRF/Origin transactions, restart/session continuity and graceful logout. |
| Independent release-worker recovery | PASS; **15 groups**, separate PostgreSQL clusters, encrypted export, independent download/decrypt/restore/replay, immutable recovery objects, bad TLS/corrupt backup/replay/same-cluster/storage/tampered-copy rejection, signed pre-deploy and read-only post-verification. 452 synthetic accounts / 450 bots; 64 pre-020 business tables preserved. No provider contacted or database port published. |
| Compiled server restart/offline income | PASS; saved sessions, lifetime/rivalry/tutorial/achievement/account state; exactly three missed human/bot income cycles, no duplicate payments. |
| Dependencies | Zero reported vulnerabilities in game production, all game dependencies, and release-tool production audits. No dependency/lockfile change. |

The game container's checked candidate digest matches the locally compiled bundle exactly. Local Docker builds used temporary Dockerfile copies that add only session-CA secret mounts for npm/apt TLS trust; no CA entered image layers and no repository Dockerfile or release configuration changed. Initial concurrent fixture attempts hit a bootstrap timeout and disposable PostgreSQL readiness failures; their partial output is excluded from PASS totals. Completed reruns and the final independent-worker report are retained explicitly. No production assertion or timeout was weakened.

The candidate uses a **new disposable local PostgreSQL 18 database and synthetic accounts only**. Preservation checks migrate the Phase 4.8/v1 registry shape, compare every existing table before/after/replay, retain all 450 bots, replay historical receipts without charging again and reconstruct the app with saved sessions/preferences. Security coverage includes CSRF/Origin/authentication, request forgery, concurrent purchases/healing/combat, double submissions, exact-once transfers and private financial visibility. Container/release-worker fixtures exercise independent encrypted recovery and fail-closed signed migration gates without provider access.

Audio checks cover source/output hashes, full AAC decoding and end-to-end playback of approved cue lengths, gesture gating, saved mute/volume, repeated/rapid receipt suppression, foreground/background suppression and explicit recovery after a failed audio fetch. Existing shopping/background/expired-session, tutorial Step 6, battle equipment, responsive/accessibility and process-restart regressions remain required.

## Screenshots

Final captures come from rendered local synthetic gameplay, not mockups or production accounts. Screenshots show the unchanged owner-approved UI; no cosmetic redesign accompanies this checkpoint.

| Width | Home | Profile | Hall | Land | Calling |
|---|---|---|---|---|---|
| 320px | [Home](ui-review/screenshots/320-home.png) | [Profile](ui-review/screenshots/320-profile.png) | [Hall](ui-review/screenshots/320-champions.png) | [Land](ui-review/screenshots/320-land.png) | [Calling](ui-review/screenshots/320-calling.png) |
| 390px | [Home](ui-review/screenshots/390-home.png) | [Profile](ui-review/screenshots/390-profile.png) | [Hall](ui-review/screenshots/390-champions.png) | [Land](ui-review/screenshots/390-land.png) | [Calling](ui-review/screenshots/390-calling.png) |
| 430px | [Home](ui-review/screenshots/430-home.png) | [Profile](ui-review/screenshots/430-profile.png) | [Hall](ui-review/screenshots/430-champions.png) | [Land](ui-review/screenshots/430-land.png) | [Calling](ui-review/screenshots/430-calling.png) |

[Approved artwork, holdings and Buy More at 320/390/430/1024px](art-integration/README.md). [Reward/recovery browser captures](final-review/screenshots/). Broader responsive testing also covers 360/375/393/412px and desktop. Emulated viewports do not establish physical-device acceptance.

## Readiness, safeguards and alpha limitations

- **Code/preservation release blockers:** none identified by the completed candidate checks. This is controlled-alpha readiness, not a production-security certification.
- **Security findings:** no confirmed critical/high vulnerability introduced by this reviewed diff. The actual existing transaction, authorization, CSRF/Origin, replay, private-finance and signed-recovery protections were exercised; passing dependency scans alone are not the basis for this finding. Production credentials, key correspondence, service settings and current live records were deliberately not inspected.
- **Mandatory external gates:** owner review/authorization; exact resulting production merge commit's push CI; confirmed existing Railway autodeploy-disabled/private-network configuration; protected owner approval; fresh encrypted backup, separate-cluster restored-copy testing, independent retained-artifact check and current exact-candidate signed proof; health and post-deploy saved-realm checks. These remain pending for a future authorized release, not waived or claimed verified live here.
- **Known alpha limitations:** phone speakers/headphones, iPhone Safari hardware mute/autoplay and actual OS suspension need owner device testing. The sound set is accepted for alpha; professional orchestral refinement remains future work. A 5.3-second level cue can be interrupted by navigation/new results and never blocks play. The larger AAC sprite costs about 0.44 MB once loaded and roughly 11.4 MB decoded stereo PCM.
- **Economy limitations:** the approved repeat floor and sustained multi-account farming exposure remain provisional. Gold is transferred from finite exposed purses, not minted by battle; bots rebuild through their unchanged authorized income. New quotas, bot grants/wealth changes or XP rebalance were not introduced.
- **Visual limitations:** approved alpha styling/art remain the baseline; no pixel-equivalence or physical-device accessibility certification is claimed. Existing mobile/keyboard/touch/reduced-motion checks are useful evidence, not a full assistive-technology audit.
- **Scope/security audit:** release/backup/restore/signing/workflow/DB migration/startup/authentication/configuration paths and package lock are compared against `release/production`. Runtime asset provenance excludes the rejected audition and known retired APK-derived assets. No public administrative endpoint, dependency, initial provisioning or realm reset is added.

Follow [PHASE_4_9_RELEASE.md](../../PHASE_4_9_RELEASE.md) for the existing protected promotion and data-preserving rollback procedure. Pause for final owner review. Do not merge or deploy from this checkpoint.
