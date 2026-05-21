---
description: Run manual deterministic work-memory lint checks and stage ReviewItems only.
argument-hint: ""
tool: wm_lint
command: /wm-lint
---

# /lint

Use `wm_lint`.

If running through the CLI, use:

```bash
pnpm --filter @assisto/cli wm lint
```

After linting, report:

- Count of staged lint ReviewItems.
- ReviewItem paths.
- Issue codes.
- Next recommended review step.

Safety constraints:

- Lint may stage ReviewItems only.
- Do not edit canonical pages directly.
- Do not auto-merge duplicate entities.
- Do not auto-resolve contradictions.
- Do not delete or archive pages automatically.
- Do not promote unscoped system/context claims.
- Do not enable vector search, graph DB behavior, MCP, or autonomous background linting.
