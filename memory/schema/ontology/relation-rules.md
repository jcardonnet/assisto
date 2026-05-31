# Ontology Relation Rules

The ontology registry is schema policy, not user memory and not a graph database.
It classifies candidate relation frames so extraction, review, retrieval, health, and future symbolic reasoning can agree on relation meaning.

Canonical memory still stores readable Event-backed claim blocks on Person, Context, and Topic pages.
Inverse or transitive relations are derived views unless separately captured through Event plus Transaction.

## Starter Relations

| relation | domain | range | scope | review risk |
| --- | --- | --- | --- | --- |
| `reports_to` | `Person` | `Person` | required | high |
| `manages` | derived inverse of `reports_to` | derived inverse of `reports_to` | required | high |
| `owns` | `Person`, `Team` | `Context`, `System`, `Topic` | required | medium |
| `owned_by` | derived inverse of `owns` | derived inverse of `owns` | required | medium |
| `uses_technology` | `Context` | `Topic` | required | medium |
| `depends_on` | `Context`, `System` | `Context`, `System`, `Topic` | required | medium |

## Review Gates

Ontology-aware frames must stage review when:

- the relation is not registered;
- the subject kind is outside the relation domain;
- the object kind is outside the relation range;
- the relation requires scope and no scope is present;
- the frame has no source evidence marker;
- the frame represents a high-risk relation change.

Staged review must happen through a pending Transaction with `STAGE_REVIEW`.
Ontology validation does not authorize direct canonical page writes, entity merges, contradiction resolution, or generated explanation persistence.
