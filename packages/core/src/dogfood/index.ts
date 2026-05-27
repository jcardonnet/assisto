import {
  buildTodayWorkbenchResult,
  type TodayEventSummary,
  type TodayFollowUpSummary,
  type TodayReviewGroup,
  type TodayStaleNoopEvent,
  type TodayTransactionSummary,
  type TodayWorkbenchOptions,
  type TodayWorkbenchResult
} from "../today";
import { listMarkdownFiles, readMarkdownPage } from "../fs";
import { getSection, parseMarkdownFile, type FrontmatterValue } from "../markdown";
import { parseFrictionRawText, type FrictionLogKind } from "../friction";

export interface DogfoodHomeResult {
  generated_at: string;
  daily_progress: DogfoodDailyProgress;
  next_recommended_action: DogfoodRecommendedAction;
  capture_prompt: DogfoodCapturePrompt;
  quick_briefs: DogfoodQuickBrief[];
  counts: TodayWorkbenchResult["counts"];
  pending_transactions: TodayTransactionSummary[];
  staged_review_groups: TodayReviewGroup[];
  stale_noop_events: TodayStaleNoopEvent[];
  open_followups: TodayFollowUpSummary[];
  recent_events: TodayEventSummary[];
  recent_transactions: TodayTransactionSummary[];
  recent_friction_logs: DogfoodFrictionLogSummary[];
  health_warnings: string[];
  suggested_manual_actions: string[];
  warnings: string[];
  today: TodayWorkbenchResult;
}

export interface DogfoodDailyProgress {
  completed: boolean;
  completed_steps: number;
  total_steps: number;
  open_items: number;
  labels: string[];
}

export type DogfoodRecommendedActionKind =
  | "review_pending_transaction"
  | "resolve_review_item"
  | "reprocess_stale_noop"
  | "review_followup"
  | "check_health"
  | "capture_note";

export interface DogfoodRecommendedAction {
  action: DogfoodRecommendedActionKind;
  label: string;
  detail: string;
  target_id?: string;
  target_path?: string;
  route_hint?: string;
}

export interface DogfoodCapturePrompt {
  label: string;
  prompt: string;
  source_label: string;
  provider: "rule";
  examples: string[];
}

export interface DogfoodQuickBrief {
  kind: "today" | "recent" | "followups" | "review";
  label: string;
  detail: string;
  route_hint: string;
}

export interface DogfoodFrictionLogSummary {
  id: string;
  path: string;
  recorded_at?: string;
  source_label: string;
  kind: FrictionLogKind | string;
  question?: string;
  note: string;
}

const totalDailySteps = 5;

export async function buildDogfoodHomeResult(
  root: string,
  options: TodayWorkbenchOptions = {}
): Promise<DogfoodHomeResult> {
  const today = await buildTodayWorkbenchResult(root, options);
  const recentFrictionLogs = await collectRecentFrictionLogs(root, options.recentLimit ?? 8);

  return {
    generated_at: today.generated_at,
    daily_progress: dailyProgress(today),
    next_recommended_action: nextRecommendedAction(today),
    capture_prompt: {
      label: "Capture a work-memory note",
      prompt: "What changed at work since your last note?",
      source_label: "dogfood home",
      provider: "rule",
      examples: [
        "I talked with Jeff about the inventory rollout.",
        "Remind me to ask Priya about the API migration.",
        "Alex is now the owner of reporting."
      ]
    },
    quick_briefs: [
      {
        kind: "today",
        label: "Daily brief",
        detail: "Active memory, open work, and uncertainty for today.",
        route_hint: "/api/brief?kind=today"
      },
      {
        kind: "recent",
        label: "What changed recently",
        detail: "Recent applied or rejected transaction context.",
        route_hint: "/api/brief?kind=recent"
      },
      {
        kind: "followups",
        label: "Follow-up review",
        detail: "Open follow-ups with evidence.",
        route_hint: "/api/brief?kind=followups"
      },
      {
        kind: "review",
        label: "Review-risk brief",
        detail: "Staged or uncertain memory that needs a decision.",
        route_hint: "/api/brief?kind=review"
      }
    ],
    counts: today.counts,
    pending_transactions: today.pending_transactions,
    staged_review_groups: today.staged_review_groups,
    stale_noop_events: today.stale_noop_events,
    open_followups: today.open_followups,
    recent_events: today.recent_events,
    recent_transactions: today.recent_transactions,
    recent_friction_logs: recentFrictionLogs,
    health_warnings: today.health_warnings,
    suggested_manual_actions: today.suggested_manual_actions,
    warnings: today.warnings,
    today
  };
}

