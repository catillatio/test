# Faster checks, unchanged production trust

This change parallelizes normal checks and scopes routine PR feedback. It does
not authorize deployment, change branch protection, or alter recovery behavior.
Base: `9b9a08172d5c2f8b1c598a309d7f2f982db9f0e5`.

## What runs

| Change | PR profile | Validation |
|---|---|---|
| Regular PNG/JPEG/WebP under `public/art/`; explicitly reviewed public provenance files | art | Typecheck, build, static validation, both dependency audits; integrity/hash/path/provenance/catalog tests; real equipment presentation and responsive artwork browsers |
| EJS templates or top-level CSS | ui | Same validation, asset coverage, client/auth/origin/CSRF/current and historical receipts, notification and rendering integration; responsive browsers and meaningful-audio regression |
| Explicit existing combat/quest/army/progression/economy/game/equipment/Land/bot modules | gameplay | All test files, containers and real independent encrypted recovery rehearsal, sharded |
| Migrations, persistence, release/security, workflows, dependencies, registry/policy JSON, artwork resolver code, client JS | full | Complete validation, all test files, containers and independent encrypted recovery rehearsal |
| Unknown, mixed, deleted, renamed/type-changed, symlink/executable, unavailable diff | full | Conservative fallback |
| Every production push | full | Fresh exact-production-commit checks, regardless of PR profile |

`scripts/ci/plan.mjs` is the explicit dependency map. Public provenance metadata
is not a policy registry. New or unknown metadata requires full validation.
An ordinary artwork release that adds an immutable ruleset or changes the compiled
selection still receives full checks; it cannot disguise that change as an image.
CSS and templates receive security and transactional rendering coverage, not only
screenshots. There is no fast route for arbitrary JavaScript.

## Execution and isolation

`scripts/ci/test-manifest.json` inventories every test. New, missing or duplicate
test files fail planning until reviewed. Every test belongs to one resource lane;
the explicit eight historical browser wrappers, two Chromium client files and
standalone Phase 4.7 browser script remain covered. No old assertion is removed.

Full CI uses three database shards (two bounded workers each), two browser shards
(one worker each), a unit lane (two workers), validation, and a parallel container /
encrypted recovery job. Reviewed heavyweight fixtures run exclusively within
their shard to protect existing lock timeouts and memory budgets. Shard assignment
uses stable weighted greedy placement; weights affect placement, not assertions.

Every database/browser test file gets a fresh, random database in its job's local
PostgreSQL 18 service. This isolates rows **and database-scoped advisory locks**;
schemas alone would not isolate those locks. Tests retain their own within-file
concurrency, transactions, rollback and migration assertions. Ports are already
ephemeral or browser-intercepted, temporary directories random, evidence files
distinct. Tests still build populated 450/900-bot fixtures and compare saved rows.

The runner accepts only local designated `*_test` database URLs, without URL
overrides. It creates its own UUID database with `template0`, never adopts an
existing name, and drops only successfully created fixtures. SIGINT/SIGTERM stops
descendants, force-stops them after five seconds if needed, removes owned fixtures
and records failed/incomplete evidence. A hard runner/VM kill may leave a local
fixture; discard that **disposable CI service**. Never apply wildcard cleanup to a
shared database server. No production connection or fixture URL is used by CI.

Failed, cancelled, skipped, missing or truncated test evidence fails the runner.
The one pre-existing hosted-network-namespace test may skip locally by exact title;
hosted CI must execute it. Required browser/database dependencies fail early.
The aggregate job retains the branch-protected name **`checks`**. All four direct
dependencies must succeed; missing/cancelled/skipped jobs cannot produce green.
Matrix fail-fast is disabled, so remaining evidence survives one shard failure.

## Local commands

