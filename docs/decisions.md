# Architecture Decisions

This file records architecture decisions for the local-first AI work-memory assistant.

Format:

```text
ADR-NNN — Title
Status: Proposed | Accepted | Superseded | Rejected
Date: YYYY-MM-DD
Context
Decision
Consequences
Deferred work
```

---

## ADR-001 — Markdown is the canonical memory store

Status: Accepted  
Date: 2026-05-20

### Context

The assistant must maintain durable work memory that can be inspected, edited, diffed, versioned, and read by both humans and LLMs.

The system should not depend on opaque vector stores, graph databases, or vendor-specific memory APIs as the source of truth.

### Decision

Canonical memory lives as Markdown files under `memory/`.

Derived artifacts may exist under `memory/indexes/` or outside the vault, but they are rebuildable from Markdown.

### Consequences

Positive:

- Human-readable memory.
- Easy Git diffs and rollbacks.
- Obsidian can serve as the UI.
- LLMs can read canonical state directly.

Negative:

- Schema validation is required.
- Markdown drift is a real risk.
- Parsing and mutation must be disciplined.

### Deferred work

- Optional vector index.
- Optional graph-like relation index.
- Optional MCP integration.

---

## ADR-002 — Event first, fact second

Status: Accepted  
Date: 2026-05-20

### Context

Raw work notes and conversations are noisy. If the assistant directly writes “facts” from raw utterances, errors become hard to audit.

Example:

```text
Today I talked with Joe about pgvector for storing CLIP embeddings of product pictures.
```

This is first an observation event, not a final architectural decision.

### Decision

Every meaningful ingest creates an Event before any current-state page is mutated.

Events preserve raw input and extraction candidates.

Current-state pages hold structured claims that cite Event IDs.

### Consequences

Positive:

- Durable provenance.
- Easier debugging.
- Safer re-extraction.
- Temporal questions become possible.

Negative:

- More files.
- Event granularity must be managed.
- Retrieval must avoid dumping too many raw Events into context.

### Deferred work

- Source-event granularity A/B test.
- Full transcript sectioning.

---

## ADR-003 — Transactions guard multi-file mutations

Status: Accepted  
Date: 2026-05-20

### Context

One note can affect many files:

- Event file;
- Person page;
- Topic page;
- Review item;
- Log entry.

Without a transaction layer, partial failures can corrupt the vault.

### Decision

All multi-file mutations go through Transaction files.

Transactions have states:

```text
pending | applied | rejected | failed
```

Supported MVP operations:

```text
ADD_EVENT
UPSERT_CLAIM
STAGE_REVIEW
NOOP
SUPERSEDE_CLAIM
CLOSE_FOLLOWUP
```

### Consequences

Positive:

- Auditable changes.
- Validation before write.
- Partial failure recovery.
- Human review boundary.

Negative:

- More implementation work.
- More files to manage.
- Requires tooling for apply/reject.

### Deferred work

- Transaction UI in Pi.
- Better rollback tooling.
- Transaction compaction or archival.

---

## ADR-004 — Reduce MVP object model

Status: Accepted  
Date: 2026-05-20

### Context

The full design includes many object types: Person, Project, System, Meeting, SourceEvent, Decision, OpenQuestion, FollowUp, Topic, Explanation, Claim, Contradiction, MaintenanceReport.

This is too broad for the first implementation.

### Decision

The MVP has only these object types:

```text
Event
Person
Context
Topic
FollowUp
ReviewItem
Transaction
LogEntry
```

Deferred types live inside MVP objects:

| Deferred type | MVP placement |
|---|---|
| Project | Context |
| System | Context |
| Decision | Context or ReviewItem section |
| OpenQuestion | Context, Topic, or ReviewItem section |
| Explanation | Not persisted unless explicitly saved or repeatedly requested |
| Contradiction | ReviewItem |
| MaintenanceReport | ReviewItem or LogEntry |
| Claim | Embedded structured block |

### Consequences

Positive:

- Smaller implementation.
- Less file explosion.
- Less premature taxonomy.
- Easier validation.

Negative:

- Some concepts are less explicit initially.
- Context may become broad if not monitored.

### Deferred work

- Promote Decision/OpenQuestion/Explanation to standalone pages only after real usage proves value.

---

## ADR-005 — Conservative follow-up extraction

Status: Accepted  
Date: 2026-05-20

### Context

A daily work assistant can become unusable if casual statements turn into fake obligations.

Example:

```text
We discussed asking Joe.
```

This must not become a committed task.

### Decision

Committed follow-ups require explicit trigger phrases:

```text
Remind me to X
I need to X
I have to X
I will X
I'll X
Please track X
Add a follow-up to X
Joe asked me to X
Due by DATE
By DATE I need to X
```

Candidate follow-ups are allowed only for weaker intent phrases.

No follow-up is created for casual mention/discussion phrases.

### Consequences

Positive:

- Higher task precision.
- Less review noise.
- Fewer fake obligations.

Negative:

- Some real implied tasks may be missed.
- User may need to phrase commitments explicitly.

### Deferred work

- Learn user-specific follow-up phrasing after MVP evaluation.
- Add review-assisted promotion from candidate to committed.

---

## ADR-006 — Unknown scope must stage

Status: Accepted  
Date: 2026-05-20

### Context

Work facts often depend on team, project, system, environment, client, or time.

Example:

```text
We use MySQL.
```

This is explicit but not scoped.

### Decision

System/project/context claims with unknown scope are staged. They cannot become active global truth.

### Consequences

Positive:

- Prevents overgeneralization.
- Keeps uncertainty visible.
- Reduces contradictions.

Negative:

