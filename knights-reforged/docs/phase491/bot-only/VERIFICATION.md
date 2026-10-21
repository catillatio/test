# Bot-only checkpoint verification

This supplements, rather than replaces, the [approved report/audio baseline evidence](../VERIFICATION.md). All test data is synthetic and local. The candidate is not imported by production code or registered as an active policy. No live database, Railway API, release workflow or operator workflow was used.

| Check | Result / evidence |
|---|---|
| Full automated regression | **467 tests: 466 pass, 0 fail, 1 existing hosted-runner-only skip**, 721.37 seconds. [Counts, log hash and skip reason](automated.json) |
| New focused tests | Six tests cover all 450 immutable fixtures, real paid lots/funding/upkeep, deterministic plans, earned-point limits, original human formulas, future-level bounds, approved reward policy, offline injection and rejection of unauthorized/nonlocal test targets before connection |
| TypeScript / production build | `npm run typecheck`, `npm run build` pass; no runtime source changes |
| Static render/security contracts | 99 pass, 0 fail; 77 production EJS fixtures, including authoritative report loadouts, legacy history, forms and CSRF contracts |
| Actionlint | Pass against unchanged existing workflows |
| Bot models | 3,600 before/after matchup rows, all levels 1–50, all 450 stock identities, two acquisition modes and four human investment profiles; all 441 roll pairs per encounter |
| Future stress | 30 hypothetical level 100/200 cases, frozen current catalog, original human participation and actual eligibility checked; no legitimate future reward prediction |
| Pacing / farming | 64 baseline/candidate sessions, 1/2/6 hours, existing recovery/losses/healing/level-up refills, finite purses, shared-target one/ten-account pressure; conservation and Vault assertions pass |
| Actual populated dump/restore | [copy-verification.json](copy-verification.json): custom-format archive, SHA-256, different empty disposable database, 66 complete tables / 452 accounts / 450 bots match; two no-op migrations retain every row |
| Transaction rehearsal | 405 reviewed plans apply once; 45 remain unchanged. Real paid FIFO sales, purchase lots, skill allocations and financial receipts match projections; no new members, grants, bank withdrawal or conversion of prepaid credit |
| Adversarial copy tests | Changed plan, stale actual battle state, invalid authorization/target, foreign command kind, changed completed intent, concurrent same/different-key retries and injected post-trade rollback; original storage/selection limits remain enforced |
| Preservation | All 450 identities, human accounts/credentials/sessions/holdings/preferences, existing armies, Vault, Land, achievements/tutorial, rankings/rivalry source history and prior financial/combat receipts retained; source fixture unchanged |
| Due income | Three normal hourly periods after candidate trades settle once; repeat settlement changes no rows or Vault balances |
| Local audio browser | [navigation-audio.json](navigation-audio.json): actual touch/mouse five-tab navigation, full transitions, back/forward/reload, forbidden click/navigation fallbacks, interrupted loading, mute/departure/history cancellation, AAC preview and confirmed reward deduplication pass |
| Approved presentation / release isolation | [scope.json](scope.json): exact Git objects/diffs show all approved src, views, public assets, screenshots, rulesets, migrations, deployment, workflows, Docker/Railway configuration and dependencies unchanged from `a21b2b0` |

The isolated-copy script writes all candidate changes in the restored database, never its populated source. Its test-only authorization and regular receipts are **not** a production administration mechanism. Future privileged execution, immutable administration audit permissions and a unique bot/version constraint would need separate review and authorization; PR #13 is unchanged.

The model explicitly reports one-time inventory liquidation and ongoing lower equipment upkeep. It does not claim unchanged candidate bot wallets/inventory/defense training, or that a successful experiment authorizes real changes. Human balances/gear are unchanged. The stock blueprints and synthetic earned entitlements are not evidence of current live bot finances; a real rollout must inspect/requote authorized saved records and rehearse on their restored copy.

The ordinary benchmark has easy, intermediate and challenging encounters from the existing finite catalog, but fully equipped established humans still overpower these small bots, and levels 1–2 cannot offer the desired elite difficulty under the current saved-member/catalog constraints. Gear-only reaches almost the same average difficulty without spending points; both alternatives and their financial effects require owner selection. No new on-screen tier labels or balance policy is enabled.

The previously approved 320/390/430/1024px screenshots remain unchanged and linked from the [main review](../README.md); this checkpoint adds no UI pixels or audio assets. The refreshed browser trace proves local navigation silence, **not** physical iPhone/Android audio behavior or the live honk's cause. That owner device check remains pending. Controlled-alpha evidence does not establish production security or verify current live configuration.
