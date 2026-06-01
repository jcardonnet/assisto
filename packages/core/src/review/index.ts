import {
  parseClaimBlocks,
  parseMarkdownFile,
  replaceSection,
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
import type { ClaimBlock } from "../model";
import { mergeProposedWritesWithExistingPages, renderClaimPageBody } from "../ingest/page-upsert";
import { slugify } from "../ingest/candidates";

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

export interface CreateReviewApplyTransactionOptions {
  target: string;
  context?: string;
  createContext?: string;
  supersede?: string;
  now?: string;
  note?: string;
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

export async function createReviewApplyTransaction(
  root: string,
  idOrPath: string,
  options: CreateReviewApplyTransactionOptions
): Promise<ReviewStateTransactionResult> {
  const now = options.now ?? defaultNow;
  const found = await showReviewItem(root, idOrPath);
  const index = await loadIndexOrEmpty(root);
  const stagedClaim = parseClaimBlocks(found.parsed.body)[0];

  if (!stagedClaim) {
    throw new Error(`Review item has no staged claim block: ${idOrPath}`);
  }

  if (options.context && options.createContext) {
    throw new Error("Use either --context or --create-context, not both.");
  }

  const contextResolution = options.createContext
    ? createContextResolution(options.createContext, index)
    : options.context
      ? resolveExistingContext(index, options.context)
      : null;
  const claim = applyReviewClaimResolution(stagedClaim, contextResolution?.id ?? null);

  if (claim.scope_state === "unknown") {
    throw new Error("Applying an unknown-scope claim requires --context or --create-context.");
  }

  const target = resolveTarget(index, options.target, claim);
  const targetWrite = renderTargetWrite(target, claim, now);
  const contextWrite = contextResolution?.write
    ? {
        path: contextResolution.write.path,
        content: renderContextPage(contextResolution.id, contextResolution.name, now, claim.evidence)
      }
    : null;
  const nextReviewFrontmatter: Frontmatter = {
    ...found.parsed.frontmatter,
    object_state: "active",
    review_state: "reviewed"
  };
  const reviewWrite = {
    path: found.path,
    content: serializeMarkdownFile(
      nextReviewFrontmatter,
      appendReviewNote(removeStagedClaimBlocks(found.parsed.body, claim.claim_id), now, "reviewed", options.note)
    )
  };
  const mergedTargetWrites = await mergeProposedWritesWithExistingPages(root, [targetWrite], {
    supersedeClaimIds: options.supersede ? [options.supersede] : []
  });
  const writes = [...(contextWrite ? [contextWrite] : []), ...mergedTargetWrites, reviewWrite];
  const dateIdPart = now.slice(0, 10).replace(/-/g, "_");
  const transactionId = `tx_${dateIdPart}_${nextSequence(dateIdPart, index)}`;
  const operations = [
    ...(options.supersede
      ? [{ operation: "SUPERSEDE_CLAIM" as const, description: `supersede ${options.supersede}` }]
      : []),
    { operation: "UPSERT_CLAIM" as const, description: `apply staged claim ${claim.claim_id}` },
    { operation: "STAGE_REVIEW" as const, description: `mark ${stripMemoryPrefix(found.path)} reviewed` }
  ];
  const transaction = createTransactionDraft({
    id: transactionId,
    created_at: now,
    source_events: claim.evidence,
    operations,
    affected_files: writes.map((write) => stripMemoryPrefix(write.path)),
    risk_level: options.supersede ? "medium" : "low",
    requires_review: false,
    rollback_notes:
      "If this reviewed application is wrong, create a new review transaction that stages the corrected claim or supersedes the applied claim.",
    intent: `Apply staged review item ${found.id} to ${stripMemoryPrefix(target.path)}.`,
    proposed_file_writes: writes
  });
  const validation = await validateTransaction(root, transaction);

  if (!validation.passed) {
    throw new Error(
      `Review apply transaction validation failed: ${validation.errors.map((error) => error.code).join(", ")}`
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

function removeStagedClaimBlocks(body: string, claimId: string): string {
  return replaceSection(body, "Staged claims", `Applied claim: ${claimId}`);
}

function applyReviewClaimResolution(claim: ClaimBlock, contextId: string | null): ClaimBlock {
  if (!contextId) {
    return {
      ...claim,
      claim_state: "active"
    };
  }

  return {
    ...claim,
    claim_state: "active",
    scope: contextId,
    scope_state: "complete"
  };
}

function createContextResolution(name: string, index: VaultIndex): { id: string; name: string; write: { path: string } } {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  const slug = slugify(normalizedName);

  if (!slug) {
    throw new Error("--create-context requires a non-empty context name.");
  }

  const id = `ctx_${slug.replace(/-/g, "_")}`;
  const path = `memory/contexts/${slug}.md`;

  if (index.ids.has(id) || index.paths.has(path) || index.entries.some((entry) => entry.id === id || entry.path === path)) {
    throw new Error(`Context already exists; use --context ${id} instead.`);
  }

  return {
    id,
    name: normalizedName,
    write: {
      path
    }
  };
}

function resolveExistingContext(index: VaultIndex, idOrPath: string): { id: string; name: string; write: null } {
  const normalized = normalizePath(idOrPath);
  const path = index.ids.get(idOrPath) ?? (normalized.startsWith("memory/") ? normalized : `memory/${normalized}`);
  const entry = index.entries.find((candidate) => candidate.path === path || candidate.id === idOrPath);

  if (!entry?.id || entry.type !== "context") {
    throw new Error(`Context not found: ${idOrPath}`);
  }

  return {
    id: entry.id,
    name: titleFromPath(entry.path),
    write: null
  };
}

function resolveTarget(
  index: VaultIndex,
  target: string,
  claim: ClaimBlock
): { path: string; id: string; type: "person" | "topic"; title: string } {
  const normalized = normalizePath(target);
  const path = index.ids.get(target) ?? (normalized.startsWith("memory/") ? normalized : `memory/${normalized}`);
  const type = targetTypeFromPath(path);
  const slug = path.split("/").pop()?.replace(/\.md$/i, "") ?? slugify(claim.claim_id);
  const existing = index.entries.find((entry) => entry.path === path);

  if (!path.endsWith(".md")) {
    throw new Error("Review apply target must end with .md.");
  }

  if (!type) {
    throw new Error("Review apply target must be a Person or Topic markdown page.");
  }

  if (existing?.type && existing.type !== type) {
    throw new Error("Review apply target must match an existing Person or Topic page.");
  }

  return {
    path,
    id: existing?.id ?? `${type === "person" ? "per" : "top"}_${slug.replace(/-/g, "_")}`,
    type,
    title: `# ${titleFromPath(path)}`
  };
}

function targetTypeFromPath(path: string): "person" | "topic" | null {
  if (path.startsWith("memory/people/")) {
    return "person";
  }

  if (path.startsWith("memory/topics/")) {
    return "topic";
  }

  return null;
}

function renderTargetWrite(
  target: { path: string; id: string; type: "person" | "topic"; title: string },
  claim: ClaimBlock,
  now: string
): { path: string; content: string } {
  const frontmatter: Frontmatter = {
    id: target.id,
    type: target.type,
    object_state: "active",
    review_state: "reviewed",
    created_at: now,
    updated_at: now,
    aliases: [],
    source_events: claim.evidence,
    related: [],
    summary_generated_from: [claim.claim_id]
  };

  return {
    path: target.path,
    content: serializeMarkdownFile(frontmatter, renderClaimPageBody(target.title, claim.statement, [claim]))
  };
}

function renderContextPage(id: string, name: string, now: string, sourceEvents: string[]): string {
  const frontmatter: Frontmatter = {
    id,
    type: "context",
    object_state: "active",
    review_state: "reviewed",
    created_at: now,
    updated_at: now,
    aliases: [],
    source_events: sourceEvents,
    related: []
  };
  const body = `# ${name}`;

  return serializeMarkdownFile(frontmatter, body);
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

function titleFromPath(value: string): string {
  return (
    normalizePath(value)
      .split("/")
      .pop()
      ?.replace(/\.md$/i, "")
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") ?? "Memory Page"
  );
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

export * from "./acceleration";