- More review items.
- User may need to clarify scope.

### Deferred work

- Scope inference from active context.
- User-defined default context.

---

## ADR-007 — No auto-merge in MVP

Status: Accepted  
Date: 2026-05-20

### Context

False entity merges are costly. If Joe the DBA and Joe from sales are merged, the memory becomes corrupted.

### Decision

The MVP never auto-merges people or topics.

Entity states:

```text
exact_match
alias_match
near_match
new_entity
ambiguous
```

Only exact and canonical alias matches can update automatically. Near and ambiguous matches stage review.

### Consequences

Positive:

- Prevents irreversible identity corruption.
- Keeps entity uncertainty visible.

Negative:

- False splits may occur.
- Review burden increases.

### Deferred work

- Assisted merge UI.
- Alias management workflow.
- Duplicate detection lint.

---

## ADR-008 — Summaries are generated views, not truth

Status: Accepted  
Date: 2026-05-20

### Context

Natural-language summaries are useful for LLM context, but they can drift from structured claims after repeated edits.

### Decision

Structured claims are canonical.

Current summaries are generated views and must be regenerated from active claims or omitted in the MVP.

### Consequences

Positive:

- Prevents unsupported mini-facts.
- Keeps evidence model clean.
- Enables summary drift tests.

Negative:

- Summaries need regeneration.
- Pages may feel less polished early.

### Deferred work

- Summary generation pipeline.
- Summary provenance via `summary_generated_from`.
- Summary drift validator.

---

## ADR-009 — Lexical retrieval first

Status: Accepted  
Date: 2026-05-20

### Context

Vector search and graph traversal are useful but can hide schema and mutation problems if introduced too early.

### Decision

The MVP uses:

- exact entity lookup;
- lexical search;
- wikilinks;
- structured frontmatter;
- current pages first;
- Events only when needed.

Vector and graph indexes are deferred.

### Consequences

Positive:

- Simpler implementation.
- Easier debugging.
- Prevents search index from becoming canonical.

Negative:

- Some semantic retrieval misses.
- Less flexible discovery.

### Deferred work

- Evaluate retrieval misses.
- Add derived vector index only if lexical/wikilink retrieval fails real scenarios.

---

## ADR-010 — Pi is runtime, Codex is builder

Status: Accepted  
Date: 2026-05-20

### Context

The target runtime is Pi Agent Harness with an optional env-configured extraction provider and Obsidian. Implementation will be done with Codex Pro.

### Decision

Use:

```text
Obsidian = canonical markdown UI/store
Pi Agent Harness = runtime command/tool/agent shell
OpenAI-compatible extraction = optional candidate provider
Codex Pro = implementation agent
Git = audit/review/rollback
```

Codex should implement narrow, testable tasks, not invent the architecture.

### Consequences

Positive:

- Clear separation of runtime and implementation.
- Codex can work through PR-sized tasks.
- Pi extension wraps deterministic core behavior.

Negative:

- More initial scaffolding.
- Requires repo discipline and tests before runtime polish.

### Deferred work

- Pi extension after CLI and eval harness.
- Optional OpenAI-compatible candidate extraction after deterministic tests pass.

---

## ADR-011 — LLM output is candidate data only

Status: Accepted  
Date: 2026-05-20

### Context

An LLM provider can extract candidate claims, entities, scopes, and follow-ups. But direct LLM output is not safe enough to mutate durable memory.

### Decision

LLM output is candidate data only.

Deterministic validators and staging policies remain authoritative.

The LLM may propose:

- claims;
- entity matches;
- scopes;
- follow-ups;
- review items.

The LLM may not:

- write canonical pages directly;
- bypass transactions;
- bypass validators;
- auto-merge entities;
- auto-resolve contradictions;
- persist generated explanations without explicit save.

### Consequences

Positive:

- Better extraction without sacrificing safety.
- Bad model output becomes review/failure state.
- Evaluation remains meaningful.

Negative:

- More pipeline complexity.
- Some useful model suggestions may be blocked.

### Implementation notes

- Mocked provider output tests cover unsafe follow-ups, unscoped claims, ambiguous entities, malformed output, and generated explanation omission.
- The optional OpenAI-compatible provider is env-backed through `OPENAI_API_KEY`, `ASSISTO_OPENAI_MODEL`, and optional `ASSISTO_OPENAI_BASE_URL`.
- No model default is hard-coded; missing configuration creates candidate-review fallback output instead of network calls or canonical writes.

---

## ADR-012 — Local Workbench is a derived UI first

Status: Accepted
Date: 2026-05-25

### Context

Assisto needs a richer local review and retrieval surface than CLI text or Pi commands alone. The browser UI must not become a second source of truth or introduce an opaque runtime database.

### Decision

Add a dependency-light local Workbench package with a Node HTTP server and vanilla browser client.

The first Workbench slice is read-only. It serves derived JSON snapshots for:

- staged ReviewItems;
- Transactions;
- retrieval query results;
- FollowUps;
- memory health counts.

The server binds to `127.0.0.1` by default. Future write actions must call existing transaction-backed core helpers or validated wrappers.

### Consequences

Positive:

- A usable local Memory Workbench can grow without changing canonical storage.
- UI state is derived from markdown and can be rebuilt at any time.
- Review/action flows keep the same transaction boundary as CLI and Pi.

Negative:

- Browser tests and route tests are now part of the product surface.
- Health summaries need separate read-only checks before PR4 adds explicit staging actions.

### Deferred work

- Review resolution actions.
- Answer-basis contract rendering.
- Health center checks with explicit staging.
- Disposable session briefs.
- Browser E2E coverage and `eval:v4`.
