import { writeMarkdownPageAtomic } from "../fs";
import { serializeMarkdownFile, type Frontmatter } from "../markdown";
import {
  applyTransaction,
  createTransactionDraft,
  serializeTransactionMarkdown,
  transactionFilePaths,
  validateTransaction,
  type ParsedTransaction
} from "../transactions";
import { loadVaultIndex, type VaultIndex } from "../vault";
import type { ClaimKind, EvidenceStrength, ScopeState, SupportedOperationType } from "../model";
import { classifyFollowUpIntent } from "../policies";
import { ingestNote, type IngestNoteOptions, type IngestNoteResult } from "../ingest";
import {
  idSlug,
  inferObservedAt,
  normalizePhrase,
  normalizeWhitespace,
  slugify,
  stripMemoryPrefix,
  type CandidateEntityKind,
  type DetectorProposal,
  type ExtractedClaimCandidate,
  type ExtractedFollowUpCandidate,
  type IngestPipelineContext
} from "../ingest/candidates";
import { resolveDetectorProposals } from "../ingest/entity-resolution";
import { buildIngestExtractionDraft } from "../ingest/transaction-builder";
import { contextsFromOption } from "../ingest/metadata";

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

export interface OpenAiExtractionProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetch?: OpenAiFetch;
}

export type OpenAiFetch = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  }
) => Promise<OpenAiFetchResponse>;

export interface OpenAiFetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export interface ExtractionRunOptions extends IngestNoteOptions {
  provider?: ExtractionProvider;
}

export type ExtractionRunResult = IngestNoteResult & {
  provider_name: string;
  deterministic_review_reasons: string[];
};

interface ProviderReviewReason {
  code: string;
  message: string;
  affectedFiles: string[];
  claim?: CandidateClaimProposal;
}

interface ProposedWrite {
  path: string;
  content: string;
  operation: SupportedOperationType;
}

const defaultNow = "2026-05-21T12:00:00-03:00";

export class RuleBasedExtractionProvider implements ExtractionProvider {
  readonly name = "rule-based";

  async extract(): Promise<ExtractionProviderOutput> {
    return {};
  }
}

export class LlmExtractionProvider implements ExtractionProvider {
  constructor(private readonly client?: LlmExtractionClient, readonly name = "llm") {}

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

export class OpenAiExtractionProvider implements ExtractionProvider {
  readonly name = "openai";

  constructor(private readonly options: OpenAiExtractionProviderOptions = {}) {}

