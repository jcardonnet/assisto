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
import { parseCaptureFeedbackRawText, type CaptureFeedbackKind } from "../capture-feedback";
import { parseFrictionRawText, type FrictionLogKind } from "../friction";
import { buildImportAssistantResult, type ImportAssistantResult } from "../import";
import { listSourceInboxSessions, type SourceInboxListResult } from "../source-inbox";
import { buildSymbolicIndex, type SymbolicIndexResult } from "../symbolic";
import { runPersonalDogfoodEval, type PersonalDogfoodEvalMetrics, type PersonalDogfoodEvalQuestionResult } from "../dogfood-eval";
import { parseDogfoodFeedbackRawText, type DogfoodFeedbackKind } from "./feedback";

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
  recent_capture_feedback: DogfoodCaptureFeedbackSummary[];
  recent_dogfood_feedback: DogfoodFeedbackSummary[];
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
  | "capture_note"
  | "triage_source_inbox"
  | "answer_dogfood_question"
  | "improve_proof_coverage";

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

export interface DogfoodCaptureFeedbackSummary {
  id: string;
  path: string;
  recorded_at?: string;
  source_label: string;
  kind: CaptureFeedbackKind | string;
  linked_event?: string;
  linked_transaction?: string;
  note: string;
}

export interface DogfoodFeedbackSummary {
  id: string;
  path: string;
  recorded_at?: string;
  source_label: string;
  kind: DogfoodFeedbackKind | string;
  question?: string;
  note: string;
}

export interface DogfoodControlRoomResult {
  version: "dogfood-control-room-v10";
  generated_at: string;
  next_recommended_action: DogfoodRecommendedAction;
  source_inbox_backlog: DogfoodSourceInboxBacklog;
  import_progress: DogfoodImportProgress;
  top_unanswered_questions: DogfoodUnansweredQuestion[];
  review_bottlenecks: DogfoodReviewBottleneck[];
  proof_coverage: DogfoodProofCoverage;
  stale_or_missing_source_warnings: string[];
  dogfood_eval_metrics: PersonalDogfoodEvalMetrics;
  home: DogfoodHomeResult;
  warnings: string[];
  canonical_writes: [];
}

export interface DogfoodSourceInboxBacklog {
  session_count: number;
  units_total: number;
  untriaged_units: number;
  kept_units: number;
  skipped_units: number;
  duplicate_units: number;
  sessions: DogfoodSourceInboxSessionSummary[];
}

export interface DogfoodSourceInboxSessionSummary {
  session_id: string;
  adapter_kind: string;
  import_status: string;
  unit_count: number;
  untriaged_units: number;
  duplicate_units: number;
  updated_at: string;
  source_label?: string;
  source_path?: string;
}

export interface DogfoodImportProgress {
  session_count: number;
  review_load_level: string;
  estimated_review_minutes: number;
  likely_counts: ImportAssistantResult["likely_counts"];
  suggested_next_batch_size: number;
  suggested_actions: string[];
  warnings: string[];
}

export interface DogfoodUnansweredQuestion {
  question: string;
  tags: string[];
  expected_items: number;
  found_expected_items: number;
  missing_expected_items: number;
  missing_memory_guidance: boolean;
  suggested_action: string;
}

export interface DogfoodReviewBottleneck {
  review_reason: string;
  count: number;
  severity: "low" | "medium" | "high";
  sample_review_ids: string[];
  suggested_action: string;
}

export interface DogfoodProofCoverage {
  fact_count: number;
  proof_count: number;
  facts_with_event_citations: number;
  source_event_coverage: number;
  missing_event_citation_fact_ids: string[];
  proof_tree_ready: boolean;
  warnings: string[];
}

const totalDailySteps = 5;

export async function buildDogfoodHomeResult(
  root: string,
  options: TodayWorkbenchOptions = {}
): Promise<DogfoodHomeResult> {
  const today = await buildTodayWorkbenchResult(root, options);
  const recentFrictionLogs = await collectRecentFrictionLogs(root, options.recentLimit ?? 8);
  const recentCaptureFeedback = await collectRecentCaptureFeedback(root, options.recentLimit ?? 8);
  const recentDogfoodFeedback = await collectRecentDogfoodFeedback(root, options.recentLimit ?? 8);

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
    recent_capture_feedback: recentCaptureFeedback,
    recent_dogfood_feedback: recentDogfoodFeedback,
    health_warnings: today.health_warnings,
    suggested_manual_actions: today.suggested_manual_actions,
    warnings: today.warnings,
    today
  };
}


