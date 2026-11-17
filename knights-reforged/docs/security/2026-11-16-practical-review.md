# Practical security review — 2026-11-16

Two Medium findings were reproduced and corrected locally. This is a source,
local HTTP/PostgreSQL/browser and configuration review, not an external
penetration test or a statement that the game is completely secure.

## Source and production identity

- Repository: `catillatio/test`; reviewed release source:
  `dbdd96e1b78f2416044554d8328ca1815a192adb` (remote rechecked during review).
- Isolated branch: `security/practical-auth-budget-20261116`.
- Production `/healthz` reported `59f6f75ebc832f3ba421ee5e15cf73d9331fe309`.
  It therefore **does not match** the reviewed branch. The intervening six-file
  diff concerns sponsorship/related integration; do not describe this local
  review as a dynamic test of that deployed build.
- Authenticated Railway metadata reported healthy deployment
  `2520649d-7b52-4841-b853-8eb7cefa5165`, pinned to
  `ghcr.io/catillatio/kingdom-come-deploy-canary@sha256:6abf8df9e81a5c857cde30ea020ba7b006ca4939160f8c49fe1090495d71613b`.
  The health SHA is application-reported; this review did not extract and
  independently attest the running image contents.
- The original working trees and branches were preserved. The workspace disk
  was full, so the isolated clone, local PostgreSQL and evidence use `/dev/shm`.
  The delivered review archive includes a Git bundle, patch and evidence.

## Confirmed findings and corrections

### AUTH-01 — missing shared password-attempt budget (Medium, CWE-307)

At the reviewed baseline, `POST /account-deletion/requests` reached the real
password verifier without the durable username budget used by `/login`.
CSRF, session-bound forms and socket throttling still applied. This was a
brute-force protection gap, not an authentication bypass or account takeover.

A real loopback HTTP reproduction with two independent Node processes and
PostgreSQL submitted ten attempts split between the endpoints. Only five
attempts were recorded. The regression failed `5 !== 10` before the fix.

`src/auth.ts` now charges the existing `login` budget inside `authenticate`,
before credential validation/lookup. `src/app.ts` removes its separate login
charge. Registration keeps its independent scope. The verifier caller search
found login, anonymous deletion and the private development-account CLI; no
other password verification primitive was found.

Preserved behavior:

- One charge per verification attempt, including successful authentication and
  malformed credentials; known, absent and disabled accounts get generic errors.
- Ten attempts per canonical username per fixed 15-minute window. Attempt 11
  and later are rejected; concurrent increments serialize in PostgreSQL.
- Successful authentication does not reset the counter. Blocked attempts do not
  move the window start. Counters survive process replacement and are shared.
- CSRF/origin/confirmation failures before verification do not consume a charge.
- Anonymous deletion can authenticate without logging in. Valid requests dedupe;
  invalid/throttled requests create no deletion request or financial mutation.

Residual tradeoff: a party knowing a username can exhaust its shared budget,
preventing that user's login/deletion verification until expiry. This already
existed on login; sharing the budget closes the alternate verification path
without increasing or extending that lockout. This is not a new durable account
lock or a claim to solve distributed abuse. Successful-password resets or
separate deletion buckets would weaken the existing defense. The gated local
account-provisioning CLI also now consumes this budget; provisioning still
commits before its subsequent sign-in, so repeated local provisioning/sign-in
can throttle without undoing an already completed provision operation.

Proof: `tests/credential-attempts-http.test.ts`, six tests, real HTTP and real
PostgreSQL, including 20 concurrent requests across two processes (ten password
checks admitted), restart, fixed-window reset, successful login, anonymous
requests, independent accounts and registration scope. These are HTTP behind a
modeled HTTPS origin, not a native-device or actual TLS-termination test.

### PG-01 — restricted SQL functions regain PUBLIC execution on restore

**Medium, CWE-732; historical finding freshly reproduced.**

`pg_dump --no-acl` / `pg_restore --no-acl` discards the six migration-054
SECURITY DEFINER execution restrictions. PostgreSQL's creation default grants
PUBLIC EXECUTE. Because migration 054 is already recorded, the old migration
runner skipped its REVOKEs. The historical November 13 harness demonstrated
unauthorized bounded NPC construction through an ordinary SQL role, with the
mutation rolled back. The current real custom-format restore reproduced all six
PUBLIC permissions persisting through same-head migration replay.

Prerequisites are an ordinary SQL credential, database CONNECT and schema USAGE.
An ordinary player's HTTP account alone is insufficient. Live database roles,
grants and exploitability were not inspected or established.

Correction:

