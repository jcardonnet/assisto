# Implementation Plan

## Goal

Build a local-first markdown work-memory assistant using Codex as the implementation agent, Pi Agent Harness as the runtime shell, and Obsidian as the canonical markdown UI/store.

The implementation must follow the reduced MVP from `docs/revised-design.md`.

The project should be built in this order:

```text
AGENTS.md
→ schema/types
→ validators
→ transactions
→ deterministic policies
→ CLI
→ eval harness
→ Pi extension
→ optional OpenAI-compatible extraction
→ optional search/indexes later
```

The dangerous part of the project is not calling a model. The dangerous part is letting any agent mutate durable work memory without provenance, scope, staging, validation, and rollback.

## v2 implementation track

v2 keeps the MVP safety model and adds an automated testing pyramid around the expanded behavior.

Current v2 scope:

- candidate extraction pipeline: span detection -> detector/provider proposals -> entity resolution -> policy/staging -> transaction builder;
- provider-ready LLM-assisted extraction, with provider output treated as candidate data only;
- context-aware scope handling for existing Context exact/alias matches, with new/near/ambiguous context scope staged;
- transaction-backed ReviewItem state changes for `reviewed`, `contested`, and `archived`;
- lexical retrieval over People, Topics, Contexts, aliases, linked ReviewItems, FollowUps, and source Events when needed;
- deterministic unit, integration, subprocess E2E, MVP eval, and v2 eval commands.

Still deferred:

- vector search;
- graph database;
- MCP integration;
- live LLM client wiring;
- autonomous merges;
- autonomous contradiction resolution;
- full transcript ingestion;
- standalone Decision, OpenQuestion, and Explanation pages;
- direct canonical writes from ingestion or provider extraction.

Validation for v2 behavior changes:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm eval:mvp
pnpm eval:v2
```

## v3 implementation track

v3 keeps the MVP safety model and hardens deterministic real-work behavior.

Current v3 scope:

- schema markdown mirrors the actual validator rules;
- org-chart extraction covers manager, title, and reports-to statements;
- current-page writes preserve existing claims, aliases, related links, and source Events;
- repeated claim IDs are deduped instead of appended;
- role/reporting changes stage ReviewItems instead of silently changing current pages;
- staged ReviewItems can be applied through a new pending Transaction;
- existing Events can be reprocessed into a new pending Transaction without rewriting raw Event text;
- `pnpm eval:v3` checks deterministic hardening metrics.

Still deferred:

- live LLM client wiring;
- vector search;
- graph database;
- MCP integration;
- autonomous merges;
- autonomous contradiction resolution;
- full transcript ingestion.

Validation for v3 behavior changes:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm eval:mvp
pnpm eval:v2
pnpm eval:v3
```

## v4 implementation track

v4 keeps the deterministic safety model and adds the local Memory Workbench surface.

Current v4 scope:

- local Workbench shell and read APIs;
- transaction-backed review resolution actions from the UI;
- structured answer-basis retrieval output;
- memory health checks and explicit health review staging;
- disposable session briefs;
- browser-style E2E and `pnpm eval:v4` safety gates.

Validation for v4 Workbench, retrieval, health, brief, or eval behavior changes:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm eval:mvp
pnpm eval:v2
pnpm eval:v3
pnpm eval:retrieval
pnpm eval:v4
```

## v5 dogfood track

v5 keeps the deterministic safety model and makes the Workbench useful for daily dogfooding.

Current v5 scope:

- Workbench-first capture with CLI parity;
- optional OpenAI-compatible extraction as candidate-only input with deterministic validation;
- Today Home for pending transactions, staged reviews, stale NOOP Events, follow-ups, recent activity, and health warnings;
- curated Markdown/text backfill import that writes one Event plus one pending Transaction per unit and dedupes by optional Event `source_hash`;
- People/Topics/Contexts explorer and stewardship actions that stage alias or Context metadata changes as pending Transactions, with ambiguous links surfaced as ReviewItems.

Still deferred:

- vector search;
- graph database;
- MCP integration;
- autonomous entity merges;
- autonomous contradiction resolution;
- full transcript ingestion;
- generated explanation persistence.

Validation for v5 capture/import/today behavior changes:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm eval:mvp
pnpm eval:v2
pnpm eval:v3
pnpm eval:retrieval
pnpm eval:v4
pnpm test:browser
```

---

## Principles for using Codex

