# Revised Design: Assisto Local-First Work-Memory OS

## Source basis and revision status

This document revises the original **Design Synthesis for a Local-First AI Work-Memory Assistant** and applies the pasted senior-architect critique. The design keeps the original direction—an inspectable markdown-backed work-state compiler—but narrows the first implementation to a transaction-safe MVP.

Notation used in this document:

- **[DS]** refers to the original design synthesis. It is treated as the source for the initial layered model, object model, mutation operations, retrieval strategy, maintenance ideas, and roadmap.
- **[PA]** refers to the prior-art report. It is treated as evidence for the public-system landscape, including Karpathy-style LLM Wikis, Basic Memory, Obsidian/MCP tooling, LangMem, Mem0, Graphiti/Zep, CRM-style markdown systems, and meeting-ingestion systems.
- **[CR]** refers to the pasted senior-architect critique. It is treated as the source for the implementation discipline introduced here: transaction layer, reduced MVP, deterministic staging, stricter follow-up rules, schema validation, temporal-field separation, and evaluation thresholds.
- **[KW]** refers to Andrej Karpathy's LLM Wiki pattern: a persistent, markdown-based knowledge layer compiled from raw sources and maintained by an LLM or agent rather than rediscovered from raw chunks at query time.
- **[GC]** refers to public builder comments on that pattern, especially lessons about identity drift, relationship typing, stale wiki maintenance, claim-level provenance, ingestion-order bias, local tooling, concurrent writes, retrieval drift, and knowledge lifecycle design.

This document is not a framework selection. It is an architecture-neutral specification for a local-first markdown prototype.

---

## 1. Executive summary

The revised design is a **markdown-backed work-state compiler**. Its job is to turn messy work inputs—short notes, conversational statements, meeting observations, and direct corrections—into a persistent, source-backed, inspectable markdown memory.

The system is explicitly **not**:

- a generic chatbot memory layer;
- raw-note RAG over an unstructured vault;
- a vector database with a pleasant UI;
- a graph database project disguised as a note system;
- a meeting summarizer;
- a personal CRM alone;
- a fully autonomous agent that silently rewrites canonical knowledge.

The first implementation should prove one thing:

> A source-backed markdown mutation loop can ingest real work notes without creating fake obligations, duplicate people, unsupported summaries, stale role facts, or unscoped technical truths.

The original design correctly identified the strongest conceptual direction: new information should be captured as evidence first and only then compiled into typed current-state pages. It also correctly emphasized provenance, scope, temporal validity, staged mutations, and the separation between candidate follow-ups and committed obligations. [DS]

The prior-art report supports this direction but also shows that no mature public system cleanly combines all required properties: local-first markdown, durable compiled state, work-memory-specific schemas, entity resolution, temporal supersession, provenance, staged review, and maintenance workflows. Basic Memory, Karpathy-style LLM Wiki repos, Link, Graphiti/Zep, LangMem, Mem0, Obsidian/MCP tools, and CRM-style markdown systems each solve part of the problem, but not the whole design. [PA]

Therefore the MVP is intentionally small. It includes:

- immutable or append-only **Events** as source evidence;
- **Transactions** as the safety mechanism for multi-file mutations;
- a reduced set of current-state pages: **People**, **Contexts**, **Topics**, and **FollowUps**;
- **ReviewItems** for ambiguity, contradictions, duplicates, stale items, and unscoped claims;
- strict state fields and temporal fields;
- deterministic staging rules;
- conservative follow-up extraction;
- schema validation before any transaction is applied;
- lexical retrieval, wikilinks, and structured frontmatter before vector search or graph infrastructure.

The MVP defers vector search, graph databases, MCP integration, autonomous merges, autonomous contradiction resolution, standalone decision pages, standalone open-question pages, standalone explanation pages, full meeting-transcript ingestion, and autonomous background linting.

The durable invariant is simple:

```text
Raw input → Event → Candidate claims → Transaction → Validated mutation or staged review → Current pages
```

Search and indexes are derived. They can be rebuilt. Markdown files are canonical.

Human review is not universal, but it is mandatory for high-risk mutations: ambiguous entities, role changes, ownership changes, deadline changes, committed follow-ups, contradiction resolution, entity merges, deletion, and supersession of important current-state claims.

---


### Assisto vision: MVP core and Local Memory OS

This system is codenamed **Assisto**.

The MVP is the safe compiler core. The larger Assisto vision is a local work-memory operating system: a set of deterministic, cited, review-gated loops for compiling raw work traces into useful current-state memory, retrieving that memory with citations, inspecting entity and context risk, and repairing gaps without letting generated text become durable truth.

The post-MVP architecture adds cited answer assembly, entity stewardship, context operating rooms, source adapters, a derived ontology registry, symbolic reasoning, consolidation cycles, dogfood loops, and personal evaluation. These additions are **not** permission to weaken the MVP safety model. They are derived, explainable, rebuildable, and review-gated unless explicitly routed through the same Event and Transaction model as any other durable memory.

The central post-MVP rule is:

```text
Derived artifacts may guide, explain, and propose. Only Events, Transactions, validation, and review create durable memory.
```

---

## 1A. Epistemic integrity and inference laundering

**Epistemic integrity** means that Assisto must preserve the difference between evidence, extracted claims, inferred knowledge, generated answers, retrieval context, summaries, and durable current-state memory.

**Inference laundering** happens when generated, inferred, weakly supported, or retrieval-assembled text quietly becomes canonical truth. It is the failure mode where a plausible answer, a generated summary, a symbolic inference, or a context-pack sentence gets copied into memory and later treated as if it were evidence.

Assisto prevents inference laundering by treating the following as derived artifacts unless they are explicitly captured as evidence and routed through the canonical mutation path:

```text
generated answers
symbolic inferences
retrieval packs
context packs
hot packs
export packs
briefs
reasoning traces
summary drafts
Workbench/session state
```

The protected path remains:

```text
Raw input → Event → Candidate claims → Transaction → Validated mutation or staged review → Current pages
```

Rules:

```text
- A generated answer is not memory.
- A context pack is not memory.
- A symbolic inference is not memory.
- A brief is not memory.
- A reasoning trace is not memory.
- A generated summary is not canonical truth.
- Durable memory requires Event evidence and Transaction-backed validation/review.
```

## 1B. Canonical versus derived state

| Artifact | Canonical? | Notes |
|---|---:|---|
| Raw Event text | Yes | Preserved source evidence. |
| Active claim blocks | Yes | Must cite Event IDs. |
| Current-state markdown pages | Yes | People, Contexts, Topics, FollowUps. |
| Transactions | Yes | Mutation audit trail. |
| ReviewItems | Yes | Human review state. |
| Logs | Yes | Operational audit. |
| Indexes | No | Rebuildable. |
| ContextPack | No | Rebuildable query artifact. |
| HotPack | No | Temporary high-priority context for a work session. |
| ExportPack | No | Serialized context for another agent/tool. |
| BriefPack / generated brief | No | Disposable unless explicitly captured as evidence. |
| SymbolicMemoryGraph | No | Derived from canonical markdown and ontology. |
| CitedAnswerContract | No | Query output, not memory. |
| Workbench/session state | No | Runtime or UI state. |
| Generated explanation | No | Not persisted unless explicitly saved through Event/Transaction flow. |

Derived artifacts may guide retrieval, review, repair, and explanation. They may not outrank canonical markdown. They may become durable only by being captured as evidence and routed through a validated Transaction.

## 1C. Global boundary rule for post-MVP capabilities

Every post-MVP feature in this document must answer these questions:

1. Is this canonical or derived?
2. If canonical, what Event evidence supports it?
3. If it changes canonical memory, where is the Transaction?
4. If inferred, where is the inference path?
5. If generated, why is it not being persisted?
6. If ambiguous, why is it staged rather than promoted?
7. If a new layer is proposed, can it be rebuilt from markdown?
8. If an agent executes it, what prevents silent corruption?

Derived artifacts may guide, explain, rank, propose, and stage. They may not silently create or modify canonical memory.

## 1D. No new canonical object types without migration

New canonical object types require a design migration. Until then, post-MVP surfaces must be represented as sections on existing objects, ReviewItems, Transactions, Logs, or derived artifacts.

Decision, OpenQuestion, Explanation, OntologyView, SymbolicFact, Brief, EvalSession, WorkbenchSession, ContextRoom, CitedAnswerContract, ContextPack, HotPack, ExportPack, and SymbolicMemoryGraph are not canonical MVP objects.

## 1E. Write permission matrix

| Actor / Layer | May write Events | May write pending Transactions | May apply Transactions | May write current pages directly | May write derived indexes |
|---|---:|---:|---:|---:|---:|
| Ingestion | Yes | Yes | No | No | No |
| Capture UI | Yes | Yes | No | No | No |
| Import adapter | Yes | Yes | No | No | No |
| Review UI | Only explicit note capture | Yes | Through validated helper only | No | No |
| Transaction applier | No | No | Yes | Yes, via transaction only | No |
| Health checker | No | Optional pending Transaction | No | No | Yes |
| Adversarial review | No | Yes, `STAGE_REVIEW` only | No | No | Yes |
| Symbolic reasoner | No | Optional review candidate Transaction | No | No | Yes |
| Retrieval / Ask | No | No, except explicit repair preview | No | No | Optional query cache |
| Brief builder | No | No | No | No | No |
| Workbench session state | No | No | No | No | Local `.assisto-local` only |

No UI, adapter, retrieval, reasoning, brief, or lint layer may write current pages directly. Current pages are modified only by the validated transaction applier.

## 1F. Post-MVP local Memory OS architecture

The MVP compiles short notes into safe, cited markdown memory. The post-MVP Memory OS adds user-facing and agent-facing surfaces around the same core.

```text
Raw Sources
→ Source Adapters
→ Events
→ Candidate Claims
→ Transactions
→ Canonical Markdown Memory
→ Derived Indexes, Packs, Ontology Views, and Symbolic Graph
→ Cited Answers, Entity Stewardship, Context Rooms, Briefs, and Repair Actions
```

| Layer | Role | Canonical? |
|---|---|---:|
| Raw Sources and Source Adapters | Normalize external inputs into Events. | Raw source is preserved; adapter output is derived until Evented. |
| Event and Transaction Core | Evidence and mutation safety. | Yes |
| Canonical Markdown Memory | People, Contexts, Topics, FollowUps, ReviewItems, Logs. | Yes |
| Derived Indexes and Packs | Retrieval/context artifacts. | No |
| Cited Answer Contract | Query output with citations, uncertainty, conflicts, stale signals, and repair actions. | No |
| Entity and Context Stewardship | Derived health/risk cockpit for people, topics, and contexts. | No |
| Derived Ontology and Symbolic Reasoning | Typed relation registry, inference, proof traces, review candidates. | No |
| Workbench and Daily Operating Loops | Capture/review/ask/repair/brief workflows. | Mostly no; durable writes route through Events and Transactions. |

The post-MVP architecture is aspirational but bounded: no vector search, graph database, MCP integration, symbolic reasoning, generated brief, or Workbench state is canonical memory.

Explicit non-negotiables:

```text
no vector search as canonical memory
no graph database as canonical memory
no MCP integration as canonical memory
no autonomous entity merges
no autonomous contradiction resolution
no generated answer persistence
no generated explanation persistence
no generated brief persistence
```

### Why not a graph database yet?

Assisto may derive graph-shaped views from markdown, but it does not need a graph database as canonical state. The primary risks are source-of-truth confusion, opaque mutation semantics, and autonomous relation drift. A graph database may be evaluated later only as a rebuildable index if lexical, wikilink, ontology, and symbolic retrieval fail measured evals.

### Semantic search boundary

Semantic search is introduced only after retrieval evals show specific misses that exact pages, wikilinks, structured fields, ontology expansion, and symbolic hints cannot solve. It remains a derived index and may not provide unsupported facts or outrank cited claims.


## 2. Design principles

| Principle | Rule | Reason | Implementation implication | Failure mode prevented |
|---|---|---|---|---|
| Event first, fact second | Every meaningful ingest creates an Event before any current-state update. | Raw evidence must survive extraction errors. | `ADD_EVENT` is always the first operation in an ingest transaction. | Free-floating memory, unsupported summaries, loss of audit trail. |
| Markdown is the durable source of record | Canonical memory lives in human-readable markdown files. | The user must be able to inspect, diff, edit, and version memory. | Databases, indexes, embeddings, and graphs are derived artifacts. | Opaque memory, vendor lock-in, unreviewable state. |
| Transactions guard multi-file mutation | Any ingest that changes more than one file goes through a transaction. | One input can affect events, people, topics, review items, and logs. | All proposed changes are staged in `transactions/pending/` before application. | Half-applied updates, dangling links, duplicate claims, inconsistent summaries. |
| Indexes are disposable | Search indexes are rebuilt from markdown. | Search infrastructure should not be canonical. | `indexes/` contains derived artifacts only. | Source-of-truth confusion between files and databases. |
| Current state and chronology are separate | Events record what happened; current pages record what is believed now. | “Today I talked with Joe” is not the same as “Joe is the DBA.” | Events are immutable evidence; Person/Context/Topic pages hold active claims. | Historical events accidentally treated as current truth. |
| Every durable claim has provenance | Claims must cite at least one Event ID. | Future answers need auditability and verification. | Claim blocks require `evidence: [ev_*]`. | Unsupported memory, stale summaries, unverifiable answers. |
| Scope is mandatory for system/project claims | Unknown scope must remain explicit. | “We use MySQL” is not globally meaningful without team/project/system/environment. | Claims with missing scope are staged or stored with `scope_state: unknown`, never promoted as global truth. | Overgeneralized technical facts. |
| Time fields are not interchangeable | Separate `recorded_at`, `observed_at`, `valid_from`, and `valid_to`. | Recording time is not truth-start time. | Validators reject inferred `valid_from` unless supported by evidence. | False temporal precision. |
| Staging is deterministic | Specific conditions force review. | “Let the LLM decide if important” is too vague. | Use explicit staging gates for scope, identity ambiguity, role changes, conflicts, and unclear commitments. | Silent corruption of canonical memory. |
| Candidate follow-ups are not committed obligations | Only explicit trigger phrases create committed follow-ups. | Casual mentions must not become tasks. | Follow-up extraction uses a strict policy. | Fake obligations and noisy task lists. |
| Facts, inferences, assumptions, preferences, and commitments are distinct | Claim kind must be explicit. | Communication guidance and inferred stakeholder preferences are not facts. | `claim_kind` is required for every claim block. | Pseudo-facts about people, overconfident personalization. |
| Summaries are generated views | Structured claims are canonical; summaries are not. | Natural-language summaries drift after repeated edits. | Summaries must be regenerated from active claims or omitted in MVP. | Unsupported mini-facts in summaries. |
| Human review is selective but mandatory for high risk | Not every mutation needs approval, but some can never be automatic. | Review everything is too slow; review nothing is unsafe. | High-risk operations stage in `review/`. | Duplicate merges, wrong role changes, silent contradiction resolution. |
| Maintenance has a budget and cadence | Review queues need operating discipline. | Unreviewed maintenance files become noise. | Daily ingest review ≤10 minutes; weekly lint ≤30 minutes; backlog thresholds. | Review graveyard, ignored lint reports. |
| Retrieval starts simple | MVP uses lexical search, exact page lookup, wikilinks, and structured fields. | Search complexity should follow observed retrieval misses. | Vector search and graph traversal are deferred. | Premature infrastructure complexity. |
| Epistemic integrity | Derived intelligence must not become durable truth without evidence and review. | Generated answers, inferences, summaries, and packs are useful but dangerous if laundered into memory. | Route durable changes through Event → Transaction → validation/review. | Inference laundering, unsupported memory, generated falsehoods. |
| Ontology defines relation semantics | Entity kinds and relation kinds must be explicit. | Generic `related` links are too weak for reasoning. | Use a small ontology registry for relation types, scopes, inverse relations, cardinality hints, and review risk. | Relationship collapse, weak retrieval, hidden contradictions. |
| Symbolic reasoning is derived | Inference may produce answer support, stale signals, and ReviewItems, but not active claims. | Derived facts can help reasoning but can corrupt truth if canonicalized. | Store reasoning outputs as `derived_only` with inference paths. | Inferred facts silently becoming durable claims. |
| Cited answers are contracts | Serious answers should expose support, uncertainty, conflicts, stale signals, and repair actions. | Work answers need auditability, not just fluent prose. | Add `CitedAnswerContract` as a derived output. | Unsupported answers and hidden uncertainty. |
| Stewardship is a user surface | Entity/context risk should be visible and actionable. | Identity drift and stale context are recurring work-memory failure modes. | Add derived Entity Stewardship and Context Operating Room views. | Duplicate people, stale ownership, context rot. |
| Consolidation is review-gated | Maintenance may find, rank, draft, and stage; it may not silently rewrite. | Background cleanup can corrupt memory if autonomous. | Consolidation outputs ReviewItems or pending Transactions. | Silent cleanup, false merges, contradiction overreach. |
| Source adapters normalize to Events | All future input sources must produce Events first. | Direct source-specific mutation fragments the architecture. | Add Source Adapter Fabric later; adapters never write canonical pages directly. | Import pipelines bypassing provenance. |
| Dogfood loops drive usefulness | Usefulness comes from daily capture/review/ask/repair loops. | Schemas alone do not create habits. | Add Workbench and personal eval loops. | Beautiful unused system. |

