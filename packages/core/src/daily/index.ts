import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildTodayWorkbenchResult, type TodayWorkbenchOptions } from "../today";

export interface DailyQueueResult {
  generated_at: string;
  queue_complete: boolean;
  current_item: DailyQueueItem | null;
  items: DailyQueueItem[];
  counts: {
    pending_transactions: number;
    review_items: number;
    stale_noop_events: number;
    followups: number;
    health_findings: number;
  };
  warnings: string[];
}

export interface DailyQueueItem {
  item_id: string;
  item_type: "pending_transaction" | "review_item" | "stale_noop_event" | "followup" | "health_finding";
  priority: number;
  label: string;
  detail: string;
  target_id: string;
  target_path?: string;
  source_events: string[];
  affected_files: string[];
  suggested_action: string;
  route_hint: string;
  preview_endpoint?: string;
  action_endpoint?: string;
}

export interface DailySessionState {
  dismissed_prompts: string[];
  pinned_daily_questions: string[];
  last_selected_mode?: string;
  last_completed_derived_step?: string;
  updated_at?: string;
}

export interface DailySessionResult {
  generated_at: string;
  exists: boolean;
  path: ".assisto-local/daily/session.json";
  state: DailySessionState;
}

export interface DailySessionUpdateInput {
  reset?: boolean;
  dismissed_prompts?: unknown;
  pinned_daily_questions?: unknown;
  last_selected_mode?: unknown;
  last_completed_derived_step?: unknown;
}

export async function buildDailyQueueResult(
  root: string,
  options: TodayWorkbenchOptions = {}
): Promise<DailyQueueResult> {
  const today = await buildTodayWorkbenchResult(root, options);
  const items = [
    ...prioritizedPendingTransactions(today.pending_transactions).map((transaction, index) => ({
      item_id: `daily_tx_${transaction.id}`,
      item_type: "pending_transaction" as const,
      priority: 100 + index,
      label: `Review pending transaction ${transaction.id}`,
      detail: `${transaction.operations.join(", ") || "NOOP"} affecting ${transaction.affected_files.join(", ") || "no files"}`,
      target_id: transaction.id,
      target_path: transaction.path,
      source_events: transaction.source_events,
      affected_files: transaction.affected_files,
      suggested_action: "Preview apply or reject for this pending Transaction.",
      route_hint: "#transactions",
      preview_endpoint: "/api/transactions/apply/preview",
      action_endpoint: "/api/transactions/apply"
    })),
    ...today.staged_review_groups.flatMap((group, groupIndex) =>
      group.items.map((item, itemIndex) => ({
        item_id: `daily_review_${item.id}`,
        item_type: "review_item" as const,
        priority: 200 + groupIndex * 20 + itemIndex,
        label: `Resolve review item ${item.id}`,
        detail: `${group.review_reason}: ${group.suggested_action}`,
        target_id: item.id,
        target_path: item.path,
        source_events: [],
        affected_files: [item.path],
        suggested_action: group.suggested_action,
        route_hint: "#review",
        preview_endpoint: "/api/review/mark/preview",
        action_endpoint: "/api/review/mark"
      }))
    ),
    ...today.stale_noop_events.map((event, index) => ({
      item_id: `daily_stale_${event.event_id}`,
      item_type: "stale_noop_event" as const,
      priority: 300 + index,
      label: `Reprocess stale Event ${event.event_id}`,
      detail: event.message,
      target_id: event.event_id,
      target_path: event.affected_files[0],
      source_events: event.source_events,
      affected_files: event.affected_files,
      suggested_action: event.suggested_action,
      route_hint: "#today",
      preview_endpoint: "/api/events/reprocess/preview",
      action_endpoint: "/api/events/reprocess"
    })),
    ...today.open_followups.map((followup, index) => ({
      item_id: `daily_followup_${followup.id}`,
      item_type: "followup" as const,
      priority: 400 + index,
      label: `Review follow-up ${followup.id}`,
      detail: followup.due_at ? `Due ${followup.due_at}` : "Open follow-up without due date.",
      target_id: followup.id,
      target_path: followup.path,
      source_events: followup.source_events,
      affected_files: [followup.path],
      suggested_action: "Review whether this FollowUp is still open or should be closed through a Transaction.",
      route_hint: "#today"
    })),
    ...today.health.findings
      .filter((finding) => finding.severity === "high")
      .map((finding, index) => ({
        item_id: `daily_health_${finding.finding_id}`,
        item_type: "health_finding" as const,
        priority: 500 + index,
        label: `Stage health finding ${finding.code}`,
        detail: finding.message,
        target_id: finding.finding_id,
        affected_files: finding.affected_files,
        source_events: finding.source_events,
        suggested_action: finding.suggested_action,
        route_hint: "#health",
        preview_endpoint: "/api/health/stage-finding/preview",
        action_endpoint: "/api/health/stage-finding"
      }))
  ].sort((left, right) => left.priority - right.priority || left.item_id.localeCompare(right.item_id));

  return {
    generated_at: today.generated_at,
    queue_complete: items.length === 0,
    current_item: items[0] ?? null,
    items,
    counts: {
      pending_transactions: today.pending_transactions.length,
      review_items: today.staged_review_groups.reduce((sum, group) => sum + group.count, 0),
      stale_noop_events: today.stale_noop_events.length,
      followups: today.open_followups.length,
      health_findings: today.health.findings.filter((finding) => finding.severity === "high").length
    },
    warnings: today.warnings
  };
}

