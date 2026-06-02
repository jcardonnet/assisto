import { readFile } from "node:fs/promises";
import path from "node:path";
import { listMarkdownFiles, readMarkdownPage } from "../fs";
import { retrieveContextForAnswer, type AnswerBasisResult, type RetrievalManualAction } from "../retrieval";

export interface DogfoodEvalQuestion {
  question: string;
  expected_claim_ids?: string[];
  expected_event_ids?: string[];
  expected_page_paths?: string[];
  expected_review_ids?: string[];
  expected_followup_ids?: string[];
  expected_cannot_confirm?: string[];
  expected_repair_actions?: string[];
  tags?: string[];
}

export type PersonalDogfoodRepairSuggestionAction =
  | "capture_missing_evidence"
  | "log_retrieval_miss"
  | "stage_entity_review"
  | "open_context_room"
  | "pin_question";

export interface PersonalDogfoodRepairSuggestion {
  action: PersonalDogfoodRepairSuggestionAction;
  label: string;
  reason: string;
  endpoint?: string;
  target?: string;
}

export interface PersonalDogfoodEvalResult {
  generated_at: string;
  questions_path: string;
  previous_result_path?: string;
  questions: PersonalDogfoodEvalQuestionResult[];
  metrics: PersonalDogfoodEvalMetrics;
  warnings: string[];
}

export interface PersonalDogfoodEvalQuestionResult {
  question: string;
  tags: string[];
  expected_claim_ids: string[];
  expected_event_ids: string[];
  expected_page_paths: string[];
  expected_review_ids: string[];
  expected_followup_ids: string[];
  expected_cannot_confirm: string[];
  expected_repair_actions: string[];
  found_claim_ids: string[];
  found_event_ids: string[];
  found_page_paths: string[];
  found_review_ids: string[];
  found_followup_ids: string[];
  found_cannot_confirm: string[];
  found_repair_actions: string[];
  expected_items: number;
  found_expected_items: number;
  all_expectations_met: boolean;
  answerable: boolean;
  missing_memory_guidance: boolean;
  cannot_confirm_quality: number;
  repair_action_precision: number;
  irrelevant_inclusion_count: number;
  repair_suggestions: PersonalDogfoodRepairSuggestion[];
  basis: AnswerBasisResult;
}

export interface PersonalDogfoodEvalMetrics {
  total_questions: number;
  answerable_questions: number;
  answerability: number;
  expected_items: number;
  found_expected_items: number;
  citation_coverage: number;
  irrelevant_inclusion_count: number;
  cannot_confirm_quality: number;
  repair_action_precision: number;
  missing_memory_guidance_count: number;
  review_followup_surfacing_count: number;
  generated_persistence_violations: number;
  regression_since_last_run: number;
}

export interface PersonalDogfoodEvalOptions {
  questionsPath?: string;
  previousResultPath?: string;
  now?: string;
}

export async function runPersonalDogfoodEval(
  root: string,
  options: PersonalDogfoodEvalOptions = {}
): Promise<PersonalDogfoodEvalResult> {
  const questionsPath = options.questionsPath ?? defaultDogfoodEvalQuestionsPath(root);
  const previousResultPath = options.previousResultPath ?? defaultDogfoodEvalPreviousResultPath(root);
  const before = await snapshotMemory(root);
  const warnings: string[] = [];
  const questions = await readQuestionFile(questionsPath, warnings);
  const previous = await readPreviousResult(previousResultPath, warnings);
  const results: PersonalDogfoodEvalQuestionResult[] = [];

  for (const question of questions) {
    results.push(await evaluateQuestion(root, question));
  }

  const after = await snapshotMemory(root);
  const generatedPersistenceViolations = snapshotsEqual(before, after) ? 0 : 1;
  const metrics = buildMetrics(results, generatedPersistenceViolations, previous?.metrics);

  return {
    generated_at: options.now ?? new Date().toISOString(),
    questions_path: questionsPath,
    previous_result_path: previousResultPath,
    questions: results,
    metrics,
    warnings
  };
}

export function defaultDogfoodEvalQuestionsPath(root: string): string {
  return path.join(root, ".assisto-local", "eval", "questions.json");
}

export function defaultDogfoodEvalPreviousResultPath(root: string): string {
  return path.join(root, ".assisto-local", "eval", "last-result.json");
}

