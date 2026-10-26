# Classic player profile — owner review

Shared self/public Player view now follows the owner's reference structure:

| Left Stats column | Right Stats column |
| --- | --- |
| Kills | Battles Won |
| Deaths | Battles Lost |
| Quests | Initiated for (account age in days) |

Income follows immediately: **Total Income, Upkeep, Net Income**. Weapons, Armor
and Spells follow with the existing artwork, quantities and accessible equipment
previews. Stats/Income are visible flat lists, with no per-stat cards or extra
explanatory rows. The Competitive Record panel, claim-credit labels, army count,
legacy/verified-stat explanations and redundant Player-view XP/age lines are gone.

Existing rivalry details remain on the existing **Battles** tab. Skills, Comments,
Land holdings, discoveries, account controls and the fixed five-tab navigation
remain. Public action/consent controls retain their behavior; redundant eligible-
bounty guidance was removed and their spacing tightened. Actual blocking reasons
and the bounty confirmation/fee review remain intact.

Human Kills/Deaths reuse the same verified counts previously shown in Competitive
Record. Existing character totals remain the fallback for legacy rendering/bots.
Wins/losses, quests and account age use their existing saved/read-model values.
Income reuses `grossHourlyIncome`, `totalUpkeep` and `netHourlyIncome`, including
zero, negative and suspended-upkeep states. No economic calculation was changed.

No gameplay source, schema, migration, catalog, asset mapping, image file,
production data or release infrastructure changed. The historic screenshot was
structural reference only; no historic game artwork is shipped.

## Actual local screenshots

| Width | Self before / after | Public before / after |
| --- | --- | --- |
| 320 | [before](screenshots/before/320-self.jpg) / [after](screenshots/after/320-self.jpg) | [before](screenshots/before/320-public.jpg) / [after](screenshots/after/320-public.jpg) |
| 390 | [before](screenshots/before/390-self.jpg) / [after](screenshots/after/390-self.jpg) | [before](screenshots/before/390-public.jpg) / [after](screenshots/after/390-public.jpg) |
| 430 | [before](screenshots/before/430-self.jpg) / [after](screenshots/after/430-self.jpg) | [before](screenshots/before/430-public.jpg) / [after](screenshots/after/430-public.jpg) |
| 1024 | [before](screenshots/before/1024-self.jpg) / [after](screenshots/after/1024-self.jpg) | [before](screenshots/before/1024-public.jpg) / [after](screenshots/after/1024-public.jpg) |

390px equipment: [self](screenshots/after/390-self-equipment.jpg),
[public](screenshots/after/390-public-equipment.jpg).
These are synthetic saved characters and real local pages, not production views.

## Verification

- [Before browser evidence](before-browser.json), [after evidence](after-browser.json).
- Focused server checks: exact six/three labels and values; preserved kill/death,
  bounty/rivalry histories, ownership, financial rows and private fields; Unicode/
  HTML escaping; zero/negative/paused Income; Skills and public authorization.
- Browser: 320/390/430/1024 self/public layouts, correct two-column alignment,
  combined Stats/Income below 300px, no horizontal overflow, existing 44px five-
  tab navigation, keyboard/touch equipment previews, missing-image/JS errors,
  rivalry on Battles and unchanged saved business records.
- Existing profile/economy, training, public privacy, competition and equipment
  regressions use the new labels/location without weakening data assertions.
- Exact final commit and complete CI evidence are recorded in the draft PR.

Reproduce with a designated disposable `TEST_DATABASE_URL` ending in `_test` and
local Chromium in `BROWSER_EXECUTABLE`:

```sh
node scripts/ci/run-tests.mjs --files=tests/classic-profile.test.ts,tests/classic-profile-browser.test.mjs --workers=1
node --import tsx scripts/browser-classic-profile.ts
```

Before captures used the unmodified owner-merged PR #41 baseline `76d7b0b`.
No merge, deployment or production operation was performed. Stop for owner review.