---

## 3. Reduced MVP scope

### In scope

The MVP includes only what is necessary to validate the source-backed markdown mutation loop.

| Capability | Included behavior |
|---|---|
| Events | Create one Event per user note, meeting, curated transcript excerpt or reviewed transcript section, or imported document section. |
| People | Store explicit person facts, role claims, interactions, and staged communication inferences. |
| Contexts | Represent work/project/system/team/client scope under one umbrella object. |
| Topics | Store technical/business concepts relevant to work. |
| FollowUps | Track explicit committed follow-ups and clearly marked candidate follow-ups. |
| ReviewItems | Stage ambiguity, unscoped claims, contradictions, duplicate candidates, stale items, and generated explanations. |
| Transactions | Represent multi-file mutation proposals, validation checklists, application state, and rollback notes. |
| Logs | Append ingest and maintenance summaries. |
| Schema validation | Validate frontmatter, claim blocks, source links, wikilinks, unique IDs, and prohibited mutations. |
| Retrieval | Use exact entity lookup, lexical matching, wikilinks, and structured fields. |

### Out of scope for MVP

| Deferred item | Reason for deferral |
|---|---|
| Vector search | Not needed until lexical/wikilink retrieval fails on real queries. |
| Graph database | Relationships can be expressed as wikilinks and typed relation blocks first. |
| MCP integration | Useful tooling layer, not needed to validate memory semantics. |
| Autonomous merges | False merges corrupt memory and must be staged. |
| Autonomous contradiction resolution | The system may detect contradictions but should not resolve them alone. |
| Standalone Decision pages | Decisions begin as sections inside Context or ReviewItem pages. |
| Standalone OpenQuestion pages | Open questions begin as sections inside Context, Topic, or ReviewItem pages. |
| Standalone Explanation pages | Explanations persist only after explicit user save or repeated use. |
| Full meeting transcript ingestion | Transcript ingestion can create too much event and claim volume; prototype separately. |
| Autonomous background linting | Start with manual or scheduled review; background automation comes after evaluation. |

### MVP success criterion

The MVP is successful if it can ingest 50 realistic work notes and still satisfy all of these:

```text
- No committed follow-up is created from casual mentions.
- No unscoped system/context claim is auto-promoted as global truth.
- No ambiguous person/topic is auto-merged.
- Every active durable claim cites an Event ID.
- Transactions can be validated before application.
- A failed transaction can be repaired or rolled back.
- Current summaries do not contain unsupported claims.
- The review backlog remains small enough to process weekly.
- Retrieval can answer basic person/topic/context questions from current pages.
```

---

## 4. Revised folder layout

```text
memory/
  schema/
    conventions.md
    statuses.md
    relation-types.md
    validators.md
    ontology/                     # post-MVP schema/policy, not user memory
      README.md
      entity-kinds.yaml
      relation-kinds.yaml
      claim-patterns.yaml
      scopes.yaml
      review-rules.yaml

  events/
    2026/
      2026-05/
        2026-05-20-001.md

  people/
    joe.md
    mike.md

  contexts/
    current-work.md

  topics/
    mysql.md
    pgvector.md
    clip-embeddings.md
    solr.md
    qdrant.md

  followups/
    open.md
    closed.md

  review/
    inbox.md
    contradictions.md
    duplicates.md
    unscoped-claims.md
    stale-items.md
    lint-runs/

  transactions/
    pending/
    applied/
    rejected/
    failed/

  logs/
    ingest-log.md
    maintenance-log.md
    domain-events.md
    maintenance-events/
      2026-06.md

  indexes/
    README.md
    ontology/                     # post-MVP derived and rebuildable ontology views
    symbolic/                     # post-MVP derived and rebuildable reasoning cache
      facts.jsonl
      derived-facts.jsonl
      proofs.jsonl
      retrieval-hints.jsonl
      review-candidates.jsonl
```

### Why this is smaller than the original design

The original design separated source-events, meetings, interactions, people, projects, systems, topics, decisions, questions, follow-ups, explanations, maintenance reports, and several index types. That structure is analytically clean, but too broad for a first implementation. [DS]

The revised MVP collapses early-stage concepts:

| Original type | MVP placement |
|---|---|
| SourceEvent | `events/` |
| Meeting / Interaction / Worklog | Event subtype in `events/` |
| Project | Section or object under `contexts/` |
| System | Section or object under `contexts/` |
| Decision | Section in Context or ReviewItem |
| OpenQuestion | Section in Context, Topic, or ReviewItem |
| Explanation | Not persisted unless explicitly saved or requested repeatedly |
| Contradiction | ReviewItem in `review/contradictions.md` |
| MaintenanceReport | `review/` or `logs/maintenance-log.md` |
| Claim | Embedded structured block inside current pages |

The folder layout is intentionally boring. It optimizes for implementation safety, not taxonomy completeness.

The `memory/schema/ontology/`, `memory/indexes/ontology/`, `memory/indexes/symbolic/`, and `review/lint-runs/` folders are post-MVP additions. Ontology registry files are schema/policy, not user memory. Derived ontology and symbolic views are rebuildable indexes. Maintenance domain events belong in logs, not work Events. None of these folders replaces canonical markdown pages or authorizes autonomous mutation.

---

## 5. Revised object model

### 5.1 Event

| Field | Definition |
|---|---|
| Purpose | Immutable evidence unit representing a user note, meeting note, curated transcript excerpt or reviewed transcript section, imported document section, or query worth preserving. |
| Created when | Every meaningful ingest. |
| Updated when | Only for metadata enrichment, extraction annotations, or transaction references. Raw text is immutable. |
| Archived when | Rarely; events may be moved by date but not deleted in MVP. |
| Required metadata | `id`, `type`, `object_state`, `review_state`, `recorded_at`, `observed_at`, `source_type`, `source_actor`, `derived_claims`. |
| Optional metadata | `participants`, `topics`, `context`, `raw_source_path`, `transaction_ids`, `parser_notes`. |
| Allowed child sections | Raw text, extraction candidates, mutation result, links, notes. |
| Allowed links | People, Contexts, Topics, FollowUps, ReviewItems, Transactions. |
| Failure modes | Event too granular, event too coarse, raw text rewritten, extracted claims treated as evidence. |

### 5.2 Person

| Field | Definition |
|---|---|
| Purpose | Current-state page for a person, role claims, explicit facts, interactions, and communication inferences. |
| Created when | A person is explicitly mentioned and entity resolution returns `new_entity` or `exact_match` to an existing page. |
| Updated when | New explicit low-risk facts arrive, interactions link to the person, or reviewed claims supersede older claims. |
| Archived when | Rarely; usually individual claims are superseded instead. |
| Required metadata | `id`, `type`, `object_state`, `review_state`, `created_at`, `updated_at`, `aliases`, `source_events`, `related`. |
| Optional metadata | `preferred_name`, `role_scope`, `team`, `timezone`, `last_reviewed`. |
| Allowed child sections | Current summary, active claims, superseded claims, inferences, interactions, open review items. |
| Allowed links | Events, Contexts, Topics, FollowUps, ReviewItems. |
| Failure modes | Duplicate aliases, false merges, role drift, communication inference hardened into fact. |

### 5.3 Context

| Field | Definition |
|---|---|
| Purpose | Umbrella scope object for project, system, team, client, environment, or bounded work context. |
| Created when | The user explicitly names a bounded work scope or reviews a staged unscoped claim and assigns it to a scope. |
| Updated when | New scoped system/project/team facts arrive. |
| Archived when | Context becomes inactive or historical. |
| Required metadata | `id`, `type`, `object_state`, `review_state`, `created_at`, `updated_at`, `source_events`, `related`. |
| Optional metadata | `aliases`, `owner`, `client`, `system_type`, `environment`, `last_reviewed`. |
| Allowed child sections | Current summary, active claims, decisions as sections, open questions as sections, related people, related topics. |
| Allowed links | People, Topics, Events, FollowUps, ReviewItems. |
| Failure modes | Context becomes junk drawer, project/system/team conflation persists too long, unscoped claims hidden inside context. |

### 5.4 Topic

| Field | Definition |
|---|---|
| Purpose | Work-relevant technical or business concept page. |
| Created when | A concept is explicitly named and relevant enough to link. |
| Updated when | New work-relevant claims, relations, or events mention the topic. |
| Archived when | Rarely; topic may be split if overloaded. |
| Required metadata | `id`, `type`, `object_state`, `review_state`, `created_at`, `updated_at`, `aliases`, `source_events`, `related`. |
| Optional metadata | `topic_family`, `last_reviewed`, `split_candidate`. |
| Allowed child sections | Current summary, active claims, work relevance, open questions, related contexts, related people. |
| Allowed links | Events, Contexts, People, ReviewItems. |
| Failure modes | Junk-drawer topic pages, generic “search” topic swallowing Solr/Qdrant/pgvector, unvalidated external facts. |

MVP limit:

```text
If a Topic exceeds 7 active claims, 5 open questions, or 10 related links, stage a split/review item.
```

### 5.5 FollowUp

| Field | Definition |
|---|---|
| Purpose | Track candidate or committed actions. |
| Created when | An utterance contains an explicit committed follow-up trigger, or a weaker candidate action is useful enough to stage. |
| Updated when | Owner, due date, state, or evidence changes. |
| Archived when | Closed, rejected, expired, or superseded. |
| Required metadata | `id`, `type`, `object_state`, `review_state`, `created_at`, `updated_at`, `followup_state`, `owner`, `source_events`. |
| Optional metadata | `due_at`, `priority`, `context`, `related_people`, `candidate_reason`, `closed_at`, `closure_reason`. |
| Allowed child sections | Action, origin, evidence, current status, closure notes. |
| Allowed links | Events, People, Contexts, Topics. |
| Failure modes | Fake obligations, candidate actions mixed with committed tasks, stale pending actions. |

### 5.6 ReviewItem

| Field | Definition |
|---|---|
| Purpose | Stage ambiguity, contradictions, duplicate candidates, unscoped claims, stale items, or unsafe generated memory. |
| Created when | Deterministic staging rules fire. |
| Updated when | User resolves, rejects, defers, or clarifies. |
| Archived when | Resolved, rejected, or folded into a canonical page. |
| Required metadata | `id`, `type`, `object_state`, `review_state`, `review_reason`, `created_at`, `source_events`, `affected_files`. |
| Optional metadata | `severity`, `candidate_resolution`, `resolver`, `resolved_at`, `linked_transaction`. |
| Allowed child sections | Candidate claim, missing fields, options, recommended resolution, decision log. |
| Allowed links | Events, Transactions, affected People/Contexts/Topics/FollowUps. |
| Failure modes | Review backlog becomes trash pile, duplicate review items, weak resolution options. |

### 5.7 Transaction

| Field | Definition |
|---|---|
| Purpose | Atomic proposal and audit record for multi-file mutation. |
| Created when | Any ingest would modify canonical memory beyond a single Event. |
| Updated when | Validated, applied, rejected, or failed. |
| Archived when | Moved to `applied/`, `rejected/`, or `failed/`. |
| Required metadata | `id`, `type`, `transaction_state`, `created_at`, `source_events`, `operations`, `affected_files`, `risk_level`, `requires_review`. |
| Optional metadata | `validation_errors`, `rollback_notes`, `applied_at`, `rejected_reason`, `failed_reason`. |
| Allowed child sections | Proposed changes, validation checklist, file diffs, rollback/repair notes. |
| Allowed links | Events, People, Contexts, Topics, ReviewItems, Logs. |
| Failure modes | Applying without validation, missing rollback notes, stale pending transactions. |

### 5.8 LogEntry

| Field | Definition |
|---|---|
| Purpose | Append-only operational trace for ingests, validations, maintenance runs, and review resolutions. |
| Created when | A transaction is created/applied/rejected/failed, or maintenance run completes. |
| Updated when | Never; append new entries. |
| Archived when | Logs may be rotated by month. |
| Required metadata | Not required per entry if log file is append-only; each entry needs timestamp, event/transaction IDs, and result. |
| Optional metadata | Validation summary, reviewer, run duration. |
| Allowed child sections | Append-only entries. |
| Allowed links | Transactions, Events, ReviewItems. |
| Failure modes | Missing operational trace, impossible debugging after corruption. |

### Deferred object types

