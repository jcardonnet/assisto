# Typed Memory Frames

Typed memory frames are deterministic, source-backed extraction artifacts. They
make candidate meaning easier to validate, index, and explain before any
canonical markdown page is changed.

Frames are not replacement claims and are not an authorization to mutate
canonical memory. Ingestion may produce frames, but durable memory changes must
still flow through Event-backed Transactions and the existing page validators.

## Required Fields

Every frame requires:

```yaml
frame_id: frame_reports_to_kuastav_jeff
frame_kind: relation
subject:
  entity_id: person_kuastav
  entity_kind: Person
source_events:
  - ev_2026_05_31_001
scope_state: complete
evidence_strength: explicit
```

Allowed `frame_kind` values:

- `relation`
- `attribute`
- `decision`
- `open_question`
- `risk`
- `followup_signal`

Allowed entity kinds:

- `Person`
- `Context`
- `Topic`
- `System`
- `Team`
- `Role`

Allowed `scope_state` values:

- `complete`
- `partial`
- `unknown`

Allowed `evidence_strength` values:

- `explicit`
- `inferred`
- `weak`

Frames with `scope_state: unknown` must be staged for review. They must not be
promoted as active system, project, or context truth.

## Kind-Specific Fields

Relation frames require a relation name and an object:

```yaml
frame_kind: relation
relation: reports_to
subject:
  entity_id: person_kuastav
  entity_kind: Person
object:
  entity_id: person_jeff
  entity_kind: Person
statement: Kuastav reports to Jeff.
source_events:
  - ev_2026_05_31_001
scope_state: complete
evidence_strength: explicit
```

Attribute frames require an attribute name and value:

```yaml
frame_kind: attribute
attribute: role_title
subject:
  entity_id: person_alice
  entity_kind: Person
value: DBA
source_events:
  - ev_2026_05_31_002
scope_state: partial
evidence_strength: explicit
```

Decision, open-question, risk, and follow-up-signal frames require either
`value` or `statement`. They are structured review/retrieval material, not
standalone Decision, OpenQuestion, or Explanation pages.

## Ontology Boundary

The frame validator checks the generic typed shape: IDs, kinds, source Events,
scope state, and kind-specific required fields. It does not prove relation
domain/range, transitivity, inverse relations, or Event file existence.

Ontology-aware validation is a separate policy layer. A frame can be syntactically
valid and still require review when the ontology marks the relation as high-risk,
scope-sensitive, ambiguous, or unsupported. When supplied with the ontology registry,
validateMemoryFrame also reports relation-domain, relation-range, missing-scope,
unknown-relation, and high-risk relation-change review reasons.

## Deterministic Extraction

Rule-based detectors may emit candidate_frames in ingest and reprocess results. These frames are preview/response data only: they are not serialized into Event raw text and they do not add proposed canonical page writes by themselves.

Current deterministic frame extraction covers manager/reporting relations, role-title attributes, scoped and unscoped technology-use relations, decision statements, and open questions when those signals appear explicitly in the source note.

## Write Safety

Frames may be stored in pending Transactions, ReviewItems, derived indexes, eval
fixtures, or transient Workbench responses. They must not be used to directly
rewrite `memory/people/**`, `memory/contexts/**`, `memory/topics/**`, or other
canonical pages.
