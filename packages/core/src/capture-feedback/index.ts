import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeMarkdownPageAtomic } from "../fs";
import { serializeMarkdownFile, type Frontmatter } from "../markdown";
import {
  createTransactionDraft,
  serializeTransactionMarkdown,
  transactionFilePaths,
  validateTransaction,
  type ParsedTransaction,
  type TransactionFileWrite
} from "../transactions";
import { loadVaultIndex, type VaultIndex } from "../vault";
import type { ValidationResult } from "../validators";

export const CAPTURE_FEEDBACK_KINDS = [
  "wrong_person",
  "missing_context",
  "bad_followup",
  "bad_role_reporting",
  "other_extraction_issue"
] as const;

export type CaptureFeedbackKind = (typeof CAPTURE_FEEDBACK_KINDS)[number];

export interface CaptureFeedbackInput {
  kind: CaptureFeedbackKind | string;
  note: string;
  event?: string | null;
  transaction?: string | null;
  now?: string;
  source_actor?: string;
}

export interface ParsedCaptureFeedbackRawText {
  kind: CaptureFeedbackKind | string;
  linked_event?: string;
  linked_transaction?: string;
  note: string;
}

export interface CaptureFeedbackResult {
  action: "log_capture_feedback";
  created: boolean;
  kind: CaptureFeedbackKind;
  note: string;
  linked_event?: string;
  linked_transaction?: string;
  event_id: string;
  event_path: string;
  transaction_id: string;
  transaction_path: string;
  transaction_state: string;
  validation: ValidationResult;
  operations: string[];
  affected_files: string[];
  source_events: string[];
  proposed_file_writes: TransactionFileWrite[];
  source_label: string;
  event_raw_text: string;
  transaction: ParsedTransaction;
}

export type CaptureFeedbackPreviewResult = CaptureFeedbackResult & { created: false };
export type CaptureFeedbackCreateResult = CaptureFeedbackResult & { created: true };

const defaultNow = "2026-05-20T12:00:00-03:00";

export async function previewCaptureFeedback(
  root: string,
  input: CaptureFeedbackInput
): Promise<CaptureFeedbackPreviewResult> {
  return withPreviewRoot(root, async (previewRoot) => {
    const result = await runCaptureFeedback(previewRoot, input, false);
    return result as CaptureFeedbackPreviewResult;
  });
}

export async function createCaptureFeedback(
  root: string,
  input: CaptureFeedbackInput
): Promise<CaptureFeedbackCreateResult> {
  const result = await runCaptureFeedback(root, input, true);
  return result as CaptureFeedbackCreateResult;
}

export function parseCaptureFeedbackRawText(rawText: string): ParsedCaptureFeedbackRawText | null {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  const headerMatch = /^Capture feedback:\s*([a-z_]+)\s*$/im.exec(normalized);

  if (!headerMatch) {
    return null;
  }

  return {
    kind: headerMatch[1] ?? "",
    linked_event: rawTextBlock(normalized, "Linked Event"),
    linked_transaction: rawTextBlock(normalized, "Linked Transaction"),
    note: rawTextBlock(normalized, "Note") ?? ""
  };
}

