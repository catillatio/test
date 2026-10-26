# Installed empty catalogs: validation and future registration plan

## Current evidence and boundary

The owner reports successful, owner-approved installation in KingdomReleaseCopy's
existing maintenance database `Railway`. Both reviewed SQL files passed SHA-256
verification, all installation postchecks passed, and the Console returned:

```text
EMPTY_CATALOGS_INSTALLED; identities preserved; no adoption or activation
```

[The attributed result](OWNER_INSTALLATION_RESULT.json) is owner-observed evidence,
not SQL executed or independently revalidated by Codex. No exact server execution
timestamp was supplied. The former absent-schema/role findings are historical,
superseded for installation status. **Do not repeat either installation.**

Installation postchecks establish empty metadata, unchanged database identity
tuples, no adopted ownership and the specified role attributes. Full definitions
and effective privileges still need the read-only check below. All **23** copies,
including OIDs **106971 / 129180**, remain protected. Six unmatched legacy names,
missing original-OID evidence and external recovery holds are unchanged.

No new permission, credential, registration flag, ownership adoption, legacy
import, cleanup, schedule, merge, deployment or protected release is authorized.
The catalogs alone neither register copies nor reclaim storage. PR #25's worker
integration remains a draft; installation does not prove it is deployed.

## Next action: read-only Console validation

The official Railway integration exposed here has no private SQL execution
tool. Use the existing KingdomReleaseCopy Console as `postgres`, not the game
service, source database or verification worker. No new credential is needed.

Copy the complete [paste-ready read-only Console packet](VALIDATE_CATALOGS_CONSOLE.txt)
into that existing shell. It stages the exact
[reviewable SQL](VALIDATE_CATALOGS_READ_ONLY.sql) in private local files, verifies
its SHA-256, prompts for the already privately confirmed restore-cluster digest,
and prints only the JSON result. No curl, Git, Node, new packages or credentials
are needed. Do not publish the private digest or retained stderr. SQL failure
prints only the fixed category `CATALOG_VALIDATION_FAILED`; stop without repair.
The packet does not invoke either installed bootstrap file.

The file runs one repeatable-read **READ ONLY** transaction and ends in ROLLBACK.
It creates no temporary table, session authorization change, advisory lock,
row, audit event or sequence value. It invokes no catalog-defined registration,
permit, pin or cleanup function. No recovery database connection is opened.
The 10-second statement and 2-second lock limits bound the check.

Only the `owner_summary` JSON is printed. Return that summary, not raw definitions,
database names/OIDs, hashes, settings, URLs or credentials. Its checks cover:

- Exact maintenance name, Console actor, PostgreSQL major version and private
  cluster equality.
- Both schemas, all tables/sequences/indexes, columns/defaults/constraints,
  owners, logged persistence, row-security flags, exact function bodies and
  attributes, and enabled trigger definitions.
- Five role attributes, password-*presence* booleans (never password contents),
  role settings and membership/admin/inherit/set options.
- Explicit schema/table/column/sequence/function ACLs, including PUBLIC grants.
- Effective schema, table, column, sequence, function, `pg_control_system()`,
  maintenance database and public-schema privileges of the three login roles.
- Five empty tables, actual recovery count, scoped `postgres` ownership, both
  emergency OIDs present, and no database owned by any of the five new roles.

Four published catalog-metadata fingerprints were derived reproducibly from the
exact two SQL files in isolated PostgreSQL 18.6 after the existing restricted-role
`checkCatalog` and `checkObservationCatalog` validators passed. They are not
private cluster/database fingerprints, signed recovery evidence or authorization.
Names/OIDs private to the real cluster do not enter these definition baselines.

For this **pre-registration v1** check, all observed match/preservation/empty
booleans must be true and the recovery count must remain 23. The two authorization
fields are deliberate **false constants**: this query grants nothing and does
not inspect worker flags or execute an eligibility planner. A new legitimate copy,
nonempty observation table, SQL error, false or NULL result means stop and review
the changed state; do not edit the expected digest, clear rows, repair permissions
or rerun installation to turn the result green. Do not reuse this initial-empty
check as a steady-state registration monitor after later enablement.

The output is a point-in-time metadata assessment. It does not certify the
original OIDs/content of legacy copies, business-row integrity, current filesystem
headroom, authentication/HBA rules, or privileges on every unrelated database/
object. Catalog owners/superusers can alter catalogs; the database-owner bypass
limitations in [READINESS.md](READINESS.md) still apply. Read-only validation does
not create an exclusive release/cleanup window or authorize a later write.

## Future verified-copy registration — plan only, still OFF

1. **Review the read-only result.** Confirm all intended role/guard/ACL checks
   before any credential setup. A mismatch needs a separately reviewed correction,
   not automatic GRANT/REVOKE or bootstrap replay. Preserve all copies meanwhile.
