# Kingdom Come — Phase 4 connected multiplayer alpha

Branch: `feature/kingdom-come-phase-4-social`. Base: `feature/kingdom-come-strategy-and-bounties` at `4d1332fdbdbb14b685688b12965b2639e4390ff7`. Runtime implementation commits: `47f9621` and `36f9882`. No protected branch was merged or changed, and no public deployment was made.

See [the screenshot gallery](docs/phase-4-preview/README.md), [verification record](PHASE_4_VERIFICATION.json), and [Android packaging assessment](APK_READINESS.md). The existing [Calling, rival, bounty and maintenance rules](STRATEGY_MILESTONE.md) remain in force.

## What changed

The Home grid links to Land, My Army, My Profile, Bounty List, Realm Rules / Help and Settings. There are no dead bank or paid-healing buttons. Automatic resource recovery and the existing Land treasury remain available; a separate bank and healing service are deferred, with that limitation also stated in Settings. Five bottom tabs and their original recovered artwork, gradients and safe-area behavior are retained.

Home now has persistent **All / Battles / Comments / Broadcasts** feeds. Recruit now has **Recruit / My Army / Dashboard**. Profiles add Comments, public character views and illustrated property holdings. Battle reports add a prominent Attack Again control, current target Health and linked combatant names.

## Repeated combat and connected profiles

An attacker still needs at least **20 Health**, **1 Spirit** and the existing **10-second cooldown** to have elapsed. A defender now needs **positive Health**, rather than 20 Health. This explicit override is versioned in immutable `community-0.1`; the original `alpha-0.3` file is unchanged. It allows a low-Health opponent to be finished. Zero-Health targets are disabled with an explanation until normal recovery restores Health. No additional attack-count limit was added.

Attack Again submits the existing attack command with a fresh command ID. It does not replay a client-calculated result or call a second combat implementation. Server randomness, sorted character locks, escrow lock ordering, receipt fingerprints, damage, Spirit, rewards, Calling modifiers, army quantities and bounty conditions all use the existing engine. Browser submission suppression improves repeated taps; idempotent command receipts and transactions are the actual duplicate-payment protection. Concurrent finishing attacks cannot record two deaths or charge the losing concurrent request.

Reports keep their immutable battle-time Health/equipment/training snapshots. A separate current-target section shows current Health; its authenticated read refreshes every ten seconds while visible. Local timers only estimate the attacker's cooldown. Every POST rechecks eligibility, even if another player changed the target after rendering. Browser resource recovery cannot enable a target marked ineligible by the server.

Existing rolling rewards remain: three rewarded initiated encounters per real target per 24 hours; for development rivals, one rewarded encounter per bot and six total per 24 hours. Further eligible fights are practice with damage and Spirit costs but no ordinary gold/XP. Bot funding/recovery, passive behavior, level eligibility, bounty exclusions and reward caps are preserved. Bounty List also displays current recovered Health and disables defeated targets. Its display restriction is separate from bounty claim qualification, so a valid winning attack that finishes a target can still claim escrow once.

Kills/deaths are derived from saved zero-Health results, including attacker Health immediately after damage when a subsequent level-up restored resources. Army victory and leader knockouts remain distinct: zero Health alone does not rewrite the win/loss result or create another reward. Historical results are not rewritten.

Both combatant names link from reports, battle history and rivals. Bounty targets/sponsors, feed authors, comment hosts and army allies also link consistently. Own-character links resolve to the private Profile. Others open `/game/players/:id`.

Public profiles show character name, Calling, level, account age in days, progression totals, combat/quest statistics, current Health, army totals, illustrated inventory quantities and economic identity. They explicitly exclude account IDs/names, cookies, session/CSRF data, wallet gold, retained treasury, invitation codes, upkeep reserves, acquisition-lot IDs and private battle reports. Other players' Battles tab shows aggregate statistics; saved reports remain restricted to their two combatants. Temporary rivals have public character profiles and an explicit computer-controlled label, with no social presence.

### Land on Profile

Property rows group actual positive-quantity holdings by property ID. They show illustration, saved property name, owned quantity, aggregate gross hourly contribution and property upkeep. Contributions sum the holding snapshots from the existing authoritative Land state, preserving old purchased rates instead of substituting today's catalog rates.

The Income section and resource header use the existing authoritative economy projection: gross Land income minus property upkeep, active equipment upkeep and implemented other recurring costs. Suspended maintained equipment is excluded from active charges. Neither one-time rewards nor pending income-payment countdowns are presented as hourly earnings. No purchase/sale/income formula or ownership record was replaced.

## Activity feeds and social records

