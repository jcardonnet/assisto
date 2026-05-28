#!/usr/bin/env bash
set -euo pipefail

export COREPACK_HOME="${COREPACK_HOME:-/tmp/corepack}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/tmp/xdg-cache}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}"
export TMPDIR="${TMPDIR:-/tmp}"
export TEMP="${TEMP:-/tmp}"
export TMP="${TMP:-/tmp}"

corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm validate:ci-parity
