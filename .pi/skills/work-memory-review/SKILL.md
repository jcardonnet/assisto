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
pnpm --filter @assisto/cli wm review apply-staged <review-id> --target <id|path> [--context <id|path> | --create-context "<name>"] [--supersede <claim-id>] [--note "<text>"]
pnpm --filter @assisto/cli wm events reprocess <event-id|path> --stage-only
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

4. Check the grouped review inbox metadata:
   - `review_reason`;
   - affected files;
   - source Event IDs;
   - linked Transaction;
   - staged claim IDs;
   - suggested allowed action.
5. Check pending transaction details:
   - all durable claims cite Event IDs;
   - unscoped system/project/context claims are staged;
   - committed FollowUps have explicit trigger language;
   - ambiguous entities are staged, not merged;
   - contradictions are staged, not resolved;
   - rollback/repair notes exist.
6. If a staged ReviewItem should become a pending Transaction, use review apply only with explicit human choices:

   ```bash
   pnpm --filter @assisto/cli wm review apply-staged <review-id> --target <id|path> [--context <id|path> | --create-context "<name>"] [--supersede <claim-id>] [--note "<text>"]
   ```

7. If a stale Event should be reprocessed, stage it only:

   ```bash
   pnpm --filter @assisto/cli wm events reprocess <event-id|path> --stage-only
   ```

8. If safe and approved, apply through the transaction engine only:

   ```bash
   pnpm --filter @assisto/cli wm tx apply <transaction-id>
   ```

9. If unsafe, reject with a concrete reason:

   ```bash
   pnpm --filter @assisto/cli wm tx reject <transaction-id> --reason "<reason>"
   ```

10. Run validation after applying:

   ```bash
   pnpm --filter @assisto/cli wm validate
   ```

## Forbidden Behavior

- Never edit canonical pages directly during review.
- Never bypass `wm tx apply`.
- Never apply a Transaction that fails validation.
- Never auto-merge people, topics, or contexts.
- Never auto-resolve contradictions.
- Never supersede an old claim unless the human explicitly supplied the claim ID.
- Never reprocess an Event without `--stage-only`.
- Never delete memory; use rejected or archived states only when supported.
- Never create committed FollowUps without explicit trigger language.
- Never promote unscoped system/context claims.

## Required Invariants

- Applying a Transaction validates first.
- Failed partial application must remain repairable.
- Events are preserved during rollback or failure handling.
- ReviewItems represent uncertainty and must be resolved by a human-reviewed action later.
- Summaries must remain derived from active claims.
- Review apply and Event reprocess create pending Transactions; they do not directly edit canonical pages.

## References

- `wm review inbox`
- `wm review apply-staged <id|path> --target <id|path> ...`
- `wm events reprocess <event-id|path> --stage-only`
- `wm tx list`
- `wm tx show <id>`
- `wm tx apply <id>`
- `wm tx reject <id> --reason "<reason>"`
- `wm validate`
- `docs/revised-design.md`
- `docs/implementation-plan.md`