export async function buildDogfoodControlRoomResult(
  root: string,
  options: TodayWorkbenchOptions = {}
): Promise<DogfoodControlRoomResult> {
  const [home, sourceInbox, importAssistant, dogfoodEval, symbolicRead] = await Promise.all([
    buildDogfoodHomeResult(root, options),
    listSourceInboxSessions(root),
    buildImportAssistantResult(root, { now: options.now }),
    runPersonalDogfoodEval(root, { now: options.now }),
    readSymbolicIndexForControlRoom(root)
  ]);
  const sourceInboxBacklog = sourceInboxBacklogSummary(sourceInbox);
  const importProgress = importProgressSummary(importAssistant);
  const topUnansweredQuestions = topUnansweredDogfoodQuestions(dogfoodEval.questions);
  const reviewBottlenecks = reviewBottlenecksFrom(home.staged_review_groups);
  const proofCoverage = proofCoverageSummary(symbolicRead.index);
  const staleOrMissingSourceWarnings = staleOrMissingSourceWarningsFor({
    home,
    sourceInboxBacklog,
    topUnansweredQuestions,
    proofCoverage,
    symbolicWarning: symbolicRead.warning
  });
  const warnings = uniqueStrings([
    ...home.warnings,
    ...importProgress.warnings,
    ...dogfoodEval.warnings,
    ...proofCoverage.warnings,
    ...staleOrMissingSourceWarnings,
    symbolicRead.warning
  ]);

  return {
    version: "dogfood-control-room-v10",
    generated_at: home.generated_at,
    next_recommended_action: nextControlRoomAction({
      home,
      sourceInboxBacklog,
      topUnansweredQuestions,
      proofCoverage
    }),
    source_inbox_backlog: sourceInboxBacklog,
    import_progress: importProgress,
    top_unanswered_questions: topUnansweredQuestions,
    review_bottlenecks: reviewBottlenecks,
    proof_coverage: proofCoverage,
    stale_or_missing_source_warnings: staleOrMissingSourceWarnings,
    dogfood_eval_metrics: dogfoodEval.metrics,
    home,
    warnings,
    canonical_writes: []
  };
}

async function collectRecentDogfoodFeedback(root: string, limit: number): Promise<DogfoodFeedbackSummary[]> {
  const feedbackItems: DogfoodFeedbackSummary[] = [];

  for (const file of await listEventFilesOrEmpty(root)) {
    try {
      const parsed = parseMarkdownFile(await readMarkdownPage(root, file));
      const sourceLabel = stringValue(parsed.frontmatter.source_label);

      if (!sourceLabel?.startsWith("dogfood:")) {
        continue;
      }

      const rawText = getSection(parsed.body, "Raw text") ?? "";
      const feedback = parseDogfoodFeedbackRawText(rawText);

      if (!feedback) {
        continue;
      }

      feedbackItems.push({
        id: stringValue(parsed.frontmatter.id) ?? file,
        path: file,
        recorded_at: stringValue(parsed.frontmatter.recorded_at),
        source_label: sourceLabel,
        kind: feedback.kind,
        question: feedback.question,
        note: feedback.note
      });
    } catch {
      // Health/lint surfaces malformed Event pages; Dogfood Home keeps reading.
    }
  }

  return feedbackItems.sort(newestDogfoodFeedbackFirst).slice(0, limit);
}

