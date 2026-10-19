#!/usr/bin/env bash
set -euo pipefail

# Capture all child output, including launch failures. Never forward provider
# responses, exceptions, credentials, or URLs. No shell tracing or CLI login.
node_path="$(command -v node 2>/dev/null)" || node_path=''
status=0
output="$("$node_path" "$(dirname "$0")/diagnose-railway.mjs" 2>/dev/null)" || status=$?
labels=(RAILWAY_TARGET_CONFIG RAILWAY_TOKEN_AUTH RAILWAY_PROJECT_ACCESS RAILWAY_ENVIRONMENT_ACCESS RAILWAY_GAME_SERVICE_ACCESS RAILWAY_WORKER_SERVICE_ACCESS)
mapfile -t results <<< "$output"
valid=1
[[ ${#results[@]} -eq ${#labels[@]} ]] || valid=0
for index in "${!labels[@]}"; do
  [[ "${results[$index]-}" == "${labels[$index]}: PASS" || "${results[$index]-}" == "${labels[$index]}: FAIL" ]] || valid=0
done
if [[ $valid -eq 1 && ( $status -eq 0 || "$output" == *FAIL* ) ]]; then
  printf '%s\n' "${results[@]}"
  [[ "$output" != *FAIL* ]]
else
  for label in "${labels[@]}"; do printf '%s: FAIL\n' "$label"; done
  exit 1
fi
