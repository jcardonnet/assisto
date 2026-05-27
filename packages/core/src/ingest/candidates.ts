import type {
  ClaimBlock,
  EntityResolutionState,
  FollowUpState,
  SupportedOperationType
} from "../model";
import type { StagingReason } from "../policies";
import type { TransactionFileWrite } from "../transactions";

export type ClaimDomain = "person" | "topic" | "system";
export type CandidateEntityKind = "person" | "topic" | "context" | "system";

export interface IngestPipelineContext {
  root: string;
  note: string;
  rawNote: string;
  now: string;
  observedAt: string | null;
  eventId: string;
  eventPath: string;
  eventLinkPath: string;
  transactionId: string;
  captureContexts?: string[];
  sourceLabel?: string;
}

export interface CandidateSpan {
  text: string;
  start: number;
  end: number;
  index: number;
}

interface CandidateBase {
  source_text: string;
}

export interface ExtractedClaimCandidate extends CandidateBase {
  kind: "claim";
  entity_kind: CandidateEntityKind;
  entity_name: string;
  entity_resolution_hint?: EntityResolutionState;
  claim_id: string;
  statement: string;
  claim_kind: ClaimBlock["claim_kind"];
  evidence_strength: ClaimBlock["evidence_strength"];
  scope: string | null;
  scope_state: ClaimBlock["scope_state"];
  valid_from?: string | null;
  aliases?: string[];
  participant_names?: string[];
  topic_names?: string[];
  page_summary?: string;
}

export interface ExtractedFollowUpCandidate extends CandidateBase {
  kind: "followup";
  action: string;
  followup_state: Extract<FollowUpState, "candidate" | "committed">;
  trigger: string;
}

export type DetectorProposal = ExtractedClaimCandidate | ExtractedFollowUpCandidate;

export interface ResolvedEntity {
  kind: CandidateEntityKind;
  name: string;
  id: string;
  slug: string;
  path: string;
  existing_claim_ids: string[];
  claim_id_conflict_path?: string;
  resolution_state: EntityResolutionState;
  resolution_reason: string;
}

export interface ResolvedScope {
  original_scope: string;
  scope: string;
  scope_id?: string;
  scope_path?: string;
  resolution_state: EntityResolutionState;
  resolution_reason: string;
}

export interface ResolvedClaimCandidate extends ExtractedClaimCandidate {
  entity: ResolvedEntity;
  scope_resolution?: ResolvedScope;
  claim_state: ClaimBlock["claim_state"];
  staging_reasons: StagingReason[];
}

export interface ResolvedFollowUpCandidate extends ExtractedFollowUpCandidate {
  id: string;
  slug: string;
  path: string;
}

export type ResolvedCandidate = ResolvedClaimCandidate | ResolvedFollowUpCandidate;

export interface CandidateClaim extends ClaimBlock {
  domain: ClaimDomain;
}

export interface CandidateWrite extends TransactionFileWrite {
  operation: SupportedOperationType;
}

export interface IngestExtractionDraft {
  claims: CandidateClaim[];
  writes: TransactionFileWrite[];
  operations: Array<{ operation: SupportedOperationType; description?: string }>;
  stagedReviewPaths: string[];
  followupPaths: string[];
  participants: string[];
  topics: string[];
  intent: string;
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function idSlug(value: string): string {
  return slugify(value).replace(/-/g, "_");
}

export function normalizePhrase(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[.?!]\s*$/, "").trim();
}

export function articleFor(phrase: string): "a" | "an" {
  return /^[aeiou]/i.test(phrase) ? "an" : "a";
}

export function stripMemoryPrefix(path: string): string {
  return path.replace(/\\/g, "/").replace(/^memory\//, "");
}

export function inferObservedAt(note: string, datePart: string): string | null {
  if (/\btoday\b/i.test(note)) {
    return datePart;
  }

  return inferWeekdayDate(note, datePart);
}

export function inferWeekdayDate(note: string, datePart: string): string | null {
  const match = /\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(note);

  if (!match) {
    return /\byesterday\b/i.test(note) ? addDays(datePart, -1) : null;
  }

  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
  };
  const targetDay = weekdays[match[1]!.toLowerCase()];

  if (targetDay === undefined) {
    return null;
  }

  const currentDate = new Date(`${datePart}T00:00:00.000Z`);
  const daysSinceTarget = currentDate.getUTCDay() - targetDay;
  currentDate.setUTCDate(currentDate.getUTCDate() - daysSinceTarget);

  return currentDate.toISOString().slice(0, 10);
}

export function addDays(datePart: string, days: number): string {
  const date = new Date(`${datePart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
