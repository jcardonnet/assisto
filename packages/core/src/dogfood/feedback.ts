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

export const DOGFOOD_FEEDBACK_KINDS = [
  "retrieval_miss",
  "bad_answer",
  "wrong_extraction",
  "missing_context",
  "other"
] as const;

export type DogfoodFeedbackKind = (typeof DOGFOOD_FEEDBACK_KINDS)[number];

export interface DogfoodFeedbackInput {
  kind: DogfoodFeedbackKind | string;
  note: string;
  question?: string | null;
  now?: string;
  source_actor?: string;
}

export interface ParsedDogfoodFeedbackRawText {
  kind: DogfoodFeedbackKind | string;
  question?: string;
  note: string;
}

export interface DogfoodFeedbackPurePreview {
  event: {
    type: "Event";
    source_label: string;
    raw_text: string;
  };
  transaction: {
    state: "pending";
    operations: Array<{ op: "NOOP"; note: string }>;
  };
  canonical_writes: [];
}

export interface DogfoodFeedbackResult {
  action: "log_dogfood_feedback";
  created: boolean;
  kind: DogfoodFeedbackKind;
  note: string;
  question?: string;
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
  canonical_writes: [];
  source_label: string;
  event_raw_text: string;
  transaction: ParsedTransaction;
}

export type DogfoodFeedbackPreviewResult = DogfoodFeedbackResult & { created: false };
export type DogfoodFeedbackCreateResult = DogfoodFeedbackResult & { created: true };

const defaultNow = "2026-05-20T12:00:00-03:00";

export function previewDogfoodFeedback(input: DogfoodFeedbackInput): DogfoodFeedbackPurePreview {
  const kind = normalizeDogfoodFeedbackKind(input.kind);
  const note = input.note.trim();
  const question = input.question?.trim() || undefined;

  if (!note) {
    throw new Error("Dogfood feedback note must not be empty.");
  }

  return {
    event: {
      type: "Event",
      source_label: `dogfood:${kind}`,
      raw_text: renderDogfoodFeedbackRawText({ kind, question, note })
    },
    transaction: {
      state: "pending",
      operations: [{ op: "NOOP", note: "Dogfood feedback recorded for review." }]
    },
    canonical_writes: []
  };
}

export async function previewDogfoodFeedbackTransaction(
  root: string,
  input: DogfoodFeedbackInput
): Promise<DogfoodFeedbackPreviewResult> {
  return withPreviewRoot(root, async (previewRoot) => {
    const result = await runDogfoodFeedback(previewRoot, input, false);
    return result as DogfoodFeedbackPreviewResult;
  });
}

export async function createDogfoodFeedback(
  root: string,
  input: DogfoodFeedbackInput
): Promise<DogfoodFeedbackCreateResult> {
  const result = await runDogfoodFeedback(root, input, true);
  return result as DogfoodFeedbackCreateResult;
}

export function parseDogfoodFeedbackRawText(rawText: string): ParsedDogfoodFeedbackRawText | null {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  const headerMatch = /^Dogfood feedback:\s*([a-z_]+)\s*$/im.exec(normalized);

  if (!headerMatch) {
    return null;
  }

  return {
    kind: headerMatch[1] ?? "",
    question: rawTextBlock(normalized, "Question"),
    note: rawTextBlock(normalized, "Note") ?? ""
  };
}

async function runDogfoodFeedback(
  root: string,
  input: DogfoodFeedbackInput,
  created: boolean
): Promise<DogfoodFeedbackResult> {
  const kind = normalizeDogfoodFeedbackKind(input.kind);
  const note = input.note.trim();
  const question = input.question?.trim() || undefined;

  if (!note) {
    throw new Error("Dogfood feedback note must not be empty.");
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
  const sourceLabel = `dogfood:${kind}`;
  const rawText = renderDogfoodFeedbackRawText({ kind, question, note });
  const eventMarkdown = renderDogfoodFeedbackEventMarkdown({
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
        description: "Record dogfood feedback as Event evidence only; no canonical memory mutation is proposed."
      }
    ],
    affected_files: [stripMemoryPrefix(eventPath)],
    risk_level: "low",
    requires_review: false,
    rollback_notes:
      "Preserve the source Event. This dogfood feedback does not propose canonical page writes; reject or archive the pending Transaction if the feedback was captured accidentally.",
    intent: "Log user dogfood feedback as source Event evidence without changing canonical memory pages.",
    proposed_file_writes: []
  });

  await writeMarkdownPageAtomic(root, transactionPath, serializeTransactionMarkdown(transaction));
  const validation = await validateTransaction(root, transaction);

  return {
    action: "log_dogfood_feedback",
    created,
    kind,
    note,
    question,
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
    canonical_writes: [],
    source_label: sourceLabel,
    event_raw_text: rawText,
    transaction
  };
}

function normalizeDogfoodFeedbackKind(value: string): DogfoodFeedbackKind {
  if (DOGFOOD_FEEDBACK_KINDS.includes(value as DogfoodFeedbackKind)) {
    return value as DogfoodFeedbackKind;
  }

  throw new Error(`Unsupported dogfood feedback kind: ${value}`);
}

function renderDogfoodFeedbackRawText(input: {
  kind: DogfoodFeedbackKind;
  question?: string;
  note: string;
}): string {
  const lines = [`Dogfood feedback: ${input.kind}`, ""];

  if (input.question) {
    lines.push("Question:", input.question, "");
  }

  lines.push("Note:", input.note);

  return lines.join("\n");
}

function renderDogfoodFeedbackEventMarkdown(input: {
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
  const previewRoot = await mkdtemp(path.join(os.tmpdir(), "assisto-dogfood-feedback-preview-"));

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

  for (const id of [...index.eventIds, ...index.transactionIds]) {
    const match = new RegExp(`^(?:ev|tx)_${dateIdPart}_(\\d{3})$`).exec(id);

    if (match?.[1]) {
      used.add(Number.parseInt(match[1], 10));
    }
  }

  let next = 1;

  while (used.has(next)) {
    next += 1;
  }

  return String(next).padStart(3, "0");
}

function stripMemoryPrefix(filePath: string): string {
  return filePath.startsWith("memory/") ? filePath.slice("memory/".length) : filePath;
}

function rawTextBlock(rawText: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escaped}:\\n([\\s\\S]*?)(?=\\n[A-Z][A-Za-z ]*:\\n|$)`, "m").exec(rawText);
  return match?.[1]?.trim();
}