| Tab | Persistent source and scope |
| --- | --- |
| All | Battles involving the viewer, their bounty events, their profile/authored comments, their army invitation events and realm broadcasts |
| Battles | Battles initiated by the viewer, with outcome, ordinary gold, XP, damage dealt/received, relative time, report and profile links |
| Comments | Comments on the viewer's profile and comments they authored elsewhere |
| Broadcasts | Realm-wide public broadcasts, newest first |

The Home Comments feed and each Profile Comments tab query the same `realm_messages` rows. Anyone signed into the realm may view a public profile's visible comments. Own profiles have Player / Skills / Comments / Battles; public profiles have Player / Comments / Battles. Private skill allocation, Calling changes and Sign Out remain on the owner's views.

Feeds use server timestamps, relative-time text and indexed keyset pagination, **20 entries per page**, retaining microsecond cursor precision. There is a Refresh link rather than a live-chat promise or WebSocket requirement. Incoming attacks are included in All; the dedicated Battles tab intentionally contains initiated attacks. Battle retries reference one underlying saved battle. A funded bounty's placement and claim are distinct events, not duplicate battle rewards.

Messages are normalized plain text, rendered through escaped EJS output. HTML-looking text is displayed literally; it is not executed or auto-linked. Control and directional-spoofing characters are rejected. Forms also function with JavaScript disabled. Existing session-bound CSRF, strict Origin validation, CSP and authentication apply to all new POST routes.

### Reconstructed social safeguards

| Policy | Limit |
| --- | --- |
| Profile comment | 500 characters; 30 seconds between posts; 40 per rolling 24 hours |
| Broadcast | 280 characters; 120 seconds between posts; 12 per rolling 24 hours |
| Broadcast eligibility | Level 2 and three completed quests |
| Reports | One per reporter/message; 20 per rolling 24 hours; Spam / Abuse / Other |

The author character lock serializes posting-limit checks and inserts. Hidden/deleted messages still count toward posting limits. Identical command retries return the original receipt; changed intent with the same ID is rejected. Social activity awards **no gold, XP, skills or army strength**. Ordinary passive settlements can still occur on any authenticated request, as before. Disabled-login temporary rivals cannot act as social authors; comments directed at their profiles and bot army invitations are rejected.

Authors can remove their messages. Profile owners can hide comments on their profiles. Other players can report, but cannot delete a message or change another profile's roster. Reporting does not automatically hide content, preventing report-count brigading. Removal is soft deletion/hiding: the underlying text, report and moderation audit are retained for operator review. There is no private messaging or simulated bot conversation.

### Functional moderation

Moderation is a trusted terminal operation, not an unrestricted HTTP administrator endpoint. Queue review, hide, restore, timed mute and unmute are implemented and audited. Mutes affect social posting only. Author-deleted messages cannot be restored.

Run in `knights-reforged` with its existing database configuration:

```bash
ALLOW_REALM_MODERATION=1 npm run realm:moderate -- queue
ALLOW_REALM_MODERATION=1 REALM_MODERATOR_LABEL='Realm operator' npm run realm:moderate -- hide MESSAGE_UUID 'Reviewed abusive post'
ALLOW_REALM_MODERATION=1 REALM_MODERATOR_LABEL='Realm operator' npm run realm:moderate -- restore MESSAGE_UUID 'Review resolved'
ALLOW_REALM_MODERATION=1 REALM_MODERATOR_LABEL='Realm operator' npm run realm:moderate -- mute CHARACTER_UUID 24 'Repeated spam'
ALLOW_REALM_MODERATION=1 REALM_MODERATOR_LABEL='Realm operator' npm run realm:moderate -- unmute CHARACTER_UUID 'Restriction lifted'
```

Replace uppercase UUID placeholders with actual queue/character IDs. The explicit environment flag and a nonempty operator label/reason are required for mutations; mute durations are 1–720 hours. The CLI queue is bounded to 50 recently reported messages and includes current visibility status. Human review is still necessary; these controls are a functional alpha foundation, not a staffed moderation service or an automatic abuse classifier.

## Recruit, allies and Dashboard

Every existing character receives a unique persistent **12-character hexadecimal invitation code**. New characters receive one on their first state read. Codes use a database uniqueness constraint with collision retries and remain stable across restarts and migrations. They identify an invitation destination and never authenticate an account.

Entering a code uses the existing pending/accepted/declined alliance model. Only the recipient can accept or reject a pending invitation. Senders can cancel, and either accepted ally can remove a link. Self-invites, bot links, duplicates, unrelated roster changes and oversize rosters are rejected. A legacy character-ID invitation route/form remains available in a collapsed section.

