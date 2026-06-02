# Ontology And Symbolic Reasoning

This document explains Assisto's post-MVP ontology and symbolic reasoning model. These layers are derived and review-gated. They do not create a canonical graph database.

## Ontology Registry

Policy lives under:

```text
memory/schema/ontology/
```

Derived views live under:

```text
memory/indexes/ontology/
memory/indexes/symbolic/
```

The registry defines entity kinds, relation kinds, claim patterns, scopes, and review rules. The v10 registry adds explicit daily-work kinds and relation lanes so symbolic reasoning can distinguish reporting, ownership, technology, dependency, blocker, risk, meeting, discussion, decision, open-question, commitment, due-date, and structural changes without treating the ontology as canonical graph state.

## Relation Definitions

Relation definitions may include domain/range, inverse relation, transitivity, symmetry, required scope, temporal behavior, cardinality hint, and review risk.

Examples:

- `reports_to`;
- `manages`;
- `owns`;
- `maintains`;
- `uses_technology`;
- `depends_on`;
- `blocks`;
- `raises_risk`;
- `participant_in`;
- `discussed_in`;
- `has_decision`;
- `has_open_question`;
- `committed_to`;
- `due_on`;
- `part_of`.


## Ontology-Aware Frames

Ontology-aware frames are intermediate extraction artifacts. They are not canonical claim blocks and are not graph edges. A frame becomes durable only if converted into a valid Event-backed claim inside a pending Transaction, or if it is staged as a ReviewItem candidate.

```ts
type OntologyAwareFrame = {
  subject_id?: string;
  subject_kind: string;
  relation: string;
  object_id?: string;
  object_kind: string;
  statement: string;
  scope?: string | null;
  evidence: string[];
};
```

Frames must stage review when the relation is unknown, the domain or range is invalid, required scope is missing, source evidence is missing, or the frame represents a high-risk relation change. Staging uses a pending Transaction with `STAGE_REVIEW`; ontology validation does not write current pages directly.

## InferencePath

Every derived symbolic output needs an inference path:

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


## Symbolic Reasoning Kernel v2

The v10 reasoning kernel produces `symbolic-reasoning-v2` query results. It remains a derived layer:

- `buildSymbolicIndex({ write: true })` may write rebuildable JSONL index artifacts under `memory/indexes/symbolic/`;
- `wm indexes query-symbolic "<query>" [--json]` builds an in-memory symbolic index and does not write index files;
- every match includes the source fact, source proof, and a nested proof tree;
- transitive ontology relations such as `depends_on` and `blocks` can produce `transitive_relation` facts, with source fact IDs preserved in the proof tree.

The query planner is deterministic and relation-bounded. It recognizes reporting, ownership, dependency chains, blocker chains, meeting participation, open questions, commitment due dates, changed-recently lookups, and generic proof lookup. It does not infer new canonical claims and does not resolve contradictions.

## Symbolic Index Rebuild Semantics

Symbolic indexes are cache artifacts. They must be deletable and rebuildable from canonical markdown, schema/ontology policy, and deterministic rules. They should record rule version, ontology version, generated time, and input hashes.

## Ontology Versioning

Ontology changes invalidate derived indexes and may stage ReviewItems or pending `STAGE_REVIEW` Transactions. They do not rewrite canonical claims automatically.

## Why Not Graph DB Yet

Graph-shaped views are useful, but a graph database is not canonical memory. Markdown remains source of truth. Graph indexes may be evaluated later as rebuildable derived artifacts.

## Source-To-Reasoning Loop

v10 connects the ontology and reasoning layers to Source Inbox and answer contract v4. Local export units become Event-backed pending Transactions; reviewed claims become symbolic facts; proof trees then support cited answers and missing-source diagnostics. The ontology still authorizes validation and review lanes only, not direct canonical writes.

## Eval Gates

Future gates should include:

- no derived fact written as active claim;
- no symbolic output without inference path;
- no ontology domain/range violation missed;
- no auto-merge from ontology/reasoning;
- no auto contradiction resolution.


## v10 Work Object Boundary

Service, Repository, Artifact, Incident, Risk, Meeting, Decision, OpenQuestion, Commitment, and DueDate are ontology/frame kinds. They help extraction, review, symbolic proof paths, and cited answers talk about real work. They are not new canonical folders, and they do not authorize direct page writes. Durable use still requires Event evidence and a validated pending Transaction.