Use Codex as a controlled implementation agent.

Do not ask Codex to:

```text
"Build the assistant"
"Implement memory"
"Make it smart"
"Add search"
"Integrate everything"
```

Instead, use narrow tasks with:

- exact authorized file paths;
- explicit forbidden scope;
- required invariants;
- validation commands;
- definition of done.

Every Codex task should follow this shape:

```text
Task:
<one narrow deliverable>

Authorized files:
<exact paths Codex may edit>

Forbidden:
- vector search
- graph DB
- MCP
- autonomous merge
- auto contradiction resolution
- direct canonical writes

Required invariants:
- all durable claims cite Event IDs
- all multi-file mutations use transactions
- unscoped system/context claims stage
- committed follow-ups require explicit trigger

Validation:
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm eval:mvp if behavior changed

Definition of done:
<specific observable outcome>
```

---

## Review Guidelines

When Codex is asked to review a PR, it should prioritize bugs, corruption risks, behavioral regressions, and missing tests. Flag as P1 any change that:

- bypasses transactions;
- writes active claims without Event evidence;
- promotes unscoped claims;
- creates committed follow-ups without trigger phrases;
- adds vector, graph DB, or MCP dependencies to MVP code;
- auto-merges people or topics;
- auto-resolves contradictions;
- deletes memory instead of staging, rejecting, or archiving;
- writes to `.obsidian/`.

---

## Phase 0 — Scaffold repository

### Goal

Create a repository that encodes the architecture before implementation starts.

### Deliverables

```text
AGENTS.md
README.md
docs/revised-design.md
docs/implementation-plan.md
docs/decisions.md

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

packages/
  core/
  cli/
  pi-extension/

.pi/
  extensions/
  skills/
    work-memory-ingest/SKILL.md
    work-memory-retrieve/SKILL.md
    work-memory-review/SKILL.md
    work-memory-lint/SKILL.md
  prompts/

tests/
  fixtures/
  scenarios/
  golden/
```

### Codex prompt

```text
Create the initial TypeScript monorepo for work-memory-assistant.

Implement only:
- pnpm workspace
- package.json scripts
- tsconfig base
- AGENTS.md
- README.md
- docs/*
- memory/ folder skeleton
- packages/core empty package
- packages/cli empty package
- packages/pi-extension empty package
- .pi folder skeleton
- tests/fixtures, tests/scenarios, tests/golden

Do not implement runtime logic yet.

Required scripts:
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm eval:mvp

Definition of done:
- all commands exist
- all commands pass even if only placeholder tests exist
```

### Success criteria

- Repo scaffolds cleanly.
- Codex can run the required commands.
- `AGENTS.md` is present at repo root.

---

## Phase 1 — Core domain model and validators

### Goal

Define the deterministic schema and validation layer before any ingestion or runtime integration exists.

### Authorized files

```text
packages/core/src/model/**
packages/core/src/validators/**
packages/core/src/markdown/**
tests/**
```

### Deliverables

- TypeScript types for MVP objects.
- Frontmatter parser/serializer.
- Claim block parser.
- Validators:
  - frontmatter validity;
  - claim block validity;
  - source Event links;
  - wikilinks;
  - unique IDs;
  - no committed follow-up without explicit trigger;
  - no active system/context claim with `scope_state: unknown`;
  - summary basis;
  - no ambiguous entity update without staging;
  - transaction rollback notes.

### Codex prompt

```text
Implement Phase 1: core schema and validators.

Scope:
Only modify packages/core/src/** and tests/**.

Implement TypeScript types for:
- Event
- Person
- Context
- Topic
- FollowUp
- ReviewItem
- Transaction
- LogEntry
- ClaimBlock

Allowed top-level states:
- object_state: active | archived
- review_state: none | staged | reviewed | contested

Allowed claim fields:
- claim_state: active | staged | superseded | rejected
- claim_kind: fact | inference | assumption | preference | commitment
- evidence_strength: explicit | inferred | weak
- scope_state: complete | partial | unknown

Implement validators:
- validate-frontmatter
- validate-claim-blocks
- validate-source-event-links
- validate-wikilinks
- validate-unique-ids
- validate-no-committed-followup-without-trigger
- validate-no-active-system-claim-with-scope-unknown
- validate-summary-basis
- validate-no-ambiguous-entity-update
- validate-transaction-rollback

Do not implement ingestion, retrieval, Pi, MCP, vector search, or graph search.

Tests:
- missing Event evidence fails
- invalid enum fails
- duplicate IDs fail
- active system/context claim with scope_state: unknown fails
- committed follow-up without trigger fails
- staged communication inference passes
```

