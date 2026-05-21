---
name: work-memory-lint
description: Run manual deterministic work-memory lint checks and stage ReviewItems for unsafe or suspicious vault conditions. Use when checking memory health, duplicates, stale follow-ups, contradictions, broken links, orphan pages, review backlog, or topic bloat without auto-merging or deleting memory.
---

# work-memory-lint

## Description

Run manual deterministic work-memory lint checks and stage ReviewItems for unsafe or suspicious vault conditions.

## When To Use

Use this skill when the user asks to check memory health, find duplicates, inspect stale follow-ups, detect contradictions, audit links, or prepare a manual review queue.

This skill is manual only. It does not schedule autonomous background linting.

## Setup And Check Commands

Run these from the repository root when checking lint behavior:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm eval:mvp
```

Useful CLI commands:

```bash
pnpm --filter @assisto/cli wm lint
pnpm --filter @assisto/cli wm review inbox
pnpm --filter @assisto/cli wm validate
pnpm --filter @assisto/cli wm tx list
```

## Exact Workflow

1. Run manual lint:

   ```bash
   pnpm --filter @assisto/cli wm lint
   ```

2. Inspect staged lint ReviewItems:

   ```bash
   pnpm --filter @assisto/cli wm review inbox
   ```

3. Treat every lint finding as a review candidate, not an automatic mutation.
4. For duplicate people/topics, stage or inspect ReviewItems. Do not merge.
5. For contradictions, stage ReviewItems. Do not resolve automatically.
6. For unscoped claims, keep them staged until a human supplies scope.
7. For stale follow-ups, ask the user whether to close, keep waiting, or reject through a future reviewed transaction.
8. Run validation after any approved transaction is applied:

   ```bash
   pnpm --filter @assisto/cli wm validate
   ```

## Forbidden Behavior

- Never run lint as autonomous background maintenance.
- Never auto-merge duplicate people or topics.
- Never auto-resolve contradictions.
- Never delete or archive pages automatically.
- Never promote unscoped system/context claims.
- Never create committed FollowUps without explicit trigger language.
- Never persist generated explanations unless explicitly saved through a transaction.
- Never bypass Transactions for any canonical mutation.

## Required Invariants

- Lint may stage ReviewItems only.
- Lint findings must preserve source pages unchanged.
- Duplicate candidates are safer as false splits than false merges.
- Contradictions must remain visible until human-reviewed.
- Topic bloat may stage review but must not split topics automatically.
- Broken links and orphan pages are repair prompts, not delete instructions.

## References

- `wm lint`
- `wm review inbox`
- `wm validate`
- `wm tx list`
- `docs/revised-design.md`
- `docs/implementation-plan.md`
