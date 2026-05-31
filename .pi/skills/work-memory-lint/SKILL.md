---
name: work-memory-lint
description: Run deterministic work-memory lint checks and stage review through Transactions.
---

# work-memory-lint

## Canonical/derived boundary

Derived views may guide, preview, and propose. They may not write canonical memory directly. Durable changes go through Events and pending/applied Transactions.

## Workflow

1. Run manual lint/health.
2. Treat every finding as derived until staged.
3. Lint/adversarial review emits findings or pending `STAGE_REVIEW` Transactions.
4. It must not directly create durable ReviewItems outside transaction-backed paths.
5. Do not merge, split, delete, archive, supersede, or resolve contradictions automatically.

## Forbidden

- No autonomous background linting.
- No auto-merge.
- No auto-resolution.
- No direct canonical ReviewItem writes from adversarial review.
- No generated explanation persistence.
