# Assisto Code Map For Parallel Refactors

Status: Wave 0 synthesis  
Date: 2026-06-02

This map summarizes high-conflict implementation areas for the observability, reliability, error handling, performance, and refactoring program. It is a planning artifact only. It does not change canonical memory semantics.

## Invariants

- Durable memory still flows through Events, Transactions, validation, and review.
- Workbench state, caches, indexes, answer contracts, context packs, briefs, symbolic output, eval output, and `.assisto-local/**` are derived.
- Builder work must not edit real `memory/events/**`, `memory/transactions/**`, or `.assisto-local/**`.
- Move-only refactors must not mix with behavior changes.

## Central Conflict Files

| File | Role | Conflict risk | Refactor posture |
|---|---|---:|---|
| `packages/workbench/src/index.ts` | Local HTTP server, route dispatch, API DTOs, derived/session writes, HTML/CSS/client JS, provider previews, durable route adapters | Very high | Split only after route contract tests; one integration owner updates the dispatch table |
| `packages/cli/src/index.ts` | CLI dispatcher, command handlers, formatting, Workbench launch | High | Extract command groups after core exports are stable; preserve UX and exit behavior |
| `packages/core/src/transactions/index.ts` | Transaction parse, serialize, validation, apply, reject, fail, path helpers, ingest log | Very high | Serialize apply-semantics work; test before refactor |
| `packages/core/src/validators/index.ts` | Validation issue codes and checks for schema, claims, provenance, links, IDs, follow-ups, scope, rollback, ontology | Very high | Treat error codes and aggregation as public contracts |
| `packages/core/src/retrieval/index.ts` | Query intent, page/event loading, context packing, answer contracts, answer drafts, citations, symbolic bridge | High | Preserve derived-only outputs and citation hydration |
| `packages/core/src/entities/index.ts` | Entity listing/detail, stewardship risk, context rooms, timelines, repair transactions | High | Avoid auto-merge semantics; keep repair preview/stage paths |
| `packages/core/src/ingest/transaction-builder.ts` | Proposed writes for Events, people, topics, follow-ups, review staging | High | Coordinate with validation and transaction changes |
| `packages/core/src/extraction/index.ts` | Provider normalization, candidate conversion, ontology review handling | Medium-high | Redaction contract must precede provider logging |
| `packages/core/src/fs/index.ts` and `packages/core/src/vault/index.ts` | Path safety, markdown writes, vault indexing | Medium | Small but safety-critical; serialize write behavior changes |
| `packages/core/src/index.ts` | Core export spine | Medium | One export integrator per batch |

## Proposed PR Boundaries

1. Workbench route table extraction, move-only.
2. Workbench local derived-state helpers, move-only.
3. Workbench asset/render extraction, move-only.
4. CLI command module extraction, move-only.
5. Validator modularization, move-only plus export preservation.
6. Transaction decomposition, tests first, behavior unchanged unless explicitly scoped.
7. Retrieval decomposition, semantic output preserved after normalization.
8. Entity/context decomposition, no merge/delete/auto-resolution semantics.

## Tests Needed Before Refactors

- Route contract tests for every Workbench GET/POST endpoint.
- Workbench write-route tests proving previews do not write canonical files.
- CLI command snapshots for help, option errors, JSON shapes, and durable-action messages.
- Transaction tests for validation failure no-write, Event-first write ordering, failed/rejected paths, affected-file mismatch, invalid write path, and log failure.
- Validator tests that assert exact `ValidationErrorCode` values and combined result behavior.
- Retrieval tests for citation hydration, `canonical_writes: []`, cannot-confirm/conflict/stale output, and answer draft guardrails.
- Entity repair tests for alias conflict, near/ambiguous identity staging, role/reporting/ownership supersede previews, and no direct merge/delete.

## Sequencing Notes

- Land privacy, error, observability, route, and command contracts before broad instrumentation.
- Do not split transaction apply while ingestion, review, health, or entity repair builders are changing adjacent behavior.
- Extract Workbench routes before UI/client extraction to keep browser diffs legible.
- Extract CLI commands after public core exports are clean enough to remove direct relative imports from core internals.
- Serialize validator modularization with any schema or ontology policy changes.

## Open Questions

- Should Workbench stay a generated single-file browser surface for now, or move toward frontend build tooling later?
- Should core expose service facades so CLI and Workbench stop duplicating input parsing?
- Should preview-root helpers be centralized in core?
- Should validation issue ordering be treated as a public contract before validator decomposition?
