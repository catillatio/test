# Private read-only comparison handoff

The owner has confirmed that KingdomReleaseCheck's existing
`KINGDOM_RESTORE_DATABASE_URL` names **`Railway`**, exactly matching
`current_database()` in KingdomReleaseCopy. This closes the database-name match;
no URL, password or variable value was fetched by Codex. It does not by itself
establish the cluster fingerprint or any historical database OID.

The latest protected run remains `40270052123/1`, commit
`d48ab91d14639252be847670caad8ec0bfdcb62a`; the currently active game deployment
still matches its retained post-deployment receipt on the follow-up metadata read.
The existing 35 verified prepare manifests are reused; no archives were downloaded
again and no release, restore or production database command was executed.

## Prepared private packet

A separate private file, `owner-read-only-comparison.sql`, is prepared in the
execution workspace for use **only in the owner's existing authenticated
KingdomReleaseCopy Console**. It is not committed, deployed or installed.

Packet SHA-256:
`9a253d34d6a9eca66de3d664ce9656939cde55ad57e2416a089adb567a6d415f`

It contains a `REPEATABLE READ READ ONLY` transaction, local query timeouts,
CTE `VALUES` containing 35 historical name fingerprints, and two metadata SELECTs.
It queries only `pg_control_system`, `pg_database`, `pg_roles`, `pg_stat_activity`
and database sizes. There are no temporary/persistent tables, functions,
permission/ownership changes, migrations, account queries, workflow calls or
backup decryption. No database names, original cluster digest, credentials, URLs
or signed proofs are embedded: comparison constants use SHA-256 fingerprints.
Do not publish the packet or its detailed results in GitHub.

The cluster comparison hashes the Console's cluster digest once more and compares
that result with the identically hashed expected digest from all 35 retained
reports. This preserves equality checking without returning either fingerprint.
Live database names are hashed inside PostgreSQL and joined to historical name
fingerprints. This establishes a **name association and current observed OID**,
not proof of an unchanged historical OID or permission for adoption/retirement.

## Owner execution and result handling

1. Review/open the provided private packet and paste it into the **existing**
   KingdomReleaseCopy PostgreSQL Console. Do not add connectivity, credentials,
   services or permissions. This session has no private SQL execution tool, so
   Codex cannot perform this production read on the owner's behalf.
2. The **first** result is `owner_summary`: booleans, counts and public GitHub
   run/attempt IDs. It excludes database names, OIDs and fingerprints. Only this
   summary should be returned for the reconciliation report.
3. The **second** result is the detailed OID/owner/size/connection worksheet.
   Retain it privately, with the inspection time. Do not paste it in GitHub/chat.
4. If either `maintenance_name_matches` or `cluster_matches_retained_reports` is
   false, **stop** and report the sanitized summary. Do not rename a database,
   change the URL, create a catalog or try another cluster to force a match.
   A permission/query failure also stops the comparison; do not broaden grants.

The summary includes live/matched/unmatched name counts, historical run names not
currently present, the expected active-release reference's presence, both emergency
OID presence flags and whether all live owners remain `postgres`. Its run/attempt
lists allow reconciliation without disclosing private database identities. A name
not currently found is not proof that a database was deleted; renames, reuse and
unavailable legacy lifecycle evidence remain relevant.

`retirement_authorized` is always false and `eligible_copy_count` always zero.
Every detailed row is protected, including successful name matches. A target
mismatch labels every row protected. Emergency OIDs **106971 and 129180** remain
unconditional exclusions. The current-reference absence flag requires review;
it never triggers a repair, restore or release.

## Validation and remaining gates

The complete packet was parsed/executed against **disposable local PostgreSQL**
using a deliberately different database and cluster. The mismatch flags were
false, all 35 historical records were reported absent from that unrelated test
cluster, no retirement was authorized and no SQL writes were used. Keyword and
privacy checks confirm no DDL/DML or raw private identity constants. This is
validation of the packet, **not a production comparison result**.

Until the owner supplies the first result, the actual private cluster match and
live inventory join remain pending. No repeat WAL/schema/role/capacity survey is
needed. Existing external holds, legacy original-OID uncertainty, two newest
present verified copies, the full 24-hour hold and separate owner approvals remain
unchanged. Even a matching summary does not authorize installing catalogs,
transferring ownership, signing a retirement batch or enabling scheduling.
