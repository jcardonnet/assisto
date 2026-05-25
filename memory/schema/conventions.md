# Memory Conventions

Canonical memory lives under `memory/`. Markdown files are the durable source of record; indexes, caches, embeddings, and runtime state are derived.

## MVP Object Types

Allowed top-level object types:

- `event`
- `person`
- `context`
- `topic`
- `followup`
- `review_item`
- `transaction`
- `log_entry`

Do not create standalone Decision, OpenQuestion, Explanation, graph, vector, or MCP objects in the MVP.

## Required Mutation Flow

All ingestion follows this loop:

```text
Raw input -> Event -> Candidate claims -> Transaction -> Validated mutation or staged review -> Current pages
```

Ingestion logic may write Events and pending Transactions. It must not directly write canonical People, Contexts, Topics, FollowUps, or ReviewItems outside proposed transaction writes.

## Claims

Every claim block must include:

```yaml
- claim_id: clm_example
  statement: Example statement.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: current-work-context
  scope_state: partial
  evidence: [ev_2026_05_20_001]
  recorded_at: 2026-05-20T12:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
```

Active durable claims must cite at least one Event ID. Existing page content must be preserved during claim upserts; duplicate `claim_id` values are deduped rather than appended again.

## Time Fields

Use only these time fields:

```yaml
recorded_at: <when the memory system recorded the item>
observed_at: <when the event happened, if known>
valid_from: <when the claim became true, if known>
valid_to: <when the claim stopped being true, if known>
```

Do not infer `valid_from` from `recorded_at` or `observed_at`.

## Follow-Ups

Committed follow-ups require explicit trigger language such as `Remind me to`, `I need to`, `I will`, `Please track`, `Add a follow-up`, `asked me to`, or `Due by`.

Casual discussion phrases such as `we discussed`, `mentioned`, or `came up` must not create committed follow-ups.

## Review

Stage review for ambiguous or high-risk changes:

- unknown system/context scope;
- new, near, or ambiguous context scope;
- near or ambiguous entity resolution;
- role or reporting changes;
- claim ID conflicts;
- generated explanations that have not been explicitly saved.

Human review may create a transaction that applies a staged claim, creates an explicit context, or supersedes an old claim. That is still transaction-backed and validated before application.