async function collectRecentCaptureFeedback(root: string, limit: number): Promise<DogfoodCaptureFeedbackSummary[]> {
  const feedbackItems: DogfoodCaptureFeedbackSummary[] = [];

  for (const file of await listEventFilesOrEmpty(root)) {
    try {
      const parsed = parseMarkdownFile(await readMarkdownPage(root, file));
      const sourceLabel = stringValue(parsed.frontmatter.source_label);

      if (!sourceLabel?.startsWith("capture_feedback:")) {
        continue;
      }

      const rawText = getSection(parsed.body, "Raw text") ?? "";
      const feedback = parseCaptureFeedbackRawText(rawText);

      if (!feedback) {
        continue;
      }

      feedbackItems.push({
        id: stringValue(parsed.frontmatter.id) ?? file,
        path: file,
        recorded_at: stringValue(parsed.frontmatter.recorded_at),
        source_label: sourceLabel,
        kind: feedback.kind,
        linked_event: feedback.linked_event,
        linked_transaction: feedback.linked_transaction,
        note: feedback.note
      });
    } catch {
      // Health/lint surfaces malformed Event pages; Dogfood Home keeps reading.
    }
  }

  return feedbackItems.sort(newestFeedbackFirst).slice(0, limit);
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

function newestDogfoodFeedbackFirst(left: DogfoodFeedbackSummary, right: DogfoodFeedbackSummary): number {
  return (right.recorded_at ?? "").localeCompare(left.recorded_at ?? "") || left.id.localeCompare(right.id);
}

function newestFeedbackFirst(left: DogfoodCaptureFeedbackSummary, right: DogfoodCaptureFeedbackSummary): number {
  return (right.recorded_at ?? "").localeCompare(left.recorded_at ?? "") || left.id.localeCompare(right.id);
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

interface SymbolicControlRoomRead {
  index: SymbolicIndexResult;
  warning?: string;
}

async function readSymbolicIndexForControlRoom(root: string): Promise<SymbolicControlRoomRead> {
  try {
    return {
      index: await buildSymbolicIndex({ root, write: false })
    };
  } catch (error) {
    return {
      index: {
        derived_facts: [],
        proofs: [],
        canonical_writes: [],
        index_paths: []
      },
      warning: `Could not derive symbolic proof coverage: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function sourceInboxBacklogSummary(result: SourceInboxListResult): DogfoodSourceInboxBacklog {
  const sessions = result.sessions.map((session) => ({
    session_id: session.session_id,
    adapter_kind: String(session.adapter_kind),
    import_status: session.import_status,
    unit_count: session.unit_count,
    untriaged_units: session.triage_counts.untriaged ?? 0,
    duplicate_units: session.duplicate_units,
    updated_at: session.updated_at,
    source_label: session.source_label,
    source_path: session.source_path
  }));

  return {
    session_count: result.session_count,
    units_total: sumNumbers(result.sessions.map((session) => session.unit_count)),
    untriaged_units: sumNumbers(result.sessions.map((session) => session.triage_counts.untriaged ?? 0)),
    kept_units: sumNumbers(result.sessions.map((session) => session.triage_counts.keep ?? 0)),
    skipped_units: sumNumbers(result.sessions.map((session) => session.triage_counts.skip ?? 0)),
    duplicate_units: sumNumbers(result.sessions.map((session) => session.duplicate_units)),
    sessions
  };
}

function importProgressSummary(result: ImportAssistantResult): DogfoodImportProgress {
  return {
    session_count: result.session_count,
    review_load_level: result.review_load_forecast.level,
    estimated_review_minutes: result.review_load_forecast.estimated_review_minutes,
    likely_counts: result.likely_counts,
    suggested_next_batch_size: result.suggested_next_batch_size,
    suggested_actions: [...result.suggested_actions],
    warnings: [...result.warnings]
  };
}

function topUnansweredDogfoodQuestions(questions: PersonalDogfoodEvalQuestionResult[]): DogfoodUnansweredQuestion[] {
  return questions
    .filter((question) => !question.answerable || question.found_expected_items < question.expected_items)
    .map((question) => ({
      question: question.question,
      tags: [...question.tags],
      expected_items: question.expected_items,
      found_expected_items: question.found_expected_items,
      missing_expected_items: Math.max(question.expected_items - question.found_expected_items, 0),
      missing_memory_guidance: question.missing_memory_guidance,
      suggested_action: question.missing_memory_guidance
        ? "Capture or import source material for the missing memory."
        : "Inspect the answer basis and add missing-memory feedback."
    }))
    .sort((left, right) => right.missing_expected_items - left.missing_expected_items || left.question.localeCompare(right.question))
    .slice(0, 5);
}

function reviewBottlenecksFrom(groups: TodayReviewGroup[]): DogfoodReviewBottleneck[] {
  return groups
    .map((group) => ({
      review_reason: group.review_reason,
      count: group.count,
      severity: reviewBottleneckSeverity(group.count),
      sample_review_ids: group.items.map((item) => item.id).filter((id): id is string => typeof id === "string").slice(0, 5),
      suggested_action: group.suggested_action
    }))
    .sort((left, right) => right.count - left.count || left.review_reason.localeCompare(right.review_reason));
}

function reviewBottleneckSeverity(count: number): "low" | "medium" | "high" {
  if (count >= 10) {
    return "high";
  }

  if (count >= 3) {
    return "medium";
  }

  return "low";
}

function proofCoverageSummary(index: SymbolicIndexResult): DogfoodProofCoverage {
  const facts = index.derived_facts;
  const missingEventCitationFactIds = facts
    .filter((fact) => fact.source_events.length === 0)
    .map((fact) => fact.fact_id)
    .slice(0, 10);
  const factsWithEventCitations = facts.filter((fact) => fact.source_events.length > 0).length;
  const warnings: string[] = [];

  if (facts.length === 0) {
    warnings.push("No symbolic proof facts are available yet; capture, import, or review source-backed claims first.");
  }

  if (missingEventCitationFactIds.length > 0) {
    warnings.push("Some symbolic facts are missing Event citations.");
  }

  return {
    fact_count: facts.length,
    proof_count: index.proofs.length,
    facts_with_event_citations: factsWithEventCitations,
    source_event_coverage: ratio(factsWithEventCitations, facts.length),
    missing_event_citation_fact_ids: missingEventCitationFactIds,
    proof_tree_ready: facts.length > 0 && index.proofs.length >= facts.length && missingEventCitationFactIds.length === 0,
    warnings
  };
}

function staleOrMissingSourceWarningsFor(input: {
  home: DogfoodHomeResult;
  sourceInboxBacklog: DogfoodSourceInboxBacklog;
  topUnansweredQuestions: DogfoodUnansweredQuestion[];
  proofCoverage: DogfoodProofCoverage;
  symbolicWarning?: string;
}): string[] {
  const warnings: string[] = [];

  if (input.sourceInboxBacklog.untriaged_units > 0) {
    warnings.push(`Source Inbox has ${input.sourceInboxBacklog.untriaged_units} untriaged unit(s) waiting for import decisions.`);
  }

  if (input.home.stale_noop_events.length > 0) {
    warnings.push(`There are ${input.home.stale_noop_events.length} stale NOOP Event(s) that may need source reprocessing.`);
  }

  if (input.topUnansweredQuestions.length > 0) {
    warnings.push(`Dogfood eval has ${input.topUnansweredQuestions.length} unanswered or partially answered question(s).`);
  }

  if (!input.proofCoverage.proof_tree_ready) {
    warnings.push(...input.proofCoverage.warnings);
  }

  if (input.symbolicWarning) {
    warnings.push(input.symbolicWarning);
  }

  return uniqueStrings(warnings);
}

function nextControlRoomAction(input: {
  home: DogfoodHomeResult;
  sourceInboxBacklog: DogfoodSourceInboxBacklog;
  topUnansweredQuestions: DogfoodUnansweredQuestion[];
  proofCoverage: DogfoodProofCoverage;
}): DogfoodRecommendedAction {
  const sourceSession = input.sourceInboxBacklog.sessions.find((session) => session.untriaged_units > 0);

  if (sourceSession) {
    return {
      action: "triage_source_inbox",
      label: "Triage Source Inbox",
      detail: "Inspect local exported source units and decide what should become Events.",
      target_id: sourceSession.session_id,
      route_hint: "/api/source-inbox/session"
    };
  }

  const homeAction = input.home.next_recommended_action;

  if (homeAction.action !== "capture_note") {
    return homeAction;
  }

  const unanswered = input.topUnansweredQuestions[0];

  if (unanswered) {
    return {
      action: "answer_dogfood_question",
      label: "Improve top unanswered dogfood question",
      detail: unanswered.question,
      route_hint: "/api/ask/contract-v4"
    };
  }

  if (!input.proofCoverage.proof_tree_ready) {
    return {
      action: "improve_proof_coverage",
      label: "Improve proof coverage",
      detail: input.proofCoverage.warnings[0] ?? "Capture or review source-backed claims so symbolic proofs can cite Events.",
      route_hint: "/api/ask/contract-v4"
    };
  }

  return homeAction;
}

function sumNumbers(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}
