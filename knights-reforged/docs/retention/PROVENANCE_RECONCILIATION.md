# Retained release evidence reconciliation — read-only

This is a historical evidence index and owner-observed name comparison, **not a
production retirement plan**. Codex opened no production database connection and
performed no write, installation, ownership change, deletion, feature enablement,
release dispatch or deployment. Owner Console observations are attributed below.
Live service/deployment metadata was read through the existing authenticated
Railway connection; variable values and credentials were not fetched.

## Confirmed scope and results

- Enumerated **51 protected production-release runs**, including failed and
  cancelled runs, and their retained-artifact metadata. All were terminal at the
  time of this read. **35 runs have retained artifacts; 16 have none listed**.
- Read one retained verification/recovery ZIP per artifact-bearing run. All **35
  whole-archive SHA-256 digests matched GitHub artifact metadata**. No backup was
  decrypted and no recovery/restore job was run. Original GitHub artifacts and
  encrypted recovery objects were not modified or deleted; only temporary local
  download files were removed after reading the JSON metadata.
- Validated **35 distinct `prepare` manifests** against exact run/attempt/SHA,
  deterministic `copyName(jobId)` identity and existing `checkJobReport` checks,
  including successful encrypted round-trip, independent restoration, migration
  replay and preservation evidence. Both 450- and 900-bot evidence is represented.
  All share one reported restore-cluster digest and one distinct source-cluster
  digest. The owner subsequently ran the private equality comparison; it matches
  the actual Console cluster without disclosing either fingerprint.
- **23 archives contain passed post-deployment receipts; 12 do not.** This does
  **not** match those 23 receipts to the 23 currently existing databases. Nor does
  absence of a receipt prove that no restore database was created.
- Of the exact artifact-bearing attempts: **25 succeeded, 9 failed, 1 was
  cancelled**. Promotion steps were successful for 22, skipped for 3, failed for
  9 and cancelled for 1. The cancelled attempt has a passed post-deployment
  receipt: workflow conclusion alone cannot establish whether a deployment or
  usable recovery copy existed.
- **None of the 35 reports captured `verifiedCopyIdentity`**. Consequently no
  historical OID or worker maintenance-database name is recorded in these
  manifests. New PR #25 observation support remains uninstalled/default-OFF.
- Exact live database identities were originally unavailable. The owner has now supplied a safe summary
  associating **17** live names with retained prepares, leaving **six** unmatched
  live names and **18** historical names not currently matched. No raw current
  OIDs were supplied and original historical OIDs remain unverified. Private
  database identifiers, service IDs, hosts, cluster fingerprints, backup keys,
  URLs, proofs and credentials are excluded from this published index.

**All 23 existing copies remain protected; zero are eligible under PR #25.**
Emergency OIDs **106971 and 129180** remain unconditional exclusions. A missing
catalog, unknown legacy identity, current/pending/pinned/rollback reference or
unresolved verification can never be treated as permission to retire a copy.

## Current active release reference

