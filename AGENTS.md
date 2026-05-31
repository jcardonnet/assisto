# AGENTS.md

## Project Invariant

This repository implements a local-first markdown work-memory assistant.

Canonical state lives under `memory/`. Markdown files are the durable source of record. Indexes, search artifacts, embeddings, graphs, caches, answer contracts, packs, briefs, Workbench/session state, and `.assisto-local/**` are derived artifacts.

The safe compiler core is:

```text
Raw input → Event → Candidate claims → Transaction → Validated mutation or staged review → Current pages
```

Derived artifacts may guide, explain, preview, rank, and propose. Only Events, Transactions, validation, and review create durable memory.

## MVP Scope

MVP object types:

- `Event`
- `Person`
- `Context`
- `Topic`
- `FollowUp`
- `ReviewItem`
- `Transaction`
- `LogEntry`

MVP folders:

```text
memory/
  schema/
  events/
  people/
  contexts/
  topics/
  followups/
  review/
  transactions/
  logs/
  indexes/
```

## Non-Negotiable Rules

- Do not implement vector search as canonical memory.
- Do not implement a graph database as canonical memory.
- Do not implement MCP as canonical memory.
- Do not implement autonomous entity merges.
- Do not implement autonomous contradiction resolution.
- Do not implement full meeting-transcript ingestion.
- Do not implement autonomous background linting.
- Do not create standalone Decision, OpenQuestion, or Explanation pages in the MVP.
- Do not write canonical memory pages directly from ingestion logic.
- All multi-file mutations must go through Transactions.
- Every durable claim must cite at least one Event ID.
- Unknown system/project/context scope must be staged, not promoted as active truth.
- Do not create committed FollowUps without explicit trigger phrases.
- Do not auto-merge people or topics.
- Do not delete memory in the MVP; use `archived`, `rejected`, or `superseded`.

## Global Boundary For Derived/Intelligent Layers

Cited answers, context packs, Workbench views, briefs, health summaries, entity stewardship views, Context operating rooms, ontology views, symbolic reasoning outputs, semantic search results, and eval sessions are derived unless explicitly routed through Events and Transactions.

They may guide, explain, preview, rank, and propose. They may not directly create or modify canonical memory.

## Inference Laundering

Inference laundering is a P1 bug: generated, inferred, weakly supported, or retrieval-assembled text becoming durable truth without Event evidence and a validated Transaction.

Flag as P1 any change that:

- persists generated answers, generated explanations, briefs, context packs, symbolic outputs, or Workbench state as canonical memory without Event/Transaction flow;
- creates ReviewItems directly from adversarial review instead of pending `STAGE_REVIEW` Transactions;
- treats maintenance domain events as source Events;
- stores ontology policy as user memory instead of schema/policy under `memory/schema/ontology/`;
- makes semantic/vector/symbolic retrieval outrank cited claims or source Events;
- introduces new canonical object types without a documented migration;
- persists repeated generated explanations without explicit save plus reviewed Transaction.

## Write permission matrix

| Actor / Layer | Events | Pending Transactions | Apply Transactions | Current pages directly | Derived indexes/state |
|---|---:|---:|---:|---:|---:|
| Ingestion | Yes | Yes | No | No | No |
| Capture UI | Yes | Yes | No | No | No |
| Import adapter | Yes | Yes | No | No | No |
| Review UI | Explicit note capture only | Yes | Validated helper only | No | No |
| Transaction applier | No | No | Yes | Yes, via transaction only | No |
| Health checker | No | Optional | No | No | Yes |
| Adversarial review | No | `STAGE_REVIEW` only | No | No | Yes |
| Symbolic reasoner | No | Optional review candidate | No | No | Yes |
| Retrieval / Ask | No | Explicit repair preview only | No | No | Optional query cache |
| Brief builder | No | No | No | No | No |
| Workbench session state | No | No | No | No | `.assisto-local/**` only |

## Canonical State Model

Only these top-level object states are allowed:

```yaml
object_state: active | archived
review_state: none | staged | reviewed | contested
```

Every claim block must use:

```yaml
claim_state: active | staged | superseded | rejected
claim_kind: fact | inference | assumption | preference | commitment
evidence_strength: explicit | inferred | weak
scope_state: complete | partial | unknown
```

Do not introduce generic `status`, `classification`, or `confidence` fields for MVP memory objects.

## Temporal Model

Use only:

```yaml
recorded_at
observed_at
valid_from
valid_to
```

Do not treat `recorded_at` or `observed_at` as `valid_from`.

## Follow-Up Extraction Policy

Committed FollowUps require explicit trigger language such as `Remind me to`, `I need to`, `I will`, `Please track`, `Add a follow-up`, `asked me to`, or `Due by`.

Do not create FollowUps from casual phrases such as `we discussed`, `mentioned`, `came up`, or `we talked with`.

## Entity Resolution Policy

Entity states:

- `exact_match`
- `alias_match`
- `near_match`
- `new_entity`
- `ambiguous`

Only exact and already-canonical alias matches can update automatically. Near and ambiguous matches stage review. False splits are tolerable; false merges corrupt memory.

## Supported MVP Mutation Operations

Allowed:

- `ADD_EVENT`
- `UPSERT_CLAIM`
- `STAGE_REVIEW`
- `NOOP`
- `SUPERSEDE_CLAIM`
- `CLOSE_FOLLOWUP`

Deferred:

- `MERGE`
- `SPLIT`
- `DELETE`
- `AUTO_RESOLVE_CONTRADICTION`

If a task asks for a deferred operation, implement staging/detection only.

## Validation Requirements

Before applying any Transaction, validate frontmatter, claim blocks, source Event links, wikilinks, unique IDs, FollowUp trigger evidence, active unknown-scope claims, summary basis, ambiguous entity updates, and rollback/repair notes.

Validation failure:

1. Do not apply canonical page edits.
2. Preserve the Event.
3. Keep the Transaction pending or mark it failed.
4. Create or update ReviewItem through transaction-backed paths.
5. Append a LogEntry.

## Mixedbread retrieval protocol for Codex

Use Mixedbread before non-trivial edits.

1. Search docs for invariants.
2. Search tests/evals for expected behavior.
3. Search source for implementation sites.
4. Open local files before patching.
5. Never patch from snippets alone.
6. Run validation after edits.

## Required Commands

Before completing coding tasks:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

For behavior touching ingestion, validation, transactions, follow-ups, retrieval, entity resolution, linting, or evaluation, also run relevant evals. Prefer:

```bash
pnpm validate:local
```

Before staging/committing, run:

```bash
pnpm check:memory-data
```

## Coding Style

- Prefer simple deterministic code over clever LLM-dependent behavior.
- Keep deterministic semantics in `packages/core`.
- Keep CLI wrappers in `packages/cli`.
- Keep Pi-specific integration in `packages/pi-extension` or `.pi/extensions/work-memory`.
- Keep file formats readable by humans and LLMs.
- Avoid dependencies unless they materially simplify parsing, validation, or testing.

## Definition Of Done

A task is complete only when it stays in scope, preserves invariants, adds/updates relevant tests or docs, runs required validation, and states known limitations.
