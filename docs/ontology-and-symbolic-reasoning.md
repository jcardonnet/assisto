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

The registry defines entity kinds, relation kinds, claim patterns, scopes, and review rules. The v9 registry adds explicit cardinality hints and review lanes so later symbolic reasoning can distinguish reporting changes, ownership changes, technology changes, and dependency changes without treating the ontology as canonical graph state.

## Relation Definitions

Relation definitions may include domain/range, inverse relation, transitivity, symmetry, required scope, temporal behavior, cardinality hint, and review risk.

Examples:

- `reports_to`;
- `manages`;
- `owns`;
- `part_of`;
- `depends_on`;
- `supersedes`;
- `contradicts`;
- `evidenced_by`.


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

## Symbolic Index Rebuild Semantics

Symbolic indexes are cache artifacts. They must be deletable and rebuildable from canonical markdown, schema/ontology policy, and deterministic rules. They should record rule version, ontology version, generated time, and input hashes.

## Ontology Versioning

Ontology changes invalidate derived indexes and may stage ReviewItems or pending `STAGE_REVIEW` Transactions. They do not rewrite canonical claims automatically.

## Why Not Graph DB Yet

Graph-shaped views are useful, but a graph database is not canonical memory. Markdown remains source of truth. Graph indexes may be evaluated later as rebuildable derived artifacts.

## Eval Gates

Future gates should include:

- no derived fact written as active claim;
- no symbolic output without inference path;
- no ontology domain/range violation missed;
- no auto-merge from ontology/reasoning;
- no auto contradiction resolution.
