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
| Permanent ID / version / update compatibility | NEEDS OWNER INFORMATION | Preview `game.kingdomcome.alpha`, debug `.debug`, version 2 / 0.2.0-beta.1; protected signer refuses preview ID |
| Release non-debuggable / sole Internet permission | PASS | Release build type and compiled-manifest verifier; confirm exact-head artifact |
| Restricted WebView / HTTPS / cookies | PASS | `NavigationPolicy`, shared `WebViewSecurity`; no JS bridge, file/content/mixed access or third-party cookies |
| Private upload-key preparation | PASS | Separate manual protected `android-release` workflow; no generated owner key, public cert match, no Play upload |
| Android back / safe recovery / lifecycle / insets | PASS | Existing platform callbacks, safe GET allowlist, no POST resubmit, IME/cutout/system insets; physical behavior separately unverified |
| Renderer and native HTTP-auth failure | PASS | Fail-safe error/restart panel; HTTP-auth request cancelled; no credentials requested natively |
| Android real-WebView smoke | NOT VERIFIED | New API29/API36 cloud emulator jobs produce actual `ANDROID_WEBVIEW` evidence; read exact-head job results, not browser screenshots |
| Physical Galaxy S/A, Pixel, budget device | NOT VERIFIED | Requires actual hardware/Play pre-launch test; no invented performance claim |
| Eleven requested logical viewport dimensions | PASS | `browser-play-readiness.ts`, 27 screens/states per dimension, output `viewport-results.json`; actual run report required |
| Large fonts / landscape / split-window browser checks | NOT VERIFIED | Browser root-text enlargement and landscape Settings coverage; not equivalent to every Android OS font/cutout configuration |
| Public privacy/terms/community/deletion pages | PASS | `/legal/*`, `/account-deletion`; visibly review drafts, no fabricated contact or retention claims |
| Final legal/publisher policy text | NEEDS OWNER INFORMATION | Owner completes marked fields; owner reviews all legal claims, target audience, contacts, countries and retention |
| In-app and public deletion request | PASS | Settings/footer and public form, password reconfirmation, CSRF/origin/rate limits, concurrent deduplication; actual PostgreSQL tests |
| Completed erasure and backup-restore erasure handling | FAIL | No automatic destructive cascade; data-specific fulfillment policy/operator execution and immutable-record retention must be completed; see ACCOUNT_DELETION.md |
| UGC prior Terms/Guidelines acceptance | PASS | Explicit checkbox plus versioned server-side consent before posting; no fabricated historic consent |
| UGC message and player reporting / blocks | PASS | Existing message reports + new human reports, reversible social blocks, bidirectional comment checks and feed/notification filtering |
| Moderation operational handling | NEEDS OWNER INFORMATION | Existing private operator queue/hide/restore/timed mute, user reports added to queue; publisher supplies staffing, escalation and appeals/contact rules |
| Account authentication / sessions / logout | PASS | Existing Argon2id, HTTP-only SameSite cookie, secure HTTPS mode, session expiry and logout unchanged; existing CI and new tests apply |
| Financial/gameplay formula preservation | PASS | No combat/economy ruleset or finance implementation modified; request-stage snapshots + browser/command regression tests |
| Provider logs, storage access/locations and expiry | NOT VERIFIED | No production credential/log dump; owner/provider practice confirmation required |
| Data Safety / App Content worksheets | PASS | Accurate drafts with unknowns in DATA_SAFETY.md and APP_CONTENT.md; no submission |
| Native analytics/ads/billing/push | PASS | No SDK or permission found in native client; service-side changes still require review |
| Runtime artwork/audio/font provenance inventory | PASS | ASSET_LICENSE_AUDIT.md, file/hash inventory, existing provenance/license/static checks; not legal clearance |
| Name/trademark/marketing rights | NEEDS OWNER INFORMATION | Publisher must confirm rights; no exclusivity/trademark clearance invented |
| Store icon / adaptive launcher / splash / feature | PASS | Original vector, 512 RGBA icon, 1024×500 RGB feature, dimension/hash inventory; owner branding review |
| Genuine phone screenshots | PASS | Eight actual-app synthetic-data 1080×1920 captures generated by browser test, not concept images; read actual capture evidence |
| Tablet screenshots / hardware support | NOT VERIFIED | 600/800 CSS rendering is not tablet device certification; owner support/listing decision |
| Closed testing / Console declarations / submission | NEEDS OWNER INFORMATION | Owner controls all Console steps; see APP_CONTENT.md; no automatic upload |
| Full exact-head backend and Android CI | NOT VERIFIED | Final PR Checks and linked artifacts are authoritative; local targeted passes do not substitute |

## Implemented components

1. Standalone Java/platform Android client with reconciled current origin, explicit release/debug package separation, API36 target, AAB builds, compiled-manifest/bundle checks and owner-controlled signing preparation.
2. Public legal drafts, authenticated deletion request queue and additive safety migration. No account deletion, player balance update or production migration was executed.
3. Explicit public-post consent, per-user social blocks, player reporting and existing moderator queue integration. These do not change attack eligibility, loot, army rules or financial ledgers.
4. Real-app viewport/screenshot harness; separate limited Android emulator smoke with actual production security configuration and intercepted synthetic fixture. No production gameplay test account or imported player data.
5. Original store branding exports, marketing draft, runtime asset inventory and provenance/legal worksheets.

## Evidence and artifacts

- Local targeted: `tests/play-account-safety.test.ts`, existing `tests/community-social.test.ts`, `npm run typecheck`, `npm run check:static`; commands/results summarized in final PR. Browser evidence is `test-results/play-readiness/verification.json` with 297 passed screen/dimension cases and genuine screenshots when successful.
- Required final PR **Kingdom Come checks** remains unchanged in scope/requirements; the additional screenshot folder is retained as evidence. Unknown paths continue using the full profile. No skipped/removed assertions or recovery bypass is authorized.
- **Kingdom Come Android readiness** adds `apk` plus API29/API36 real-emulator jobs. Artifact includes unsigned release AAB, debug APK/test APK, SHA256 and `bundle-verification.json`; signing status is explicit. No release key is available to ordinary PR builds.
- Signed release artifacts can only be generated later by **Kingdom Come signed Android bundle**, after owner identity/key/environment setup and authorized merge. See [Android release guide](../../../android/PLAY_RELEASE.md).

## Remaining owner checkpoint

Complete/approve the legal placeholders and data-specific erasure/retention/backup-restore procedure; confirm moderation/support operations and provider disclosures. Choose permanent package ID and supply the upload-key configuration privately through the reviewed environment, never chat. Review asset/name rights and actual-device/Play pre-launch results. Complete Console listing, Data Safety, App Content, audience/rating/countries, app-access instructions, App Signing enrollment and required testing. Any web compliance deployment or merge requires separate authorization; this candidate is not live.

Do not claim final signing, data erasure, Android-device coverage or legal/Play approval from a green unsigned build. Blockers remain explicitly unresolved until their own evidence exists.
