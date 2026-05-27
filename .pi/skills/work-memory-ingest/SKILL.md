---
name: work-memory-ingest
description: Safely ingest short work-memory notes into the local markdown vault as Event plus pending Transaction. Use when the user gives a work note, fact, discussion, profile detail, possible follow-up, or question and wants it captured without bypassing transaction validation.
---

# work-memory-ingest

## Description

Safely ingest a short work-memory note into the local markdown vault by creating an Event and a pending Transaction.

## When To Use

Use this skill when the user gives a work note, fact, discussion, profile detail, possible follow-up, or question and wants it captured in work memory.

Do not use this skill for meeting transcript bulk ingestion, autonomous entity merges, contradiction resolution, vector search, graph search, or generated answer persistence.

## Setup And Check Commands

Run these from the repository root when checking the workflow:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm eval:mvp
```

Useful CLI commands:

```bash
pnpm --filter @assisto/cli wm ingest --dry-run "<note>"
pnpm --filter @assisto/cli wm ingest "<note>"
pnpm --filter @assisto/cli wm capture --dry-run "<note>"
pnpm --filter @assisto/cli wm capture "<note>"
pnpm --filter @assisto/cli wm tx show <transaction-id>
pnpm --filter @assisto/cli wm review inbox
```

## Exact Workflow

1. Confirm the note is a small work-memory input, not a full transcript.
2. Run a dry run first when the note contains people, system/project claims, follow-ups, ambiguous entities, or scope-sensitive claims:

   ```bash
   pnpm --filter @assisto/cli wm ingest --dry-run "<note>"
   ```

3. Inspect the dry-run transaction:
   - Event is created as source evidence.
   - Canonical page changes are proposed in a pending Transaction.
   - Unscoped system/project/context claims are staged as ReviewItems.
   - Casual discussion language does not create committed FollowUps.
4. If the proposed mutation is safe, run:

   ```bash
   pnpm --filter @assisto/cli wm ingest "<note>"
   ```

5. Show the pending transaction:

   ```bash
   pnpm --filter @assisto/cli wm tx show <transaction-id>
   ```

6. Do not apply the transaction unless the user explicitly asks or the workflow requires review approval.

## Optional OpenAI Candidate Extraction

Use `--provider openai` or tool input `provider: "openai"` only when the user explicitly requests OpenAI-backed extraction or the runtime workflow is configured for it.

Required environment:

- `OPENAI_API_KEY`
- `ASSISTO_OPENAI_MODEL`
- optional `ASSISTO_OPENAI_BASE_URL`

OpenAI output is candidate data only. Malformed output, unsafe follow-ups, ambiguous entities, unscoped system facts, generated explanations, and validation failures must stage review or fallback transactions rather than directly editing canonical memory.

## Forbidden Behavior

- Never write directly to `memory/people/`, `memory/topics/`, `memory/contexts/`, or `memory/followups/` from ingestion.
- Never bypass Transactions.
- Never promote unscoped system/project/context claims to active truth.
- Never create committed FollowUps without explicit trigger language.
- Never auto-merge people, topics, or contexts.
- Never auto-resolve contradictions.
- Never persist generated explanations unless the user explicitly asks to save them.
- Never let OpenAI or any LLM provider write canonical memory directly or bypass deterministic validation.

## Required Invariants

- Every durable factual claim must cite at least one Event ID.
- Every multi-file mutation must go through a pending Transaction.
- Unknown scope must stage review.
- Ambiguous or near-match entities must stage review.
- Events are preserved even if later transaction application fails.
- Generated summaries are not canonical truth.

## References

- `wm ingest --dry-run "<note>"`
- `wm ingest "<note>"`
- `wm tx show <id>`
- `wm review inbox`
- `docs/revised-design.md`
- `docs/implementation-plan.md`
