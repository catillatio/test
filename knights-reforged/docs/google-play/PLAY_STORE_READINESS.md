# Kingdom Come — Google Play release readiness

Review candidate, 2026-11-05. **Not approved for Play publication.** No app was uploaded, no owner legal declaration accepted and no new Railway configuration/deployment initiated by this readiness work.

## Source and current release

Repository `catillatio/test`, app `knights-reforged/`, development branch `feature/google-play-release-readiness`, baseline `release/production` at `9429e88365d112f5597371c7aa811110f967558d`. Historical Android draft [PR20](https://github.com/catillatio/test/pull/20), head `0687b60423fc0551b13813a43724281f34b1580c`, was imported only for Android files/workflow. Its old backend was not merged.

The previously authorized Dark Medieval UI release [41962151527](https://github.com/catillatio/test/actions/runs/41962151527) succeeded while this audit began. Read-only verification found live game deployment `f2f680d5-1e96-4d7c-83ce-89b4e67e3168` SUCCESS, expected immutable image `sha256:74d2ac2dffa0fa6f842b6013182e86df702d4bb14d2cbdfa6eeb3d89aff30504`, `/healthz` ready with exact baseline commit, no staged patch and exact approved CSS/JS/environment-art bytes. No duplicate release was started. This does **not** deploy the new compliance branch.

## Requirements matrix

PASS means the listed source/local evidence exists. Exact-head CI artifacts and actual device evidence remain separately authoritative; a source inspection is not a Play approval.

| Requirement | Status | Evidence / limit |
|---|---|---|
| Current production source and old Android reconciled | PASS | Separate branch at current production; Android-only historical import |
| API36 target / min API26 | PASS | `android/app/build.gradle`; actual compiled bundle report required in Android CI |
| Release AAB build/inspection pipeline | PASS | `bundleRelease`, official checksum-pinned bundletool, `verify-bundle.py`; see artifact report for actual result |
| Final signed uploadable AAB | NEEDS OWNER INFORMATION | No owner signing key or permanent package ID provided; CI candidate is explicitly UNSIGNED_NOT_UPLOADABLE |
| Permanent ID / version / update compatibility | PREFERRED ID UNCONFIRMED | Owner prefers `game.kingdomcome.rpg`; `game.kingdomcome.realm` is fallback only if the first is unavailable. No authenticated Play registration eligibility evidence is available. Preview `game.kingdomcome.alpha`, debug `.debug`, version 2 / 0.2.0-beta.1; protected signer refuses preview ID |
| Release non-debuggable / sole Internet permission | PASS | Release build type and compiled-manifest verifier; confirm exact-head artifact |
| Restricted WebView / HTTPS / cookies | PASS | `NavigationPolicy`, shared `WebViewSecurity`; no JS bridge, file/content/mixed access or third-party cookies |
| Private upload-key preparation | PASS | Separate manual protected `android-release` workflow; no generated owner key, public cert match, no Play upload |
| Android back / safe recovery / lifecycle / insets | PASS | Existing platform callbacks, safe GET allowlist, no POST resubmit, IME/cutout/system insets and safe same-page scroll restoration; recreation prioritizes saved screen over original deep link; physical behavior separately unverified |
| Renderer and native HTTP-auth failure | PASS | Fail-safe error/restart panel; HTTP-auth request cancelled; no credentials requested natively |
| Android real-WebView smoke | PASS | Both API29/API36 actual WebView jobs passed at a0a058ad491eb53f142704c55f0b33575f145ddd in run 41971121805; Native Android app/build/security inputs and the API29/API36 matrix are unchanged; sanitized host diagnostics and exact installed-APK reconciliation are added without changing smoke assertions. Limited smoke only, not full-device gameplay certification |
| Physical Galaxy S/A, Pixel, budget device | NOT VERIFIED | Requires actual hardware/Play pre-launch test; no invented performance claim |
| Eleven requested logical viewport dimensions | PASS | `browser-play-readiness.ts`, 27 screens/states per dimension, output `viewport-results.json`; actual run report required |
| Large fonts / landscape / split-window browser checks | NOT VERIFIED | Browser root-text enlargement and landscape Settings coverage; not equivalent to every Android OS font/cutout configuration |
| Public privacy/terms/community/deletion pages | PASS | `/legal/*`, `/account-deletion`; visibly review drafts, no fabricated contact or retention claims |
| Final legal/publisher policy text | NEEDS OWNER INFORMATION | Owner completes marked fields; owner reviews all legal claims, target audience, contacts, countries and retention |
| In-app and public deletion request | PASS | Settings/footer and public form, password reconfirmation, CSRF/origin/rate limits, concurrent deduplication; actual PostgreSQL tests |
| Completed erasure and backup-restore erasure handling | IMPLEMENTED; PRODUCTION BLOCKED | Physical human-account deletion and separate abandoned-NPC candidate implemented; genuine estate de-identification is NOT established. Synthetic fulfillment/real isolated restore tested; production remains blocked on signed owner policy, protected operator/journal installation and operational acceptance; see ACCOUNT_DELETION.md |
| UGC prior Terms/Guidelines acceptance | PASS | Explicit checkbox plus versioned server-side consent before posting; no fabricated historic consent |
| UGC message and player reporting / blocks | PASS | Existing message reports + new human reports, reversible social blocks, bidirectional comment checks and feed/notification filtering |
| Moderation operational handling | NEEDS OWNER INFORMATION | Existing private operator queue/hide/restore/timed mute, user reports added to queue; publisher supplies staffing, escalation and appeals/contact rules |
| Account authentication / sessions / logout | PASS | Existing Argon2id, HTTP-only SameSite cookie, secure HTTPS mode, session expiry and logout unchanged; existing CI and new tests apply |
| Financial/gameplay formula preservation | PASS | No loot/XP/economy formula or finance engine changed. New accountless NPC paths preserve ordinary human-origin attack rewards; synthetic conservation/restore tests cover the new estate. NPC-only no-spending/zero-wallet inheritance requires policy review |
| Provider logs, storage access/locations and expiry | NOT VERIFIED | No production credential/log dump; owner/provider practice confirmation required |
| Data Safety / App Content worksheets | PASS | Accurate drafts with unknowns in DATA_SAFETY.md and APP_CONTENT.md; no submission |
| Native analytics/ads/billing/push | PASS | No SDK or permission found in native client; service-side changes still require review |
| Runtime artwork/audio/font provenance inventory | PASS | ASSET_LICENSE_AUDIT.md, file/hash inventory, existing provenance/license/static checks; not legal clearance |
| Name/trademark/marketing rights | NEEDS OWNER INFORMATION | Publisher must confirm rights; no exclusivity/trademark clearance invented |
| Store icon / adaptive launcher / splash / feature | PASS | Original vector, 512 RGBA icon, 1024×500 RGB feature, dimension/hash inventory; owner branding review |
| Genuine phone screenshots | PASS | Eight actual-app synthetic-data 1080×1920 captures generated by browser test, not concept images; read actual capture evidence |
| Tablet screenshots / hardware support | NOT VERIFIED | 600/800 CSS rendering is not tablet device certification; owner support/listing decision |
| Closed testing / Console declarations / submission | NEEDS OWNER INFORMATION | Owner controls all Console steps; see APP_CONTENT.md; no automatic upload |
| Final exact-head application CI | REQUIRED PR CHECK | PR #88 final-head checks and linked artifacts are authoritative; local targeted passes do not substitute. Native Android build inputs and the passing a0a058a build/emulator matrix are unchanged; host diagnostic/reconciliation changes preserve all assertions and never retry installation. |

## Implemented components

1. Standalone Java/platform Android client with reconciled current origin, explicit release/debug package separation, API36 target, AAB builds, compiled-manifest/bundle checks and owner-controlled signing preparation.
2. Public legal drafts, authenticated deletion request queue and additive safety migration. No account deletion, player balance update or production migration was executed.
3. Explicit public-post consent, per-user social blocks, player reporting and existing moderator queue integration. These do not change attack eligibility, loot, army rules or financial ledgers.
4. Real-app viewport/screenshot harness; separate limited Android emulator smoke with actual production security configuration and intercepted synthetic fixture. No production gameplay test account or imported player data.
5. Original store branding exports, marketing draft, runtime asset inventory and provenance/legal worksheets.
6. Disabled, signed-policy-gated fulfillment tool with exact identity/privilege checks, full-row preservation witnesses, external signed erasure journal, stale-writer guards and startup/recovery fence. Synthetic real-dump restore tests; no production policy or erasure activated. See [owner decisions](privacy/OWNER_DECISIONS.md).

## Evidence and artifacts

- Local targeted: `tests/play-account-safety.test.ts`, existing `tests/community-social.test.ts`, `npm run typecheck`, `npm run check:static`; commands/results summarized in final PR. Browser evidence is `test-results/play-readiness/verification.json` with 297 passed screen/dimension cases and genuine screenshots when successful.
- Required final PR **Kingdom Come checks** remains unchanged in scope/requirements; the additional screenshot folder is retained as evidence. Unknown paths continue using the full profile. The strict post-deployment schema-head assertion advances to migration 028, with stale 027/026 still rejected. Container/worker fixtures assert the new migration, four safety tables and two empty erasure tables plus an empty abandoned-kingdom registry. No skipped/removed assertions or recovery bypass is authorized.
- **Kingdom Come Android readiness** adds `apk` plus API29/API36 real-emulator jobs. Artifact includes unsigned release AAB, debug APK/test APK, SHA256 and `bundle-verification.json`; signing status is explicit. No release key is available to ordinary PR builds.
- Signed release artifacts can only be generated later by **Kingdom Come signed Android bundle**, after owner identity/key/environment setup and authorized merge. See [Android release guide](../../../android/PLAY_RELEASE.md).

## Remaining owner checkpoint

Approve or reject the explicit data-specific retention proposal in privacy/OWNER_DECISIONS.md, then separately authorize protected erasure/journal/restore-guard installation and operational acceptance. Complete the legal placeholders; confirm moderation/support operations and provider disclosures. Choose permanent package ID and supply the upload-key configuration privately through the reviewed environment, never chat. Review asset/name rights and actual-device/Play pre-launch results. Complete Console listing, Data Safety, App Content, audience/rating/countries, app-access instructions, App Signing enrollment and required testing. Any web compliance deployment or merge requires separate authorization; this candidate is not live.

Do not claim final signing, data erasure, Android-device coverage or legal/Play approval from a green unsigned build. Blockers remain explicitly unresolved until their own evidence exists.

## PR #88 continuation from a0a058a

The successful baseline remains evidence: full application CI [41971121789](https://github.com/catillatio/test/actions/runs/41971121789) passed all 10 jobs; Android [41971121805](https://github.com/catillatio/test/actions/runs/41971121805) passed all 3 jobs. Baseline unsigned AAB SHA-256 `660498964838e73c87ab04104e543c24c7304777eaf5098facc8931766351b5b`; signing state **UNSIGNED_NOT_UPLOADABLE**. The native Android app, packaging, signing and emulator matrices are unchanged; sanitized installer diagnostics and strict installed-pair reconciliation are added; no redundant SDK build is required to rediscover those results. Final application CI for this continuation is linked from PR #88. A final owner-signed AAB still requires the permanent ID and existing private upload key, plus the protected exact-production-head gate; the unsigned artifact must never be submitted as a release.

The production baseline was rechecked read-only: branch `9429e88365d112f5597371c7aa811110f967558d`, deployment `f2f680d5-1e96-4d7c-83ce-89b4e67e3168`, expected digest `74d2ac2dffa0fa6f842b6013182e86df702d4bb14d2cbdfa6eeb3d89aff30504`, no staged changes. No real account, production database, Railway setting, recovery copy or deployment was changed. The final diff remains Kingdom Come only.


## Owner decisions continuation from e597d69

The owner approved a permanent independent abandoned-kingdom gameplay direction.
The v2 candidate physically removes the human account and creates a separate
accountless NPC with fresh IDs, no identity mapping and a zero starting wallet;
only future genuine Land income funds its loot. Existing shared financial anchors
remain private/inert under a proposed exception. Mutable personal progress is
removed. No erasure, production role, credential, key or recovery operation was
activated by development. See [the decision analysis](privacy/OWNER_DECISIONS.md).

**Privacy blocker:** exact inherited estates, timing, retained battle snapshots,
backups and provider SQL/WAL records can remain linkable. Identity separation alone
does not establish the owner's no-recoverable-link requirement. Real privacy/legal
review and any required minimization must precede activation; no compliance claim
is made. The zero-wallet/sealed former funds, NPC-only no-spending treatment and
narrow retained-history purposes/periods also require final approval. The signed
v2 policy and each intent must attest actual estate review; v1 approvals fail.

**Android identity:** preferred `game.kingdomcome.rpg`, fallback
`game.kingdomcome.realm`. No authenticated Google Play Console/package registration
capability is connected; neither is confirmed available and no public search was
used as a substitute. Production packaging remains blocked on actual Console
confirmation and private upload-key setup. The parameterized packaging/signing/
artifact verifier already binds the same `ANDROID_APPLICATION_ID` throughout.
`game.kingdomcome.alpha` remains a non-uploadable preview identifier; public title
**Kingdom Come** is unchanged. Creating a Console app/listing alone does not prove
package registration. Any later signed-artifact upload requires its own owner action.

Prior exact-head evidence at e597d69 remains valid for unchanged Android inputs:
[application 41988484221](https://github.com/catillatio/test/actions/runs/41988484221)
passed 10/10 jobs and [Android 41988484099](https://github.com/catillatio/test/actions/runs/41988484099)
passed the bundle plus API29/API36 jobs. Its AAB is **UNSIGNED_NOT_UPLOADABLE**.
The continuation's final exact-head checks are linked in PR #88; earlier green
checks do not substitute for changed backend tests. No native application,
signing workflow, SDK, security configuration, or emulator matrix was changed.


Continuation verification before final CI: typecheck/build passed; static project
checks passed 99 assertions and 77 production EJS cases. Focused disposable
PostgreSQL tests passed all 11 deletion/graveyard cases (including levels
50/75/100, real custom-format backup/restore, interrupted transaction rollback,
restricted operator, concurrent income sweeps, replay, repeat-target human loot,
wallet conservation and unreclaimability). The two private-approval tests and four
Android release-contract tests passed. No test was removed or skipped. The final
GitHub exact-head CI results and artifacts are recorded on the existing PR; no
production write, recovery rehearsal, merge, deployment or Play upload is authorized.


The first continuation CI caught a real migration integration issue: adding an
identity column changed every existing character's full-row JSON. Classification
now lives in a separate initially empty `abandoned_kingdoms` registry; existing
character rows receive no backfilled field/default. A regression checks exact
pre-028/post-028/replay rows and rejects orphan or human-owned NPC identities.
The production preservation checker and its full-row assertions are unchanged.