| Deferred type | MVP location |
|---|---|
| Project | Context object or Context section. |
| System | Context object or Context section. |
| Decision | Section inside Context or ReviewItem. |
| OpenQuestion | Section inside Context, Topic, or ReviewItem. |
| Explanation | Not persisted unless explicitly saved or requested repeatedly. |
| Contradiction | ReviewItem in `review/contradictions.md`. |
| MaintenanceReport | Review item or log artifact. |
| Standalone Claim | Embedded structured claim block inside current pages. |

---


## 5A. Promotion policy

Assisto should not create heavyweight pages for every mention. Concepts move through promotion stages:

```text
Mention → Candidate entity → Topic page → Context/Decision/Explanation surface
```

Promotion rules:

```yaml
promotion_policy:
  topic_page:
    create_if:
      - exact technical term appears
      - mentioned in >= 2 Events
      - explicitly requested by user

  context_page:
    create_if:
      - user names a bounded project/system/team/client
      - unscoped claims need a home and user confirms

  decision_section:
    create_if:
      - explicit decision language appears
      - reviewed ReviewItem confirms decision

  explanation_candidate:
    stage_if:
      - same explanation is requested >= 2 times
      - explanation appears useful across multiple contexts

  explanation_section_or_page:
    create_if:
      - user explicitly says "save this"
      - a reviewed Transaction applies the saved explanation
```

This prevents the **Level** failure mode where tactical notes and high-level concepts appear at the same level. In the MVP, decisions, open questions, and explanations remain sections or derived outputs unless explicitly promoted through review.

In the MVP, explanations remain disposable answer outputs or sections inside an existing Context, Topic, or ReviewItem. A standalone Explanation page is a future, review-gated object, not an automatic promotion target. A saved explanation is evidence that the user chose to save that explanation at a time; it is not evidence that every factual statement inside the explanation is true. Factual claims inside saved explanations need independent Event evidence or must remain marked as generated/explanatory.

## 5B. Entity stewardship

> This section describes a derived or review-gated post-MVP capability. It does not expand the set of canonical memory objects and does not authorize direct writes to Person, Context, Topic, FollowUp, ReviewItem, or Transaction pages.

Entity stewardship is a post-MVP derived surface for identity and truth maintenance around people, topics, and contexts. It answers:

```text
- Do we have duplicate people/topics/contexts?
- Are aliases safe or risky?
- Did a role/reporting/ownership claim change?
- Are there stale active claims?
- Are there conflicting active claims in the same scope?
- Which ReviewItems and FollowUps affect this entity?
- What evidence supports current identity?
```

Derived stewardship fields:

```text
identityRisk
nearDuplicates
aliasConflicts
roleChanges
reportingChanges
ownershipChanges
staleClaims
conflictingClaims
recommendedReviewLane
```

Allowed actions:

```text
- stage alias correction
- stage role correction
- stage reporting correction
- stage ownership correction
- stage identity review
- capture missing evidence
```

Forbidden actions:

```text
- merge entities automatically
- split entities automatically
- delete entity pages automatically
- supersede claims without explicit selected claim IDs
- resolve contradictions without review
```

Entity stewardship is derived. Any durable correction must become a ReviewItem or Transaction.

## 5C. Context operating rooms

> This section describes a derived or review-gated post-MVP capability. It does not expand the set of canonical memory objects and does not authorize direct writes to Person, Context, Topic, FollowUp, ReviewItem, or Transaction pages.

Context operating rooms are post-MVP derived cockpits for projects, systems, teams, clients, or bounded work contexts.

A Context operating room may include:

```text
current state
owners and roles
systems and dependencies
decisions-as-claims
open questions-as-claims
risks
recent changes
stale claims
ReviewItems
FollowUps
source timeline
answerable questions
missing-memory prompts
quick repair actions
cited briefs
```

Timeline sources:

```text
Events
pending/applied/rejected Transactions
active/staged/superseded claims
FollowUps
ReviewItems
health findings
```

Rules:

```text
- Context room output is derived.
- Corrections route through capture or pending Transactions.
- Timeline uses existing temporal semantics only.
- Do not invent valid_from from recorded_at.
- Briefs generated from context rooms are disposable unless explicitly captured.
```


## 6. Canonical state model

### 6.1 Top-level object fields

Only these top-level state fields are allowed in MVP frontmatter:

```yaml
object_state: active | archived
review_state: none | staged | reviewed | contested
```

Definitions:

| Field | Allowed values | Meaning |
|---|---|---|
| `object_state` | `active`, `archived` | Whether the page is part of active memory or retained only historically. |
| `review_state` | `none`, `staged`, `reviewed`, `contested` | Whether the page or object needs human attention. |

### 6.2 Claim fields

Every claim block must include:

```yaml
claim_state: active | staged | superseded | rejected
claim_kind: fact | inference | assumption | preference | commitment
evidence_strength: explicit | inferred | weak
scope_state: complete | partial | unknown
```

Definitions:

| Field | Meaning |
|---|---|
| `claim_state` | The claim lifecycle. |
| `claim_kind` | The semantic type of the claim. |
| `evidence_strength` | How directly the evidence supports the claim. |
| `scope_state` | Whether the claim’s team/project/system/time scope is complete. |

### 6.3 Removed or avoided fields

The original design used or implied fields such as `status`, `classification`, `confidence`, `current`, `candidate`, `resolved`, `review_state`, and temporal fields in overlapping ways. [DS]

The revised model avoids:

| Removed/avoided field | Reason |
|---|---|
| `status` | Too generic; overloaded across objects, claims, tasks, decisions. |
| `classification` | Replaced by `claim_kind`. |
| `confidence` as truth | Replaced by `evidence_strength`; truth and completeness are not the same. |
| `current` as claim value | Replaced by `claim_state: active`. |
| `candidate` as universal state | Replaced by `claim_state: staged` or ReviewItem. |
| `resolved` as universal state | Resolution belongs in review/follow-up-specific fields, not generic state. |

### 6.4 Follow-up-specific state

FollowUps may use an additional field:

```yaml
followup_state: candidate | committed | waiting | closed | rejected
```

This is allowed because task lifecycle is materially different from object lifecycle and claim lifecycle.

---

## 7. Temporal model

Use four distinct time fields:

```yaml
recorded_at: 2026-05-20T12:34:00-03:00
observed_at: 2026-05-20T10:00:00-03:00
valid_from: null
valid_to: null
```

| Field | Meaning | Example |
|---|---|---|
| `recorded_at` | When the memory system recorded the item. | User enters note at 12:34. |
| `observed_at` | When the event happened, if known. | “Today I talked with Joe” gives today as observed date. |
| `valid_from` | When a claim became true, if explicitly known. | “Joe became DBA on May 1.” |
| `valid_to` | When a claim stopped being true, if explicitly known or reviewed. | “Joe stopped being DBA on June 10.” |

Rules:

```text
1. recorded_at must never be automatically treated as valid_from.
2. observed_at must never be automatically treated as valid_from for derived claims.
3. "Joe is the DBA" does not imply when Joe became DBA.
4. "Today I talked with Joe" gives observed_at for the interaction, not valid_from for any system claim.
5. valid_from and valid_to can be null.
6. If a new claim supersedes an old claim, do not delete the old claim; mark it superseded and set valid_to only if supported.
```

Example:

```yaml
- claim_id: clm_joe_role_dba
  statement: Joe is the DBA.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: current-work-context
  scope_state: partial
  evidence: [ev_2026_05_20_001]
  recorded_at: 2026-05-20T12:34:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
```

---

## 8. Source/provenance model

### Rules

```text
1. Every durable claim must cite at least one Event ID.
2. Source events are immutable except metadata enrichment.
3. Raw quotes live in Event files, not current-state summaries.
4. Current-state pages contain compact claim blocks.
5. Summaries are generated views, not canonical truth.
6. High-impact answers should verify source events before final response.
7. If source evidence is missing or stale, the answer must surface uncertainty.
```

High-impact answer categories:

```text
- current roles
- ownership
- decisions
- committed follow-ups
- deadlines
- architecture/system claims
- tool or database selection
- facts used to brief another person
```

### Event template

```markdown
---
id: ev_<yyyy_mm_dd>_<seq>
type: event
object_state: active
review_state: reviewed
recorded_at: <iso_datetime>
observed_at: <iso_datetime_or_date_or_null>
source_type: user_note | meeting_note | transcript_section | imported_doc_section | query | correction
source_actor: user | unknown | <person_id>
participants: []
topics: []
contexts: []
derived_claims: []
transactions: []
---

# Event <id>

## Raw text

<verbatim user-provided text or preserved source excerpt>

## Extraction candidates

- candidate_id: cand_<id>
  text: <candidate claim/action/question>
  candidate_kind: fact | inference | assumption | preference | commitment | question
  target_entities: []
  scope_guess: null
  extraction_notes: null

## Mutation result

- transaction: [[transactions/pending/<tx_id>]]
- result: pending | applied | rejected | failed | noop

## Notes

<optional metadata notes; do not rewrite raw text>
```

### Current-state summary rule

A summary may appear on Person, Context, Topic, and FollowUp pages, but it is not canonical. The canonical state is the structured claim set.

If summaries are generated on write:

```yaml
summary_generated_at: 2026-05-20T13:00:00-03:00
summary_generated_from:
  - clm_joe_role_dba
```

If the system cannot track this cleanly, omit `summary_generated_from` in the MVP and regenerate summaries only during manual review.

---

## 9. Transaction model

Transactions are mandatory for multi-file mutation.

### Transaction states

```yaml
transaction_state: pending | applied | rejected | failed
```

### Required transaction metadata

```yaml
---
id: tx_<yyyy_mm_dd>_<seq>
type: transaction
transaction_state: pending
created_at: <iso_datetime>
source_events: []
operations: []
affected_files: []
risk_level: low | medium | high
requires_review: true | false
validation_state: not_run | passed | failed
validation_errors: []
---
```

### Required transaction sections

```markdown
## Intent

<short reason for transaction>

## Proposed operations

<operation list>

## Proposed changes

### Create

<files to create>

### Modify

<files to modify>

### Stage

<review items to create/update>

## Validation checklist

- [ ] All new IDs are unique
- [ ] All wikilinks resolve
- [ ] All active claims cite Event IDs
- [ ] No committed follow-up exists without explicit trigger
- [ ] No active system/context claim has `scope_state: unknown`
- [ ] No ambiguous entity update bypasses review
- [ ] Summaries are generated from active claims only
- [ ] Transaction risk level is set
- [ ] Rollback/repair notes are present

## Rollback / repair notes

<how to undo or repair partial application>

## Application log

<filled only after attempted apply>
```

### Concrete transaction example

Input:

```text
Joe is the DBA. We use MySQL.
```

Expected transaction:

```markdown
---
id: tx_2026_05_20_001
type: transaction
transaction_state: pending
created_at: 2026-05-20T12:00:00-03:00
source_events:
  - ev_2026_05_20_001
operations:
  - ADD_EVENT
  - UPSERT_CLAIM
  - STAGE_REVIEW
affected_files:
  - events/2026/2026-05/2026-05-20-001.md
  - people/joe.md
  - topics/mysql.md
  - review/unscoped-claims.md
risk_level: medium
requires_review: true
validation_state: not_run
validation_errors: []
---

# Transaction tx_2026_05_20_001

## Intent

Capture a user note about Joe and MySQL. Add the low-risk person-role claim to Joe. Stage the MySQL claim because its project/system/team scope is unknown.

## Proposed operations

- ADD_EVENT: create `events/2026/2026-05/2026-05-20-001.md`
- UPSERT_CLAIM: add `clm_joe_role_dba` to `people/joe.md`
- STAGE_REVIEW: add unscoped MySQL claim to `review/unscoped-claims.md`
- NOOP: do not create any follow-up

## Proposed changes

### Create

- `events/2026/2026-05/2026-05-20-001.md`

### Modify

- `people/joe.md`
- `topics/mysql.md` if topic does not already exist or needs link-only creation

### Stage

- `review/unscoped-claims.md`

## Validation checklist

- [ ] All new IDs are unique
- [ ] All wikilinks resolve
- [ ] `clm_joe_role_dba` cites `ev_2026_05_20_001`
- [ ] MySQL claim is not promoted as active current-state system truth
- [ ] No committed follow-up was created
- [ ] Ambiguous scope is staged
- [ ] Transaction contains rollback notes

## Rollback / repair notes

If the transaction partially applies, remove `clm_joe_role_dba` from `people/joe.md`, preserve the Event, and mark this transaction `failed`. Do not delete the Event unless the user explicitly requests deletion.

## Application log

Pending.
```

---


## 9A. Write safety and locking

Transactions provide logical mutation safety. They do not by themselves prevent concurrent physical writes. Before enabling Pi/Hermes gateway ingestion, scheduled jobs, or parallel agents, Assisto must add write safety.

Rules:

```text
1. Only one transaction may be applied at a time.
2. `applyTransaction()` acquires a global apply lock.
3. It then acquires per-file locks for affected files in sorted path order.
4. Writes use temp files and atomic rename where the filesystem supports it.
5. If lock acquisition fails, the transaction remains pending.
6. If a partial write occurs, the transaction moves to `failed/` with repair notes.
7. Events are preserved even if canonical mutations fail.
8. No process may write to canonical files outside the transaction application path.
```

Additional transaction validation checklist items:

```markdown
- [ ] Required locks were acquired before application
- [ ] Atomic write path was used
- [ ] Failure behavior preserves Events
```

Write safety is required before ambient runtimes, gateways, cron jobs, or multi-agent workflows. It is not optional polish; without it, transaction semantics can still be undermined by file-system races.

---

## 10. Memory mutation operations

Only the following operations are in the MVP.

### 10.1 ADD_EVENT

| Property | Definition |
|---|---|
| Applies when | Any meaningful input should be preserved. |
| Files modified | `events/`, `logs/ingest-log.md`, transaction file. |
| Automatic? | Yes. |
| Required provenance | Raw text, source actor, recorded_at, observed_at if known. |
| Validation | Event ID unique; raw text present; source_type set. |
| Example | Create Event for “Joe is the DBA. We use MySQL.” |

### 10.2 UPSERT_CLAIM

| Property | Definition |
|---|---|
| Applies when | A low-risk explicit claim can be added or updated without ambiguity. |
| Files modified | Person, Context, Topic, or FollowUp page. |
| Automatic? | Yes only if no staging rule fires. |
| Required provenance | At least one Event ID. |
| Validation | Claim has `claim_kind`, `claim_state`, `evidence_strength`, `scope_state`, temporal fields, and evidence. |
| Example | Add explicit Mike background facts to `people/mike.md`. |

### 10.3 STAGE_REVIEW

| Property | Definition |
|---|---|
| Applies when | Scope, entity identity, commitment, conflict, role/decision state, or inference risk requires review. |
| Files modified | `review/*.md`, transaction file, optional log. |
| Automatic? | Yes. |
| Required provenance | Event ID and affected file(s). |
| Validation | Review reason set; candidate resolution options included. |
| Example | Stage “We use MySQL” because scope is unknown. |

