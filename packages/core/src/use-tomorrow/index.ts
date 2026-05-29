import path from "node:path";
import { readFile } from "node:fs/promises";
import { buildActivationStatusResult, type ActivationMemoryState, type ActivationStatusOptions } from "../activation";
import { buildDogfoodHomeResult } from "../dogfood";

export type UseAssistoTomorrowOptions = ActivationStatusOptions;

export type UseAssistoTomorrowStepState = "complete" | "ready" | "blocked";

export type UseAssistoTomorrowStepId =
  | "seed"
  | "capture"
  | "review_one_transaction"
  | "ask_cited_question"
  | "pin_question"
  | "preview_missing_memory"
  | "generate_brief"
  | "run_health";

export interface UseAssistoTomorrowStep {
  step_id: UseAssistoTomorrowStepId;
  label: string;
  state: UseAssistoTomorrowStepState;
  completed: boolean;
  detail: string;
  route_hint: string;
  command_hint: string;
}

export interface UseAssistoTomorrowResult {
  generated_at: string;
  memory_state: ActivationMemoryState;
  complete: boolean;
  counts: {
    seeded_people: number;
    seeded_contexts: number;
    seeded_topics: number;
    seeded_pages: number;
    events: number;
    pending_transactions: number;
    review_backlog: number;
    open_followups: number;
    health_blockers: number;
    pinned_questions: number;
    recent_retrieval_misses: number;
  };
  steps: UseAssistoTomorrowStep[];
  next_step: UseAssistoTomorrowStep;
  suggested_actions: string[];
  linked_routes: {
    activation: string;
    capture: string;
    review: string;
    transactions: string;
    ask: string;
    missing_memory_preview: string;
    brief: string;
    health: string;
    dogfood_eval: string;
  };
  warnings: string[];
}

export async function buildUseAssistoTomorrowResult(
  root: string,
  options: UseAssistoTomorrowOptions = {}
): Promise<UseAssistoTomorrowResult> {
  const [activation, dogfoodHome, pinnedQuestions] = await Promise.all([
    buildActivationStatusResult(root, options),
    buildDogfoodHomeResult(root, options),
    readPinnedQuestions(root)
  ]);
  const recentRetrievalMisses = dogfoodHome.recent_friction_logs.filter((log) => log.kind === "retrieval_miss").length;
  const seededPages = activation.counts.seeded_people + activation.counts.seeded_contexts + activation.counts.seeded_topics;
  const counts = {
    seeded_people: activation.counts.seeded_people,
    seeded_contexts: activation.counts.seeded_contexts,
    seeded_topics: activation.counts.seeded_topics,
    seeded_pages: seededPages,
    events: activation.counts.events,
    pending_transactions: activation.counts.pending_transactions,
    review_backlog: activation.counts.review_backlog,
    open_followups: activation.counts.open_followups,
    health_blockers: activation.counts.health_blockers,
    pinned_questions: pinnedQuestions.length,
    recent_retrieval_misses: recentRetrievalMisses
  };
  const steps = buildSteps({
    counts,
    askReady: activation.first_useful_ask.ready,
    suggestedAskQuestions: activation.first_useful_ask.suggested_questions,
    briefReady: activation.wizard_steps.find((step) => step.step_id === "generate_brief")?.state === "ready"
  });
  const nextStep = steps.find((step) => step.state === "ready") ?? steps.find((step) => step.state === "blocked") ?? steps[steps.length - 1];

  return {
    generated_at: activation.generated_at,
    memory_state: activation.memory_state,
    complete: steps.every((step) => step.state === "complete"),
    counts,
    steps,
    next_step: nextStep,
    suggested_actions: suggestedActions(steps),
    linked_routes: {
      activation: "/api/activation/status",
      capture: "/api/capture/preview",
      review: "/api/review/turbo",
      transactions: "/api/transactions",
      ask: "/api/ask/session",
      missing_memory_preview: "/api/ask/missing-memory/preview",
      brief: "/api/brief?kind=today",
      health: "/api/health",
      dogfood_eval: "/api/dogfood/eval"
    },
    warnings: uniqueStrings([...activation.warnings, ...dogfoodHome.warnings])
  };
}

