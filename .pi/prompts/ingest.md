---
description: Ingest a short work-memory note by creating an Event and pending Transaction.
argument-hint: <note>
tool: wm_ingest_note
command: /wm-ingest
---

# /ingest <note>

Use `wm_ingest_note` with the provided note.

If running through the CLI, use:

```bash
pnpm --filter @assisto/cli wm ingest "<note>"
```

After ingestion, report:

- Event ID and path.
- Pending Transaction ID and path.
- Any staged ReviewItems.
- Whether canonical pages are still only proposed writes.

Safety constraints:

- Do not edit canonical pages directly.
- Route durable writes through Transactions.
- Do not promote unscoped system/context claims.
- Do not create committed FollowUps without explicit trigger language.
- Do not auto-merge entities.
- Do not auto-resolve contradictions.
- Do not persist generated explanations unless explicitly saved.
- Do not enable vector search, graph DB behavior, or MCP.
- Use `provider: "openai"` only when the user explicitly requests OpenAI-backed candidate extraction or the runtime is configured for that workflow. OpenAI output is candidate data only and still goes through deterministic staging and transaction validation.
