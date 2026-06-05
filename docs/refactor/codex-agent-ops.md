# Codex Agent Ops For Parallel Assisto Work

Status: Wave 0 synthesis  
Date: 2026-06-02

This note captures coordinator rules for the parallel implementation program. It does not replace `AGENTS.md`.

## Branch And File Discipline

- Use one `codex/` branch or isolated worktree per work item.
- Declare allowed files, forbidden files, expected public API changes, tests to run, parallel-safe work, and dependencies before builder work.
- Keep the contract spine serialized: public exports, error codes, observability schema, privacy policy, transaction semantics, route and command registries, cache format, and ADRs.
- Never run broad formatting.
- Never stage real `memory/events/**`, `memory/transactions/**`, `.assisto-local/**`, or benchmark output.

## Parallel Roles

- Scouts and reviewers are read-only.
- Test builders may add isolated tests and fixtures.
- Feature builders must own narrow, disjoint file sets.
- Export integrators update central exports and dispatch tables once per batch.
- Integration sweepers fix import/typecheck breakage only and run validation.

## Mixedbread Strategy

Use Mixedbread as a wayfinder before non-trivial edits, then open local files before patching. Do not patch from retrieval snippets.

For this repository, prefer the manifest-scoped refresh path after validated changes:

1. Run the required validation for the changed area.
2. Run a manifest-scoped dry run if available for the command being used.
3. Refresh the `assisto` store using the checked-in manifest scope.
4. Run the smoke search.

Current repo automation uses:

```bash
pnpm mxbai:upload
pnpm mxbai:smoke
```

The manifest preserves per-area metadata and excludes real user memory data. Use `mxbai store sync --from-git` only for future automation where pattern-level metadata is sufficient and where the sync scope is explicitly reviewed.

## Validation

Docs-only Wave 0 validation:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm check:memory-data
```

Builder waves broaden validation by changed area. Retrieval or answer changes need retrieval/answer evals. Workbench/browser changes need e2e and browser tests. Transaction, validation, ingestion, follow-up, retrieval, entity resolution, linting, or eval behavior should run `pnpm validate:local`.

## PR Summary Template

```text
Summary:
Files changed:
Behavior changed:
Tests added/updated:
Tests run:
Known limitations:
Parallel conflicts checked:
Canonical/derived boundary impact:
Mixedbread refresh:
```
