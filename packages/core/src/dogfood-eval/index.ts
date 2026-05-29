import { readFile } from "node:fs/promises";
import path from "node:path";
import { listMarkdownFiles, readMarkdownPage } from "../fs";
import { retrieveContextForAnswer, type AnswerBasisResult } from "../retrieval";

export interface DogfoodEvalQuestion {
  question: string;
  expected_claim_ids?: string[];
  expected_event_ids?: string[];
  expected_page_paths?: string[];
  expected_review_ids?: string[];
  expected_followup_ids?: string[];
  tags?: string[];
}

export interface PersonalDogfoodEvalResult {
  generated_at: string;
  questions_path: string;
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
  found_claim_ids: string[];
  found_event_ids: string[];
  found_page_paths: string[];
  found_review_ids: string[];
  found_followup_ids: string[];
  expected_items: number;
  found_expected_items: number;
  all_expectations_met: boolean;
  answerable: boolean;
  missing_memory_guidance: boolean;
  irrelevant_inclusion_count: number;
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
  missing_memory_guidance_count: number;
  review_followup_surfacing_count: number;
  generated_persistence_violations: number;
}

export interface PersonalDogfoodEvalOptions {
  questionsPath?: string;
  now?: string;
}

export async function runPersonalDogfoodEval(
  root: string,
  options: PersonalDogfoodEvalOptions = {}
): Promise<PersonalDogfoodEvalResult> {
  const questionsPath = options.questionsPath ?? defaultDogfoodEvalQuestionsPath(root);
  const before = await snapshotMemory(root);
  const warnings: string[] = [];
  const questions = await readQuestionFile(questionsPath, warnings);
  const results: PersonalDogfoodEvalQuestionResult[] = [];

  for (const question of questions) {
    results.push(await evaluateQuestion(root, question));
  }

  const after = await snapshotMemory(root);
  const generatedPersistenceViolations = snapshotsEqual(before, after) ? 0 : 1;
  const metrics = buildMetrics(results, generatedPersistenceViolations);

  return {
    generated_at: options.now ?? new Date().toISOString(),
    questions_path: questionsPath,
    questions: results,
    metrics,
    warnings
  };
}

export function defaultDogfoodEvalQuestionsPath(root: string): string {
  return path.join(root, ".assisto-local", "eval", "questions.json");
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
  const foundClaimIds = intersection(expectedClaimIds, basisClaimIds(basis));
  const foundEventIds = intersection(expectedEventIds, basis.evidenceEvents.map((event) => event.id).filter(isString));
  const foundPagePaths = intersection(expectedPagePaths, basis.matchedPages.map((page) => page.path));
  const foundReviewIds = intersection(expectedReviewIds, basis.linkedReviewItems.map((item) => item.id).filter(isString));
  const foundFollowupIds = intersection(expectedFollowupIds, basis.linkedFollowUps.map((item) => item.id).filter(isString));
  const expectedItems =
    expectedClaimIds.length +
    expectedEventIds.length +
    expectedPagePaths.length +
    expectedReviewIds.length +
    expectedFollowupIds.length;
  const foundExpectedItems =
    foundClaimIds.length +
    foundEventIds.length +
    foundPagePaths.length +
    foundReviewIds.length +
    foundFollowupIds.length;
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
    found_claim_ids: foundClaimIds,
    found_event_ids: foundEventIds,
    found_page_paths: foundPagePaths,
    found_review_ids: foundReviewIds,
    found_followup_ids: foundFollowupIds,
    expected_items: expectedItems,
    found_expected_items: foundExpectedItems,
    all_expectations_met: allExpectationsMet,
    answerable,
    missing_memory_guidance: missingMemoryGuidance,
    irrelevant_inclusion_count: irrelevantInclusionCount(question, basis),
    basis
  };
}

function buildMetrics(
  questions: PersonalDogfoodEvalQuestionResult[],
  generatedPersistenceViolations: number
): PersonalDogfoodEvalMetrics {
  const totalQuestions = questions.length;
  const answerableQuestions = questions.filter((question) => question.answerable).length;
  const expectedItems = sum(questions.map((question) => question.expected_items));
  const foundExpectedItems = sum(questions.map((question) => question.found_expected_items));

  return {
    total_questions: totalQuestions,
    answerable_questions: answerableQuestions,
    answerability: ratio(answerableQuestions, totalQuestions),
    expected_items: expectedItems,
    found_expected_items: foundExpectedItems,
    citation_coverage: ratio(foundExpectedItems, expectedItems),
    irrelevant_inclusion_count: sum(questions.map((question) => question.irrelevant_inclusion_count)),
    missing_memory_guidance_count: questions.filter((question) => expectsNoMatch(question) && question.missing_memory_guidance).length,
    review_followup_surfacing_count: sum(
      questions.map((question) => question.found_review_ids.length + question.found_followup_ids.length)
    ),
    generated_persistence_violations: generatedPersistenceViolations
  };
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

function expectsNoMatch(question: { expected_items?: number; expected_claim_ids?: string[]; expected_event_ids?: string[]; expected_page_paths?: string[]; expected_review_ids?: string[]; expected_followup_ids?: string[]; tags?: string[] }): boolean {
  const expectedItems =
    question.expected_items ??
    (question.expected_claim_ids?.length ?? 0) +
      (question.expected_event_ids?.length ?? 0) +
      (question.expected_page_paths?.length ?? 0) +
      (question.expected_review_ids?.length ?? 0) +
      (question.expected_followup_ids?.length ?? 0);

  return expectedItems === 0 || (question.tags ?? []).includes("no_match");
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