async function runCaptureFeedback(
  root: string,
  input: CaptureFeedbackInput,
  created: boolean
): Promise<CaptureFeedbackResult> {
  const kind = normalizeCaptureFeedbackKind(input.kind);
  const note = input.note.trim();
  const linkedEvent = input.event?.trim() || undefined;
  const linkedTransaction = input.transaction?.trim() || undefined;

  if (!note) {
    throw new Error("Capture feedback note must not be empty.");
  }

  const now = input.now ?? defaultNow;
  const datePart = now.slice(0, 10);
  const dateIdPart = datePart.replace(/-/g, "_");
  const index = await loadIndexOrEmpty(root);
  const sequence = nextSequence(dateIdPart, index);
  const eventId = `ev_${dateIdPart}_${sequence}`;
  const transactionId = `tx_${dateIdPart}_${sequence}`;
  const eventPath = `memory/events/${datePart.slice(0, 4)}/${datePart.slice(0, 7)}/${datePart}-${sequence}.md`;
  const transactionPath = transactionFilePaths.pending(transactionId);
  const sourceLabel = `capture_feedback:${kind}`;
  const rawText = renderCaptureFeedbackRawText({ kind, linkedEvent, linkedTransaction, note });
  const eventMarkdown = renderCaptureFeedbackEventMarkdown({
    eventId,
    transactionId,
    now,
    rawText,
    sourceActor: input.source_actor ?? "user",
    sourceLabel
  });

  await writeMarkdownPageAtomic(root, eventPath, eventMarkdown);

  const transaction = createTransactionDraft({
    id: transactionId,
    created_at: now,
    source_events: [eventId],
    operations: [
      {
        operation: "NOOP",
        description: "Record capture/extraction feedback as Event evidence only; no canonical memory mutation is proposed."
      }
    ],
    affected_files: [stripMemoryPrefix(eventPath)],
    risk_level: "low",
    requires_review: false,
    rollback_notes:
      "Preserve the source Event. This capture feedback does not propose canonical page writes; reject or archive the pending Transaction if the feedback was captured accidentally.",
    intent: "Log user feedback about capture or extraction quality as source Event evidence without changing canonical memory pages.",
    proposed_file_writes: []
  });

  await writeMarkdownPageAtomic(root, transactionPath, serializeTransactionMarkdown(transaction));
  const validation = await validateTransaction(root, transaction);

  return {
    action: "log_capture_feedback",
    created,
    kind,
    note,
    linked_event: linkedEvent,
    linked_transaction: linkedTransaction,
    event_id: eventId,
    event_path: eventPath,
    transaction_id: transactionId,
    transaction_path: transactionPath,
    transaction_state: transaction.transaction_state,
    validation,
    operations: transaction.operations.map((operation) => operation.operation),
    affected_files: transaction.affected_files,
    source_events: transaction.source_events,
    proposed_file_writes: transaction.proposed_file_writes,
    source_label: sourceLabel,
    event_raw_text: rawText,
    transaction
  };
}

function normalizeCaptureFeedbackKind(value: string): CaptureFeedbackKind {
  if (CAPTURE_FEEDBACK_KINDS.includes(value as CaptureFeedbackKind)) {
    return value as CaptureFeedbackKind;
  }

  throw new Error(`Unsupported capture feedback kind: ${value}`);
}

function renderCaptureFeedbackRawText(input: {
  kind: CaptureFeedbackKind;
  linkedEvent?: string;
  linkedTransaction?: string;
  note: string;
}): string {
  const lines = [`Capture feedback: ${input.kind}`, ""];

  if (input.linkedEvent) {
    lines.push("Linked Event:", input.linkedEvent, "");
  }

  if (input.linkedTransaction) {
    lines.push("Linked Transaction:", input.linkedTransaction, "");
  }

  lines.push("Note:", input.note);

  return lines.join("\n");
}

function renderCaptureFeedbackEventMarkdown(input: {
  eventId: string;
  transactionId: string;
  now: string;
  rawText: string;
  sourceActor: string;
  sourceLabel: string;
}): string {
  const frontmatter: Frontmatter = {
    id: input.eventId,
    type: "event",
    object_state: "active",
    review_state: "reviewed",
    recorded_at: input.now,
    observed_at: null,
    source_type: "user_note",
    source_actor: input.sourceActor,
    source_label: input.sourceLabel,
    participants: [],
    topics: [],
    contexts: [],
    derived_claims: [],
    transactions: [input.transactionId]
  };
  const body = [
    `# Event ${input.eventId}`,
    "",
    "## Raw text",
    "",
    input.rawText,
    "",
    "## Candidate extraction",
    "",
    "- No durable claim candidates extracted."
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

async function withPreviewRoot<T>(root: string, action: (previewRoot: string) => Promise<T>): Promise<T> {
  const previewRoot = await mkdtemp(path.join(os.tmpdir(), "assisto-capture-feedback-preview-"));

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

function nextSequence(dateIdPart: string, index: VaultIndex): string {
  const used = new Set<number>();
  const prefix = `ev_${dateIdPart}_`;

  for (const id of index.eventIds) {
    if (!id.startsWith(prefix)) {
      continue;
    }

    const value = Number(id.slice(prefix.length));

    if (Number.isInteger(value) && value > 0) {
      used.add(value);
    }
  }

  let next = 1;

  while (used.has(next)) {
    next += 1;
  }

  return String(next).padStart(3, "0");
}

function rawTextBlock(rawText: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escaped}:\\n([\\s\\S]*?)(?=\\n[A-Z][A-Za-z ]*:\\n|$)`, "m").exec(rawText);
  return match?.[1]?.trim();
}

function stripMemoryPrefix(filePath: string): string {
  return filePath.startsWith("memory/") ? filePath.slice("memory/".length) : filePath;
}
