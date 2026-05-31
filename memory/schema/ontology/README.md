# Ontology registry

Ontology registry files are schema/policy, not user memory.

They define entity kinds, relation kinds, claim patterns, scopes, and review rules. They do not create a canonical graph database.

Canonical memory remains markdown objects and claim blocks under `memory/`. Derived ontology or symbolic artifacts belong under:

```text
memory/indexes/ontology/
memory/indexes/symbolic/
```

Ontology changes may invalidate derived indexes and stage ReviewItems or pending `STAGE_REVIEW` Transactions. They do not rewrite canonical claims automatically.
