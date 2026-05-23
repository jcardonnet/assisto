import { writeMarkdownPageAtomic } from "../fs";
import { serializeMarkdownFile, type Frontmatter } from "../markdown";
import {
  applyTransaction,
  createTransactionDraft,
  serializeTransactionMarkdown,
  transactionFilePaths,
  type ParsedTransaction
} from "../transactions";
import { loadVaultIndex, type VaultIndex } from "../vault";
import {
  inferObservedAt,
  normalizeWhitespace,
  stripMemoryPrefix,
  type IngestPipelineContext
} from "./candidates";
import { detectCandidateProposals } from "./detectors";
import { resolveDetectorProposals } from "./entity-resolution";
import { buildIngestExtractionDraft } from "./transaction-builder";

export interface IngestNoteOptions {
  now?: string;
  observed_at?: string | null;
  source_actor?: string;
  apply?: boolean;
}

export interface IngestNoteResult {
  event_id: string;
  event_path: string;
  transaction_id: string;
  transaction_path: string;
  transaction: ParsedTransaction;
  applied: boolean;
  extracted_claim_ids: string[];
  staged_review_paths: string[];
  followup_paths: string[];
}

const defaultNow = "2026-05-20T12:00:00-03:00";

export async function ingestNote(
  root: string,
  note: string,
  options: IngestNoteOptions = {}
): Promise<IngestNoteResult> {
  const normalizedNote = normalizeWhitespace(note);
  const now = options.now ?? defaultNow;
  const datePart = now.slice(0, 10);
  const dateIdPart = datePart.replace(/-/g, "_");
  const index = await loadIndexOrEmpty(root);
  const sequence = nextSequence(dateIdPart, index);
  const eventId = `ev_${dateIdPart}_${sequence}`;
  const transactionId = `tx_${dateIdPart}_${sequence}`;
  const eventPath = `memory/events/${datePart.slice(0, 4)}/${datePart.slice(0, 7)}/${datePart}-${sequence}.md`;
  const transactionPath = transactionFilePaths.pending(transactionId);
  const observedAt = options.observed_at ?? inferObservedAt(normalizedNote, datePart);
  const context: IngestPipelineContext = {
    root,
    note: normalizedNote,
    now,
    observedAt,
    eventId,
    eventPath,
    eventLinkPath: stripMemoryPrefix(eventPath).replace(/\.md$/i, ""),
    transactionId
  };

  const proposals = detectCandidateProposals(context);
  const resolvedCandidates = resolveDetectorProposals(proposals, index);
  const extraction = buildIngestExtractionDraft(context, resolvedCandidates);
  const eventMarkdown = renderEventMarkdown(context, {
    sourceActor: options.source_actor ?? "user",
    derivedClaimIds: extraction.claims.map((claim) => claim.claim_id),
    participants: extraction.participants,
    topics: extraction.topics
  });

  await writeMarkdownPageAtomic(root, eventPath, eventMarkdown);

  const operations = extraction.writes.length === 0 ? [{ operation: "NOOP" as const }] : extraction.operations;
  const affectedFiles = [
    stripMemoryPrefix(eventPath),
    ...extraction.writes.map((write) => stripMemoryPrefix(write.path))
  ];
  const transaction = createTransactionDraft({
    id: transactionId,
    created_at: now,
    source_events: [eventId],
    operations,
    affected_files: affectedFiles,
    risk_level: extraction.writes.length > 0 ? "medium" : "low",
    requires_review: extraction.stagedReviewPaths.length > 0,
    rollback_notes:
      "Preserve the source Event. If non-Event writes fail, mark this transaction failed and repair proposed page writes manually.",
    intent: extraction.intent,
    proposed_file_writes: extraction.writes.map((write) => ({
      path: write.path,
      content: write.content
    }))
  });

  await writeMarkdownPageAtomic(root, transactionPath, serializeTransactionMarkdown(transaction));

  if (options.apply === true) {
    await applyTransaction(root, transactionId);
  }

  return {
    event_id: eventId,
    event_path: eventPath,
    transaction_id: transactionId,
    transaction_path: transactionPath,
    transaction,
    applied: options.apply === true,
    extracted_claim_ids: extraction.claims.map((claim) => claim.claim_id),
    staged_review_paths: extraction.stagedReviewPaths,
    followup_paths: extraction.followupPaths
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
    contexts: [],
    derived_claims: input.derivedClaimIds,
    transactions: [context.transactionId]
  };
  const body = [
    `# Event ${context.eventId}`,
    "",
    "## Raw text",
    "",
    context.note,
    "",
    "## Candidate extraction",
    "",
    input.derivedClaimIds.length === 0
      ? "- No durable claim candidates extracted."
      : input.derivedClaimIds.map((claimId) => `- ${claimId}`).join("\n")
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

function nextSequence(dateIdPart: string, index: VaultIndex): string {
  const used = [...index.eventIds, ...index.transactionIds]
    .map((id) => new RegExp(`^(?:ev|tx)_${dateIdPart}_(\\d{3})$`).exec(id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10));
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;

  return String(next).padStart(3, "0");
}

export type { IngestPipelineContext };
export { detectCandidateProposals, resolveDetectorProposals, buildIngestExtractionDraft };
export type { DetectorProposal, ResolvedCandidate } from "./candidates";