### 10.4 NOOP

| Property | Definition |
|---|---|
| Applies when | Input produces no safe durable mutation beyond the Event. |
| Files modified | Event and transaction/log. |
| Automatic? | Yes. |
| Required provenance | Event ID and reason. |
| Validation | Reason recorded. |
| Example | “We discussed asking Joe” produces no committed follow-up. |

### 10.5 SUPERSEDE_CLAIM

| Property | Definition |
|---|---|
| Applies when | A newer reviewed claim replaces an older active claim in the same scope. |
| Files modified | Current page containing both old and new claims; transaction; review/log. |
| Automatic? | No for high-impact claims; review required. |
| Required provenance | Old claim ID, new claim ID, Event ID supporting supersession. |
| Validation | Old claim marked `superseded`; new claim active; temporal fields not invented. |
| Example | “Joe moved off DBA work; Alex owns DBA tasks.” |

### 10.6 CLOSE_FOLLOWUP

| Property | Definition |
|---|---|
| Applies when | User explicitly closes, cancels, rejects, or completes a follow-up. |
| Files modified | `followups/open.md`, `followups/closed.md`, log. |
| Automatic? | Yes if user explicitly states closure; otherwise review. |
| Required provenance | Event ID or explicit user action. |
| Validation | Closure reason present. |
| Example | “I already asked Joe about pgvector latency.” |

### Explicitly deferred operations

| Deferred operation | MVP behavior |
|---|---|
| MERGE | Stage duplicate candidate only. |
| SPLIT | Stage split candidate only. |
| DELETE | Not supported in MVP; archive/reject instead. |
| AUTO_RESOLVE_CONTRADICTION | Detect and stage only. |

---

## 11. Deterministic staging rules

Stage when any of the following is true:

```text
1. Scope is missing for a system/project/architecture claim.
2. Entity resolution has more than one plausible match.
3. The claim changes a role, owner, decision, deadline, or commitment.
4. The claim conflicts with an active claim in the same scope.
5. The utterance implies possible action but lacks explicit commitment.
6. The assistant created an inference about a person’s preferences or communication style.
7. A generated explanation would become durable memory without explicit user request.
```

### Automatic mutations

The system may automatically:

```text
- create Events;
- create low-risk Topic pages for exact technical terms;
- create low-risk Person pages when there is no near-match;
- add explicit low-risk additive Person facts;
- add historical interaction facts;
- create candidate follow-ups if clearly marked candidate;
- append operational logs;
- stage review items.
```

### Requires review

The system must stage:

```text
- entity merges;
- near-match identities;
- ambiguous aliases;
- role changes;
- owner changes;
- decision finalization;
- claim supersession;
- contradiction resolution;
- committed follow-ups without exact trigger;
- unscoped system/project/team claims;
- generated explanations proposed for durable storage;
- communication guidance about a person.
```

### Event-log only

The system should create only an Event, with no current-state mutation, when:

```text
- the input is a one-off query with no durable value;
- the input contains vague commentary without clear entities or claims;
- extraction is too uncertain;
- the only possible mutation would require unsupported inference;
- the user asks a question and does not ask to save the answer.
```

---

## 12. Follow-up extraction policy

### Committed follow-up triggers

Create a committed follow-up only when the utterance contains explicit obligation language such as:

```text
"Remind me to X"
"I need to X"
"I have to X"
"I will X"
"I'll X"
"Please track X"
"Add a follow-up to X"
"Joe asked me to X"
"Due by DATE"
"By DATE I need to X"
```

### Candidate follow-up triggers

Create a candidate follow-up only when weaker intent is present:

```text
"Maybe I should X"
"We should probably X"
"It might be worth asking X"
"Need to understand X" without an owner
"I wonder if we should X"
"Could follow up on X"
```

### No follow-up

Do not create any follow-up from:

```text
"Today I talked about X"
"We discussed X"
"Joe mentioned X"
"Mike cares about X"
"X came up"
"We talked with Joe about X"
```

### Examples

| Input | Output | Reason |
|---|---|---|
| “Today I talked with Joe about pgvector.” | No follow-up | Historical event only. |
| “Maybe I should ask Joe about pgvector latency.” | Candidate follow-up | Weak self-intent. |
| “Remind me to ask Joe about pgvector latency.” | Committed follow-up | Explicit reminder trigger. |
| “Joe asked me to send him the numbers.” | Committed follow-up | External request. |
| “We should probably clarify the scope.” | Candidate follow-up | Weak team intent. |
| “I’ll send Mike the comparison tomorrow.” | Committed follow-up | Explicit future action. |
| “Mike cares about evaluation.” | No follow-up | Person/topic fact or inference only. |

### FollowUp claim example

```yaml
- claim_id: clm_followup_ask_joe_pgvector_latency
  statement: Ask Joe about pgvector latency requirements.
  claim_kind: commitment
  claim_state: active
  evidence_strength: explicit
  scope: current-work-context
  scope_state: partial
  evidence: [ev_2026_05_20_004]
  recorded_at: 2026-05-20T13:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
```

---

## 13. Entity resolution policy

### Identity states

| State | Meaning | Automatic? |
|---|---|---|
| `exact_match` | Name or ID exactly matches an existing canonical page. | Yes. |
| `alias_match` | Mention matches an alias already listed on a canonical page. | Yes. |
| `near_match` | Mention is similar but not confirmed. | No; stage. |
| `new_entity` | No plausible existing match. | Yes for low-risk Person/Topic creation. |
| `ambiguous` | Multiple plausible matches or insufficient disambiguation. | No; stage. |

### Rules

```text
1. exact_match can update automatically.
2. alias_match can update automatically only if alias is already canonical.
3. near_match must stage.
4. ambiguous must stage.
5. new_entity can be automatic for low-risk Person or Topic creation.
6. merging entities is deferred and requires review.
7. false split is tolerable; false merge is not.
```

### Examples

| Mention | Existing state | Resolution |
|---|---|---|
| Joe | `people/joe.md` exists | `exact_match` |
| Joseph | `people/joe.md` has alias Joseph | `alias_match` |
| Joey | Joe exists, no alias | `near_match`; stage |
| Joe from DBA | Joe exists but another Joe exists | `ambiguous`; stage |
| Joe from sales | Joe DBA exists, no sales Joe | `new_entity` or `ambiguous` depending context; stage if uncertain |
| Mike | `people/mike.md` exists | `exact_match` |
| Michael | Mike exists, no alias | `near_match`; stage |
| Miguel | Mike exists but language variant possible | `near_match`; stage |
| pgvector | `topics/pgvector.md` exists | `exact_match` |
| Postgres pgvector extension | pgvector exists but phrase may refer to extension packaging | `near_match`; stage if important |
| Solr | `topics/solr.md` exists | `exact_match` |
| search | `topics/solr.md` exists | Not Solr; likely generic topic, stage if conflating |

---


## 13A. Derived ontology registry

> This section describes a derived or review-gated post-MVP capability. It does not expand the set of canonical memory objects and does not authorize direct writes to Person, Context, Topic, FollowUp, ReviewItem, or Transaction pages.

The ontology is a post-MVP deterministic registry of entity kinds, relation kinds, temporal semantics, scope requirements, inverse relations, cardinality hints, and review rules. It is not a graph database and not a second source of truth. It helps validators, retrieval, health checks, and symbolic reasoning interpret existing cited claims.

The ontology is inspired by lightweight controlled-vocabulary and shape-validation ideas: use a small local registry of concepts and relations rather than a broad philosophical model. It should remain local, versioned, reviewable, and operational.

Conceptual shape:

```ts
type OntologyRegistry = {
  entityKinds: EntityKindDefinition[];
  relationKinds: RelationKindDefinition[];
  claimPatterns: ClaimPatternDefinition[];
  reviewRules: OntologyReviewRule[];
};
```

Relation definition:

```ts
type RelationDefinition = {
  id: string;
  label: string;
  fromKinds: string[];
  toKinds: string[];
  inverse?: string;
  transitive?: boolean;
  symmetric?: boolean;
  requiresScope?: boolean;
  temporal?: boolean;
  cardinalityHint?: "one" | "many";
  reviewRisk: "low" | "medium" | "high";
};
```

Example relation kinds:

```text
reports_to
manages
owns
part_of
depends_on
supersedes
contradicts
evidenced_by
mentions
has_open_followup
review_risk_for
```

Example ontology files:

```text
memory/schema/ontology/
  entity-kinds.yaml
  relation-kinds.yaml
  claim-patterns.yaml
  scopes.yaml
  review-rules.yaml
```

Derived ontology views may be emitted under:

```text
memory/indexes/ontology/
memory/indexes/symbolic/
```

Ontology registry files are schema/policy, not user memory. If stored under `memory/`, they belong under `memory/schema/ontology/`. Derived ontology views belong under `memory/indexes/ontology/` or `memory/indexes/symbolic/` and must be rebuildable from canonical markdown plus schema policy.

Rules:

```text
- The ontology is derived policy and validation support.
- It does not replace markdown.
- It does not create a canonical graph database.
- It does not authorize automatic merges or contradiction resolution.
- It helps validators, retrieval, health checks, and symbolic reasoning interpret cited claims.
- Generic `related` links are allowed only when no more specific relation applies.
```

### Ontology versioning and migrations

Ontology changes are schema changes. They may invalidate derived symbolic indexes and retrieval hints, but they do not rewrite canonical claims by themselves.

When relation semantics change, Assisto should:

1. mark affected derived indexes stale;
2. rebuild ontology views and symbolic indexes;
3. stage ReviewItems for claims whose relation type is now invalid or ambiguous;
4. avoid automatic claim migration unless a reviewed Transaction applies it.

Ontology migrations may stage ReviewItems for affected claims, but they do not directly edit Person, Context, Topic, FollowUp, Event, ReviewItem, or Transaction pages.

### Ontology-aware extraction frames

Post-MVP extraction should move from loose candidate strings to typed frames.

```yaml
- candidate_id: cand_mysql_used
  text: We use MySQL.
  candidate_kind: fact
  frame:
    relation: uses_technology
    subject:
      kind: Context
      id: null
      resolution_state: missing
    object:
      kind: Topic
      id: top_mysql
      resolution_state: exact_match
    qualifiers:
      scope: null
      environment: null
      project: null
      time_scope: null
  evidence:
    event_id: ev_2026_05_20_001
    quote: We use MySQL.
  staging_reasons:
    - missing_context_for_uses_technology
```

Ontology-aware frames make validation and staging deterministic: invalid domain/range combinations, missing required scope, and high-risk relation changes become ReviewItems instead of silently mutating canonical pages.

Ontology-aware extraction frames are intermediate extraction artifacts. They are not canonical claim blocks. A frame becomes durable only if converted into a valid claim block inside a Transaction or staged as a ReviewItem candidate.

```text
candidate frame
→ staging decision
→ canonical claim block or ReviewItem candidate
→ Transaction validation
→ applied current page or staged review
```

## 13B. Derived symbolic reasoning and inference paths

> This section describes a derived or review-gated post-MVP capability. It does not expand the set of canonical memory objects and does not authorize direct writes to Person, Context, Topic, FollowUp, ReviewItem, or Transaction pages.

Symbolic reasoning is a derived layer over canonical markdown state. It may produce answer support, stale signals, conflict signals, manager/reporting chains, ownership traces, missing-memory prompts, repair suggestions, and review-lane routing. It may not produce active canonical claims directly.

Assisto should support:

```text
- deterministic forward inference
- deterministic backward inference
- contradiction/staleness detection
- answer explanation paths
- repair suggestions
- review-lane routing
```

Assisto should not support:

```text
- autonomous theorem proving over user memory
- hidden probabilistic inference that writes memory
- canonical graph state that diverges from markdown
- automatic identity merges
- automatic contradiction resolution
- invisible background cleanup
```

Conceptual result type:

```ts
type ReasoningFinding = {
  id: string;
  kind:
    | "derived_relation"
    | "possible_conflict"
    | "stale_signal"
    | "missing_scope"
    | "missing_evidence"
    | "identity_risk"
    | "answer_support";
  statement: string;
  inferencePath: InferencePath;
  canonicalState: "derived_only";
  suggestedAction?: RepairAction;
};
```

Inference path:

```ts
type InferencePath = {
  inputQuestion?: string;
  rules: string[];
  claimIds: string[];
  eventIds: string[];
  pagePaths: string[];
  uncertainty: string[];
};
```

Example forward inferences:

```text
If A reports_to B, then B may be surfaced as A's manager in that scope.
If a Context has owner P and open FollowUps, meeting prep should surface P and those FollowUps.
If a claim has valid_to, current answers should treat it as stale or superseded.
If two active role claims conflict in the same scope, stage a review finding.
```

Example backward inferences:

```text
"Who owns X?" traces owner claims, Context links, evidence Events, and cannot-confirm gaps.
"Can I trust this answer?" traces source Events, claim state, scope state, review state, and conflicts.
"What should I ask before meeting Joe?" traces Person, Context, open FollowUps, ReviewItems, and missing-memory prompts.
```

Derived symbolic outputs are written only to derived stores such as:

```text
memory/indexes/symbolic/facts.jsonl
memory/indexes/symbolic/derived-facts.jsonl
memory/indexes/symbolic/proofs.jsonl
memory/indexes/symbolic/retrieval-hints.jsonl
memory/indexes/symbolic/review-candidates.jsonl
```

Canonical write path:

```text
symbolic output → ReviewItem → Transaction → validation → user review/apply
```

Key rule:

```text
Every reasoning output must expose an inference path. Reasoning outputs are derived and cannot become active claims unless explicitly routed through Event → Transaction → validation/review.
```

### Symbolic index rebuild semantics

Symbolic index files are cache artifacts. They may be deleted and rebuilt from canonical markdown, schema/ontology policy, and deterministic reasoning rules.

They must include rebuild metadata:

```yaml
symbolic_index_version: v1
ontology_version: ontology_2026_06_01
generated_at: 2026-06-01T10:00:00Z
input_hashes:
  - memory/people/joe.md: sha256:...
  - memory/contexts/inventory.md: sha256:...
```

No answer, Transaction, or canonical mutation may require symbolic index state that cannot be reconstructed from canonical markdown plus schema/ontology plus deterministic rules.


## 14. Markdown schemas and templates

### 14.1 Event template

```markdown
---
id: ev_<yyyy_mm_dd>_<seq>
type: event
object_state: active
review_state: reviewed
recorded_at: <iso_datetime>
observed_at: <iso_datetime_or_date_or_null>
source_type: user_note | meeting_note | transcript_section | imported_doc_section | query | correction
source_actor: user | unknown | <person_id>
participants: []
topics: []
contexts: []
derived_claims: []
transactions: []
---

# Event <id>

## Raw text

<verbatim source text>

## Extraction candidates

- candidate_id: cand_<id>
  text: <candidate text>
  candidate_kind: fact | inference | assumption | preference | commitment | question
  target_entities: []
  scope_guess: null
  extraction_notes: null

## Mutation result

- transaction: [[transactions/pending/<tx_id>]]
- result: pending | applied | rejected | failed | noop

## Notes
```

