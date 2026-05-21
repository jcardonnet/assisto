---
description: Validate and apply a pending work-memory Transaction.
argument-hint: <tx-id>
tool: wm_apply_transaction
command: /wm-apply
---

# /apply-transaction <tx-id>

Use `wm_apply_transaction` with the provided Transaction ID.

If running through the CLI, use:

```bash
pnpm --filter @assisto/cli wm tx apply <tx-id>
```

Before applying, inspect if needed:

```bash
pnpm --filter @assisto/cli wm tx show <tx-id>
```

After applying, report:

- Transaction ID.
- Applied state.
- Canonical files written.
- Any validation or repair notes.

Safety constraints:

- Applying must validate first.
- Do not manually write proposed file blocks.
- Do not edit canonical pages directly.
- Do not delete memory.
- Do not auto-merge entities.
- Do not auto-resolve contradictions.
- Do not promote unscoped system/context claims.
- Do not enable vector search, graph DB behavior, MCP, or LLM extraction.
