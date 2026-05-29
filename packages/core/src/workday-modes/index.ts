import { buildSessionBrief, type SessionBriefResult } from "../briefs";
import { buildDailyQueueResult, readDailySession, type DailyQueueItem } from "../daily";
import { buildDogfoodHomeResult, type DogfoodFrictionLogSummary } from "../dogfood";
import { getEntityDetail } from "../entities";
import {
  buildTodayWorkbenchResult,
  type TodayEventSummary,
  type TodayFollowUpSummary,
  type TodayTransactionSummary,
  type TodayWorkbenchOptions
} from "../today";

export type WorkdayModeKind = "morning" | "end-day" | "meeting" | "after-meeting";

export interface WorkdayModeOptions extends TodayWorkbenchOptions {
  target?: string;
}

export interface WorkdayModeResult {
  generated_at: string;
  mode: WorkdayModeKind;
  title: string;
  summary: string;
  target?: WorkdayModeTarget;
  brief: SessionBriefResult | null;
  next_queue_item: DailyQueueItem | null;
  pinned_questions: string[];
  open_followups: TodayFollowUpSummary[];
  health_warnings: string[];
  recent_changes: WorkdayRecentChange[];
  suggested_captures: string[];
  todays_captures: TodayEventSummary[];
  unresolved_transactions: TodayTransactionSummary[];
  logged_misses: DogfoodFrictionLogSummary[];
  review_risks: SessionBriefResult["reviewItems"];
  missing_memory_prompts: string[];
  after_meeting_prompts: string[];
  suggested_followup_checks: string[];
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

export interface WorkdayModeTarget {
  id?: string;
  path: string;
  type: "person" | "context";
  name: string;
  aliases: string[];
}

export interface WorkdayModeCitations {
  event_ids: string[];
  transaction_ids: string[];
  page_paths: string[];
}

export async function buildWorkdayModeResult(
  root: string,
  mode: WorkdayModeKind,
  options: WorkdayModeOptions = {}
): Promise<WorkdayModeResult> {
  const [today, queue, session, dogfood] = await Promise.all([
    buildTodayWorkbenchResult(root, options),
    buildDailyQueueResult(root, options),
    readDailySession(root, options),
    buildDogfoodHomeResult(root, options)
  ]);
  const target = await resolveModeTarget(root, mode, options.target);
  const brief = target
    ? await buildSessionBrief(root, {
        kind: target.type,
        targetKind: target.type,
        target: target.id ?? target.path,
        now: options.now
      })
    : null;
  const date = (options.now ?? today.generated_at).slice(0, 10);
  const loggedMisses = dogfood.recent_friction_logs.filter((log) => log.kind === "retrieval_miss");
  const openFollowups = brief?.openFollowUps ?? today.open_followups;
  const result: WorkdayModeResult = {
    generated_at: today.generated_at,
    mode,
    title: modeTitle(mode),
    summary: modeSummary(mode, queue.current_item, today.pending_transactions.length, openFollowups.length, today.health_warnings.length, target),
    target,
    brief,
    next_queue_item: queue.current_item,
    pinned_questions: session.state.pinned_daily_questions,
    open_followups: openFollowups,
    health_warnings: today.health_warnings,
    recent_changes: recentChanges(today.recent_events, today.recent_transactions),
    suggested_captures: suggestedCaptures(mode, dogfood.capture_prompt.examples),
    todays_captures: today.recent_events.filter((event) => isSameDayEvent(event, date)),
    unresolved_transactions: today.pending_transactions,
    logged_misses: loggedMisses,
    review_risks: brief?.reviewItems ?? [],
    missing_memory_prompts: missingMemoryPrompts(mode, target),
    after_meeting_prompts: afterMeetingPrompts(mode, target),
    suggested_followup_checks: suggestedFollowupChecks(mode, target),
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
  switch (mode) {
    case "morning":
      return "Morning";
    case "end-day":
      return "End of day";
    case "meeting":
      return "Meeting";
    case "after-meeting":
      return "After meeting";
  }
}

function modeSummary(
  mode: WorkdayModeKind,
  currentItem: DailyQueueItem | null,
  pendingTransactions: number,
  openFollowups: number,
  healthWarnings: number,
  target: WorkdayModeTarget | undefined
): string {
  if (mode === "morning") {
    return currentItem
      ? `Start with ${currentItem.label}.`
      : "Start by capturing what changed or asking a pinned work question.";
  }

  if (mode === "meeting") {
    return target ? `Prepare for ${target.name} with cited memory, open follow-ups, and review risks.` : "Prepare for the meeting with cited memory.";
  }

  if (mode === "after-meeting") {
    return target ? `Capture outcomes after meeting with ${target.name}; check explicit follow-up language before creating work.` : "Capture outcomes after the meeting.";
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
  const base = (() => {
    switch (mode) {
      case "morning":
        return ["What changed since yesterday?", "What do I need Assisto to remember before the first meeting?"];
      case "end-day":
        return ["What did I decide today?", "What follow-ups did I explicitly commit to?", "What did memory fail to answer today?"];
      case "meeting":
        return ["What should I confirm in this meeting?", "What missing context would make this meeting easier?"];
      case "after-meeting":
        return ["What did we decide in the meeting?", "What explicit follow-up did I commit to?", "What should Assisto remember before the next meeting?"];
    }
  })();

  return uniqueStrings([...base, ...examples]).slice(0, 6);
}

async function resolveModeTarget(
  root: string,
  mode: WorkdayModeKind,
  target: string | undefined
): Promise<WorkdayModeTarget | undefined> {
  if (mode !== "meeting" && mode !== "after-meeting") {
    return undefined;
  }

  if (!target?.trim()) {
    throw new Error(`wm mode ${mode} requires a Person or Context id/path target.`);
  }

  const detail = await getEntityDetail(root, target);

  if (detail.type !== "person" && detail.type !== "context") {
    throw new Error(`wm mode ${mode} target must be a Person or Context.`);
  }

  return {
    id: detail.id,
    path: detail.path,
    type: detail.type,
    name: detail.name,
    aliases: detail.aliases
  };
}

function missingMemoryPrompts(mode: WorkdayModeKind, target: WorkdayModeTarget | undefined): string[] {
  if (mode !== "meeting") {
    return [];
  }

  const name = target?.name ?? "this meeting";
  return [
    `What should Assisto know before meeting with ${name}?`,
    `What source Event would support a better answer about ${name}?`,
    `What uncertainty or ReviewItem should I resolve before meeting with ${name}?`
  ];
}

function afterMeetingPrompts(mode: WorkdayModeKind, target: WorkdayModeTarget | undefined): string[] {
  if (mode !== "after-meeting") {
    return [];
  }

  const name = target?.name ?? "this meeting";
  return [
    `Capture outcomes after meeting with ${name}.`,
    `Record decisions as ordinary claims on the relevant Person or Context page through capture/review.`,
    `Log any retrieval miss if Assisto lacked context during the meeting.`
  ];
}

function suggestedFollowupChecks(mode: WorkdayModeKind, target: WorkdayModeTarget | undefined): string[] {
  if (mode !== "after-meeting") {
    return [];
  }

  const name = target?.name ?? "the meeting";
  return [
    `Only create follow-ups for explicit follow-up language from ${name}.`,
    "Check for phrases like 'I need to', 'I will', 'Remind me to', or an explicit due date.",
    "Do not create follow-ups from merely discussed topics."
  ];
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
    ...result.logged_misses.map((miss) => miss.id),
    ...(result.brief?.evidenceEvents.map((event) => event.id) ?? [])
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
    ...result.logged_misses.map((miss) => miss.path),
    ...(result.target ? [result.target.path] : []),
    ...(result.brief?.activeClaims.map((claim) => claim.page_path) ?? []),
    ...(result.brief?.uncertainClaims.map((claim) => claim.page_path) ?? []),
    ...(result.brief?.openFollowUps.map((followup) => followup.path) ?? []),
    ...(result.brief?.reviewItems.map((item) => item.path) ?? [])
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