### 14.2 Person template

```markdown
---
id: per_<slug>
type: person
object_state: active
review_state: none | staged | reviewed | contested
created_at: <iso_datetime>
updated_at: <iso_datetime>
aliases: []
source_events: []
related: []
summary_generated_at: null
summary_generated_from: []
---

# <Person Name>

## Current summary

<generated non-authoritative summary>

## Active claims

- claim_id: clm_<id>
  statement: <statement>
  claim_kind: fact | inference | assumption | preference | commitment
  claim_state: active | staged | superseded | rejected
  evidence_strength: explicit | inferred | weak
  scope: <scope_or_null>
  scope_state: complete | partial | unknown
  evidence: []
  recorded_at: <iso_datetime>
  observed_at: <iso_datetime_or_date_or_null>
  valid_from: <date_or_null>
  valid_to: <date_or_null>

## Superseded claims

## Inferences

## Interactions

## Open review items
```

### 14.3 Context template

```markdown
---
id: ctx_<slug>
type: context
object_state: active
review_state: none | staged | reviewed | contested
created_at: <iso_datetime>
updated_at: <iso_datetime>
aliases: []
source_events: []
related: []
summary_generated_at: null
summary_generated_from: []
---

# <Context Name>

## Current summary

<generated non-authoritative summary>

## Active claims

## Decisions

## Open questions

## Related people

## Related topics

## Open review items
```

### 14.4 Topic template

```markdown
---
id: top_<slug>
type: topic
object_state: active
review_state: none | staged | reviewed | contested
created_at: <iso_datetime>
updated_at: <iso_datetime>
aliases: []
topic_family: null
source_events: []
related: []
summary_generated_at: null
summary_generated_from: []
---

# <Topic>

## Current summary

<generated non-authoritative summary>

## Active claims

## Work relevance

## Open questions

## Related contexts

## Related people

## Split/review notes
```

### 14.5 FollowUp template

```markdown
---
id: fol_<slug>
type: followup
object_state: active
review_state: none | staged | reviewed | contested
followup_state: candidate | committed | waiting | closed | rejected
created_at: <iso_datetime>
updated_at: <iso_datetime>
owner: user | <person_id> | unknown
due_at: null
source_events: []
related: []
---

# <Follow-up title>

## Action

<action statement>

## Origin

<source event and trigger phrase>

## Current status

<state and notes>

## Evidence

## Closure notes
```

### 14.6 ReviewItem template

```markdown
---
id: rev_<slug>
type: review_item
object_state: active
review_state: staged | contested | reviewed
review_reason: unscoped_claim | duplicate_candidate | contradiction | stale_item | unsafe_inference | explanation_promotion | ambiguous_entity
created_at: <iso_datetime>
updated_at: <iso_datetime>
severity: low | medium | high
source_events: []
affected_files: []
linked_transaction: null
---

# Review: <title>

## Issue

<what needs review>

## Evidence

<source events and affected claims>

## Missing information

## Candidate resolutions

- keep staged
- reject
- attach to existing page
- create new page
- supersede old claim
- request clarification

## Resolution log
```

### 14.7 Transaction template

```markdown
---
id: tx_<yyyy_mm_dd>_<seq>
type: transaction
transaction_state: pending | applied | rejected | failed
created_at: <iso_datetime>
source_events: []
operations: []
affected_files: []
risk_level: low | medium | high
requires_review: true | false
validation_state: not_run | passed | failed
validation_errors: []
---

# Transaction <id>

## Intent

## Proposed operations

## Proposed changes

### Create

### Modify

### Stage

## Validation checklist

- [ ] All new IDs are unique
- [ ] All wikilinks resolve
- [ ] All active claims cite Event IDs
- [ ] No committed follow-up exists without explicit trigger
- [ ] No active system/context claim has `scope_state: unknown`
- [ ] No ambiguous entity update bypasses review
- [ ] Summaries are generated from active claims only
- [ ] Transaction risk level is set
- [ ] Rollback/repair notes are present

## Rollback / repair notes

## Application log
```

### 14.8 Example: `people/joe.md`

```markdown
---
id: per_joe
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-20T12:00:00-03:00
updated_at: 2026-05-20T12:00:00-03:00
aliases: []
source_events:
  - ev_2026_05_20_001
related:
  - [[topics/mysql]]
summary_generated_at: 2026-05-20T12:00:00-03:00
summary_generated_from:
  - clm_joe_role_dba
---

# Joe

## Current summary

Joe is known in the current work context as a DBA. Exact team/system scope is not yet known.

## Active claims

- claim_id: clm_joe_role_dba
  statement: Joe is the DBA.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: current-work-context
  scope_state: partial
  evidence: [ev_2026_05_20_001]
  recorded_at: 2026-05-20T12:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null

## Superseded claims

## Inferences

## Interactions

## Open review items

- [[review/unscoped-claims]]
```

### 14.9 Example: `people/mike.md`

```markdown
---
id: per_mike
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-20T12:05:00-03:00
updated_at: 2026-05-20T12:05:00-03:00
aliases: []
source_events:
  - ev_2026_05_20_002
related: []
summary_generated_at: 2026-05-20T12:05:00-03:00
summary_generated_from:
  - clm_mike_manager
  - clm_mike_java_generalist
  - clm_mike_crm_experience
  - clm_mike_phd_stats
---

# Mike

## Current summary

Mike is my manager. He is described as a generalist Java developer with substantial CRM experience and a PhD in Statistics.

## Active claims

- claim_id: clm_mike_manager
  statement: Mike is my manager.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: reporting-line
  scope_state: partial
  evidence: [ev_2026_05_20_002]
  recorded_at: 2026-05-20T12:05:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null

- claim_id: clm_mike_java_generalist
  statement: Mike is a generalist Java developer.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: technical-background
  scope_state: complete
  evidence: [ev_2026_05_20_002]
  recorded_at: 2026-05-20T12:05:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null

- claim_id: clm_mike_crm_experience
  statement: Mike has substantial CRM experience.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: professional-background
  scope_state: complete
  evidence: [ev_2026_05_20_002]
  recorded_at: 2026-05-20T12:05:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null

- claim_id: clm_mike_phd_stats
  statement: Mike has a PhD in Statistics.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: educational-background
  scope_state: complete
  evidence: [ev_2026_05_20_002]
  recorded_at: 2026-05-20T12:05:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null

## Superseded claims

## Inferences

- claim_id: clm_mike_comm_guidance_stats
  statement: Statistical evaluation framing may be useful when explaining technical trade-offs to Mike.
  claim_kind: inference
  claim_state: staged
  evidence_strength: inferred
  scope: communication-guidance
  scope_state: partial
  evidence: [ev_2026_05_20_002]
  recorded_at: 2026-05-20T12:05:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null

## Interactions

## Open review items
```

### 14.10 Example: `events/2026/2026-05/2026-05-20-001.md`

```markdown
---
id: ev_2026_05_20_001
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-20T12:00:00-03:00
observed_at: null
source_type: user_note
source_actor: user
participants: []
topics:
  - [[topics/mysql]]
contexts: []
derived_claims:
  - clm_joe_role_dba
  - clm_mysql_used_unknown_scope
transactions:
  - tx_2026_05_20_001
---

# Event ev_2026_05_20_001

## Raw text

Joe is the DBA. We use MySQL.

## Extraction candidates

- candidate_id: cand_joe_dba
  text: Joe is the DBA.
  candidate_kind: fact
  target_entities: [per_joe]
  scope_guess: current-work-context
  extraction_notes: Explicit person-role claim.

- candidate_id: cand_mysql_used
  text: We use MySQL.
  candidate_kind: fact
  target_entities: [top_mysql]
  scope_guess: null
  extraction_notes: Explicit system/stack claim, but "we" lacks team/project/system/environment scope.

## Mutation result

- transaction: [[transactions/pending/tx-2026-05-20-001]]
- result: pending

## Notes
```

### 14.11 Example: `topics/pgvector.md`

```markdown
---
id: top_pgvector
type: topic
object_state: active
review_state: reviewed
created_at: 2026-05-20T13:00:00-03:00
updated_at: 2026-05-20T13:00:00-03:00
aliases: []
topic_family: vector-search
source_events:
  - ev_2026_05_20_003
related:
  - [[people/joe]]
  - [[topics/clip-embeddings]]
summary_generated_at: 2026-05-20T13:00:00-03:00
summary_generated_from:
  - clm_pgvector_discussed_for_clip
---

# pgvector

## Current summary

pgvector is relevant to the current work context because it was discussed with Joe as a possible way to store CLIP embeddings for product pictures. The exact project/system scope is not yet known.

## Active claims

- claim_id: clm_pgvector_discussed_for_clip
  statement: pgvector was discussed as a possible way to store CLIP embeddings for product pictures.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: current-work-context
  scope_state: partial
  evidence: [ev_2026_05_20_003]
  recorded_at: 2026-05-20T13:00:00-03:00
  observed_at: 2026-05-20
  valid_from: null
  valid_to: null

## Work relevance

- May be relevant to product-image embedding storage or retrieval.
- Do not infer that pgvector is selected or being actively evaluated without more evidence.

## Open questions

- Which project or system does this apply to?
- Is the target use case search, deduplication, recommendation, classification, or something else?
- What are the expected scale, latency, and recall requirements?

## Related contexts

## Related people

- [[people/joe]]

## Split/review notes
```

### 14.12 Example: `review/unscoped-claims.md`

```markdown
---
id: rev_unscoped_claims
type: review_item
object_state: active
review_state: staged
review_reason: unscoped_claim
created_at: 2026-05-20T12:00:00-03:00
updated_at: 2026-05-20T12:00:00-03:00
severity: medium
source_events:
  - ev_2026_05_20_001
affected_files:
  - topics/mysql.md
linked_transaction: tx_2026_05_20_001
---

# Review: Unscoped claims

## Issue

The claim "We use MySQL" is explicit but lacks a team, project, system, environment, or time scope.

## Evidence

- Event: [[events/2026/2026-05/2026-05-20-001]]
- Candidate claim: `clm_mysql_used_unknown_scope`

## Missing information

- Which team uses MySQL?
- Which system or project uses MySQL?
- Is this production, prototype, legacy, or local development?
- Is MySQL current, historical, or preferred?

## Candidate resolutions

- attach to existing context: [[contexts/current-work]]
- create a new context after user clarification
- keep staged
- reject as too vague

## Resolution log
```

### 14.13 Example: `transactions/pending/tx-2026-05-20-001.md`

```markdown
---
id: tx_2026_05_20_001
type: transaction
transaction_state: pending
created_at: 2026-05-20T12:00:00-03:00
source_events:
  - ev_2026_05_20_001
operations:
  - ADD_EVENT
  - UPSERT_CLAIM
  - STAGE_REVIEW
affected_files:
  - events/2026/2026-05/2026-05-20-001.md
  - people/joe.md
  - topics/mysql.md
  - review/unscoped-claims.md
risk_level: medium
requires_review: true
validation_state: not_run
validation_errors: []
---

# Transaction tx_2026_05_20_001

## Intent

Capture a user note about Joe and MySQL. Add the explicit Joe role claim. Stage the MySQL claim because the system/project/team scope is unknown.

## Proposed operations

- ADD_EVENT: create `events/2026/2026-05/2026-05-20-001.md`
- UPSERT_CLAIM: add `clm_joe_role_dba` to `people/joe.md`
- STAGE_REVIEW: add `clm_mysql_used_unknown_scope` to `review/unscoped-claims.md`
- NOOP: create no follow-up

## Proposed changes

### Create

- `events/2026/2026-05/2026-05-20-001.md`

### Modify

- `people/joe.md`
- `topics/mysql.md`

### Stage

- `review/unscoped-claims.md`

## Validation checklist

- [ ] All new IDs are unique
- [ ] All wikilinks resolve
- [ ] All active claims cite Event IDs
- [ ] No committed follow-up exists without explicit trigger
- [ ] No active system/context claim has `scope_state: unknown`
- [ ] No ambiguous entity update bypasses review
- [ ] Summaries are generated from active claims only
- [ ] Transaction risk level is set
- [ ] Rollback/repair notes are present

## Rollback / repair notes

If partially applied, preserve the Event, remove `clm_joe_role_dba` from `people/joe.md` if necessary, keep the MySQL claim staged, mark this transaction failed, and append a failure entry to `logs/ingest-log.md`.

## Application log

Pending.
```

---

## 15. Ingestion workflow

### Workflow

```text
1. Raw capture
2. Create Event
3. Extract candidate claims
4. Resolve entities
5. Detect scope
6. Classify claim kind
7. Assign evidence strength
8. Apply deterministic staging rules
9. Create transaction
10. Validate transaction
11. Apply transaction or leave pending
12. Update ingest log
13. Optionally create review items
```

### Example A: “Joe is the DBA. We use MySQL.”

| Step | Result |
|---|---|
| Raw capture | Preserve full text in Event. |
| Event | `ev_2026_05_20_001` |
| Candidate claims | `Joe is the DBA`; `We use MySQL`. |
| Entity resolution | Joe: `new_entity` or `exact_match`; MySQL: Topic. |
| Scope detection | Joe role: partial current-work scope; MySQL: unknown scope. |
| Claim kind | Both facts. |
| Evidence strength | Explicit. |
| Staging rules | MySQL claim stages because system/project/team scope missing. |
| Transaction | Create Event, update Joe, optionally create MySQL topic, stage unscoped claim. |
| Validation | Must verify no committed follow-up created. |
| Apply/stage | Joe claim may apply; MySQL remains in review. |
| Log | Append transaction result. |

Expected no-ops:

```text
- No committed follow-up.
- No global claim "the company uses MySQL."
- No decision object.
```

### Example B: “Mike is my manager. He’s a generalist Java developer with lots of CRM experience. He has a PhD in Statistics.”

| Step | Result |
|---|---|
| Event | `ev_2026_05_20_002` |
| Candidate claims | Mike is manager; Mike is Java generalist; Mike has CRM experience; Mike has PhD in Statistics. |
| Entity resolution | Mike: exact/new/near. Stage if near match exists. |
| Scope detection | Manager claim has reporting-line scope but valid_from unknown. Background claims have complete enough scope. |
| Claim kind | Facts. |
| Evidence strength | Explicit. |
| Staging | Communication guidance stages if generated. Facts apply if identity unambiguous. |
| Transaction | Create/update `people/mike.md`. |
| No-op | No follow-up. |

Generated communication inference:

```text
Statistical evaluation framing may work well with Mike.
```

This must be `claim_kind: inference`, `claim_state: staged`, not an active fact.

### Example C: “Today I talked with Joe about pgvector for storing CLIP embeddings of product pictures.”