async function collectRecentFrictionLogs(root: string, limit: number): Promise<DogfoodFrictionLogSummary[]> {
  const logs: DogfoodFrictionLogSummary[] = [];

  for (const file of await listEventFilesOrEmpty(root)) {
    try {
      const parsed = parseMarkdownFile(await readMarkdownPage(root, file));
      const sourceLabel = stringValue(parsed.frontmatter.source_label);

      if (!sourceLabel?.startsWith("friction:")) {
        continue;
      }

      const rawText = getSection(parsed.body, "Raw text") ?? "";
      const friction = parseFrictionRawText(rawText);

      if (!friction) {
        continue;
      }

      logs.push({
        id: stringValue(parsed.frontmatter.id) ?? file,
        path: file,
        recorded_at: stringValue(parsed.frontmatter.recorded_at),
        source_label: sourceLabel,
        kind: friction.kind,
        question: friction.question,
        note: friction.note
      });
    } catch {
      // Health/lint surfaces malformed Event pages; Dogfood Home keeps reading.
    }
  }

  return logs.sort(newestFrictionLogFirst).slice(0, limit);
}

async function listEventFilesOrEmpty(root: string): Promise<string[]> {
  try {
    return await listMarkdownFiles(root, "memory/events/**/*.md");
  } catch {
    return [];
  }
}

function dailyProgress(today: TodayWorkbenchResult): DogfoodDailyProgress {
  const openCategories = [
    today.counts.pending_transactions > 0,
    today.counts.staged_review_items > 0,
    today.counts.stale_noop_events > 0,
    today.counts.open_followups > 0,
    today.counts.health_warnings > 0 || today.warnings.length > 0
  ];

  return {
    completed: today.daily_review_complete,
    completed_steps: openCategories.filter((open) => !open).length,
    total_steps: totalDailySteps,
    open_items:
      today.counts.pending_transactions +
      today.counts.staged_review_items +
      today.counts.stale_noop_events +
      today.counts.open_followups,
    labels: [
      today.counts.pending_transactions > 0 ? "Transactions need decisions" : "Transactions clear",
      today.counts.staged_review_items > 0 ? "ReviewItems need decisions" : "ReviewItems clear",
      today.counts.stale_noop_events > 0 ? "Stale NOOP Events need reprocessing" : "Stale NOOP Events clear",
      today.counts.open_followups > 0 ? "Follow-ups are open" : "Follow-ups clear",
      today.counts.health_warnings > 0 || today.warnings.length > 0 ? "Health warnings need review" : "Health clear"
    ]
  };
}

function nextRecommendedAction(today: TodayWorkbenchResult): DogfoodRecommendedAction {
  const transaction = preferredPendingTransaction(today.pending_transactions);

  if (transaction) {
    return {
      action: "review_pending_transaction",
      label: "Review pending transaction",
      detail: "Preview, apply, or reject the oldest durable pending Transaction.",
      target_id: transaction.id,
      target_path: transaction.path,
      route_hint: "/api/transactions/detail"
    };
  }

  const reviewGroup = today.staged_review_groups[0];

  if (reviewGroup) {
    return {
      action: "resolve_review_item",
      label: "Resolve staged review",
      detail: reviewGroup.suggested_action,
      target_id: reviewGroup.items[0]?.id,
      target_path: reviewGroup.items[0]?.path,
      route_hint: "/api/review"
    };
  }

  const staleNoop = today.stale_noop_events[0];

  if (staleNoop) {
    return {
      action: "reprocess_stale_noop",
      label: "Reprocess stale NOOP Event",
      detail: staleNoop.suggested_action,
      target_id: staleNoop.event_id,
      target_path: staleNoop.affected_files[0],
      route_hint: "/api/events/reprocess/preview"
    };
  }

  const followup = today.open_followups[0];

  if (followup) {
    return {
      action: "review_followup",
      label: "Review open follow-up",
      detail: "Inspect the next open FollowUp and decide whether it still matters.",
      target_id: followup.id,
      target_path: followup.path,
      route_hint: "/api/followups"
    };
  }

  if (today.health_warnings.length > 0 || today.warnings.length > 0) {
    return {
      action: "check_health",
      label: "Review memory health",
      detail: today.health_warnings[0] ?? today.warnings[0] ?? "Inspect memory health warnings.",
      route_hint: "/api/health"
    };
  }

  return {
    action: "capture_note",
    label: "Capture what changed",
    detail: "Add a short note to keep work memory fresh.",
    route_hint: "/api/capture/preview"
  };
}

function preferredPendingTransaction(transactions: TodayTransactionSummary[]): TodayTransactionSummary | undefined {
  const durableWrites = transactions
    .filter((transaction) => transaction.operations.some((operation) => operation !== "STAGE_REVIEW" && operation !== "NOOP"))
    .sort(oldestTransactionFirst);

  return durableWrites[0] ?? transactions.slice().sort(oldestTransactionFirst)[0];
}

function oldestTransactionFirst(left: TodayTransactionSummary, right: TodayTransactionSummary): number {
  return (left.created_at ?? "").localeCompare(right.created_at ?? "") || left.path.localeCompare(right.path);
}

function newestFrictionLogFirst(left: DogfoodFrictionLogSummary, right: DogfoodFrictionLogSummary): number {
  return (right.recorded_at ?? "").localeCompare(left.recorded_at ?? "") || right.path.localeCompare(left.path);
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