### Success criteria

- Validators fail closed.
- Invalid memory files cannot be applied by later transaction logic.
- Negative tests cover the main corruption modes.

---

## Phase 2 — Transaction engine

### Goal

Make transactions the only allowed multi-file mutation mechanism.

### Authorized files

```text
packages/core/src/transactions/**
packages/core/src/markdown/**
packages/core/src/fs/**
tests/**
```

### Supported operations

```text
ADD_EVENT
UPSERT_CLAIM
STAGE_REVIEW
NOOP
SUPERSEDE_CLAIM
CLOSE_FOLLOWUP
```

### Explicitly unsupported operations

```text
MERGE
SPLIT
DELETE
AUTO_RESOLVE_CONTRADICTION
```

### Codex prompt

```text
Implement Phase 2: transaction engine.

Implement:
- Transaction parser/serializer
- transaction states: pending | applied | rejected | failed
- supported operations:
  - ADD_EVENT
  - UPSERT_CLAIM
  - STAGE_REVIEW
  - NOOP
  - SUPERSEDE_CLAIM
  - CLOSE_FOLLOWUP
- reject unsupported operations:
  - MERGE
  - SPLIT
  - DELETE
  - AUTO_RESOLVE_CONTRADICTION
- validateTransaction()
- applyTransaction()
- rejectTransaction()
- markTransactionFailed()

Rules:
- applying a transaction must validate first
- canonical page writes must happen only through applyTransaction()
- failed partial application must leave repair notes
- preserve Events even if a later mutation fails

Tests:
- Joe/MySQL transaction creates Event, Joe claim, and staged unscoped MySQL review item
- partial write failure leaves transaction failed and repairable
- unsupported MERGE/DELETE/AUTO_RESOLVE_CONTRADICTION fails validation
```

### Success criteria

- No canonical write can bypass transaction application in core code.
- Partial write failure is recoverable.
- Transaction files are readable markdown.

---

## Phase 3 — Deterministic policies

### Goal

Implement the hard gates that prevent fake obligations, false merges, and unscoped truth.

### Authorized files

```text
packages/core/src/policies/**
tests/**
```

### Deliverables

- Follow-up extraction policy.
- Staging policy.
- Entity resolution policy.

### Codex prompt

```text
Implement deterministic MVP policies.

Implement:
1. Follow-up policy:
   committed triggers:
   - "remind me to"
   - "I need to"
   - "I have to"
   - "I will"
   - "I'll"
   - "please track"
   - "add a follow-up"
   - "asked me to"
   - "due by"
   - "by DATE I need to"

   candidate triggers:
   - "maybe I should"
   - "we should probably"
   - "it might be worth"
   - "need to understand"
   - "I wonder if we should"
   - "could follow up"

   no-follow-up patterns:
   - "we discussed"
   - "today I talked about"
   - "mentioned"
   - "cares about"
   - "came up"
   - "we talked with"

2. Staging policy:
   Stage when:
   - scope missing for system/project/architecture claim
   - entity resolution is near_match or ambiguous
   - claim changes role, owner, decision, deadline, or commitment
   - claim conflicts with active claim in same scope
   - possible action lacks explicit commitment
   - person communication guidance is inferred
   - generated explanation would become durable without explicit save

3. Entity resolution states:
   - exact_match
   - alias_match
   - near_match
   - new_entity
   - ambiguous

Tests:
- fake obligation stress test
- Joe/Joseph/Joey ambiguity
- MySQL unscoped claim staging
- Mike communication inference staging
```

### Success criteria

- Committed follow-ups are conservative.
- Unknown scope stages.
- Ambiguous identity stages.

---

## Phase 4 — Minimal CLI

### Goal

Provide a deterministic local interface before Pi integration.

### Authorized files

```text
packages/cli/**
packages/core/**
tests/**
```

### Commands

```text
wm validate
wm tx list
wm tx show <id>
wm tx apply <id>
wm tx reject <id> --reason <text>
wm ingest --dry-run "<note>"
wm ingest "<note>"
wm review inbox
wm ask --pack-context "<question>"
wm ask --answer-basis "<question>"
wm health check
wm health check --stage-review --note "<text>"
wm brief <today|person|context|review|followups> [id|path]
wm today [--json]
```

