---
description: Reject a pending work-memory Transaction with a human-readable reason.
argument-hint: <tx-id> <reason>
tool: wm_reject_transaction
command: /wm-reject
---

# /reject-transaction <tx-id> <reason>

Use `wm_reject_transaction` with the provided Transaction ID and reason.

If running through the CLI, use:

```bash
pnpm --filter @assisto/cli wm tx reject <tx-id> --reason "<reason>"
```

Report:

- Transaction ID.
- Rejection reason.
- Rejected transaction path.
- Any follow-up review needed.

Safety constraints:

- Do not delete the pending or rejected Transaction manually.
- Do not edit canonical pages directly.
- Do not apply partial rejected changes.
- Do not auto-merge entities.
- Do not auto-resolve contradictions.
- Do not promote unscoped system/context claims.
- Do not enable vector search, graph DB behavior, MCP, or LLM extraction.