| Step | Result |
|---|---|
| Event | `ev_2026_05_20_003` with `observed_at: 2026-05-20`. |
| Candidate claims | Historical interaction; pgvector discussed for CLIP embeddings; product pictures involved. |
| Entity resolution | Joe exact/near; pgvector topic; CLIP embeddings topic. |
| Scope detection | Project/system scope partial or unknown. |
| Claim kind | Historical fact; possible topic relevance. |
| Evidence strength | Explicit. |
| Staging | Stage any claim that says pgvector is selected/evaluated. |
| Transaction | Update Joe interaction, create/update pgvector and CLIP topics, stage open scope question if needed. |
| Follow-up | No committed follow-up. Candidate only if generated and clearly marked. |

Allowed durable claims:

```text
- Joe and user discussed pgvector on 2026-05-20.
- pgvector was discussed as a possible way to store CLIP embeddings for product pictures.
```

Not allowed without more evidence:

```text
- pgvector is selected.
- Joe supports pgvector.
- the team is evaluating pgvector.
- the system will use pgvector.
```

### Example D: “How should I explain Joe and Mike the difference between Solr and Qdrant?”

| Step | Result |
|---|---|
| Event | Optional query Event if full conversation trace is desired. |
| Candidate claims | None by default; it is a query. |
| Retrieval | Load Joe, Mike, Solr, Qdrant pages; linked review/follow-up items; latest relevant events only if sparse/contested/high-impact. |
| Answer | Produce audience-specific explanation. |
| Durable explanation | Do not persist unless user explicitly says “save this” or same explanation is requested repeatedly. |
| Transaction | Usually no mutation; maybe Event + NOOP. |

---


## 15A. Source Adapter Fabric

> This section describes a derived or review-gated post-MVP capability. It does not expand the set of canonical memory objects and does not authorize direct writes to Person, Context, Topic, FollowUp, ReviewItem, or Transaction pages.

The Source Adapter Fabric is a post-MVP extension point for importing material beyond short pasted notes while preserving the Event-first architecture.

Adapters may handle:

```text
markdown/text import
pasted notes
web clippings
document parsers
email/chat excerpts
calendar/meeting notes
code/project artifacts
curated transcript excerpts or reviewed transcript sections
```

Adapter output:

```ts
type SourceAdapterOutput = {
  adapterId: string;
  sourceLabel: string;
  sourceHash: string;
  observedAt?: string;
  rawText: string;
  units: SourceUnit[];
  parserNotes: string[];
};

type SourceUnit = {
  unitId: string;
  rawText: string;
  sourceSpan?: {
    filePath?: string;
    lineStart?: number;
    lineEnd?: number;
    page?: number;
  };
  suggestedEventMetadata: Record<string, unknown>;
};
```

Adapter rules:

```text
- raw text must be preserved;
- duplicate hashes should be skipped or staged;
- parser uncertainty should be visible;
- each kept unit creates an Event plus a pending Transaction;
- full transcript ingestion remains a separate high-volume, review-heavy workflow;
- adapters never write Person, Topic, Context, FollowUp, or ReviewItem pages directly.
```

Forbidden shortcuts:

```text
PDF → Person page directly
Slack → FollowUp directly
Transcript → Decision directly
Email → Context directly
```

All adapters must output normalized Events, then use the normal extraction → transaction → validation path.

### Future evidence granularity ladder

MVP provenance requires each durable claim to cite at least one Event ID. For short notes this is sufficient. For transcripts, documents, and longer imported material, claims should eventually cite a source span.

```yaml
evidence:
  - event_id: ev_2026_05_20_003
    quote: "Today I talked with Joe about pgvector..."
    start_char: 0
    end_char: 83
    source_line_start: null
    source_line_end: null
    page: null
    timestamp_start: null
    timestamp_end: null
```

Span-level provenance remains evidence metadata. It does not change the transaction model.


## 16. Retrieval and context assembly

> This section describes a derived or review-gated post-MVP capability where explicitly labeled. It does not expand the set of canonical memory objects and does not authorize direct writes to Person, Context, Topic, FollowUp, ReviewItem, or Transaction pages.

### MVP retrieval steps

```text
1. Identify named people/topics/contexts.
2. Load exact pages.
3. Load linked review/follow-up items.
4. Load latest 1–3 relevant events only if sparse, contested, high-impact, or temporal.
5. Answer from active claims first.
6. Mention uncertainty when scope is unknown, partial, staged, or contested.
```

### Query intent classes

| Intent | Retrieval focus |
|---|---|
| Factual recall | Active claims and source events if high impact. |
| Scoped recall | Context pages plus staged unscoped claims. |
| Temporal recall | Active and superseded claims plus events. |
| Explanation | People + Topics + Context + existing saved framing. |
| Follow-up status | FollowUps + linked Events. |
| Contradiction check | Review contradictions + claims in same scope. |
| Open question synthesis | Review items + Context/Topic open question sections. |

### Worked example: Solr vs Qdrant for Joe and Mike

Query:

```text
How should I explain Joe and Mike the difference between Solr and Qdrant?
```

Load:

```text
people/joe.md
people/mike.md
topics/solr.md
topics/qdrant.md
review/inbox.md if linked
followups/open.md if linked
```

Load source events only if:

```text
- Joe or Mike pages contain staged/contested claims;
- Solr/Qdrant pages are sparse;
- answer depends on a current work-specific decision;
- a prior explanation exists but may be stale;
- there are contradictory topic claims.
```

Skip:

```text
- unrelated meetings mentioning Joe;
- all raw events mentioning search;
- vector index results if lexical/wikilink retrieval is sufficient;
- generated explanation pages unless explicitly saved.
```

Context packing order:

```text
1. Mike and Joe active facts relevant to audience framing.
2. Solr and Qdrant topic summaries and active claims.
3. Current context page if a search/vector project is linked.
4. Staged review items that affect uncertainty.
5. Up to 3 evidence events for high-impact claims.
```

Answer behavior:

```text
- Use active claims as context, not as full quoted source.
- State uncertainty if Joe's DBA scope or Mike's communication guidance is staged.
- Do not persist the explanation unless explicitly requested.
```


### Post-MVP cited answer assembly

The MVP retrieval workflow loads relevant pages and Events safely. Post-MVP retrieval should produce a structured answer contract for serious work questions.

```ts
type CitedAnswerContract = {
  question: string;
  queryIntent: RetrievalQueryIntent;
  directAnswers: DirectAnswer[];
  cannotConfirm: CannotConfirmItem[];
  conflicts: ConflictSignal[];
  staleSignals: StaleSignal[];
  citationMap: AnswerCitationMap;
  repairActions: RepairAction[];
  suggestedNextQuestions: string[];
  contextPack: string;
};

type DirectAnswer = {
  answer: string;
  support: {
    claimIds: string[];
    eventIds: string[];
    pagePaths: string[];
    inferencePathIds?: string[];
  };
  scopeState: "complete" | "partial" | "unknown";
  answerState: "supported" | "derived" | "uncertain";
};
```

Behavior rules:

```text
- No direct answer without citations.
- Derived answers must show inference paths.
- Missing facts go to cannotConfirm, not invented prose.
- Stale and conflicting claims are surfaced separately.
- Repair actions are suggestions, not mutations.
- The contextPack is derived and rebuildable.
```

Derived retrieval artifacts:

```text
ContextPack
HotPack
ExportPack
BriefPack
AgentWorkPack
SymbolicMemoryGraph
```

All are non-canonical. They may be exported to agents or used in Workbench flows, but they do not become durable memory unless explicitly captured as Events and processed through Transactions.

### Post-MVP retrieval expansion order

```text
1. Exact page hits
2. Active claims from exact pages
3. Linked ReviewItems and FollowUps
4. Evidence Events for cited, high-impact, contested, sparse, or temporal claims
5. Ontology-expanded pages
6. Symbolic retrieval hints with inference paths
7. Optional semantic search only if evaluated lexical/wikilink/ontology retrieval is insufficient
8. Final answer contract assembly with directAnswers, cannotConfirm, conflicts, staleSignals, citations, and repairActions
```

Semantic search may discover candidate context, but it may not outrank cited canonical claims or their source Events. Cited answer assembly must hydrate the evidence Events required to support direct answers before emitting the final answer contract.


---

## 16A. Repair action semantics

Repair actions are previews or transaction-backed workflows. They are not direct memory edits.

```ts
type RepairAction = {
  id: string;
  kind:
    | "capture_missing_memory"
    | "log_retrieval_miss"
    | "open_review_item"
    | "open_followup"
    | "open_entity"
    | "open_context"
    | "stage_alias_correction"
    | "stage_role_correction"
    | "stage_reporting_correction"
    | "stage_scope_clarification"
    | "stage_health_finding";
  label: string;
  previewRequired: true;
  durableWrite:
    | "none"
    | "event_plus_pending_transaction"
    | "pending_transaction"
    | "validated_transaction_apply";
};
```

Rules:

```text
- Repair actions are not mutations by themselves.
- UI/API handlers must preview before write.
- Durable repair writes use Events and/or pending Transactions.
- Repair actions may not directly edit current pages.
```

## 17. Maintenance and linting

### Cadence

| Cadence | Check |
|---|---|
| Per ingest | Schema validation, transaction validation, source-event links, unique IDs. |
| Daily, ≤10 minutes | Review new staged items and failed/pending transactions. |
| Weekly, ≤30 minutes | Duplicate candidates, stale follow-ups, unscoped claims, contradictions, broken links. |
| Monthly | Summary drift, topic bloat, orphan pages, review backlog compression. |

### Backlog limit

```text
If review/inbox.md exceeds 25 unresolved items or 7 days of unresolved ambiguous items, create a compact prioritized backlog summary and stop generating per-item expansion until the backlog is reviewed.
```

### Maintenance checks

| Check | Detection heuristic | Output artifact | Automatic action | Review required | False-positive risk |
|---|---|---|---|---|---|
| Duplicate people | Similar names, aliases, overlapping roles/interactions | `review/duplicates.md` | Stage candidate | Merge requires review | Medium |
| Duplicate topics | Similar titles, aliases, overlapping links | `review/duplicates.md` | Stage candidate | Merge requires review | Medium |
| Unscoped claims | `scope_state: unknown` on system/context claims | `review/unscoped-claims.md` | Stage only | Required | Low |
| Stale follow-ups | Committed follow-up old or due date passed | `review/stale-items.md` | Stage closure candidate | Recommended | Low |
| Contradictions | Active claims conflict in same scope/time | `review/contradictions.md` | Stage only | Required | Low |
| Summary drift | Summary contains unsupported text or excludes active claims | `review/stale-items.md` | Draft regenerated summary | Recommended | Medium |
| Broken links | Wikilink target missing | `review/inbox.md` or validation failure | Block transaction if new | Required if existing | Low |
| Orphan pages | No links and no recent event references | `review/stale-items.md` | Suggest archive | Optional | Medium |
| Review backlog growth | Too many unresolved staged items | `logs/maintenance-log.md` + inbox summary | Compact/prioritize | Required | Low |
| Topic bloat | >7 active claims, >5 open questions, >10 related links | `review/inbox.md` | Stage split candidate | Required | Medium |

---


## 17A. Maintenance, consolidation, and repair cycles

> This section describes a derived or review-gated post-MVP capability. It does not expand the set of canonical memory objects and does not authorize direct writes to Person, Context, Topic, FollowUp, ReviewItem, or Transaction pages.

Maintenance is a lifecycle, not an afterthought. Assisto's knowledge lifecycle is:

```text
Capture
Compile
Validate
Review
Retrieve
Repair
Consolidate
Archive
```

Consolidation or "dream cycle" passes may produce:

```text
duplicate candidates
stale claim findings
unscoped claim findings
contradiction findings
missing evidence findings
suggested context splits
suggested topic splits
review backlog summaries
regenerated summary drafts
source coverage gaps
retrieval miss clusters
```

Unsafe consolidation outputs:

```text
direct canonical rewrites
automatic merges
automatic contradiction resolution
automatic deletion
generated explanation persistence
```

Rule:

```text
Consolidation may find, rank, draft, and stage. It may not silently rewrite.
```

### Bias-aware randomized lint

Assisto should not only lint recently changed pages or follow ingestion order. Long-lived contradictions may appear across old pages, and context-window limits make full-vault linting impractical.

Add lint modes:

```text
/wm-lint --changed
/wm-lint --random --sample 8
/wm-lint --topic pgvector --neighborhood-depth 2
/wm-lint --resume lint_<id>
```

Lint runs are recorded under:

```text
review/lint-runs/
```

Example lint-run metadata:

```yaml
id: lint_2026_06_01_random_001
mode: random_batch
random_seed: 4815162342
sample_size: 8
sampled_pages:
  - people/joe.md
  - topics/pgvector.md
  - contexts/current-work.md
open_threads:
  - possible_mysql_scope_conflict
```

## 17B. Adversarial review

> This section describes a derived or review-gated post-MVP capability. It does not expand the set of canonical memory objects and does not authorize direct writes to Person, Context, Topic, FollowUp, ReviewItem, or Transaction pages.

Adversarial review is a post-MVP lint mode. It uses a second model or independent pass to inspect pages for:

```text
unsupported summaries
inference promoted as fact
overgeneralized scope
stale claims
contradiction candidates
missing evidence
missing ReviewItems
```

Adversarial review may emit derived findings, ReviewItem candidates, or pending `STAGE_REVIEW` Transactions. A durable ReviewItem is created only through the existing transaction-backed staging path. It may not apply transactions, rewrite summaries, supersede claims, merge entities, delete memory, resolve contradictions, or directly write canonical ReviewItems.

Commands:

```text
/wm-adversarial-review <page>
/wm-adversarial-review --changed-since HEAD~1
/wm-adversarial-review --high-impact
```

Allowed outputs:

```text
- derived finding
- ReviewItem candidate
- pending STAGE_REVIEW Transaction
- log entry
```

Forbidden outputs:

```text
- direct canonical ReviewItem write
- direct summary rewrite
- direct claim supersession
- direct entity merge
- direct contradiction resolution
```

Example ReviewItem candidate:

```yaml
review_reason: unsupported_summary
severity: medium
affected_files:
  - people/joe.md
issue: >
  Summary says Joe owns database decisions, but evidence only supports
  "Joe is the DBA."
candidate_resolutions:
  - remove ownership wording
  - downgrade to inference
  - ask user whether Joe owns DB decisions
```

## 17C. Maintenance domain events

> This section describes a derived or review-gated post-MVP capability. It does not expand the set of canonical memory objects and does not authorize direct writes to Person, Context, Topic, FollowUp, ReviewItem, or Transaction pages.

Assisto should record high-level maintenance events in `logs/domain-events.md` or `logs/maintenance-events/YYYY-MM.md`.

Examples:

```text
DuplicateCandidateDetected
EntityAliasProposed
ConceptRelationshipTyped
ConceptLevelChanged
ClaimPromotedToTopic
TopicSplitCandidateDetected
ContradictionCandidateDetected
UnsupportedSummaryDetected
ScopeClarificationRequested
StaleClaimCandidateDetected
```

