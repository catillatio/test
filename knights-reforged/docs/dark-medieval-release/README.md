# Approved Dark Medieval interface

The owner approved the final browser gallery and authorized merge and protected
production deployment on 2026-11-05. [Review overview](overview.jpg) shows the
actual application with synthetic local data, not a flattened mockup.

## Visible changes

- The signed-in resource HUD spans the full game frame. Profile/account access
  remains in the compact HUD; the separate signed-in masthead stays removed.
- Home retains the selected castle illustration. New original environments
  supply the fortified approach for Battle/reports, smithy for all Armory tabs,
  countryside for Land, and stone hall for Profile. Existing property/equipment
  artwork is never repurposed as a screen background or replaced.
- Currency remains gold; resource icons retain tight static health/mana/stamina
  color. Menu surfaces and player links stay neutral; player names share the
  same font/size. No automatic glow animation, reward count-up or celebration.
- Rival/catalog reading surfaces are clean near-black. Attack uses restrained
  dark crimson. Profile Achievements/Tutorial actions are borderless and retain
  touch targets. Recent Activity has a complete border and clear outcome,
  opponent, reward, damage and action hierarchy.
- Five-tab destinations, compact rows, native disclosures, forms, tutorial,
  filters, purchases and saved battle values remain intact. Classic Profile
  retains Stats → Income → Equipment.

## Scope and verification

Runtime changes are the consolidated stylesheet, presentation-only EJS wrappers,
the account link's location and removal of automatic reward animation. There are
no schema, gameplay, financial, retention, recovery or release-controller changes.
Only the four approved new scenic assets ship. Rejected replacement illustrations,
unused fonts and experiment histories are excluded.

`public/art/dark-medieval-environments/provenance.json` binds all four WebP files
by SHA-256. Their combined payload is below 1 MB, with one route-specific scene
requested per destination. The existing castle and catalog atlases are unchanged.

`browser-dark-medieval-home.ts` uses real Fastify/EJS/Chromium and disposable
PostgreSQL data. It compares links, command forms, resources and artwork on 17
views; verifies saved battle/feed gold, bounty, XP and damage; exercises purchases,
activity filters, tutorial and native disclosures; checks compact navigation,
full-width HUD, no overflow/motion, neutral name typography and forced colors.
New scenery and control-surface assertions run at mobile and desktop sizes.
`before.css` is the retained CSS comparison baseline, rendered using the same
current DOM and fixture, not a claim of a separate live production capture.

[Preview verification](preview-verification.json) recorded 85 passing checks,
including 17 contract comparisons and 33 captures. The subsequent
[full-width recapture](preview-header-width-verification.json) passed 44 captures
at 320, 390, 430 and 1280px. These are review evidence, not final CI approval.
The focused registered suite and required exact-head CI must pass for this commit.

Production rollout uses the unchanged protected image-prepare/image-release flow:
exact source/image binding, owner gate, release mutex, encrypted retained backup,
independent restored-copy verification, signed proof, and post-deployment health.
No direct Railway deployment or configuration edits are part of this change.
