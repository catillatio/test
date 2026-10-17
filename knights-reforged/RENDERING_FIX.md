# Phase 4.1 rendering regression fix

Branch: `feature/kingdom-come-phase-4-1-refinements`. This is a rendering-only correction. No gameplay rules, artwork, SQL migrations, accounts, database contents, authentication or Origin/CSRF policy are changed.

## Cause and correction

The new shared layout evaluated `refinements.id` unconditionally while constructing its stylesheet URL, even for anonymous login, registration and error pages. EJS only knows variables supplied in its rendering context; importing a constant in server code does not make it an application-wide template global. Omitting that page local produces exactly `ReferenceError: refinements is not defined` at layout line 16, before the requested page can render.

The committed Phase 4.1 normal `render()` helper already supplied the local. A fully rebuilt/restarted copy therefore rendered successfully in the earlier normal-path tests. The contract was still fragile: direct view contexts and an older compiled or in-memory renderer did not supply it. An older renderer plus updated on-disk templates is consistent with an application-wide live failure. The live Codespace's process/build state cannot be inspected here, so a stale process/build is a possible trigger, not a claimed observation of that environment.

Before the fix, two new regressions reproduced the exact line-16 exception by omitting the Phase 4.1 locals. Both now pass.

| Former template reference | Correction |
| --- | --- |
| `views/layout.ejs`: `phase41.css` URL | Use the established `alpha.id` layout value plus `-phase41-render1` |
| `views/layout.ejs`: `community.js` and `realm.js` URLs | Use the same independent UI cache revision |
| `views/land.ejs`: `land.js` URL | Use the same revision; no mandatory `refinements` page local |
| `views/rules.ejs`: active rules display | `refinements` is registered in the view engine's application-wide `defaultContext` |

`bountyRules` is also registered as a shared view constant. The normal page helper no longer duplicates these two globals in each payload. No player/session data is put into global view context. The UI suffix deliberately changes the URLs: merely reverting to the old `alpha.id` URL could reuse a cached pre-Phase-4.1 script, including its old attack delay.

## Regression coverage

`tests/rendering.test.ts` covers:

- Raw EJS login, registration and error rendering with the former anonymous context and no `refinements` local; this requires no database.
- Direct application views, including public Realm Rules, relying on registered shared defaults.
- Anonymous internal-error HTML with no diagnostic leakage.
- Anonymous `/login`, `/register`, `/rules`, redirects, not-found pages and authentication validation/CSRF errors.
- Authenticated Home, Profile and its tabs, public Profile, Quests, Battle, Bounties, Armory, Recruit, Land, Settings and error paths.
- Actual quest/combat commands followed by private battle reports and the bounty confirmation page.

The tests retain expected error statuses: validation still returns 422/401, CSRF and invalid Origins still return 403, missing pages return 404, and an intentional internal failure still returns 500 with safe HTML. They check that these responses are not replaced by an undefined-variable exception or a plain-text fallback.

The full regression suite, production compilation, existing template checker and Codespaces-style HTTPS browser fixture are run for this fix. PostgreSQL-dependent tests use isolated schemas in explicitly disposable `*_test` databases. The player database is not accessed, migrated, reset or re-provisioned. No dependency installation is required.

Verified results:

| Check | Result |
| --- | --- |
| `npm run verify` (TypeScript, complete automated suite, production build) | Passed; **181 tests**, zero failures or skips, including the existing PostgreSQL/HTTP/security integration suites |
| New rendering regressions | **6 passed**; the two missing-context tests failed with the exact reported exception before the correction |
| `npm run check:static` | **72 checks**, 54 production EJS fixtures, zero failures |
| `npm run test:codespaces` | **28 native HTTPS POSTs**, 108 screen visits across 320/360/390/412/430/1366px, zero browser errors |
| `npm run test:restart` after the build | Compiled server registration, gameplay, private reports and persistent sessions work across restart |

The HTTPS proxy is a local reproduction of Codespaces forwarding, not access to the user's live Codespace. Restarting/rebuilding that Codespace is still required; no claim is made that its currently running process has been repaired remotely.

## Apply in the existing super-winner Codespace

First **stop the existing application** with Ctrl+C in its running terminal. Updating files or rebuilding `dist/` does not replace JavaScript already loaded by a running Node process. Preserve any uncommitted edits before switching/pulling; do not force checkout or reset.

```bash
set -e
cd /workspaces/test
git status --short
git fetch origin feature/kingdom-come-phase-4-1-refinements
git switch feature/kingdom-come-phase-4-1-refinements
git pull --ff-only origin feature/kingdom-come-phase-4-1-refinements
cd knights-reforged
npm run typecheck
npm run build
export NODE_ENV=development HOST=0.0.0.0 PORT=3001 ENABLE_DEV_BOTS=1
export APP_ORIGIN=https://super-winner-4r7ppp6g7p4hq4rv-3001.app.github.dev
npm start
```

Keep the existing `.env`, `DATABASE_URL`, PostgreSQL service/data and credentials. **No database commands are needed for this fix.** Do not run migration, seed, reset or `dev:bots`/`dev:account` provisioning commands. Keep forwarded port 3001 Private. Reload the browser after the new server starts; verify login/registration first, then Home and gameplay pages. The changed asset URLs bypass cached older clients.

The `set -e` guard stops the command sequence on a failed pull, type check or build instead of launching stale compiled output. If local edits prevent fast-forwarding, preserve/reconcile those edits; do not discard them. The update does not merge into main or any other feature branch.
