import { listMarkdownFiles, readMarkdownPage, writeMarkdownPageAtomic } from "../fs";
import {
  parseClaimBlockRecords,
  parseMarkdownFile,
  serializeMarkdownFile,
  type Frontmatter,
  type FrontmatterValue,
  type ParsedClaimBlockRecord
} from "../markdown";
import { retrieveContextForAnswer } from "../retrieval";
import {
  createTransactionDraft,
  serializeTransactionMarkdown,
  transactionFilePaths,
  validateTransaction,
  type ParsedTransaction
} from "../transactions";
import { loadVaultIndex } from "../vault";

export type MemoryHealthFindingCode =
  | "staged_review_item"
  | "stale_noop_event"
  | "pending_transaction"
  | "contested_claim"
  | "superseded_claim"
  | "orphan_page"
  | "missing_source_event"
  | "retrieval_no_match_hotspot";

export type MemoryHealthSeverity = "low" | "medium" | "high";

export interface MemoryHealthFinding {
  code: MemoryHealthFindingCode;
  severity: MemoryHealthSeverity;
  message: string;
  affected_files: string[];
  source_events: string[];
  evidence: string[];
  suggested_action: string;
}

export interface MemoryHealthResult {
  generated_at: string;
  counts: {
    staged_review_items: number;
    pending_transactions: number;
    stale_noop_events: number;
    contested_claims: number;
    superseded_claims: number;
    orphan_pages: number;
    pages_missing_source_events: number;
    retrieval_no_match_hotspots: number;
  };
  review_reasons: Array<{ review_reason: string; count: number }>;
  findings: MemoryHealthFinding[];
  affected_files: string[];
  source_events: string[];
  suggested_actions: string[];
  warnings: string[];
}

export interface CheckMemoryHealthOptions {
  now?: string;
  retrievalNoMatchQueries?: string[];
}

export interface CreateHealthReviewTransactionOptions {
  now?: string;
  note?: string;
}

export interface HealthReviewTransactionResult {
  transaction_id: string;
  transaction_path: string;
  transaction: ParsedTransaction;
  review_paths: string[];
}

interface HealthPage {
  path: string;
  frontmatter: Frontmatter;
  body: string;
  claims: ParsedClaimBlockRecord[];
}

interface HealthPageLoadResult {
  pages: HealthPage[];
  warnings: string[];
}

const defaultNow = "2026-05-26T12:00:00.000Z";
const canonicalPageTypes = new Set(["person", "context", "topic"]);

export async function checkMemoryHealth(
  root: string,
  options: CheckMemoryHealthOptions = {}
): Promise<MemoryHealthResult> {
  const now = options.now ?? defaultNow;
  const { pages, warnings } = await loadHealthPages(root);
  const eventIds = new Set(pages.filter((page) => page.frontmatter.type === "event").map((page) => pageId(page)));
  const findings: MemoryHealthFinding[] = [];

  findings.push(...reviewItemFindings(pages));
  findings.push(...transactionFindings(pages));
  findings.push(...claimStateFindings(pages));
  findings.push(...orphanPageFindings(pages));
  findings.push(...missingSourceEventFindings(pages, eventIds));
  findings.push(...(await retrievalNoMatchFindings(root, options.retrievalNoMatchQueries ?? [], warnings)));

  return {
    generated_at: now,
    counts: summarizeCounts(findings),
    review_reasons: reviewReasonGroups(pages),
    findings,
    affected_files: uniqueSorted(findings.flatMap((finding) => finding.affected_files)),
    source_events: uniqueSorted(findings.flatMap((finding) => finding.source_events)),
    suggested_actions: uniqueSorted(findings.map((finding) => finding.suggested_action)),
    warnings
  };
}

