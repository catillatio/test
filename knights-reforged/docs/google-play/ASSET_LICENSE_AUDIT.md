# Copyright, trademark and asset-license audit

Source baseline `9429e88365d112f5597371c7aa811110f967558d`. This is a technical provenance audit, not a legal clearance opinion. No existing equipment or property artwork is altered.

| Material | Evidence | Technical finding | Owner review |
|---|---|---|---|
| Runtime equipment/property fantasy sheets and replacement tiles | `public/art/**/provenance.json`, existing static image/hash checks | Project provenance identifies original generated work and exact approved selections. Source captures/crops are documented. | Confirm relevant generation terms, ownership and distribution rights; generation does not establish exclusivity |
| Dark Medieval environments | `public/art/dark-medieval-environments/provenance.json` | Original generated environments, owner-approved final gallery; not repurposed Land/property art | Confirm final marketing usage and absence of problematic similarity |
| Home castle | `public/art/remaster-ui/castle-provenance.json` | Existing approved original illustration; exact source retained | Same rights confirmation |
| Runtime original vectors | `public/art/remaster-ui/LICENSE.txt` | CC0 original project vectors; static tests exclude active historical APK art | Confirm provenance accuracy |
| Action audio | `public/audio/LICENSE.txt`, `LICENSE-VSCO-CC0.txt`, `LICENSE-ORCHESTRAL-CUES-CC0.txt`, `orchestral-sources.json`, inventory | Original synthesized cues and documented CC0 VSCO arrangements/sources; no new audio added | Retain original notices and verify source-asset terms |
| Fonts | Runtime CSS and Android resources | Georgia/Times/system sans families; no new font binary packaged | No invented downloaded-font license |
| Android launcher/splash/store icon | `android/ASSETS.md`, original crown/K vector, `android/store/assets.json` | Original geometric vector, rasterized for 512px store icon; no Storm8 logo copied | Owner approves brand identity and trademark usage |
| Feature graphic | `android/store/feature-1024x500.png` | Composition of existing approved castle/vector with draft marketing copy; not claimed as an app screenshot | Approve title/copy/rights |
| Phone listing captures | browser harness + capture JSON | Actual EJS application, synthetic accounts and current approved artwork; no AI conceptual screenshot | Verify final build/listing truthfulness; captures are pre-release candidate, not claimed live Android hardware captures |
| Reference APKs/screenshots | `original-reference/`, historical design docs | Historical analysis is not redistribution permission. These are not Android payload assets or store screenshots | Do not upload/reference third-party copyrighted game materials as marketing assets |
| Name and marks | Kingdom Come, genre/original-game inspirations | Repository content does not establish trademark clearance or rights to third-party names | OWNER ACTION REQUIRED: name/trademark/legal review before store publication |
| Build tools | Android ASSETS.md and retained Gradle Apache notice | Pinned Gradle/AGP/JDK/SDK, JUnit/Hamcrest build/test-only. No third-party native app library bundled | SDK/build licenses remain applicable; no legal agreement accepted on owner's behalf |

`asset-inventory.json` inventories current candidate runtime file bytes and SHA-256. It is not a license grant or a claim every source-generation account is independently verified. Existing static checks validate registered art bytes, original approved property bindings and absence of active historical APK artwork. The release AAB contains only the native shell/resources; runtime artwork is fetched from the HTTPS game, so it remains in Play's review scope even though absent from the AAB.
