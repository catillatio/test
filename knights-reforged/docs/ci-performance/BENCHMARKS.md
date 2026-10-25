# Measurements and limits

Sources: [baseline-runs.json](baseline-runs.json), read-only successful GitHub run
metadata; [local-benchmarks.json](local-benchmarks.json), reproducible local test
measurements. Final hosted exact-head CI, per-file timings, populated preservation,
browser and encrypted recovery evidence are linked in the draft PR. No production
release was dispatched to obtain a benchmark.

## Historical hosted baseline

Four successful check runs: 40238730053, 40237300498, 40234663784, 40232610740.
Initial run queue was 0s in all four. This does not imply all future queues are zero.
Median elapsed execution was **21m58.5s**, slowest **25m07s** (range15m23s–25m07s).

| Stage | Median | Slowest |
|---|---:|---:|
| PostgreSQL service startup | 16.5s | 21s |
| Game npm install | 2.5s | 3s |
| Recovery SDK install | 1.5s | 2s |
| Typecheck + compile + static validation | 9.5s | 11s |
| Serial `npm test` (unit + DB + browser files) | **18m24.5s** | **21m35s** |
| Standalone Phase 4.7 browser | 32.5s | 37s |
| Game image build | 14s | 16s |
| Game container regression | 32.5s | 35s |
| Recovery image build | 10.5s | 12s |
| Real encrypted recovery/container rehearsal | 43s | 46s |

The old single `npm test` step did not expose separate unit/DB/browser times in
Actions metadata. It would be misleading to invent them. Isolated local same-file
trials below supply that comparison. Checkout, audit and upload step timings are
retained verbatim in the source JSON. Installation is small compared with serial
regression; caching alone cannot solve the bottleneck.

Protected-release history: 40236713862, 40164678377, 40162401278, 40154962981.
Run40164678377 was backup-only, not a full promotion. Across the three full
promotions, release-job execution was 480s/630s/671s (median630s). Owner approval
and scheduling gaps are outside job execution; e.g. run40236713862 elapsed1362s
but its safety/release jobs used25s/630s. Those gaps are not backup computation.

The most recent full run recorded289s for private backup + isolated restored-copy
verification + independent export;16s for retained artifact download/verification;
255s for promotion + exact deployment + post-deployment preservation. Worker
startup, dump, encryption, restoration/replay and Railway build are nested within
those aggregate steps, so separate live durations are **unavailable**, not zero.

## Local before/after (same machine and files)

Synthetic local PostgreSQL18.4, Node24.19, two-CPU quota, tmpfs. No production
records or credentials. `bash scripts/ci/benchmark.sh` reproduces the workload.

| Metric | Before | After | Improvement / limitation |
|---|---:|---:|---|
| Six database files, median of two trials | 26.498s at1worker | **16.727s at2workers** | **36.9%** |
| Same six files at4workers | — | 23.138s median | Slower than2; rejected as default |
| 42-file unit sample | 43.029s at1worker | **31.716s at2workers** | **26.3%**, one trial each |
| Artwork profile, real browsers + integrity | No old scoped profile | **252.223s local** | All14 files passed; local single browser, not hosted two-shard CI |
| UI profile, real browsers + security/transactions | No old scoped profile | **431.625s local** | All34 files/125 TAP tests plus standalone browser passed; hosted profile has two separate browser runners |
| Full hosted CI | 21m58.5s median /25m07s slowest | Exact final run linked in PR | Calculate from actual hosted run; no synthetic timing claim |
| Protected production release | 630s median full release job | **Unverified** | Recovery unchanged; no protected dispatch permitted |

The database sample includes equipment presentation, rotation, migration,
Phase4.4 migration, training and Railway origin/security. Both repeated trials
passed at1/2/4workers. File durations and counts are preserved in JSON.
The local unit sample predates moving release-transport's synthetic URL-only
checks into the unit lane; final CI includes that file too.

A first exploratory trial overlapped unit work and the900-bot fixture, causing an
existing10s lock timeout. That noisy failed trial is excluded from speedup
calculations and led to exclusive scheduling for heavyweight fixtures. We did not
increase production lock timeouts, weaken assertions or add automatic retries.
An independent run of that full900-bot fixture passed, as did cancellation cleanup.

The first split hosted run correctly failed closed because the isolated recovery
job no longer inherited a PostgreSQL image pull from the old shared service.
The correction explicitly pulls the same `postgres:18-bookworm` image before
container testing. The next rehearsal passed container checks and exposed the
harness's separate host SDK dependency. The final job explicitly installs that
SDK and downloads validation's same-run compiled candidate for fingerprint
comparison. No test, backup or restoration assertion was relaxed. The
complete corrected exact-head run is linked in the PR.

## Remaining limits

- Two-run database and single-run unit/profile samples do not establish a p95.
  Use retained per-file timings from subsequent ordinary CI runs for a larger sample.
- Browser work remains substantive: asset decode/crops,52 slots, historical/public
  profiles, receipts, AAC playback and four viewport sizes. It is not replaced by
  mocked screenshots. Hosted profiles split browser work across two jobs; local
  `npm test` deliberately caps it at one browser at a time.
- More jobs require more runner capacity. Report job queue delays separately; do
  not mistake account-level concurrency limits for application performance.
- Production merge pushes still run everything. Scoped PR feedback saves repeated
  revisions; it does not reuse evidence for a different merge SHA.
- Recovery/retention and signing behavior is unchanged. Further live dump/restore
  optimization needs separately approved evidence; no safe speed claim is made.
- Ordinary future artwork/UI can ship in one complete reviewed deployment using
  the existing compiled selection. Population/economy/XP/recovery cutovers retain
  justified staging. No historical activation evidence is rewritten.
