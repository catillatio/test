# Data Safety worksheet — owner declaration draft

Scope: current server plus Android client, not only the small APK. Reviewed 2026-11-05. Owner completes Play Console; these are evidence-backed prompts, not submitted answers.

| Data | Actual processing / evidence | Draft classification | Unresolved declaration |
|---|---|---|---|
| Account name, character name, stable account/character UUIDs | `src/auth.ts`, accounts/characters | User IDs; display name may be personal info | Required for account/gameplay; public character names/profiles visible to other players |
| Password | HTTPS authentication; Argon2id hash stored; `src/auth.ts` | Authentication/security data; never disclose plaintext | Explain credential handling; not an assertion passwords are never transmitted |
| Session token hash, CSRF, creation/expiry/activity | sessions; HTTP-only Secure cookie on HTTPS | Authentication identifiers / app activity | Authenticated cookie 30 days; server inactivity gate 7 days; cookie expiry is not deletion of all server data |
| Progression, purchases with virtual gold, resources, battles, bounties, property, social links | authoritative PostgreSQL tables and command receipts | App activity / gameplay interactions; evaluate financial-info categories carefully | Virtual gold is not proof of real-money billing; include every actual monetization integration if later added |
| Comments, broadcasts, user/content reports, block lists, policy consent | realm_messages/social_* and new acceptance table | Other user-generated content / app activity | Public visibility is distinct from provider processing; classify sharing under Google's current definitions |
| IP/request/diagnostic metadata | Fastify optional logger; Railway edge/provider logs not fully inspectable | Device/other identifiers, diagnostics as applicable | Provider logging, residency, retention and all destinations require owner/provider verification |
| Sound/tutorial/settings preferences | server preferences plus first-party DOM storage | App settings/activity | No native tracking SDK found; do not claim zero provider telemetry |
| Recovery backups and restored copies | existing encrypted independent recovery | Same categories as source data | Owner-approved retention, restricted access, expiry and restore-time erasure handling remain required |

Transport: release client permits the one HTTPS game origin, system CA trust, no cleartext/mixed/file/content loads; third-party cookies are disabled. Foreign resources are blocked. Browser-selected external HTTPS links are confirmed and opened separately. No JavaScript-to-native bridge, camera/contact/location/microphone/advertising-ID/storage permission, analytics, ad, billing or push SDK is included in the reviewed client.

No runtime third-party analytics request was identified in the inspected scripts. This does not certify Railway/provider-side logging, external browser destinations, future integrations or legal definitions of sharing. Do not answer “no data collected” merely because the native shell has no SDKs. Do not claim end-to-end encryption: HTTPS plus encrypted recovery artifacts does not prevent the application server from processing game data.

Deletion request routes are implemented; completed fulfillment, immutable-record treatment, backup expiry and lost-access support remain release blockers. Do not declare deletion fully supported until those operational requirements are met.

Owner reviews required/optional collection, purposes, sharing/service-provider exceptions, encryption, deletion and retention against the actual complete service. [Data Safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469) and [User Data](https://support.google.com/googleplay/android-developer/answer/10144311).
