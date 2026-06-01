# Evidence-To-Reasoning Work Memory

Assisto's v9 reasoning layer is an evidence-to-reasoning OS, not a second memory store. Markdown under `memory/` remains canonical. Source adapters, typed frames, ontology checks, symbolic indexes, proof paths, cited answer contracts, entity stewardship, Context operating rooms, and Workbench views are derived or transaction-backed.

The governing loop is:

```text
Source unit -> Event -> Candidate claims and frames -> Transaction or ReviewItem -> Current pages
Current pages -> Derived ontology and symbolic indexes -> Cited answer contract -> Repair actions
```

No generated answer, generated explanation, proof summary, brief, Workbench session, `.assisto-local/**` file, semantic search result, ontology artifact, or symbolic index becomes durable truth unless the user separately captures source evidence through the Event and Transaction path.

## Source Adapter Boundary

Source adapters normalize curated inputs into source units with:

- adapter kind;
- source label;
- raw text;
- `source_hash`;
- source spans;
- observed date when known;
- contextual hints.

Adapters may create Events and pending Transactions. They must not apply Transactions or edit Person, Topic, Context, FollowUp, ReviewItem, or current pages directly. Duplicate source hashes are skipped before Event creation.

## Typed Frames

Typed frames give deterministic code a small structured object to inspect beside prose claims. Frames are candidates, not truth. A frame must carry source Event evidence and one of the approved scope states. Unknown-scope, malformed, or ontology-invalid frames are review inputs, not active facts.

Frames are useful for:

- reporting and manager chains;
- ownership and role signals;
- project technology links;
- decisions-as-claims;
- open questions-as-claims;
- review and follow-up hints.

## Ontology Policy

The ontology registry lives under `memory/schema/ontology/**`. It defines entity kinds, relation kinds, domain and range, inverse relations, scope requirements, cardinality hints, and review risk lanes.

Ontology validation catches wrong relation shapes and high-risk changes. It cannot authorize entity merges, contradiction resolution, direct canonical writes, or graph database state. A domain or range violation must become a validation error or staged review.

## Symbolic Reasoning

Symbolic indexes under `memory/indexes/symbolic/**` are rebuildable derived artifacts. Every symbolic fact must have a proof path with source claims and source Events.

Allowed symbolic outputs:

- inverse relation hints;
- answer support;
- stale or conflict signals;
- retrieval hints;
- review acceleration previews;
- Context timelines and operating-room sections.

Disallowed symbolic outputs:

- active canonical claims;
- automatic supersession;
- entity merges;
- autonomous contradiction resolution;
- generated explanations persisted as memory.

## Cited Answer Contract

The Ask surface should answer only through the cited answer contract. The contract carries:

- what memory can say;
- what memory cannot confirm;
- conflicts or stale signals;
- per-answer citations;
- proof paths;
- repair actions;
- the legacy `contextPack`.

Direct answers need claim, page, Event, and proof support when proof paths exist. Unsupported facts belong in `cannotConfirm` with repair actions such as capture missing evidence, log a retrieval miss, open a ReviewItem, open a FollowUp, or open the cited entity or Context.

## Entity Stewardship

Entity stewardship is a command center for risk, not an auto-merge engine. It can surface:

- near duplicates;
- alias conflicts;
- identity ambiguity;
- role/reporting/ownership changes;
- stale claims;
- conflicting claims;
- linked proof paths;
- linked ReviewItems and FollowUps.

Repair actions stage pending Transactions one at a time. Merge, split, delete, and autonomous identity resolution remain out of scope.

## Context Operating Rooms

Context operating rooms assemble cited project state from claims, Events, FollowUps, ReviewItems, transactions, and symbolic proofs. They should show:

- current state;
- owners and roles;
- systems and dependencies;
- decisions-as-claims;
- open questions-as-claims;
- risks;
- recent changes;
- review queue;
- follow-up queue;
- answerable questions;
- missing-memory prompts;
- quick repair actions;
- timeline.

The operating room is a derived cockpit. Corrections route through capture, review, or pending Transactions.

## Dogfood Feedback Loop

Feedback is source evidence about Assisto's behavior. Retrieval misses, bad answers, confusing reviews, and wrong extraction are captured as Events plus pending NOOP Transactions. Feedback does not directly edit ReviewItems or canonical pages.

The feedback loop should be visible in daily dogfood views and evals so recurring failures become measurable without turning complaints into memory truth.

## Eval Gates

`pnpm eval:v9` checks the integrated evidence-to-reasoning layer:

- zero unsafe canonical writes;
- zero generated-persistence violations;
- zero symbolic outputs without proof;
- zero missed ontology domain/range violations;
- zero unsupported direct answers;
- zero automatic entity merges;
- source hash coverage;
- proof path coverage;
- repair action coverage;
- source adapter, ontology frame, symbolic index, answer contract, review acceleration, Context room, and dogfood feedback flows.

Use this gate after `eval:v8` and before browser hardening when changing source adapters, frames, ontology, symbolic reasoning, answer contracts, Workbench evidence views, or dogfood feedback.
