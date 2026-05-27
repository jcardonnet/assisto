import type { ClaimBlock } from "./claim";
import type { IsoDate, IsoDateTime, MarkdownPath, MemoryObjectBase, WikiLink } from "./common";
import type { FollowUpState, TransactionState } from "./enums";
import type {
  ContextId,
  EventId,
  FollowUpId,
  LogEntryId,
  PersonId,
  ReviewItemId,
  TopicId,
  TransactionId
} from "./ids";
import type { TransactionOperation } from "./operations";

export interface Event extends MemoryObjectBase {
  id: EventId;
  type: "Event";
  observed_at?: IsoDateTime | IsoDate | null;
  source_type: string;
  source_actor?: string;
  source_label?: string;
  raw_text: string;
  derived_claims: string[];
  participants?: PersonId[];
  topics?: TopicId[];
  contexts?: Array<ContextId | string>;
  context?: ContextId | null;
  transaction_ids?: TransactionId[];
}

export interface Person extends MemoryObjectBase {
  id: PersonId;
  type: "Person";
  aliases: string[];
  claims: ClaimBlock[];
  preferred_name?: string;
  role_scope?: ContextId | null;
  interactions?: EventId[];
  open_review_items?: ReviewItemId[];
}

export interface Context extends MemoryObjectBase {
  id: ContextId;
  type: "Context";
  aliases?: string[];
  claims: ClaimBlock[];
  owner?: PersonId | string | null;
  environment?: string;
  open_review_items?: ReviewItemId[];
}

export interface Topic extends MemoryObjectBase {
  id: TopicId;
  type: "Topic";
  aliases: string[];
  claims: ClaimBlock[];
  topic_family?: string;
  split_candidate?: boolean;
  open_review_items?: ReviewItemId[];
}

export interface FollowUp extends MemoryObjectBase {
  id: FollowUpId;
  type: "FollowUp";
  followup_state: FollowUpState;
  action: string;
  owner?: PersonId | string | null;
  due_at?: IsoDateTime | IsoDate | null;
  context?: ContextId | null;
  related_people?: PersonId[];
  related_topics?: TopicId[];
  candidate_reason?: string;
  closed_at?: IsoDateTime | null;
  closure_reason?: string;
}

export interface ReviewItem extends MemoryObjectBase {
  id: ReviewItemId;
  type: "ReviewItem";
  review_reason: string;
  affected_files: MarkdownPath[];
  severity?: "low" | "medium" | "high";
  candidate_resolution?: string;
  linked_transaction?: TransactionId;
}

export interface Transaction {
  id: TransactionId;
  type: "Transaction";
  transaction_state: TransactionState;
  created_at: IsoDateTime;
  recorded_at?: IsoDateTime;
  source_events: EventId[];
  operations: TransactionOperation[];
  affected_files: MarkdownPath[];
  risk_level?: "low" | "medium" | "high";
  requires_review?: boolean;
  validation_errors?: string[];
  rollback_notes?: string;
  intent?: string;
  application_log?: string;
  applied_at?: IsoDateTime | null;
  rejected_reason?: string;
}

export interface LogEntry extends MemoryObjectBase {
  id: LogEntryId;
  type: "LogEntry";
  message: string;
  level?: "info" | "warn" | "error";
  transaction_id?: TransactionId;
  links?: WikiLink[];
}

export type MvpMemoryObject =
  | Event
  | Person
  | Context
  | Topic
  | FollowUp
  | ReviewItem
  | Transaction
  | LogEntry;
