# Revised Design: Local-First AI Work-Memory Assistant

## Source basis and revision status

This document revises the original **Design Synthesis for a Local-First AI Work-Memory Assistant** and applies the pasted senior-architect critique. The design keeps the original direction—an inspectable markdown-backed work-state compiler—but narrows the first implementation to a transaction-safe MVP.

Notation used in this document:

- **[DS]** refers to the original design synthesis. It is treated as the source for the initial layered model, object model, mutation operations, retrieval strategy, maintenance ideas, and roadmap.
- **[PA]** refers to the prior-art report. It is treated as evidence for the public-system landscape, including Karpathy-style LLM Wikis, Basic Memory, Obsidian/MCP tooling, LangMem, Mem0, Graphiti/Zep, CRM-style markdown systems, and meeting-ingestion systems.
- **[CR]** refers to the pasted senior-architect critique. It is treated as the source for the implementation discipline introduced here: transaction layer, reduced MVP, deterministic staging, stricter follow-up rules, schema validation, temporal-field separation, and evaluation thresholds.

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

---

## 3. Reduced MVP scope

### In scope

The MVP includes only what is necessary to validate the source-backed markdown mutation loop.

| Capability | Included behavior |
|---|---|
| Events | Create one Event per user note, meeting, transcript section, or imported document section. |
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

  transactions/
    pending/
    applied/
    rejected/
    failed/

  logs/
    ingest-log.md
    maintenance-log.md

  indexes/
    README.md
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

---

## 5. Revised object model

### 5.1 Event

| Field | Definition |
|---|---|
| Purpose | Immutable evidence unit representing a user note, meeting note, transcript section, imported document section, or query worth preserving. |
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

## 16. Retrieval and context assembly

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

---

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

### Phase 3 — Review queue and weekly linting

| Field | Detail |
|---|---|
| Goal | Make staged items operationally manageable. |
| Deliverables | Review inbox, duplicate checks, unscoped-claim checks, stale follow-up checks, summary drift checks. |
| Deferred | Autonomous resolution. |
| Risk | Review backlog becomes too large. |
| Success criteria | Weekly review stays under 30 minutes and backlog ≤25 items. |

### Phase 4 — Optional MCP/tool integration

| Field | Detail |
|---|---|
| Goal | Add safer tooling for read/write/search once semantics are stable. |
| Deliverables | Tool interface, permission rules, surgical edit operations. |
| Deferred | Complex graph/vector retrieval. |
| Risk | Tooling complexity hides semantic problems. |
| Success criteria | Tools apply only validated transactions. |

### Phase 5 — Optional vector/graph indexes

| Field | Detail |
|---|---|
| Goal | Improve retrieval only if lexical/wikilink retrieval fails. |
| Deliverables | Derived index pipeline, rebuild procedure, evaluation comparison. |
| Deferred | Making index canonical. |
| Risk | Search layer becomes source of truth. |
| Success criteria | Demonstrated retrieval improvement without canonical-state confusion. |

### Phase 6 — Automation after thresholds are met

| Field | Detail |
|---|---|
| Goal | Automate only safe, proven operations. |
| Deliverables | Automated ADD_EVENT, low-risk UPSERT_CLAIM, STAGE_REVIEW, validation, logs. |
| Deferred | Autonomous merge/delete/contradiction resolution. |
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
