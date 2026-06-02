# Implementation Plan

## Current implementation status

Assisto has progressed from a safe MVP into a local-first Work-Memory OS surface. The safe compiler core remains:

```text
Raw input → Event → Candidate claims → Transaction → Validated mutation or staged review → Current pages
```

For a consolidated architecture and package/module map, start with
`docs/project-architecture.md`. This file owns implementation status, roadmap,
and validation guidance.

## Implemented tracks

- **MVP**: transaction-safe core, schemas, validators, deterministic staging.
- **v2**: candidate extraction pipeline and provider-ready LLM candidate output.
- **v3**: deterministic hardening, org-chart detectors, safe upserts, Event reprocessing.
- **retrieval**: deterministic query intent and lexical answer basis.
- **v4**: local Workbench foundation, review, transactions, health, briefs, browser coverage.
- **v5**: capture, import, Today, entity/context surfaces, dogfood flows, optional provider.
- **v6**: activated daily loop, answer drafts, friction logging, import triage, context pages.
- **v7**: first-day activation OS, personal dogfood eval, workday modes.
- **v8: Ask → Entity → Context cited work-memory loop**: answer contracts, entity risk, Context operating rooms/timelines.

## Near-term documentation hardening track

- D1 — Adopt hardened revised design.
- D2 — Update AGENTS derived/write boundaries.
- D3 — README orientation and docs map.
- D4 — ADR updates.
- D5 — Schema docs update.
- D6 — Dogfood docs update.
- D7 — Pi skills/prompts update.

## Post-v8 roadmap tracks

- v9 — Boundary hardening and write-permission enforcement.
- v10 — Cited Answer Engine hardening.
- v11 — Entity Stewardship hardening.
- v12 — Context Operating Rooms hardening.
- v13 — Source Adapter Fabric.
- v14 — Derived ontology registry.
- v15 — Symbolic reasoning and proof traces.
- v16 — Consolidation/dream-cycle maintenance.

## Validation by changed area

Docs-only:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm check:memory-data
```

Core/schema/transactions:

```bash
pnpm validate:local
```

Retrieval/answers:

```bash
pnpm eval:retrieval
pnpm eval:answers
pnpm eval:v8
```

Workbench/browser:

```bash
pnpm test:e2e
pnpm test:browser
pnpm eval:maintenance
```

Full CI parity:

```bash
pnpm validate:ci-parity
```

## Codex Task Format

Each implementation task should include:

```text
Task:
<one narrow deliverable>

Authorized files:
<exact paths Codex may edit>

Forbidden:
- direct canonical writes
- autonomous merge/resolution
- generated answer persistence
- graph/vector/MCP as canonical memory

Required invariants:
- all durable claims cite Event IDs
- multi-file mutations use Transactions
- unscoped claims stage
- committed FollowUps require trigger language

Validation:
<commands by changed area>
```

## Historical Appendix

Older phase prompts are historical. The active architecture is `docs/revised-design.md`; the active agent constraints are `AGENTS.md`.