export async function readDailySession(
  root: string,
  options: TodayWorkbenchOptions = {}
): Promise<DailySessionResult> {
  const generatedAt = options.now ?? new Date().toISOString();

  try {
    const parsed = JSON.parse(await readFile(dailySessionAbsolutePath(root), "utf8")) as Record<string, unknown>;
    return {
      generated_at: generatedAt,
      exists: true,
      path: dailySessionRelativePath,
      state: sanitizeDailySessionState(parsed)
    };
  } catch {
    return {
      generated_at: generatedAt,
      exists: false,
      path: dailySessionRelativePath,
      state: emptyDailySessionState()
    };
  }
}

export async function updateDailySession(
  root: string,
  input: DailySessionUpdateInput = {},
  options: TodayWorkbenchOptions = {}
): Promise<DailySessionResult> {
  if (input.reset === true) {
    await rm(dailySessionAbsolutePath(root), { force: true });
    return readDailySession(root, options);
  }

  const existing = await readDailySession(root, options);
  const next: DailySessionState = {
    ...existing.state,
    dismissed_prompts:
      input.dismissed_prompts === undefined ? existing.state.dismissed_prompts : stringArrayInput(input.dismissed_prompts),
    pinned_daily_questions:
      input.pinned_daily_questions === undefined
        ? existing.state.pinned_daily_questions
        : stringArrayInput(input.pinned_daily_questions),
    updated_at: options.now ?? new Date().toISOString()
  };
  const selectedMode = optionalStringInput(input.last_selected_mode);
  const completedStep = optionalStringInput(input.last_completed_derived_step);

  if (input.last_selected_mode !== undefined) {
    if (selectedMode) {
      next.last_selected_mode = selectedMode;
    } else {
      delete next.last_selected_mode;
    }
  }

  if (input.last_completed_derived_step !== undefined) {
    if (completedStep) {
      next.last_completed_derived_step = completedStep;
    } else {
      delete next.last_completed_derived_step;
    }
  }

  const filePath = dailySessionAbsolutePath(root);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  return {
    generated_at: options.now ?? next.updated_at ?? new Date().toISOString(),
    exists: true,
    path: dailySessionRelativePath,
    state: next
  };
}

type PendingTransactionSummary = Awaited<ReturnType<typeof buildTodayWorkbenchResult>>["pending_transactions"][number];

function prioritizedPendingTransactions(transactions: PendingTransactionSummary[]): PendingTransactionSummary[] {
  const durableWrites = transactions
    .filter((transaction) => transaction.operations.some((operation) => operation !== "STAGE_REVIEW" && operation !== "NOOP"))
    .sort(oldestTransactionFirst);
  const remaining = transactions
    .filter((transaction) => !durableWrites.includes(transaction))
    .sort(oldestTransactionFirst);

  return [...durableWrites, ...remaining];
}

function oldestTransactionFirst(left: PendingTransactionSummary, right: PendingTransactionSummary): number {
  return (left.created_at ?? "").localeCompare(right.created_at ?? "") || left.path.localeCompare(right.path);
}

const dailySessionRelativePath = ".assisto-local/daily/session.json";

function dailySessionAbsolutePath(root: string): string {
  return path.join(root, dailySessionRelativePath);
}

function emptyDailySessionState(): DailySessionState {
  return {
    dismissed_prompts: [],
    pinned_daily_questions: []
  };
}

function sanitizeDailySessionState(input: Record<string, unknown>): DailySessionState {
  const state: DailySessionState = {
    dismissed_prompts: stringArrayInput(input.dismissed_prompts),
    pinned_daily_questions: stringArrayInput(input.pinned_daily_questions)
  };
  const selectedMode = optionalStringInput(input.last_selected_mode);
  const completedStep = optionalStringInput(input.last_completed_derived_step);
  const updatedAt = optionalStringInput(input.updated_at);

  if (selectedMode) {
    state.last_selected_mode = selectedMode;
  }

  if (completedStep) {
    state.last_completed_derived_step = completedStep;
  }

  if (updatedAt) {
    state.updated_at = updatedAt;
  }

  return state;
}

function stringArrayInput(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))] : [];
}

function optionalStringInput(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
