# Empty retention catalog installation — historical plan, COMPLETED BY OWNER

The owner reports the separately approved installation completed with both SQL
hashes verified and every postcheck passing. Console result:
`EMPTY_CATALOGS_INSTALLED; identities preserved; no adoption or activation`.
[Owner-observed result](OWNER_INSTALLATION_RESULT.json) ·
[Next read-only validation and future registration plan](POST_INSTALL_VALIDATION_AND_REGISTRATION.md).

**Do not repeat either SQL installation.** All 23 copies and emergency OIDs
106971 / 129180 remain protected. Full definition/effective-permission validation
is pending; no registration, credential setup, adoption or cleanup is authorized.
The remainder preserves the exact historical plan and pre-install observations;
its former authorization boundary has been satisfied only for that completed
installation, not for a rerun, upgrade or further production action.

## Official Railway access result, 2026-10-26

The authenticated official Railway integration resolved `merry-patience` →
`production` → `KingdomReleaseCopy`. Read-only service/health tools show the
service **live/online**, one running replica, image `postgres:18-bookworm`, a
20,000 MB volume mounted at `/var/lib/postgresql`, no staged service changes,
no pending environment operations and no public TCP proxy. These are platform
observations, not SQL verification of database contents or current free space.

The exposed integration has **no SQL query, SSH or Console execution tool**.
The local environment has no Railway CLI or configured private TCP/VPN access;
OAuth platform access does not establish PostgreSQL execution access. No tokens,
variable values or connection strings were fetched, and no alternative execution
channel was created. Use the owner's **existing private service Console**.

The exact maintenance database is **`Railway`**, capital R, user `postgres`.
The owner confirmed that it matches the worker's restore URL and that the cluster
digest matches retained recovery reports. PostgreSQL **18.6**, absent catalogs/
roles, 23 copy databases and both emergency OIDs are owner-observed facts.
Revalidate those installation-specific conditions immediately before execution.
Do not repeat historical provenance research or treat this installation as legacy
OID certification. Six unmatched copies remain unknown and protected.

## Exact reviewed sources and effects

Both files are unchanged from source commit
`3d69b093c6edf1992d22598cb092f89090f7e793`:

| File | SHA-256 |
| --- | --- |
| [bootstrap.sql](../../deployment/release/retention/bootstrap.sql) | `fb58be5fd5a254859b8bc30bb4e6d0907486bfad9b90b0166fe7404d8a9030cb` |
| [observations.sql](../../deployment/release/retention/observations.sql) | `6a4a7eb08bcf8adf98c8646aeaf53ab3c9c4e119b99ccf9cc0b9f8837304b225` |

`bootstrap.sql` creates four roles, the private `release_retention` schema,
four empty tables, three guard functions, five triggers and supporting indexes/
sequences. `observations.sql` requires bootstrap, creates the fifth role and
`release_observations`, one empty table, two functions and one immutable trigger.
Each file has its own `BEGIN`/`COMMIT`. They are fresh installs, **not idempotent
upgrades**. Do not use `--single-transaction` around their internal transactions.

| Role | Intended installed authority |
| --- | --- |
| `kc_retention_owner` | NOLOGIN; owns new metadata schemas, tables and guards only. |
| `kc_release_copy_owner` | NOLOGIN; owns **no database** after installation. |
| `kc_retention_runtime` | LOGIN/INHERIT; member of copy-owner role; catalog SELECT and guarded event function only. |
| `kc_retention_authorizer` | LOGIN/NOINHERIT; catalog SELECT and restricted permit-column INSERT. |
| `kc_copy_registrar` | LOGIN/NOINHERIT; observation function only; no direct observation writes or cleanup authority. |

All five roles explicitly lack superuser, CREATEDB, CREATEROLE, replication and
BYPASSRLS. Installation requires the existing privileged `postgres` operator:
role/schema creation, `SET ROLE` to the metadata owner, database CONNECT grants
and EXECUTE grants on `pg_control_system()`. New schemas revoke PUBLIC access;
security-definer guards use `pg_catalog, pg_temp` search paths. No password is set,
no existing database owner is changed, no table row is inserted and no DROP is
issued. This does create LOGIN roles and grants: **unset passwords do not disable
LOGIN under existing trust/peer authentication**. The owner must review that
effect under the existing authentication rules before authorizing installation.
Do not change authentication or permissions to make preflight pass.

Public CREATE access to the maintenance database or its `public` schema would
undermine the restricted-role assumptions. The preflight below refuses it.
Native database ownership and catalog-superuser limitations remain as documented
in [READINESS.md](READINESS.md); installation grants no existing-copy ownership.

## Minimum owner Console procedure

Open the existing **KingdomReleaseCopy → Console** in the confirmed project and
production environment. Do not use the game/Postgres service or verification
worker. Never put credentials or raw identity inventories in chat/GitHub.

