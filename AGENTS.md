# AGENTS.md

## Project invariant

This repository implements a local-first markdown work-memory assistant.

Canonical state lives under `memory/`. Markdown files are the durable source of record. Indexes, search artifacts, embeddings, graphs, caches, and runtime session state are derived artifacts.

The first implementation is a transaction-safe MVP, not a fully autonomous memory agent.

## MVP scope

Build only the source-backed markdown mutation loop:

```text
Raw input
→ Event
→ Candidate claims
→ Transaction
→ Validated mutation or staged review
→ Current pages
```

The MVP object types are:

- `Event`
- `Person`
- `Context`
- `Topic`
- `FollowUp`
- `ReviewItem`
- `Transaction`
- `LogEntry`

The MVP folders are:

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

## Non-negotiable rules

- Do not implement vector search in the MVP.
- Do not implement a graph database in the MVP.
- Do not implement MCP in the MVP.
- Do not implement autonomous entity merges.
- Do not implement autonomous contradiction resolution.
- Do not implement full meeting-transcript ingestion.
- Do not implement autonomous background linting.
- Do not create standalone Decision, OpenQuestion, or Explanation pages in the MVP.
- Do not write canonical memory pages directly from ingestion logic.
- All multi-file mutations must go through transactions.
- Every durable claim must cite at least one Event ID.
- Unknown system/project/context scope must be staged, not promoted as active truth.
- Do not create committed follow-ups without explicit trigger phrases.
- Do not auto-merge people or topics.
- Do not delete memory in the MVP; use `archived` or `rejected` states.

## Canonical state model

Only these top-level object states are allowed:

```yaml
object_state: active | archived
review_state: none | staged | reviewed | contested
```

Every claim block must use exactly these state fields:

```yaml
claim_state: active | staged | superseded | rejected
claim_kind: fact | inference | assumption | preference | commitment
evidence_strength: explicit | inferred | weak
scope_state: complete | partial | unknown
```

Do not introduce generic `status`, `classification`, or `confidence` fields for MVP memory objects.

## Temporal model

Use these four time fields only:

```yaml
recorded_at: <when the memory system recorded the item>
observed_at: <when the event happened, if known>
valid_from: <when the claim became true, if known>
valid_to: <when the claim stopped being true, if known>
```

Rules:

- `recorded_at` must not be automatically treated as `valid_from`.
- `observed_at` must not be automatically treated as `valid_from`.
- `"Joe is the DBA"` does not imply when Joe became DBA.
- `"Today I talked with Joe"` gives `observed_at` for the interaction, not `valid_from` for any derived claim.

## Follow-up extraction policy

Committed follow-ups require explicit trigger language, such as:

- `Remind me to X`
- `I need to X`
- `I have to X`
- `I will X`
- `I'll X`
- `Please track X`
- `Add a follow-up to X`
- `Joe asked me to X`
- `Due by DATE`
- `By DATE I need to X`

Candidate follow-ups may be created only for weaker intent, such as:

- `Maybe I should X`
- `We should probably X`
- `It might be worth asking X`
- `Need to understand X` without owner
- `I wonder if we should X`
- `Could follow up on X`

Do not create a follow-up from statements like:

- `Today I talked about X`
- `We discussed X`
- `Joe mentioned X`
- `Mike cares about X`
- `X came up`
- `We talked with Joe about X`

## Entity resolution policy

Entity resolution states:

- `exact_match`
- `alias_match`
- `near_match`
- `new_entity`
- `ambiguous`

Rules:

- `exact_match` can update automatically.
- `alias_match` can update automatically only if the alias is already canonical.
- `near_match` must stage review.
- `ambiguous` must stage review.
- `new_entity` can be automatic only for low-risk Person or Topic creation.
- Entity merges are deferred and require review.
- False splits are tolerable; false merges corrupt memory.

## Supported MVP mutation operations

Allowed:

- `ADD_EVENT`
- `UPSERT_CLAIM`
- `STAGE_REVIEW`
- `NOOP`
- `SUPERSEDE_CLAIM`
- `CLOSE_FOLLOWUP`

Explicitly deferred:

- `MERGE`
- `SPLIT`
- `DELETE`
- `AUTO_RESOLVE_CONTRADICTION`

If a task asks for a deferred operation, implement staging/detection only.

## Validation requirements

Before applying any transaction, validate:

- frontmatter validity;
- claim block validity;
- source Event links;
- wikilinks;
- unique IDs;
- no committed follow-up without explicit trigger;
- no active system/context claim with `scope_state: unknown`;
- summary basis;
- no ambiguous entity update without staging;
- transaction rollback/repair notes.

Validation failure behavior:

1. Do not apply canonical page edits.
2. Preserve the Event.
3. Keep the transaction `pending` or mark it `failed`.
4. Create or update a ReviewItem.
5. Append a log entry.

## Required commands

Before completing any coding task, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

If the task changes ingestion, validation, transactions, follow-up extraction, retrieval, entity resolution, linting, or evaluation, also run:

```bash
pnpm eval:mvp
```

If a command cannot run because the repo is not scaffolded yet, document why and add the missing scaffold as part of the task only if it is in scope.

## Required tests for behavior changes

Add or update tests for any change touching:

- transaction application;
- partial write failure;
- schema validation;
- committed follow-up detection;
- entity resolution;
- unscoped claim staging;
- current-summary generation;
- retrieval context packing.

## Review guidelines

Flag as P1 any change that:

- bypasses transactions;
- writes active claims without Event evidence;
- promotes unscoped claims;
- creates committed follow-ups without trigger phrases;
- introduces vector/graph/MCP dependencies into MVP code;
- auto-merges people or topics;
- auto-resolves contradictions;
- deletes memory instead of archiving/rejecting;
- writes to `.obsidian/`;
- lets summaries become canonical truth.

## PR process

For every implementation PR:

1. Create a task-scoped branch.
2. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm eval:mvp`.
3. Open the PR with a concise summary, validation results, and known limitations.
4. Request `@codex` review.
5. Fix P0/P1 findings only unless a human reviewer explicitly asks for broader cleanup.
6. Merge only after human inspection confirms the transaction, validation, and review invariants still hold.

## Coding style

- Prefer simple deterministic code over clever LLM-dependent behavior.
- Keep core logic independent from Pi, Obsidian, and Codex runtime APIs.
- Put deterministic semantics in `packages/core`.
- Put CLI wrappers in `packages/cli`.
- Put Pi-specific integration in `packages/pi-extension` or `.pi/extensions/work-memory`.
- Keep file formats readable by both humans and LLMs.
- Avoid introducing dependencies unless they simplify parsing, validation, or testing materially.

## Definition of done

A task is complete only when:

- it stays inside the authorized scope;
- it preserves the MVP constraints;
- required commands pass;
- relevant tests are added or updated;
- behavior changes are documented;
- known limitations are stated explicitly.
