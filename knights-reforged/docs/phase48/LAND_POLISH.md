# Approved Land direction — three refinements completed

The owner approved `bf11b30` as the shared Phase 4.8 visual foundation. This is a completed implementation milestone, not another Land approval gate. Shared-screen work continues after these checks.

1. **Collapsed Gold Flow:** displays the current **signed net income per hour** and **live countdown** from the same server timestamp and persisted payment deadline as the expanded breakdown. Negative income and no-Land states are supported. Refresh updates both displays without adding a request or calculating money in the browser. The initial technical cycle description is replaced; the accounting details remain expandable.
2. **Bulk:** moves beneath each illustration on phones, outside the Buy/Sell hit areas. Its 44px-or-larger target remains available, and row height stays at 98px at 320, 390 and 430px. Single-item and bulk commands/recovery are unchanged.
3. **Price hierarchy:** gold prices use a slightly smaller, lighter face than property names: 15px versus 16px on the 390px view, 14px versus 15px at 320px. Desktop prices receive the same restrained adjustment. Authoritative values do not change.

## Captures

- [320px](land-polish/screenshots/320-land-compact.png) · [390px](land-polish/screenshots/390-land-compact.png) · [430px](land-polish/screenshots/430-land-compact.png), all 844px high with Gold Flow collapsed.
- [Expanded 390px breakdown](land-polish/screenshots/390-land.png)
- [1024 × 1536](land-polish/screenshots/1024-land.png)

Five complete property rows remain visible in the collapsed mobile captures. The original approved reference/comparison files are retained unchanged. The new desktop image intentionally differs in the requested price/Gold Flow metadata; its protected pixels outside those fields match the approved image exactly. No visual equivalence to the illustrative mockup is claimed.

## Verification

- **19 focused client/PostgreSQL/shopping/profile tests passed**, including signed summary income, negative and empty states, authoritative countdown, no extra requests, duplicate-submission and receipt recovery.
- Focused Land browser run passed: 18 Land/bulk responsive visits plus 320/390/430px disclosure, hit-area and price-hierarchy checks; five complete collapsed rows, no horizontal overflow, 44px+ targets. Bulk and Buy/Sell hit areas do not overlap. Real fixture purchases/sales and receipt reloads preserve exact balances.
- Desktop comparison: **0 protected-pixel differences**. Changes are permitted only within requested price and Gold Flow metadata fields, not the header, background, artwork, row geometry or navigation.
- TypeScript check and 94 static checks / 73 EJS fixtures passed during this milestone. The older profile-income assertion was updated to accept additional HTML attributes while still requiring the exact authoritative value.

[Browser evidence](land-polish/browser.json) · [mobile measurements](land-polish/mobile-layouts.json)

Reproduce using a disposable local `_test` database:

```sh
cd knights-reforged
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55488/phase48_test'
npm exec -- tsx scripts/browser-phase48-land-review.ts --polish-review
npm exec -- tsx --test --test-concurrency=1 tests/land-client.test.mjs \
  tests/phase48-market-client.test.mjs tests/phase43-shopping.test.ts tests/profile-economy.test.ts
```

Only synthetic local data was used. No migrations, economy rules, transactions, artwork or release infrastructure changed in this milestone. Nothing was merged or deployed. Physical Android/iPhone and Safari verification remain separate from Chromium emulation.
