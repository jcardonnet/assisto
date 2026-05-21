import { writeMarkdownPageAtomic } from "../fs";
import { serializeMarkdownFile, type Frontmatter } from "../markdown";
import { ingestNote, type IngestNoteOptions, type IngestNoteResult } from "../ingest";
import { classifyFollowUpIntent } from "../policies";
import {
  createTransactionDraft,
  serializeTransactionMarkdown,
  transactionFilePaths,
  validateTransaction,
  type ParsedTransaction
} from "../transactions";
import { loadVaultIndex, type VaultIndex } from "../vault";
import type { ClaimKind, EvidenceStrength, ScopeState, SupportedOperationType } from "../model";

export type CandidateEntityKind = "person" | "topic" | "context" | "system";
export type CandidateEntityResolution = "exact_match" | "alias_match" | "near_match" | "new_entity" | "ambiguous";

export interface ExtractionProviderInput {
  note: string;
  now: string;
}

export interface CandidateClaimProposal {
  entity_kind: CandidateEntityKind;
  entity_name: string;
  statement: string;
  claim_kind?: ClaimKind;
  evidence_strength?: EvidenceStrength;
  scope?: string | null;
  scope_state?: ScopeState;
  entity_resolution?: CandidateEntityResolution;
}

export interface CandidateFollowUpProposal {
  action: string;
  followup_state: "candidate" | "committed";
  trigger?: string;
}

export interface CandidateEntityProposal {
  kind: CandidateEntityKind;
  name: string;
  resolution_state: CandidateEntityResolution;
  candidates?: string[];
}

export interface CandidateExplanationProposal {
  title: string;
  body: string;
  explicit_save?: boolean;
}

export interface ExtractionProviderOutput {
  claims?: CandidateClaimProposal[];
  followups?: CandidateFollowUpProposal[];
  entities?: CandidateEntityProposal[];
  explanations?: CandidateExplanationProposal[];
  malformed_reason?: string;
}

export interface ExtractionProvider {
  readonly name: string;
  extract(input: ExtractionProviderInput): Promise<ExtractionProviderOutput>;
}

export interface LlmExtractionClient {
  extract(input: ExtractionProviderInput): Promise<unknown>;
}

export interface ExtractionRunOptions extends IngestNoteOptions {
  provider?: ExtractionProvider;
}

export type ExtractionRunResult = IngestNoteResult & {
  provider_name: string;
  deterministic_review_reasons: string[];
};

interface ExtractionContext {
  root: string;
  note: string;
  now: string;
  eventId: string;
  transactionId: string;
  eventPath: string;
  eventLinkPath: string;
}

interface ProposedWrite {
  path: string;
  content: string;
  operation: SupportedOperationType;
}

interface ReviewReason {
  code: string;
  message: string;
  affectedFiles: string[];
  claim?: CandidateClaimProposal;
}

const defaultNow = "2026-05-21T12:00:00-03:00";

export class RuleBasedExtractionProvider implements ExtractionProvider {
  readonly name = "rule-based";

  async extract(): Promise<ExtractionProviderOutput> {
    return {};
  }
}

export class LlmExtractionProvider implements ExtractionProvider {
  readonly name = "llm";

  constructor(private readonly client?: LlmExtractionClient) {}

