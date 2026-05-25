---
description: Show staged work-memory ReviewItems for human review.
argument-hint: ""
tool: wm_review_inbox
command: /wm-review
---

# /review-inbox

Use `wm_review_inbox`.

If running through the CLI, use:

```bash
pnpm --filter @assisto/cli wm review inbox
```

Report:

- Grouped ReviewItems by `review_reason`.
- Staged ReviewItem IDs and paths.
- Affected files.
- Source Event IDs.
- Linked Transaction IDs when present.
- Staged claim IDs.
- Suggested allowed action.

Safety constraints:

- Do not resolve ReviewItems automatically.
- Do not edit canonical pages directly.
- Do not auto-merge entities.
- Do not auto-resolve contradictions.
- Do not delete or archive pages automatically.
- Use reviewed Transactions for any durable mutation.
- Use `wm_review_apply_staged` or `/wm-review-apply` only when the human supplies target/context/supersede choices.
- Use `wm_events_reprocess` or `/wm-event-reprocess` only with stage-only semantics.
- Do not enable vector search, graph DB behavior, or MCP.
