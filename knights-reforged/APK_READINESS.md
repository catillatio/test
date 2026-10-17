# Next milestone: a private installable Kingdom Come Android client

Assessment after Phase 4: start with a **small Android WebView shell loading the existing server-rendered game over one stable HTTPS origin**. This is a recommendation for the next phase, not an implemented or device-verified APK. Keep gameplay and PostgreSQL on the existing server architecture. A native-screen rewrite is unnecessary for the current compact five-tab interface.

| Approach | Fit for the next milestone | Tradeoffs |
| --- | --- | --- |
| WebView shell | Recommended initial private APK: retain SSR forms, compact interface, same-origin requests and server updates | Native work needed for cookie lifecycle, back navigation, insets/keyboard, errors, URL handling, accessibility and device tests |
| Trusted Web Activity | Good later option once a stable owned website and verified app/site association exist | Uses a supporting browser to render web content fullscreen; requires Digital Asset Links association and appropriate web packaging; less direct native control of the page |
| Native UI/API rewrite | Defer | Would duplicate presentation/navigation and materially expand scope before the current loop is tested on-device |

Android's official [WebView guide](https://developer.android.com/develop/ui/views/layout/webapps/webview) supports loading a hosted web application, handling navigation and enabling its JavaScript. That fits the current server-rendered architecture. This app needs JavaScript for enhanced resource/target refresh, while essential forms already work without it. No JavaScript-to-native bridge is needed for this first shell.

Chrome's [Trusted Web Activity overview](https://developer.chrome.com/docs/android/trusted-web-activity) explains browser-based rendering, Digital Asset Links verification and the native host's lack of direct access to web cookies/state. TWA is a credible alternative after origin ownership and web packaging are settled; it is not a way to embed the database or make the multiplayer game offline. Its browser-session behavior also differs from a WebView client's cookie lifecycle.

For a WebView, parse and strictly allowlist the exact HTTPS scheme/host/port, keeping external destinations in the system browser. Follow Android's [unsafe URI loading guidance](https://developer.android.com/privacy-and-security/risks/unsafe-uri-loading). Do not accept arbitrary URLs, ignore TLS errors, enable cleartext traffic, expose file/content access or add an unrestricted native bridge. Release debugging must be off. These are proposed native-client requirements; browser tests do not verify them.

## Authentication, origin and multiplayer data

Load the actual HTTPS pages rather than bundled `file://` HTML making cross-origin API calls. Preserve server-controlled Secure/HttpOnly/Lax cookies, normal native form POSTs, strict Origin validation, same-origin Referrer policy, session-bound CSRF and logout/session rotation. Do not inject or spoof Origin headers to make a shell work. Test actual Android WebView Origin/Referer behavior before distribution.

The WebView should manage its authenticated cookies normally; do not copy session tokens into JavaScript, intents, APK resources or logs. Verify signed-in relaunch, process death, session expiry, logout and safe back-stack behavior. Do not assume the user's Chrome game session is automatically the shell's session. Existing game usernames/passwords and characters must still authenticate against the same persistent backend.

The APK is a client. Accounts, progression, inventories, ally consent, comments, broadcasts, Land schedules, battle reports and escrow remain in PostgreSQL. Server-side calculations, locking and idempotent commands stay authoritative. Unavailable networking must never create local gold, resources or combat results. Offline Land/recovery catch-up already occurs on the next authoritative request. On reconnect, reload current server state; a retried action retains its command ID instead of creating an unconfirmed second payment.

## Hosting and updates

Before meaningful device testing, select a stable owner-controlled HTTPS realm and persistent PostgreSQL with backups. Keep staging access restricted and credentials out of Git. The existing private Codespaces address remains useful for browser development, but its provider sign-in, variable lifecycle and potentially stopped workspace are unsuitable as the long-term multiplayer endpoint. Private forwarded-provider authentication inside a proposed shell has not been verified. A TWA additionally needs a stable app/site association; do not promise verification against the current ephemeral private tunnel.

No hosting service was provisioned or paid for during Phase 4. Moving the existing realm requires a deliberate database backup/restore or existing managed database connection, not creating a new empty database and claiming accounts transferred. A domain, hosting provider/access model and any costs require a separate deployment decision.

Most subsequent gameplay/template/art updates can ship on the server, retaining versioned rules and compatible migrations. Native navigation/security/API changes, app icons, permissions or signing changes need a new APK. Keep a stable application ID and securely retained signing identity; test upgrade installation without losing the client's session state or changing the server account identity. A production store release needs its own current distribution-policy and operational review.

## Practical next implementation sequence

1. Confirm the stable private/staging HTTPS endpoint and persistent database/backup plan. Keep the current PC/browser client working.
2. Create a minimal Kotlin Android project on a new branch, with INTERNET permission and a single WebView activity. Load only the approved HTTPS origin. Implement native back behavior, lifecycle state, keyboard/insets and clear retry/sign-in errors; use system-browser handling for external links.
3. Verify registration, login, persisted sign-in, logout and all CSRF/Origin-protected POSTs using actual WebView network behavior. Keep strict validation intact. Never bundle a development password or game database.
4. Run the full quest → equipment → army → PvP → Land → progression loop on an emulator and at least one physical Android phone. Test repeat attacks, a zero-Health target, concurrent interactions from PC, reports, public profiles, comments, broadcasts, invitations and moderation effects.
5. Exercise TalkBack, large fonts, narrow screens, gestures/back, IME, screen rotation, Android process death, airplane mode/reconnect, expired sessions and app upgrades. Check that no retries duplicate purchases, posts, loot or bounty claims.
6. Produce a signed **private alpha APK** and documented update path only after those tests. Do not label browser viewport captures as APK compatibility evidence.

The Phase 4 code/build/database/browser checks are complete as documented in the verification record. Physical Android/WebView behavior, emulator/build tooling, signing, APK installation and production hosting remain unverified future work. No premature conversion or native rewrite was made.