  async extract(input: ExtractionProviderInput): Promise<ExtractionProviderOutput> {
    if (!this.client) {
      return {
        malformed_reason: "LLM extraction client is not configured."
      };
    }

    try {
      return normalizeProviderOutput(await this.client.extract(input));
    } catch (error) {
      return {
        malformed_reason: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

export async function ingestWithExtractionProvider(
  root: string,
  note: string,
  options: ExtractionRunOptions = {}
): Promise<ExtractionRunResult> {
  const provider = options.provider ?? new RuleBasedExtractionProvider();

  if (provider.name === "rule-based") {
    const result = await ingestNote(root, note, options);

    return {
      ...result,
      provider_name: provider.name,
      deterministic_review_reasons: []
    };
  }

  const now = options.now ?? defaultNow;
  const context = await createExtractionContext(root, normalizeWhitespace(note), now);
  const providerOutput = await provider.extract({ note: context.note, now });
  const deterministic = buildDeterministicWrites(context, providerOutput);
  const eventMarkdown = renderEventMarkdown(context, deterministic.derivedClaimIds);

  await writeMarkdownPageAtomic(root, context.eventPath, eventMarkdown);

  let transaction = createDraftFromWrites(context, deterministic.writes, deterministic.reviewReasons);
  let validation = await validateTransaction(root, transaction);

  if (!validation.passed) {
    const fallbackReason: ReviewReason = {
      code: "llm_validation_failed",
      message: `LLM extraction failed deterministic validation: ${validation.errors
        .map((error) => error.code)
        .join(", ")}`,
      affectedFiles: []
    };
    const fallbackWrites = [reviewWrite(context, fallbackReason)];
    transaction = createDraftFromWrites(context, fallbackWrites, [fallbackReason]);
    validation = await validateTransaction(root, transaction);
  }

  await writeMarkdownPageAtomic(
    root,
    transactionFilePaths.pending(context.transactionId),
    serializeTransactionMarkdown(transaction)
  );

  return {
    event_id: context.eventId,
    event_path: context.eventPath,
    transaction_id: context.transactionId,
    transaction_path: transactionFilePaths.pending(context.transactionId),
    transaction,
    applied: false,
    extracted_claim_ids: deterministic.derivedClaimIds,
    staged_review_paths: deterministic.writes
      .filter((write) => write.operation === "STAGE_REVIEW")
      .map((write) => write.path),
    followup_paths: deterministic.writes
      .filter((write) => write.path.startsWith("memory/followups/"))
      .map((write) => write.path),
    provider_name: provider.name,
    deterministic_review_reasons: deterministic.reviewReasons.map((reason) => reason.code)
  };
}

function normalizeProviderOutput(value: unknown): ExtractionProviderOutput {
  if (!isRecord(value)) {
    return {
      malformed_reason: "LLM extraction output must be an object."
    };
  }

  const output: ExtractionProviderOutput = {};

  if (value.claims !== undefined) {
    if (!Array.isArray(value.claims)) {
      return { malformed_reason: "LLM claims must be a list." };
    }

    output.claims = value.claims.map(normalizeClaimProposal);
  }

  if (value.followups !== undefined) {
    if (!Array.isArray(value.followups)) {
      return { malformed_reason: "LLM followups must be a list." };
    }

    output.followups = value.followups.map(normalizeFollowUpProposal);
  }

  if (value.entities !== undefined) {
    if (!Array.isArray(value.entities)) {
      return { malformed_reason: "LLM entities must be a list." };
    }

    output.entities = value.entities.map(normalizeEntityProposal);
  }

  if (value.explanations !== undefined) {
    if (!Array.isArray(value.explanations)) {
      return { malformed_reason: "LLM explanations must be a list." };
    }

    output.explanations = value.explanations.map(normalizeExplanationProposal);
  }

  return output;
}

function normalizeClaimProposal(value: unknown): CandidateClaimProposal {
  if (!isRecord(value)) {
    throw new Error("Each LLM claim must be an object.");
  }

  const entityKind = enumString(value.entity_kind, ["person", "topic", "context", "system"], "entity_kind");
  const statement = requiredString(value.statement, "statement");
  const entityName = requiredString(value.entity_name, "entity_name");

  return {
    entity_kind: entityKind,
    entity_name: entityName,
    statement,
    claim_kind: optionalEnumString(value.claim_kind, ["fact", "inference", "assumption", "preference", "commitment"]),
    evidence_strength: optionalEnumString(value.evidence_strength, ["explicit", "inferred", "weak"]),
    scope: typeof value.scope === "string" ? value.scope : value.scope === null ? null : undefined,
    scope_state: optionalEnumString(value.scope_state, ["complete", "partial", "unknown"]),
    entity_resolution: optionalEnumString(value.entity_resolution, [
      "exact_match",
      "alias_match",
      "near_match",
      "new_entity",
      "ambiguous"
    ])
  };
}

function normalizeFollowUpProposal(value: unknown): CandidateFollowUpProposal {
  if (!isRecord(value)) {
    throw new Error("Each LLM follow-up must be an object.");
  }

  return {
    action: requiredString(value.action, "action"),
    followup_state: enumString(value.followup_state, ["candidate", "committed"], "followup_state"),
    trigger: typeof value.trigger === "string" ? value.trigger : undefined
  };
}

function normalizeEntityProposal(value: unknown): CandidateEntityProposal {
  if (!isRecord(value)) {
    throw new Error("Each LLM entity must be an object.");
  }

  return {
    kind: enumString(value.kind, ["person", "topic", "context", "system"], "kind"),
    name: requiredString(value.name, "name"),
    resolution_state: enumString(
      value.resolution_state,
      ["exact_match", "alias_match", "near_match", "new_entity", "ambiguous"],
      "resolution_state"
    ),
    candidates: Array.isArray(value.candidates) && value.candidates.every((candidate) => typeof candidate === "string")
      ? value.candidates
      : undefined
  };
}

function normalizeExplanationProposal(value: unknown): CandidateExplanationProposal {
  if (!isRecord(value)) {
    throw new Error("Each LLM explanation must be an object.");
  }

  return {
    title: requiredString(value.title, "title"),
    body: requiredString(value.body, "body"),
    explicit_save: value.explicit_save === true
  };
}

function buildDeterministicWrites(
  context: ExtractionContext,
  output: ExtractionProviderOutput
): { writes: ProposedWrite[]; reviewReasons: ReviewReason[]; derivedClaimIds: string[] } {
  const writes: ProposedWrite[] = [];
  const reviewReasons: ReviewReason[] = [];
  const derivedClaimIds: string[] = [];

  if (output.malformed_reason) {
    reviewReasons.push({
      code: "llm_output_malformed",
      message: output.malformed_reason,
      affectedFiles: []
    });
  }

  for (const claim of output.claims ?? []) {
    const reviewReason = reviewReasonForClaim(claim, output.entities ?? []);

    if (reviewReason) {
      reviewReasons.push(reviewReason);
      derivedClaimIds.push(claimIdFor(claim));
      continue;
    }

    const write = writeForSafeClaim(context, claim);

    if (write) {
      writes.push(write);
      derivedClaimIds.push(claimIdFor(claim));
    }
  }

  for (const followup of output.followups ?? []) {
    const followupIntent = classifyFollowUpIntent(context.note);

    if (followup.followup_state === "committed" && followupIntent.intent !== "committed") {
      reviewReasons.push({
        code: "llm_followup_rejected",
        message: "LLM proposed a committed follow-up without explicit trigger language.",
        affectedFiles: ["followups/"]
      });
      continue;
    }

    writes.push(writeForFollowUp(context, followup, followupIntent.trigger ?? followup.trigger ?? ""));
  }

  for (const entity of output.entities ?? []) {
    if (entity.resolution_state === "near_match" || entity.resolution_state === "ambiguous") {
      reviewReasons.push({
        code: "llm_entity_resolution_staged",
        message: `LLM proposed ${entity.resolution_state} entity update for ${entity.name}.`,
        affectedFiles: [`${entity.kind}s/${slugify(entity.name)}.md`]
      });
    }
  }

  for (const explanation of output.explanations ?? []) {
    if (!explanation.explicit_save) {
      reviewReasons.push({
        code: "llm_explanation_not_persisted",
        message: `Generated explanation "${explanation.title}" was omitted because no explicit save was requested.`,
        affectedFiles: []
      });
    }
  }

  writes.push(...reviewReasons.map((reason) => reviewWrite(context, reason)));

  return {
    writes,
    reviewReasons,
    derivedClaimIds
  };
}

function reviewReasonForClaim(
  claim: CandidateClaimProposal,
  entities: CandidateEntityProposal[]
): ReviewReason | null {
  const entityResolution = claim.entity_resolution ?? entityResolutionFor(claim, entities);

  if (entityResolution === "near_match" || entityResolution === "ambiguous") {
    return {
      code: "llm_entity_update_staged",
      message: `LLM claim for ${claim.entity_name} has entity_resolution=${entityResolution}.`,
      affectedFiles: [pathForEntity(claim)],
      claim
    };
  }

  if (
    (claim.entity_kind === "system" || claim.entity_kind === "topic" || claim.entity_kind === "context") &&
    ((claim.scope_state ?? "unknown") === "unknown" || !claim.scope)
  ) {
    return {
      code: "llm_unscoped_system_claim",
      message: "LLM proposed a system/topic/context claim without complete scope.",
      affectedFiles: [pathForEntity(claim)],
      claim
    };
  }

  return null;
}

function writeForSafeClaim(context: ExtractionContext, claim: CandidateClaimProposal): ProposedWrite | null {
  if (claim.entity_kind !== "person") {
    return null;
  }

  const claimId = claimIdFor(claim);
  const personName = claim.entity_name.trim();
  const personId = `per_${slugify(personName)}`;
  const frontmatter: Frontmatter = {
    id: personId,
    type: "person",
    object_state: "active",
    review_state: "reviewed",
    created_at: context.now,
    updated_at: context.now,
    aliases: [],
    source_events: [context.eventId],
    related: [],
    summary_generated_from: [claimId]
  };
  const body = [
    `# ${personName}`,
    "",
    "## Current summary",
    "",
    claim.statement,
    "",
    "## Active claims",
    "",
    renderClaimBlock({
      claim_id: claimId,
      statement: claim.statement,
      claim_kind: claim.claim_kind ?? "fact",
      claim_state: "active",
      evidence_strength: claim.evidence_strength ?? "explicit",
      scope: claim.scope ?? "current-work-context",
      scope_state: claim.scope_state ?? "partial",
      evidence: [context.eventId],
      recorded_at: context.now,
      observed_at: null,
      valid_from: null,
      valid_to: null
    })
  ].join("\n");

  return {
    path: `memory/people/${slugify(personName)}.md`,
    content: serializeMarkdownFile(frontmatter, body),
    operation: "UPSERT_CLAIM"
  };
}

function writeForFollowUp(
  context: ExtractionContext,
  followup: CandidateFollowUpProposal,
  trigger: string
): ProposedWrite {
  const slug = slugify(followup.action);
  const frontmatter: Frontmatter = {
    id: `fu_${slug}`,
    type: "followup",
    object_state: "active",
    review_state: followup.followup_state === "committed" ? "reviewed" : "staged",
    followup_state: followup.followup_state,
    created_at: context.now,
    updated_at: context.now,
    owner: "user",
    source_events: [context.eventId],
    related: [],
    transactions: [context.transactionId]
  };
  const body = [
    `# Follow-up: ${followup.action}`,
    "",
    "## Action",
    "",
    followup.action,
    "",
    "## Trigger",
    "",
    trigger || followup.trigger || "",
    "",
    "## Evidence",
    "",
    `- Event: [[${context.eventLinkPath}]]`
  ].join("\n");

  return {
    path: `memory/followups/${slug}.md`,
    content: serializeMarkdownFile(frontmatter, body),
    operation: "UPSERT_CLAIM"
  };
}

function reviewWrite(context: ExtractionContext, reason: ReviewReason): ProposedWrite {
  const id = `rev_llm_${reason.code}_${stableHash(reason.message)}`;
  const frontmatter: Frontmatter = {
    id,
    type: "review_item",
    object_state: "active",
    review_state: "staged",
    review_reason: reason.code,
    created_at: context.now,
    source_events: [context.eventId],
    affected_files: reason.affectedFiles,
    linked_transaction: context.transactionId
  };
  const body = [
    `# Review: ${reason.code}`,
    "",
    "## Issue",
    "",
    reason.message,
    "",
    "## Evidence",
    "",
    `- Event: [[${context.eventLinkPath}]]`,
    "",
    "## Candidate",
    "",
    reason.claim ? renderCandidateSummary(reason.claim) : "No durable candidate persisted.",
    "",
    "## Policy",
    "",
    "- LLM output is candidate data only.",
    "- Deterministic validators and staging policies remain authoritative.",
    "- No canonical pages were written by extraction.",
    "- Generated explanations are omitted unless explicitly saved."
  ].join("\n");

  return {
    path: `memory/review/${id}.md`,
    content: serializeMarkdownFile(frontmatter, body),
    operation: "STAGE_REVIEW"
  };
}

function createDraftFromWrites(
  context: ExtractionContext,
  writes: ProposedWrite[],
  reviewReasons: ReviewReason[]
): ParsedTransaction {
  const operations = writes.length === 0 ? [{ operation: "NOOP" as const }] : operationsFromWrites(writes);

  return createTransactionDraft({
    id: context.transactionId,
    created_at: context.now,
    source_events: [context.eventId],
    operations,
    affected_files: [stripMemoryPrefix(context.eventPath), ...writes.map((write) => stripMemoryPrefix(write.path))],
    risk_level: reviewReasons.length > 0 ? "medium" : "low",
    requires_review: reviewReasons.length > 0,
    rollback_notes:
      "Preserve the source Event. LLM extraction writes are proposed only and must be repaired manually if validation fails.",
    intent:
      reviewReasons.length > 0
        ? "Stage LLM-assisted extraction output for deterministic review."
        : "Create deterministic transaction from LLM-assisted candidate extraction.",
    proposed_file_writes: writes.map((write) => ({
      path: write.path,
      content: write.content
    }))
  });
}

function operationsFromWrites(writes: ProposedWrite[]): Array<{ operation: SupportedOperationType; description: string }> {
  const operations = new Map<SupportedOperationType, string>();

  for (const write of writes) {
    operations.set(write.operation, `draft ${stripMemoryPrefix(write.path)}`);
  }

  return [...operations.entries()].map(([operation, description]) => ({
    operation,
    description
  }));
}

async function createExtractionContext(root: string, note: string, now: string): Promise<ExtractionContext> {
  const datePart = now.slice(0, 10);
  const dateIdPart = datePart.replace(/-/g, "_");
  const index = await loadIndexOrEmpty(root);
  const sequence = nextSequence(dateIdPart, index);
  const eventId = `ev_${dateIdPart}_${sequence}`;
  const transactionId = `tx_${dateIdPart}_${sequence}`;
  const eventPath = `memory/events/${datePart.slice(0, 4)}/${datePart.slice(0, 7)}/${datePart}-${sequence}.md`;

  return {
    root,
    note,
    now,
    eventId,
    transactionId,
    eventPath,
    eventLinkPath: stripMemoryPrefix(eventPath).replace(/\.md$/i, "")
  };
}

async function loadIndexOrEmpty(root: string): Promise<VaultIndex> {
  try {
    return await loadVaultIndex(root);
  } catch {
    return {
      entries: [],
      ids: new Map(),
      paths: new Set(),
      wikilinks: new Map(),
      eventIds: new Set(),
      claimIds: new Map(),
      transactionIds: new Set()
    };
  }
}

function renderEventMarkdown(context: ExtractionContext, derivedClaimIds: string[]): string {
  return serializeMarkdownFile(
    {
      id: context.eventId,
      type: "event",
      object_state: "active",
      review_state: "reviewed",
      recorded_at: context.now,
      observed_at: null,
      source_type: "user_note",
      source_actor: "user",
      participants: [],
      topics: [],
      contexts: [],
      derived_claims: derivedClaimIds,
      transactions: [context.transactionId]
    },
    [
      `# Event ${context.eventId}`,
      "",
      "## Raw text",
      "",
      context.note,
      "",
      "## Candidate extraction",
      "",
      derivedClaimIds.length === 0
        ? "- LLM-assisted extraction produced no durable claim candidates."
        : derivedClaimIds.map((claimId) => `- ${claimId}`).join("\n")
    ].join("\n")
  );
}

function renderClaimBlock(claim: {
  claim_id: string;
  statement: string;
  claim_kind: ClaimKind;
  claim_state: "active" | "staged";
  evidence_strength: EvidenceStrength;
  scope: string | null;
  scope_state: ScopeState;
  evidence: string[];
  recorded_at: string;
  observed_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
}): string {
  return [
    `- claim_id: ${claim.claim_id}`,
    `  statement: ${claim.statement}`,
    `  claim_kind: ${claim.claim_kind}`,
    `  claim_state: ${claim.claim_state}`,
    `  evidence_strength: ${claim.evidence_strength}`,
    `  scope: ${claim.scope ?? "null"}`,
    `  scope_state: ${claim.scope_state}`,
    `  evidence: [${claim.evidence.join(", ")}]`,
    `  recorded_at: ${claim.recorded_at}`,
    `  observed_at: ${claim.observed_at ?? "null"}`,
    `  valid_from: ${claim.valid_from ?? "null"}`,
    `  valid_to: ${claim.valid_to ?? "null"}`
  ].join("\n");
}

function renderCandidateSummary(claim: CandidateClaimProposal): string {
  return [
    `- entity_kind: ${claim.entity_kind}`,
    `- entity_name: ${claim.entity_name}`,
    `- statement: ${claim.statement}`,
    `- scope_state: ${claim.scope_state ?? "unknown"}`,
    `- entity_resolution: ${claim.entity_resolution ?? "unspecified"}`
  ].join("\n");
}

function pathForEntity(claim: CandidateClaimProposal): string {
  const folder = claim.entity_kind === "system" ? "topics" : `${claim.entity_kind}s`;
  return `${folder}/${slugify(claim.entity_name)}.md`;
}

function entityResolutionFor(
  claim: CandidateClaimProposal,
  entities: CandidateEntityProposal[]
): CandidateEntityResolution | undefined {
  return entities.find(
    (entity) =>
      entity.name.toLowerCase() === claim.entity_name.toLowerCase() &&
      (entity.kind === claim.entity_kind || (entity.kind === "topic" && claim.entity_kind === "system"))
  )?.resolution_state;
}

function claimIdFor(claim: CandidateClaimProposal): string {
  return `clm_${slugify(claim.entity_name)}_${stableHash(claim.statement)}`;
}

function nextSequence(dateIdPart: string, index: VaultIndex): string {
  const used = [...index.eventIds, ...index.transactionIds]
    .map((id) => new RegExp(`^(?:ev|tx)_${dateIdPart}_(\\d{3})$`).exec(id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10));
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;

  return String(next).padStart(3, "0");
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`LLM output missing string field: ${field}.`);
  }

  return value.trim();
}

function enumString<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value === "string" && allowed.includes(value)) {
    return value;
  }

  throw new Error(`LLM output field ${field} must be one of: ${allowed.join(", ")}.`);
}

function optionalEnumString<const T extends readonly string[]>(value: unknown, allowed: T): T[number] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string" && allowed.includes(value)) {
    return value;
  }

  throw new Error(`LLM output enum value is invalid: ${String(value)}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stripMemoryPrefix(path: string): string {
  return path.replace(/\\/g, "/").replace(/^memory\//, "");
}

function stableHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}
