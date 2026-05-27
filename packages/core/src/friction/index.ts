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

export const FRICTION_LOG_KINDS = [
  "retrieval_miss",
  "bad_answer",
  "review_confusing",
  "capture_wrong"
] as const;

export type FrictionLogKind = (typeof FRICTION_LOG_KINDS)[number];

export interface FrictionLogInput {
  kind: FrictionLogKind | string;
  note: string;
  question?: string | null;
  now?: string;
  source_actor?: string;
}

export interface ParsedFrictionRawText {
  kind: FrictionLogKind | string;
  question?: string;
  note: string;
}

export interface FrictionLogResult {
  action: "log_friction";
  created: boolean;
  kind: FrictionLogKind;
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
  source_label: string;
  event_raw_text: string;
  transaction: ParsedTransaction;
}

export type FrictionLogPreviewResult = FrictionLogResult & { created: false };
export type FrictionLogCreateResult = FrictionLogResult & { created: true };

const defaultNow = "2026-05-20T12:00:00-03:00";

export async function previewFrictionLog(
  root: string,
  input: FrictionLogInput
): Promise<FrictionLogPreviewResult> {
  return withPreviewRoot(root, async (previewRoot) => {
    const result = await runFrictionLog(previewRoot, input, false);
    return result as FrictionLogPreviewResult;
  });
}

export async function createFrictionLog(
  root: string,
  input: FrictionLogInput
): Promise<FrictionLogCreateResult> {
  const result = await runFrictionLog(root, input, true);
  return result as FrictionLogCreateResult;
}

export function parseFrictionRawText(rawText: string): ParsedFrictionRawText | null {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  const headerMatch = /^Friction log:\s*([a-z_]+)\s*$/im.exec(normalized);

  if (!headerMatch) {
    return null;
  }

  return {
    kind: headerMatch[1] ?? "",
    question: rawTextBlock(normalized, "Question"),
    note: rawTextBlock(normalized, "Note") ?? ""
  };
}

async function runFrictionLog(
  root: string,
  input: FrictionLogInput,
  created: boolean
): Promise<FrictionLogResult> {
  const kind = normalizeFrictionKind(input.kind);
  const note = input.note.trim();
  const question = input.question?.trim() || undefined;

  if (!note) {
    throw new Error("Friction log note must not be empty.");
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
  const sourceLabel = `friction:${kind}`;
  const rawText = renderFrictionRawText({ kind, question, note });
  const eventMarkdown = renderFrictionEventMarkdown({
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
        description: "Record user feedback as Event evidence only; no canonical memory mutation is proposed."
      }
    ],
    affected_files: [stripMemoryPrefix(eventPath)],
    risk_level: "low",
    requires_review: false,
    rollback_notes:
      "Preserve the source Event. This friction log does not propose canonical page writes; reject or archive the pending Transaction if the feedback was captured accidentally.",
    intent: "Log user feedback about Assisto behavior as source Event evidence without changing canonical memory pages.",
    proposed_file_writes: []
  });

  await writeMarkdownPageAtomic(root, transactionPath, serializeTransactionMarkdown(transaction));
  const validation = await validateTransaction(root, transaction);

  return {
    action: "log_friction",
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
    source_label: sourceLabel,
    event_raw_text: rawText,
    transaction
  };
}

function normalizeFrictionKind(value: string): FrictionLogKind {
  if (FRICTION_LOG_KINDS.includes(value as FrictionLogKind)) {
    return value as FrictionLogKind;
  }

  throw new Error(`Unsupported friction kind: ${value}`);
}

function renderFrictionRawText(input: {
  kind: FrictionLogKind;
  question?: string;
  note: string;
}): string {
  const lines = [`Friction log: ${input.kind}`, ""];

  if (input.question) {
    lines.push("Question:", input.question, "");
  }

  lines.push("Note:", input.note);

  return lines.join("\n");
}

function renderFrictionEventMarkdown(input: {
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
  const previewRoot = await mkdtemp(path.join(os.tmpdir(), "assisto-friction-preview-"));

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
  const used = [...index.eventIds, ...index.transactionIds]
    .map((id) => new RegExp(`^(?:ev|tx)_${dateIdPart}_(\\d{3})$`).exec(id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10));
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;

  return String(next).padStart(3, "0");
}

function stripMemoryPrefix(filePath: string): string {
  return filePath.replace(/^memory\//, "");
}

function rawTextBlock(rawText: string, label: "Question" | "Note"): string | undefined {
  const pattern = new RegExp(`(?:^|\\n)${label}:\\n([\\s\\S]*?)(?=\\n\\n(?:Question|Note):|$)`);
  const value = pattern.exec(rawText)?.[1]?.trim();

  return value || undefined;
}
