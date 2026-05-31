# Architecture Decisions

This file records durable architecture decisions for Assisto.

## ADR-001 — Markdown Is The Canonical Memory Store

Status: Accepted  
Date: 2026-05-20

Canonical work memory lives as markdown under `memory/`. Indexes, embeddings, graph-shaped views, search artifacts, packs, Workbench/session state, and generated outputs are derived and rebuildable.

## ADR-002 — Event First, Fact Second

Status: Accepted  
Date: 2026-05-20

Every meaningful ingest creates an Event before current-state pages are mutated. Events preserve raw input and extraction candidates. Durable claims cite Event IDs.

## ADR-003 — Transactions Guard Multi-File Mutations

Status: Accepted  
Date: 2026-05-20

All multi-file mutations go through Transaction files. The supported operations are `ADD_EVENT`, `UPSERT_CLAIM`, `STAGE_REVIEW`, `NOOP`, `SUPERSEDE_CLAIM`, and `CLOSE_FOLLOWUP`.

## ADR-004 — Reduced Canonical Object Model

Status: Accepted  
Date: 2026-05-20

Canonical MVP object types are `Event`, `Person`, `Context`, `Topic`, `FollowUp`, `ReviewItem`, `Transaction`, and `LogEntry`.

Deferred objects remain sections or derived outputs:

| Deferred type | Placement |
|---|---|
| Project | Context |
| System | Context |
| Decision | Context or ReviewItem section |
| OpenQuestion | Context, Topic, or ReviewItem section |
| Explanation | Not persisted unless explicitly saved through a reviewed Transaction; repeated requests stage an explanation candidate only |
| Contradiction | ReviewItem |
| MaintenanceReport | LogEntry or ReviewItem candidate |
| Claim | Embedded structured block |

## ADR-005 — Conservative Follow-Up Extraction

Status: Accepted  
Date: 2026-05-20

Committed FollowUps require explicit trigger phrases. Casual discussion phrases do not create committed tasks.

## ADR-006 — Unknown Scope Must Stage

Status: Accepted  
Date: 2026-05-20

System/project/context claims with unknown scope are staged. They cannot become active global truth.

## ADR-007 — No Auto-Merge

Status: Accepted  
Date: 2026-05-20

Near and ambiguous entity matches stage review. False splits are tolerable; false merges corrupt memory.

## ADR-008 — Summaries Are Generated Views

Status: Accepted  
Date: 2026-05-20

Structured claims are canonical. Summaries are generated views and must not introduce unsupported facts.

## ADR-009 — Canonical Vs Derived State And Inference Laundering

Status: Accepted  
Date: 2026-05-31

Derived artifacts may guide, explain, preview, rank, and propose. Only Events, Transactions, validation, and review create durable memory.

Inference laundering is a P1 bug: generated, inferred, weakly supported, or retrieval-assembled text becoming durable truth without Event evidence and a validated Transaction.

## ADR-010 — Cited Answers And Evidence Hydration

Status: Accepted  
Date: 2026-05-31

`CitedAnswerContract` is derived query output. Direct answers require citations. Evidence Events for cited, high-impact, contested, sparse, or temporal claims are hydrated before final answer assembly.

## ADR-011 — Workbench, Briefs, Packs, And `.assisto-local` Are Noncanonical

Status: Accepted  
Date: 2026-05-31

Workbench state, daily progress, import sessions, pinned questions, eval question sets, context packs, hot packs, export packs, and briefs are noncanonical. Deleting `.assisto-local/**` must not corrupt memory.

## ADR-012 — Ontology Registry Is Schema/Policy, Not User Memory

Status: Accepted  
Date: 2026-05-31

Ontology registry files belong under `memory/schema/ontology/`. Derived ontology and symbolic artifacts belong under `memory/indexes/**`. Ontology policy does not create a canonical graph database and does not authorize automatic merges or contradiction resolution.

## ADR-013 — Symbolic Reasoning Is Derived-Only And Inference-Path-Backed

Status: Accepted  
Date: 2026-05-31

Symbolic reasoning may produce answer support, stale signals, conflict signals, derived relation hints, and review candidates. It may not write active canonical claims. Every symbolic result needs an inference path.

## ADR-014 — Source Adapters Normalize To Events And Pending Transactions

Status: Accepted  
Date: 2026-05-31

Source adapters preserve raw text, source hashes, observed/source labels, parser notes, and optional spans. Kept units create Events plus pending Transactions. Adapters never write current pages directly.

## ADR-015 — Repair, Adversarial Review, And Maintenance Findings Are Transaction-Backed

Status: Accepted  
Date: 2026-05-31

Repair actions are previews. Durable repair writes use Events and/or pending Transactions. Adversarial review may emit findings, ReviewItem candidates, or pending `STAGE_REVIEW` Transactions; it may not directly write canonical ReviewItems.

## ADR-016 — Graph, Vector, And MCP Remain Derived Or Optional

Status: Accepted  
Date: 2026-05-31

Semantic search and graph-shaped views may be evaluated as derived indexes only after lexical, wikilink, ontology, and symbolic retrieval fail measured evals. They may not outrank cited claims or source Events.