New anti-spam policy: invitations must be 30 seconds apart, at most 20 per rolling day, and the same pair must wait 24 hours to re-invite. Accepted allies are not recreated or revoked on upgrade. Dashboard shows pending incoming/sent invitations, accepted allies, current participating strength and recent persistent army events. Older pre-Phase-4 allies remain visible in My Army; no fabricated history is backfilled for them.

My Army shows retained militia, accepted players, available/participating totals, active capacity and current attack/defense. The established participation formula, separate leader inventories and one weapon/armor/spell per participating member are unchanged. New ally consent never transfers items or gold. Recruit retains militia purchasing, and each name links to its public Profile.

## Evidence and artistic scope

The supplied Home and Recruit screenshots are from **Zombies Live**, a related Storm8 title. They verify the functional reference structure: compact secondary button grid, activity categories, recruitment sub-tabs and personal invitation code. They do not verify original Kingdoms Live social limits, invitation length, finishing thresholds or formulas. Two supplied images were accessible during this implementation; cropped game regions and original-source hashes are preserved in [the reference folder](original-reference/storm8-social-2026-10-17/README.md). No Zombies Live branding or artwork is used in the game.

The original Kingdoms Live recovered bottom tabs/backgrounds, current fantasy equipment sheets, simplified property sheet, gradient buttons and compact resource header were reused. New work is interface composition, CSS and small text glyphs, not newly generated paintings. No image generation was performed during Phase 4. Existing artwork/provenance remains intact. Social and invitation limits and the positive-defender-Health override are documented Kingdom Come reconstructions in immutable `community-0.1`.

## Migration and data compatibility

`011_community.sql` adds `army_invitation_codes`, `army_events`, `realm_messages`, `social_reports`, `social_moderation`, `social_mutes` and feed indexes. It backfills codes only. It does not update/delete prior account, character, session, resource, skill, inventory, wallet, holding, settlement, quest, bounty or battle rows. There are no new content prices or progression levels and no dev-account baseline reset. Startup now requires migration 011 before listening. All prior catalog/ruleset definitions remain immutable; `community-0.1` is an additional installed definition.

Populated migration verification compared before/after hashes for **all 34 existing business tables containing 166 local accounts** and all pre-existing catalog definitions. They matched after two migration runs. Exactly 166 distinct codes were backfilled. This is the preserved local development database, separate from the user's Codespace PostgreSQL; no access to or alteration of that private database is claimed. Existing-version migration fixtures also pass. Compiled-process restart tests retain sessions, progression, inventory, Land clocks, Calling, a funded bounty, comments, broadcasts, invitation codes, pending links and both combatants' private reports.

## Verification and remaining limits

Detailed reproducible results and runtime commit are in [PHASE_4_VERIFICATION.json](PHASE_4_VERIFICATION.json). PostgreSQL tests cover finishing attacks, cooldown/Spirit checks, concurrent attacks, idempotency, bounty reward conservation, public/private projections, saved-rate estate grouping, all four feeds, safe text, posting limits, reports/moderation, code consent, migrations and the Codespaces HTTPS boundary. Existing level-50 progression/catalog, maintenance, Callings, rivals, funded bounties and transaction regressions remain included.

| Gate | Result |
| --- | --- |
| TypeScript and production build | Passed |
| Full automated suite with PostgreSQL | 159 passed; zero failed, canceled or skipped |
| Explicit PostgreSQL integration gate | 99 passed; zero failed/skipped; overlaps the full suite |
| Focused finishing-combat/bounty suite | 14 passed; includes escrow payment on a finishing victory |
| Static contracts and production templates | 65 checks passed, including 49 EJS fixtures |
| Native HTTPS milestone | 26 form POSTs passed; no browser errors; all three original/rewrite Origin modes covered |
| Responsive milestone | 85 screen visits across five widths; labels, named controls, images and overflow checked |
| Existing ordinary multiplayer browser loop | Desktop, 390px and 360px forms passed, including no-script quests |
| Existing late-game catalog/browser loop | 330, 360, 390 and 1366px passed; all 81 painted cells load |
| Compiled process restart and moderation CLI | Passed; social/consent records persisted; operator guard and authorized queue verified |
| Populated local migration | 34 existing tables and 166 accounts preserved; 166 unique codes; two idempotent migration runs |

The real local TLS fixture uses a Codespaces-shaped HTTPS port-3001 origin, a TLS-terminating proxy and an HTTP backend. It tests native form Origins before and after Codespaces-style localhost rewrites, Secure/HttpOnly/Lax cookies, registration/login/logout, CSRF, strict foreign/null/wrong-port Origin rejection, Calling, quests, equipment, Land, bots, bounty placement/claim and Phase 4 social/army/repeated combat. It also verifies keyboard skip navigation and a native comment form with JavaScript disabled. It does not contact GitHub's live tunnel or legacy game servers.

