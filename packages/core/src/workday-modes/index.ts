import { buildDailyQueueResult, readDailySession, type DailyQueueItem } from "../daily";
import { buildDogfoodHomeResult, type DogfoodFrictionLogSummary } from "../dogfood";
import {
  buildTodayWorkbenchResult,
  type TodayEventSummary,
  type TodayFollowUpSummary,
  type TodayTransactionSummary,
  type TodayWorkbenchOptions
} from "../today";

export type WorkdayModeKind = "morning" | "end-day";

export interface WorkdayModeResult {
  generated_at: string;
  mode: WorkdayModeKind;
  title: string;
  summary: string;
  next_queue_item: DailyQueueItem | null;
  pinned_questions: string[];
  open_followups: TodayFollowUpSummary[];
  health_warnings: string[];
  recent_changes: WorkdayRecentChange[];
  suggested_captures: string[];
  todays_captures: TodayEventSummary[];
  unresolved_transactions: TodayTransactionSummary[];
  logged_misses: DogfoodFrictionLogSummary[];
  citations: WorkdayModeCitations;
  warnings: string[];
  disclaimer: string;
}

export interface WorkdayRecentChange {
  change_type: "event" | "transaction";
  id: string;
  path: string;
  occurred_at?: string;
  source_events: string[];
  affected_files: string[];
  summary: string;
}

export interface WorkdayModeCitations {
  event_ids: string[];
  transaction_ids: string[];
  page_paths: string[];
}

export async function buildWorkdayModeResult(
  root: string,
  mode: WorkdayModeKind,
  options: TodayWorkbenchOptions = {}
): Promise<WorkdayModeResult> {
  const [today, queue, session, dogfood] = await Promise.all([
    buildTodayWorkbenchResult(root, options),
    buildDailyQueueResult(root, options),
    readDailySession(root, options),
    buildDogfoodHomeResult(root, options)
  ]);
  const date = (options.now ?? today.generated_at).slice(0, 10);
  const loggedMisses = dogfood.recent_friction_logs.filter((log) => log.kind === "retrieval_miss");
  const result: WorkdayModeResult = {
    generated_at: today.generated_at,
    mode,
    title: modeTitle(mode),
    summary: modeSummary(mode, queue.current_item, today.pending_transactions.length, today.open_followups.length, today.health_warnings.length),
    next_queue_item: queue.current_item,
    pinned_questions: session.state.pinned_daily_questions,
    open_followups: today.open_followups,
    health_warnings: today.health_warnings,
    recent_changes: recentChanges(today.recent_events, today.recent_transactions),
    suggested_captures: suggestedCaptures(mode, dogfood.capture_prompt.examples),
    todays_captures: today.recent_events.filter((event) => isSameDayEvent(event, date)),
    unresolved_transactions: today.pending_transactions,
    logged_misses: loggedMisses,
    citations: {
      event_ids: [],
      transaction_ids: [],
      page_paths: []
    },
    warnings: uniqueStrings([...today.warnings, ...dogfood.warnings]),
    disclaimer: "Workday modes are derived, disposable views. They do not persist generated explanations or modify canonical memory."
  };

  result.citations = citationsFor(result);
  return result;
}

function modeTitle(mode: WorkdayModeKind): string {
  return mode === "morning" ? "Morning" : "End of day";
}

function modeSummary(
  mode: WorkdayModeKind,
  currentItem: DailyQueueItem | null,
  pendingTransactions: number,
  openFollowups: number,
  healthWarnings: number
): string {
  if (mode === "morning") {
    return currentItem
      ? `Start with ${currentItem.label}.`
      : "Start by capturing what changed or asking a pinned work question.";
  }

  return `${pendingTransactions} unresolved transaction(s), ${openFollowups} open follow-up(s), and ${healthWarnings} health warning(s) remain before closing the day.`;
}

function recentChanges(events: TodayEventSummary[], transactions: TodayTransactionSummary[]): WorkdayRecentChange[] {
  return [
    ...events.map((event) => ({
      change_type: "event" as const,
      id: event.id,
      path: event.path,
      occurred_at: event.recorded_at ?? event.observed_at,
      source_events: [event.id],
      affected_files: [event.path],
      summary: `Event ${event.id}${event.source_label ? ` (${event.source_label})` : ""}`
    })),
    ...transactions.map((transaction) => ({
      change_type: "transaction" as const,
      id: transaction.id,
      path: transaction.path,
      occurred_at: transaction.created_at,
      source_events: transaction.source_events,
      affected_files: transaction.affected_files,
      summary: `Transaction ${transaction.id} is ${transaction.transaction_state}.`
    }))
  ].sort((left, right) => (right.occurred_at ?? "").localeCompare(left.occurred_at ?? "") || left.id.localeCompare(right.id));
}

function suggestedCaptures(mode: WorkdayModeKind, examples: string[]): string[] {
  const base =
    mode === "morning"
      ? ["What changed since yesterday?", "What do I need Assisto to remember before the first meeting?"]
      : ["What did I decide today?", "What follow-ups did I explicitly commit to?", "What did memory fail to answer today?"];

  return uniqueStrings([...base, ...examples]).slice(0, 6);
}

function isSameDayEvent(event: TodayEventSummary, date: string): boolean {
  return event.recorded_at?.startsWith(date) === true || event.observed_at === date;
}

function citationsFor(result: WorkdayModeResult): WorkdayModeCitations {
  const eventIds = [
    ...(result.next_queue_item?.source_events ?? []),
    ...result.open_followups.flatMap((followup) => followup.source_events),
    ...result.recent_changes.flatMap((change) => change.source_events),
    ...result.todays_captures.map((event) => event.id),
    ...result.logged_misses.map((miss) => miss.id)
  ];
  const transactionIds = [
    ...(result.next_queue_item?.item_type === "pending_transaction" ? [result.next_queue_item.target_id] : []),
    ...result.unresolved_transactions.map((transaction) => transaction.id)
  ];
  const pagePaths = [
    ...(result.next_queue_item?.affected_files ?? []),
    ...result.open_followups.map((followup) => followup.path),
    ...result.recent_changes.flatMap((change) => change.affected_files),
    ...result.unresolved_transactions.flatMap((transaction) => transaction.affected_files),
    ...result.logged_misses.map((miss) => miss.path)
  ];

  return {
    event_ids: uniqueStrings(eventIds),
    transaction_ids: uniqueStrings(transactionIds),
    page_paths: uniqueStrings(pagePaths)
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
