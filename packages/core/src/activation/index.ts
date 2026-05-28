import { listMarkdownFiles, readMarkdownPage } from "../fs";
import { parseMarkdownFile, type FrontmatterValue } from "../markdown";
import { buildTodayWorkbenchResult, type TodayFollowUpSummary, type TodayReviewGroup, type TodayTransactionSummary } from "../today";
import type { MemoryHealthFinding } from "../health";

export interface ActivationStatusOptions {
  now?: string;
}

export type ActivationMemoryState = "empty" | "seeded" | "active";
export type ActivationWizardStepState = "complete" | "ready" | "blocked";

export interface ActivationStatusResult {
  generated_at: string;
  activated: boolean;
  memory_state: ActivationMemoryState;
  counts: {
    seeded_people: number;
    seeded_contexts: number;
    seeded_topics: number;
    events: number;
    pending_transactions: number;
    review_backlog: number;
    open_followups: number;
    health_blockers: number;
  };
  seeded_people: ActivationSeededObject[];
  seeded_contexts: ActivationSeededObject[];
  pending_transactions: TodayTransactionSummary[];
  review_backlog: TodayReviewGroup[];
  open_followups: TodayFollowUpSummary[];
  first_useful_ask: ActivationAskReadiness;
  health_blockers: ActivationHealthBlocker[];
  wizard_steps: ActivationWizardStep[];
  next_wizard_step: ActivationWizardStep;
  environment: ActivationEnvironment;
  suggested_next_action: string;
  warnings: string[];
}

export interface ActivationSeededObject {
  id: string;
  path: string;
  type: "person" | "context" | "topic";
  name: string;
  source_events: string[];
}

export interface ActivationAskReadiness {
  ready: boolean;
  suggested_questions: string[];
  blockers: string[];
}

export interface ActivationHealthBlocker {
  finding_id: string;
  severity: string;
  code: string;
  message: string;
  affected_files: string[];
  source_events: string[];
  suggested_action: string;
}

export interface ActivationWizardStep {
  step_id:
    | "check_environment"
    | "create_first_capture"
    | "review_one_transaction"
    | "ask_cited_question"
    | "generate_brief"
    | "run_health";
  label: string;
  state: ActivationWizardStepState;
  detail: string;
  route_hint: string;
}

export interface ActivationEnvironment {
  workbench_ready: boolean;
  openai_configured: boolean;
  local_first: true;
  canonical_memory_path: "memory/";
}

interface ActivationPageSummary extends ActivationSeededObject {
  recorded_at?: string;
}

const defaultNow = "2026-05-26T12:00:00.000Z";

export async function buildActivationStatusResult(
  root: string,
  options: ActivationStatusOptions = {}
): Promise<ActivationStatusResult> {
  const now = options.now ?? defaultNow;
  const today = await buildTodayWorkbenchResult(root, { now });
  const pages = await collectActivationPages(root);
  const people = pages.filter((page) => page.type === "person");
  const contexts = pages.filter((page) => page.type === "context");
  const topics = pages.filter((page) => page.type === "topic");
  const eventCount = await countMarkdownFiles(root, "memory/events/**/*.md");
  const healthBlockers = today.health.findings.filter((finding) => finding.severity === "high").map(healthBlocker);
  const firstUsefulAsk = firstUsefulAskReadiness({
    eventCount,
    peopleCount: people.length,
    contextsCount: contexts.length,
    topicsCount: topics.length,
    openFollowupsCount: today.open_followups.length
  });
  const memoryState = activationMemoryState({
    eventCount,
    peopleCount: people.length,
    contextsCount: contexts.length,
    topicsCount: topics.length
  });
  const wizardSteps = activationWizardSteps({
    eventCount,
    hasSeededPages: people.length + contexts.length + topics.length > 0,
    hasPendingTransactions: today.pending_transactions.length > 0,
    hasReviewBacklog: today.staged_review_groups.length > 0,
    hasHealthBlockers: healthBlockers.length > 0,
    firstUsefulAskReady: firstUsefulAsk.ready
  });
  const nextWizardStep = wizardSteps.find((step) => step.state !== "complete") ?? wizardSteps[wizardSteps.length - 1];

  return {
    generated_at: now,
    activated: memoryState !== "empty",
    memory_state: memoryState,
    counts: {
      seeded_people: people.length,
      seeded_contexts: contexts.length,
      seeded_topics: topics.length,
      events: eventCount,
      pending_transactions: today.pending_transactions.length,
      review_backlog: today.staged_review_groups.reduce((sum, group) => sum + group.count, 0),
      open_followups: today.open_followups.length,
      health_blockers: healthBlockers.length
    },
    seeded_people: people,
    seeded_contexts: contexts,
    pending_transactions: today.pending_transactions,
    review_backlog: today.staged_review_groups,
    open_followups: today.open_followups,
    first_useful_ask: firstUsefulAsk,
    health_blockers: healthBlockers,
    wizard_steps: wizardSteps,
    next_wizard_step: nextWizardStep,
    environment: {
      workbench_ready: true,
      openai_configured: Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.ASSISTO_OPENAI_MODEL?.trim()),
      local_first: true,
      canonical_memory_path: "memory/"
    },
    suggested_next_action: suggestedNextAction(nextWizardStep),
    warnings: today.warnings
  };
}

