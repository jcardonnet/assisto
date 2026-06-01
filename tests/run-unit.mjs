import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { runCoreModelEnumTests } from "./core-model-enums.mjs";
import { runCoreMarkdownTests } from "./core-markdown.mjs";
import { runCoreValidatorTests } from "./core-validators.mjs";
import { runCorePolicyTests } from "./core-policies.mjs";
import { runCoreIngestPipelineTests } from "./core-ingest-pipeline.mjs";
import { runCoreExtractionTests } from "./core-extraction.mjs";
import { runCoreRetrievalTests } from "./core-retrieval.mjs";
import { runCoreOntologyTests } from "./core-ontology.mjs";
import { runCoreFrameTests } from "./core-frames.mjs";
import { runCoreFrameExtractionTests } from "./core-frame-extraction.mjs";
import { runCoreAnswerContractV3Tests } from "./core-answer-contract-v3.mjs";
import { runCoreHealthTests } from "./core-health.mjs";
import { runCoreBriefTests } from "./core-briefs.mjs";
import { runCoreTodayTests } from "./core-today.mjs";
import { runCoreDogfoodTests } from "./core-dogfood.mjs";
import { runCoreDogfoodEvalTests } from "./core-dogfood-eval.mjs";
import { runCoreActivationTests } from "./core-activation.mjs";
import { runCoreDailyTests } from "./core-daily.mjs";
import { runCoreUseTomorrowTests } from "./core-use-tomorrow.mjs";
import { runCoreWorkdayModeTests } from "./core-workday-modes.mjs";
import { runCoreSourcesTests } from "./core-sources.mjs";
import { runCoreSourceAdapterTests } from "./core-source-adapters.mjs";
import { runCoreWorkdayCaptureTests } from "./core-workday-capture.mjs";

export async function runUnitTests() {
  assertRequiredPaths();

  await runCoreModelEnumTests();
  await runCoreMarkdownTests();
  await runCoreValidatorTests();
  await runCorePolicyTests();
  await runCoreIngestPipelineTests();
  await runCoreExtractionTests();
  await runCoreRetrievalTests();
  await runCoreOntologyTests();
  await runCoreFrameTests();
  await runCoreFrameExtractionTests();
  await runCoreAnswerContractV3Tests();
  await runCoreHealthTests();
  await runCoreBriefTests();
  await runCoreTodayTests();
  await runCoreDogfoodTests();
  await runCoreDogfoodEvalTests();
  await runCoreActivationTests();
  await runCoreDailyTests();
  await runCoreUseTomorrowTests();
  await runCoreWorkdayModeTests();
  await runCoreSourcesTests();
  await runCoreSourceAdapterTests();
  await runCoreWorkdayCaptureTests();
}

export function assertRequiredPaths() {
  const requiredPaths = [
    "packages/core/src/index.ts",
    "packages/cli/src/index.ts",
    "packages/pi-extension/src/index.ts",
    "memory/schema/conventions.md",
    "memory/transactions/pending",
    "tests/fixtures",
    "tests/scenarios",
    "tests/golden"
  ];

  for (const path of requiredPaths) {
    assert.equal(existsSync(path), true, `${path} should exist`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runUnitTests();
  console.log("unit tests passed");
}
