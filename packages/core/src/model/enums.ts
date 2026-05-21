export const OBJECT_STATES = ["active", "archived"] as const;
export type ObjectState = (typeof OBJECT_STATES)[number];

export const REVIEW_STATES = ["none", "staged", "reviewed", "contested"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const CLAIM_STATES = ["active", "staged", "superseded", "rejected"] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];

export const CLAIM_KINDS = ["fact", "inference", "assumption", "preference", "commitment"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const EVIDENCE_STRENGTHS = ["explicit", "inferred", "weak"] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

export const SCOPE_STATES = ["complete", "partial", "unknown"] as const;
export type ScopeState = (typeof SCOPE_STATES)[number];

export const FOLLOWUP_STATES = ["candidate", "committed", "waiting", "closed", "rejected"] as const;
export type FollowUpState = (typeof FOLLOWUP_STATES)[number];

export const TRANSACTION_STATES = ["pending", "applied", "rejected", "failed"] as const;
export type TransactionState = (typeof TRANSACTION_STATES)[number];

export const SUPPORTED_OPERATION_TYPES = [
  "ADD_EVENT",
  "UPSERT_CLAIM",
  "STAGE_REVIEW",
  "NOOP",
  "SUPERSEDE_CLAIM",
  "CLOSE_FOLLOWUP"
] as const;
export type SupportedOperationType = (typeof SUPPORTED_OPERATION_TYPES)[number];

export const UNSUPPORTED_OPERATION_TYPES = [
  "MERGE",
  "SPLIT",
  "DELETE",
  "AUTO_RESOLVE_CONTRADICTION"
] as const;
export type UnsupportedOperationType = (typeof UNSUPPORTED_OPERATION_TYPES)[number];

export const ENTITY_RESOLUTION_STATES = [
  "exact_match",
  "alias_match",
  "near_match",
  "new_entity",
  "ambiguous"
] as const;
export type EntityResolutionState = (typeof ENTITY_RESOLUTION_STATES)[number];