async function readQuestionFile(filePath: string, warnings: string[]): Promise<DogfoodEvalQuestion[]> {
  let content: string;

  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      warnings.push(`No dogfood eval questions found at ${filePath}.`);
      return [];
    }

    throw error;
  }

  const parsed = JSON.parse(content) as unknown;
  const records = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { questions?: unknown }).questions)
      ? (parsed as { questions: unknown[] }).questions
      : null;

  if (!records) {
    throw new Error("Dogfood eval question file must be an array or an object with a questions array.");
  }

  return records.map(normalizeQuestion);
}

async function readPreviousResult(filePath: string, warnings: string[]): Promise<PersonalDogfoodEvalResult | undefined> {
  let content: string;

  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }

  try {
    const parsed = JSON.parse(content) as PersonalDogfoodEvalResult;
    return parsed && typeof parsed === "object" && parsed.metrics ? parsed : undefined;
  } catch {
    warnings.push(`Ignored malformed previous dogfood eval result at ${filePath}.`);
    return undefined;
  }
}

function normalizeQuestion(record: unknown): DogfoodEvalQuestion {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Dogfood eval questions must be objects.");
  }

  const value = record as Record<string, unknown>;
  const question = typeof value.question === "string" ? value.question.trim() : "";

  if (!question) {
    throw new Error("Dogfood eval question requires a non-empty question.");
  }

  return {
    question,
    expected_claim_ids: stringArray(value.expected_claim_ids),
    expected_event_ids: stringArray(value.expected_event_ids),
    expected_page_paths: stringArray(value.expected_page_paths),
    expected_review_ids: stringArray(value.expected_review_ids),
    expected_followup_ids: stringArray(value.expected_followup_ids),
    expected_cannot_confirm: stringArray(value.expected_cannot_confirm),
    expected_repair_actions: stringArray(value.expected_repair_actions),
    tags: stringArray(value.tags)
  };
}

async function evaluateQuestion(root: string, question: DogfoodEvalQuestion): Promise<PersonalDogfoodEvalQuestionResult> {
  const basis = await retrieveContextForAnswer(root, question.question);
  const expectedClaimIds = question.expected_claim_ids ?? [];
  const expectedEventIds = question.expected_event_ids ?? [];
  const expectedPagePaths = question.expected_page_paths ?? [];
  const expectedReviewIds = question.expected_review_ids ?? [];
  const expectedFollowupIds = question.expected_followup_ids ?? [];
  const expectedCannotConfirm = question.expected_cannot_confirm ?? [];
  const expectedRepairActions = question.expected_repair_actions ?? [];
  const foundClaimIds = intersection(expectedClaimIds, basisClaimIds(basis));
  const foundEventIds = intersection(expectedEventIds, basis.evidenceEvents.map((event) => event.id).filter(isString));
  const foundPagePaths = intersection(expectedPagePaths, basis.matchedPages.map((page) => page.path));
  const foundReviewIds = intersection(expectedReviewIds, basis.linkedReviewItems.map((item) => item.id).filter(isString));
  const foundFollowupIds = intersection(expectedFollowupIds, basis.linkedFollowUps.map((item) => item.id).filter(isString));
  const foundCannotConfirm = matchingExpectedText(expectedCannotConfirm, cannotConfirmTexts(basis));
  const foundRepairActions = intersection(expectedRepairActions, repairActionNames(basis));
  const expectedItems =
    expectedClaimIds.length +
    expectedEventIds.length +
    expectedPagePaths.length +
    expectedReviewIds.length +
    expectedFollowupIds.length +
    expectedCannotConfirm.length +
    expectedRepairActions.length;
  const foundExpectedItems =
    foundClaimIds.length +
    foundEventIds.length +
    foundPagePaths.length +
    foundReviewIds.length +
    foundFollowupIds.length +
    foundCannotConfirm.length +
    foundRepairActions.length;
  const missingMemoryGuidance = hasMissingMemoryGuidance(basis);
  const allExpectationsMet = expectedItems > 0 && foundExpectedItems === expectedItems;
  const answerable = allExpectationsMet || (expectsNoMatch(question) && missingMemoryGuidance);

  return {
    question: question.question,
    tags: question.tags ?? [],
    expected_claim_ids: expectedClaimIds,
    expected_event_ids: expectedEventIds,
    expected_page_paths: expectedPagePaths,
    expected_review_ids: expectedReviewIds,
    expected_followup_ids: expectedFollowupIds,
    expected_cannot_confirm: expectedCannotConfirm,
    expected_repair_actions: expectedRepairActions,
    found_claim_ids: foundClaimIds,
    found_event_ids: foundEventIds,
    found_page_paths: foundPagePaths,
    found_review_ids: foundReviewIds,
    found_followup_ids: foundFollowupIds,
    found_cannot_confirm: foundCannotConfirm,
    found_repair_actions: foundRepairActions,
    expected_items: expectedItems,
    found_expected_items: foundExpectedItems,
    all_expectations_met: allExpectationsMet,
    answerable,
    missing_memory_guidance: missingMemoryGuidance,
    cannot_confirm_quality: ratio(foundCannotConfirm.length, expectedCannotConfirm.length),
    repair_action_precision: repairActionPrecision(foundRepairActions, basis.manualActions, expectedRepairActions),
    irrelevant_inclusion_count: irrelevantInclusionCount(question, basis),
    repair_suggestions: buildRepairSuggestions(question, basis, allExpectationsMet),
    basis
  };
}