Responsive checks visit 17 screens at **320, 360, 390, 412 and 1366px**, checking named controls, native labels, five tabs, image loading and horizontal overflow. Existing ordinary and level-50 browser playthroughs also pass. Screenshots are headless Chromium viewport captures, not physical Android screenshots. Automated accessibility checks and a keyboard flow are useful coverage, not a complete screen-reader/contrast certification.

Remaining pre-APK checks: actual Android WebView/device behavior, TalkBack and large-font/IME/inset behavior, connection-loss/relaunch testing on-device, stable HTTPS hosting, operational backups, staffed moderation, multi-user load testing and human balance/pacing. The actual private super-winner Codespace was not accessible to this workspace. No Android build, emulator, signing or APK installation was performed. Existing bounded alpha limits such as the global escrow lock and 100-contract board remain. See [APK_READINESS.md](APK_READINESS.md) for the next technical milestone.

## Update the existing super-winner Codespace

Stop the running app with **Ctrl+C**. Keep PostgreSQL running. Keep the current `.env`, `DATABASE_URL`, account passwords and database files. First inspect `git status --short`; preserve any listed uncommitted work before switching. Take a database backup using your existing backup procedure.

If `pg_dump` is on the Codespace PATH, this optional backup command reads the existing dotenv connection without printing it and writes into the Git-ignored `.local` directory. Run it **before** switching/migrating; otherwise use your established PostgreSQL backup workflow:

```bash
cd /workspaces/test/knights-reforged
node --input-type=module <<'NODE'
import 'dotenv/config';
import {mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
if (!process.env.DATABASE_URL) throw new Error('Keep the existing DATABASE_URL configured.');
mkdirSync('.local/backups', {recursive:true});
const file='.local/backups/before-phase4-'+Date.now()+'.dump';
execFileSync('pg_dump', ['--dbname',process.env.DATABASE_URL,'--format=custom','--file',file], {stdio:'inherit'});
console.log('Backup saved: '+file);
NODE
```

Keep that archive private and retain a copy through your existing backup process. It contains player data and should not be added to Git.

For a first checkout of this new branch:

```bash
cd /workspaces/test
git status --short
git fetch origin feature/kingdom-come-phase-4-social
git switch -c feature/kingdom-come-phase-4-social FETCH_HEAD
cd knights-reforged
npm run db:migrate
npm run build
export NODE_ENV=development HOST=0.0.0.0 PORT=3001 ENABLE_DEV_BOTS=1
export APP_ORIGIN=https://super-winner-4r7ppp6g7p4hq4rv-3001.app.github.dev
npm start
```

If this local branch already exists, replace the fetch/create steps with:

```bash
git switch feature/kingdom-come-phase-4-social
git pull --ff-only origin feature/kingdom-come-phase-4-social
```

Dependency versions/lockfile are unchanged; existing installed dependencies are sufficient. If that Codespace lacks dependencies, run `npm ci` in `knights-reforged` once. Do not reinitialize/recreate PostgreSQL, replace `.env` with its example, run demo reset or run a dev-account reset to perform this update. Existing managed rivals and the existing dev account persist without re-provisioning. Keep forwarded port **3001 Private**, choose Open in Browser, and use its exact HTTPS address in Chrome. Exported configuration takes precedence over `.env`; the Codespaces-specific Origin fix is retained unchanged.

Use separate browser profiles or a private/incognito session for two real game accounts. Invite by code, confirm the pending state, accept from the recipient's Dashboard, and verify each owns/equips their own inventory. Post a comment on the other player's profile and a broadcast after level 2/three quests. Attack a near-level rival repeatedly, waiting for cooldown/Spirit, open both linked profiles and inspect the private report from each combatant. A third player must not be able to open it. Verify estate quantities and hourly totals, then test Sign Out through Profile or Settings.

Optional automated checks must use an explicitly designated **separate disposable database ending `_test`**, never the player database:

```bash
export TEST_DATABASE_URL='postgres://YOUR_TEST_CONNECTION/kingdom_test'
npm run verify
npm run test:postgres
npm run check:static
npm run test:codespaces
npm run test:restart
```

Replace the example connection with your test database. Test host guards allow loopback or an explicitly designated `ALLOWED_TEST_DATABASE_HOST`. Browser scripts need Chromium; the HTTPS fixture also needs OpenSSL. Existing `test:browser` requires a separately running non-production disposable realm and its matching `APP_ORIGIN`/database. `test:browser:fantasy` starts its own loopback realm using the designated test database. The restart check builds on the compiled server, so run build first. No public hosting, merge, database transfer or APK conversion is part of these commands.
