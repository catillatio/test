# Recovery snapshot performance correction

## Confirmed incident

Protected release [41146460943](https://github.com/catillatio/test/actions/runs/41146460943), based on PR #82 merge `563025246edb53ff31fada1373c08999c740d444`, failed at `copy-migrations-and-preservation`. Authenticated Railway logs for worker `a9d86591-88e6-4c6a-bbcc-6dea49b54f10` confirm `TIMEOUT`, elapsed 600171 ms, limit 600000 ms, SIGTERM. The game was not promoted.

The unchanged phase diagnostics establish:

| Phase completed | Elapsed since checker start |
| --- | ---: |
| Population validation | 225 ms |
| Snapshot before | 242028 ms |
| First migration | 242603 ms |
| Snapshot after | 504369 ms |
| Preservation comparison | 504371 ms |
| Migration replay | 505176 ms |
| Snapshot replay | Started; interrupted at deadline |

The two completed snapshots cost 241803 and 261765 ms. This is a confirmed checker deadline failure, not evidence of a migration SQL error or an independently established OOM. The earlier unexpected client EOF is consistent with termination; it is not necessary to infer a second cause.

## Small runtime change

Only `deployment/check-upgrade.mjs` changes in the release runtime. Every public base table remains covered in all three repeatable-read, read-only snapshots. Population validation, migrations, append-only registry checks, before/after equality, replay equality, backup, encryption, signatures, approvals and release locks remain in place.

The old query sorted complete JSON text, then transferred every full business row to Node for hashing. The new query uses an existing valid, ready, unique, non-null primary key for deterministic ordering when available. Composite key order is preserved and identifiers are quoted. Tables without such a key retain full-JSON sorting. The first ordering plan for each table is reused across migrations and replay, including when a key is added or replaced. New tables receive a plan on first appearance; missing baseline columns fail closed.

For business tables PostgreSQL computes its built-in `sha256(convert_to(row_to_json(t)::text,'UTF8'))` over **every byte of each complete row**. Node accepts only 32-byte binary digests, streams those in order into a domain-separated SHA-256 table digest, and retains the exact row count. Fetches remain bounded at 500 rows. No extension, schema change, database aggregate, sampling, key-only comparison, XOR or additive checksum is introduced. Duplicate rows still contribute individually.

This is an ordered, two-level cryptographic commitment. A changed row passing comparison would require an inner or outer SHA-256 collision, preserving the existing SHA-256 security assumption. The digest construction is explicitly separated by `kingdom-preservation-full-row-sha256-v1\0`; its bytes are not interchangeable with legacy table hashes. Reports are freshly generated and signed with the candidate code digest; they are not compared against table hashes from older releases. `rulesets` and `schema_migrations` retain actual JSON rows and their existing append-membership checks.

The existing candidate digest, upload whitelist and Dockerfile already bind and include this checker. No runtime helper or unbound executable is added. All PR #82 phase timings and failure classifications remain unchanged.

## Isolated measurement

See `SNAPSHOT_PERFORMANCE_EVIDENCE.json` for the final measured results and independently checked digests. The executable reproduction is `scripts/benchmark-upgrade-snapshot.mjs`.

The fixture uses PostgreSQL 18.6, two CPUs, a 2 GiB container limit, 4 MiB work_mem, randomly ordered synthetic UUID-keyed battle history with varied equipment JSON, and fresh Node child processes limited to 128 MiB old-space. Three interleaved passes measure each strategy. An additional audit streams the original full JSON rows and independently computes the new row commitments in Node; these must equal PostgreSQL's commitments. Actual cursor plans, rather than a potentially different plain-SELECT plan, are recorded.

Final measurement: **100000 rows, 620919965 serialized JSON bytes** (307675136 bytes stored including indexes/TOAST). Legacy median was **5937 ms**; key ordering alone was **5310 ms**; key ordering plus server row digests was **3905 ms**: **1.52× throughput, 34.2% shorter elapsed time**. Logical returned business payload fell to **3200000 digest bytes**; actual wire bytes also include bytea text encoding and protocol framing and were not measured. Peak process RSS was 229272–230676 KiB for legacy passes versus 71968–72788 KiB for digest passes. The entire 620.9 MB history was verified with the fixed 128 MiB old-space limit. The old cursor used Sort → Seq Scan; both primary-key variants used the existing `battles_pkey` Index Scan. All three server commitments matched the independently computed raw-row Node commitment exactly.

Primary-key ordering alone was deliberately measured rather than assumed sufficient. The final change includes server-side full-row hashing because ordering alone left substantial transfer and JavaScript serialization overhead. The final benchmark ran without simultaneous database integration tests.

Run only against a disposable **cloud/local-container** PostgreSQL fixture; the script rejects non-loopback hosts and non-`*_test` base databases. It creates and cleans up only its own randomly named benchmark database. Never point it at Railway or run it on the owner's PC:

```sh
TEST_DATABASE_URL='<disposable loopback *_test URL>' SNAPSHOT_BENCHMARK_ROWS=100000 node scripts/benchmark-upgrade-snapshot.mjs
```

The committed evidence is synthetic, not a claim about production completion time. Full required CI separately executes the actual checker in the independent encrypted recovery workflow.

## All deadlines considered

No timeouts or evidence validity periods are increased:

| Boundary | Limit |
| --- | ---: |
| Checker subprocess | 600 seconds |
| Shared worker-completion/report observation | 1200 seconds, capped by request expiry |
| Recovery request | 1800 seconds, created before staging/upload |
| Recovery object grants | 3600 seconds |
| Image target preflight | 2700 seconds |
| Signed release proof | 3600 seconds, issued after successful recovery |
| GitHub release job | 2400 seconds |

The failed run used approximately 1009 seconds from worker queueing to observed termination, including 600 seconds in this checker. A third legacy snapshot at the earlier observed cost would put the checker around 747–767 seconds and the controller around 1156–1176 seconds, leaving only about 24–44 seconds of its 20-minute budget. Those are extrapolations, not measured completions. Raising only the inner timeout would therefore move the risk to the outer boundary. The 20-minute controller limit stops acceptance; it is not a hard worker-kill mechanism. Existing locks and failure cleanup remain unchanged, and failed recovery databases are not deleted.

## Regression coverage

Offline tests retain operator/private-host/distinct-copy guards, fixed progress records, phase failures, rollback/release, full stdout proof, malformed key metadata and malformed/missing/truncated row-digest rejection. Real PostgreSQL tests execute the actual checker SQL and comparisons: keyed/composite/quoted/INCLUDE keys, nullable unique fallback, Unicode, full payload changes beyond the first fetch, inserts/deletes, duplicate multiplicity, registry append/rewrite, physical reorder, key changes, new tables, dropped ordering columns and replay mutation. The successful report is independently recomputed from raw JSON rows in Node.

## Owner recovery procedure after review

1. Review and merge this PR only after exact-head required CI is green; wait for the merged `release/production` commit's required CI as well.
2. In GitHub Actions **Owner approved Railway release**, select `release/production`, operation `image-prepare`, promotion OFF, and approve the existing protected production gate. Prepare a fresh image from that exact merged commit; the checker is part of its candidate digest.
3. Once preparation succeeds, use operation `image-release` at that same commit with the new `image_run_id`, `image_artifact_id` and `image_manifest_digest`. Set the exclusive owner window and promotion only when the owner authorizes the release. Keep first-install registry-credential copying OFF for the already configured service. Approve the existing production gate.
4. Require all three snapshot completions, both comparisons, independent restore, encrypted retained-artifact verification and signed proof before promotion. The existing controller enforces these gates and the exact image identity.

Do not rerun the failed job or reuse expired proof/old image evidence. No workflow was dispatched, production configuration changed, recovery retried, database deleted, or retention safeguard altered while developing this correction. Existing failed copies and emergency OIDs remain protected. Production timing remains a limitation until the owner authorizes a fresh protected release; existing limits continue to fail closed.
