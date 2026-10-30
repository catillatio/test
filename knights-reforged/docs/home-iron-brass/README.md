# Home — Iron & Brass review

A Home-only presentation pass using the owner's image for material and framing direction. [Open the interactive before/after comparison](comparison.html).

The existing Home structure, content, copy, eight menu links, tutorial forms, resource disclosures, activity feed and five-tab navigation are retained.

| Mobile — current | Mobile — Home review |
| --- | --- |
| ![Current Home at 390px](screenshots/390-before.jpg) | ![Home review at 390px](screenshots/390-after.jpg) |

[Complete mobile Home: current](screenshots/390-before-full.jpg) · [review](screenshots/390-after-full.jpg)

| Desktop — current | Desktop — Home review |
| --- | --- |
| ![Current Home at 1280px](screenshots/1280-before.jpg) | ![Home review at 1280px](screenshots/1280-after.jpg) |

[Complete desktop Home: current](screenshots/1280-before-full.jpg) · [review](screenshots/1280-after-full.jpg)

## What changed

- Compact masthead (53px mobile / 58px desktop), a refined metallic-gold balance with restrained warm underglow, and cleaner button/tab highlights.
- Warm charcoal and blackened iron surfaces; aged brass frames, restrained corner details, deeper shadows and ivory/gold type.
- The existing castle illustration supports the compact masthead and Home title; it does not become a new hero section.
- The same gold, XP, level and three resource readings sit in an inset metal frame. Native interactive disclosures and recovery timers remain.
- Royal Announcements and Tutorial have richer, distinct panel surfaces. The tutorial still uses the existing buttons and command forms.
- All eight menu tiles retain their destinations, labels and original vector icons. Their frames, highlights, icon relief and alignment are refined. Calling still shows its existing class label.
- The same five bottom tabs receive bronze framing, clearer selected states and readable badges. The account name fits within its header instead of overflowing.

## Scope and markup

`views/home.ejs`, shared header/resources/navigation partials, existing browser scripts, approved images, routes and gameplay code are unchanged. The only template edit is in `views/layout.ejs`: select one consolidated stylesheet and add a review class when the internal Home preview is enabled. No product content is added or removed.

`src/home-theme-preview.ts` and the small composition hook in `createApp()` restrict the review to an explicit test-only, loopback opt-in. There is no public query, cookie, environment switch or production startup option to activate it. Non-Home screens retain their existing styles. This is isolated for visual approval, not an automatic rollout.

## Browser evidence

`verification.json` records checks at 320, 390, 430, 1024 and 1280px. Before/after comparisons use the same disposable synthetic realm through real Fastify/EJS routes, never production data. Checks compare every heading, link, form contract, icon reference, module text and resource value. They also verify header fit, eight menu targets, five navigation targets, keyboard resource disclosures, original broadcast/tutorial commands and unchanged persisted business rows before those explicit test commands.

The unchanged game and artwork checks run alongside the new Home tests in ordinary CI. No production release or recovery rehearsal is part of this review.

## Interactive cloud preview

Use an existing private development cloud workspace with dependencies, Chromium and a designated **local disposable** PostgreSQL database whose name ends in `_test`. From `knights-reforged`, run `npm run preview:home-theme` with `TEST_DATABASE_URL` set to that fixture. This never accepts a production database. The script prints two loopback URLs (review on 4100, current on 4101) and a synthetic sign-in. Open them through the workspace's private browser preview. Ctrl+C removes only the fixture schema.

`npm run test:browser:home-theme -- --capture` regenerates the screenshots from the real app using the same guarded fixture.

## Next owner review

Review frame weight, contrast, menu density, typography and the material treatment at actual mobile size. Extending this style beyond Home, or enabling it in the normal application, requires a separate approved scope. No other screen has been redesigned or activated by this change.