### Codex prompt

```text
Implement packages/cli.

Commands:
- wm validate
- wm tx list
- wm tx show <id>
- wm tx apply <id>
- wm tx reject <id> --reason <text>
- wm ingest --dry-run "<note>"
- wm ingest "<note>"
- wm review inbox
- wm ask --pack-context "<question>"
- wm ask --answer-basis "<question>"
- wm brief <today|person|context|review|followups> [id|path]
- wm today [--json]

Rules:
- ingest creates Event + pending Transaction
- ingest does not directly edit canonical pages
- ask only creates a context pack; it does not generate final model answer
- brief only creates a disposable derived view; it does not persist generated explanation text
- today only creates a derived daily workbench summary; it does not persist completion state
- no LLM calls yet; use fixture/rule-based extraction for MVP tests

Tests:
- temp vault integration tests
- ingest Joe/MySQL creates pending transaction and review item
- apply transaction updates files only after validation
- ask Solr/Qdrant loads Joe, Mike, Solr, Qdrant pages when present
```

### Success criteria

- The system can be exercised end-to-end without Pi.
- CLI integration tests use temporary vaults.
- No command bypasses the transaction engine.

---

## Phase 5 — MVP evaluation harness

### Goal

Make the design measurable before runtime polish.

### Authorized files

```text
tests/scenarios/**
tests/fixtures/**
tests/golden/**
packages/core/**
packages/cli/**
```

### Required scenario suites

- ingestion precision benchmark;
- source-event granularity A/B;
- follow-up extraction stress test;
- entity resolution torture test;
- temporal supersession test;
- summary drift test;
- review backlog simulation;
- retrieval context packing test;
- markdown noise endurance test;
- multi-file rollback test.

### Acceptance thresholds

```text
Committed follow-up precision >= 95%
Duplicate-person false merge rate = 0%
Unscoped system claims auto-promoted = 0%
Source citation coverage for factual context packs >= 95%
Transaction validation failure caught before write = 100%
Summary unsupported-claim rate = 0%
Broken-link rate after applied transactions = 0%
```

### Codex prompt

```text
Implement pnpm eval:mvp.

Add scenario files under tests/scenarios:
- ingestion precision benchmark
- source-event granularity A/B
- follow-up extraction stress test
- entity resolution torture test
- temporal supersession test
- summary drift test
- review backlog simulation
- retrieval context packing test
- markdown noise endurance test
- multi-file rollback test

Add metrics:
- committed follow-up precision
- duplicate-person false merge rate
- unscoped system claims auto-promoted
- source citation coverage for factual context packs
- transaction validation failure caught before write
- summary unsupported-claim rate
- broken-link rate after applied transactions

Fail eval:mvp if thresholds fail.
```

### Success criteria

- `pnpm eval:mvp` fails on unsafe behavior.
- The eval suite becomes the gate before any LLM extraction or Pi integration.

---

## Phase 6 — Pi extension wrapper

### Goal

Wrap the deterministic core and CLI in Pi runtime tools and commands.

### Authorized files

```text
packages/pi-extension/**
.pi/**
packages/cli/**
```

### Tools

- `wm_validate`
- `wm_ingest_note`
- `wm_list_transactions`
- `wm_show_transaction`
- `wm_apply_transaction`
- `wm_reject_transaction`
- `wm_review_inbox`
- `wm_list_review_items`
- `wm_show_review_item`
- `wm_mark_review_item`
- `wm_review_apply_staged`
- `wm_events_reprocess`
- `wm_pack_context`
- `wm_lint`

### Commands

- `/wm-ingest`
- `/wm-review`
- `/wm-review-show`
- `/wm-review-mark`
- `/wm-review-apply`
- `/wm-event-reprocess`
- `/wm-apply`
- `/wm-ask`
- `/wm-validate`
- `/wm-lint`

### Codex prompt

