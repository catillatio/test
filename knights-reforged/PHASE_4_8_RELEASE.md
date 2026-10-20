# Phase 4.8 — approved alpha release candidate

The owner accepted `b3014eadf9cca6341f03d87154c689fc0ef7fa43` as the alpha visual baseline. Cosmetic iteration has stopped. This document prepares its upgrade from `release/production` at `cf4a99d378c2bf2991228ed3fcd2a25a85004ecf`; it does **not** authorize a merge or production deployment.

The release candidate retains that exact runtime implementation. Subsequent release-preparation changes are documentation and verification evidence only. The final production commit will be the commit produced when the owner authorizes merging the candidate PR. That exact commit must pass the protected production checks before release.

## Complete change audit

| Area | Candidate behavior and preservation |
|---|---|
| Shared presentation | Approved compact Home, Armory, Land, Quests, Battle, Profile, Recruit, Vault, Tutorial and Settings styling. Five bottom tabs, Home-only Land access, player links and accessibility labels remain. Home's visible heading is Recent Activity; backend event names are unchanged. |
| Marketplaces | Single-item Buy/Sell is primary; secondary Bulk and private Buy More receipts use the existing financial commands. Single/bulk controls share pending intent and command identity. Fresh identity/CSRF checks, duplicate suppression, lost-response recovery, idle persistence and expired-session recovery remain. Prices, refund formulas, upkeep, ownership and spending limits are unchanged. |
| Land | Existing holdings, hourly schedule, offline accrual, partial-period eligibility and journals are unchanged. Collapsed Gold Flow displays authoritative signed net income and payment countdown. |
| Bot reward eligibility | The approved fix counts **rewarded attacking victories**, rather than losses, against the existing bot allowances. A historical loss flag is ignored without rewriting the record. One rewarded victory per bot and six in the rolling daily window remain; repeated eligible victories retain the existing minimum XP and can correctly pay zero ordinary gold. Human loot/XP formulas, Vault protection, bounty escrow and all catalogs are unchanged. No bot wealth correction, grant or reseed runs. |
| Tutorial / recruitment | New public registration opens the optional Tutorial once. Existing progress, Skip/Resume/Replay, eight objectives and actual completion evidence persist. Contextual highlighting and copyable recruitment codes do not spend resources or change consent/capacity rules. |
| Settings / sound | Newly registered public humans receive enabled preferences, still requiring a browser gesture. Existing mute/volume rows and legacy muted fallback remain. Settings autosave uses existing authenticated, idempotent commands. Runtime audio bytes are unchanged from Phase 4.7. |
| Competition / social | Hall of Champions, rivalry history, Revenge, battle reports, achievements, comments, moderation and broadcasts remain. Recent Rivals UI is removed as requested; durable backend/history remain. No broadcast is automatically hidden. |
| Artwork | Approved original generated Land/scenery/navigation assets and original CC0 SVGs replace the historical APK-derived runtime images. Property identities, prices and other game values come from the existing catalog, not the mockup. |

Only `src/app.ts`, `src/auth.ts` and `src/commands.ts` differ in the TypeScript server implementation. The review covers their registration destination/preferences, bounded read-only Bulk selection, removal of the unused Recent Rivals query, and victories-only bot eligibility. Session, authentication, authorization, financial helpers and schema/ruleset implementations are unchanged.

See [the accepted visual review](docs/phase48/FINAL_POLISH_REVIEW.md), [bot economy audit](docs/phase48/BOT_ECONOMY.md), and the release-readiness evidence under `docs/phase48/release-readiness/`. Earlier Stage 1/mockup documents are historical review records, not the final release status.

## Migration and player-data preservation

- **Zero new migrations.** The schema head remains `020_game_feel.sql`. Existing migration files and immutable rulesets are byte-identical to production.
- The existing controlled pre-deploy command remains `node deployment/migrate.mjs`. It requires the current signed approval before opening the source pool, verifies the separate restored copy, and replays the existing migration runner. Do not skip it merely because this upgrade adds no SQL file.
- Startup remains `node deployment/start.mjs`, with no initialization, provisioning, seed, account grant, wallet reset or bot regeneration. It checks installed schema/rulesets and starts the existing passive-income worker.
- Existing account/password/session rows, wallets, Vault, inventories/lots, Land, income history, armies, 450 bot identities, bounties, achievements, tutorial state and combat/social/competition history must remain.
- Normal gameplay and due income can still change balances legitimately. The upgrade does not reset or recalculate previously earned rewards.
- The populated Phase 4.7 fixture checks all 66 tables across migration replay and reconstructs the application with the saved session. Compiled-process restart tests cover offline human/bot income and saved gameplay state. The protected worker must additionally verify the **actual new backup's restored copy** during the authorized release.

