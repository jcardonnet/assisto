import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listMarkdownFiles, readMarkdownPage } from "../fs";
import { ingestWithExtractionProvider, type ExtractionProvider, type ExtractionRunResult } from "../extraction";
import { contextsFromOption } from "../ingest/metadata";
import { getSection, parseMarkdownFile, type FrontmatterValue } from "../markdown";
import {
  parseTransactionMarkdown,
  validateTransaction,
  type ParsedTransaction,
  type TransactionFileWrite
} from "../transactions";
import type { ValidationResult } from "../validators";

export interface CaptureNoteOptions {
  now?: string;
  observed_at?: string | null;
  source_actor?: string;
  source_label?: string;
  context?: string;
  provider?: ExtractionProvider;
}

export interface CaptureResult {
  action: "capture_note";
  created: boolean;
  event_id: string;
  event_path: string;
  transaction_id: string;
  transaction_path: string;
  transaction_state: string;
  provider_name: string;
  validation: ValidationResult;
  operations: string[];
  affected_files: string[];
  source_events: string[];
  proposed_file_writes: TransactionFileWrite[];
  extracted_claim_ids: string[];
  staged_review_paths: string[];
  followup_paths: string[];
  contexts: string[];
  source_label?: string;
  event_raw_text: string;
  why_staged: string[];
  needs_context: boolean;
  likely_next_review_action: string;
  transaction: ParsedTransaction;
}

export type CapturePreviewResult = CaptureResult & { created: false };
export type CaptureCreateResult = CaptureResult & { created: true };

export interface CaptureInboxOptions {
  now?: string;
  recentLimit?: number;
}

export interface CaptureInboxResult {
  generated_at: string;
  recent_events: CaptureInboxEvent[];
  pending_capture_transactions: CaptureInboxTransaction[];
  source_label_presets: CaptureSourceLabelPreset[];
  observed_at_shortcuts: CaptureObservedAtShortcut[];
  context_suggestions: CaptureContextSuggestion[];
  capture_templates: CaptureTemplate[];
  warnings: string[];
}

export interface CaptureInboxEvent {
  event_id: string;
  path: string;
  recorded_at?: string;
  observed_at?: string;
  source_label?: string;
  contexts: string[];
  participants: string[];
  topics: string[];
  derived_claims: string[];
  raw_excerpt: string;
}

export interface CaptureInboxTransaction {
  transaction_id: string;
  path: string;
  created_at?: string;
  transaction_state: string;
  source_events: string[];
  source_labels: string[];
  operations: string[];
  affected_files: string[];
  requires_review?: boolean;
  why_staged: string[];
  needs_context: boolean;
  likely_next_review_action: string;
}

export interface CaptureSourceLabelPreset {
  label: string;
  source_label: string;
}

export interface CaptureObservedAtShortcut {
  label: string;
  date: string;
}

export interface CaptureContextSuggestion {
  id: string;
  path: string;
  name: string;
  aliases: string[];
}

export interface CaptureTemplate {
  template_id: string;
  label: string;
  note: string;
  source_label: string;
}

export async function previewCaptureNote(
  root: string,
  note: string,
  options: CaptureNoteOptions = {}
): Promise<CapturePreviewResult> {
  return withPreviewRoot(root, async (previewRoot) => {
    const result = await runCapture(previewRoot, note, options, false);
    return result as CapturePreviewResult;
  });
}

export async function createCaptureNote(
  root: string,
  note: string,
  options: CaptureNoteOptions = {}
): Promise<CaptureCreateResult> {
  const result = await runCapture(root, note, options, true);
  return result as CaptureCreateResult;
}

async function runCapture(
  root: string,
  note: string,
  options: CaptureNoteOptions,
  created: boolean
): Promise<CaptureResult> {
  const rawNote = note.trim();

  if (!rawNote) {
    throw new Error("Capture note must not be empty.");
  }

  const ingest = await ingestWithExtractionProvider(root, rawNote, {
    ...options,
    raw_note: rawNote,
    apply: false
  });
  const validation = await validateTransaction(root, ingest.transaction);

  return captureResultFromIngest(ingest, {
    created,
    validation,
    contexts: contextsFromOption(options.context),
    sourceLabel: options.source_label,
    rawNote
  });
}