function buildMetrics(
  questions: PersonalDogfoodEvalQuestionResult[],
  generatedPersistenceViolations: number,
  previousMetrics?: PersonalDogfoodEvalMetrics
): PersonalDogfoodEvalMetrics {
  const totalQuestions = questions.length;
  const answerableQuestions = questions.filter((question) => question.answerable).length;
  const expectedItems = sum(questions.map((question) => question.expected_items));
  const foundExpectedItems = sum(questions.map((question) => question.found_expected_items));
  const cannotConfirmQuestions = questions.filter((question) => question.expected_cannot_confirm.length > 0);
  const repairActionQuestions = questions.filter((question) => question.expected_repair_actions.length > 0);
  const metrics: PersonalDogfoodEvalMetrics = {
    total_questions: totalQuestions,
    answerable_questions: answerableQuestions,
    answerability: ratio(answerableQuestions, totalQuestions),
    expected_items: expectedItems,
    found_expected_items: foundExpectedItems,
    citation_coverage: ratio(foundExpectedItems, expectedItems),
    irrelevant_inclusion_count: sum(questions.map((question) => question.irrelevant_inclusion_count)),
    cannot_confirm_quality: average(cannotConfirmQuestions.map((question) => question.cannot_confirm_quality)),
    repair_action_precision: average(repairActionQuestions.map((question) => question.repair_action_precision)),
    missing_memory_guidance_count: questions.filter((question) => expectsNoMatch(question) && question.missing_memory_guidance).length,
    review_followup_surfacing_count: sum(
      questions.map((question) => question.found_review_ids.length + question.found_followup_ids.length)
    ),
    generated_persistence_violations: generatedPersistenceViolations,
    regression_since_last_run: 0
  };

  metrics.regression_since_last_run = previousMetrics && scoreForRegression(metrics) < scoreForRegression(previousMetrics) ? 1 : 0;
  return metrics;
}

function basisClaimIds(basis: AnswerBasisResult): string[] {
  return unique([
    ...basis.answerCandidates.map((claim) => claim.claim_id),
    ...basis.supportingClaims.map((claim) => claim.claim_id),
    ...basis.activeClaims.map((claim) => claim.claim_id),
    ...basis.uncertainClaims.map((claim) => claim.claim_id)
  ]);
}

function hasMissingMemoryGuidance(basis: AnswerBasisResult): boolean {
  return (
    basis.missingInformation.some((item) => item.code === "no_match") ||
    basis.manualActions.some((action) => action.action === "capture_note" || action.action === "log_friction")
  );
}

function expectsNoMatch(question: { expected_items?: number; expected_claim_ids?: string[]; expected_event_ids?: string[]; expected_page_paths?: string[]; expected_review_ids?: string[]; expected_followup_ids?: string[]; expected_cannot_confirm?: string[]; expected_repair_actions?: string[]; tags?: string[] }): boolean {
  const expectedItems =
    question.expected_items ??
    (question.expected_claim_ids?.length ?? 0) +
      (question.expected_event_ids?.length ?? 0) +
      (question.expected_page_paths?.length ?? 0) +
      (question.expected_review_ids?.length ?? 0) +
      (question.expected_followup_ids?.length ?? 0) +
      (question.expected_cannot_confirm?.length ?? 0) +
      (question.expected_repair_actions?.length ?? 0);

  return expectedItems === 0 || (question.tags ?? []).includes("no_match");
}

function cannotConfirmTexts(basis: AnswerBasisResult): string[] {
  return unique([
    ...basis.missingInformation.map((item) => item.message),
    ...basis.cannotConfirm.map((item) => item.message),
    ...basis.warnings
  ]);
}

function repairActionNames(basis: AnswerBasisResult): string[] {
  return unique([
    ...basis.manualActions.map((action) => action.action),
    ...basis.repairActions.map((action) => action.action)
  ]);
}

