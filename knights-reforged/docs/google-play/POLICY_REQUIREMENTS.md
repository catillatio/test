# Policy sources and requirement classification

Official references rechecked2026-11-13 against official Google sources. This is an engineering mapping,
not a legal opinion, publisher declaration or guarantee of Play acceptance.

| Category | Requirement / evidence | Implementation or responsibility |
|---|---|---|
| Explicit Play | New submissions/updates target API 36+ from August 31, 2026 | compile/target36, min26; real compiled AAB verified, no speculative SDK increase |
| Explicit Play | Account creation requires discoverable in-app and public web deletion paths and associated-data fulfillment | Settings/footer plus `/account-deletion`; signed operator physically deletes account/credentials, removes personal records, minimizes current profile; genuine isolated restore tests |
| Explicit Play | Any legitimate retained data must be transparently disclosed; freezing an account alone is insufficient | A/B/D decisions approved; accurate final factual privacy notice required; no anonymous-record claim or unapproved policy activation |
| Explicit Play | Active publicly accessible, non-geofenced HTML privacy URL, app/developer identification, contact/retention disclosures | `/legal/privacy` implemented; live deployment and owner-completed factual placeholders remain required |
| Explicit Play | Accurate Data Safety/app-content declarations where required | Source/browser/native data-flow evidence; owner declares actual full backend practices, not merely the WebView APK |
| Explicit Play | UGC terms acceptance before publication, prohibited content policy, report/block and ongoing moderation | Registration checks current Terms/Guidelines before public name creation; posting consent, message/user reports, blocks and private moderation queue tested |
| Explicit Play | Valid signing, stable package/version, appropriate permissions and functional app | Fixed `game.kingdomcome.rpg`; INTERNET only; no debug release/secret/native payload; owner upload-key signing workflow, no automatic upload |
| Applicable law | Jurisdiction-specific privacy, age, retention, rights, consumer and publisher obligations | Owner determines applicability/accurate text; obtain legal advice for unresolved obligations. No universal independent certificate is invented |
| Engineering / existing owner safeguard | Signed exact-target fulfillment, financial preservation, encrypted independent recovery, suppression journal/freshness, protected release | Keep all. Google does not name these exact mechanisms, but removing them risks accounts/other players and is not authorized |
| Engineering recommendation | Physical Galaxy/Pixel/low-end tests, TalkBack, extra performance sampling | Useful before expansion; not presented as universal third-party certification. Actual pre-launch/device failures must be addressed |
| Optional | NPC population, abandoned kingdoms, economic simulations, new gameplay | Preserved separately, disabled, not launch-critical |

Official sources (read the full current policy, not only summaries):

- Target SDK: https://support.google.com/googleplay/android-developer/answer/11926878
- User Data/privacy/retention: https://support.google.com/googleplay/android-developer/answer/10144311
- Account-deletion details: https://support.google.com/googleplay/android-developer/answer/13327111
- Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- UGC: https://support.google.com/googleplay/android-developer/answer/9876937
- Preparing review/privacy URL: https://support.google.com/googleplay/android-developer/answer/9859455
- Test tracks: https://support.google.com/googleplay/android-developer/answer/9845334
- New personal developer accounts: https://support.google.com/googleplay/android-developer/answer/14151465

Manual review/fulfillment is not automatically prohibited: a real service must
actually complete requests and accurately explain its process/retention. A queue
with no operational fulfillment is insufficient. This candidate implements the
fulfillment engine but is not live and cannot claim active deletion support yet.

Exclusively internal-track Data Safety form exemption do not justify false disclosures or
ignoring data/user safety. Closed testing uses the actual applicable Console forms.
For personal accounts created after November 13, 2023, the published production-access
rule is 12 continuously opted-in closed testers for 14 days; this is conditional on
account/Console status and is not a prerequisite invented for the first internal
upload. Audience/Families and real-money billing rules are conditional on owner
choices/features. No audience age or legal declaration is selected here.
