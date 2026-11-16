# Authenticated request latency — local correction, 2026-11-16

## Source and limits of the conclusion

Repository `catillatio/test`; baseline `dbdd96e1b78f2416044554d8328ca1815a192adb`,
branch `performance/achievement-sync-20261116`. The deployed game was
`59f6f75ebc832f3ba421ee5e15cf73d9331fe309`, Railway deployment
`2520649d-7b52-4841-b853-8eb7cefa5165`, image
`sha256:6abf8df9e81a5c857cde30ea020ba7b006ca4939160f8c49fe1090495d71613b`.
The achievement, experience and shared game modules are byte-identical between
that deployed source and this baseline. The newer release branch's bounty work
is preserved. This correction has **not** been pushed or deployed.

Authenticated Railway log reads reproduced the reported issue during
10:34–10:40 UTC: attack POSTs 2,333–2,589 ms, quest POSTs 2,354–2,465 ms,
Battle GETs 1,324–1,428 ms, saved reports 1,239–1,505 ms and one Profile GET
4,797 ms. `/api/v1/me` was 152 ms; static assets were 0.37–2.04 ms and health
0.99–14.17 ms. There were no errors in this bounded sample. A later read through
11:07:54 found health traffic only; it does not establish later authenticated
response times. No live gameplay request was generated to produce these samples.

Provider CPU/memory aggregates did not demonstrate app/DB resource exhaustion.
They do not establish PostgreSQL query time, lock waits or the application's
live pool queue. The connector cannot execute SQL or expose live pool counters.
The single bounded [read-only Console packet](READ_ONLY_APP_DB_PROFILE.sh)
has been prepared for the outstanding live SQL/catalog/connection measurements;
its production result is **pending**. Therefore the entire live 1.3–4.8 second
delay is not yet causally attributed. In particular, the slow Profile outlier
could include lock queuing or other work. Do not present local timings below as
post-deployment measurements or claim proven live pool exhaustion.

## Measured defect and smallest correction

`experienceView` synchronizes earned achievements and payouts on authenticated
rendering. Commands synchronize before and after execution; a human-versus-human
attack also synchronizes its defender before/after. Reconciliation ran one
journal-totals query **for every saved receipt**, under the existing character
lock. Each query scanned `treasury_retained_events` for character/command/reason;
this table had only its primary-key index. The scan is necessary even when the
expected retained amount is zero. As unrelated history grows, every receipt
repeats this work. Eligibility and payout processing themselves were not removed.

In an isolated PostgreSQL 18.4 fixture with 250,000 unrelated retained events and
250,000 unrelated wallet transactions/entries, the old retained branch scanned
the historical table while the wallet branch already used its indexes. A local
`EXPLAIN (ANALYZE, BUFFERS)` showed an approximately 14 ms retained aggregate
against a 0.07 ms wallet aggregate; the complete old query took 15.91 ms and
touched 3,656 shared blocks. With the partial index the same old query took
0.078 ms and touched 86 blocks. These are warm local measurements, not live SQL.

The correction is deliberately narrow:

- Batch journal verification into one query after loading the receipts. Aggregate
  wallet and retained rows independently, then compare **each command/receipt**
  using exact `BigInt` values. Do not join raw journals, sum character-wide totals,
  skip reconciliation, cache success or repair invalid history.
- Add index-only migration `055_achievement_gold_lookup.sql`, keyed by character
  and command, restricted to `reason='achievement_gold'`. No extra transaction
  index was justified by the measured wallet plan.
- Advance exact schema expectations to 055. Preserve the release worker's privacy
  checks on later heads by testing that migration 054 is installed, instead of
  comparing the maximum migration name with 054. Otherwise adding 055 would
  accidentally skip the erasure/world-history guards. Tests fail closed for both.

No award schedule, policy ID, eligibility, payout insertion, wallet/treasury
handling, NPC exclusion, locking, transaction boundary or idempotency changes.
There is no background job, payout activation, feature toggle or frontend change.
Full history is aggregated in PostgreSQL rather than loaded into Node memory.

## Equivalent local requests

Both runs used clones of the same pristine 054 template, three synthetic humans,
level 75 attacker/defender, real HTTP handlers, sessions/CSRF, three repeated
samples per operation and identical deterministic rolls in the benchmark process
only. Only the candidate clone was migrated to 055. Resource resets happened
outside the timed command. Runs were sequential, on the same local server/pool
settings, with no artificial network delay. Ordinary route queries, BEGIN/COMMIT
and SQL checks are included in query counts. Medians are descriptive, not an SLA.

