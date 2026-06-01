# Ontology Relation Rules

The ontology registry is schema policy, not user memory and not a graph database.
It classifies candidate relation frames so extraction, review, retrieval, health, and future symbolic reasoning can agree on relation meaning.

Canonical memory still stores readable Event-backed claim blocks on Person, Context, and Topic pages.
Inverse or transitive relations are derived views unless separately captured through Event plus Transaction.

## Work Relations

| relation | domain | range | scope | cardinality | review risk | review lane |
| --- | --- | --- | --- | --- | --- | --- |
| reports_to | Person | Person | not required | many_to_one | high | reporting_change |
| manages | Person | Person | not required | one_to_many | high | reporting_change |
| owns | Person, Team | Context, System, Topic | required | many_to_many | medium | ownership_change |
| owns_system | Person | Topic | required | many_to_many | medium | ownership_change |
| owned_by | Topic | Person | required | many_to_many | medium | ownership_change |
| uses_technology | Context, System, Service, Repository, Artifact | Topic, System, Service | required | many_to_many | medium | technology_change |
| depends_on | Context, System, Service, Repository, Artifact | Context, System, Service, Repository, Artifact, Topic | required | many_to_many | medium | dependency_change |
| blocks | Risk, Incident, OpenQuestion, System, Service, Context, Topic | Context, System, Service, Repository, Artifact, Commitment, OpenQuestion | required | many_to_many | high | blocker_change |
| blocked_by | Context, System, Service, Repository, Artifact, Commitment, OpenQuestion | Risk, Incident, OpenQuestion, System, Service, Context, Topic | required | many_to_many | high | blocker_change |
| raises_risk | Person, Team, Context, System, Service, Repository, Artifact, Meeting | Risk | required | many_to_many | high | risk_change |
| participant_in | Person, Team | Meeting | not required | many_to_many | low | meeting_change |
| discussed_in | Person, Team, Context, System, Service, Repository, Artifact, Topic, Decision, OpenQuestion, Risk, Commitment | Meeting | not required | many_to_many | low | discussion_change |
| has_decision | Context, System, Service, Repository, Artifact, Meeting | Decision | required | one_to_many | medium | decision_change |
| has_open_question | Context, System, Service, Repository, Artifact, Meeting | OpenQuestion | required | one_to_many | medium | open_question_change |
| committed_to | Person, Team | Commitment | required | many_to_many | medium | commitment_change |
| due_on | Commitment | DueDate | required | many_to_one | medium | commitment_change |
| part_of | Context, System, Service, Repository, Artifact, Team | Context, System, Service, Team | required | many_to_one | medium | structure_change |

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


Decision and OpenQuestion are ontology/frame kinds for claims such as `Decision: keep MySQL` or `Open question: who owns billing retry?`. They are not standalone canonical pages.

DueDate is an ontology/frame kind for explicit commitment due-date relations. It is not a calendar sync object and does not create a FollowUp unless the existing follow-up trigger policy is satisfied.
