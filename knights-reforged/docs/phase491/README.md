# Phase 4.9.1 — owner review

Development branch: `feature/kingdom-come-phase-4-9-1-combat-audio-polish`.
Base: merged Phase 4.9 `793f747a7920a7b1dc000230a3050482e98393f2`.

## Current owner decision — finalize the alpha release

[Owner comment 6306433839](https://github.com/catillatio/test/pull/14#issuecomment-6306433839) approves release preparation for the battle-result and audio changes below. **No bot calibration is adopted or authorized for execution.** The 18-bot canary, five purchase candidates and earlier models remain archived documentation/test evidence only. No bot purchases, army changes or financial correction belong to this release. Living-bot progression and army scaling move to Phase 5.

- **[Final release-readiness report](FINAL_RELEASE_REVIEW.md)** — verification, preservation, blockers and alpha limitations.
- **[Protected owner release guide](../../PHASE_4_9_1_RELEASE.md)** — merge review first; separate deployment authorization remains required.
- [Approved screenshots](#review-material) — unchanged from the accepted report/audio baseline `a21b2b0`.

The owner has not authorized merging, deployment, protected-workflow dispatch or production access. PR #13 stays inactive. The username request is withdrawn; Gray requires no action.

## Implemented

- Battle reports lead with Victory/Defeat, opponent, saved ordinary gold/XP, separate bounty payment, then secondary damage and current level progress. Both armies' **recorded** equipment are open initially, with real artwork, recorded names and participating quantities. Each category has a compact preview; additional recorded types are available under See more. No current inventory is substituted for missing historical loadouts.
- Attack Again/Revenge stays in the existing authenticated, CSRF-protected command flow, with current eligibility, Spirit/Health requirements and duplicate-request protection. The saved report cannot authorize a new attack by itself. Old reports explicitly say when equipment, XP, damage or Spirit cost was not recorded.
- Reward-reduction notes and record time are in a compact keyboard-operated disclosure. No internal percentages, windows, hidden balances, database identifiers or new combat formulas appear in the report.
- Ordinary gestures no longer open/resume/preload the audio engine. Healing's no-op click fallback is removed. Pending audio cannot start after departure, suspension or mute. The sound client URL is revised; approved orchestral asset bytes and cue mappings are unchanged.
- Newly registered humans start muted with the existing 55% volume setting. Existing enabled/muted choices and volume remain stored exactly as before; Settings still enables sound explicitly. No migration or preference reset occurs.

## Review material

| Width | Victory | Defeat |
|---|---|---|
| 320px | [Screen](screenshots/320-victory.png) | [Screen](screenshots/320-defeat.png) |
| 390px | [Screen](screenshots/390-victory.png) · [Full report](screenshots/390-victory-report.png) | [Screen](screenshots/390-defeat.png) · [Full report](screenshots/390-defeat-report.png) |
| 430px | [Screen](screenshots/430-victory.png) | [Screen](screenshots/430-defeat.png) |
| 1024px | [Screen](screenshots/1024-victory.png) | [Screen](screenshots/1024-defeat.png) |

These are actual authenticated reports from a disposable local realm. The displayed +1 XP is the **real** weak-opponent award, not a visual placeholder. No reward, participating unit, artwork, balance or name from the supplied reference was copied into game data. Compared with that reference, this version retains Kingdom Come's bronze buttons, teal resources, existing equipment illustrations and fixed five-tab navigation; the two loadouts and reward hierarchy follow its structure. On a 320px screen, scrolling is still necessary to reach the complete follow-up section.

- [Audio trace and remaining honk uncertainty](AUDIO_INVESTIGATION.md)
- [Archived army comparison — human alternatives rejected, never adopted](COMBAT_PROPOSAL.md)
- [Representative model table](ARMY_MODEL_RESULTS.md) · [Full matrix](army-matrix.csv) · [Model assumptions/data](army-models.json)
- [Unchanged-policy paced progression](PROGRESSION_BASELINE.md) · [Raw session data](paced-baseline.json)
- [Verification and security/preservation scope](VERIFICATION.md)

## Review boundaries

No combat/army/difficulty policy is implemented or approved by this branch. Bot gold, 65% XP and 100/85/70/55/40 reductions, finite wallet transfers, human PvP, bounties, regeneration, Land, equipment and recruitment remain unchanged. No SQL migration, new dependency, audio replacement, production query, initialization, bot regeneration, operator action or release-infrastructure edit is included.

PR #13 remains inactive/draft at `f6243463b5f9df054d569ae313a0d6a629d87ce2`. Gray moderation and the separate username task were not touched.

The live navigation honk's exact audible origin remains **unconfirmed** because it did not reproduce in the permitted local baseline and production was not accessed. The corrected local navigation path is instrumented silent, including every source start rather than just named navigation events. Physical Android Chrome/iPhone Safari, stale restored tabs and device sound behavior still require owner verification. The new module revision only takes effect after a separately authorized protected release; nothing was deployed here.

## Archived research — not a release prerequisite

[Original army audit](COMBAT_PROPOSAL.md), [broad bot-only model](bot-only/REVIEW.md) and [18-bot canary](canary/REVIEW.md) preserve earlier evidence; their rollout/approval discussions are superseded by comment 6306433839. They must not be run as release steps. Production builds exclude these scripts, and no runtime, migration, startup or workflow imports/executes them. Current human rules, bot finances, 65% XP and pair reductions stay unchanged. No additional balancing experiment was performed for finalization.

Pause for owner merge approval after the exact-head checks pass. Production release remains separately authorized.
