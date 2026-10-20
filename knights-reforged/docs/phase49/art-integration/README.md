# Approved property artwork and Gold Mine integration

**Owner-approved illustration direction, integrated on the feature branch; not deployed.** The five earlier UI refinements and the 65% combat checkpoint are approved and unchanged. Later [owner comment 6303697572](https://github.com/catillatio/test/pull/12#issuecomment-6303697572) also approves orchestral audio adoption and closes/withdraws all moderation/name-correction work. Verification counts below describe this earlier art checkpoint; [final candidate evidence](../FINAL_REVIEW.md) is current.

The approved [original source sheet](../art-audition/property-proposals.png) supplies the less-fiery Wyrmcrest Keep and the Gold Mine. Two WebP derivatives are encoded at 512×382, with the sheet divider excluded. [Runtime provenance](../../../public/art/properties-49/provenance.json) records the source/output SHA-256 hashes and exact crop coordinates. No new creative repainting, extracted APK art or third-party stock is introduced.

## Actual rendered captures

Synthetic local characters, authoritative application pages and a designated disposable PostgreSQL database. These are not production accounts or mockup financial values. Mobile viewports are 320/390/430×844, desktop 1024×1536. Land captures scroll to the relevant existing property; names, holdings, prices and rates come from the game.

| Width | Gold Mine in Land | Wyrmcrest Keep in Land | Profile holdings | Receipt |
|---|---|---|---|---|
| 320 | [Gold Mine](screenshots/320-gold-mine.png) | [Keep](screenshots/320-keep.png) | [Holdings](screenshots/320-holdings.png) | [Purchase / Buy More](screenshots/320-receipt.png) |
| 390 | [Gold Mine](screenshots/390-gold-mine.png) | [Keep](screenshots/390-keep.png) | [Holdings](screenshots/390-holdings.png) | [Purchase / Buy More](screenshots/390-receipt.png) |
| 430 | [Gold Mine](screenshots/430-gold-mine.png) | [Keep](screenshots/430-keep.png) | [Holdings](screenshots/430-holdings.png) | [Purchase / Buy More](screenshots/430-receipt.png) |
| 1024 | [Gold Mine](screenshots/1024-gold-mine.png) | [Keep](screenshots/1024-keep.png) | [Holdings](screenshots/1024-holdings.png) | [Purchase / Buy More](screenshots/1024-receipt.png) |

The illustrations remain more detailed/brighter than the dark reference sheet. Existing marketplace filters and compact frame crops temper their brightness; the small mobile tile inevitably loses foreground detail. No panel geometry, typography, row density or other property artwork changes in this integration. Trade and Bulk targets remain at least 44px; no horizontal overflow at the four sizes.

## Stable identity and history

- **Stable ID:** `moonwell-sanctuary`, unchanged. The immutable `alpha-0.3` catalog retains its recorded name and all financial definitions.
- **Current presentation:** `propertyName()` supplies Gold Mine for today's marketplace, holdings/public profiles, quotes and newly generated unlock text. Wyrmcrest Keep retains its name.
- **New actions:** newly created holding and purchase-receipt name snapshots use Gold Mine. Costs, successive-price steps, ownership limits, level restriction, income, upkeep and sale calculations use unchanged authoritative values.
- **Historical actions:** existing holdings, receipts, acquisition prices, saved income rates, settlements, journal rows and character data are not rewritten. Receipt headings use the saved `itemName`; older receipts without it fall back to the original immutable catalog label. Buy More uses today's Gold Mine label and revalidates normally. A receipt refresh/retry never issues another purchase.
- **No migration:** no SQL file, catalog version, ruleset registration, seed or provisioning change. The same 450 bot identities, holdings and balances remain intact. The unrelated Moonwell Veil spell and Secure the Moonwell quest are unchanged.

## Verification

`tests/phase49-properties.test.ts` checks the alias without mutating the catalog, approved art hashes/IDs, and a populated 450-bot fixture with preserved historic Moonwell receipt, financial rows, same-key replay, current/public-profile names, a new Gold Mine purchase, and session/receipt rendering after application reconstruction. The existing whole-schema Phase 4.9 preservation suite remains in the full test run.

`scripts/browser-phase49-properties.ts` verifies four viewport groups and creates these 16 captures: artwork URL/dimensions, names, 44px controls, no overflow, five tabs, receipt and Buy More. `tests/phase49-audition.test.mjs` verifies separate orchestral provenance, loudness, archived rejection status and unchanged runtime audio. Full counts are recorded in [verification.json](verification.json): **452 tests, 451 passed, 0 failed, 1 hosted-only test skipped locally**; TypeScript/build PASS; 99 static checks and 77 EJS fixtures PASS; four property browser viewport groups / 16 screenshots PASS; existing audio/recovery browser suite / 64 responsive visits PASS. All four musical clips, masters, reel and inventory reproduce byte-for-byte. Production dependency audit: zero vulnerabilities.

Gray cleanup is closed on the owner's voluntary-removal report; no further Gray or Development Knight action is authorized. No live service/database, protected release workflow, deployment setting or credential was accessed or modified.
