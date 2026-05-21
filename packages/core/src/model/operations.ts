import type { ClaimBlock } from "./claim";
import type { MarkdownPath } from "./common";
import type { SupportedOperationType } from "./enums";
import type { ClaimId, EventId, FollowUpId, ReviewItemId, StableId } from "./ids";

export interface OperationBase {
  operation: SupportedOperationType;
  affected_files?: MarkdownPath[];
  description?: string;
}

export interface TransactionOperationSummary extends OperationBase {
  operation: SupportedOperationType;
}

export interface AddEventOperation extends OperationBase {
  operation: "ADD_EVENT";
  event_id: EventId;
  target_path: MarkdownPath;
}

export interface UpsertClaimOperation extends OperationBase {
  operation: "UPSERT_CLAIM";
  target_id: StableId;
  claim: ClaimBlock;
}

export interface StageReviewOperation extends OperationBase {
  operation: "STAGE_REVIEW";
  review_item_id: ReviewItemId;
  reason: string;
}

export interface NoopOperation extends OperationBase {
  operation: "NOOP";
  reason: string;
}

export interface SupersedeClaimOperation extends OperationBase {
  operation: "SUPERSEDE_CLAIM";
  target_id: StableId;
  claim_id: ClaimId;
  superseded_by_claim_id?: ClaimId;
}

export interface CloseFollowUpOperation extends OperationBase {
  operation: "CLOSE_FOLLOWUP";
  followup_id: FollowUpId;
  closure_reason?: string;
}

export type TransactionOperation =
  | TransactionOperationSummary
  | AddEventOperation
  | UpsertClaimOperation
  | StageReviewOperation
  | NoopOperation
  | SupersedeClaimOperation
  | CloseFollowUpOperation;
