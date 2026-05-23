import {
  parseMarkdownFile,
  serializeMarkdownFile,
  type Frontmatter,
  type FrontmatterValue,
  type ParsedMarkdownFile
} from "../markdown";
import { listMarkdownFiles, readMarkdownPage, writeMarkdownPageAtomic } from "../fs";
import {
  createTransactionDraft,
  serializeTransactionMarkdown,
  transactionFilePaths,
  validateTransaction,
  type ParsedTransaction
} from "../transactions";
import { loadVaultIndex, type VaultIndex } from "../vault";

export type ReviewActionState = "reviewed" | "contested" | "archived";

export interface ReviewItemSummary {
  id: string;
  path: string;
  review_reason: string;
  review_state: string;
  object_state: string;
}

export interface ReviewItemDetail extends ReviewItemSummary {
  content: string;
  parsed: ParsedMarkdownFile;
}

export interface CreateReviewStateTransactionOptions {
  now?: string;
  note?: string;
}

export interface ReviewStateTransactionResult {
  transaction_id: string;
  transaction_path: string;
  transaction: ParsedTransaction;
  review_path: string;
  review_id: string;
}

const defaultNow = "2026-05-21T12:00:00-03:00";

export async function listReviewItems(root: string, includeAll = false): Promise<ReviewItemSummary[]> {
  const files = await listReviewFiles(root);
  const items: ReviewItemSummary[] = [];

  for (const file of files) {
    const parsed = parseMarkdownFile(await readMarkdownPage(root, file));

    if (parsed.frontmatter.type !== "review_item") {
      continue;
    }

    const summary = toReviewSummary(file, parsed.frontmatter);

    if (includeAll || summary.review_state === "staged") {
      items.push(summary);
    }
  }

  return items.sort((left, right) => left.path.localeCompare(right.path));
}

export async function showReviewItem(root: string, idOrPath: string): Promise<ReviewItemDetail> {
  const found = await findReviewItem(root, idOrPath);

  if (!found) {
    throw new Error(`Review item not found: ${idOrPath}`);
  }

  return found;
}

export async function createReviewStateTransaction(
  root: string,
  idOrPath: string,
  state: ReviewActionState,
  options: CreateReviewStateTransactionOptions = {}
): Promise<ReviewStateTransactionResult> {
  const now = options.now ?? defaultNow;
  const found = await showReviewItem(root, idOrPath);
  const index = await loadIndexOrEmpty(root);
  const dateIdPart = now.slice(0, 10).replace(/-/g, "_");
  const transactionId = `tx_${dateIdPart}_${nextSequence(dateIdPart, index)}`;
  const nextFrontmatter: Frontmatter = {
    ...found.parsed.frontmatter,
    object_state: state === "archived" ? "archived" : "active",
    review_state: state === "archived" ? "reviewed" : state
  };
  const nextBody = appendReviewNote(found.parsed.body, now, state, options.note);
  const content = serializeMarkdownFile(nextFrontmatter, nextBody);
  const transaction = createTransactionDraft({
    id: transactionId,
    created_at: now,
    source_events: stringArrayValue(found.parsed.frontmatter.source_events),
    operations: [{ operation: "STAGE_REVIEW", description: `update ${stripMemoryPrefix(found.path)}` }],
    affected_files: [stripMemoryPrefix(found.path)],
    risk_level: "low",
    requires_review: false,
    rollback_notes: "If this review-state update is wrong, create another review transaction with the desired state.",
    intent: `Mark review item ${found.id} as ${state}.`,
    proposed_file_writes: [{ path: found.path, content }]
  });
  const validation = await validateTransaction(root, transaction);

  if (!validation.passed) {
    throw new Error(
      `Review transaction validation failed: ${validation.errors.map((error) => error.code).join(", ")}`
    );
  }

  await writeMarkdownPageAtomic(root, transactionFilePaths.pending(transactionId), serializeTransactionMarkdown(transaction));

  return {
    transaction_id: transactionId,
    transaction_path: transactionFilePaths.pending(transactionId),
    transaction,
    review_path: found.path,
    review_id: found.id
  };
}

async function findReviewItem(root: string, idOrPath: string): Promise<ReviewItemDetail | null> {
  const normalized = normalizeReviewPath(idOrPath);
  const files = await listReviewFiles(root);

  for (const file of files) {
    if (normalizePath(file) !== normalized && stripMemoryPrefix(file) !== stripMemoryPrefix(normalized)) {
      continue;
    }

    return loadReviewItem(root, file);
  }

  for (const file of files) {
    const item = await loadReviewItem(root, file);

    if (item.id === idOrPath) {
      return item;
    }
  }

  return null;
}

async function loadReviewItem(root: string, path: string): Promise<ReviewItemDetail> {
  const content = await readMarkdownPage(root, path);
  const parsed = parseMarkdownFile(content);
  const summary = toReviewSummary(path, parsed.frontmatter);

  return {
    ...summary,
    content,
    parsed
  };
}

async function listReviewFiles(root: string): Promise<string[]> {
  try {
    return await listMarkdownFiles(root, "memory/review/*.md");
  } catch {
    return [];
  }
}

function toReviewSummary(path: string, frontmatter: Frontmatter): ReviewItemSummary {
  return {
    id: stringValue(frontmatter.id) ?? path,
    path,
    review_reason: stringValue(frontmatter.review_reason) ?? "review",
    review_state: stringValue(frontmatter.review_state) ?? "none",
    object_state: stringValue(frontmatter.object_state) ?? "active"
  };
}

function appendReviewNote(body: string, now: string, state: ReviewActionState, note: string | undefined): string {
  const line = note?.trim() ? `- ${now}: marked ${state}. ${note.trim()}` : `- ${now}: marked ${state}.`;

  if (/^## Review notes\s*$/im.test(body)) {
    return `${body.trimEnd()}\n${line}\n`;
  }

  return `${body.trimEnd()}\n\n## Review notes\n\n${line}\n`;
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
  const used = [...index.transactionIds]
    .map((id) => new RegExp(`^tx_${dateIdPart}_(\\d{3})$`).exec(id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10));
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;

  return String(next).padStart(3, "0");
}

function normalizeReviewPath(value: string): string {
  const normalized = normalizePath(value);

  if (normalized.startsWith("memory/review/")) {
    return normalized;
  }

  if (normalized.startsWith("review/")) {
    return `memory/${normalized}`;
  }

  if (normalized.endsWith(".md")) {
    return `memory/review/${normalized.split("/").pop() ?? normalized}`;
  }

  return normalized;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").trim();
}

function stripMemoryPrefix(path: string): string {
  return normalizePath(path).replace(/^memory\//, "");
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
