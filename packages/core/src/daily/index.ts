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
