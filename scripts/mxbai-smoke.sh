#!/usr/bin/env bash
set -euo pipefail

STORE="${MXBAI_STORE:-assisto}"

mxbai store search "$STORE" \
  "transaction validation rollback event provenance" \
  --top-k 10 \
  --rerank \
  --return-metadata

mxbai store search "$STORE" \
  "committed follow-up trigger phrases fake obligation policy" \
  --top-k 10 \
  --rerank \
  --return-metadata

mxbai store search "$STORE" \
  "memory schema object_state review_state claim_kind evidence event id" \
  --top-k 10 \
  --rerank \
  --return-metadata