- `src/application-privileges.ts` explicitly identifies all six reviewed
  capabilities. Every migration invocation revokes only PUBLIC access, preserving
  ownership and named-role grants. Missing/unreviewed capabilities fail closed.
- `assertInstalledRulesets` now also performs a read-only privilege assertion,
  so normal server startup refuses PUBLIC exposure.
- The protected worker sets database-local safe function-creation defaults as
  the restoring role **before** restoring the fresh independent target. It
  rejects pre-existing SECURITY DEFINER functions and residual schema-specific
  PUBLIC defaults, including those inherited through template1. A global REVOKE
  alone cannot cancel additive schema defaults.
- Failures stop before restore/report/registration. Existing encryption,
  preservation, independent-restore, signatures, artifact retention, mutexes,
  expiry and final temporary-file cleanup remain required.

Proof: `tests/recovery-privileges.test.ts` uses real PostgreSQL dump/restore,
including before-migration safe permissions, same-head repair, unchanged migration
history, preserved explicit witness grant, `42501` denial for unrelated
capabilities, inherited schema-default rejection and pre-054 upgrades. The
existing 16-test erasure suite also passes, including its restricted non-owner
operator and restored-backup reconciliation. Worker boundary tests explicitly
reject nonempty targets, failed default changes and additive PUBLIC defaults.

The archive still intentionally omits ACLs and named-role grants. An archive
alone does not preserve the authorization policy: any manual disaster restore
must establish safe creation defaults before restoring, run the reviewed
migration/reconciliation, and separately install approved operator roles. No
roles or capabilities are automatically installed by this patch.

## Coverage matrix

“Tested” below means the specified local cases, not exhaustive coverage.

| Boundary | Current evidence | Status / limits |
| --- | --- | --- |
| Passwords, sessions, cookies, CSRF, origins | `auth.ts`, `security.ts`, `request-origin.ts`, `app.ts`; new actual HTTP tests; `phase44-security`, request-origin/origin units | Reviewed + tested; no production login, physical browser or distributed load test |
| Deletion, privacy journal, SQL capability roles | Privacy authorization/gate/operator/journal/erasure, migration 054; `play-account-safety`, `play-erasure`, new recovery privilege tests | Reviewed + tested synthetically; real deletion and production operator installation untouched |
| Object ownership / IDOR | Actor derived from session; scoped command receipts; private report/purchase queries; public profile allowlist; community ownership/blocking | Reviewed + real-DB route/command tests; many use Fastify inject rather than TCP |
| SQL, output encoding, XSS, paths, redirects | Dynamic query sites traced in reviewed critical modules; all 67 EJS templates screened (unescaped output consists of server includes); all 13 browser JS files screened (no HTML/eval sinks); static traversal/origin tests | Reviewed + selected adversarial/static/browser cases; no universal taint-analysis proof |
| Economy, inventory, Land, quotes, combat, rewards | Account/character/quote locks, canonical idempotency fingerprints, server arithmetic and transactions; finance, bounties, bot progressive economy, phase6 combat/rarity, phase48 economy, e2b transaction tests | Reviewed + PostgreSQL races/replays/conservation cases; no live economy/load test or deliberate collusion simulation |
| Social, moderation, notifications | Content escaping, policy/mute/block checks, scoped reports/feed reads; community/social/account safety and notifications browser tests | Reviewed + tested; operator staffing/policy effectiveness not measured |
| Release, secrets, backups, recovery | Workflow permissions, exact source/image, signatures/expiry, retained artifacts, worker, retention guards; unit suites + real restoration; tracked-text credential-shape screen | Reviewed + offline gate tests/real local restore; no new provider backup/restore or release |
| Actual Railway boundary | Read-only game and database service metadata; game health | Observed pinned game image/success, no staged changes, one configured game replica; neither PostgreSQL service advertised public domains/TCP proxies. Actual SQL roles, network enforcement, credentials, bucket policy and provider retention unavailable |
| Android/WebView | Three Java sources, manifest, network/backup rules, Gradle/signing/artifact verification, Android contract and Python verification tests | Reviewed + contracts tested; no SDK/JDK/device/emulator or native signed-AAB execution in this environment |
| Browser client / modified client | Current Play browser suite, marketplace/preferences retry suites and notifications; server Zod and canonical commands | Real Chromium + PostgreSQL; not Android platform certification |
| Dependencies / base images | Current main production/all-package and separate release-controller `npm audit` | Zero known advisories in all three current results. Mutable Node/Postgres image tags remain; no current OS-layer vulnerability scan or new container build (full workspace disk) |
| Abuse / availability | Durable identity counters, per-account commands, 16KiB body limit, Argon2 bounds, socket/global controls | Reviewed + bounded concurrency; socket/global throttles remain per-process and shared-proxy-sensitive. No sustained stress, DDoS or multi-replica capacity certification |