Example:

```yaml
event_type: DuplicateCandidateDetected
subject: per_joe
candidate: per_joseph
evidence:
  - similar_name: true
  - overlapping_role: DBA
  - overlapping_topics: [mysql, pgvector]
result:
  review_item: rev_duplicate_joe_joseph
```

Maintenance domain events are operational audit entries. They belong in Logs, not Events, unless the user explicitly captures a maintenance finding as a work note. They may cite Events and ReviewItems, but they are not themselves evidence for work-memory claims. Domain events are operational evidence about Assisto's maintenance behavior; they do not create canonical work facts.

## 17D. Workbench and daily dogfood loops

> This section describes a derived or review-gated post-MVP capability. It does not expand the set of canonical memory objects and does not authorize direct writes to Person, Context, Topic, FollowUp, ReviewItem, or Transaction pages.

Assisto's strongest path to usefulness is a daily operating loop, not just better extraction.

Daily loop:

```text
capture one real note
→ review one pending transaction
→ ask one cited question
→ repair one missing or wrong memory item
→ generate one disposable brief
```

Workday modes:

```text
Morning review
Meeting prep
After-meeting capture
End-of-day review
Weekly health check
```

High-value surfaces:

```text
Dogfood Home
Daily Queue
Capture Inbox
Import Assistant
Ask Workbench
Context Dashboards
Meeting Modes
End-of-Day Review
Personal Dogfood Eval
```

Rules:

```text
- Workbench state is derived or local UI state.
- Durable changes route through Events and Transactions.
- Disposable briefs are not memory unless explicitly captured.
```


## 18. Human review model

| Operation | Automatic | Staged | Forbidden in MVP | Rule |
|---|---:|---:|---:|---|
| Create Event | Yes | No | No | Always safe if raw text preserved. |
| Create Person | Sometimes | Yes | No | Automatic only for clear `new_entity`; stage if near/ambiguous. |
| Add Person fact | Sometimes | Yes | No | Low-risk additive facts may apply; role changes stage. |
| Add communication inference | No | Yes | No | Never silently canonical. |
| Create Topic | Yes | Sometimes | No | Exact technical term can create topic; ambiguous term stages. |
| Create Context | No | Yes | No | Scope-defining object is high impact. |
| Create candidate follow-up | Yes | Sometimes | No | Must be marked candidate. |
| Create committed follow-up | Yes only explicit | Yes | No | Requires trigger phrase. |
| Change follow-up state | Sometimes | Yes | No | Explicit user closure can apply; inferred closure stages. |
| Supersede role/system claim | No | Yes | No | High-impact current-state change. |
| Merge people/topics | No | Yes | Yes automatic | Stage only. |
| Delete memory | No | Yes | Yes automatic | Use archive/reject; delete only explicit future feature. |
| Resolve contradiction | No | Yes | Yes automatic | Assistant may propose only. |

---

## 19. Validation rules

Validation must run before any transaction is applied.

### Validators

| Validator | Rule |
|---|---|
| `validate-frontmatter` | Required fields exist and allowed enum values are used. |
| `validate-claim-blocks` | Claims include `claim_id`, `statement`, `claim_kind`, `claim_state`, `evidence_strength`, `scope_state`, evidence, temporal fields. |
| `validate-source-event-links` | Every active durable claim cites at least one existing Event ID. |
| `validate-wikilinks` | All new wikilinks resolve or are explicitly declared as newly created. |
| `validate-unique-ids` | No duplicate page IDs, claim IDs, Event IDs, or transaction IDs. |
| `validate-no-committed-followup-without-trigger` | Committed follow-ups require explicit trigger phrase or reviewed transaction. |
| `validate-no-active-system-claim-with-scope-unknown` | Active Context/Topic system claims cannot have `scope_state: unknown`; they must stage. |
| `validate-summary-basis` | New summary text must derive from active claims or be omitted. |
| `validate-no-ambiguous-entity-update` | `near_match` and `ambiguous` entities cannot be updated automatically. |
| `validate-transaction-rollback` | Transactions include rollback/repair notes. |
| `validate-ontology-relation-known` | Relation names in ontology-aware frames must exist in the OntologyRegistry. |
| `validate-ontology-domain-range` | Relation frames must satisfy relation domain/range constraints. |
| `validate-ontology-scope-requirements` | Relations requiring scope must stage or fail when scope is missing. |
| `validate-no-generic-related-when-specific-exists` | Generic `related` links should fail or stage when a more specific relation applies. |
| `validate-derived-facts-non-canonical` | Derived symbolic facts cannot appear as active canonical claims. |
| `validate-proof-for-derived-fact` | Every derived finding must have rule IDs and source claim/Event premises. |
| `validate-write-lock-requirements` | Transaction application must use global/per-file locks after write-safety phase. |

### Validation failure behavior

```text
1. Mark transaction `failed` or keep `pending`.
2. Do not apply canonical page edits.
3. Preserve the Event.
4. Create or update a ReviewItem.
5. Append a log entry.
```

---

## 20. Evaluation plan

### Acceptance thresholds

| Metric | Threshold |
|---|---:|
| Committed follow-up precision | ≥ 95% |
| Duplicate-person false merge rate | 0% |
| Unscoped system claims auto-promoted | 0% |
| Source citation coverage for factual answers | ≥ 95% |
| Transaction validation failure caught before write | 100% |
| Scoped fact recall | ≥ 85% |
| Active-role stale answer rate in test set | ≤ 5% |
| Summary unsupported-claim rate | 0% for MVP-generated summaries |
| Broken-link rate after applied transactions | 0% |
| Review backlog unresolved after weekly review | ≤ 25 items |
| Answer citation coverage for CitedAnswerContract | ≥ 95% |
| Unsupported answer count in answer evals | 0 high-impact answers |
| Inference laundering violations | 0 |
| Derived facts with proof traces | 100% |
| Derived facts written as active canonical claims | 0 |
| Generic relation when specific relation exists | 0 in generated examples |
| Concurrent transaction corruption | 0 |
| Adversarial review direct edits | 0 |
| Randomized lint reproducibility with fixed seed | 100% |

### Post-MVP eval gates

New intelligence layers require their own eval gates:

```text
eval:answers
eval:ontology
eval:reasoning
eval:maintenance
eval:adapters
```

Minimum scenarios:

```text
- manager/reporting inverse relation
- ownership relation with missing scope
- stale role detection
- conflict detection in same scope
- no inference promoted to active claim
- symbolic derived fact has inference path
- changed ontology invalidates derived index
- explanation repeat stages candidate, not page
- adversarial review creates pending STAGE_REVIEW Transaction only
- source adapter preserves raw text and hash
```

Post-MVP acceptance thresholds:

```text
unsupported direct answers = 0
derived facts written as active claims = 0
symbolic outputs without inference path = 0
ontology relation domain/range violations missed = 0
automatic entity merges from ontology/reasoning = 0
automatic contradiction resolution from reasoning = 0
generated explanation persistence without explicit capture = 0
adversarial review direct canonical writes = 0
semantic search unsupported-fact answers = 0
```

### Required tests

| Test | Scenario | Failure caught |
|---|---|---|
| Factual recall | Ask who Joe/Mike are. | Missing active claims. |
| Scoped recall | Ask which system uses MySQL. | Overgeneralized unscoped claims. |
| Temporal recall | Ask who was DBA before/after a correction. | Validity confusion. |
| Entity resolution | Joe/Joseph/Joey/Michael variants. | False merges/splits. |
| Alias collision | Joe DBA vs Joe sales. | Ambiguous identity corruption. |
| Fake obligation avoidance | “We discussed asking Joe” vs “Remind me to ask Joe.” | Follow-up noise. |
| Follow-up precision | Mix candidate and committed phrases. | False commitments. |
| Contradiction detection | MySQL/Postgres same scope. | Hidden conflict. |
| Stale claim detection | Role changes after older claim. | Stale current state. |
| Summary drift | Repeated updates to same page. | Unsupported summary facts. |
| Transaction rollback | Forced partial write failure. | Corrupt multi-file state. |
| Review backlog growth | 200 ambiguous notes. | Unusable review queue. |
| Source-grounded answer | Ask factual query requiring evidence. | Unsupported answer. |
| Retrieval context packing | Solr/Qdrant Joe/Mike query. | Irrelevant or missing context. |
| Ontology domain/range | `uses_technology(Person, MySQL)` fails or stages. | Invalid semantic frames. |
| Ontology scope requirement | `uses_technology(unknown, MySQL)` stages. | Unscoped technical truth. |
| Relation typing | Generic `related` rejected when `discussed_topic` applies. | Relationship collapse. |
| Symbolic retrieval hint | Joe is retrieved for pgvector through proof-backed discussion rule. | Opaque retrieval. |
| Symbolic no-canonical-write | Derived facts cannot modify People/Topics/Contexts. | Inference becoming truth. |
| Proof required | Every derived fact has rule ID and premises. | Unexplainable reasoning. |
| Adversarial unsupported summary | “Joe owns DB decisions” from “Joe is DBA” creates ReviewItem. | Summary overreach. |
| Concurrent apply | Two transaction applies cannot corrupt files. | Physical write race. |
| Randomized lint | Fixed seed reproduces sampled page set. | Non-reproducible maintenance. |
| Adapter normalization | Future input adapters output Events only. | Source-specific direct mutation. |
| Personal dogfood eval | Real user questions require expected claim/Event/page IDs. | Synthetic-only eval blindness. |


### Personal dogfood evals

Assisto should evaluate against the user's real questions, not only synthetic fixtures. Personal evals live in local `.assisto-local` state and should not be committed if they contain private work questions.

Workbench session state belongs under `.assisto-local/**` or equivalent ignored runtime storage. It may store pinned questions, daily UI progress, import sessions, and local eval question sets. It must not store canonical claims, generated answer truth, generated briefs as memory, or transaction substitutes. Deleting `.assisto-local/**` must not corrupt memory.

Example eval item:

```json
{
  "question": "Who is my manager?",
  "expected_claim_ids": ["clm_example"],
  "expected_event_ids": ["ev_example"],
  "expected_page_paths": ["memory/people/example.md"],
  "tags": ["manager", "person"]
}
```

Metrics:

```text
answerability
citation coverage
irrelevant inclusion count
cannot-confirm quality
review/follow-up surfacing
generated-persistence violations
missing-memory action quality
```

Retrieval misses should become repair suggestions, not hallucinated answers.


---

## 21. Prototype experiments

### Experiment 1 — Ingestion precision benchmark

| Item | Definition |
|---|---|
| Goal | Validate extraction, staging, follow-up precision, and entity linking. |
| Setup | 100 synthetic-but-realistic work notes. |
| Inputs | 25 person facts, 20 technical/system facts, 20 meeting snippets, 15 ambiguous scope statements, 10 candidate follow-ups, 10 committed follow-ups. |
| Metrics | Correct event creation, correct entity linking, correct auto/stage decision, committed follow-up precision, unscoped claim staging rate, duplicate false positives. |
| Expected outcome | No committed false follow-ups; no unscoped system claims promoted. |
| Decision informed | Whether ingestion prompts and staging gates are safe enough. |

### Experiment 2 — Source-event granularity A/B

| Variant | Description |
|---|---|
| A | One event per user message. |
| B | One event per extracted claim. |
| C | One event per daily batch. |
| D | One event per meeting section. |

Metrics:

```text
- retrieval usefulness
- provenance clarity
- number of files created
- token cost for answer context
- ease of human inspection
```

Expected outcome:

```text
Use message-level events for chat notes and section-level events for long meetings.
```

### Experiment 3 — Follow-up extraction stress test

Inputs:

```text
“We talked about asking Joe.”
“I should ask Joe.”
“Remind me to ask Joe.”
“Joe asked me to send him the numbers.”
“Maybe we need to follow up.”
“I’ll send Mike the comparison tomorrow.”
```

Expected outputs:

```text
- no follow-up
- candidate follow-up
- committed follow-up
- committed external-request follow-up
- candidate follow-up
- committed follow-up with owner=user
```

### Experiment 4 — Entity resolution torture test

Inputs:

```text
Joe
Joseph
Joey
Joe from DBA
Joe from sales
Mike
Michael
Miguel
```

Metrics:

```text
- false merge rate
- false split rate
- staged ambiguity rate
```

Target:

```text
false merge rate = 0%
```

### Experiment 5 — Temporal supersession test

Sequence:

```text
Day 1: Joe is the DBA.
Day 10: Alex is handling DB migrations now.
Day 20: Joe moved off DBA work; Alex owns DBA tasks.
```

Questions:

```text
Who is the DBA now?
Who was the DBA on Day 1?
When did Alex become relevant?
What evidence supports this?
```

Decision informed:

```text
Whether temporal fields and supersession semantics are sufficient.
```

### Experiment 6 — Summary drift test

Setup:

```text
Update one person/topic page 30 times.
Compare Current summary against active claims and source events.
```

Expected:

```text
No unsupported summary statements.
```

### Experiment 7 — Review backlog simulation

Setup:

```text
Run 200 notes with ambiguous claims.
```

Track:

```text
- number of review items
- duplicate review items
- average time to resolve
- unresolved backlog after one week
- whether items remain understandable
```

Decision informed:

```text
Whether review model is operationally sustainable.
```

### Experiment 8 — Retrieval context packing test

Query:

```text
How should I explain Joe and Mike the difference between Solr and Qdrant?
```

Compare:

```text
A. lexical only
B. lexical + wikilinks
C. lexical + wikilinks + vector
```

Score:

```text
- loads Joe and Mike
- loads Solr and Qdrant
- avoids irrelevant meetings
- preserves audience-specific framing
- cites uncertainty when topic pages are sparse
```

Decision informed:

```text
Whether vector search is needed.
```

### Experiment 9 — Markdown noise endurance test

After 30 simulated days inspect:

```text
- number of files
- average page length
- staged item count
- orphan links
- unresolved claims
- topic pages with >10 unrelated links
```

Decision informed:

```text
Whether schema remains human-readable.
```

### Experiment 10 — Multi-file rollback test

Force ingest failure after Event write but before Person/Topic/Review updates.

Expected:

```text
- transaction remains pending or failed
- no dangling active claim
- no broken source-event reference
- rollback or repair is straightforward
```

Decision informed:

```text
Whether transaction model is safe enough for automation.
```

---

## 22. Architecture-neutral implementation roadmap

> This section describes a derived or review-gated post-MVP capability where explicitly labeled. It does not expand the set of canonical memory objects and does not authorize direct writes to Person, Context, Topic, FollowUp, ReviewItem, or Transaction pages.

### Roadmap by implementation status

The roadmap separates the current invariant from near-term hardening and post-MVP architecture so future agents do not mistake roadmap concepts for implemented canonical behavior.

#### MVP invariant / always required

