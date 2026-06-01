import type { PersonalDogfoodEvalResult } from "../dogfood-eval";

export interface PersonalDogfoodEvalV2Result {
  answerability: number;
  citationCoverage: number;
  proofPathCoverage: number;
  missingMemoryGuidance: number;
  generatedPersistenceViolations: number;
}

export function summarizePersonalDogfoodEvalV2(
  result: Pick<PersonalDogfoodEvalResult, "metrics" | "questions">
): PersonalDogfoodEvalV2Result {
  const questions = result.questions ?? [];
  const questionsWithProofPaths = questions.filter((question) => {
    const basis = question.basis as { proofPaths?: unknown[] } | undefined;
    return Array.isArray(basis?.proofPaths) && basis.proofPaths.length > 0;
  }).length;

  return {
    answerability: result.metrics.answerability,
    citationCoverage: result.metrics.citation_coverage,
    proofPathCoverage: ratio(questionsWithProofPaths, questions.length),
    missingMemoryGuidance: result.metrics.missing_memory_guidance_count,
    generatedPersistenceViolations: result.metrics.generated_persistence_violations
  };
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}
