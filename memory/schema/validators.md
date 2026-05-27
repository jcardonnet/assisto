# Validators

The TypeScript validator in `packages/core/src/validators` is authoritative. This page mirrors the durable rules that matter when editing markdown by hand.

## Frontmatter

Each object type has required frontmatter. The common required fields are:

- `id`
- `type`
- the state fields required for that type
- timestamps required for that type
- `source_events` when the object stores durable claims or review evidence

Use only the state values documented in `statuses.md`.

## Claim Blocks

Validators reject claim blocks that omit required fields, use non-MVP enum values, or mark active claims without Event evidence.

Active system/context claims with `scope_state: unknown` are invalid. Stage them in `memory/review/` instead.

## Links And IDs

Validators check:

- source Event IDs exist;
- wikilinks resolve;
- page IDs are unique;
- Event IDs are unique;
- Transaction IDs are unique;
- claim IDs are unique across the validated write set and existing vault.

Imported Events may include optional `source_hash` metadata. Import code uses this hash to skip duplicate raw Markdown/text units before writing another Event; validators still treat Event IDs as the durable uniqueness boundary.

## Summaries

If a page has a `## Current summary` section, frontmatter must include `summary_generated_from` with active claim IDs only.

Summaries are generated views. They are not canonical truth and must not introduce unsupported facts.

## Follow-Ups

Committed follow-ups must include explicit trigger evidence or come from a reviewed transaction. Candidate follow-ups may stage for weaker intent.

## Transactions

Mutating Transactions must include explicit proposed markdown writes. Proposed write paths must stay inside `memory/` and must not target `.obsidian/`.

Transactions must include rollback or repair notes. Validation happens before apply.

## Review Application

Applying staged review creates a new pending Transaction. The reviewed item is marked `reviewed`, and the staged claim is copied into the target page as an active claim only after scope/entity decisions are explicit.

If a claim supersedes another claim, the old claim is marked `superseded`; it is not deleted.
