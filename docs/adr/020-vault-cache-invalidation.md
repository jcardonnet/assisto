# ADR-020: Vault Cache Invalidation

Status: Proposed  
Date: 2026-06-02

## Context

Vault indexing currently scans markdown. Later waves propose JSON cache under `.assisto-local/cache/**` and direct ID lookup maps. Caches can improve performance but must remain derived and must not hide malformed canonical pages.

## Decision

Vault caches are derived, rebuildable, versioned, and explicitly invalidated.

Cache records should include:

- cache schema version;
- parser/schema/ontology version inputs;
- repo root identity;
- file path;
- size;
- mtime;
- optional content hash for changed files;
- cold-scan fallback metadata.

Deleting `.assisto-local/cache/**` must be safe. Cache misses and cache corruption should fall back to cold scan. Malformed canonical pages must remain visible as warnings or errors; cache failure must not silently produce an empty or healthy vault.

`fs.watch` must not be used as source-of-truth invalidation.

## Consequences

- Performance can improve without moving truth out of markdown.
- Cache builders need tests for stale cache, corrupt cache, schema upgrades, deleted cache safety, WSL/Windows mtime behavior, and malformed markdown visibility.
- Cache keys and filenames must not expose raw query text, person names, Event IDs, transaction IDs, absolute paths, or raw routes.

## Open Questions

- Which version inputs should invalidate cache: validators, ontology registry, markdown parser, package version, or all of them?
- Are mtimes reliable enough across WSL/Windows, or should hashes be mandatory?
- Should cache errors warn or fail when canonical pages are malformed?