## Release, recovery and security safeguards

All `.github/workflows/`, `deployment/`, Dockerfiles, `.dockerignore`, `railway.json`, migrations, rulesets and both dependency lockfiles are unchanged from `cf4a99d`. Action references and the Railway CLI version/checksum remain pinned. No SSH trust change or alternate deployment route is introduced.

The existing protected workflow still requires:

1. Manual dispatch from `release/production` only, a protected current commit, and a successful **push** run of `Kingdom Come checks` for that exact commit.
2. The existing production environment's owner approval, production-only branch policy and disabled administrator bypass, before release secrets are available.
3. Authenticated Railway deployment identity checks for the expected project, environment and worker/game service. Variable staging uses the established no-deploy operation; the candidate is uploaded only by the controller.
4. Read-only source status and `pg_dump`; an independent PostgreSQL cluster, lock, unused copy name and sufficient temporary capacity.
5. Age encryption to the existing owner recipient plus an ephemeral verification key. The owner private age key never enters Actions or Railway.
6. Conditional encrypted export, independent download, ciphertext verification, decryption back to the exact archive, archive validation and isolated restore. The restored copy is migrated, compared table by table, and replayed without changing existing business rows.
7. Mandatory Actions recovery-artifact retention, independent artifact download, and `check-recovery.mjs` validation binding the retained ciphertext to this exact candidate.
8. The existing `KINGDOM_BACKUP_KEY_VERIFIED=true` owner attestation, signing/public-key correspondence and a fresh Ed25519 proof bound to the candidate digest/SHA, environment, services, databases, restored copy, artifact and expiry.
9. Signed proof verification inside pre-deploy before source migration, followed by the separately restored-copy preservation check. The restore URL remains required by the existing proof; the controller supplies a fresh copy name for each run. Do not manually reuse an old copy name or expired proof.
10. Successful exact-deployment status and `/healthz`, followed by private read-only realm verification and anonymous login rendering. No seed or initialization command runs.

The `/healthz` response intentionally retains `release: "phase4.7"`: this is the unchanged controller's compatibility marker. **The exact new 40-character commit SHA**, ready status and matching successful Railway deployment identify the Phase 4.8 candidate. Renaming that marker alone would break the established guard.

