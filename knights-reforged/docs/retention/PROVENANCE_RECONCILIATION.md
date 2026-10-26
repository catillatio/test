# Retained release evidence reconciliation — read-only

This is a historical evidence index, **not a production retirement plan**. No
production database connection, write, installation, ownership change, deletion,
feature enablement, release dispatch or deployment was performed for this work.
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
  digest. The owner's Console digest value has not been supplied for comparison.
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
- Current live database names/OIDs/owners have not been joined to these historical
  names: only the aggregate owner inventory was supplied. A private working
  worksheet has been prepared with exact historical names and blank live-identity
  fields. Private database identifiers, service IDs, hosts, cluster fingerprints,
  backup keys, URLs, proofs and credentials are excluded from this published index.

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
recovery reference selected by that protected deployment. Keep it protected and
match its exact private name to the owner's live inventory; no live OID is inferred.
The original signed production proof is not fetched/revalidated as a new approval.
These matches do not certify the absence of external owner holds/manual recovery
work or authorize reusing historical release evidence for cleanup.

A `verify` job generates a separate nonce/copy alias but creates **no** restored
database. Do not use `post-deploy.privateStatus.copy` as the prepare recovery
reference or count it as another retained database.

## Is `Railway` the correct maintenance database?

**Unconfirmed.** The owner confirmed the exact result of `current_database()` is
`Railway` (capital R), PostgreSQL 18.6, current user `postgres`. Neither retention
schema nor any of the five expected roles exists in that inspected database/
cluster. Those fresh-install preconditions are now owner-observed, but the
worker-maintenance target match remains a required gate.

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
successful past releases cannot prove the match. **Do not install in `Railway`
until the exact worker setting is independently confirmed.**

## Minimal evidence still requiring the owner

1. In the **existing worker service's** private configuration view, confirm only
   the decoded database component of its existing `KINGDOM_RESTORE_DATABASE_URL`
   equals **`Railway`** exactly. If it is a service-variable reference, follow its
   existing reference to the copy service's DB-name setting privately. Do not
   share the URL/password, edit variables, start/redeploy the worker or substitute
   the game service's setting. An already available trusted worker Console could
   print only the database name, but no new execution access is needed/authorized.
2. Privately compare the Console's already-obtained cluster digest to
   `report.restoreClusterDigest` in the latest retained prepare manifest. All 35
   reported historical restore digests agree with one another; equality to the
   actual inspected cluster remains unconfirmed. Do not repeat SQL solely to
   obtain a digest already retained, or publish it with the inventory.
3. Make the existing private name/OID/owner/size inventory available through the
   agreed private owner channel, or perform its join against the retained
   manifests privately. Refresh only when later action freshness requires it.
   Name equality associates a historical job; it does **not** prove an unchanged
   original OID. Resolve legacy replacement/rename/reuse uncertainty through
   owner-reviewed lifecycle evidence before any future adoption. Do not invent
   historical OIDs or backdate records. A separate reviewed read-only content
   comparison may help if lifecycle evidence is insufficient; do **not** invoke
   `check-upgrade.mjs` for that purpose because it runs migrations.
4. Confirm external pins, pending recovery/rollback needs and manual work not
   represented by GitHub/service metadata. Keep these in the private hold list.
   The two newest **present and verified** copies cannot be selected until the
   live inventory join is complete. Fresh imports start the full server-derived
   24-hour hold; historical manifest age cannot shorten it.

Target confirmation and private cluster comparison (items 1–2), fresh-install
preconditions and separate owner authorization gate an **empty metadata catalog**
installation. The live identity join and hold review (items 3–4) are additional
gates before any ownership adoption/retirement, not implicit consequences of
installing empty tables. Neither stage is authorized here.

