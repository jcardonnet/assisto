# Ontology Relation Rules

The ontology registry is schema policy, not user memory and not a graph database.
It classifies candidate relation frames so extraction, review, retrieval, health, and future symbolic reasoning can agree on relation meaning.

Canonical memory still stores readable Event-backed claim blocks on Person, Context, and Topic pages.
Inverse or transitive relations are derived views unless separately captured through Event plus Transaction.

## Starter Relations

| relation | domain | range | scope | cardinality | review risk | review lane |
| --- | --- | --- | --- | --- | --- | --- |
| reports_to | Person | Person | not required | many_to_one | high | reporting_change |
| manages | Person | Person | not required | one_to_many | high | reporting_change |
| owns | Person, Team | Context, System, Topic | required | many_to_many | medium | ownership_change |
| owns_system | Person | Topic | required | many_to_many | medium | ownership_change |
| owned_by | Topic | Person | required | many_to_many | medium | ownership_change |
| uses_technology | Context | Topic | required | many_to_many | medium | technology_change |
| depends_on | Context, System | Context, System, Topic | required | many_to_many | medium | dependency_change |

## Review Gates

Ontology-aware frames must stage review when:

- the relation is not registered;
- the subject kind is outside the relation domain;
- the object kind is outside the relation range;
- the relation requires scope and no scope is present;
- the frame has no source evidence marker;
- the frame represents a high-risk relation change.

Staged review must happen through a pending Transaction with STAGE_REVIEW.
Ontology validation does not authorize direct canonical page writes, entity merges, contradiction resolution, or generated explanation persistence.
