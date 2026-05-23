# Work Memory Assistant

A local-first, markdown-backed work-memory assistant inspired by Karpathy-style LLM Wikis.

The project is designed to run with:

- **Obsidian** as the canonical markdown UI/store;
- **Pi Agent Harness** as the interactive runtime environment;
- **GPT-5.5** as the reasoning model;
- **Codex Pro** as the implementation agent;
- **Git** as the audit, rollback, and review layer.

The first implementation is intentionally small. It is not a general autonomous memory system. It is a source-backed markdown mutation loop with transactions, validation, conservative follow-up extraction, and review staging.

## Core idea

The assistant ingests messy work inputs:

```text
Joe is the DBA. We use MySQL.
Mike is my manager. He is a Java generalist with CRM experience.
I started new job this Monday as an AI Engineer at SmartEquip.
Today I talked with Joe about pgvector for storing CLIP embeddings.
How should I explain Joe and Mike the difference between Solr and Qdrant?
```

It turns them into durable, inspectable markdown state:

```text
Raw input
→ Event
→ Candidate claims
→ Transaction
→ Validated mutation or staged review
→ Current pages
```

Markdown files are canonical. Search indexes, caches, embeddings, graphs, and runtime state are derived.

## MVP scope

The MVP includes:

- Events
- People
- Contexts
- Topics
- FollowUps
- ReviewItems
- Transactions
- Logs
- schema validation
- lexical retrieval and wikilinks

The MVP defers:

- vector search;
- graph database;
- MCP integration;
- autonomous entity merges;
- autonomous contradiction resolution;
- standalone Decision pages;
- standalone OpenQuestion pages;
- standalone Explanation pages;
- full meeting transcript ingestion;
- autonomous background linting.

## Repository layout

```text
work-memory-assistant/
  AGENTS.md
  README.md

  docs/
    revised-design.md
    implementation-plan.md
    decisions.md

  memory/
    schema/
      conventions.md
      statuses.md
      relation-types.md
      validators.md
    events/
    people/
    contexts/
    topics/
    followups/
    review/
    transactions/
      pending/
      applied/
      rejected/
      failed/
    logs/
    indexes/
      README.md

  packages/
    core/
    cli/
    pi-extension/

  .pi/
    extensions/
      work-memory/
        index.ts
    skills/
      work-memory-ingest/
        SKILL.md
      work-memory-retrieve/
        SKILL.md
      work-memory-review/
        SKILL.md
      work-memory-lint/
        SKILL.md
    prompts/
      ingest.md
      ask.md
      review-inbox.md
      apply-transaction.md
      lint.md

  tests/
    fixtures/
    scenarios/
    golden/
```

## Safety invariants

1. No direct canonical writes from ingestion logic.
2. Every multi-file mutation goes through a transaction.
3. Every durable claim cites at least one Event ID.
4. Unknown system/project/context scope is staged.
5. Committed follow-ups require explicit trigger phrases.
6. Ambiguous entities are staged.
7. People and topics are not auto-merged.
8. Contradictions are detected and staged, not resolved automatically.
9. Summaries are generated views, not canonical truth.
10. Validation runs before transactions are applied.

## MVP object types

| Object | Purpose |
|---|---|
| Event | Immutable evidence unit. |
| Person | Current-state page for people, roles, explicit facts, interactions, and staged inferences. |
| Context | Umbrella scope for project, system, team, client, environment, or bounded work context. |
| Topic | Work-relevant technical or business concept. |
| FollowUp | Candidate or committed action. |
| ReviewItem | Ambiguity, contradiction, duplicate candidate, unscoped claim, stale item, unsafe inference. |
| Transaction | Auditable multi-file mutation proposal/application record. |
| LogEntry | Append-only operational trace. |

## State model

Top-level objects use:

```yaml
object_state: active | archived
review_state: none | staged | reviewed | contested
```

Claims use:

```yaml
claim_state: active | staged | superseded | rejected
claim_kind: fact | inference | assumption | preference | commitment
evidence_strength: explicit | inferred | weak
scope_state: complete | partial | unknown
```

Temporal fields:

```yaml
recorded_at: <when the memory system recorded it>
observed_at: <when the event happened, if known>
valid_from: <when the claim became true, if known>
valid_to: <when the claim stopped being true, if known>
```

## Development workflow

Use Codex in small tasks:

1. Scaffold repo.
2. Implement core domain types.
3. Implement markdown/frontmatter parsing.
4. Implement validators.
5. Implement transaction engine.
6. Implement deterministic follow-up, staging, and entity-resolution policies.
7. Implement CLI.
8. Implement MVP eval harness.
9. Implement Pi extension wrapper.
10. Add optional GPT extraction after deterministic tests pass.

Do not ask Codex to invent the architecture while coding. Give it a narrow task, allowed file scope, invariants, and tests.

## Setup

Install dependencies:

```bash
pnpm install
```

Run the scaffold checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm eval:mvp
pnpm eval:v2
```

Useful narrower test commands:

```bash
pnpm test:unit
pnpm test:integration
```

The current implementation includes deterministic ingestion, a candidate extraction pipeline, provider-ready LLM-assisted extraction that still stages through deterministic policy, transaction-backed review item state changes, lexical retrieval, CLI and Pi adapters, and MVP/v2 deterministic evals. `packages/core` owns deterministic memory semantics, `packages/cli` wraps those semantics for local commands, and `packages/pi-extension` remains a thin runtime adapter.

## Required commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm eval:mvp
```

`pnpm eval:mvp` runs a deterministic MVP eval harness. It does not call GPT or any external model.

## Review Guidelines

When requesting Codex PR review, ask it to prioritize behavioral regressions, corruption risks, and missing tests. Codex should flag as P1 any change that:

