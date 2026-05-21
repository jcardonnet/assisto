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

- Staged ReviewItem IDs.
- Review reasons.
- Affected files.
- Any linked Transaction IDs if visible.

Safety constraints:

- Do not resolve ReviewItems automatically.
- Do not edit canonical pages directly.
- Do not auto-merge entities.
- Do not auto-resolve contradictions.
- Do not delete or archive pages automatically.
- Use reviewed Transactions for any durable mutation.
- Do not enable vector search, graph DB behavior, or MCP.
