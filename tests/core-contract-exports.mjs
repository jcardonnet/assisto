import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runCoreContractExportTests() {
  const core = await loadTsModule("packages/core/src/index.ts");

  assert.equal(typeof core.redactRawNote, "function");
  assert.equal(typeof core.AssistoError, "function");
  assert.equal(typeof core.createRunContext, "function");
  assert.equal(typeof core.createInMemoryObservabilitySink, "function");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCoreContractExportTests();
  console.log("core contract export tests passed");
}