- bypasses Transactions;
- writes active claims without Event evidence;
- promotes unscoped system/project/context claims;
- creates committed FollowUps without explicit trigger phrases;
- adds vector, graph DB, or MCP dependencies to MVP code;
- auto-merges people or topics;
- auto-resolves contradictions;
- deletes memory instead of staging, rejecting, or archiving;
- writes to `.obsidian/`.

## Codex PR Workflow

Use this PR process for MVP changes:

1. Create a task-scoped branch.
2. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm eval:mvp`.
3. Open a PR with a concise summary, validation results, and known limitations.
4. Request `@codex` review.
5. Fix P0/P1 findings only unless a human reviewer explicitly asks for broader cleanup.
6. Merge only after human inspection confirms the transaction, validation, and review invariants still hold.

## Acceptance thresholds

```text
Committed follow-up precision >= 95%
Duplicate-person false merge rate = 0%
Unscoped system claims auto-promoted = 0%
Source citation coverage for factual context packs >= 95%
Transaction validation failure caught before write = 100%
Summary unsupported-claim rate = 0%
Broken-link rate after applied transactions = 0%
```

## MVP eval suites

`pnpm eval:mvp` runs the following deterministic scenario suites:

| Suite | What it measures |
|---|---|
| Ingestion precision benchmark | Rule-based ingest creates Events and pending Transactions, stages unscoped MySQL claims, and keeps query-only inputs as NOOP. |
| Source-event granularity A/B | Raw notes are preserved as source Events with derived claim references, without splitting or losing evidence. |
| Follow-up extraction stress test | Committed follow-up precision on explicit trigger phrases versus discussion/candidate language. |
| Entity resolution torture test | Ambiguous or near-match people are staged rather than merged. |
| Temporal supersession test | Active claims are preferred while superseded claims remain visible only as uncertain audit context. |
| Summary drift test | Summaries remain backed by active claims and unsupported summaries are flagged. |
| Review backlog simulation | Manual linting detects staged review backlog growth; no autonomous background linting is scheduled. |
| Retrieval context packing test | Lexical context packing loads exact people/topics, skips unrelated Events, includes citations, and marks uncertainty. |
| Markdown noise endurance test | Parsers tolerate readable markdown noise, wikilinks, quotes, and unrelated bullets. |
| Multi-file rollback test | Invalid transactions fail validation before canonical writes occur. |

Golden thresholds live in `tests/golden/mvp-eval-thresholds.json`; scenarios live under `tests/scenarios/`.

## Runtime model

| Design concept | Runtime binding |
|---|---|
| Canonical memory | Obsidian-readable markdown under `memory/` |
| Interactive agent | Pi Agent Harness |
| Reasoning model | GPT-5.5 |
| Implementation agent | Codex Pro |
| Audit/versioning | Git |
| Workflow instructions | `AGENTS.md`, `.pi/skills`, `.pi/prompts` |
| Deterministic semantics | `packages/core` |
| Command surface | `packages/cli` |
| Pi integration | `packages/pi-extension` / `.pi/extensions/work-memory` |

## Pi extension wrapper

The Pi wrapper lives at `.pi/extensions/work-memory/index.ts` and delegates to `packages/pi-extension`.

It registers these tools:

```text
wm_validate
wm_ingest_note
wm_list_transactions
wm_show_transaction
wm_apply_transaction
wm_reject_transaction
wm_review_inbox
wm_pack_context
wm_lint
```

It registers these commands:

```text
/wm-ingest
/wm-review
/wm-apply
/wm-ask
/wm-validate
/wm-lint
```

The wrapper preserves MVP transaction invariants. Direct writes to `memory/people/`, `memory/topics/`, `memory/contexts/`, and `memory/followups/` are blocked unless invoked through `wm_apply_transaction`; `.obsidian/` writes are blocked; writes outside `memory/` and `.pi/` produce warnings. It does not implement MCP, vector search, separate memory semantics, or autonomous background linting.

## Pi prompt templates

Common Pi command prompts live under `.pi/prompts/`:

| Template | Command | Tool |
|---|---|---|
| `.pi/prompts/ingest.md` | `/ingest <note>` | `wm_ingest_note` |
| `.pi/prompts/ask.md` | `/ask <question>` | `wm_pack_context` |
| `.pi/prompts/review-inbox.md` | `/review-inbox` | `wm_review_inbox` |
| `.pi/prompts/apply-transaction.md` | `/apply-transaction <tx-id>` | `wm_apply_transaction` |
| `.pi/prompts/reject-transaction.md` | `/reject-transaction <tx-id> <reason>` | `wm_reject_transaction` |
| `.pi/prompts/lint.md` | `/lint` | `wm_lint` |

Each template repeats the relevant safety constraints: no direct canonical edits, writes route through Transactions, no vector/graph/MCP behavior, no autonomous merges or contradiction resolution, and no generated explanation persistence unless explicitly saved.

## Pi skills

Pi workflow skills live under `.pi/skills/`:

| Skill | Purpose |
|---|---|
| `.pi/skills/work-memory-ingest/SKILL.md` | Safely ingest short notes as Event plus pending Transaction. |
| `.pi/skills/work-memory-retrieve/SKILL.md` | Pack deterministic lexical context without GPT calls or generated persistence. |
| `.pi/skills/work-memory-review/SKILL.md` | Review, apply, or reject Transactions without bypassing validation. |
| `.pi/skills/work-memory-lint/SKILL.md` | Run manual lint checks that stage ReviewItems only. |

All skills forbid direct canonical writes, unscoped claim promotion, committed follow-ups without triggers, entity auto-merge, contradiction auto-resolution, and unsaved generated explanations.

## Current status

This repository starts as a spec-first prototype. Implement the deterministic core before adding GPT extraction, vector search, graph traversal, MCP, or background automation.
