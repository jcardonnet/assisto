import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { runCoreModelEnumTests } from "./core-model-enums.mjs";
import { runCoreMarkdownTests } from "./core-markdown.mjs";
import { runCoreValidatorTests } from "./core-validators.mjs";
import { runCoreFsVaultTests } from "./core-fs-vault.mjs";
import { runCoreTransactionTests } from "./core-transactions.mjs";
import { runCoreTransactionApplyTests } from "./core-transaction-apply.mjs";
import { runCorePolicyTests } from "./core-policies.mjs";
import { runCoreIngestTests } from "./core-ingest.mjs";
import { runCoreExtractionTests } from "./core-extraction.mjs";
import { runCoreRetrievalTests } from "./core-retrieval.mjs";
import { runCoreLintTests } from "./core-lint.mjs";
import { runCliIntegrationTests } from "./cli-integration.mjs";
import { runPiExtensionTests } from "./pi-extension.mjs";

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

await runCoreModelEnumTests();
await runCoreMarkdownTests();
await runCoreValidatorTests();
await runCoreFsVaultTests();
await runCoreTransactionTests();
await runCoreTransactionApplyTests();
await runCorePolicyTests();
await runCoreIngestTests();
await runCoreExtractionTests();
await runCoreRetrievalTests();
await runCoreLintTests();
await runCliIntegrationTests();
await runPiExtensionTests();

console.log("placeholder scaffold tests passed");