```text
Event evidence
Candidate claims
Transactions
validation
ReviewItems
claim provenance
staging
no autonomous merge
no autonomous contradiction resolution
```

#### Near-term hardening

```text
write permission matrix
ontology path correction
adversarial review transaction path
RepairAction semantics
retrieval evidence hydration
symbolic index rebuild semantics
ontology versioning
```

#### Post-MVP architecture

```text
Cited Answer Engine
Entity Stewardship Command Center
Context Operating Rooms
Source Adapter Fabric
Derived Ontology and Symbolic Reasoning
Consolidation and Repair Cycles
Dogfood Workbench and Personal Eval Loops
```

#### Deferred research / explicitly out of scope

```text
graph database as canonical state
vector search as canonical state
autonomous merge
autonomous contradiction resolution
full transcript ingestion
generated explanation persistence without explicit capture
```

### Phase 0 — Manual markdown prototype and schema validation

| Field | Detail |
|---|---|
| Goal | Prove file layout, schemas, and validation rules manually. |
| Deliverables | Folder layout, templates, validators, 20 hand-authored examples. |
| Deferred | Automation, MCP, vector search, graph indexes. |
| Risk | Schema too verbose or brittle. |
| Success criteria | All example files validate; user can inspect and edit pages easily. |

### Phase 1 — Transaction-based ingestion prompts

| Field | Detail |
|---|---|
| Goal | Generate Events, candidate claims, transactions, and staged review items from short notes. |
| Deliverables | Ingestion prompt, transaction template, validation checklist, log entries. |
| Deferred | Direct file-writing automation. |
| Risk | Over-extraction and fake obligations. |
| Success criteria | Follow-up precision ≥95%; no unscoped system claim promoted. |

### Phase 2 — Lexical retrieval and context packing

| Field | Detail |
|---|---|
| Goal | Answer from current pages and events without vector search. |
| Deliverables | Retrieval rules, context packing template, worked examples. |
| Deferred | Embeddings, reranking, graph traversal. |
| Risk | Missing semantically related notes. |
| Success criteria | Solr/Qdrant Joe/Mike scenario retrieves relevant pages and avoids noisy context. |

### Phase 2.5 — Write safety and locking

| Field | Detail |
|---|---|
| Goal | Prevent physical file corruption under parallel or ambient runtimes. |
| Deliverables | Global apply lock, per-file locks, atomic writes, failed transaction repair path. |
| Deferred | Parallel ingestion, background jobs, Hermes/Pi gateway ingestion. |
| Risk | False sense of safety from logical transactions alone. |
| Success criteria | Concurrent transaction tests cannot corrupt files. |

### Phase 3 — Review queue and weekly linting

| Field | Detail |
|---|---|
| Goal | Make staged items operationally manageable. |
| Deliverables | Review inbox, duplicate checks, unscoped-claim checks, stale follow-up checks, summary drift checks. |
| Deferred | Autonomous resolution. |
| Risk | Review backlog becomes too large. |
| Success criteria | Weekly review stays under 30 minutes and backlog ≤25 items. |

### Phase 3.5 — Cited Answer Engine

| Field | Detail |
|---|---|
| Goal | Upgrade retrieval into structured, cited answers with uncertainty, conflicts, stale signals, and repair actions. |
| Deliverables | `CitedAnswerContract`, `AnswerCitationMap`, `cannotConfirm`, `conflicts`, `staleSignals`, `repairActions`. |
| Deferred | Persisting generated answers as memory. |
| Risk | User treats fluent answers as canonical truth. |
| Success criteria | High-impact answers have citations or explicit cannot-confirm entries; no inference laundering. |

### Phase 3.6 — Entity Stewardship Command Center

| Field | Detail |
|---|---|
| Goal | Surface identity risk, duplicate candidates, alias conflicts, stale claims, and conflicting facts. |
| Deliverables | Derived entity risk views, duplicate/alias review lanes, identity repair suggestions. |
| Deferred | Automatic merge/split/delete. |
| Risk | False merges corrupt memory. |
| Success criteria | Ambiguous identities are staged and never merged automatically. |

### Phase 3.7 — Context Operating Rooms

| Field | Detail |
|---|---|
| Goal | Provide derived project/system/team cockpits with owners, decisions, open questions, risks, follow-ups, and source timeline. |
| Deliverables | Derived context room view, timeline, cited brief generation, repair suggestions. |
| Deferred | Context room as canonical page replacement. |
| Risk | Derived room treated as truth. |
| Success criteria | Context rooms cite source claims/events and route corrections through Transactions. |

### Phase 4 — Optional MCP/tool integration

| Field | Detail |
|---|---|
| Goal | Add safer tooling for read/write/search once semantics are stable. |
| Deliverables | Tool interface, permission rules, surgical edit operations. |
| Deferred | Complex graph/vector retrieval. |
| Risk | Tooling complexity hides semantic problems. |
| Success criteria | Tools apply only validated transactions. |

### Phase 4.5 — Source Adapter Fabric

| Field | Detail |
|---|---|
| Goal | Add document/transcript/email/browser inputs without fragmenting the architecture. |
| Deliverables | `InputAdapter` / `SourceAdapterOutput`, source hashes, observed dates, parser notes, normalized Events. |
| Deferred | Direct source-specific canonical mutations. |
| Risk | Adapters bypass Events or generate too many claims. |
| Success criteria | Every adapter outputs Events and uses the normal transaction path. |

### Phase 5 — Derived Ontology and Symbolic Reasoning

| Field | Detail |
|---|---|
| Goal | Add typed relation semantics, bounded inference, proof traces, stale/conflict signals, and review candidates. |
| Deliverables | `OntologyRegistry`, `RelationDefinition`, `SymbolicMemoryGraph`, `InferencePath`, `ReasoningFinding`. |
| Deferred | Graph database as canonical state, autonomous theorem proving, automatic inferred facts. |
| Risk | Hidden symbolic errors or ontology rigidity. |
| Success criteria | Every reasoning output is `derived_only`, proof-backed, and unable to write active claims directly. |

### Phase 5.5 — Consolidation and Repair Cycles

| Field | Detail |
|---|---|
| Goal | Add review-gated dream cycles for duplicates, stale claims, contradictions, gaps, retrieval misses, and summary drafts. |
| Deliverables | Randomized lint, persistent lint scratchpad, domain events, repair suggestions, pending Transactions. |
| Deferred | Autonomous cleanup. |
| Risk | Review fatigue. |
| Success criteria | Consolidation finds issues and stages them without silently rewriting canonical memory. |

### Phase 6 — Dogfood Workbench and Personal Eval Loops

| Field | Detail |
|---|---|
| Goal | Make the system useful in daily work through capture/review/ask/repair/brief loops and personal evals. |
| Deliverables | Dogfood Home, Daily Queue, Ask Workbench, meeting modes, end-of-day review, personal eval format. |
| Deferred | Product polish and full UI. |
| Risk | Beautiful but unused system. |
| Success criteria | User can run daily loop and personal evals without violating canonical/derived boundaries. |

### Phase 7 — Automation after thresholds are met

| Field | Detail |
|---|---|
| Goal | Automate only safe, proven operations. |
| Deliverables | Automated ADD_EVENT, low-risk UPSERT_CLAIM, STAGE_REVIEW, validation, logs. |
| Deferred | Autonomous merge/delete/contradiction resolution, generated explanation persistence. |
| Risk | Silent memory corruption. |
| Success criteria | All evaluation thresholds met over real or simulated 30-day workload. |

---

## 23. Final MVP specification

### Folder layout

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

### MVP object types

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

### Mandatory top-level metadata

```yaml
id: <stable_id>
type: <object_type>
object_state: active | archived
review_state: none | staged | reviewed | contested
created_at: <iso_datetime>        # except Events, which use recorded_at
updated_at: <iso_datetime>        # where applicable
source_events: []                 # where applicable
related: []                       # where applicable
```

### Mandatory claim fields

```yaml
claim_id: <stable_claim_id>
statement: <short statement>
claim_kind: fact | inference | assumption | preference | commitment
claim_state: active | staged | superseded | rejected
evidence_strength: explicit | inferred | weak
scope: <scope_or_null>
scope_state: complete | partial | unknown
evidence: [ev_*]
recorded_at: <iso_datetime>
observed_at: <iso_datetime_or_date_or_null>
valid_from: <date_or_null>
valid_to: <date_or_null>
```

### Temporal fields

```text
recorded_at: when memory recorded it
observed_at: when the event happened
valid_from: when claim became true, if known
valid_to: when claim stopped being true, if known
```

### Mutation operations

```text
ADD_EVENT
UPSERT_CLAIM
STAGE_REVIEW
NOOP
SUPERSEDE_CLAIM
CLOSE_FOLLOWUP
```

### Staging rules

Stage when:

```text
- scope is missing for a system/project/architecture claim
- entity resolution has more than one plausible match
- a claim changes role, owner, decision, deadline, or commitment
- a claim conflicts with an active claim in the same scope
- possible action lacks explicit commitment
- the assistant creates an inference about a person’s preferences or communication style
- a generated explanation would become durable memory without explicit user request
```

### Ingestion workflow

```text
raw capture
→ create Event
→ extract candidate claims
→ resolve entities
→ detect scope
→ classify claim kind
→ assign evidence strength
→ apply staging rules
→ create transaction
→ validate transaction
→ apply or leave pending
→ update ingest log
→ create review items as needed
```

### Retrieval workflow

```text
identify named people/topics/contexts
→ load exact pages
→ load linked review/follow-up items
→ load latest 1–3 relevant events only if sparse, contested, high-impact, or temporal
→ answer from active claims first
→ surface uncertainty when scope is unknown, partial, staged, or contested
```

### Validation rules

```text
validate-frontmatter
validate-claim-blocks
validate-source-event-links
validate-wikilinks
validate-unique-ids
validate-no-committed-followup-without-trigger
validate-no-active-system-claim-with-scope-unknown
validate-summary-basis
validate-no-ambiguous-entity-update
validate-transaction-rollback
```

### Evaluation thresholds

```text
Committed follow-up precision >= 95%
Duplicate-person false merge rate = 0%
Unscoped system claims auto-promoted = 0%
Source citation coverage for factual answers >= 95%
Transaction validation failure caught before write = 100%
Scoped fact recall >= 85%
Summary unsupported-claim rate = 0%
Broken-link rate after applied transactions = 0%
```

### First prototype scope

The first prototype should support only short user notes and manual/semiautomatic transaction application. It should not ingest full transcripts, run vector search, use a graph database, or automatically merge/resolve/delete memory.

The first milestone is:

> A source-backed markdown mutation loop that can ingest 50 realistic work notes without creating fake obligations, duplicate people, unsupported summaries, broken links, or unscoped technical truths.


---

## Appendix A — Non-canonical derived layers

Assisto may maintain derived layers:

```text
indexes/lexical/
indexes/semantic/
indexes/symbolic/
ontology views
ContextPack
HotPack
ExportPack
BriefPack
AgentWorkPack
CitedAnswerContract
Workbench/session state
personal eval sessions
```

Rules:

```text
1. Derived layers are rebuildable.
2. Derived layers never override canonical markdown.
3. Derived facts cannot appear as active canonical claims.
4. Derived retrieval hints must include provenance.
5. Derived review candidates must become ReviewItems before mutation.
6. Any canonical change requires a Transaction.
```

## Appendix B — Semantic anti-patterns

### Anti-pattern: generic relation graph

Bad:

```text
Joe related_to pgvector
Solr related_to Qdrant
```

Good:

```text
discussed_topic(Joe, pgvector, Event)
broader(qdrant, vector-search)
broader(solr, lexical-search)
```

### Anti-pattern: inference promoted as fact

Bad:

```text
Joe is DBA → Joe owns pgvector decision
```

Good:

```text
possible_stakeholder(Joe, pgvector) → retrieval hint or ReviewItem
```

### Anti-pattern: ontology as canonical truth

Bad:

```text
Ontology says DBAs own DB decisions, therefore Joe owns DB decisions.
```

Good:

```text
Ontology suggests a review candidate requiring explicit evidence.
```

### Anti-pattern: symbolic writes

Bad:

```text
Datalog rule writes to people/joe.md
```

Good:

```text
Datalog rule writes to indexes/symbolic/review-candidates.jsonl
```

### Anti-pattern: generated answer persistence

Bad:

```text
A generated answer is appended to an Explanation page because it sounded useful.
```

Good:

```text
User explicitly says "save this" → answer is captured as an Event → candidate claims/explanation → Transaction → review/apply.
```

## Appendix C — Risk register

| Risk | Description | Severity | Mitigation |
|---|---|---:|---|
| Inference laundering | Derived/generated/inferred text becomes durable truth. | High | Event → Transaction → validation/review for all durable changes. |
| False merge | Two people/topics become one incorrectly. | High | Stage near/ambiguous identity; no autonomous merge. |
| Scope overreach | Local/project fact becomes global truth. | High | Require scope for system/context claims. |
| Stale current state | Old roles or owners keep answering as current. | High | Temporal fields, supersession, stale signals, context timelines. |
| Review fatigue | Too many staged items become ignored. | High | Daily queue, prioritization, grouped review summaries. |
| Retrieval drift | Larger memory retrieves wrong or irrelevant pages. | Medium | Answer evals, citation coverage, repair actions, personal dogfood eval. |
| Ingestion-order bias | Early sources dominate summaries and framing. | Medium | Bias-aware lint and randomized/stratified maintenance. |
| Provenance too coarse | Event-level citations cannot support precise claims. | Medium | Optional span/page/line evidence ladder. |
| Tooling becomes canonical | Index/graph/vector/UI state outranks markdown. | High | Derived-artifact rule and rebuildability checks. |
| Full transcript noise | Bulk ingestion overwhelms review and claims. | Medium | Curated import, triage, source hashes, limit handling. |
| Generated brief persistence | Disposable summaries become memory. | High | Capture only via explicit source Event and pending Transaction. |
| Concurrency corruption | Two agents mutate same pages inconsistently. | High | Transaction locks, write safety, validation before apply. |
| Ontology rigidity | Overdesigned taxonomy blocks real work. | Medium | Small registry, versioned rules, derived only. |
| Hidden symbolic errors | Reasoner implies unsupported facts. | High | Inference paths, cannot-confirm, no canonical writes. |
| Eval blindness | Synthetic tests pass but real use fails. | Medium | Personal dogfood eval and retrieval miss logging. |

## Appendix D — Source references

- [KW] Andrej Karpathy, **LLM Wiki**: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- [GC] Public comments on the LLM Wiki gist, especially implementation lessons on Identity, Level, Relationship, lint/dream cycles, provenance, and maintenance.
- W3C SKOS Primer: https://www.w3.org/TR/skos-primer/
- W3C SHACL Recommendation: https://www.w3.org/TR/shacl/
- Soufflé Datalog tutorial: https://souffle-lang.github.io/tutorial
- Soufflé provenance guide: https://souffle-lang.github.io/provenance
