import { fileURLToPath } from "node:url";
import { assertRequiredPaths } from "./run-unit.mjs";
import { runCoreFsVaultTests } from "./core-fs-vault.mjs";
import { runCoreTransactionTests } from "./core-transactions.mjs";
import { runCoreTransactionApplyTests } from "./core-transaction-apply.mjs";
import { runCoreIngestTests } from "./core-ingest.mjs";
import { runCoreCaptureTests } from "./core-capture.mjs";
import { runCoreFrictionTests } from "./core-friction.mjs";
import { runCoreImportTests } from "./core-import.mjs";
import { runCoreEntityTests } from "./core-entities.mjs";
import { runCoreV3MemoryHardeningTests } from "./core-v3-memory-hardening.mjs";
import { runCoreLintTests } from "./core-lint.mjs";
import { runCliIntegrationTests } from "./cli-integration.mjs";
import { runPiExtensionTests } from "./pi-extension.mjs";
import { runWorkbenchTests } from "./workbench.mjs";
import { runScenarioFactoryTests } from "./scenario-factory.mjs";
import { runScriptHelperTests } from "./script-helpers.mjs";
import { runAgentControlTests } from "./agent-control.mjs";
import { runAgentPolicyTests } from "./agent-policy.mjs";
import { runAgentRunnerTests } from "./agent-runner.mjs";
import { runAgentPrTests } from "./agent-pr.mjs";
import { runAgentCiLocalTests } from "./agent-ci-local.mjs";
import { runAgentMapTests } from "./agent-map.mjs";

export async function runIntegrationTests() {
  assertRequiredPaths();

  await runCoreFsVaultTests();
  await runCoreTransactionTests();
  await runCoreTransactionApplyTests();
  await runCoreIngestTests();
  await runCoreCaptureTests();
  await runCoreFrictionTests();
  await runCoreImportTests();
  await runCoreEntityTests();
  await runCoreV3MemoryHardeningTests();
  await runCoreLintTests();
  await runCliIntegrationTests();
  await runPiExtensionTests();
  await runWorkbenchTests();
  await runScenarioFactoryTests();
  await runScriptHelperTests();
  await runAgentControlTests();
  await runAgentPolicyTests();
  await runAgentRunnerTests();
  await runAgentPrTests();
  await runAgentCiLocalTests();
  await runAgentMapTests();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runIntegrationTests();
  console.log("integration tests passed");
}
