# Memory conventions

Canonical memory lives under `memory/`. Markdown files are the durable source of record.

Derived artifacts may guide, explain, preview, rank, and propose. Only Events, Transactions, validation, and review create durable memory.

## canonical vs derived

| Canonical | Derived |
|---|---|
| Events | CitedAnswerContract |
| People, Contexts, Topics, FollowUps | ContextPack, HotPack, ExportPack, BriefPack |
| ReviewItems | Workbench views and session state |
| Transactions | Health summaries |
| Logs | Semantic/symbolic/ontology indexes |
| `memory/schema/**` policy | `.assisto-local/**` |

## MVP object types

Allowed top-level object types:

- `event`
- `person`
- `context`
- `topic`
- `followup`
- `review_item`
- `transaction`
- `log_entry`

Do not create standalone Decision, OpenQuestion, Explanation, OntologyView, SymbolicFact, Brief, EvalSession, or WorkbenchSession objects without a documented migration.

## Required Mutation Flow

```text
Raw input → Event → Candidate claims → Transaction → Validated mutation or staged review → Current pages
```

Ingestion, capture, and import logic may write Events and pending Transactions. They must not directly write People, Contexts, Topics, FollowUps, ReviewItems, or Logs outside proposed transaction writes.

## Claims

Every active durable claim must cite at least one Event ID. Generated/symbolic/retrieval artifacts must not become active claims unless explicitly captured as evidence and routed through a validated Transaction.

## Source adapter metadata

Events may include:

- `source_label`;
- `contexts`;
- `source_hash`;
- parser notes;
- optional source spans.

`source_hash` is used for duplicate raw Markdown/text import detection. It does not promote unscoped claims into active truth.

## Repair actions

Repair actions are previews or transaction-backed writes. They are not direct memory edits.

Durable write modes:

- `none`;
- `event_plus_pending_transaction`;
- `pending_transaction`;
- `validated_transaction_apply`.

## Local State

`.assisto-local/**` is noncanonical local state. It may store UI/session preferences, pinned questions, import sessions, and personal eval question sets. It must not store canonical claims, generated answer truth, generated briefs as memory, or transaction substitutes.
