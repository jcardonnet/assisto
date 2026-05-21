---
name: work-memory-review
description: Review staged work-memory Transactions and ReviewItems, then apply or reject pending Transactions through validation. Use when inspecting pending memory changes, reviewing ambiguities, approving or rejecting Transactions, or checking the review inbox without direct canonical edits.
---

# work-memory-review

## Description

Review staged work-memory Transactions and ReviewItems, then apply or reject pending Transactions without bypassing validation.

## When To Use

Use this skill when the user wants to inspect pending memory changes, review ambiguities, approve a Transaction, reject a Transaction, or check the review inbox.

This skill is for human-in-the-loop review. It does not decide merges, resolve contradictions, or delete memory automatically.

## Setup And Check Commands

Run these from the repository root when checking review behavior:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm eval:mvp
```

Useful CLI commands:

```bash
pnpm --filter @assisto/cli wm review inbox
pnpm --filter @assisto/cli wm tx list
pnpm --filter @assisto/cli wm tx show <transaction-id>
pnpm --filter @assisto/cli wm tx apply <transaction-id>
pnpm --filter @assisto/cli wm tx reject <transaction-id> --reason "<reason>"
pnpm --filter @assisto/cli wm validate
```

## Exact Workflow

1. Start with the review inbox:

   ```bash
   pnpm --filter @assisto/cli wm review inbox
   ```

2. List pending transactions:

   ```bash
   pnpm --filter @assisto/cli wm tx list
   ```

3. For each candidate transaction, show its markdown:

   ```bash
   pnpm --filter @assisto/cli wm tx show <transaction-id>
   ```

4. Check:
   - all durable claims cite Event IDs;
   - unscoped system/project/context claims are staged;
   - committed FollowUps have explicit trigger language;
   - ambiguous entities are staged, not merged;
   - contradictions are staged, not resolved;
   - rollback/repair notes exist.
5. If safe and approved, apply through the transaction engine only:

   ```bash
   pnpm --filter @assisto/cli wm tx apply <transaction-id>
   ```

6. If unsafe, reject with a concrete reason:

   ```bash
   pnpm --filter @assisto/cli wm tx reject <transaction-id> --reason "<reason>"
   ```

7. Run validation after applying:

   ```bash
   pnpm --filter @assisto/cli wm validate
   ```

## Forbidden Behavior

- Never edit canonical pages directly during review.
- Never bypass `wm tx apply`.
- Never apply a Transaction that fails validation.
- Never auto-merge people, topics, or contexts.
- Never auto-resolve contradictions.
- Never delete memory; use rejected or archived states only when supported.
- Never create committed FollowUps without explicit trigger language.
- Never promote unscoped system/context claims.

## Required Invariants

- Applying a Transaction validates first.
- Failed partial application must remain repairable.
- Events are preserved during rollback or failure handling.
- ReviewItems represent uncertainty and must be resolved by a human-reviewed action later.
- Summaries must remain derived from active claims.

## References

- `wm review inbox`
- `wm tx list`
- `wm tx show <id>`
- `wm tx apply <id>`
- `wm tx reject <id> --reason "<reason>"`
- `wm validate`
- `docs/revised-design.md`
- `docs/implementation-plan.md`