The scope inventory contains 117 baseline TypeScript source files, 67 templates
and 13 browser modules. Critical executable paths received deeper review;
inventory/pattern screening of a file is not a line-by-line security finding
review. No additional exploitable issue was validated in the bounded economy,
API, Android or release source reviews.

## Verification and reproducibility

Final exact-head commands, outputs, counts, skips and SHA are in the delivered
`FINAL_VERIFICATION.json` and logs. Earlier reproduced failures and environmental
failures are preserved separately; their counts are not added to final passes.

Application commands run from `knights-reforged/`:

```sh
npm run typecheck
npm run build
npm run check:static
node scripts/ci/run-tests.mjs --lane=unit --workers=2
# With an explicit local *_test TEST_DATABASE_URL:
node scripts/ci/run-tests.mjs --files=<files recorded in FINAL_VERIFICATION.json> --workers=2
# The real dump/restore suites can explicitly use compatible native clients:
POSTGRES_TEST_BIN=/absolute/postgresql/bin node scripts/ci/run-tests.mjs --files=tests/play-erasure.test.ts,tests/recovery-privileges.test.ts,tests/credential-attempts-http.test.ts --workers=2
npm audit --omit=dev --json
npm audit --json
npm audit --prefix deployment/release --json
```

The native-client option is test-only, fails rather than silently falling back,
and refuses nonlocal/non-disposable database targets. CI retains its existing
Docker-client path. No application dependency or lockfile changed. Local
application dependencies were restored to exact locked bytes; identical existing
release-controller dependencies were reused. The full-disk environment requires
an isolated writable npm cache and RAM-backed build/test/evidence directories.

Known execution failures retained in evidence:

1. Intentional pre-fix HTTP reproduction: five charges for ten attempts.
2. Intentional pre-fix native restore reproduction: six PUBLIC capabilities
   remained after migration replay.
3. Docker-backed restore attempt: local daemon `ENOSPC`, not a product failure.
   The final full erasure and recovery tests use real native PostgreSQL clients.
4. Initial unit run lacked separately locked release-controller dependencies;
   reused exact existing lock/dependencies, then reran affected checks.
5. Static import checker initially misread an inline child-process fixture;
   corrected its relative paths and used the equivalent `--import=tsx` argument.
   The check was not relaxed.
6. A hosted-runner network-namespace diagnostic is explicitly skipped outside
   its supported hosted environment; local signature/gate tests still execute.

No Codex Security service-backed scan was available. Auxiliary skill references
were unavailable; ordinary review/testing continued as requested. The recovered
November 13 artifacts cover an older candidate (`6f34d5e`), not today's source.
Their findings were re-traced; PG-01 was freshly reproduced instead of assuming
all historical findings had been fixed. Historical phase 4.4–4.8 mitigations and
remaining risk statements were used as seeds, not recertified wholesale.

## Operational implications and remaining risks

No numbered migration, gameplay formula, financial record, identity, feature
flag, artwork, Android package ID or signing key changes. Authentication uses the
existing durable counter table; its semantics and old rows remain intact. The
SQL privilege reconciliation requires the same ownership needed by the existing
migration runner and can run on an already current schema without rewriting
business rows. The protected restore adds no source-database mutation.

Deploy only through the existing reviewed CI and protected recovery/release path.
An unsafe ACL or unexpected function now intentionally blocks startup/promotion.
Do not bypass it. Rollback to old source reopens these protections; existing
REVOKEs remain effective until a no-ACL restore. Do not “roll back” by granting
PUBLIC execution. Existing recovery artifacts/databases were not touched here.

Prioritized residual work:

1. Review this patch, authorize required hosted exact-head CI, then separately
   authorize the existing protected production release. These fixes are not live.
2. Verify actual recovery SQL roles/default ACLs during the authorized recovery
   rehearsal; manual disaster-recovery instructions must include the privilege
   policy above. Do not restore directly into a publicly usable database.
3. Retain the supported single replica; assess shared-proxy/distributed limits
   before scaling or broad exposure. Username-targeted denial of service and
   username-availability inference remain acknowledged design tradeoffs.
4. Obtain current container OS-layer scan and Android device evidence in the
   normal approved pipelines; protect administrative GitHub/provider credentials
   and signing/recovery keys. Provider grants/policies and historical secrets were
   not independently inspected in this pass.

No paid CI, push, PR, merge, deployment, configuration change, production attack,
private player-data access, real deletion or provider backup/cleanup occurred.
PR #95, the paused cache experiment, Play-only work and Crime RPG are unchanged.
