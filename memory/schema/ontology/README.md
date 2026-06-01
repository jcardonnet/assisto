# Ontology registry

Ontology registry files are schema/policy, not user memory.

They define entity kinds, relation kinds, claim patterns, scopes, cardinality hints, and review rules. They do not create a canonical graph database. v10 expands the policy vocabulary for daily work objects: Services, Systems, Repositories, Artifacts, Incidents/Risks, Meetings, Decisions-as-claims, OpenQuestions-as-claims, Commitments, and DueDates.

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


## v10 Work Vocabulary

Entity kinds accepted by ontology-aware frames are:

- Person
- Context
- Topic
- System
- Service
- Repository
- Artifact
- Incident
- Risk
- Meeting
- Decision
- OpenQuestion
- Commitment
- DueDate
- Team
- Role

These are frame and policy kinds, not new standalone canonical page types. Durable memory still uses Event-backed claims on the existing markdown objects unless a future migration explicitly adds new canonical object folders.
