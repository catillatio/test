# Preservation and storage gates

## Ordinary installation

Migration 025 adds four empty cohort/member/publication/autonomy audit tables and
writer fences. It does not seed, credit, grant, publish, activate or change an old
business row. Ruleset registration is additive. Existing human XP, levels, skill
points, wallets, Vault, lots, historical acquisition prices, Land rates, sessions,
relationships, battle receipts, achievements and original 450 bots are retained.

The populated test takes a complete row snapshot before migration and compares
all existing business rows after upgrade, replay, concurrent append and restart.
It tests wrong target/OID, capital mismatch, ID collision, interrupted transaction,
duplicate workers, immutable provenance and incompatible-writer rejection.
New identities are appended in one exclusive transaction; no upsert repairs old
accounts. Exact old UUID/account/population-key identities are recorded before
append. Legitimate subsequent bot name/level/financial changes are not reset.

`independent-restore.json` records a disposable PostgreSQL 18 source, a completely
fresh second cluster, custom archive validation, restore, complete row equality,
replayed migrations, retained session and exact 900 identities. The latest local
run measured approximately 25.5 MB source, 1.81 MB archive, 397 ms dump, 510 ms restore
and 15.9 seconds append while other local checks were running. These are fixture
measurements, **not a production SLA or volume-capacity test**.

The existing container verification also exercises actual age encryption, HTTPS
export/download, independent decryption/restore, signed pre-deploy preservation
and exact post-deployment checks, with an added exact 900 fixture. It contacts
only disposable test containers. Source access remains read-only.

## Strict release compatibility

Post-deploy schema is pinned literally to `025_level100_population.sql`; 024,
unexpected future versions, missing schema, wrong commit, invalid counts and
failed restoration remain rejected. A normal realm still requires exactly 450
bots. Exactly 900 requires the known immutable manifest digest, original identity
digest, exact added identity/account/key/member mappings, disabled bot logins,
all-or-none publication and matching source/restored evidence. There is no range
acceptance, arbitrary population override or substitute for encrypted recovery.

No `run.mjs`, release workflow, provider credential, signing/proof protocol,
retention integration or approval gate was changed. Independent restoration still
compares all existing business rows. Research scripts and source originals stay
outside the bounded production source upload; runtime art and rulesets are included.

The database fence prevents an older incompatible binary writing after population
append. It is not a privilege boundary against a database owner/superuser: such a
principal can change functions, disable triggers or fabricate rows/GUCs. The
private operator uses the existing trusted owner Console; this is not the paused
PR #13 restricted-role administration system or a new public service.

## Storage is an unresolved launch blocker

Historical owner measurements reported a 5 GB KingdomReleaseCopy volume with
approximately 2.33 GB used, 16 retained copies consuming about 1.65 GB and 288 MB
WAL. These are historical facts supplied by the owner, **not current telemetry**.
No live inventory, deletion, retention adoption or infrastructure change was made.

The 30-day financial isolation projects 8,493,608 new-cohort Land journal rows.
Adding the existing cohort's approximately 2.59M/month baseline gives roughly
11.1M/month before other history. A local 8,208-row journal occupied about 1.30 MB
including indexes (~159 bytes/row): a rough **1.8 GB/month** combined journal
estimate. Production row distribution, bloat, WAL, backup compression, indexes,
duel history and retained restored copies can make actual requirements larger.
Current filters improve purchase usefulness but do **not** reduce journal growth.

The existing worker checks its temporary filesystem against dump/restore needs.
That does not certify free space on the separate PostgreSQL persistent volume.
Do not treat a small successful synthetic archive as approval for a 900-bot launch.

Before population/autonomy, the owner must obtain a fresh read-only inventory via
the existing authenticated private Console: database names/OIDs/owners/sizes,
active connections, WAL size where authorized, current active recovery references,
and Railway's actual volume free/used capacity. Budget the complete source dump,
an additional restored copy, WAL and migration headroom, plus projected growth.
Retained copies require exact release/recovery/OID reconciliation before any
separately authorized cleanup. PR #25 remains untouched and cleanup remains off.
If headroom is insufficient, stop for separately approved storage/retention work;
do not delete unknown copies, truncate history, shrink backups or skip restore.

## Recovery and operational limits

New-cohort scheduling has separate bounded five-actor lanes per work type. Missed
purchase/duel opportunities are not replayed. Existing hourly settlement catches
up: the 900-actor/24-hour fixture uses two 450-actor sweeps, then zero; a repeated
run pays nothing. Three-worker race tests prove exactly-once receipts; the model's
duplicate-invocation counts are workload projections, not an extra income mechanism.

After registration, do not deploy a 450-only binary. After human cutover, do not
switch back to legacy XP or remove progression epochs. Pause only the new cohort
through a fresh exact autonomy plan; this stops its purchases and initiated duels,
not existing Land/upkeep settlement, defense or the original 450's behavior.
Retain the database and forward-fix using a compatible binary. Disaster restoration
is a separate owner-authorized maintenance operation using the latest independently
verified encrypted backup, with explicit acknowledgement of any later lost writes.
There is no routine automatic data rollback or bot deletion.
