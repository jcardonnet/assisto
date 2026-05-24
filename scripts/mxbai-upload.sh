#!/usr/bin/env bash
set -euo pipefail

STORE="${MXBAI_STORE:-assisto}"

mxbai store upload "$STORE" \
  --manifest .mxbai/upload-manifest.yaml \
  --unique