```sh
# Use only an operator-created disposable LOCAL PostgreSQL 18 *_test fixture.
export TEST_DATABASE_URL=postgres://knights:disposable-ci-only@127.0.0.1:5432/kingdom_come_ci_test
export BROWSER_EXECUTABLE=/usr/bin/google-chrome
npm ci --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund --prefix deployment/release
npm run build
npm test                         # complete, bounded, isolated suite
npm run test:ci -- --profile=art # asset-focused development feedback
npm run test:ci -- --profile=ui
npm run test:ci -- --lane=database --shard=1/3 --workers=2
npm run test:ci -- --files=tests/ci-plan.test.mjs
npm run test:serial              # original serial runner for diagnosis
```

`test:serial` retains the old optional-dependency/skip behavior; it is not the CI
approval path. `npm test` now requires all full-suite dependencies and records
per-file TAP and timings under `test-results/ci-*/`. The focused-files option only
accepts reviewed manifest entries and is never used to restrict CI's matrix.

## Caching and builds

Pinned actions and contents-read permissions remain. Cache npm's download cache,
keyed by lockfiles; always run `npm ci`, verify package integrity, typecheck/build
and both high-severity production dependency audits. Never cache `node_modules`
or treat a PR build as release authorization. The compiler-output artifact is
used only by tests in the **same run**, retained one day, and never deployed.
Compiled output is built once for tests; game and recovery images independently
compile their actual Docker contexts. Recovery-worker dependency/compiler layers
now match the game build and precede assets/templates, permitting Docker's ordinary
content-validated layer reuse. Runtime files, user, entrypoint and candidate inputs
remain unchanged. No registry or remote build-cache infrastructure was added.

Superseded PR runs may cancel. Production push runs are not cancelled. Scope PR
revisions; test jobs explicitly check out the exact PR head. Planning uses the
merge ref only to obtain base/head objects for classification (missing objects
fall back to full). Always revalidate the actual merge SHA after merging. Existing release preflight still
requires a successful **push** run on `release/production` with exact head SHA,
repository identity, owner approval rules and branch protection. Neither PR merge
refs, compiler artifacts nor caches substitute for that evidence.

## Railway, backup and recovery

`production-release.yml`, release controller, signing/proof, exact deployment
identity, schema-025 pin and recovery protocol are unchanged. Existing bounded
polling waits for the exact worker deployment; no measured bug justifies relaxing
it. No protected workflows were dispatched for this optimization.

The source bundle remains allowlisted and exact-commit/candidate bound. We did not
introduce cross-release compiled-image reuse without a proven provenance contract.
The image-layer change can reduce rebuild work, but live deployment speed remains
unverified. Changing dump compression/streaming, owner-key verification, artifact
hashing/retention or isolated restore behavior would require separate compatibility
evidence and approval. None changes here. Retained-copy accumulation is a storage
operations issue, not permission to delete recovery copies or shorten retention.

## One reviewed deployment for ordinary features

Default for future complete artwork/UI changes: submit all versioned assets,
hashes/provenance and the reviewed compiled selection **in the same PR**; validate
the whole set at startup before health succeeds; deploy that exact reviewed commit
once through the protected release. The current compiled-artwork selection already
supports this. Do not invent an extra dormant installation/adoption deployment.
Preserve old immutable registries and historical evidence; do not rerun previous
expansion operations. All coordinated categories must be complete together.

Separate installation/activation remains necessary when explicitly justified by
economic/population provisioning, XP cutover, irreversible migration, recovery
changes or real production observations. This document does not retroactively
approve any artwork, population or economic operation.

## Adoption and rollback

1. Owner reviews this draft, classifier matrix, benchmarks and exact-head CI.
2. Merge normally without changing protected rules. The exact production push
   must complete full CI successfully; the PR run alone cannot authorize release.
3. Workflow optimization takes effect on merge. Any later application deployment
   uses the existing manual protected workflow and owner environment approval.
4. If flaky or incorrect classification is found, make a reviewed commit forcing
   `classify.mjs` to `full`. Keep all tests and the required aggregate intact.
5. To restore the old topology, revert this PR through a reviewed PR; restore
   the original `checks` job and `test:serial` command. Do not bypass required
   checks. No database rollback, credential change or production data action is
   needed. Preserve diagnostic evidence before cancelling broken PR runs.

See [BENCHMARKS.md](BENCHMARKS.md) for measurements and remaining limits.