function captureResultFromIngest(
  ingest: ExtractionRunResult,
  input: {
    created: boolean;
    validation: ValidationResult;
    contexts: string[];
    sourceLabel?: string;
    rawNote: string;
  }
): CaptureResult {
  return {
    action: "capture_note",
    created: input.created,
    event_id: ingest.event_id,
    event_path: ingest.event_path,
    transaction_id: ingest.transaction_id,
    transaction_path: ingest.transaction_path,
    transaction_state: ingest.transaction.transaction_state,
    provider_name: ingest.provider_name,
    validation: input.validation,
    operations: ingest.transaction.operations.map((operation) => operation.operation),
    affected_files: ingest.transaction.affected_files,
    source_events: ingest.transaction.source_events,
    proposed_file_writes: ingest.transaction.proposed_file_writes,
    extracted_claim_ids: ingest.extracted_claim_ids,
    staged_review_paths: ingest.staged_review_paths,
    followup_paths: ingest.followup_paths,
    contexts: input.contexts,
    source_label: input.sourceLabel,
    event_raw_text: input.rawNote,
    ...captureGuidance({
      validation: input.validation,
      transaction: ingest.transaction,
      stagedReviewPaths: ingest.staged_review_paths,
      contexts: input.contexts
    }),
    transaction: ingest.transaction
  };
}

export async function buildCaptureInboxResult(
  root: string,
  options: CaptureInboxOptions = {}
): Promise<CaptureInboxResult> {
  const now = options.now ?? "2026-05-26T12:00:00.000Z";
  const recentLimit = options.recentLimit ?? 8;
  const warnings: string[] = [];
  const events = await collectCaptureInboxEvents(root, warnings);
  const eventById = new Map(events.map((event) => [event.event_id, event]));
  const pendingTransactions = await collectPendingCaptureTransactions(root, eventById, warnings);

  return {
    generated_at: now,
    recent_events: events.sort(newestEventFirst).slice(0, recentLimit),
    pending_capture_transactions: pendingTransactions.sort(oldestTransactionFirst).slice(0, recentLimit),
    source_label_presets: captureSourceLabelPresets(),
    observed_at_shortcuts: observedAtShortcuts(now),
    context_suggestions: (await collectContextSuggestions(root, warnings)).slice(0, recentLimit),
    capture_templates: captureTemplates(),
    warnings
  };
}

