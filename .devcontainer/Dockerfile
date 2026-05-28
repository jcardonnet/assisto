FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

ENV COREPACK_HOME=/tmp/corepack \
    XDG_CACHE_HOME=/tmp/xdg-cache \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    TMPDIR=/tmp \
    TEMP=/tmp \
    TMP=/tmp

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /workspace
