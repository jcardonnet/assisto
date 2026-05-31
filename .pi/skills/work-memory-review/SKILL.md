---
name: work-memory-review
description: Review staged claims, ReviewItems, and Transactions through preview-first transaction-backed actions.
---

# work-memory-review

## Canonical/derived boundary

Derived views may guide, preview, and propose. They may not write canonical memory directly. Durable changes go through Events and pending/applied Transactions.

## Workflow

1. Inspect ReviewItem or pending Transaction.
2. Preview the action.
3. Apply only through validated transaction helpers.
4. Explicitly choose target, Context, and superseded claim IDs when needed.

## Repair Actions

Repair actions are preview-first and transaction-backed. They cannot directly edit current pages.

## Forbidden

- No batch apply.
- No direct current-page edits.
- No autonomous supersession.
- No autonomous merge.
- No direct ReviewItem writes from lint/adversarial review.
