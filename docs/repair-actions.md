# Repair Actions

Repair actions are preview-first suggestions that help users fix missing, stale, conflicting, or ambiguous memory. They are not direct mutations.

## RepairAction

```ts
type RepairAction = {
  id: string;
  kind:
    | "capture_missing_memory"
    | "log_retrieval_miss"
    | "open_review_item"
    | "open_followup"
    | "open_entity"
    | "open_context"
    | "stage_alias_correction"
    | "stage_role_correction"
    | "stage_reporting_correction"
    | "stage_scope_clarification"
    | "stage_health_finding";
  label: string;
  previewRequired: true;
  durableWrite:
    | "none"
    | "event_plus_pending_transaction"
    | "pending_transaction"
    | "validated_transaction_apply";
};
```

## Allowed Actions

- Capture missing memory.
- Log retrieval miss.
- Open cited entity, Context, ReviewItem, or FollowUp.
- Stage alias, role, reporting, ownership, scope, or health-finding corrections.
- Apply an existing pending Transaction through validated helper.

## Forbidden Direct Writes

Repair actions may not directly edit People, Contexts, Topics, FollowUps, ReviewItems, Transactions, Events, or Logs outside the Event/Transaction paths.

## Examples

Ask repair: no answer for "Who owns Inventory?" → preview missing-memory capture.

Health repair: missing source Event finding → preview pending `STAGE_REVIEW` Transaction.

Entity repair: alias conflict → preview alias correction Transaction.

Context repair: stale owner claim → preview role/ownership correction Transaction.

Review repair: staged claim with explicit context → create pending review-apply Transaction.
