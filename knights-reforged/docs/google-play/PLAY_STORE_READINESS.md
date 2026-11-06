# Kingdom Come — Play internal/closed-testing candidate

2026-11-05. PR #88; **not merged, deployed, signed with an owner key or submitted**.
Technical implementation is prepared for exact-head CI; actual check/artifact links
are maintained on the PR. Do not call the app submission-ready while the owner-only
signing, live-policy and deletion-operation steps below remain incomplete.

## Launch scope

NPC population, graveyard configuration, economic simulations and optional gameplay
are not launch requirements. They remain disabled and are preserved at exact
`b94cfdb8756eb71283839d6cd8196bc93912fd8a` on
[archive/graveyard-population-b94cfdb](https://github.com/catillatio/test/tree/archive/graveyard-population-b94cfdb).
Existing separate gates mean no NPC setup/approval is needed for Play or erasure.
No further NPC development is part of this task. See [launch scope](LAUNCH_SCOPE.md).

The prior b94cfdb full application run #42104910701 passed 10/10 and Android #42104910872
passed 3/3. Reuse those unchanged-baseline facts; new candidate checks must still be
exact-head. The approved Dark Medieval design, gameplay/economy and Crime RPG remain
unchanged. No new dependency, SDK, feature, game balance or production resource is added.

## Technical status

| Area | Implemented verification | Limit / owner gate |
|---|---|---|
| Packaging/API | Permanent app/namespace `game.kingdomcome.rpg`; min 26 / target 36; unsigned release AAB, strict compiled manifest/bundle/security verifier | Actual package registration and owner upload signature remain owner-only. No substitute ID or debug-key release |
| Signing/update | Protected exact-production-head CI gate, version validation, private owner upload key, expected public certificate verification, no upload command | Owner chooses existing/correct key, confirms versionCode above prior uploads; no key generated here |
| WebView/auth | Exact HTTPS origin, first-party cookies, no native JS bridge/file/content/mixed access or third-party cookies, native error/Back/renderer handling; server sessions/CSRF/origin/logout | Actual API 29/API 36 intercepted-fixture tests, no production requests; physical/Play upgrade evidence remains distinct |
| Legal pages | Public HTML privacy/terms/community/deletion, linked from app/footer/auth/Settings | Draft placeholders must be finalized by owner and deployed; live URLs currently 404 |
| Account deletion | Public/in-app authenticated request plus actual signed fulfillment, physical credentials/account removal, personal data removal, current-profile minimization, financial preservation, independently protected suppression and real recovered-DB tests | Retention purposes/periods and protected operator/key/journal installation/activation require separate authorization; no real account touched |
| UGC | Terms/Guidelines required before registration publishes a name; explicit versioned posting consent; message/user report, reversible block and private moderator queue | Owner must staff/use ongoing moderation and provide accurate support/privacy contact; no invented staffing claim |
| Data Safety | Source inventory, native no tracking/ads/billing SDK, sole INTERNET permission, source/native/browser network/security checks; browser audit rejects unexpected foreign resource attempts | Owner declares full backend/provider practices and actual retention/sharing; no “no data collected” claim |
| Compatibility | 27 real EJS scenes  × 11 viewport dimensions, including 360/384/393/412 CSS pixels, plus320/390/432/600/800/1280; large-text/landscape checks and genuine screenshots | Browser dimensions are not full Android/hardware certification. API 29/API 36 real-WebView smoke is limited platform evidence |
| Assets | Existing original launcher/adaptive/splash/512 icon/1024×500 feature exports;8 actual 1080×1920 gameplay screenshots, 2 tablet layouts, provenance/dimension inventories | Owner listing/rights review; no new fabricated gameplay art or marketing screenshots |
| CI/recovery | Original full application/database/browser/container/encrypted independent recovery and Android requirements retained | Final exact-head results/artifacts on PR; no bypass, skip or stale-head substitution |

Detailed scope is in [policy classification](POLICY_REQUIREMENTS.md),
[Data Safety worksheet](DATA_SAFETY.md), [deletion implementation](ACCOUNT_DELETION.md),
[retention decisions](privacy/OWNER_DECISIONS.md), [App Content](APP_CONTENT.md),
[asset audit](ASSET_LICENSE_AUDIT.md) and [Android guide](../../../android/PLAY_RELEASE.md).

## Verified public endpoints and deployment status

Read-only public HTTPS inspection on 2026-11-05:

| URL | Observed status |
|---|---|
| https://test-production-995c.up.railway.app/healthz |200 ready; commit 9429e88365d112f5597371c7aa811110f967558d |
| https://test-production-995c.up.railway.app/legal/privacy |404; candidate not deployed |
| https://test-production-995c.up.railway.app/legal/terms |404; candidate not deployed |
| https://test-production-995c.up.railway.app/legal/community |404; candidate not deployed |
| https://test-production-995c.up.railway.app/account-deletion |404; candidate not deployed |

These are the intended Console legal/deletion links after separately authorized
backend release and final text. Synthetic app tests must return 200; a local pass
is not proof of live availability. No protected release/recovery/deployment was
started. [Safe public response metadata](live-policy-endpoints.json).

## Exact owner-controlled blockers

1. A/D are approved and C is conditional; approve only the minimized B proposal in [RETENTION_MINIMIZATION.md](privacy/RETENTION_MINIMIZATION.md), and publish final legal/controller/
   privacy/support facts and response practices. Independent legal/privacy
   certification is not a universal Google requirement; resolve actual applicable
   obligations and this game's retained-record justification. No unapproved policy
   is activated. See the small decision table, not the optional NPC documents.
2. Separately authorize the normal protected merge/backend deployment and restricted
   eraser/journal/key setup, verify suppression/fulfillment operationally on approved
   synthetic acceptance, then explicitly authorize real operation. Existing financial,
   encryption, signing, exact-target, release-lock and restore safeguards remain.
   Without this, the app has a tested engine but no live deletion fulfillment service.
3. Confirm `game.kingdomcome.rpg` in Play Console and privately configure the correct
   upload key/certificate/version through protected `android-release`. After authorized
   merge and green exact production-head CI, the existing signing workflow generates
   the owner-signed AAB. An unsigned AAB must never be uploaded as a release.

No independent engineering optimization, NPC policy, economy change, four-phone
purchase or third-party certificate is introduced as a launch gate. Actual Console
findings or applicable legal decisions may identify specific additional work; do
not invent compliance or hide the current operational blockers.

## Console steps the owner performs

1. Create/confirm **Kingdom Come**, permanent package `game.kingdomcome.rpg`, app-signing
   enrollment and correct upload identity/version. Do not upload an unsigned preview.
2. Complete publisher/contact/legal agreements, listing/approved assets, countries,
   audience/content rating, App Content and applicable Data Safety using actual
   backend behavior. Set the live privacy and public-deletion URLs above.
3. Supply a dedicated reviewer/synthetic App access account privately in Console and
   verify it can reach all game screens. Do not publish credentials in repo/docs.
4. After the live backend/fulfillment gates pass, upload the **OWNER_UPLOAD_SIGNED**
   AAB and its correct package/version to internal or closed testing. Add the tester
   group, rollout and share the opt-in link; examine pre-launch/device reports.
5. Meet any account-specific production-access conditions. The published new-personal-
   account rule is 12 continuously opted-in closed testers for 14 days; Console decides
   applicability. It does not prevent preparing/first uploading an internal build.

No Console declaration, audience choice, final upload, legal agreement or submission
is made on the owner's behalf. No unsigned bundle, source inspection or green test
is described as a final Play approval.

The v6 B proposal removes unnecessary current assets/caches and narrows retained records to specific historical dependencies. It remains unapproved/unactivated. C verification established 90-day production recovery artifact expiry, not 30-day enforcement. No existing artifact/backup schedule is shortened and no source from another SHA approves this candidate. Final current-head CI is linked on PR #88.
