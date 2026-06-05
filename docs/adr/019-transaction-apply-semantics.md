# ADR-019: Transaction Apply Semantics

Status: Proposed  
Date: 2026-06-02

## Context

Transactions guard durable multi-file mutations. Current implementation validates before apply, writes proposed files through safe helpers, preserves Event writes on partial failure, moves transactions to applied or failed states, and appends ingest logs. It does not claim full ACID semantics across every file write.

The design also calls for locks and repair visibility before concurrent runtimes, scheduled jobs, or broad multi-agent apply.

## Decision

Document the current semantics as fail-closed and repairable:

- Validation failure prevents canonical page edits.
- Supported operations only: `ADD_EVENT`, `UPSERT_CLAIM`, `STAGE_REVIEW`, `NOOP`, `SUPERSEDE_CLAIM`, and `CLOSE_FOLLOWUP`.
- All writes go through vault/fs helpers.
- Event writes are preserved on partial failure.
- Failed applies must be visible through failed transaction state, repair notes, and safe log entries where possible.
- Direct current-page writes outside transaction application remain forbidden.

Locking, manifests, and stronger idempotency checks are required before ambient runtimes or concurrent apply.

Recovery manifests are audit artifacts, not canonical truth. They should record operation types, affected file counts, before/after hashes, write result codes, timestamps, and rollback-note presence, not full proposed markdown content or raw Event text.

## Consequences

- The system preserves provenance and avoids pretending partial failure did not happen.
- W7 must not combine manifest, lock, and state-semantics changes into one PR.
- Tests must characterize validation failure no-write behavior, Event preservation, log failure, applied/pending duplication, concurrent apply, stale locks, and partial non-Event writes.

## Open Questions

- Should applied transactions remain mirrored in `pending/`, or should pending files be moved or removed?
- What lock path and stale-lock policy should be used?
- Should non-Event partial writes be auto-reverted or repaired manually?
- Should ingest-log append failure make an otherwise successful apply failed, recoverable, or warning-only?
