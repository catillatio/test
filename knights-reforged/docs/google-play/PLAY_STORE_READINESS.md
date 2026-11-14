# Private Google Play INTERNAL testing — PR #88

Candidate reconciled with deployed `c8247dfa891c9f2c0458ff7df523f09fa24f0cfa`.
PR remains draft. No merge, deployment, real erasure, credential installation,
provider change, Play upload or public release is performed. Current exact-head
results/artifact links are recorded on the PR, never borrowed from `3d273e8`.

| Area | Candidate status | Remaining boundary |
|---|---|---|
| Production integration | Current gameplay, Dark Medieval art, class silhouettes, notifications, immutable rules, financial histories and XP matcher preserved; old Play migrations moved to053/054 after deployed052 | Separate merge/backend-release approval; new required exact-head CI |
| Android/security | `game.kingdomcome.rpg`, compile/target 36, min 26, sole INTERNET permission, HTTPS first-party WebView, safe lifecycle/Back/error recovery and no POST replay; unit/lint/AAB/native emulator workflows | Owner registration/upload key/certificate/version; no signed artifact without private configuration |
| Privacy/UGC | Accessible HTML notices and deletion requests; explicit registration/posting consent, user/message reports, reversible blocks, timed mute/appeal and private moderation queue | Final publisher/applicable legal facts; approved support/privacy contact m055allsupport@gmail.com, human moderation operation, backend publication |
| Deletion fulfillment | Physical account/credential removal, personal-data minimization, exact financial preservation, restricted role, independent signed journal relay, recovery fencing and real production release-mutex verification | Separately approved operator/volume/readers/key/environment setup and synthetic operational acceptance; execution remains off |
| Retention | A/B/D approved; B exact approved provenance recorded; C conditional with completed owner Railway observations and ~90-day GitHub artifacts | Other recovery copies/provider practices/holds unresolved; no 30-day guarantee, no existing backup changed |
| Browser/assets | Real EJS/PostgreSQL viewport matrix, synthetic native forms and original gameplay/listing assets | Genuine browser captures are distinct from emulator, hardware and Play pre-launch evidence |
| Internal track | No new billing, ads, cookie banner, age-verification system or optional NPC work | Owner-only Console declarations/tester invites/App access; no public rollout |

## Evidence and limits

- New exact-source application workflow must pass all 10 jobs, including database,
  browser, migration/data preservation, container/recovery and aggregate checks.
- Android readiness must pass `apk`, `webview (29)`, `webview (36)` at the new SHA.
  Native tests use the real Android WebView with intercepted synthetic fixtures,
  not real-player interactions. Local browser widths320/360/384/390/393/412/432/
  600/800/1280 include landscape/large-text cases. See generated CI/browser reports.
- Current release AAB defaults versionCode 2 / versionName 0.2.0-beta.1; verifier binds
  source, compiled ID/version/SDKs, permission/component security and artifact SHA.
  **UNSIGNED_NOT_UPLOADABLE** is a reproducible signing-ready candidate, never an
  uploadable release. Expected-owner certificate and JAR verification are mandatory
  in the separate protected signed-bundle workflow; Android debug keys are rejected.
- Existing production source contains no new `/legal/privacy`, `/legal/terms`,
  `/legal/community` or `/account-deletion` routes. Local tests require HTTP200.
  Historical live404 evidence is in `live-policy-endpoints.json`; it is not a fresh
  probe of the present deployment. Only safe `/healthz` was refreshed during this
  task and reported ready at c8247df. Avoid creating live anonymous sessions merely
  to probe legal pages before separately approved backend deployment.
- A queue alone is insufficient. Today no production fulfillment operator is
  installed; do not claim a real person's deletion request could be completed by
  automatic production operations. The tested private engine and exact setup are
  documented in [ACCOUNT_DELETION.md](ACCOUNT_DELETION.md).
- Optional abandoned kingdoms remain independently gated and archived at
  `b94cfdb8756eb71283839d6cd8196bc93912fd8a`; no deletion-derived NPC creation, income
  loop, construction or population activation is part of this launch.

## Shortest owner sequence — separate authorizations remain

1. Finalize only factual publisher/controller,
   effective date and applicable legal/audience text (support/privacy/appeals contact is already m055allsupport@gmail.com) in the draft notices. A/B/D
   do not need reapproval. Do not claim unknown provider expiry or30-day enforcement.
2. Review/approve the final PR88 source, then separately authorize the normal
   protected backend merge/deploy AND the bounded private erasure operator/journal/
   reader setup in [ACCOUNT_DELETION.md](ACCOUNT_DELETION.md). Verify public legal/
   deletion URLs and synthetic operational erasure/old-restore acceptance before
   inviting testers. No real erasure is activated by this candidate.
3. Create protected GitHub `android-release` (currently absent): only
   `release/production`, required reviewer `catillatio`, no administrator bypass;
   self-review must allow this sole owner to approve. Privately configure the four
   upload-key secrets and two public variables listed in [Android guide](../../../android/PLAY_RELEASE.md).
   No key/password belongs in chat or a repository. Configure separate protected
   `account-erasure` similarly for the credential-free mutex, with existing release
   preflight flags deliberately reviewed for that environment. The actual private
   signer/key and operator installation remain separately approved.