1. Copy the contents of [INSTALL_FILES_CONSOLE.txt](INSTALL_FILES_CONSOLE.txt)
   into that shell. It uses `cat`, `mktemp` and `sha256sum` to stage the exact two
   reviewed files in a mode-0700 temporary directory, with private files. It does
   **not** invoke PostgreSQL. Both checksums must print `OK`. The PostgreSQL image
   does not need curl, Git, Node, new packages or a service redeployment. Preserve
   `KC_RETENTION_STAGE` in this shell; restaging creates a new private directory.
2. After **separate explicit installation approval**, reserve a quiet operator
   window with no pending release/restore/cleanup work. Paste the following
   block in the same existing Console. Supply only the previously privately
   confirmed restore-cluster digest at the prompt; do not publish it. An empty,
   malformed or mismatched digest fails. The local socket, port, user and exact
   database are explicit, so inherited PGHOST/PGDATABASE cannot redirect it.

**FUTURE MUTATING STEP — NOT RUN / NOT AUTHORIZED:**

```bash
(
  set -eu
  cd "${KC_RETENTION_STAGE:?Stage the reviewed files first}"
  printf '%s\n' \
    'fb58be5fd5a254859b8bc30bb4e6d0907486bfad9b90b0166fe7404d8a9030cb  bootstrap.sql' \
    '6a4a7eb08bcf8adf98c8646aeaf53ab3c9c4e119b99ccf9cc0b9f8837304b225  observations.sql' \
    | sha256sum -c -
  read -r -s -p 'Previously confirmed private restore-cluster SHA-256: ' KC_EXPECTED_CLUSTER
  printf '\n'
  psql -X --no-password -h /var/run/postgresql -p 5432 -U postgres -d Railway \
    -v ON_ERROR_STOP=1 -v expected_cluster_digest="$KC_EXPECTED_CLUSTER" <<'PSQL'
SET application_name='kc-empty-retention-catalog-install';
SET statement_timeout='30s';
SET lock_timeout='5s';
SELECT current_database()='Railway' AND current_user='postgres'
 AND current_setting('server_version_num')::int BETWEEN 180000 AND 189999
 AND (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 AND :'expected_cluster_digest' ~ '^[a-f0-9]{64}$'
 AND encode(sha256(convert_to((SELECT system_identifier::text FROM pg_control_system()),'UTF8')),'hex')=:'expected_cluster_digest'
 AS exact_target_ok \gset
\if :exact_target_ok
\else
  \echo 'TARGET_CHECK_FAILED; no installation attempted'
  DO $$ BEGIN RAISE EXCEPTION 'CATALOG_INSTALLATION_CHECK_FAILED'; END $$;
\endif
SELECT pg_try_advisory_lock(61824087) AS install_lock_ok \gset
\if :install_lock_ok
\else
  \echo 'RELEASE_LOCK_UNAVAILABLE; no installation attempted'
  DO $$ BEGIN RAISE EXCEPTION 'CATALOG_INSTALLATION_CHECK_FAILED'; END $$;
\endif
BEGIN READ ONLY;
SELECT to_regnamespace('release_retention') IS NULL
 AND to_regnamespace('release_observations') IS NULL
 AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN
 ('kc_retention_owner','kc_release_copy_owner','kc_retention_runtime','kc_retention_authorizer','kc_copy_registrar'))
 AND (SELECT count(*)=23 AND bool_and(pg_get_userbyid(datdba)='postgres')
      FROM pg_database WHERE datname ~ '^kc_[a-f0-9]{32}_restore_test$')
 AND (SELECT count(*)=2 AND bool_and(pg_get_userbyid(datdba)='postgres')
      FROM pg_database WHERE oid IN (106971,129180))
 AND NOT EXISTS (SELECT 1 FROM pg_database d,
      LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
      WHERE d.datname=current_database() AND a.grantee=0 AND a.privilege_type='CREATE')
 AND NOT EXISTS (SELECT 1 FROM pg_namespace n,
      LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='CREATE')
 AS fresh_install_ok \gset
SELECT encode(sha256(convert_to(jsonb_agg(jsonb_build_array(
 d.datname,d.oid::text,r.rolname,d.datistemplate) ORDER BY d.oid)::text,'UTF8')),'hex')
 AS identity_digest FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba \gset before_
COMMIT;
\if :fresh_install_ok
\else
  \echo 'FRESH_INSTALL_CHECK_FAILED; no installation attempted'
  DO $$ BEGIN RAISE EXCEPTION 'CATALOG_INSTALLATION_CHECK_FAILED'; END $$;
\endif
\i bootstrap.sql
\i observations.sql
BEGIN READ ONLY;
SELECT encode(sha256(convert_to(jsonb_agg(jsonb_build_array(
 d.datname,d.oid::text,r.rolname,d.datistemplate) ORDER BY d.oid)::text,'UTF8')),'hex')
 = :'before_identity_digest' AS database_identities_preserved
 FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba \gset after_
SELECT (SELECT count(*) FROM release_retention.copies)
 +(SELECT count(*) FROM release_retention.pins)
 +(SELECT count(*) FROM release_retention.permits)
 +(SELECT count(*) FROM release_retention.audit)
 +(SELECT count(*) FROM release_observations.verified_copies)=0 AS all_five_tables_empty,
 NOT EXISTS (SELECT 1 FROM pg_database WHERE pg_get_userbyid(datdba)='kc_release_copy_owner') AS no_database_adoption,
 (SELECT count(*)=5 AND bool_and(NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
  FROM pg_roles WHERE rolname IN ('kc_retention_owner','kc_release_copy_owner','kc_retention_runtime','kc_retention_authorizer','kc_copy_registrar')) AS five_unprivileged_roles,
 NOT EXISTS (SELECT 1 FROM pg_authid WHERE rolname IN
 ('kc_retention_owner','kc_release_copy_owner','kc_retention_runtime','kc_retention_authorizer','kc_copy_registrar') AND rolpassword IS NOT NULL) AS no_passwords_assigned
 \gset installed_
COMMIT;
\if :after_database_identities_preserved
\else
  \echo 'POSTCHECK_FAILED; stop for review; do not repair automatically'
  DO $$ BEGIN RAISE EXCEPTION 'CATALOG_INSTALLATION_CHECK_FAILED'; END $$;
\endif
\if :installed_all_five_tables_empty
\else
  DO $$ BEGIN RAISE EXCEPTION 'CATALOG_INSTALLATION_CHECK_FAILED'; END $$;
\endif
\if :installed_no_database_adoption
\else
  DO $$ BEGIN RAISE EXCEPTION 'CATALOG_INSTALLATION_CHECK_FAILED'; END $$;
\endif
\if :installed_five_unprivileged_roles
\else
  DO $$ BEGIN RAISE EXCEPTION 'CATALOG_INSTALLATION_CHECK_FAILED'; END $$;
\endif
\if :installed_no_passwords_assigned
\else
  DO $$ BEGIN RAISE EXCEPTION 'CATALOG_INSTALLATION_CHECK_FAILED'; END $$;
\endif
SELECT pg_advisory_unlock(61824087);
\echo 'EMPTY_CATALOGS_INSTALLED; identities preserved; no adoption or activation'
PSQL
)
```

