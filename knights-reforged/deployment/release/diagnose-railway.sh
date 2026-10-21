#!/usr/bin/env bash
set -euo pipefail

# Capture all child output, including launch failures. Never forward provider
# responses, exceptions, credentials, or URLs. No shell tracing or CLI login.
node_path="$(command -v node 2>/dev/null)" || node_path=''
status=0
output="$("$node_path" "$(dirname "$0")/diagnose-railway.mjs" 2>/dev/null)" || status=$?
labels=(RAILWAY_TARGET_CONFIG RAILWAY_TOKEN_AUTH RAILWAY_PROJECT_ACCESS RAILWAY_ENVIRONMENT_ACCESS RAILWAY_GAME_SERVICE_ACCESS RAILWAY_WORKER_SERVICE_ACCESS)
details=(UNVERIFIED NONE TOKEN_MISSING TOKEN_FORMAT_INVALID CONFLICTING_API_TOKEN HTTPS_TRANSPORT_FAILURE HTTP_401 HTTP_403 HTTP_429 HTTP_5XX HTTP_OTHER GRAPHQL_RESPONSE_INVALID GRAPHQL_REJECTED TOKEN_METADATA_INVALID TOKEN_SCOPE_MISMATCH)
mapfile -t results <<< "$output"
valid=1
[[ ${#results[@]} -eq $((${#labels[@]}+1)) ]] || valid=0
failed=0
for index in "${!labels[@]}"; do
  [[ "${results[$index]-}" == "${labels[$index]}: PASS" || "${results[$index]-}" == "${labels[$index]}: FAIL" ]] || valid=0
  [[ "${results[$index]-}" != "${labels[$index]}: FAIL" ]] || failed=1
done
known=0
for detail in "${details[@]}"; do
  [[ "${results[6]-}" != "RAILWAY_AUTH_DETAIL: $detail" ]] || known=1
done
[[ $known -eq 1 ]] || valid=0
if [[ $valid -eq 1 && ( $failed -eq 1 || ( $status -eq 0 && "${results[6]-}" == 'RAILWAY_AUTH_DETAIL: NONE' ) ) ]]; then
  printf '%s\n' "${results[@]}"
  [[ $failed -eq 0 ]]
else
  for label in "${labels[@]}"; do printf '%s: FAIL\n' "$label"; done
  printf '%s\n' 'RAILWAY_AUTH_DETAIL: UNVERIFIED'
  exit 1
fi