async function collectActivationPages(root: string): Promise<ActivationPageSummary[]> {
  const pages: ActivationPageSummary[] = [];

  for (const file of await listFilesOrEmpty(root, [
    "memory/people/*.md",
    "memory/people/**/*.md",
    "memory/contexts/*.md",
    "memory/contexts/**/*.md",
    "memory/topics/*.md",
    "memory/topics/**/*.md"
  ])) {
    try {
      const parsed = parseMarkdownFile(await readMarkdownPage(root, file));
      const type = parsed.frontmatter.type;

      if ((type !== "person" && type !== "context" && type !== "topic") || parsed.frontmatter.object_state === "archived") {
        continue;
      }

      pages.push({
        id: stringValue(parsed.frontmatter.id) ?? file,
        path: file,
        type,
        name: pageName(parsed.body, file),
        source_events: stringArrayValue(parsed.frontmatter.source_events),
        recorded_at: stringValue(parsed.frontmatter.recorded_at) ?? stringValue(parsed.frontmatter.created_at)
      });
    } catch {
      continue;
    }
  }

  return pages.sort((left, right) => left.path.localeCompare(right.path));
}

async function listFilesOrEmpty(root: string, patterns: string | string[]): Promise<string[]> {
  try {
    if (Array.isArray(patterns)) {
      const files = new Set<string>();

      for (const pattern of patterns) {
        try {
          for (const file of await listMarkdownFiles(root, pattern)) {
            files.add(file);
          }
        } catch {
          continue;
        }
      }

      return [...files].sort();
    }

    return await listMarkdownFiles(root, patterns);
  } catch {
    return [];
  }
}

async function countMarkdownFiles(root: string, pattern: string): Promise<number> {
  return (await listFilesOrEmpty(root, pattern)).length;
}

function firstUsefulAskReadiness(input: {
  eventCount: number;
  peopleCount: number;
  contextsCount: number;
  topicsCount: number;
  openFollowupsCount: number;
}): ActivationAskReadiness {
  const blockers: string[] = [];

  if (input.eventCount === 0) {
    blockers.push("Capture or import at least one Event before asking memory-backed questions.");
  }

  if (input.peopleCount + input.contextsCount + input.topicsCount === 0) {
    blockers.push("Apply or seed at least one Person, Context, or Topic page with Event evidence.");
  }

  const suggested = [
    input.peopleCount > 0 ? "Who is my manager?" : null,
    input.contextsCount > 0 ? "What is active in my current project?" : null,
    input.openFollowupsCount > 0 ? "What follow-ups are open?" : null,
    input.eventCount > 0 ? "What changed recently?" : null
  ].filter((question): question is string => Boolean(question));

  return {
    ready: blockers.length === 0,
    suggested_questions: suggested.length > 0 ? suggested : ["What note should I capture first?"],
    blockers
  };
}