2. **Separately approve code delivery.** Review PR #25 and its normal exact-head
   checks. Any merge/protected deployment requires explicit authorization and all
   existing encrypted backup, independent restore, exact-commit, signature,
   schema/population/preservation and owner gates. Do not dispatch a release just
   to populate this catalog or assume installed SQL updates the worker.
3. **Separately review registrar-only credentials and scope.** If later approved,
   use only `kc_copy_registrar` in the existing private verification worker, bound
   to the confirmed independent cluster and `Railway`. No cleanup runtime or
   authorizer credentials, signing/decryption keys, source URL, S3 credential,
   public endpoint or new executor belongs in this step. Existing authentication
   rules must be understood; a null password does not disable trust/peer LOGIN.
   Do not configure anything now.
4. **Separately approve optional enablement.** The existing reviewed settings are
   `KINGDOM_COPY_REGISTRATION_DATABASE_URL`,
   `KINGDOM_COPY_REGISTRATION_SCOPE` and `KINGDOM_COPY_REGISTRATION_ENABLED`.
   Scope binds project/environment/game/worker/copy-service UUIDs, exact maintenance
   name and distinct source/restore cluster digests. Values stay private. Only the
   existing worker may receive them; not GitHub, game, source or a public endpoint.
   No setting is changed by this plan. Runtime/authorizer/cleanup/scheduling remain
   disabled and unconfigured even if observation is later authorized.
5. **Observe a separately approved, already-needed future prepare.** With reviewed
   code and opt-in installed, the existing worker first completes encryption,
   exported-ciphertext round-trip, independent restore, migrations/replay and exact
   preservation/population verification. It captures actual OID/owner/maintenance/
   cluster through its existing locked verification connection, validates the
   mandatory report, uploads that report, then uses the separate registrar.
   Post-deployment verify jobs do not create/register copies. Mandatory failures
   still fail release; optional capture/registration failures cannot certify
   recovery, supply release proof or bypass gates.
6. **Review one exact new observation privately.** Match retained manifest and
   original worker run/attempt/deployment, name/OID/cluster/owner, evidence digests,
   genuine verification result and server timestamps. Verify database ownership
   remains unchanged and no row appears in adopted copies, permits, pins or audit.
   Identical retries/concurrent calls return the same observation/timestamps;
   conflicts refuse. First observation time is not a fabricated creation date.
   The new copy remains observed-only and protected, with no cleanup adoption.
7. **If optional recording fails, do not repeat backup/restore.** Review the
   independently retained manifest and exact file SHA-256. Registration-only
   replay through an already approved private worker channel requires separate
   authorization and `report.verifiedCopyIdentity`; it has no backup/restore/DROP
   operation. None of the 35 reconciled legacy reports captured original OIDs.
   Do not fill missing identity fields or replay them as future observations.
   If an execution channel/evidence is unavailable, retain protection and report
   the blocker; do not improvise credentials, SSH or a public endpoint.

Fixed optional messages are `COPY_REGISTRATION: PASS|FAIL`; metadata-only replay
uses `COPY_REGISTRATION_REPLAY: PASS|FAIL`. Retain only these categories in shared
logs, never provider errors, report bodies, manifests, private identities or URLs.
No success message changes mandatory recovery status or retirement authorization.

Successful registration still permits volume accumulation. Future retention
needs separate exact-OID adoption/holds review and owner-approved coordinated,
signed execution. Two newest verified copies, 24-hour observation hold, all
current/pending/pinned/unknown references and both emergency OIDs stay protected.
No schedule or destructive activation is part of this next phase.

## Focused validation evidence

The read-only packet passed **18** adversarial checks on disposable PostgreSQL 18.6,
including exact baseline equality, changed guard/column/trigger/object definitions,
table and column grants, PUBLIC privileges, cleanup-function access, role
membership/attributes/settings/password presence, wrong cluster and repeated
reads with unchanged business rows and zero observation/permit/audit writes.
See [synthetic results](CATALOG_VALIDATION_TEST_RESULTS.json) and the
[local-only reproducible harness](tests/catalog-validation.test.mjs).

No production SQL was executed by Codex and no credentials were obtained or
configured. The previous exact-head preparation CI at `d0e9cd5`
[passed all 10 jobs](https://github.com/catillatio/test/actions/runs/40290391890).

From `knights-reforged/`, reproduce only on a **fresh disposable local PostgreSQL 18 cluster** whose test
maintenance database is named `Railway` (not a production/forwarded connection):

```bash
TEST_RETENTION_CATALOG_VALIDATION=disposable \
TEST_DATABASE_URL='postgres://postgres@127.0.0.1:5549/Railway' \
node docs/retention/tests/catalog-validation.test.mjs
```

The manual harness checks localhost, explicit opt-in and a fresh empty cluster
before any fixture writes. It installs the SQL only in that local fixture and
rolls back adversarial mutations; it must never be run in Railway. It is outside
the runtime/test-discovery paths and does not dispatch CI or protected workflows.
