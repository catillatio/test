# Kingdoms Restored — verified protected production release (2026-11-17 UTC)

This is the evidence index for an **already completed** protected production image release, not authorization for another release, feature activation, cleanup or database operation. The local US Eastern date was November 16, 2026.

## Exact live identity

| Item | Verified evidence |
| --- | --- |
| Source | `catillatio/test` / `release/production`, merge `c8222eaac6ee7a2b6392279b13415fadda3d788e`, [PR #97](https://github.com/catillatio/test/pull/97) |
| Exact-merge application CI | [44000561124](https://github.com/catillatio/test/actions/runs/44000561124), 10/10 pass, attempt 1 |
| Android readiness (not signed Play delivery) | [44000561987](https://github.com/catillatio/test/actions/runs/44000561987), 3/3 pass, attempt 1 |
| Protected image preparation | [44012465228](https://github.com/catillatio/test/actions/runs/44012465228), successful `image-prepare`, promotion skipped |
| Prepared artifact | ID `14298687485`, exact candidate source `c8222ea...`, manifest `sha256:51c8d045d1dc643d4f00d0d5a81856ad2a79681a2e6dac9a7596afd23b869f` |
| Protected image release | [44016282262](https://github.com/catillatio/test/actions/runs/44016282262), successful `image-release`, attempt 1 |
| Live Railway service | Project `merry-patience`, environment `production`, game service `test` |
| Live Railway deployment | `bdd050bb-4b7c-49b7-9870-fd08e77c16d6`, `SUCCESS`, created 2026-11-17 04:35:31 UTC |
| Live immutable image | `ghcr.io/catillatio/kingdom-come-deploy-canary@sha256:51c8d045d1dc643d4f00d0d5a81856ad2a79681a2e6dac9a7596afd23b869f` |

The prepared artifact's `candidate.json` was inspected; its source SHA and image manifest digest match the image pinned on Railway. The older deployment `2520649d-7b52-4841-b853-8eb7cefa5165` has been superseded. No staged Railway changes were observed.

## Verified recovery, migration and promotion gates

Protected run 44016282262 passed exact-image authentication, game-target preflight, private backup and independent restored-copy verification, authenticated recovery retention, independent retained-ciphertext verification, promotion only after the recovery gates, and post-deploy health/saved-realm checks.

- [Encrypted recovery artifact](https://github.com/catillatio/test/actions/runs/44016282262/artifacts/14299647813): `kingdom-recovery-44016282262-1`, ID `14299647813`.
- [Release verification artifact](https://github.com/catillatio/test/actions/runs/44016282262/artifacts/14299478202): `kingdom-release-verification-44016282262-1`, ID `14299478202`.
- The private Railway worker's real `copy-migrations-and-preservation` verification completed all three complete cryptographic snapshots, the migration, preservation comparison, migration replay and replay comparison in **217,011 ms**, against the unchanged **600,000 ms** checker deadline.
- Derived from monotonic phase events: snapshot before **107,210 ms**, snapshot after **55,396 ms**, snapshot replay **53,854 ms**. Copy registration reported `PASS`; worker completion reported no source-database mutation. These are actual Railway timings, not the local fixture medians.

This records one successful production-scale verification; it does not establish a guaranteed completion time as history grows or runtime load changes.

## What shipped; what was not proven

The deployed source contains PR #96's bot-target-first NPC sponsorship correction; PR #97's restored-copy snapshot streaming and preservation improvement; and achievement-receipt batching plus migration `055_achievement_gold_lookup.sql` with bounded locking. Optional feature activation, actual NPC-sponsored bounty events, post-deploy player latency, live index validity and live SQL contention were **not independently measured in this documentation review**. A source inclusion alone does not establish those operational outcomes.

The independent authentication/deletion security branch is **not included**. Android readiness passed, but no signed Play bundle or Play Store publication is claimed. PR #95 and unrelated proposals are outside the release.

The earlier failed [43831109552](https://github.com/catillatio/test/actions/runs/43831109552) copy remains classified **UNVERIFIED** for retention decisions. A later successful recovery proof does not retroactively validate that copy. Do not delete, repurpose or treat it as the recovery anchor without separately approved, evidence-driven handling.

A future software change requires its own exact-commit CI, fresh prepared image and separately authorized protected release. This Markdown record does not update the game's running image, database, feature flags, signing configuration or provider permissions.