function activationMemoryState(input: {
  eventCount: number;
  peopleCount: number;
  contextsCount: number;
  topicsCount: number;
}): ActivationMemoryState {
  const pageCount = input.peopleCount + input.contextsCount + input.topicsCount;

  if (input.eventCount === 0 && pageCount === 0) {
    return "empty";
  }

  return input.contextsCount > 0 && input.peopleCount > 0 ? "active" : "seeded";
}

function activationWizardSteps(input: {
  eventCount: number;
  hasSeededPages: boolean;
  hasPendingTransactions: boolean;
  hasReviewBacklog: boolean;
  hasHealthBlockers: boolean;
  firstUsefulAskReady: boolean;
}): ActivationWizardStep[] {
  const captureComplete = input.eventCount > 0;
  const reviewComplete = captureComplete && input.hasSeededPages && !input.hasPendingTransactions && !input.hasReviewBacklog;
  const reviewState: ActivationWizardStepState = reviewComplete
    ? "complete"
    : input.hasPendingTransactions || input.hasReviewBacklog
      ? "ready"
      : captureComplete
        ? "complete"
        : "blocked";
  const askState: ActivationWizardStepState = input.firstUsefulAskReady ? "ready" : "blocked";
  const briefState: ActivationWizardStepState = captureComplete && input.hasSeededPages ? "ready" : "blocked";

  return [
    {
      step_id: "check_environment",
      label: "Check local setup",
      state: "complete",
      detail: "Workbench can derive activation state from local markdown memory.",
      route_hint: "/api/activation/status"
    },
    {
      step_id: "create_first_capture",
      label: "Create the first capture",
      state: captureComplete ? "complete" : "ready",
      detail: captureComplete ? "At least one Event exists." : "Capture a small real work note.",
      route_hint: "#capture"
    },
    {
      step_id: "review_one_transaction",
      label: "Review one memory proposal",
      state: reviewState,
      detail:
        reviewState === "complete"
          ? "Seeded pages exist and no first-run review queue is blocking activation."
          : reviewState === "ready"
            ? "Preview one pending Transaction or staged ReviewItem."
            : "Create a capture before reviewing memory proposals.",
      route_hint: input.hasPendingTransactions ? "#transactions" : "#review"
    },
    {
      step_id: "ask_cited_question",
      label: "Ask one cited question",
      state: askState,
      detail: input.firstUsefulAskReady ? "Memory has enough evidence-backed pages for a useful Ask." : "Ask needs Event-backed pages first.",
      route_hint: "#ask"
    },
    {
      step_id: "generate_brief",
      label: "Generate one disposable brief",
      state: briefState,
      detail: briefState === "ready" ? "Briefs can use the current evidence-backed memory." : "Briefs need at least one seeded page.",
      route_hint: "#briefs"
    },
    {
      step_id: "run_health",
      label: "Run memory health",
      state: input.hasHealthBlockers ? "ready" : "complete",
      detail: input.hasHealthBlockers ? "High-severity health blockers need review." : "No high-severity health blockers are currently derived.",
      route_hint: "#health"
    }
  ];
}

function suggestedNextAction(step: ActivationWizardStep): string {
  switch (step.step_id) {
    case "create_first_capture":
      return "Capture one small real work note.";
    case "review_one_transaction":
      return "Review pending transaction or staged review item.";
    case "ask_cited_question":
      return "Ask one cited question from the Ask tab.";
    case "generate_brief":
      return "Generate a disposable brief from current memory.";
    case "run_health":
      return "Review high-severity memory health blockers.";
    case "check_environment":
      return "Check local Workbench setup.";
  }
}

function healthBlocker(finding: MemoryHealthFinding): ActivationHealthBlocker {
  return {
    finding_id: finding.finding_id,
    severity: finding.severity,
    code: finding.code,
    message: finding.message,
    affected_files: finding.affected_files,
    source_events: finding.source_events,
    suggested_action: finding.suggested_action
  };
}

function pageName(body: string, file: string): string {
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();

  if (heading) {
    return heading;
  }

  return file
    .split("/")
    .pop()
    ?.replace(/\.md$/, "")
    .replace(/[-_]+/g, " ") ?? file;
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
