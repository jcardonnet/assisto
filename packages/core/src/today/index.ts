import { listMarkdownFiles, readMarkdownPage } from "../fs";
import { parseMarkdownFile, type Frontmatter, type FrontmatterValue } from "../markdown";
import { checkMemoryHealth, type MemoryHealthFinding, type MemoryHealthResult } from "../health";
import { listReviewItems, type ReviewItemSummary } from "../review";
import { parseTransactionMarkdown, type ParsedTransaction } from "../transactions";

export interface TodayWorkbenchOptions {
  now?: string;
  recentLimit?: number;
}

export interface TodayWorkbenchResult {
  generated_at: string;
  daily_review_complete: boolean;
  counts: {
    pending_transactions: number;
    staged_review_items: number;
    stale_noop_events: number;
    open_followups: number;
    recent_events: number;
    recent_decisions: number;
    health_warnings: number;
  };
  pending_transactions: TodayTransactionSummary[];
  staged_review_groups: TodayReviewGroup[];
  stale_noop_events: TodayStaleNoopEvent[];
  open_followups: TodayFollowUpSummary[];
  recent_events: TodayEventSummary[];
  recent_transactions: TodayTransactionSummary[];
  health_warnings: string[];
  suggested_manual_actions: string[];
  health: MemoryHealthResult;
  warnings: string[];
}

export interface TodayTransactionSummary {
  id: string;
  path: string;
  transaction_state: string;
  created_at?: string;
  source_events: string[];
  operations: string[];
  affected_files: string[];
  risk_level?: string;
  requires_review?: boolean;
}

export interface TodayReviewGroup {
  review_reason: string;
  count: number;
  items: ReviewItemSummary[];
  suggested_action: string;
}

export interface TodayStaleNoopEvent {
  event_id: string;
  transaction_id?: string;
  finding_id: string;
  message: string;
  affected_files: string[];
  source_events: string[];
  suggested_action: string;
}

export interface TodayFollowUpSummary {
  id: string;
  path: string;
  followup_state: string;
  review_state: string;
  owner?: string;
  due_at?: string;
  source_events: string[];
  related: string[];
}

export interface TodayEventSummary {
  id: string;
  path: string;
  recorded_at?: string;
  observed_at?: string;
  source_label?: string;
  participants: string[];
  topics: string[];
  derived_claims: string[];
}

interface ParsedPage {
  path: string;
  frontmatter: Frontmatter;
}

const defaultNow = "2026-05-26T12:00:00.000Z";
const defaultRecentLimit = 8;

export async function buildTodayWorkbenchResult(
  root: string,
  options: TodayWorkbenchOptions = {}
): Promise<TodayWorkbenchResult> {
  const now = options.now ?? defaultNow;
  const recentLimit = options.recentLimit ?? defaultRecentLimit;
  const [health, reviewItems, transactions, followups, events] = await Promise.all([
    checkMemoryHealth(root, { now }),
    listReviewItems(root),
    collectTransactions(root),
    collectFollowups(root),
    collectEvents(root)
  ]);
  const pendingTransactions = transactions
    .filter((transaction) => transaction.transaction_state === "pending")
    .sort(newestTransactionFirst);
  const recentTransactions = transactions
    .filter((transaction) => transaction.transaction_state === "applied" || transaction.transaction_state === "rejected")
    .sort(newestTransactionFirst)
    .slice(0, recentLimit);
  const staleNoopEvents = staleNoopEventsFromHealth(health);
  const healthWarnings = [
    ...health.warnings,
    ...health.findings
      .filter((finding) => finding.severity === "high")
      .map((finding) => `${finding.code}: ${finding.message}`)
  ];

  return {
    generated_at: now,
    daily_review_complete: pendingTransactions.length === 0 && reviewItems.length === 0 && staleNoopEvents.length === 0,
    counts: {
      pending_transactions: pendingTransactions.length,
      staged_review_items: reviewItems.length,
      stale_noop_events: staleNoopEvents.length,
      open_followups: followups.length,
      recent_events: Math.min(events.length, recentLimit),
      recent_decisions: recentTransactions.length,
      health_warnings: healthWarnings.length
    },
    pending_transactions: pendingTransactions,
    staged_review_groups: groupReviewItems(reviewItems),
    stale_noop_events: staleNoopEvents,
    open_followups: followups,
    recent_events: events.sort(newestEventFirst).slice(0, recentLimit),
    recent_transactions: recentTransactions,
    health_warnings: healthWarnings,
    suggested_manual_actions: todaySuggestedActions(health, pendingTransactions, reviewItems, staleNoopEvents),
    health,
    warnings: []
  };
}

async function collectTransactions(root: string): Promise<TodayTransactionSummary[]> {
  const transactions: TodayTransactionSummary[] = [];

  for (const file of await listFilesOrEmpty(root, "memory/transactions/**/*.md")) {
    try {
      transactions.push(transactionSummary(file, parseTransactionMarkdown(await readMarkdownPage(root, file))));
    } catch {
      // Malformed transaction pages are surfaced by validation and health.
    }
  }

  return transactions;
}

async function collectFollowups(root: string): Promise<TodayFollowUpSummary[]> {
  const followups: TodayFollowUpSummary[] = [];

  for (const page of await collectPages(root, ["memory/followups/*.md", "memory/followups/**/*.md"])) {
    if (page.frontmatter.type !== "followup" || page.frontmatter.object_state === "archived") {
      continue;
    }

    const followupState = stringValue(page.frontmatter.followup_state) ?? "open";

    if (followupState !== "open") {
      continue;
    }

    followups.push({
      id: stringValue(page.frontmatter.id) ?? page.path,
      path: page.path,
      followup_state: followupState,
      review_state: stringValue(page.frontmatter.review_state) ?? "none",
      owner: stringValue(page.frontmatter.owner),
      due_at: stringValue(page.frontmatter.due_at),
      source_events: stringArrayValue(page.frontmatter.source_events),
      related: stringArrayValue(page.frontmatter.related)
    });
  }

  return followups.sort((left, right) => {
    const dueCompare = (left.due_at ?? "9999").localeCompare(right.due_at ?? "9999");
    return dueCompare === 0 ? left.path.localeCompare(right.path) : dueCompare;
  });
}