async function collectCaptureInboxEvents(root: string, warnings: string[]): Promise<CaptureInboxEvent[]> {
  const events: CaptureInboxEvent[] = [];

  for (const file of await listFilesOrEmpty(root, "memory/events/**/*.md")) {
    try {
      const parsed = parseMarkdownFile(await readMarkdownPage(root, file));

      if (parsed.frontmatter.type !== "event") {
        continue;
      }

      const id = stringValue(parsed.frontmatter.id);

      if (!id) {
        continue;
      }

      events.push({
        event_id: id,
        path: file,
        recorded_at: stringValue(parsed.frontmatter.recorded_at),
        observed_at: stringValue(parsed.frontmatter.observed_at),
        source_label: stringValue(parsed.frontmatter.source_label),
        contexts: stringArrayValue(parsed.frontmatter.contexts),
        participants: stringArrayValue(parsed.frontmatter.participants),
        topics: stringArrayValue(parsed.frontmatter.topics),
        derived_claims: stringArrayValue(parsed.frontmatter.derived_claims),
        raw_excerpt: compactExcerpt(getSection(parsed.body, "Raw text") ?? "")
      });
    } catch (error) {
      warnings.push(`Skipped malformed Event page: ${file} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  return events;
}

async function collectPendingCaptureTransactions(
  root: string,
  eventById: Map<string, CaptureInboxEvent>,
  warnings: string[]
): Promise<CaptureInboxTransaction[]> {
  const transactions: CaptureInboxTransaction[] = [];

  for (const file of await listFilesOrEmpty(root, "memory/transactions/pending/*.md")) {
    try {
      const transaction = parseTransactionMarkdown(await readMarkdownPage(root, file));

      if (transaction.transaction_state !== "pending" || transaction.source_events.length === 0) {
        continue;
      }

      const validation = await validateTransaction(root, transaction);
      const guidance = captureGuidance({
        validation,
        transaction,
        stagedReviewPaths: transaction.proposed_file_writes
          .map((write) => write.path)
          .filter((writePath) => writePath.startsWith("memory/review/")),
        contexts: transaction.source_events.flatMap((eventId) => eventById.get(eventId)?.contexts ?? [])
      });

      transactions.push({
        transaction_id: transaction.id,
        path: file,
        created_at: transaction.created_at,
        transaction_state: transaction.transaction_state,
        source_events: transaction.source_events,
        source_labels: [...new Set(transaction.source_events.map((eventId) => eventById.get(eventId)?.source_label).filter(Boolean))] as string[],
        operations: transaction.operations.map((operation) => operation.operation),
        affected_files: transaction.affected_files,
        requires_review: transaction.requires_review,
        ...guidance
      });
    } catch (error) {
      warnings.push(`Skipped malformed pending Transaction: ${file} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  return transactions;
}

async function collectContextSuggestions(root: string, warnings: string[]): Promise<CaptureContextSuggestion[]> {
  const contexts: CaptureContextSuggestion[] = [];

  for (const file of await listFilesOrEmpty(root, ["memory/contexts/*.md", "memory/contexts/**/*.md"])) {
    try {
      const parsed = parseMarkdownFile(await readMarkdownPage(root, file));

      if (parsed.frontmatter.type !== "context" || parsed.frontmatter.object_state === "archived") {
        continue;
      }

      const id = stringValue(parsed.frontmatter.id);

      if (!id) {
        continue;
      }

      contexts.push({
        id,
        path: file,
        name: markdownTitle(parsed.body) ?? titleFromPath(file),
        aliases: stringArrayValue(parsed.frontmatter.aliases)
      });
    } catch (error) {
      warnings.push(`Skipped malformed Context page: ${file} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  return contexts.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
}

function captureGuidance(input: {
  validation: ValidationResult;
  transaction: ParsedTransaction;
  stagedReviewPaths: string[];
  contexts: string[];
}): Pick<CaptureResult, "why_staged" | "needs_context" | "likely_next_review_action"> {
  const whyStaged: string[] = [];
  const operations = input.transaction.operations.map((operation) => operation.operation);
  const needsContext =
    input.contexts.length === 0 &&
    input.stagedReviewPaths.some((reviewPath) => reviewPath.includes("unscoped") || reviewPath.includes("scope"));

  if (input.stagedReviewPaths.length > 0 || input.transaction.requires_review) {
    whyStaged.push(
      `Review required for ${input.stagedReviewPaths.length || 1} staged proposal${input.stagedReviewPaths.length === 1 ? "" : "s"}.`
    );
  }

  if (needsContext) {
    whyStaged.push("A candidate claim needs an explicit Context before it can become active memory.");
  }

  if (!input.validation.passed) {
    whyStaged.push("Transaction validation must pass before application.");
  }

  if (operations.every((operation) => operation === "NOOP")) {
    whyStaged.push("No durable claims were extracted from this capture.");
  }

  if (whyStaged.length === 0) {
    whyStaged.push("Ready for explicit Transaction preview, apply, or reject.");
  }

  return {
    why_staged: whyStaged,
    needs_context: needsContext,
    likely_next_review_action: likelyNextReviewAction({
      validation: input.validation,
      operations,
      needsContext,
      stagedReviewPaths: input.stagedReviewPaths
    })
  };
}

function likelyNextReviewAction(input: {
  validation: ValidationResult;
  operations: string[];
  needsContext: boolean;
  stagedReviewPaths: string[];
}): string {
  if (!input.validation.passed) {
    return "Inspect validation errors before applying this Transaction.";
  }

  if (input.needsContext) {
    return "Open Review and choose an explicit Context before applying active claims.";
  }

  if (input.stagedReviewPaths.length > 0) {
    return "Open Review to resolve staged claims, then apply or reject the pending Transaction.";
  }

  if (input.operations.every((operation) => operation === "NOOP")) {
    return "No immediate apply action is needed unless you want to keep the NOOP Transaction decision.";
  }

  return "Preview the pending Transaction, then explicitly apply or reject it.";
}

function captureSourceLabelPresets(): CaptureSourceLabelPreset[] {
  return [
    { label: "Daily note", source_label: "daily note" },
    { label: "Meeting note", source_label: "meeting note" },
    { label: "Standup", source_label: "standup" },
    { label: "Slack/Chat", source_label: "chat note" },
    { label: "Correction", source_label: "correction" }
  ];
}

function observedAtShortcuts(now: string): CaptureObservedAtShortcut[] {
  return [
    { label: "Today", date: dateOffset(now, 0) },
    { label: "Yesterday", date: dateOffset(now, -1) },
    { label: "One week ago", date: dateOffset(now, -7) }
  ];
}

function captureTemplates(): CaptureTemplate[] {
  return [
    {
      template_id: "manager_team",
      label: "Manager or team",
      note: "Name is my manager. Name reports to Name.",
      source_label: "daily note"
    },
    {
      template_id: "project_update",
      label: "Project update",
      note: "In Context, Person owns Topic. I need to follow up on Action.",
      source_label: "project note"
    },
    {
      template_id: "correction",
      label: "Correction",
      note: "Correction: the earlier claim about Topic should be reviewed.",
      source_label: "correction"
    }
  ];
}

async function listFilesOrEmpty(root: string, globPattern: string | string[]): Promise<string[]> {
  const patterns = Array.isArray(globPattern) ? globPattern : [globPattern];
  const files = await Promise.all(
    patterns.map(async (pattern) => {
      try {
        return await listMarkdownFiles(root, pattern);
      } catch {
        return [];
      }
    })
  );

  return [...new Set(files.flat())].sort();
}

function compactExcerpt(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 240);
}

function markdownTitle(body: string): string | undefined {
  const title = body.split(/\r?\n/).find((line) => line.startsWith("# "));
  return title?.replace(/^#\s+/, "").trim() || undefined;
}

function titleFromPath(file: string): string {
  return path
    .basename(file, ".md")
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function dateOffset(now: string, offsetDays: number): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function newestEventFirst(left: CaptureInboxEvent, right: CaptureInboxEvent): number {
  return (
    (right.recorded_at ?? right.observed_at ?? "").localeCompare(left.recorded_at ?? left.observed_at ?? "") ||
    right.path.localeCompare(left.path)
  );
}

function oldestTransactionFirst(left: CaptureInboxTransaction, right: CaptureInboxTransaction): number {
  return (left.created_at ?? "").localeCompare(right.created_at ?? "") || left.path.localeCompare(right.path);
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function withPreviewRoot<T>(root: string, action: (previewRoot: string) => Promise<T>): Promise<T> {
  const previewRoot = await mkdtemp(path.join(os.tmpdir(), "assisto-capture-preview-"));

  try {
    await copyMemoryTree(root, previewRoot);
    return await action(previewRoot);
  } finally {
    await rm(previewRoot, { recursive: true, force: true });
  }
}

async function copyMemoryTree(root: string, previewRoot: string): Promise<void> {
  const source = path.join(root, "memory");
  const destination = path.join(previewRoot, "memory");

  try {
    await cp(source, destination, { recursive: true, verbatimSymlinks: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      await mkdir(destination, { recursive: true });
      return;
    }

    throw error;
  }
}
