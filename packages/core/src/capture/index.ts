import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ingestWithExtractionProvider, type ExtractionProvider, type ExtractionRunResult } from "../extraction";
import { contextsFromOption } from "../ingest/metadata";
import { validateTransaction, type ParsedTransaction, type TransactionFileWrite } from "../transactions";
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
  transaction: ParsedTransaction;
}

export type CapturePreviewResult = CaptureResult & { created: false };
export type CaptureCreateResult = CaptureResult & { created: true };

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
    transaction: ingest.transaction
  };
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