async function collectEvents(root: string): Promise<TodayEventSummary[]> {
  const events: TodayEventSummary[] = [];

  for (const page of await collectPages(root, "memory/events/**/*.md")) {
    if (page.frontmatter.type !== "event") {
      continue;
    }

    events.push({
      id: stringValue(page.frontmatter.id) ?? page.path,
      path: page.path,
      recorded_at: stringValue(page.frontmatter.recorded_at),
      observed_at: stringValue(page.frontmatter.observed_at),
      source_label: stringValue(page.frontmatter.source_label),
      participants: stringArrayValue(page.frontmatter.participants),
      topics: stringArrayValue(page.frontmatter.topics),
      derived_claims: stringArrayValue(page.frontmatter.derived_claims)
    });
  }

  return events;
}

async function collectPages(root: string, globPattern: string | string[]): Promise<ParsedPage[]> {
  const pages: ParsedPage[] = [];

  for (const file of await filesForPatterns(root, globPattern)) {
    try {
      pages.push({
        path: file,
        frontmatter: parseMarkdownFile(await readMarkdownPage(root, file)).frontmatter
      });
    } catch {
      // Malformed pages are surfaced by validation and health.
    }
  }

  return pages;
}

async function filesForPatterns(root: string, globPattern: string | string[]): Promise<string[]> {
  const patterns = Array.isArray(globPattern) ? globPattern : [globPattern];
  const files = await Promise.all(patterns.map((pattern) => listFilesOrEmpty(root, pattern)));
  return [...new Set(files.flat())].sort();
}

async function listFilesOrEmpty(root: string, globPattern: string): Promise<string[]> {
  try {
    return await listMarkdownFiles(root, globPattern);
  } catch {
    return [];
  }
}

function transactionSummary(path: string, transaction: ParsedTransaction): TodayTransactionSummary {
  return {
    id: transaction.id,
    path,
    transaction_state: transaction.transaction_state,
    created_at: transaction.created_at,
    source_events: transaction.source_events,
    operations: transaction.operations.map((operation) => operation.operation),
    affected_files: transaction.affected_files,
    risk_level: transaction.risk_level,
    requires_review: transaction.requires_review
  };
}

function staleNoopEventsFromHealth(health: MemoryHealthResult): TodayStaleNoopEvent[] {
  return health.findings
    .filter((finding) => finding.code === "stale_noop_event")
    .map((finding) => ({
      event_id: finding.source_events[0] ?? "",
      transaction_id: transactionIdFromFinding(finding),
      finding_id: finding.finding_id,
      message: finding.message,
      affected_files: finding.affected_files,
      source_events: finding.source_events,
      suggested_action: finding.suggested_action
    }));
}

function transactionIdFromFinding(finding: MemoryHealthFinding): string | undefined {
  const evidence = finding.evidence.find((item) => item.startsWith("transaction: "));
  return evidence?.replace(/^transaction:\s*/, "").trim() || undefined;
}

function groupReviewItems(items: ReviewItemSummary[]): TodayReviewGroup[] {
  const groups = new Map<string, TodayReviewGroup>();

  for (const item of items) {
    const group =
      groups.get(item.review_reason) ??
      {
        review_reason: item.review_reason,
        count: 0,
        items: [],
        suggested_action: suggestedReviewAction(item.review_reason)
      };
    group.count += 1;
    group.items.push(item);
    groups.set(item.review_reason, group);
  }

  return [...groups.values()].sort((left, right) => left.review_reason.localeCompare(right.review_reason));
}

function suggestedReviewAction(reviewReason: string): string {
  switch (reviewReason) {
    case "unscoped_claim":
      return "Resolve with an explicit Context, create Context through review, or contest.";
    case "role_change":
    case "reporting_change":
      return "Resolve with explicit supersession only after human confirmation.";
    case "claim_id_conflict":
      return "Inspect the staged claim and target page before applying.";
    default:
      return "Inspect the ReviewItem, then apply staged, mark, or leave staged.";
  }
}

function todaySuggestedActions(
  health: MemoryHealthResult,
  pendingTransactions: TodayTransactionSummary[],
  reviewItems: ReviewItemSummary[],
  staleNoopEvents: TodayStaleNoopEvent[]
): string[] {
  const actions = new Set<string>();

  if (pendingTransactions.length > 0) {
    actions.add("Review pending Transactions and apply or reject them explicitly.");
  }

  if (reviewItems.length > 0) {
    actions.add("Resolve staged ReviewItems with explicit context, contest, or archive decisions.");
  }

  if (staleNoopEvents.length > 0) {
    actions.add("Reprocess stale NOOP Events with stage-only semantics.");
  }

  for (const action of health.suggested_actions) {
    actions.add(action);
  }

  return [...actions].sort();
}

function newestTransactionFirst(left: TodayTransactionSummary, right: TodayTransactionSummary): number {
  return (right.created_at ?? "").localeCompare(left.created_at ?? "") || right.path.localeCompare(left.path);
}

function newestEventFirst(left: TodayEventSummary, right: TodayEventSummary): number {
  return (
    (right.recorded_at ?? right.observed_at ?? "").localeCompare(left.recorded_at ?? left.observed_at ?? "") ||
    right.path.localeCompare(left.path)
  );
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
