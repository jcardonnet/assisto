# Validators

The TypeScript validator in `packages/core/src/validators` is authoritative. This page mirrors durable rules for hand editing and future validator work.

## Implemented core rules

Validators reject:

- missing required frontmatter;
- non-MVP enum values;
- claim blocks missing required fields;
- active claims without Event evidence;
- source Event IDs that do not exist;
- broken wikilinks;
- duplicate page, Event, Transaction, or claim IDs;
- committed FollowUps without explicit trigger evidence or reviewed Transaction;
- active system/context claims with `scope_state: unknown`;
- unsupported Current summary text;
- ambiguous entity updates without staging;
- Transactions without rollback/repair notes;
- malformed ontology registry JSON;
- ontology frames with unknown relations;
- ontology frames whose subject/object kinds violate relation domain/range;
- ontology frames missing scope when the relation has `requires_scope`;
- active canonical claims that cite only ontology, symbolic, retrieval, answer, or brief artifacts.

## Designed / post-MVP rules

Future validators should also enforce:

- no symbolic output may be written as an active claim;
- saved explanations require explicit capture plus a reviewed Transaction;
- adversarial review stages through pending `STAGE_REVIEW` Transactions;
- source adapters preserve raw text and `source_hash`;
- ontology changes invalidate derived indexes, not canonical claims;
- invalid ontology frames stage review through pending Transactions;
- high-risk relation changes stage review and never auto-promote;
- repair actions cannot directly edit current pages;
- semantic/vector/symbolic retrieval results cannot outrank cited claims and source Events.

## Forbidden

- direct canonical writes from ingestion, retrieval, Workbench, source adapters, lint, or symbolic reasoning;
- graph/vector/search index state as canonical truth;
- generated answer, brief, or explanation persistence without Event/Transaction flow;
- automatic entity merge or contradiction resolution.