This single psql session holds the existing release/restore lock across both
commits and postchecks. `ON_ERROR_STOP` exits on any SQL error; disconnect releases
the session lock. A failed boolean guard deliberately raises a fixed exception
for a nonzero exit; `\quit 3` is not used because PostgreSQL 18 psql ignores that
argument and exits successfully. Advisory locking only constrains cooperating operators; do not
run other manual SQL concurrently. The postcheck compares every database
name/OID/owner/template tuple, including emergency and unrelated databases.
It is not a business-row attestation or permission to register/retire copies.
Any unexpected change stops execution for review, even when unrelated activity
could explain it. Do not replace the expected count or identity checks merely to
make an unexpected state pass.

Keep the private result, reviewed SQL hashes and before/after evidence. Before
any later credential setup or feature enablement, verify the full effective
grants and exact installed guards against existing `checkCatalog` and
`checkObservationCatalog`; do not configure credentials merely to run a check.
No optional function, import, grant provisioner, runtime or release is invoked by
the installation plan.

## Failure and rollback procedure

- Target, permission, freshness or lock failure: stop. Do not alter credentials,
  database names, ownership, PUBLIC grants or authentication. Do not terminate
  other sessions or bypass the lock.
- Error/disconnect before a file's COMMIT: its transaction rolls back when that
  session closes. A lost acknowledgement at COMMIT is ambiguous; inspect first.
- Bootstrap committed, observations failed: bootstrap remains installed; the
  observation transaction rolls back. Preserve it and review exact definitions/
  grants and whether the registrar/schema were committed. Only after separate
  approval may the uncommitted observation step be resumed. Do not rerun both.
- Postcheck failed after both commits: installed metadata remains. Leave all
  features OFF and preserve the transcript; investigate read-only. Installation
  is not undone by a later read-only transaction or psql exit.
- No automatic rollback script, schema DROP, role DROP, ownership transfer or
  cleanup is part of this plan. An installed-but-disabled empty catalog can stay
  in place. Any reversal requires a separately reviewed exact metadata-only plan.

Registration credentials/scope, optional registration enablement, legacy
provenance import, ownership adoption, signing/authorizer setup, private executor,
workflow installation, scheduling and each retirement authorization remain
**separate**. Neither empty catalog makes an existing copy eligible. No migration,
merge, deployment, release dispatch, registration or retirement is authorized.

## Preparation validation

The exact two SQL files were rehearsed on isolated local PostgreSQL **18.6**:
**nine checks passed**, covering rollback before each COMMIT, bootstrap survival
after an observation failure, both successful installs, existing exact-body/
privilege validators under restricted roles, five empty tables/unassigned
passwords/no adopted database, refusal of duplicate fresh installs and unchanged
synthetic database identities. These are disposable test results, not production
installation evidence. Additional checks passed for byte-exact staged payloads,
shell syntax, private staging, nonzero target/freshness refusal before DDL, and
the exact read-only postcheck queries. No full runtime suite was repeated for documentation-only
preparation; the reviewed implementation remains covered by the prior
[10-job exact-head CI](https://github.com/catillatio/test/actions/runs/40286600549).