The last successful protected promotion was [run 39353372794](https://github.com/catillatio/test/actions/runs/39353372794) on `cf4a99d`; it passed promotion and post-deployment checks, not just a backup-only rehearsal. That is historical evidence, not a fresh authorization or backup for Phase 4.8.

## Assets and audio

- The current public tree contains no matches for the 27 distinct image hashes recorded in the three retired APK manifests. The original copied APK image paths are removed. Historical provenance remains in documentation/Git history.
- Runtime `public/audio/` is byte-identical to production. The Kenney CC0 audition is **not adopted**: it remains under `docs/phase48/audio-audition/`, has no runtime reference, is not a public asset, and is excluded from both final images. Source screenshots/mockups and other documentation are likewise excluded from runtime packaging.
- Original replacement provenance and checksums are recorded under `public/art/land-review/` and `public/art/remaster-ui/`. Generated project artwork is documented as such; no exclusive copyright or third-party redistribution permission is invented.
- Saved mute/volume preferences and gesture unlocking remain. Physical-device sound quality is an alpha limitation, not a reason to introduce unapproved samples.

## Blockers, gates and alpha limitations

**Before promotion:** the owner must authorize the candidate merge and production release; the resulting `release/production` commit must pass exact-commit push CI; the protected run must create and verify a fresh backup and restored copy. These are required gates, not optional follow-ups. Never deploy the feature branch.

**Current configuration visibility:** this workspace can verify the GitHub production approval rule and production-only branch policy, but cannot read the current Actions variables/secrets or authenticated Railway settings. Their presence, key correspondence and access are not inferred from local tests. Before authorizing dispatch, the owner must confirm that Railway GitHub autodeploy remains disabled and the working Phase 4.7 project/service/database, verification service, private-network references, signing keys and backup configuration have not drifted. Do not rotate keys or apply pending Railway changes as part of this upgrade. The protected run must stop on any failing guard.

**Documented alpha limitations, not independent release blockers:**

- Physical iPhone/Safari and Android behavior, audio listening quality, safe areas and real OS background suspension remain owner device checks. Chromium touch emulation and AAC decoding do not certify those devices. A confirmed inability to sign in, trade safely or preserve state on a supported device would become a blocker.
- The two unwanted Gray / Development Night broadcasts remain visible until a separate exact-ID owner review and reversible moderation approval. This release does not identify or hide guessed records. Existing posting/reporting/moderation protections remain functional.
- The accepted original replacement illustrations, CSS materials and compact responsive adaptations differ from the illustrative mockup. Visual equivalence is not claimed, and cosmetic iteration is paused.
- Repeated bot victories can legitimately award zero ordinary gold under the retained anti-farming budget. Losses no longer consume that budget; this release does not grant replacement funds.

## Owner steps — GitHub web / Android

Do not perform the production steps until explicitly authorizing this release.

1. Review the Phase 4.8 candidate PR targeting **release/production**, including the verification report and the accepted `b3014ea` runtime baseline. Wait for PR checks. Keep the PR unmerged until approval.
2. Confirm in Railway's existing game service that GitHub autodeploy is still disabled. Keep the established Dockerfile builder, `/knights-reforged/railway.json`, pre-deploy `node deployment/migrate.mjs`, start `node deployment/start.mjs`, port 8080, `/healthz`, private PostgreSQL connections, verification cluster and working key configuration. Do not click Apply/Deploy, edit credentials or initialize anything.
3. After explicit owner authorization, merge the reviewed PR into **release/production** through GitHub. Do not move that branch again until the release completes. Record the resulting full commit SHA **M**.
4. In **Actions → Kingdom Come checks**, wait for the **push** run on `release/production` whose commit is **M** to finish successfully. A PR merge-preview check or the old `cf4a99d` run does not satisfy this guard.
5. Keep the existing repository Actions variable `KINGDOM_BACKUP_KEY_VERIFIED=true` only while the owner's independently verified original age key/recipient remain unchanged. Do **not** manually set `KINGDOM_RECOVERY_ARTIFACT_ID`; the workflow supplies the artifact ID from the fresh upload in this same run. Do not replace signing or verification keys.
6. Open **Actions → Owner approved Railway release → Run workflow**, select **release/production**, and enable **Deploy after all gates?** only for the authorized promotion. The safety job must identify **M**. At **Review deployments**, the owner reviews and approves the protected production job for **M**. This is the existing required approval gate.
7. Observe the unchanged automated sequence: private backup/restore → encrypted recovery upload → independent retained-artifact check → signed pre-deploy → deployment/health → private saved-realm/login verification. Any FAIL stops promotion; do not bypass or manually retry a downstream command.
8. Require a successful release conclusion and the exact **M** in health evidence. Retain the 90-day recovery and release-verification artifacts, including the manifest and `post-deploy.json`. Keep the owner's offline age key outside GitHub and Railway.
9. Smoke-test existing-account login/session return, Home, a modest quest, one-item and Bulk transactions, Buy More, Land countdown, Profile/history, and sound/mute on actual phones. Check balances and ownership against the action receipts; do not use production administrative grants to test.

A separate backup-only rehearsal is **not required merely because the phase number changes** when the existing recipient, owner key, services and configuration remain verified. Every promotion still performs a new backup/restore/retention sequence. If any recovery setting has changed or the owner is uncertain, use the same workflow with **Deploy after all gates?** disabled, verify the resulting encrypted recovery with the offline owner key, and resolve that uncertainty before authorizing promotion. A previous run's artifact cannot replace the fresh same-run artifact for **M**.

## Stop and rollback

- If a gate, backup, proof or pre-deploy fails, stop. Do not initialize, delete a database, remove proof checks, edit an expired signature or manually redeploy the feature branch. Preserve the run's evidence. A failed pre-deploy normally leaves the previous healthy game deployment active; confirm its status rather than restarting it blindly.
- If the promoted UI has a serious regression, prepare a reviewed **code revert PR** against `release/production`, keep all existing player data, run exact-commit CI and use the same protected backup/approval process for the new revert commit. Phase 4.8 adds no schema downgrade requirement.
- Do not automatically restore the production database to an earlier backup: doing so would lose legitimate play after the backup. Database recovery is a separate, explicitly authorized incident procedure, first rehearsed in an independent database with the retained encrypted archive and verified checksums.

No live Railway database was accessed during this preparation. No production workflow was dispatched, service modified, key rotated, merge performed or deployment started by this work.
