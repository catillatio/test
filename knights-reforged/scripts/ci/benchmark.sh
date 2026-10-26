#!/usr/bin/env bash
# Local disposable fixtures only; the runner validates URL/host/ownership.
set -euo pipefail
cd "$(dirname "$0")/../.."
files=tests/equipment-presentation.test.ts,tests/phase51c-rotation.test.ts,tests/migration.test.ts,tests/phase44-migration.test.ts,tests/training.test.ts,tests/railway.test.ts
for trial in 1 2; do
  for workers in 1 2 4; do
    CI_BENCHMARK_LABEL="bounded-$trial-$workers" node scripts/ci/run-tests.mjs --lane=database --files="$files" --workers="$workers"
  done
done
for workers in 1 2; do
  CI_BENCHMARK_LABEL="units-$workers" node scripts/ci/run-tests.mjs --lane=unit --workers="$workers"
done
for profile in art ui; do
  CI_BENCHMARK_LABEL="profile-$profile" node scripts/ci/run-tests.mjs --profile="$profile" --workers=2
done