No new WAL/schema/role queries are needed solely to repeat the supplied findings.
The owner's observed **960 MB WAL and 11 GiB available** are recorded in the
[readiness assessment](READINESS.md). Refresh space and lifecycle evidence before
any future operation; no capacity or observation finding authorizes installation.
The prepared [fresh-install procedure](OWNER_INVENTORY_FOLLOWUP.md) remains
**unexecuted and blocked on exact target confirmation and separate owner approval**.

[Machine-readable evidence index with exact artifact IDs/archive hashes](RETAINED_RELEASE_EVIDENCE.json)
contains the same sanitized source facts; it is not a live inventory or approval.

## Sanitized per-attempt evidence index

Every row below has a checksum-verified retained archive and a validated prepare
report. `Post` means a passed retained deployment receipt, not a live-OID match.
All rows remain **unreconciled/protected**, with no retirement permission. The
linked run may show a later attempt; the listed attempt is the manifest's exact
origin. The extra 16 runs without artifacts stay unresolved; absence of a listed
artifact is not evidence that no partial/failed database remains.

| Run | Manifest attempt | Commit | Exact attempt result | Promotion step | Post |
| --- | ---: | --- | --- | --- | --- |
| [40270052123](https://github.com/catillatio/test/actions/runs/40270052123/attempts/1) | 1 | `d48ab91d` | success | success | yes |
| [40261837458](https://github.com/catillatio/test/actions/runs/40261837458/attempts/1) | 1 | `dd584134` | success | success | yes |
| [40257245783](https://github.com/catillatio/test/actions/runs/40257245783/attempts/1) | 1 | `76d7b0b1` | success | success | yes |
| [40253862750](https://github.com/catillatio/test/actions/runs/40253862750/attempts/1) | 1 | `3cb82aed` | success | success | yes |
| [40245425491](https://github.com/catillatio/test/actions/runs/40245425491/attempts/1) | 1 | `67ba6680` | success | success | yes |
| [40240417370](https://github.com/catillatio/test/actions/runs/40240417370/attempts/1) | 1 | `9b9a0817` | success | success | yes |
| [40236713862](https://github.com/catillatio/test/actions/runs/40236713862/attempts/1) | 1 | `094c3c9e` | success | success | yes |
| [40164983897](https://github.com/catillatio/test/actions/runs/40164983897/attempts/1) | 1 | `4b82971d` | cancelled | cancelled | yes |
| [40164678377](https://github.com/catillatio/test/actions/runs/40164678377/attempts/1) | 1 | `4b82971d` | success | skipped | no |
| [40162401278](https://github.com/catillatio/test/actions/runs/40162401278/attempts/1) | 1 | `4b82971d` | success | success | yes |
| [40154962981](https://github.com/catillatio/test/actions/runs/40154962981/attempts/1) | 1 | `e61258c0` | success | success | yes |
| [40132727953](https://github.com/catillatio/test/actions/runs/40132727953/attempts/1) | 1 | `36367d34` | success | success | yes |
| [40117614971](https://github.com/catillatio/test/actions/runs/40117614971/attempts/1) | 1 | `27c64b9d` | success | success | yes |
| [40073780386](https://github.com/catillatio/test/actions/runs/40073780386/attempts/1) | 1 | `7cf9a3a4` | success | success | yes |
| [40057878928](https://github.com/catillatio/test/actions/runs/40057878928/attempts/1) | 1 | `710df05d` | success | success | yes |
| [40056021626](https://github.com/catillatio/test/actions/runs/40056021626/attempts/1) | 1 | `304b1c8c` | failure | failure | no |
| [40053999331](https://github.com/catillatio/test/actions/runs/40053999331/attempts/1) | 1 | `304b1c8c` | failure | failure | no |
| [40052246466](https://github.com/catillatio/test/actions/runs/40052246466/attempts/1) | 1 | `2470d7b7` | failure | failure | no |
| [40051712590](https://github.com/catillatio/test/actions/runs/40051712590/attempts/1) | 1 | `2470d7b7` | failure | failure | no |
| [40050472346](https://github.com/catillatio/test/actions/runs/40050472346/attempts/1) | 1 | `2470d7b7` | failure | failure | no |
| [40049209822](https://github.com/catillatio/test/actions/runs/40049209822/attempts/1) | 1 | `2470d7b7` | failure | failure | no |
| [40048297250](https://github.com/catillatio/test/actions/runs/40048297250/attempts/1) | 1 | `2470d7b7` | failure | failure | no |
| [40034412416](https://github.com/catillatio/test/actions/runs/40034412416/attempts/1) | 1 | `da8e2aef` | success | success | yes |
| [40021306091](https://github.com/catillatio/test/actions/runs/40021306091/attempts/1) | 1 | `2e05e1c1` | success | success | yes |
| [39897943493](https://github.com/catillatio/test/actions/runs/39897943493/attempts/1) | 1 | `e7f54934` | success | success | yes |
| [39895042903](https://github.com/catillatio/test/actions/runs/39895042903/attempts/1) | 1 | `e7f54934` | failure | failure | no |
| [39893379497](https://github.com/catillatio/test/actions/runs/39893379497/attempts/1) | 1 | `e7f54934` | success | success | yes |
| [39891244969](https://github.com/catillatio/test/actions/runs/39891244969/attempts/1) | 1 | `e7f54934` | success | success | yes |
| [39890271419](https://github.com/catillatio/test/actions/runs/39890271419/attempts/1) | 1 | `e7f54934` | success | skipped | no |
| [39536348303](https://github.com/catillatio/test/actions/runs/39536348303/attempts/1) | 1 | `127a6849` | success | success | yes |
| [39518120689](https://github.com/catillatio/test/actions/runs/39518120689/attempts/1) | 1 | `793f747a` | success | success | yes |
| [39461055861](https://github.com/catillatio/test/actions/runs/39461055861/attempts/1) | 1 | `b305fa01` | success | success | yes |
| [39353372794](https://github.com/catillatio/test/actions/runs/39353372794/attempts/1) | 1 | `cf4a99d3` | success | success | yes |
| [39350735093](https://github.com/catillatio/test/actions/runs/39350735093/attempts/1) | 1 | `cf4a99d3` | failure | failure | no |
| [39343986160](https://github.com/catillatio/test/actions/runs/39343986160/attempts/1) | 1 | `cf4a99d3` | success | skipped | no |

Run `39895042903` illustrates why attempt matching matters: its artifact belongs
to **attempt 1 (failure)**, while the latest run status describes **attempt 2
(cancelled)**. These must not be combined into one supposed verification event.

The 16 runs with no listed retained artifact are:

[`40066168361`](https://github.com/catillatio/test/actions/runs/40066168361), [`40013991024`](https://github.com/catillatio/test/actions/runs/40013991024), [`40012254303`](https://github.com/catillatio/test/actions/runs/40012254303), [`40009933853`](https://github.com/catillatio/test/actions/runs/40009933853), [`40008285239`](https://github.com/catillatio/test/actions/runs/40008285239), [`39884323789`](https://github.com/catillatio/test/actions/runs/39884323789), [`39880006786`](https://github.com/catillatio/test/actions/runs/39880006786), [`39874021235`](https://github.com/catillatio/test/actions/runs/39874021235), [`39647183726`](https://github.com/catillatio/test/actions/runs/39647183726), [`39339826564`](https://github.com/catillatio/test/actions/runs/39339826564), [`39337788717`](https://github.com/catillatio/test/actions/runs/39337788717), [`39329878639`](https://github.com/catillatio/test/actions/runs/39329878639), [`39308121408`](https://github.com/catillatio/test/actions/runs/39308121408), [`39190333661`](https://github.com/catillatio/test/actions/runs/39190333661), [`39188854918`](https://github.com/catillatio/test/actions/runs/39188854918), [`39188631974`](https://github.com/catillatio/test/actions/runs/39188631974).