[Protected run 40270052123 / attempt 1](https://github.com/catillatio/test/actions/runs/40270052123)
for commit `d48ab91d14639252be847670caad8ec0bfdcb62a` has a passed retained
post-deployment receipt. Its game deployment ID matches the **currently active
successful** game deployment in read-only Railway environment metadata. The
latest worker deployment also matches that receipt's **post-deployment verify**
worker identity. The game and worker were live with no staged configuration
changes in their service metadata at inspection.

The corresponding `backup-manifest.json` **prepare** request identifies the
recovery reference selected by that protected deployment. The owner summary now
confirms its name is present. Keep it protected; no original OID or current
content-integrity attestation is inferred from that name match.
The original signed production proof is not fetched/revalidated as a new approval.
These matches do not certify the absence of external owner holds/manual recovery
work or authorize reusing historical release evidence for cleanup.

A `verify` job generates a separate nonce/copy alias but creates **no** restored
database. Do not use `post-deploy.privateStatus.copy` as the prepare recovery
reference or count it as another retained database.

## Is `Railway` the correct maintenance database?

**Owner-confirmed.** The owner confirmed KingdomReleaseCheck's existing
`KINGDOM_RESTORE_DATABASE_URL` uses **`Railway`** (capital R), matching the exact
Console `current_database()` result on KingdomReleaseCopy. PostgreSQL is 18.6 and
the Console user is `postgres`. The initial inspection found neither retention schema nor the five roles.
The owner subsequently [installed the empty metadata catalogs](OWNER_INSTALLATION_RESULT.json)
with SQL hashes/postchecks passed. This supersedes absence only; no original-OID
evidence, adoption or cleanup authority is created. No URL or credential
was fetched or disclosed to obtain this confirmation.

The owner subsequently completed the [summary-only private comparison](PRIVATE_COMPARISON_HANDOFF.md).
The name and actual cluster both match; **17 live names** associate with retained
prepares, while six do not. This closes those read-only target checks, not the
original-OID, unknown-copy, external-hold or authorization gates.

| Evidence field | What it actually identifies |
| --- | --- |
| `request.sourceDatabase` | The game/source database, not restore maintenance. |
| `request.restoreHost` | The independent PostgreSQL host, not its maintenance DB. |
| `report.restoredCopy.restoredDatabase` | The newly restored per-job copy, not maintenance. |
| `report.verifiedCopyIdentity.maintenanceDatabase` | Exact maintenance DB when captured; absent in all 35 reports. |
| `post-deploy.privateStatus.copy` | A verification-job alias; verify mode creates no restore DB. |

In [worker.mjs](../../deployment/release/worker.mjs), `scratch` connects to the
validated `KINGDOM_RESTORE_DATABASE_URL`; that connection holds advisory lock
61824087. `createdb` uses its parsed `restore.name` as `--maintenance-db`. The
[private URL parser](../../deployment/release/protocol.mjs) preserves the decoded
name's case: `Railway` and `railway` are different PostgreSQL names. Neither
retained manifests nor the available non-secret service metadata exposes that
URL's database component. Similar names, source DB fields, service branding and
successful past releases cannot independently prove the match. The owner
subsequently confirmed the exact setting; no additional configuration read is
needed for that name. **No installation is authorized.**

## Owner result and conservative retention list

[The sanitized screenshot transcription](OWNER_COMPARISON_RESULT.json) records the
owner Console result at **26 October 2026, 03:12:51 EDT** (fractional seconds
omitted). It confirms the case-sensitive maintenance name, actual cluster match,
current-reference name and both emergency OIDs. All 23 scoped owners are
`postgres`. No SQL was executed by Codex to obtain this result.

| Group | Owner-observed status | Required disposition |
| --- | --- | --- |
| Current prepare reference, run 40270052123/1 | Name present; retained prepare and active deployment receipt agree | Retain. |
| Second-newest verified prepare in matched evidence, run 40261837458/1 | Name present | Retain as part of the minimum two-newest policy. |
| Other 15 matched live names | Historical name associations established | Retain pending exact legacy identity/hold review and separately approved adoption. |
| Six unmatched live names | No match in the 35 retained prepare names | Retain as uncertain; do not infer origin from size, OID order or inactivity. |
| Emergency OIDs 106971 / 129180 | Both present; group membership not disclosed by summary | Always retain. This is an overlay, not two additional copies. |

Thus 17 + 6 = 23 live names and 17 + 18 = 35 historical names. The 18 names
not currently matched are **not proven deletions**. Original OIDs were never
captured in these manifests. No copy is cleanup-owned or registered; no batch is
authorized. All 23 remain protected and there is no reclaimable-space estimate.

`original_oid_captured=false`, `retirement_authorized=false` and
`eligible_copy_count=0` are deliberate comparison-summary constants; the query
never runs the retirement planner. Retirement is independently blocked by the
remaining adoption/authorization gates. Do not present those constants
as a successful eligibility or historical-integrity audit.

## Exact remaining owner attention

**Completed:** maintenance name, actual cluster equality, schema/role absence,
space/WAL observations, the safe 17-name association and current-reference
presence. Do not repeat the full Console survey for documentation.

1. Preserve the existing private inventory for the **six unmatched copies** and
   any existing creation/recovery/manual/emergency-purpose records. Missing data
   stays unknown/protected. Exact identities are not available in the safe summary.
   Existing private recovery-store reports/requests/object metadata or manual
   creation records may help associate a creator; they do not automatically
   replace a missing verified manifest or original-OID evidence. The available
   connector has no SQL/object-list/report-read channel, and the worker intentionally
   receives no bucket credentials. Do not obtain/broaden credentials, reuse expired
   grants or run a release merely to investigate. Blind name/size/OID guessing
   cannot establish provenance.
2. Review external pins, pending rollback/manual recovery needs and any legacy
   rename/replacement/reuse evidence before considering individual adoption.
   The 17 name associations do not establish immutable historical OIDs. A separate
   reviewed read-only content comparison may help when lifecycle evidence is
   insufficient; do **not** run `check-upgrade.mjs`, which applies migrations.
3. If the owner chooses to proceed later, give separate exact authorization for
   **empty metadata catalog installation** in confirmed `Railway` using the pinned
   SQL hashes and an existing privileged operator. No transfer, credential setup,
   activation or cleanup is implied. The six uncertain copies may remain excluded;
   they need not be adopted to install empty metadata tables.

Any later adoption/retirement additionally needs reviewed current identity,
external holds, two newest present verified copies, the full 24-hour hold starting
at server observation/import, native-ownership risk acceptance, the reviewed
private execution boundary and exact signed job/batch authorization. None is
silently supplied by this read-only result. No install/retire action is authorized.

## Runs without a listed artifact: independent step review

Read-only job metadata was available for all **16** such runs. Prepare steps:
13 failed, one was cancelled, one succeeded, and one was not identified because
the release job was skipped. These are controller step outcomes, not proof that
no database was created or that a failed worker's copy is safe to remove.

Notably [39339826564/1](https://github.com/catillatio/test/actions/runs/39339826564/attempts/1)
completed its prepare step, then **failed the encrypted artifact-retention gate**;
independent retained-artifact verification and promotion were skipped. No retained
artifact is currently listed. It cannot be certified from the successful prepare
step alone, and may require existing private recovery-storage evidence if linked
to an uncertain copy. The reason no artifact is listed is not inferred.

[Machine-readable evidence index with exact artifact IDs/archive hashes](RETAINED_RELEASE_EVIDENCE.json)
contains the same sanitized source facts; it is not a live inventory or approval.

## Sanitized per-attempt evidence index

Every row below has a checksum-verified retained archive and a validated prepare
report. `Post` means a passed retained deployment receipt, not a live-OID match.
Owner name association is marked below; **all rows remain protected**, with no
original-OID attestation or retirement permission. The
linked run may show a later attempt; the listed attempt is the manifest's exact
origin. The extra 16 runs without artifacts stay unresolved; absence of a listed
artifact is not evidence that no partial/failed database remains.

| Run | Manifest attempt | Commit | Exact attempt result | Promotion step | Post | Owner live-name match |
| --- | ---: | --- | --- | --- | --- | --- |
| [40270052123](https://github.com/catillatio/test/actions/runs/40270052123/attempts/1) | 1 | `d48ab91d` | success | success | yes | yes |
| [40261837458](https://github.com/catillatio/test/actions/runs/40261837458/attempts/1) | 1 | `dd584134` | success | success | yes | yes |
| [40257245783](https://github.com/catillatio/test/actions/runs/40257245783/attempts/1) | 1 | `76d7b0b1` | success | success | yes | yes |
| [40253862750](https://github.com/catillatio/test/actions/runs/40253862750/attempts/1) | 1 | `3cb82aed` | success | success | yes | yes |
| [40245425491](https://github.com/catillatio/test/actions/runs/40245425491/attempts/1) | 1 | `67ba6680` | success | success | yes | yes |
| [40240417370](https://github.com/catillatio/test/actions/runs/40240417370/attempts/1) | 1 | `9b9a0817` | success | success | yes | yes |
| [40236713862](https://github.com/catillatio/test/actions/runs/40236713862/attempts/1) | 1 | `094c3c9e` | success | success | yes | yes |
| [40164983897](https://github.com/catillatio/test/actions/runs/40164983897/attempts/1) | 1 | `4b82971d` | cancelled | cancelled | yes | yes |
| [40164678377](https://github.com/catillatio/test/actions/runs/40164678377/attempts/1) | 1 | `4b82971d` | success | skipped | no | yes |
| [40162401278](https://github.com/catillatio/test/actions/runs/40162401278/attempts/1) | 1 | `4b82971d` | success | success | yes | yes |
| [40154962981](https://github.com/catillatio/test/actions/runs/40154962981/attempts/1) | 1 | `e61258c0` | success | success | yes | yes |
| [40132727953](https://github.com/catillatio/test/actions/runs/40132727953/attempts/1) | 1 | `36367d34` | success | success | yes | yes |
| [40117614971](https://github.com/catillatio/test/actions/runs/40117614971/attempts/1) | 1 | `27c64b9d` | success | success | yes | not currently matched |
| [40073780386](https://github.com/catillatio/test/actions/runs/40073780386/attempts/1) | 1 | `7cf9a3a4` | success | success | yes | not currently matched |
| [40057878928](https://github.com/catillatio/test/actions/runs/40057878928/attempts/1) | 1 | `710df05d` | success | success | yes | yes |
| [40056021626](https://github.com/catillatio/test/actions/runs/40056021626/attempts/1) | 1 | `304b1c8c` | failure | failure | no | not currently matched |
| [40053999331](https://github.com/catillatio/test/actions/runs/40053999331/attempts/1) | 1 | `304b1c8c` | failure | failure | no | not currently matched |
| [40052246466](https://github.com/catillatio/test/actions/runs/40052246466/attempts/1) | 1 | `2470d7b7` | failure | failure | no | yes |
| [40051712590](https://github.com/catillatio/test/actions/runs/40051712590/attempts/1) | 1 | `2470d7b7` | failure | failure | no | not currently matched |
| [40050472346](https://github.com/catillatio/test/actions/runs/40050472346/attempts/1) | 1 | `2470d7b7` | failure | failure | no | not currently matched |
| [40049209822](https://github.com/catillatio/test/actions/runs/40049209822/attempts/1) | 1 | `2470d7b7` | failure | failure | no | not currently matched |
| [40048297250](https://github.com/catillatio/test/actions/runs/40048297250/attempts/1) | 1 | `2470d7b7` | failure | failure | no | not currently matched |
| [40034412416](https://github.com/catillatio/test/actions/runs/40034412416/attempts/1) | 1 | `da8e2aef` | success | success | yes | not currently matched |
| [40021306091](https://github.com/catillatio/test/actions/runs/40021306091/attempts/1) | 1 | `2e05e1c1` | success | success | yes | not currently matched |
| [39897943493](https://github.com/catillatio/test/actions/runs/39897943493/attempts/1) | 1 | `e7f54934` | success | success | yes | not currently matched |
| [39895042903](https://github.com/catillatio/test/actions/runs/39895042903/attempts/1) | 1 | `e7f54934` | failure | failure | no | not currently matched |
| [39893379497](https://github.com/catillatio/test/actions/runs/39893379497/attempts/1) | 1 | `e7f54934` | success | success | yes | not currently matched |
| [39891244969](https://github.com/catillatio/test/actions/runs/39891244969/attempts/1) | 1 | `e7f54934` | success | success | yes | not currently matched |
| [39890271419](https://github.com/catillatio/test/actions/runs/39890271419/attempts/1) | 1 | `e7f54934` | success | skipped | no | yes |
| [39536348303](https://github.com/catillatio/test/actions/runs/39536348303/attempts/1) | 1 | `127a6849` | success | success | yes | yes |
| [39518120689](https://github.com/catillatio/test/actions/runs/39518120689/attempts/1) | 1 | `793f747a` | success | success | yes | not currently matched |
| [39461055861](https://github.com/catillatio/test/actions/runs/39461055861/attempts/1) | 1 | `b305fa01` | success | success | yes | not currently matched |
| [39353372794](https://github.com/catillatio/test/actions/runs/39353372794/attempts/1) | 1 | `cf4a99d3` | success | success | yes | yes |
| [39350735093](https://github.com/catillatio/test/actions/runs/39350735093/attempts/1) | 1 | `cf4a99d3` | failure | failure | no | not currently matched |
| [39343986160](https://github.com/catillatio/test/actions/runs/39343986160/attempts/1) | 1 | `cf4a99d3` | success | skipped | no | not currently matched |

Run `39895042903` illustrates why attempt matching matters: its artifact belongs
to **attempt 1 (failure)**, while the latest run status describes **attempt 2
(cancelled)**. These must not be combined into one supposed verification event.

The 16 runs with no listed retained artifact are:

[`40066168361`](https://github.com/catillatio/test/actions/runs/40066168361), [`40013991024`](https://github.com/catillatio/test/actions/runs/40013991024), [`40012254303`](https://github.com/catillatio/test/actions/runs/40012254303), [`40009933853`](https://github.com/catillatio/test/actions/runs/40009933853), [`40008285239`](https://github.com/catillatio/test/actions/runs/40008285239), [`39884323789`](https://github.com/catillatio/test/actions/runs/39884323789), [`39880006786`](https://github.com/catillatio/test/actions/runs/39880006786), [`39874021235`](https://github.com/catillatio/test/actions/runs/39874021235), [`39647183726`](https://github.com/catillatio/test/actions/runs/39647183726), [`39339826564`](https://github.com/catillatio/test/actions/runs/39339826564), [`39337788717`](https://github.com/catillatio/test/actions/runs/39337788717), [`39329878639`](https://github.com/catillatio/test/actions/runs/39329878639), [`39308121408`](https://github.com/catillatio/test/actions/runs/39308121408), [`39190333661`](https://github.com/catillatio/test/actions/runs/39190333661), [`39188854918`](https://github.com/catillatio/test/actions/runs/39188854918), [`39188631974`](https://github.com/catillatio/test/actions/runs/39188631974).
