import type { ObjectState, ReviewState } from "./enums";
import type { EventId, StableId } from "./ids";

export type IsoDateTime = string;
export type IsoDate = string;
export type MarkdownPath = string;
export type WikiLink = string;

export interface ObjectStateFields {
  object_state: ObjectState;
  review_state: ReviewState;
}

export interface MemoryObjectBase extends ObjectStateFields {
  id: StableId;
  type: MvpObjectType;
  recorded_at: IsoDateTime;
  source_events?: EventId[];
  related?: WikiLink[];
}

export type MvpObjectType =
  | "Event"
  | "Person"
  | "Context"
  | "Topic"
  | "FollowUp"
  | "ReviewItem"
  | "Transaction"
  | "LogEntry";