function matchingExpectedText(expected: string[], actual: string[]): string[] {
  return expected.filter((item) => {
    const normalized = item.toLowerCase();
    return actual.some((candidate) => candidate.toLowerCase().includes(normalized));
  });
}

function repairActionPrecision(
  foundRepairActions: string[],
  actions: RetrievalManualAction[],
  expectedRepairActions: string[]
): number {
  if (expectedRepairActions.length === 0) {
    return 0;
  }

  const uniqueActions = unique(actions.map((action) => action.action));
  return ratio(foundRepairActions.length, Math.max(uniqueActions.length, expectedRepairActions.length));
}

function buildRepairSuggestions(
  question: DogfoodEvalQuestion,
  basis: AnswerBasisResult,
  allExpectationsMet: boolean
): PersonalDogfoodRepairSuggestion[] {
  if (allExpectationsMet && !expectsNoMatch(question)) {
    return [];
  }

  const suggestions: PersonalDogfoodRepairSuggestion[] = [];
  const add = (suggestion: PersonalDogfoodRepairSuggestion) => {
    if (!suggestions.some((item) => item.action === suggestion.action && item.target === suggestion.target)) {
      suggestions.push(suggestion);
    }
  };

  add({
    action: "capture_missing_evidence",
    label: "Capture missing evidence",
    reason: "A failed expectation can usually be repaired by capturing the missing source note.",
    endpoint: "/api/ask/missing-memory/preview",
    target: question.question
  });
  add({
    action: "log_retrieval_miss",
    label: "Log retrieval miss",
    reason: "Record this real-question miss as Event evidence plus a pending NOOP Transaction.",
    endpoint: "/api/dogfood/feedback/preview",
    target: question.question
  });
  add({
    action: "pin_question",
    label: "Pin question",
    reason: "Keep this question in the local retrieval workbench until it is answerable.",
    endpoint: "/api/ask/pin",
    target: question.question
  });

  const contextTarget = firstContextTarget(question, basis);
  if (contextTarget) {
    add({
      action: "open_context_room",
      label: "Open context room",
      reason: "Inspect the relevant Context operating room before deciding what memory is missing.",
      endpoint: "/api/contexts/operating-room",
      target: contextTarget
    });
  }

  if (question.expected_claim_ids?.length || question.expected_review_ids?.length || question.tags?.some((tag) => /person|entity|identity|manager|role/.test(tag))) {
    add({
      action: "stage_entity_review",
      label: "Stage entity review",
      reason: "The miss may involve identity, role, or claim placement rather than absent source text.",
      endpoint: "/api/entities/identity-review/preview"
    });
  }

  return suggestions;
}

function firstContextTarget(question: DogfoodEvalQuestion, basis: AnswerBasisResult): string | undefined {
  const expectedContext = question.expected_page_paths?.find((item) => item.startsWith("memory/contexts/"));
  if (expectedContext) {
    return expectedContext;
  }

  return basis.matchedPages.find((page) => page.type === "context")?.path;
}

function irrelevantInclusionCount(question: DogfoodEvalQuestion, basis: AnswerBasisResult): number {
  let count = 0;

  if ((question.expected_page_paths ?? []).length > 0) {
    const expected = new Set(question.expected_page_paths);
    count += basis.matchedPages.filter((page) => !expected.has(page.path)).length;
  }

  if ((question.expected_claim_ids ?? []).length > 0) {
    const expected = new Set(question.expected_claim_ids);
    count += basis.answerCandidates.filter((claim) => !expected.has(claim.claim_id)).length;
  }

  return count;
}

async function snapshotMemory(root: string): Promise<Record<string, string>> {
  let files: string[];

  try {
    files = await listMarkdownFiles(root, "memory/**/*.md");
  } catch {
    return {};
  }

  const snapshot: Record<string, string> = {};

  for (const file of files.sort()) {
    snapshot[file] = await readMarkdownPage(root, file);
  }

  return snapshot;
}

function snapshotsEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? unique(value.filter(isString).map((item) => item.trim()).filter(Boolean)) : [];
}

function intersection(expected: string[], actual: string[]): string[] {
  const actualSet = new Set(actual);
  return expected.filter((item) => actualSet.has(item));
}

function unique(items: string[]): string[] {
  return [...new Set(items)].sort();
}

function scoreForRegression(metrics: PersonalDogfoodEvalMetrics): number {
  return metrics.answerability + metrics.citation_coverage + metrics.cannot_confirm_quality + metrics.repair_action_precision;
}

function average(items: number[]): number {
  return items.length === 0 ? 0 : sum(items) / items.length;
}

function sum(items: number[]): number {
  return items.reduce((total, item) => total + item, 0);
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error);
}
