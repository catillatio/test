# Kingdom Come — sideloadable Android alpha

Implements [Issue #19](https://github.com/catillatio/test/issues/19). A small Java/platform WebView shell loads **https://test-production-995c.up.railway.app** in its own window. Application ID: `game.kingdomcome.alpha`; version `0.1.0-alpha.1` / code `1`; Android 8.0/API 26 or newer. The intended first physical test device is the owner's Samsung Galaxy S24. The APK is an online client, not an offline game or a copy of the server/database.

A native shell avoids Capacitor, AndroidX and a duplicate game UI/API. Existing HTTPS pages retain their server-authoritative gameplay, accounts, first-party forms/cookies, CSRF/Origin checks, five tabs and audio preferences. No server route, gameplay, Railway variable, autonomous flag, production record or protected release workflow changes. No production account/backend is used by build/tests. A provider outage cannot stop APK compilation; the installed app offers a native recovery panel when the realm is unavailable.

## Download the actual APK from GitHub

1. Open the Android draft PR → **Checks → Kingdom Come Android alpha APK → Details** (or repository **Actions → Kingdom Come Android alpha APK**).
2. Select the completed successful run for the reviewed commit. Under **Artifacts**, download **`kingdom-come-android-alpha-<run ID>`**. GitHub requires sign-in to download artifacts. Extraction produces `kingdom-come-alpha-debug.apk`, `SHA256SUMS.txt` and `verification.json` with package, version, build commit, APK hash and public signing-certificate fingerprint. Never install the checks/reports artifact or a source-code ZIP.
3. Artifacts are retained for **30 days**. On Android, extract the ZIP with **My Files**. Preserve the checksum/report with the APK. On a trusted desktop, `sha256sum --check SHA256SUMS.txt` verifies the extracted file.

The Android workflow runs on relevant PR changes and can be manually requested after it exists on the default branch. It has read-only repository permissions and no protected production environment, credentials, Railway tooling, backend calls, release controller or deployment step. Normal backend checks remain independent and unchanged. Opening a draft PR runs ordinary build/test CI; it does not promote the game.

## Install on Samsung Galaxy S24

1. Download/extract the reviewed artifact above, then tap `kingdom-come-alpha-debug.apk` in My Files.
2. If Android requests it, allow **Install unknown apps** for the specific app you used to open the APK, then choose **Install**. Return that install permission to its previous state afterwards. Samsung Auto Blocker/device-management policy may prohibit sideloading; use an owner-approved test-device configuration or the browser game rather than bypassing an organizational restriction.
3. Open **Kingdom Come Alpha**. Log in with the existing game account. The app has its own private WebView cookie storage, so a Chrome login is not automatically imported. Existing characters/progress remain on the same server.
4. Enable sound only in the game's Settings if desired. Saved server sound/mute/volume preferences are not overridden; playback still requires a browser-recognized user gesture. Ordinary navigation remains silent.

Only INTERNET permission is declared. There is no camera, storage, contacts, location, notifications, billing, tracking SDK, native credential storage, native JavaScript bridge or background bot worker. The original temporary icon/splash provenance is in [ASSETS.md](ASSETS.md).

## Cookies, navigation and recovery

- Exact HTTPS scheme/host and default/443 port are required in-app. Userinfo, deceptive hosts, file/content/data/javascript/intent schemes and cleartext loads are rejected. Foreign subresources are blocked. User-tapped external HTTPS links require confirmation and open in a separate browser without copying cookies or headers. Automatic cross-origin navigation is blocked.
- First-party HTTPS links can be opened through Android's user-selected **Open with** association. No verified App Links/domain association is claimed or installed. Existing invitation codes and profile/army URLs use the unchanged server flows; no invitation is auto-accepted.
- Android Back uses WebView history, then closes the activity at its root. Login/register pages clear old history, while logout still revokes the normal server session. On activity recreation/process restoration, the app requests the last known safe screen with a **fresh GET**; form bodies, passwords and pending POSTs are not serialized/replayed. Unsaved text and the old native history stack are not restored. The server's ordinary receipts and web-storage recovery remain authoritative.
- Cookies/DOM storage persist in the app's private WebView profile and cookies are flushed on pause/page completion. Android backup/device transfer of app data is excluded. The shell neither reads HttpOnly cookies nor fabricates Origin/Referer/CSRF headers.
- Network/TLS/server-5xx failures show a native recovery panel. **Return to game** requests the last known safe page; **Open Home** requests Home. Neither resends an action. If a request was interrupted, check the resulting balance/history before trying the action again. WebView form-resubmission callbacks are explicitly declined. Normal server 4xx pages remain visible with their original validation/authentication explanations.
- The keyboard resizes available space. API 30+ system-bar/cutout/IME insets are applied outside the WebView; older Android uses the platform resize behavior. Zoom is available, native controls use scalable text and ≥48dp heights, and no fixed native toolbar covers the five-tab interface.
- TLS errors are cancelled, system CA trust is retained, cleartext/mixed/file/content access and WebView debugging are disabled even in the debug APK. App-created dialogs do not print sensitive URLs, page console output or credentials.

## Build and checks

Install a JDK 17+ and Android SDK API 36 / build-tools 36.0.0. Set `ANDROID_HOME` through your local SDK configuration; do not commit `local.properties`, caches or keys. From `android/`:

```sh
./gradlew --no-daemon --console=plain testDebugUnitTest lintDebug assembleDebug
python3 scripts/verify-apk.py \
  --apk app/build/outputs/apk/debug/app-debug.apk \
  --tools "$ANDROID_HOME/build-tools/36.0.0"
```

Gradle 8.13 has a pinned distribution checksum; all build/plugin/test versions are declared. CI uses an exact Temurin JDK, pinned setup actions and command-line tools. The verifier checks the built APK signature/package/SDK/sole permission, compiled cleartext/backup flags, absence of packaged key files, and publishes its SHA-256 and public signer fingerprint. Unit tests exercise allowed game/invitation URLs, lookalike hosts, credentials/schemes, external-gesture separation, safe GET recovery and authentication history decisions. Lint checks platform/API/accessibility/security issues with warnings treated as errors. Only the informational newest-tool-version hint is disabled because this build intentionally pins its toolchain; the legacy Back override has a documented, method-local lint exception because API 33+ uses the separate platform callback.

These are compilation/lint/JVM-policy/artifact checks, **not physical Android WebView integration results**. No emulator or production login is used by this build. The device checklist below remains a condition of owner alpha acceptance. Automated policy tests do not prove cookie persistence, audible output or TalkBack on the actual phone.

## Debug signing and future updates

The alpha artifact is signed with a locally/runner-generated **Android debug key**. It is debuggable at the Android application level even though WebView remote debugging is explicitly disabled; this is a private alpha build, not a hardened release APK. No private signing key is stored in GitHub/repository artifacts. Clean runners may produce different certificates: compare `signerCertificateSha256` before updating. Android requires the same application ID and signing identity for an in-place update; an APK with a different certificate cannot replace an installed copy.

For a differently signed alpha build, uninstall/reinstall only if the owner accepts losing **local WebView cookies/storage and unsaved state**. This signs the client out but does not delete its server account/progression. First check interrupted actions from a trusted signed-in browser. Never reset the realm to fix an installation error.

Before regular distribution, the owner should choose a dedicated stable Android signing key and application-ID/version policy, retain encrypted offline backups and use a separate tightly scoped Android-signing secret/environment. Do not reuse Railway/release keys or production credentials. That setup is not performed here; no stable signing/update compatibility, Play Store readiness or automatic updater is claimed.

## Owner physical-device checklist (not yet verified)

- [ ] Install and inspect icon/splash on Galaxy S24; confirm no Chrome toolbar or extra permissions.
- [ ] Login existing account, background/reopen, rotate, kill/relaunch, expire session and logout; verify persistent/revoked sessions and safe Back behavior.
- [ ] Test all five tabs, keyboard/IME Back, landscape, cutout/gesture insets, larger system text/zoom and TalkBack.
- [ ] Complete normal quest, single/bulk equipment and Land actions, Vault, battle/report/Attack Again and invitation consent. Confirm unchanged gold/XP/receipts from ordinary server-authorized play; do not create test grants or reset data.
- [ ] Test rapid taps, interruption after submit, back/reload, airplane mode/reconnect and server outage. Verify native recovery never resends a POST or duplicates a transaction.
- [ ] Test muted/enabled audio, gesture unlock, volume, app backgrounding, return and interrupted rewards. Routine navigation must remain silent.
- [ ] Verify external HTTPS confirmation/browser, rejected unsafe links, selected same-origin links and invitation-code copying; no app cookie transfer to the browser.
- [ ] Test a same-certificate upgrade; verify different-certificate rejection is understood. Do not uninstall blindly while a transaction is uncertain.

**Development/build only. Pause for owner review. No backend merge/deployment, production mutation, autonomous activation or PR #13 work is authorized.**
