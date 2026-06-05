import { fileURLToPath } from "node:url";
import { assertRequiredPaths } from "./run-unit.mjs";
import { runCoreFsVaultTests } from "./core-fs-vault.mjs";
import { runCoreTransactionTests } from "./core-transactions.mjs";
import { runCoreTransactionApplyTests } from "./core-transaction-apply.mjs";
import { runCoreIngestTests } from "./core-ingest.mjs";
import { runCoreCaptureTests } from "./core-capture.mjs";
import { runCoreCaptureFeedbackTests } from "./core-capture-feedback.mjs";
import { runCoreFrictionTests } from "./core-friction.mjs";
import { runCoreSeedTests } from "./core-seed.mjs";
import { runCoreImportTests } from "./core-import.mjs";
import { runCoreEntityTests } from "./core-entities.mjs";
import { runCoreV3MemoryHardeningTests } from "./core-v3-memory-hardening.mjs";
import { runCoreLintTests } from "./core-lint.mjs";
import { runCliIntegrationTests } from "./cli-integration.mjs";
import { runPiExtensionTests } from "./pi-extension.mjs";
import { runWorkbenchTests } from "./workbench.mjs";
import { runWorkbenchAnswerContractV3Tests } from "./workbench-answer-contract-v3.mjs";
import { runWorkbenchModularizationTests } from "./workbench-modularization.mjs";
import { runScenarioFactoryTests } from "./scenario-factory.mjs";
import { runScriptHelperTests } from "./script-helpers.mjs";
import { runCheckMemoryDataTests } from "./check-memory-data.mjs";
import { runAgentControlTests } from "./agent-control.mjs";
import { runAgentPolicyTests } from "./agent-policy.mjs";
import { runAgentRunnerTests } from "./agent-runner.mjs";
import { runAgentStageTests } from "./agent-stage.mjs";
import { runAgentNoCopilotPrTests } from "./agent-no-copilot-pr.mjs";
import { runAgentPrTests } from "./agent-pr.mjs";
import { runAgentCiLocalTests } from "./agent-ci-local.mjs";
import { runAgentMapTests } from "./agent-map.mjs";
import { runAgentReviewTests } from "./agent-review.mjs";
import { runAgentWorkbenchTests } from "./agent-workbench.mjs";
import { runAgentMxbaiTests } from "./agent-mxbai.mjs";
import { runFaultHarnessTests } from "./faults/fault-harness.mjs";
import { runBaselineRunnerTests } from "./baselines/baseline-runner.mjs";

export async function runIntegrationTests() {
  assertRequiredPaths();

  await runCoreFsVaultTests();
  await runCoreTransactionTests();
  await runCoreTransactionApplyTests();
  await runCoreIngestTests();
  await runCoreCaptureTests();
  await runCoreCaptureFeedbackTests();
  await runCoreFrictionTests();
  await runCoreSeedTests();
  await runCoreImportTests();
  await runCoreEntityTests();
  await runCoreV3MemoryHardeningTests();
  await runCoreLintTests();
  await runCliIntegrationTests();
  await runPiExtensionTests();
  await runWorkbenchTests();
  await runWorkbenchAnswerContractV3Tests();
  await runWorkbenchModularizationTests();
  await runScenarioFactoryTests();
  await runScriptHelperTests();
  await runCheckMemoryDataTests();
  await runAgentControlTests();
  await runAgentPolicyTests();
  await runAgentRunnerTests();
  await runAgentStageTests();
  await runAgentNoCopilotPrTests();
  await runAgentPrTests();
  await runAgentCiLocalTests();
  await runAgentMapTests();
  await runAgentReviewTests();
  await runAgentWorkbenchTests();
  await runAgentMxbaiTests();
  await runFaultHarnessTests();
  await runBaselineRunnerTests();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runIntegrationTests();
  console.log("integration tests passed");
}