export async function createHealthReviewTransaction(
  root: string,
  health: MemoryHealthResult,
  options: CreateHealthReviewTransactionOptions = {}
): Promise<HealthReviewTransactionResult> {
  if (health.findings.length === 0) {
    throw new Error("No health findings are available to stage.");
  }

  const now = options.now ?? defaultNow;
  const index = await loadVaultIndex(root);
  const dateIdPart = now.slice(0, 10).replace(/-/g, "_");
  const transactionId = `tx_${dateIdPart}_${nextSequence(dateIdPart, index.transactionIds)}`;
  const existingPaths = new Set(index.paths);
  const usedReviewPaths = new Set<string>();
  const writes = health.findings.map((finding) => {
    const path = nextHealthReviewPath(finding.code, existingPaths, usedReviewPaths);
    const id = reviewIdFromPath(path);
    return {
      path,
      content: renderHealthReviewItem(id, finding, now, options.note, index.eventIds)
    };
  });

  const existingSourceEvents = uniqueSorted(
    health.findings
      .flatMap((finding) => finding.source_events)
      .filter((eventId) => index.eventIds.has(eventId))
  );
  const transaction = createTransactionDraft({
    id: transactionId,
    created_at: now,
    source_events: existingSourceEvents,
    operations: [{ operation: "STAGE_REVIEW", description: "stage Memory Health Center findings" }],
    affected_files: writes.map((write) => stripMemoryPrefix(write.path)),
    risk_level: "low",
    requires_review: false,
    rollback_notes:
      "Health staging only proposes ReviewItems. If a finding is not useful, reject the pending transaction or archive the staged ReviewItem after applying it.",
    intent: "Stage deterministic Memory Health Center findings for manual review.",
    proposed_file_writes: writes
  });
  const validation = await validateTransaction(root, transaction);

  if (!validation.passed) {
    throw new Error(
      `Health review transaction validation failed: ${validation.errors.map((error) => error.code).join(", ")}`
    );
  }

  await writeMarkdownPageAtomic(root, transactionFilePaths.pending(transactionId), serializeTransactionMarkdown(transaction));

  return {
    transaction_id: transactionId,
    transaction_path: transactionFilePaths.pending(transactionId),
    transaction,
    review_paths: writes.map((write) => write.path)
  };
}