```text
Implement the Pi extension wrapper.

Scope:
Only modify packages/pi-extension/** and .pi/**.

Create .pi/extensions/work-memory/index.ts.

Register tools:
- wm_validate
- wm_ingest_note
- wm_list_transactions
- wm_show_transaction
- wm_apply_transaction
- wm_reject_transaction
- wm_review_inbox
- wm_list_review_items
- wm_show_review_item
- wm_mark_review_item
- wm_review_apply_staged
- wm_events_reprocess
- wm_pack_context
- wm_lint

Register commands:
- /wm-ingest
- /wm-review
- /wm-review-show
- /wm-review-mark
- /wm-review-apply
- /wm-event-reprocess
- /wm-apply
- /wm-ask
- /wm-validate
- /wm-lint

Add path protections:
- block direct writes to memory/people, memory/topics, memory/contexts, memory/followups unless invoked through wm_apply_transaction
- block writes to .obsidian/
- warn on any write outside memory/ and .pi/

Do not implement MCP.
Do not implement vector search.
Do not implement autonomous background linting.

Create Pi skills:
- `.pi/skills/work-memory-ingest/SKILL.md`
- `.pi/skills/work-memory-retrieve/SKILL.md`
- `.pi/skills/work-memory-review/SKILL.md`
- `.pi/skills/work-memory-lint/SKILL.md`

Each skill must document setup/check commands, exact workflow, forbidden behavior, invariants, and references to the `wm` CLI commands.

Tests:
- extension tools call core/cli behavior
- direct canonical write attempt is blocked
- transaction apply path is allowed
```

### Success criteria

- Pi can invoke the same validated flows as the CLI.
- The extension does not own memory semantics; core does.
- Runtime write protection blocks direct canonical edits.

---

## Phase 7 — Optional OpenAI-compatible extraction

### Goal

Allow an env-configured OpenAI-compatible provider to propose candidate claims without becoming the authority.

### Rule

LLM output is candidate data only. Deterministic validators and staging policies remain authoritative.

The live provider requires `OPENAI_API_KEY` and `ASSISTO_OPENAI_MODEL`; no model default is hard-coded. `ASSISTO_OPENAI_BASE_URL` may point at an OpenAI-compatible endpoint.

### Codex prompt

```text
Add LLM-assisted extraction as an optional provider.

Rules:
- LLM output is candidate data only.
- Deterministic validators and staging policies remain authoritative.
- The LLM may propose claims, entities, scopes, and follow-ups.
- The LLM may not directly write canonical pages.
- The LLM may not bypass transaction validation.
- If extraction output is malformed, create Event + failed/staged review item.

Add tests with mocked LLM outputs:
- over-eager follow-up creation is rejected
- unscoped system claim is staged
- ambiguous entity is staged
- generated explanation is not persisted without explicit save
- missing OpenAI environment returns staged review/fallback output
- malformed OpenAI responses are never persisted as canonical claims
```

### Success criteria

- Bad LLM output cannot corrupt memory.
- Malformed output becomes review/failure state, not canonical state.

---

## Phase 8 — Optional retrieval indexes

### Goal

Add derived search only after lexical/wikilink retrieval misses are observed.

### In scope later

- derived lexical index;
- optional embeddings;
- optional graph-like relation index.

### Still forbidden as canonical state

- vector DB as memory;
- graph DB as memory;
- search index as source of truth.

### Success criteria

- Indexes can be deleted and rebuilt from `memory/`.
- Retrieval improves measured scenario results.
- No canonical memory relies on index-only data.

---

## PR strategy

Use one branch per task:

```text
chore/scaffold
feat/core-model
feat/markdown-parser
feat/validators
feat/transaction-engine
feat/policies
feat/cli
feat/eval-harness
feat/pi-extension
feat/llm-extraction
```

For each PR:

1. Create a task-scoped branch.
2. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm eval:mvp`.
3. Open a PR with a concise summary, validation results, and known limitations.
4. Request `@codex` review.
5. Fix P0/P1 findings only unless a human reviewer explicitly asks for broader cleanup.
6. Merge only after human inspection confirms the transaction, validation, and review invariants still hold.

---

## Definition of MVP complete

The MVP is complete when:

```text
- 50 realistic notes can be ingested through transactions.
- All active durable claims cite Events.
- No committed follow-up is created from casual mentions.
- No unscoped system/context claim is auto-promoted.
- Ambiguous entity matches stage review.
- Transaction partial failure is recoverable.
- Retrieval can pack context for Joe/Mike/Solr/Qdrant scenario.
- All validators and eval thresholds pass.
- Obsidian can inspect and edit the markdown without breaking schemas.
```

At that point, and only then, consider adding LLM-assisted extraction, vector retrieval, graph-like derived indexes, MCP, or richer transcript ingestion.
