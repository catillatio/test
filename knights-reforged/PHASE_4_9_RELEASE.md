# Phase 4.9 protected alpha release — owner execution only

Candidate branch: `feature/kingdom-come-phase-4-9-bot-combat-rewards`, draft PR #12, targeting `release/production`. This document prepares a future release; it does not authorize or execute a merge, workflow dispatch, production read/write or deployment. [Current review/evidence](docs/phase49/FINAL_REVIEW.md). [Owner scope](https://github.com/catillatio/test/pull/12#issuecomment-6303697572).

## Included and excluded

- Approved immutable `bot-combat-rewards-2`: 65% bot difficulty XP, then 100/85/70/55/40 pair reductions; both bot hard quotas removed. Wallet-funded gold, bot ceiling, Vaults, human PvP, quests, resource recovery and bot finances remain unchanged.
- Approved compact Profile/Income disclosures, Calling beside Hall on Home, compact Hall, neutral panels with the teal resource row retained, silent routine controls, approved property art and Gold Mine display alias.
- Only the four orchestral reward arrangements at `087e1a8` enter runtime. Decisive shares Victory. Existing sound preferences/receipt/event protections remain intact. No rejected audition cue is imported.
- No SQL file, financial correction, account rename, moderation operation, bot regeneration, provisioning, new level content, release/controller change or key rotation. Gray removed his own message; the username correction is withdrawn; PR #13 stays inactive.

## Migration and preservation

Schema head stays `020_game_feel.sql`. The normal **controlled migration must still run** to register the two new immutable bot policy definitions alongside existing rules. A Phase 4.8 source adds v1/v2 definitions; a source with v1 adds only v2. No grants or backfills accompany registration. Existing definitions and recorded battle/financial receipts remain unchanged; retries return their recorded results.

`moonwell-sanctuary` remains the property ID. Gold Mine is a current presentation alias; prices, rates, existing holdings and historical names/receipts are retained. Do not rename IDs/catalog rows, alter balances or reconcile old rewards.

The local populated preservation fixture verifies 66 tables, 452 accounts and 450 bots, old/v1 receipts, wallet/Vault/history, names/password hashes, sessions, army, achievements, tutorial and preferences. This synthetic evidence does not replace the protected release's **fresh actual encrypted backup and independent restored-copy verification**.

## Owner promotion sequence (GitHub web interface / Android)

1. Review PR #12's final diff, screenshots, test evidence and limitations. Keep it draft/unmerged until separately approved. Do not activate or merge PR #13.
2. Before authorizing release, confirm existing Railway GitHub autodeploy remains disabled and the established private-network game/verification services and required owner approval remain correctly configured. This preparation does not inspect or modify those live settings. Preserve all keys and existing database connectivity. Do not enable first-time initialization or bot seeding.
3. After explicit owner authorization, merge the reviewed PR **only into `release/production`**. Record its new full commit SHA **M** and hold that branch steady until release completes. Do not upload/deploy the feature branch.
4. In **Actions → Kingdom Come checks**, require the successful **push** run on `release/production` at **M**. PR checks/merge-preview runs and older production CI do not satisfy exact-commit release preflight.
5. Retain `KINGDOM_BACKUP_KEY_VERIFIED=true` only while the owner's independently verified offline age identity/recipient remain valid. Do not rotate keys or set a historical `KINGDOM_RECOVERY_ARTIFACT_ID`: the workflow supplies the fresh same-run retained artifact ID.
6. Only after separate production-release authorization, choose **Actions → Owner approved Railway release → Run workflow → release/production**. Enable **Deploy after all gates?** for an authorized promotion. At **Review deployments**, the owner verifies **M** and approves the protected production job. Do not use diagnostic/operator workflows as a substitute.
7. Let the existing controller complete every gate: exact candidate build → authenticated private verification worker identity → encrypted export → independent ciphertext download/decryption/archive validation → isolated separate-cluster restore/migration/replay/preservation → GitHub artifact retention → independent retained-artifact verification → fresh candidate-bound Ed25519 proof → controlled pre-deploy proof/restore verification → additive migration → game deployment → `/healthz` → private post-deployment aggregate checks and anonymous login-page check. Stop on any failure. Do not run downstream commands manually or disable a check. The existing health protocol still labels itself `phase4.7`; the full commit SHA and candidate digest identify the new release. Do not alter that protocol to force a label change.
8. Retain the encrypted recovery artifact, manifest and post-deploy evidence. Record **M**, workflow run/attempt and Railway deployment ID. Test normal owner login/session continuity and alpha gameplay, including a different funded bot, Gold Mine/old receipts, Calling/Hall, preferences and reward audio. No administrative mutation is part of the smoke test.

A separate backup-only rehearsal is not required just for a new phase when the existing recovery configuration remains verified. If uncertain, run the same protected workflow with promotion disabled **only after authorization**, independently decrypt/validate its archive with the offline key, and resolve uncertainty first. Every promotion still requires its own new same-run backup/restore/artifact chain. Old backup artifacts cannot authorize candidate **M**.

## Stop, rollback and recovery

- A failure before successful promotion should leave the current active game in place. Inspect fixed failure categories and retained evidence; do not restart a job or alter its proof/copy name to force passage.
- For a code regression after promotion, prepare a reviewed revert PR against `release/production`, preserving all realm data and installed policy definitions. Its new exact commit must pass CI and the same protected backup/approval/release sequence. No SQL downgrade, reward rewrite or balance reversal is needed for this candidate.
- Do not initialize, reseed or automatically restore the live database. Restoring an older backup loses intervening legitimate play. Database recovery is a separate owner-authorized incident procedure: retain ciphertext/manifest checksums, decrypt with the offline identity, validate with compatible PostgreSQL tools and rehearse against an independently isolated database before considering any live recovery.

This guide deliberately reuses the established Phase 4.7 transport/approval/recovery system. All release workflows, provider operations, signing gates, migration/start commands and Railway configuration files are unchanged by Phase 4.9.