async function loadHealthPages(root: string): Promise<HealthPageLoadResult> {
  let files: string[];

  try {
    files = await listMarkdownFiles(root, "memory/**/*.md");
  } catch {
    return { pages: [], warnings: [] };
  }

  const pages: HealthPage[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    try {
      const parsed = parseMarkdownFile(await readMarkdownPage(root, file));
      pages.push({
        path: file,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        claims: parseClaimBlockRecords(parsed.body)
      });
    } catch (error) {
      warnings.push(`Skipped malformed memory page: ${file} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  return { pages, warnings };
}

function reviewItemFindings(pages: HealthPage[]): MemoryHealthFinding[] {
  return pages
    .filter((page) => page.frontmatter.type === "review_item" && page.frontmatter.review_state === "staged")
    .map((page) => ({
      code: "staged_review_item",
      severity: "medium",
      message: `Staged ReviewItem ${pageId(page)} is waiting for human resolution.`,
      affected_files: [page.path, ...stringArrayValue(page.frontmatter.affected_files).map(memoryPath)],
      source_events: stringArrayValue(page.frontmatter.source_events),
      evidence: [`review_reason: ${stringValue(page.frontmatter.review_reason) ?? "review"}`],
      suggested_action: "Resolve this ReviewItem manually with review apply, mark, contest, or archive."
    }));
}

function transactionFindings(pages: HealthPage[]): MemoryHealthFinding[] {
  const findings: MemoryHealthFinding[] = [];

  for (const page of pages) {
    if (page.frontmatter.type !== "transaction" || page.frontmatter.transaction_state !== "pending") {
      continue;
    }

    const operations = stringArrayValue(page.frontmatter.operations);
    const sourceEvents = stringArrayValue(page.frontmatter.source_events);
    const affectedFiles = stringArrayValue(page.frontmatter.affected_files).map(memoryPath);

    findings.push({
      code: "pending_transaction",
      severity: "medium",
      message: `Pending Transaction ${pageId(page)} is awaiting apply or reject.`,
      affected_files: [page.path, ...affectedFiles],
      source_events: sourceEvents,
      evidence: operations.map((operation) => `operation: ${operation}`),
      suggested_action: "Review this pending Transaction manually, then apply or reject it."
    });

    if (operations.includes("NOOP")) {
      findings.push({
        code: "stale_noop_event",
        severity: "medium",
        message: `NOOP Transaction ${pageId(page)} may be stale after newer detectors were added.`,
        affected_files: [page.path, ...affectedFiles],
        source_events: sourceEvents,
        evidence: [`transaction: ${pageId(page)}`, "operation: NOOP"],
        suggested_action: "Reprocess the source Event manually with stage-only semantics."
      });
    }
  }

  return findings;
}

function claimStateFindings(pages: HealthPage[]): MemoryHealthFinding[] {
  const findings: MemoryHealthFinding[] = [];

  for (const page of pages) {
    if (!canonicalPageTypes.has(stringValue(page.frontmatter.type) ?? "")) {
      continue;
    }

    if (page.frontmatter.review_state === "contested") {
      findings.push({
        code: "contested_claim",
        severity: "medium",
        message: `Canonical page ${page.path} is contested.`,
        affected_files: [page.path],
        source_events: sourceReferences(page),
        evidence: ["review_state: contested"],
        suggested_action: "Inspect contested memory manually before relying on it."
      });
    }

    for (const claim of page.claims) {
      const claimState = stringValue(claim.fields.claim_state);
      const claimId = stringValue(claim.fields.claim_id) ?? "unknown_claim";

      if (claimState === "superseded") {
        findings.push({
          code: "superseded_claim",
          severity: "low",
          message: `Claim ${claimId} on ${page.path} is superseded.`,
          affected_files: [page.path],
          source_events: stringArrayValue(claim.fields.evidence),
          evidence: [`claim_id: ${claimId}`, "claim_state: superseded"],
          suggested_action: "Use active claims for answers and keep superseded claims for history."
        });
      }
    }
  }

  return findings;
}

function orphanPageFindings(pages: HealthPage[]): MemoryHealthFinding[] {
  return pages
    .filter((page) => canonicalPageTypes.has(stringValue(page.frontmatter.type) ?? ""))
    .filter((page) => stringArrayValue(page.frontmatter.source_events).length === 0)
    .map((page) => ({
      code: "orphan_page",
      severity: "low",
      message: `Canonical page ${page.path} has no page-level source Events.`,
      affected_files: [page.path],
      source_events: sourceReferences(page),
      evidence: ["source_events: []"],
      suggested_action: "Review this page manually and add source-backed claims through a transaction if needed."
    }));
}

function missingSourceEventFindings(pages: HealthPage[], eventIds: Set<string>): MemoryHealthFinding[] {
  const findings: MemoryHealthFinding[] = [];

  for (const page of pages) {
    if (!canonicalPageTypes.has(stringValue(page.frontmatter.type) ?? "")) {
      continue;
    }

    const missing = sourceReferences(page).filter((eventId) => !eventIds.has(eventId));

    if (missing.length === 0) {
      continue;
    }

    findings.push({
      code: "missing_source_event",
      severity: "high",
      message: `Canonical page ${page.path} references missing Event IDs: ${uniqueSorted(missing).join(", ")}.`,
      affected_files: [page.path],
      source_events: uniqueSorted(missing),
      evidence: uniqueSorted(missing).map((eventId) => `missing Event: ${eventId}`),
      suggested_action: "Repair the missing Event reference manually through a source-backed transaction."
    });
  }

  return findings;
}

async function retrievalNoMatchFindings(
  root: string,
  queries: string[],
  warnings: string[]
): Promise<MemoryHealthFinding[]> {
  const findings: MemoryHealthFinding[] = [];

  for (const query of queries) {
    try {
      const result = await retrieveContextForAnswer(root, query);
      const noMatch = result.missingInformation.some((item) => item.code === "no_match");

      if (!noMatch && result.matchedPages.length > 0) {
        continue;
      }

      findings.push({
        code: "retrieval_no_match_hotspot",
        severity: "low",
        message: `Retrieval fixture had no match: ${query}`,
        affected_files: [],
        source_events: [],
        evidence: [`query: ${query}`],
        suggested_action: "Review no-match retrieval fixtures manually before expanding answer behavior."
      });
    } catch (error) {
      warnings.push(`Skipped retrieval no-match health query "${query}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return findings;
}

function summarizeCounts(findings: MemoryHealthFinding[]): MemoryHealthResult["counts"] {
  return {
    staged_review_items: countFindings(findings, "staged_review_item"),
    pending_transactions: countFindings(findings, "pending_transaction"),
    stale_noop_events: countFindings(findings, "stale_noop_event"),
    contested_claims: countFindings(findings, "contested_claim"),
    superseded_claims: countFindings(findings, "superseded_claim"),
    orphan_pages: countFindings(findings, "orphan_page"),
    pages_missing_source_events: countFindings(findings, "missing_source_event"),
    retrieval_no_match_hotspots: countFindings(findings, "retrieval_no_match_hotspot")
  };
}

function reviewReasonGroups(pages: HealthPage[]): Array<{ review_reason: string; count: number }> {
  const counts = new Map<string, number>();

  for (const page of pages) {
    if (page.frontmatter.type !== "review_item" || page.frontmatter.review_state !== "staged") {
      continue;
    }

    const reason = stringValue(page.frontmatter.review_reason) ?? "review";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([reviewReason, count]) => ({ review_reason: reviewReason, count }))
    .sort((left, right) => left.review_reason.localeCompare(right.review_reason));
}

function renderHealthReviewItem(
  id: string,
  finding: MemoryHealthFinding,
  now: string,
  note: string | undefined,
  existingEventIds: Set<string>
): string {
  const frontmatter: Frontmatter = {
    id,
    type: "review_item",
    object_state: "active",
    review_state: "staged",
    review_reason: `health_${finding.code}`,
    created_at: now,
    source_events: finding.source_events.filter((eventId) => existingEventIds.has(eventId)),
    affected_files: finding.affected_files.map(stripMemoryPrefix)
  };
  const noteLine = note?.trim() ? `\n\n## Review notes\n\n- ${now}: ${note.trim()}` : "";
  const body = [
    `# Health Review: ${finding.code.replace(/_/g, " ")}`,
    "",
    "## Finding",
    "",
    finding.message,
    "",
    "## Evidence",
    "",
    ...listLines(finding.evidence),
    "",
    "## Affected files",
    "",
    ...listLines(finding.affected_files),
    "",
    "## Suggested manual action",
    "",
    finding.suggested_action,
    noteLine
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

function nextHealthReviewPath(
  code: MemoryHealthFindingCode,
  existingPaths: Set<string>,
  usedReviewPaths: Set<string>
): string {
  const base = `memory/review/health-${code}.md`;

  if (!existingPaths.has(base) && !usedReviewPaths.has(base)) {
    usedReviewPaths.add(base);
    return base;
  }

  for (let index = 2; ; index += 1) {
    const path = `memory/review/health-${code}-${index}.md`;

    if (!existingPaths.has(path) && !usedReviewPaths.has(path)) {
      usedReviewPaths.add(path);
      return path;
    }
  }
}

function reviewIdFromPath(path: string): string {
  return `rev_${stripMemoryPrefix(path)
    .replace(/^review\//, "")
    .replace(/\.md$/i, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

function nextSequence(dateIdPart: string, transactionIds: Set<string>): string {
  const used = [...transactionIds]
    .map((id) => new RegExp(`^tx_${dateIdPart}_(\\d{3})$`).exec(id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10));
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;

  return String(next).padStart(3, "0");
}

function countFindings(findings: MemoryHealthFinding[], code: MemoryHealthFindingCode): number {
  return findings.filter((finding) => finding.code === code).length;
}

function sourceReferences(page: HealthPage): string[] {
  return uniqueSorted([
    ...stringArrayValue(page.frontmatter.source_events),
    ...page.claims.flatMap((claim) => stringArrayValue(claim.fields.evidence))
  ]);
}

function listLines(values: string[]): string[] {
  return values.length > 0 ? values.map((value) => `- \`${value}\``) : ["- none"];
}

function pageId(page: HealthPage): string {
  return stringValue(page.frontmatter.id) ?? page.path;
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function memoryPath(path: string): string {
  return path.startsWith("memory/") ? path : `memory/${path}`;
}

function stripMemoryPrefix(path: string): string {
  return path.replace(/\\/g, "/").replace(/^memory\//, "");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
