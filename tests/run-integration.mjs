import { fileURLToPath } from "node:url";
import { assertRequiredPaths } from "./run-unit.mjs";
import { runCoreFsVaultTests } from "./core-fs-vault.mjs";
import { runCoreTransactionTests } from "./core-transactions.mjs";
import { runCoreTransactionApplyTests } from "./core-transaction-apply.mjs";
import { runCoreIngestTests } from "./core-ingest.mjs";
import { runCoreV3MemoryHardeningTests } from "./core-v3-memory-hardening.mjs";
import { runCoreLintTests } from "./core-lint.mjs";
import { runCliIntegrationTests } from "./cli-integration.mjs";
import { runPiExtensionTests } from "./pi-extension.mjs";

export async function runIntegrationTests() {
  assertRequiredPaths();

  await runCoreFsVaultTests();
  await runCoreTransactionTests();
  await runCoreTransactionApplyTests();
  await runCoreIngestTests();
  await runCoreV3MemoryHardeningTests();
  await runCoreLintTests();
  await runCliIntegrationTests();
  await runPiExtensionTests();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runIntegrationTests();
  console.log("integration tests passed");
}