function buildSteps(input: {
  counts: UseAssistoTomorrowResult["counts"];
  askReady: boolean;
  suggestedAskQuestions: string[];
  briefReady: boolean;
}): UseAssistoTomorrowStep[] {
  const seeded = input.counts.seeded_pages > 0;
  const captured = input.counts.events > 0;
  const reviewOpen = input.counts.pending_transactions + input.counts.review_backlog > 0;
  const pinned = input.counts.pinned_questions > 0;
  const retrievalMissLogged = input.counts.recent_retrieval_misses > 0;

  return [
    step({
      step_id: "seed",
      label: "Seed one real work fact",
      state: seeded ? "complete" : "ready",
      detail: seeded ? "At least one Person, Context, or Topic page is available." : "Use the Seed Kit or Capture tab to create the first Event-backed proposal.",
      route_hint: "#capture",
      command_hint: "wm seed kit --file <json|md> --dry-run"
    }),
    step({
      step_id: "capture",
      label: "Capture one real note",
      state: captured ? "complete" : "ready",
      detail: captured ? "At least one Event exists." : "Capture a small work note before expecting useful retrieval.",
      route_hint: "#capture",
      command_hint: 'wm capture "Jeff is my manager." --dry-run'
    }),
    step({
      step_id: "review_one_transaction",
      label: "Review one memory proposal",
      state: reviewOpen ? "ready" : captured && seeded ? "complete" : "blocked",
      detail: reviewOpen
        ? "Preview and decide one pending Transaction or staged ReviewItem."
        : captured && seeded
          ? "No pending first-day review item is currently blocking the loop."
          : "Create a capture before reviewing memory proposals.",
      route_hint: reviewOpen ? "#transactions" : "#review",
      command_hint: "wm tx list"
    }),
    step({
      step_id: "ask_cited_question",
      label: "Ask one cited question",
      state: pinned ? "complete" : input.askReady ? "ready" : "blocked",
      detail: pinned
        ? "A local pinned question records that an Ask flow has been selected."
        : input.askReady
          ? `Try: ${input.suggestedAskQuestions[0] ?? "Who is my manager?"}`
          : "Ask needs Event-backed pages first.",
      route_hint: "#ask",
      command_hint: 'wm ask --answer-basis "Who is my manager?"'
    }),
    step({
      step_id: "pin_question",
      label: "Pin one real question",
      state: pinned ? "complete" : input.askReady ? "ready" : "blocked",
      detail: pinned ? "At least one local question is pinned under .assisto-local." : "Pin a question from Ask so dogfood progress can be measured locally.",
      route_hint: "#ask",
      command_hint: "Use the Ask tab pin control"
    }),
    step({
      step_id: "preview_missing_memory",
      label: "Preview a missing-memory action",
      state: retrievalMissLogged ? "complete" : captured ? "ready" : "blocked",
      detail: retrievalMissLogged
        ? "A recent retrieval-miss friction log exists."
        : captured
          ? "Ask a no-match question and preview the missing-memory action or log a retrieval miss."
          : "Capture at least one Event before judging missing memory.",
      route_hint: "#ask",
      command_hint: 'wm friction log --kind retrieval_miss --note "<what memory could not answer>"'
    }),
    step({
      step_id: "generate_brief",
      label: "Generate one disposable brief",
      state: input.briefReady ? "ready" : "blocked",
      detail: input.briefReady ? "Briefs can be derived from the current evidence-backed memory." : "Briefs need at least one Event-backed page.",
      route_hint: "#briefs",
      command_hint: "wm brief today"
    }),
    step({
      step_id: "run_health",
      label: "Run memory health",
      state: input.counts.health_blockers > 0 ? "ready" : "complete",
      detail:
        input.counts.health_blockers > 0
          ? "High-severity health blockers need manual review."
          : "No high-severity health blockers are currently derived.",
      route_hint: "#health",
      command_hint: "wm health check"
    })
  ];
}

function step(input: Omit<UseAssistoTomorrowStep, "completed">): UseAssistoTomorrowStep {
  return {
    ...input,
    completed: input.state === "complete"
  };
}

function suggestedActions(steps: UseAssistoTomorrowStep[]): string[] {
  return steps
    .filter((step) => step.state === "ready")
    .slice(0, 4)
    .map((step) => `${step.label}: ${step.detail}`);
}

async function readPinnedQuestions(root: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(path.join(root, ".assisto-local", "retrieval", "questions.json"), "utf8")) as {
      questions?: unknown;
    };
    return Array.isArray(parsed.questions)
      ? parsed.questions.filter((question): question is string => typeof question === "string" && question.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
