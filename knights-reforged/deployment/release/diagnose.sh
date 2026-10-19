#!/usr/bin/env bash
set -euo pipefail

# The hosted runner's isolated network namespace has no external interfaces.
# Preserve only diagnostic inputs, not a Railway token, GitHub token or DB URL.
# Capture both success/failure paths before permitting any diagnostic output.
node_path="$(command -v node 2>/dev/null)" || node_path=''
status=0
output="$(sudo --preserve-env=KINGDOM_RELEASE_SIGNING_KEY,KINGDOM_RELEASE_VERIFY_KEY,KINGDOM_BACKUP_ENDPOINT,KINGDOM_BACKUP_BUCKET,KINGDOM_BACKUP_REGION,KINGDOM_BACKUP_PATH_STYLE,KINGDOM_BACKUP_ACCESS_KEY_ID,KINGDOM_BACKUP_SECRET_ACCESS_KEY,NODE_TLS_REJECT_UNAUTHORIZED \
  unshare --net -- "$node_path" "$(dirname "$0")/diagnose.mjs" 2>/dev/null)" || status=$?

mapfile -t results <<< "$output"
if [[ ${#results[@]} -eq 3 \
  && ${results[0]} =~ ^SIGNING_KEY_ED25519:\ (PASS|FAIL)$ \
  && ${results[1]} =~ ^SIGNING_KEY_MATCH:\ (PASS|FAIL)$ \
  && ${results[2]} =~ ^BACKUP_STORE_PRESIGN:\ (PASS|FAIL)$ \
  && ( $status -eq 0 || "$output" == *FAIL* ) ]]; then
  printf '%s\n' "${results[@]}"
  [[ "$output" != *FAIL* ]]
else
  # Missing namespace support, unexpected library output, or launch failures
  # must fail closed without exposing stderr, stdout or interpolated inputs.
  printf '%s\n' 'SIGNING_KEY_ED25519: FAIL' 'SIGNING_KEY_MATCH: FAIL' 'BACKUP_STORE_PRESIGN: FAIL'
  exit 1
fi
