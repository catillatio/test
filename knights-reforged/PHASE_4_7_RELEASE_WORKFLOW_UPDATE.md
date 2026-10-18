# Phase 4.7 release transport correction

This update changes deployment tooling only. No gameplay formula, catalog, SQL migration, player record, session, bot, balance or live Railway service was changed. The feature branch is `feature/kingdom-come-phase-4-7-game-feel-and-polish`. Nothing was merged or deployed.

## Diagnosis

The original release path depended on a stable, independently verified SSH host key for `ssh.railway.com`. Railway does not publish that trust anchor and the gateway keys can change. The workflow correctly refused to proceed, but its setup prerequisite could not be satisfied. Neither `ssh-keyscan`, first-use acceptance nor disabling verification establishes an independently authenticated production channel.

The release path now uses no SSH. Obsolete automation SSH secrets and the old shell backup script are removed from the current setup. The original Railway game builder, private PostgreSQL connection, controlled pre-deploy migrations, start command and health check remain.

## Replacement safeguards

| Gate | Implementation |
| --- | --- |
| Explicit approval | Manual production-branch workflow, successful CI for that exact commit, sole-owner protected environment approval, no administrator bypass; releases remain serialized. |
| Authenticated control | Pinned Railway CLI uses the documented HTTPS deployment API to upload a whitelisted private one-shot verification job. No SSH or public PostgreSQL proxy. |
| Source preservation | Read-only source status transaction and read-only `pg_dump`; source and restore hosts plus cluster system identifiers must differ. No initialization, reset, seed, grant or moderation step. |
| Durable encrypted recovery | Age encryption before export, owner public recipient plus temporary restore recipient, bounded TLS object grants, actual conditional-write enforcement, checksum/size verification and actual ciphertext download/decrypt/restore. No plaintext or private recovery key is exported. |
| Independent retention | GitHub independently downloads the ciphertext, uploads it as a recovery artifact, downloads that retained artifact, and rechecks it before promotion. Owner-key recovery rehearsal remains mandatory. |
| Migration rehearsal | Candidate compiled migrations run only on a uniquely named copy in a separate private PostgreSQL cluster; every pre-existing business row is compared and migration replay must remain unchanged. |
| Pre-deploy authorization | A one-hour Ed25519 approval binds the candidate fingerprint, commit, target service/source/copy and retained recovery evidence. The rechecked copy must still match its signed full-data digest. Railway holds only the public verification key. Validation occurs before opening a source pool. |
| Running release | Exact deployment ID and commit health, anonymous login and a read-only private aggregate verification job. Failure stops further work, without automatic database rollback. |

Temporary plaintext and the transient age identity are deleted even on failure. Durable backups and uniquely named copied databases are never automatically deleted. The helper has no HTTP endpoint, arbitrary command input, cron or restart loop, and its role cannot start or migrate the game database through the game wrappers.

## Owner setup and remaining limitations

Follow [the Android-friendly setup and release guide](docs/phase47/OPERATIONS.md). It specifies the new private verification service, separate scratch PostgreSQL service, private recovery bucket, exact variables/secrets, signing-key creation, offline recovery check, failure handling and rollback. Keep autodeploy disabled. Do not run the historical SSH instructions or bypass a failed approval.

No authenticated Railway session was available here. Actual project-token permissions, bucket conditional writes, service configuration, retained-object availability, owner-key recovery and provider promotion must pass an owner-approved rehearsal before production promotion. Unsupported provider behavior fails closed; there is no weaker SSH fallback. Additional private services and retained storage incur plan-dependent costs. An approved release runner remains an administrative trust boundary.

The two existing broadcasts remain unchanged. This worker cannot perform moderation. Managed database backups and a durable owner-held encrypted copy remain required independently of expiring Actions artifacts. Recovery must restore to a new private database and receive separate owner review before any connection switch.

## Verification

The [verification record](docs/phase47/release-transport-verification.json) contains the completed local results:

- TypeScript, production build, both workflow lint checks, 91 static checks and 73 production EJS fixture cases passed.
- All 273 automated tests passed with no failures or skips, including 13 focused release-guard tests.
- The production game container passed 21 checks, including real HTTP/CSRF/Origin actions, additive migrations, restart/session persistence and preservation of all 450 bots.
- The private release worker passed 15 checks against 452 synthetic accounts and 64 pre-existing tables: real PostgreSQL export/restore, owner-key recovery, actual encrypted HTTPS round trip, conditional-write enforcement, signatures, migration replay and read-only source preservation. Corruption, untrusted TLS, source aliasing, ignored preconditions, replay, unwritable temporary storage and a restored copy changed after signing fail closed. The final signed-copy comparison was verified by rerunning all 13 release-guard tests and all 15 real release-worker checks after the complete suite.
- Both the game and isolated release-controller production dependency audits reported zero vulnerabilities.

The test environment uses synthetic populated databases and a local HTTPS S3-compatible fixture; it does not contact or modify live Railway. Provider acceptance is deliberately separate from these tests. CI also builds the canonical images directly and runs the existing browser suite; its exact-commit result is a mandatory future release gate.
