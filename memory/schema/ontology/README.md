# Ontology registry

Ontology registry files are schema/policy, not user memory.

They define entity kinds, relation kinds, claim patterns, scopes, cardinality hints, and review rules. They do not create a canonical graph database.

Canonical memory remains markdown objects and claim blocks under memory/. Derived ontology or symbolic artifacts belong under memory/indexes/ontology/ and memory/indexes/symbolic/.

Ontology changes may invalidate derived indexes and stage ReviewItems or pending STAGE_REVIEW Transactions. They do not rewrite canonical claims automatically.

## Starter Registry Files

memory/schema/ontology/registry.json is the versioned machine-readable registry.
memory/schema/ontology/relation-rules.md is the human-readable companion.

Neither file is user memory, canonical graph state, or derived index state.

The starter registry uses these fields:

- ontology_version
- entity_kinds
- relations[]
- relation
- domain
- range
- inverse
- requires_scope
- review_risk
- review_lane
- cardinality
