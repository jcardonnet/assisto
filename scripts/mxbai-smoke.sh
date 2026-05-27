#!/usr/bin/env bash
set -euo pipefail

STORE="${MXBAI_STORE:-assisto}"
TOP_K="${MXBAI_SMOKE_TOP_K:-3}"
VERBOSE="${MXBAI_SMOKE_VERBOSE:-0}"

run_query() {
  local label="$1"
  local query="$2"

  if [[ "$VERBOSE" == "1" ]]; then
    mxbai store search "$STORE" \
      "$query" \
      --top-k "$TOP_K" \
      --rerank \
      --return-metadata
    return
  fi

  local output
  if output="$(mxbai store search "$STORE" "$query" --top-k "$TOP_K" --rerank --return-metadata 2>&1)"; then
    printf '%s: PASS\n' "$label"
  else
    printf '%s: FAIL\n' "$label"
    printf '%s\n' "$output"
    return 1
  fi
}

run_query "transaction validation" "transaction validation rollback event provenance"
run_query "follow-up policy" "committed follow-up trigger phrases fake obligation policy"
run_query "memory schema" "memory schema object_state review_state claim_kind evidence event id"
