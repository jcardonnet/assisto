export type FrameEntityKind = "Person" | "Context" | "Topic" | "System" | "Team" | "Role";

export type MemoryFrameKind =
  | "relation"
  | "attribute"
  | "decision"
  | "open_question"
  | "risk"
  | "followup_signal";

export type MemoryFrameEvidenceStrength = "explicit" | "inferred" | "weak";
export type MemoryFrameScopeState = "complete" | "partial" | "unknown";

export interface MemoryFrameEntityRef {
  entity_id: string;
  entity_kind: FrameEntityKind;
}

export interface MemoryFrame {
  frame_id: string;
  frame_kind: MemoryFrameKind;
  subject: MemoryFrameEntityRef;
  source_events: string[];
  scope_state: MemoryFrameScopeState;
  evidence_strength: MemoryFrameEvidenceStrength;
  relation?: string;
  attribute?: string;
  object?: MemoryFrameEntityRef;
  value?: string;
  statement?: string;
  scope?: string | null;
  change_type?: "new" | "change";
}

export type MemoryFrameValidationErrorCode =
  | "FRAME_MISSING_ID"
  | "FRAME_KIND_INVALID"
  | "FRAME_MISSING_SUBJECT"
  | "FRAME_SUBJECT_KIND_INVALID"
  | "FRAME_OBJECT_KIND_INVALID"
  | "FRAME_MISSING_SOURCE_EVENT"
  | "FRAME_EVIDENCE_STRENGTH_INVALID"
  | "FRAME_SCOPE_STATE_INVALID"
  | "FRAME_UNKNOWN_SCOPE"
  | "FRAME_RELATION_MISSING_RELATION"
  | "FRAME_RELATION_MISSING_OBJECT"
  | "FRAME_ATTRIBUTE_MISSING_ATTRIBUTE"
  | "FRAME_VALUE_REQUIRED"
  | "ONTOLOGY_RELATION_UNKNOWN"
  | "ONTOLOGY_DOMAIN_INVALID"
  | "ONTOLOGY_RANGE_INVALID"
  | "ONTOLOGY_SCOPE_REQUIRED"
  | "ONTOLOGY_FRAME_MISSING_EVIDENCE"
  | "ONTOLOGY_HIGH_RISK_RELATION_CHANGE";

export interface MemoryFrameValidationIssue {
  code: MemoryFrameValidationErrorCode;
  message: string;
  field?: string;
}

export interface MemoryFrameValidationResult {
  passed: boolean;
  errors: MemoryFrameValidationIssue[];
  requires_review: boolean;
  review_reasons: MemoryFrameValidationErrorCode[];
}