| Operation | Before ms | After ms | SQL calls before → after |
| --- | ---: | ---: | --- |
| Receipt reconciliation, six existing receipts | 123.7 | 3.1 | 7 → 2 |
| GET `/api/v1/me` (control) | 29.8 | 27.4 | 50 → 50 |
| Home | 171.1 | 57.1 | 104 → 99 |
| Battle | 167.2 | 43.1 | 112 → 107 |
| Quests | 197.8 | 114.4 | 92 → 87 |
| Profile | 157.9 | 34.4 | 98 → 93 |
| Armory | 169.0 | 55.2 | 92 → 87 |
| Quest POST | 289.2 | 59.3 | 114 → 104 |
| Quest result | 192.4 | 79.0 | 93 → 88 |
| Human attack POST | 545.5 | 78.3 | 208/206/206 → 190/186/186 |
| Attack result | 178.3 | 58.0 | 141 → 135 |

Receipt queries accounted for about 106 ms of the baseline Home request and
445 ms of the baseline human attack. Pool acquisition was below 0.35 ms in these
serial runs, with no observed queue: this does **not** validate production pool
pressure under concurrency. Existing concurrent payout tests separately verify
once-only correctness. The control endpoint is essentially unchanged.

Both matched runs ended with exactly seven attacker receipts, 164,000 Gold
awarded and wallet balance 228,212. These are synthetic balances, not player data.
The six-receipt baseline earns another achievement during the command samples.
The index-only measurement retained the old function and seven queries: median
5.57 ms. This separates the index benefit from the smaller round-trip reduction
due to batching. Its full local migration took 440 ms; an empty partial index
occupied 8,192 bytes. Production index size/build duration remain unmeasured.

The review bundle contains the authoritative `before-equivalent.json`,
`after-equivalent.json` and `index-only-verified.json`. Earlier exploratory runs
with different random rolls or overlapping clone setup are **not** used in these
comparisons. The fixture session file and unsanitized production logs are not
included. A manifest binds the final production-source file hashes to the runs.

Reproduction entrypoint: `scripts/performance/request-latency.ts`. It refuses
non-loopback or non-`*_test` database URLs and non-`/dev/shm` output paths.
`seed` creates the synthetic 054 template; `measure` exercises the real app.
Run the baseline achievement module in an isolated baseline copy, then the
candidate module in a separate clone after `migrate()`. Never seed twice into
the same database or run two measurements/clone replacements concurrently.
The deterministic roll adapter is not emitted by the application build.

## Local verification and release scope

- Typecheck, application build, static checks: passing (101 static checks and
  79 production EJS fixture cases).
- 31 focused PostgreSQL tests: passing, including 14 new reconciliation/index
  regressions, concurrent/replay/rollback/overflow cases, NPC exclusion and exact
  populated 052/054 upgrade/replay preservation through 055.
- 128 release protocol/worker/failure tests: passing, including new guards that
  retain privacy-history protection when schema 055 is installed.
- No hosted CI, Docker image/recovery run or production upgrade was executed.
  Focused local tests are not a replacement for those required release gates.

The new index is a normal transactional `CREATE INDEX`, matching the migration
runner. It reads the retained journal once and can temporarily block its writers.
Use the pending production catalog measurements to assess build/lock exposure;
the local 440 ms result is not a production guarantee. Protected independent
restore/migration/replay/preservation verification remains mandatory. Nothing
changes the checker deadline or bypasses the outstanding recovery-snapshot
failure in run `43831109552`.

The independent security branch at `6c96115a42336573737edaa925e96b327354c929`
and recovery-investigation branch at `96b6759c4cb3e15028db26533a3e4b5197862565`
were preserved clean. A disposable-index three-way check found the security
runtime hunks compatible; both branches append different cases at the end of
`tests/release-worker-substages.test.mjs`, producing one textual conflict.
Integrating them must retain **both** new test blocks. No integration merge was
performed. Migration 055 creates no SQL capabilities and must not discard the
security branch's ACL assertions. Bounty and matchmaking source are unchanged.

Deployment requires owner-authorized exact-head CI, review/merge and a newly
prepared immutable image for this source. Existing image preparations cannot
deploy a different source. Revalidate independent recovery before promotion.
For application rollback, revert the batching implementation while retaining
migration 055/index and schema-aware release checks; do not delete migration
history or run an old validator that only accepts 054.

No production records/settings, feature states, Railway services, PR #88 or
other applications were modified. The next technical evidence needed is the
already prepared single read-only production packet, not another broad audit.
