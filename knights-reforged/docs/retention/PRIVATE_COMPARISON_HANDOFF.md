# Private read-only comparison — owner result received

The owner confirmed KingdomReleaseCheck's existing `KINGDOM_RESTORE_DATABASE_URL`
names **`Railway`** exactly. The owner then ran the self-contained **summary-only**
command in the existing KingdomReleaseCopy Console and supplied a screenshot.
It printed one safe `owner_summary` JSON result; **no OID worksheet was emitted**.
No download, new connectivity, credentials or service was required.

The earlier two-result private packet/checksum is superseded for this handoff.
Do not use it to request or publish an OID worksheet. Historical files are
preserved privately; the current delivery is the summary-only command already
provided to the owner. The validated local SQL reference and its checksum are
recorded in [synthetic validation evidence](SUMMARY_ONLY_VALIDATION.json);
formatting in the copy/paste shell command may differ from that reference file.
None of these files is a signed approval or a runtime installation input.

## Owner-observed production result

The Console screenshot reports **26 October 2026, 03:12:51 EDT**
(`2026-10-26T07:12:51Z`; fractional seconds omitted here). This is owner evidence,
not a production SQL execution by Codex.

| Check | Result |
| --- | --- |
| Exact maintenance name | Match: `Railway` |
| Actual cluster vs retained reports | Match |
| Live recovery-name inventory | 23 |
| Names associated with verified prepare manifests | 17 |
| Live names without retained-manifest matches | 6 |
| Historical names not currently matched | 18 |
| Expected current recovery reference | Present |
| Emergency OIDs 106971 and 129180 | Both present; protected |
| Owners of the live scoped inventory | All `postgres` |
| Original historical OIDs captured | No |
| Retirement authorized / eligible copies | False / 0 |

[Sanitized result and exact public run/attempt lists](OWNER_COMPARISON_RESULT.json)
are transcribed from the screenshot. The raw database names, OIDs and cluster
fingerprint remain private. The result verifies equality with the one common
restore-cluster digest reported by all 35 retained prepares; neither actual
fingerprint is returned or published.

**A name match is not an original-OID attestation.** The query reads the current
catalog and compares name fingerprints, not historical database-creation records.
The three no-authorization/original-OID/eligibility fields are explicit constants,
not a retirement-planner result. No copy has been adopted or granted deletion
eligibility. Both emergency OIDs and
all current/pending/pinned/unknown/rollback copies remain protected.

## Validation completed independently

[Eight local checks](SUMMARY_ONLY_VALIDATION.json) use disposable PostgreSQL and
explicitly synthetic catalog CTEs: identity mismatch, matching identities with
known and unknown names, missing current reference, changed ownership, changed
OID, cluster mismatch, absent emergency identity and idempotent repeated reads.
All pass, always reporting no authorization and no historical-OID attestation.

The summary-only SQL is a READ ONLY transaction and one metadata SELECT. It has
no DDL/DML, temporary tables, configuration SET commands, permission changes,
account queries, backup decryption or workflow calls. Its result contains only
booleans, counts, timestamps and public run/attempt IDs. Positive identity tests
are tests of the query; the separate screenshot is the actual production result.

## No repeat Console survey required

The name, cluster equality and 17-name association are now established by owner
observations. Do not request another digest/schema/role/WAL/filesystem survey just
to repeat them. Refresh only when a later authorized operation needs fresh state.

The remaining evidence is limited to:

- The **six unmatched live copies**: preserve their private inventory and obtain
  existing creation/retained-report/manual/emergency-purpose evidence if available.
  They remain unknown/protected if that evidence is unavailable.
- Existing external pins, rollback/manual recovery needs and lifecycle review
  establishing any future legacy adoption's exact current identity. All 35
  historical manifests lack original OIDs; do not invent or backdate them.
- Separate explicit authorization for any future metadata installation and, later,
  exact-copy adoption/retirement. The six unknown copies need not be adopted to
  install an empty catalog; installation itself authorizes no retirement.

No catalogs, permissions, ownership, schedules, gameplay or production data were
changed. All 23 copies remain protected; this result cannot be used as cleanup
approval. See the [reconciliation report](PROVENANCE_RECONCILIATION.md) for the
retention groups and the 16 runs without listed artifacts.