  async extract(input: ExtractionProviderInput): Promise<ExtractionProviderOutput> {
    const apiKey = this.options.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    const model = this.options.model ?? process.env.ASSISTO_OPENAI_MODEL ?? "";
    const fetchImpl = this.options.fetch ?? defaultOpenAiFetch();

    if (!apiKey.trim()) {
      return {
        malformed_reason: "OpenAI extraction requires OPENAI_API_KEY."
      };
    }

    if (!model.trim()) {
      return {
        malformed_reason: "OpenAI extraction requires ASSISTO_OPENAI_MODEL; no model default is hard-coded."
      };
    }

    if (!fetchImpl) {
      return {
        malformed_reason: "OpenAI extraction requires a fetch implementation."
      };
    }

    const baseUrl = (this.options.baseUrl ?? process.env.ASSISTO_OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(
      /\/+$/,
      ""
    );

    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: openAiExtractionSystemPrompt()
            },
            {
              role: "user",
              content: JSON.stringify({
                now: input.now,
                note: input.note
              })
            }
          ]
        })
      });

      if (!response.ok) {
        return {
          malformed_reason: `OpenAI extraction request failed: ${response.status} ${truncate(await response.text(), 240)}`
        };
      }

      const payload = await response.json();
      const content = openAiMessageContent(payload);

      if (!content) {
        return {
          malformed_reason: "OpenAI extraction response must include choices[0].message.content."
        };
      }

      let parsed: unknown;

      try {
        parsed = JSON.parse(content);
      } catch {
        return {
          malformed_reason: "OpenAI extraction response content must be valid JSON."
        };
      }

      return normalizeProviderOutput(parsed);
    } catch (error) {
      return {
        malformed_reason: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

export function createOpenAiExtractionProvider(
  options: OpenAiExtractionProviderOptions = {}
): OpenAiExtractionProvider {
  return new OpenAiExtractionProvider(options);
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
  const rawNote = note;
  const normalizedNote = normalizeWhitespace(note);
  const index = await loadIndexOrEmpty(root);
  const context = createPipelineContext(root, normalizedNote, now, index, { ...options, raw_note: rawNote });
  const providerOutput = await provider.extract({ note: context.note, now });
  const providerCandidates = providerOutputToCandidates(context, providerOutput);
  const resolved = resolveDetectorProposals(providerCandidates.proposals, index);
  const extraction = buildIngestExtractionDraft(context, resolved);
  const reviewWrites = providerCandidates.reviewReasons.map((reason) => reviewWrite(context, reason));
  const proposedWrites = withOperations(extraction.writes).concat(reviewWrites);
  const eventMarkdown = renderEventMarkdown(context, {
    sourceActor: options.source_actor ?? "user",
    derivedClaimIds: extraction.claims.map((claim) => claim.claim_id),
    participants: extraction.participants,
    topics: extraction.topics
  });

  await writeMarkdownPageAtomic(root, context.eventPath, eventMarkdown);

  let transaction = createDraftFromWrites(context, proposedWrites, providerCandidates.reviewReasons);
  let validation = await validateTransaction(root, transaction);

  if (!validation.passed) {
    const fallbackReason: ProviderReviewReason = {
      code: "llm_validation_failed",
      message: `LLM extraction failed deterministic validation: ${validation.errors
        .map((error) => error.code)
        .join(", ")}`,
      affectedFiles: []
    };
    transaction = createDraftFromWrites(context, [reviewWrite(context, fallbackReason)], [fallbackReason]);
    validation = await validateTransaction(root, transaction);
  }

  await writeMarkdownPageAtomic(
    root,
    transactionFilePaths.pending(context.transactionId),
    serializeTransactionMarkdown(transaction)
  );

  if (options.apply === true) {
    await applyTransaction(root, context.transactionId);
  }

  return {
    event_id: context.eventId,
    event_path: context.eventPath,
    transaction_id: context.transactionId,
    transaction_path: transactionFilePaths.pending(context.transactionId),
    transaction,
    applied: options.apply === true,
    extracted_claim_ids: extraction.claims.map((claim) => claim.claim_id),
    staged_review_paths: proposedWrites
      .filter((write) => write.operation === "STAGE_REVIEW")
      .map((write) => write.path),
    followup_paths: extraction.followupPaths,
    provider_name: provider.name,
    deterministic_review_reasons: providerCandidates.reviewReasons.map((reason) => reason.code)
  };
}

function providerOutputToCandidates(
  context: IngestPipelineContext,
  output: ExtractionProviderOutput
): { proposals: DetectorProposal[]; reviewReasons: ProviderReviewReason[] } {
  const proposals: DetectorProposal[] = [];
  const reviewReasons: ProviderReviewReason[] = [];
  const entityHints = output.entities ?? [];

  if (output.malformed_reason) {
    reviewReasons.push({
      code: "llm_output_malformed",
      message: output.malformed_reason,
      affectedFiles: []
    });
  }

  for (const claim of output.claims ?? []) {
    proposals.push(claimProposalToCandidate(claim, entityHints));
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

    if (followupIntent.intent === "none") {
      reviewReasons.push({
        code: "llm_followup_without_trigger",
        message: "LLM proposed a follow-up but the source note has no follow-up trigger.",
        affectedFiles: ["followups/"]
      });
      continue;
    }

    proposals.push(followUpProposalToCandidate(context, followup, followupIntent.trigger ?? followup.trigger ?? ""));
  }

  for (const entity of entityHints) {
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

  return {
    proposals,
    reviewReasons
  };
}

function claimProposalToCandidate(
  claim: CandidateClaimProposal,
  entityHints: CandidateEntityProposal[]
): ExtractedClaimCandidate {
  const statement = normalizeWhitespace(claim.statement);
  const hint = claim.entity_resolution ?? matchingEntityHint(claim, entityHints)?.resolution_state;

  return {
    kind: "claim",
    source_text: statement,
    entity_kind: claim.entity_kind,
    entity_name: claim.entity_name,
    entity_resolution_hint: hint,
    claim_id: claimIdFor(claim),
    statement,
    claim_kind: claim.claim_kind ?? "fact",
    evidence_strength: claim.evidence_strength ?? "explicit",
    scope: claim.scope === undefined ? defaultScopeForClaim(claim) : claim.scope,
    scope_state: claim.scope_state ?? defaultScopeStateForClaim(claim),
    page_summary: statement
  };
}

function followUpProposalToCandidate(
  context: IngestPipelineContext,
  followup: CandidateFollowUpProposal,
  trigger: string
): ExtractedFollowUpCandidate {
  return {
    kind: "followup",
    source_text: context.note,
    action: normalizePhrase(followup.action),
    followup_state: followup.followup_state,
    trigger
  };
}

function matchingEntityHint(
  claim: CandidateClaimProposal,
  entityHints: CandidateEntityProposal[]
): CandidateEntityProposal | undefined {
  const normalizedName = normalizeEntityName(claim.entity_name);

  return entityHints.find(
    (entity) => entity.kind === claim.entity_kind && normalizeEntityName(entity.name) === normalizedName
  );
}

function defaultScopeForClaim(claim: CandidateClaimProposal): string | null {
  return claim.entity_kind === "person" ? "current-work-context" : null;
}

function defaultScopeStateForClaim(claim: CandidateClaimProposal): ScopeState {
  return claim.entity_kind === "person" ? "partial" : "unknown";
}

function reviewWrite(context: IngestPipelineContext, reason: ProviderReviewReason): ProposedWrite {
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
    "- Provider output is candidate data only.",
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
  context: IngestPipelineContext,
  writes: ProposedWrite[],
  reviewReasons: ProviderReviewReason[]
): ParsedTransaction {
  const operations = writes.length === 0 ? [{ operation: "NOOP" as const }] : operationsFromWrites(writes);

  return createTransactionDraft({
    id: context.transactionId,
    created_at: context.now,
    source_events: [context.eventId],
    operations,
    affected_files: [stripMemoryPrefix(context.eventPath), ...writes.map((write) => stripMemoryPrefix(write.path))],
    risk_level: reviewReasons.length > 0 ? "medium" : "low",
    requires_review: reviewReasons.length > 0 || writes.some((write) => write.operation === "STAGE_REVIEW"),
    rollback_notes:
      "Preserve the source Event. Provider extraction writes are proposed only and must be repaired manually if validation fails.",
    intent:
      reviewReasons.length > 0
        ? "Stage provider-assisted extraction output for deterministic review."
        : "Create deterministic transaction from provider-assisted candidate extraction.",
    proposed_file_writes: writes.map((write) => ({
      path: write.path,
      content: write.content
    }))
  });
}

function renderEventMarkdown(
  context: IngestPipelineContext,
  input: {
    sourceActor: string;
    derivedClaimIds: string[];
    participants: string[];
    topics: string[];
  }
): string {
  const frontmatter: Frontmatter = {
    id: context.eventId,
    type: "event",
    object_state: "active",
    review_state: "reviewed",
    recorded_at: context.now,
    observed_at: context.observedAt,
    source_type: "user_note",
    source_actor: input.sourceActor,
    participants: input.participants,
    topics: input.topics,
    contexts: context.captureContexts ?? [],
    derived_claims: input.derivedClaimIds,
    transactions: [context.transactionId]
  };

  if (context.sourceLabel) {
    frontmatter.source_label = context.sourceLabel;
  }

  if (context.sourceHash) {
    frontmatter.source_hash = context.sourceHash;
  }

  const body = [
    `# Event ${context.eventId}`,
    "",
    "## Raw text",
    "",
    context.rawNote,
    "",
    "## Candidate extraction",
    "",
    input.derivedClaimIds.length === 0
      ? "- No durable claim candidates extracted."
      : input.derivedClaimIds.map((claimId) => `- ${claimId}`).join("\n")
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

function createPipelineContext(
  root: string,
  note: string,
  now: string,
  index: VaultIndex,
  options: IngestNoteOptions
): IngestPipelineContext {
  const datePart = now.slice(0, 10);
  const dateIdPart = datePart.replace(/-/g, "_");
  const sequence = nextSequence(dateIdPart, index);
  const eventId = `ev_${dateIdPart}_${sequence}`;
  const transactionId = `tx_${dateIdPart}_${sequence}`;
  const eventPath = `memory/events/${datePart.slice(0, 4)}/${datePart.slice(0, 7)}/${datePart}-${sequence}.md`;

  return {
    root,
    note,
    rawNote: options.raw_note ?? note,
    now,
    observedAt: options.observed_at ?? inferObservedAt(note, datePart),
    eventId,
    eventPath,
    eventLinkPath: stripMemoryPrefix(eventPath).replace(/\.md$/i, ""),
    transactionId,
    captureContexts: contextsFromOption(options.context),
    sourceLabel: options.source_label,
    sourceHash: options.source_hash
  };
}

function withOperations(writes: Array<{ path: string; content: string }>): ProposedWrite[] {
  return writes.map((write) => ({
    ...write,
    operation: write.path.startsWith("memory/review/") ? "STAGE_REVIEW" : "UPSERT_CLAIM"
  }));
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

  return {
    entity_kind: enumString(value.entity_kind, ["person", "topic", "context", "system"], "entity_kind"),
    entity_name: requiredString(value.entity_name, "entity_name"),
    statement: requiredString(value.statement, "statement"),
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

function claimIdFor(claim: CandidateClaimProposal): string {
  const base = `${claim.entity_name}_${claim.statement}`.toLowerCase();
  return `clm_${idSlug(base).slice(0, 72)}`;
}

function renderCandidateSummary(claim: CandidateClaimProposal): string {
  return [
    `- entity_kind: ${claim.entity_kind}`,
    `- entity_name: ${claim.entity_name}`,
    `- statement: ${claim.statement}`,
    `- scope: ${claim.scope ?? "null"}`,
    `- scope_state: ${claim.scope_state ?? "unknown"}`,
    `- entity_resolution: ${claim.entity_resolution ?? "unspecified"}`
  ].join("\n");
}

function nextSequence(dateIdPart: string, index: VaultIndex): string {
  const used = [...index.eventIds, ...index.transactionIds]
    .map((id) => new RegExp(`^(?:ev|tx)_${dateIdPart}_(\\d{3})$`).exec(id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10));
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;

  return String(next).padStart(3, "0");
}

function stableHash(value: string): string {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0").slice(0, 8);
}

function normalizeEntityName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`LLM extraction field must be a non-empty string: ${field}.`);
  }

  return value.trim();
}

function enumString<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`LLM extraction field has invalid enum value: ${field}.`);
  }

  return value as T;
}

function optionalEnumString<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error("LLM extraction optional enum field has invalid value.");
  }

  return value as T;
}