4. In actual Play Console confirm package `game.kingdomcome.rpg` and intended
   LLC/operator developer-profile exposure, enroll Play App Signing, and choose the
   existing upload identity or privately create one by your explicit choice. Pick
   a never-used higher versionCode. After authorized merge and green exact-source
   app+Android CI, run **Kingdoms Restored signed Android bundle** on `release/production`,
   enter version_code/version_name and approve `android-release`. Download only the
   verified **OWNER_UPLOAD_SIGNED** bundle/report matching your certificate and SHA.
5. Console → Testing → Internal testing: add an email list/Google Group (up to 100),
   create the internal release with that signed AAB, complete the applicable App
   Content/App access/listing/legal declarations and use the invited testers' opt-in
   link. Select no Production/open track. Internal delivery does not make the
   developer profile/private business facts invisible; verify Console's display.
   Examine actual pre-launch/device findings when available.

The internal-only Data Safety form exemption does not exempt User Data/privacy,
deleted-data fulfillment or UGC safety. Later personal-account closed-test
12 testers / 14 days production-access rules are conditional and are not a blocker for
this first internal upload. No independent legal certificate is universally required.
See [official policy mapping](POLICY_REQUIREMENTS.md), [Data Safety worksheet](DATA_SAFETY.md),
[App Content](APP_CONTENT.md), [asset audit](ASSET_LICENSE_AUDIT.md), and
[retention approvals](privacy/OWNER_DECISIONS.md).

Dependency validation found four moderate advisories in the deployed dependency
baseline. Narrow fixes: `@fastify/static`10.1.6→10.1.10 (patched send/glob/minimatch
transitives), `fast-uri`4.2.2→4.2.3 and AJV's3.1.8→3.1.9. No new application SDK,
permission or gameplay behavior is introduced. Both production dependency trees
report zero current npm advisories after these updates; final CI independently
checks the locked versions. No global npm setting or shared worktree was changed.

## Internal App Sharing is a separate delivery option

Reviewed 2026-11-13. [Official IAS instructions](https://support.google.com/googleplay/android-developer/answer/9844679):
IAS accepts an already signed APK/AAB signed with any key and Google re-signs it
with its separate IAS key. It is not an Internal testing-track release, does not
enter the bundle explorer, and cannot be promoted to a testing/production track.
A production upload key is therefore not an IAS platform requirement. No new key
is generated or approved here; any build/signing action still needs the owner's
separate choice. An unsigned artifact is not claimed uploadable.

For ~50 private recipients, select **Email lists** under Internal app sharing →
Uploaders and testers; avoid the default anyone-with-link access. Invite those
Google accounts. Each link permits at most100 downloads and expires after60 days;
testers must enable IAS in their Play Store app. Do not upload/share until the
owner approves and developer-identity exposure is resolved. IAS does not privatize
the publicly reachable game server or make test actions synthetic.

**Identity checkpoint before any link distribution:** inspect Play Console →
Developer account → Account details / developer profile and the linked Payments
profile. Confirm personal versus organization account, verified legal entity,
address, public developer email/phone, monetization and regional trader/contact
disclosures. Preview the actual tester-facing installation/developer surfaces with
a separate invited Google account. Do not send private identity documents here.
An alternate display name or support email does not suppress Google's identity
rules. [Google's identity guide](https://support.google.com/googleplay/android-developer/answer/13628312)
says personal accounts expose legal name/country/email (full address if monetized,
with possible regional additions); organizations expose legal name/address and
other verified business details. The available connection cannot inspect this
owner Console, so actual tester exposure remains unverified.

Normal Internal testing uses the protected **OWNER_UPLOAD_SIGNED** AAB, permanent
ID `game.kingdomcome.rpg`, Play App Signing and the Internal testing track's tester
list/opt-in URL. It supports100 testers; do not select public Production/Open
rollout. Later public-release listing, Data Safety/App Content and applicable
production-access requirements remain separate. See
[official testing tracks](https://support.google.com/googleplay/android-developer/answer/9845334).

## Current source integration and activation boundaries

PR88 reconciliation parent: `ab5fb629f9ba578c5100c127816090133d1b310f` (PR head
6f34d5e plus deployed c8247df). The manifest union retains195 entries, including
all nine Play-only tests and production's notification semantics test. The
separately reviewable Kingdoms Restored source change is stacked on that result.
New exact-head CI supersedes old-head evidence; inspect the actual PR checks.
Neither source change is merged/deployed by this work. Runtime feature activations
are separately owner-authorized and do not authorize Play/erasure activation.

Deletion readiness still needs: separately authorized protected backend release;
private restricted operator and independent durable journal/relay installation;
owner signer/public-key policy bindings; actual protected release-mutex integration;
synthetic physical-erasure plus old-backup restore-suppression acceptance; and
working public notices/deletion URLs. These are documented in ACCOUNT_DELETION.md.
No real account deletion, credential installation or journal setup is performed.
A/B/D remain approved; C stays conditional with no changed provider/backup policy.
