# Kingdoms Restored — private Google Play launch handoff (updated 2026-11-24)

This is the **current owner-action and operator handoff** for a private, email-restricted **Internal testing** release (up to 100 testers). [PLAY_STORE_READINESS.md](PLAY_STORE_READINESS.md) retains PR #88's historical implementation evidence. Play Console registration, legal publication and production erasure remain pending.

## Verified state (2026-11-24)

- Repository `catillatio/test`, default/production branch `release/production`, observed head `b4b66871d9f1448450f6087712cbcd243975c4dd`. The Play source is merged in [PR #88](https://github.com/catillatio/test/pull/88). [PR #103](https://github.com/catillatio/test/pull/103) merged the Production-gate reuse. Exact merge-commit [application CI](https://github.com/catillatio/test/actions/runs/45514450662) passed 10/10, and [Android readiness](https://github.com/catillatio/test/actions/runs/45514450598) passed 3/3.
- The last protected game [promotion](https://github.com/catillatio/test/actions/runs/44193347444) deployed security source `d8f913e`. The new erasure source has a separate [build-only preparation run](https://github.com/catillatio/test/actions/runs/45519420657). Source SHA, runtime image digest and Play AAB are separate identities.
- Android source is configured for display name **Kingdoms Restored**, permanent ID `game.kingdomcome.rpg`, debug suffix `.debug`, min SDK 26, target SDK 36, default code 2 and name `0.2.0-beta.1`. Its normal CI emits **UNSIGNED_NOT_UPLOADABLE**: it cannot be uploaded to Play.
- No signed-bundle run appeared among the latest 100 repository Actions runs examined. This is not proof that no signed artifact has ever existed; inspect the owner environment and Play Console before assigning a version.
- Railway has a staged, undeployed `KingdomAccountErasure` service and 512 MB journal volume in `iad`. The 13-change patch is confined to those resources. The service has no source image staged. The existing `KingdomCopyRetention` and its volume remain dedicated to recovery-copy retirement.
- The checked-in `src/legal-content.ts` still contains `[OWNER TO COMPLETE]` publisher/effective-date/audience/other legal placeholders. Legal and deletion URL responses were **not** verified live: external browser fetch was unavailable, and anonymous endpoint requests may create guest sessions. Do not mark links operational without an approved bounded probe or existing deployment evidence.
- Current owner preference: business/LLC setup has **not** been completed. Do not create a personal Play developer profile just as an expedient substitute; public verified identity exposure must be decided by the owner.

## Owner-free work already complete / reusable

1. Reconciled and merged WebView-only app source, signed-bundle workflow, package identity guard, Android 29/36 emulator test pipeline, browser viewport/test coverage, and original store icon/feature art.
2. Reviewed source privacy, terms, community and deletion **drafts**, support contact `m055allsupport@gmail.com`, data-flow/Data Safety worksheet, assets/license inventory, and private testing instructions. These are drafts, not final legal declarations.
3. Existing source-controlled owner-only signing flow: [.github/workflows/android-release.yml](../../../.github/workflows/android-release.yml), [Android release guide](../../../android/PLAY_RELEASE.md), and [private signing/verification script](../../../android/scripts/sign-release.py). It uses no debug signing fallback and publishes no bundle to Play.
4. Existing private erasure source and synthetic coverage: [ACCOUNT_DELETION.md](ACCOUNT_DELETION.md). Only a request queue and synthetic-tested fulfillment are present; **production operator activation is separate**.

## Outstanding gates — exact order

### A. Verify publisher identity before any Play account or tester invitation

**OWNER:** decide between a personal and organization developer account, after reviewing **what Google publicly displays**. For an organization account, establish and verify the organization, D-U-N-S identifier, organization address/website, public email and phone as required by Play. Do not invent an LLC name, person, address, company domain, legal effective date or billing profile. A personal account can be set up without an LLC but is not identity-anonymous. Organization details may also be public.

Google: [developer identity requirements](https://support.google.com/googleplay/android-developer/answer/13628312), [testing tracks](https://support.google.com/googleplay/android-developer/answer/9845334).

### B. Finalize factual legal text and operational account deletion

**OWNER + REVIEWED ENGINEERING:** fill publisher/controller, effective date, jurisdiction, minimum age, remedies, appeals/escalation, accurate retention and provider facts in `src/legal-content.ts`, mirrored documents `docs/google-play/LEGAL_*.md`, and Console disclosures. Preserve approved retention decisions A/B/D and **conditional C**; do not claim a 30-day backup expiry or that a queued request is completed deletion. Confirm official support mailbox ownership/availability.

**OWNER-GATED OPERATOR INSTALL:** [PR #103](https://github.com/catillatio/test/pull/103) reuses **Production**. Use the [installation and rehearsal checklist](ACCOUNT_ERASURE_INSTALLATION_20261124.md) to prepare the immutable image, private signing custody, dedicated journal and restricted SQL role. Approve a specific Railway patch only after the listed prerequisites are verified. Keep routine execution disabled. Verify the synthetic request, exact approval, deletion, older isolated restore and suppression before inviting testers.

After the protected backend release, verify `/legal/privacy`, `/legal/terms`, `/legal/community` and `/account-deletion` via approved read-only checks, and confirm the in-app deletion flow and server/operator follow-through.

References: [ACCOUNT_DELETION.md](ACCOUNT_DELETION.md), [owner retention decisions](privacy/OWNER_DECISIONS.md), [Google account deletion policy](https://support.google.com/googleplay/android-developer/answer/13327111).

### C. Owner-controlled Android signing, after legal identity choice

**OWNER:** confirm `game.kingdomcome.rpg` in the actual Play Console and choose a never-used, increasing `version_code`. Enroll Play App Signing. Privately manage an existing registered upload key, or explicitly choose a **new** upload identity when appropriate. Never place keystores/passwords in a chat, commit, issue, artifact or log.

Configure protected GitHub `android-release` environment (only `release/production`, owner reviewer, no admin bypass). Set **secrets** `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEY_ALIAS`. Set **nonsecret variables** `ANDROID_APPLICATION_ID=game.kingdomcome.rpg` and expected `ANDROID_UPLOAD_CERT_SHA256`. Check environment policy and key/cert match before manually dispatching **Kingdoms Restored signed Android bundle** with chosen `version_code` / `version_name`. Require green exact-head application and Android checks, valid owner approval, `OWNER_UPLOAD_SIGNED` in the verification report and matching SHA256. Never upload an unsigned CI artifact. The GitHub action **does not upload to Play**.

References: [Android signed release](../../../android/PLAY_RELEASE.md), [signed-bundle workflow](../../../.github/workflows/android-release.yml).

### D. Internal testing track and invite list

**OWNER (actual Play Console):** complete required account/app configuration, register app ID, privately provide a dedicated *synthetic* reviewer account and access steps in Play Console App access (no credentials in repo), complete applicable declarations (age/audience, content rating, data practices, privacy/deletion URL, countries, ads, UGC/content, trader/identity, actual monetization). Use drafts [APP_CONTENT.md](APP_CONTENT.md), [DATA_SAFETY.md](DATA_SAFETY.md), [listing](../../../android/store/LISTING_DRAFT.md), [original art audit](ASSET_LICENSE_AUDIT.md). Do not invent ratings, privacy claims or a legal certification.

Open **Testing → Internal testing**, create an approved Google-account email list, upload only the verified signed AAB and issue the opt-in link. Restrict to the approved list (target approximately 50 testers, maximum 100). Do not choose open/Production track. Internal testing may begin before completing the full production app setup, but that is **not** a waiver of truthful privacy, user-data and UGC behavior. A 12-tester/14-day **closed** test applies to **production-access** requests for some personal developer accounts; it does not block the first internal test.

Google: [internal testing](https://support.google.com/googleplay/android-developer/answer/9845334), [new personal account production-access test](https://support.google.com/googleplay/android-developer/answer/14151465).

## Ready-to-use Play Console reviewer-access description (add credentials privately)

> Kingdoms Restored is an online medieval RPG. Internet connectivity is required. At app launch the Android WebView opens the first-party HTTPS game; sign in using the dedicated reviewer credentials supplied in Play Console → App access. After sign-in, use the game's tabs to view Home, quests, army, equipment/land, battles and profile. The Settings screen provides user safety and deletion-request navigation. Currency is virtual gold; no in-app purchase or cash-out is enabled in the reviewed client. If the reviewer account needs additional invitation or feature access, document the exact pre-created access in App access. No credentials should be sent via email or public source.

**Before use:** create/verify the account through an **approved** test-account path and ensure its access actually matches the description; this text does not create a login, guarantee every tab is accessible or authorize production gameplay fixtures.

## Tester handoff (text draft; send only after real Play opt-in link exists)

> Kingdoms Restored is available to our invited Android testers through Google Play Internal testing. Open the private opt-in link with the **same Google account** you were invited with, accept the test, then install via Google Play. Use your separate game login to play. Please report crashes, display issues, interrupted actions, navigation problems, or unexpected loss of progress to the support channel provided with your invitation. This is a pre-release online game with a live shared realm; avoid sharing your password or private information in public messages.

## What this file does not authorize

No organization/person registration, legal publication, cryptographic key generation, protected-environment setup, production erasure enablement, signed-AAB dispatch, Play upload, tester invitation, paid CI, Railway mutation, journal/key changes, backup deletion, real-player account modification, or public release. Each requires the real owner's separate protected decision and evidence. An internal test is **not** a public launch.

Historical status reports are retained as audit evidence. Verify the **current** production HEAD, image, workflows and Play Console state again when the owner resumes.