function openAiExtractionSystemPrompt(): string {
  return [
    "You propose candidate-only work-memory extraction JSON for Assisto.",
    "The deterministic markdown pipeline is authoritative; do not claim that anything has been saved or applied.",
    "Return only a JSON object with optional arrays: claims, followups, entities, explanations.",
    "claims items: entity_kind person|topic|context|system, entity_name, statement, optional claim_kind fact|inference|assumption|preference|commitment, optional evidence_strength explicit|inferred|weak, optional scope string|null, optional scope_state complete|partial|unknown, optional entity_resolution exact_match|alias_match|near_match|new_entity|ambiguous.",
    "followups items require action and followup_state candidate|committed; committed followups require explicit trigger text in the source note.",
    "entities items require kind, name, resolution_state, and optional candidates.",
    "Do not invent source facts, scopes, dates, aliases, or explanations.",
    "Do not emit generated explanations unless the note explicitly asks to save one.",
    "For ambiguous entities, near matches, unscoped system/project facts, contradictions, role changes, and reporting changes, mark candidate fields so deterministic review can stage them."
  ].join("\n");
}

function openAiMessageContent(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    return null;
  }

  const firstChoice = value.choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return null;
  }

  const content = firstChoice.message.content;
  return typeof content === "string" && content.trim() ? content : null;
}

function defaultOpenAiFetch(): OpenAiFetch | undefined {
  const fetchImpl = (globalThis as typeof globalThis & { fetch?: OpenAiFetch }).fetch;
  return typeof fetchImpl === "function" ? fetchImpl.bind(globalThis) : undefined;
}

function truncate(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value);
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3)}...`;
}
