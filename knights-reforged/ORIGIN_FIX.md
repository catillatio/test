# Codespaces port-3001 Origin validation fix

2026-10-17. Branch: `fix/codespaces-origin-validation`, based on the latest remote `feature/kingdoms-live-phase-3-5-alpha` at `6c5d96caa8473c517367538df22d85d8fb17f8cb`.

## Cause and evidence

The original pre-handler validated the session-bound CSRF token, then compared `request.headers.origin` directly with the public `config.origin`. `ORIGIN_REJECTED` specifically means the first check succeeded and the second failed; it is separate from a database failure or `CSRF_REJECTED`.

Codespaces/Dev Tunnels can rewrite the browser's HTTPS Origin to its upstream localhost Origin. The public HTTPS Referer remains available. Consequently, the comparison can fail even when `APP_ORIGIN` is exactly correct:

| Value | Port-3001 example |
| --- | --- |
| Browser Origin / configured public origin | `https://super-winner-4r7ppp6g7p4hq4rv-3001.app.github.dev` |
| Origin received after the tunnel rewrite | `http://localhost:3001` |
| Referer received by the application | Public HTTPS address plus `/register` or the gameplay screen path |
| Browser Fetch Metadata | `Sec-Fetch-Site: same-origin` |

This transport behavior is described in [Microsoft's Dev Tunnels contract](https://github.com/microsoft/dev-tunnels/blob/main/ts/src/contracts/tunnelOptions.ts) and an [independent Codespaces reproduction with before/after request headers](https://github.com/orgs/community/discussions/147513). The development browser fixture previously preserved Origin through the proxy, so it missed this behavior; it also seeded players rather than registering through the browser.

Before changing production code, a regression configured with the exact supplied public address and port 3001 reproduced registration HTTP 403 and the reported realm-address error using a rewritten localhost Origin. After the fix it returns 303 and creates a usable authenticated session. The real Chromium/TLS fixture now observes both sides of the proxy: native browser HTTPS Origin, rewritten localhost Origin at the backend, matching public Referer and `same-origin` metadata.

**Live-environment limit:** the supplied user's tunnel returned a gateway 404 from this workspace, and the connected GitHub credential exposed no Codespaces. These are reproduced transport-level findings, not a captured trace of that user's live browser or server environment. New server-side diagnostics expose the resolved configuration and actual accepted/rejected Origin context on that environment without secrets.

Two additional configuration defects were found and fixed:

- Every explicit `*.app.github.dev` origin was treated as stale and overwritten using `CODESPACE_NAME` and `PORT`. Explicit public `APP_ORIGIN` is now authoritative. Matching metadata would produce the same address, so this defect alone does **not** explain a rejection when both addresses already agree.
- The preview helper chose/exported its default port before loading `.env`, preventing an `.env`-only `PORT=3001` from reaching its child. It now loads `.env` first. Exported shell variables still take precedence. This helper defect does not explain a process already confirmed listening on 3001, but could cause a different launch path to select port 3000.

## Secure compatibility rule

CSRF validation still runs first, unchanged. An exact configured public Origin is still accepted. The narrow rewritten-Origin path requires all of:

1. A Secure-cookie HTTPS configuration whose canonical public origin exactly matches the current Codespace name, configured port and forwarding domain from server-owned environment variables.
2. Received Origin exactly `http://localhost:PORT` or `https://localhost:PORT` for that configured port.
3. An HTTP(S) Referer without credentials whose origin exactly matches the canonical public origin.
4. `Sec-Fetch-Site: same-origin`.
5. The existing valid session cookie and session-bound CSRF token.

Foreign, opaque (`null`), malformed and wrong-port Origins still fail, even with forged forwarding headers and a valid CSRF token. Missing/cross-origin Referer or missing/cross-site Fetch Metadata fails on the rewrite path. Localhost is never added to a global trusted-origin list. Custom-hosted deployments cannot enable the exception through request headers. `trustProxy: false`, authentication, Argon2, session rotation, `Secure`/`HttpOnly`/`SameSite=Lax` cookies and the same-origin Referrer-Policy remain intact. The existing CSRF-only policy for non-browser clients with no Origin header is preserved.

`Host`, `Forwarded` and `X-Forwarded-*` are not used to derive an allowed origin. Forwarded host/protocol are included in safe diagnostics to help distinguish routing from source-origin problems. Diagnostic records omit cookies, tokens, passwords, body data and Referer paths/queries.

## Verification

No new dependencies, database migrations, catalog changes or player-record repairs are required. No existing gameplay, account, session or database files are reset. Test players and fixture migrations run only against a guarded disposable PostgreSQL database ending in `_test`; migration regressions use isolated schemas. No user Codespace database was accessed.

- Before-fix regressions: registration returned **403 instead of 303**; an explicit port-3001 preview URL was replaced with metadata's other preview URL.
- `npm run verify` with the isolated PostgreSQL 18.4 test database: TypeScript check, **125 automated tests passed, 0 failed, 0 skipped**, and compiled build passed. Coverage includes data-preserving migrations, quests, inventory, Land income/upkeep, concurrency/idempotency, progression and PvP.
- Focused security regressions cover native form input, registration/login/logout, anonymous/authenticated session rotation, HTTP/HTTPS localhost rewrites, repeated commands, rejected registration without account creation, rejected authenticated commands without character/inventory/quest mutations, invalid/missing CSRF and forged forwarding headers.
- `npm run check:static`: **48 checks passed**, including **33 production EJS fixtures**.
- `npm run test:codespaces`: real local TLS termination with Chromium 154, an HTTP backend and a 390px mobile viewport. **14 native form POSTs** covered registration, existing-player quests, equipment purchasing, Land purchase/sale, PvP/report access, logout/login, post-login quests, Attack allocation and returning pre-fix cookies. Secure cookies, CSRF, private reports, session revocation and all three Origin modes passed; no browser JavaScript errors.
- Process-start tests verify exported variables beat `.env` and the preview helper honors an `.env`-only port before starting its child.

The HTTPS fixture maps its one test hostname exclusively to loopback through a local CONNECT proxy and contacts no provider or historical game servers. A self-signed certificate is trusted only in that browser fixture. Application TLS/security behavior is not relaxed. Physical Android and the actual user's private Codespace remain target-environment checks. An old browser or privacy setting that strips Referer/Fetch Metadata will deliberately fail closed on the rewritten-Origin path.

## Apply to the existing Codespace

Stop the running app using Ctrl+C. Preserve any uncommitted work before switching branches; do not force or reset the checkout. Keep the existing `.env`, `DATABASE_URL` and PostgreSQL service.

```bash
cd /workspaces/test
git status --short
git fetch origin refs/heads/fix/codespaces-origin-validation:refs/remotes/origin/fix/codespaces-origin-validation
git switch --track origin/fix/codespaces-origin-validation
cd knights-reforged
npm run build
HOST=0.0.0.0 PORT=3001 APP_ORIGIN=https://super-winner-4r7ppp6g7p4hq4rv-3001.app.github.dev npm start
```

If that local fix branch already exists, use `git switch fix/codespaces-origin-validation` then `git pull --ff-only origin fix/codespaces-origin-validation` instead of `git switch --track`. Existing installed dependencies are sufficient; the lockfile is unchanged. **No migration, seed, reset, database replacement or Codespace rebuild is needed for this fix.**

Keep port 3001 **Private**, using HTTP for the internal forwarded service and the public HTTPS address in Chrome. Reload `/register` before submitting, or continue with an existing account. Confirm the server's `realm_origin_configuration` log shows `port: 3001`, `originSource: "explicit"`, the exact HTTPS origin and `secureCookies: true`.

Successful rewritten submissions emit `event: "codespaces_origin_rewrite"` with the actual localhost `receivedOrigin`, matching public `refererOrigin`, configured origin and forwarding context. Rejections emit `event: "origin_rejected"` with the same safe fields. If a 403 remains, retain that one diagnostic record to identify the actual mismatch rather than changing the allowlist. Browser registration, a quest, equipment Buy/Sell, Land Buy/Sell, a battle and Profile → Sign out are the target-environment smoke checks; use appropriately funded game accounts.

Optional test commands require a **separate disposable** `TEST_DATABASE_URL`, never the live player's `DATABASE_URL`:

```bash
npm run verify
npm run check:static
npm run test:codespaces
```

Set `TEST_DATABASE_URL` in that test-only shell before running these if database coverage is wanted. The HTTPS fixture also requires local Chromium and OpenSSL. Without an explicit test database, database suites skip and the HTTPS fixture refuses to start.
