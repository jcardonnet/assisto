import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runCoreErrorContractTests() {
  const errors = await loadTsModule("packages/core/src/errors/index.ts");

  assert.deepEqual(errors.ASSISTO_ERROR_CODES, [
    "validation_failed",
    "vault_path_invalid",
    "transaction_apply_failed",
    "workbench_forbidden",
    "payload_too_large",
    "provider_failed",
    "unknown"
  ]);

  const error = new errors.AssistoError({
    code: "validation_failed",
    message: "Transaction validation failed.",
    component: "core",
    operation: "apply_transaction",
    status: 400,
    details: {
      issue_count: 2,
      raw_note: "Priya is assigned to a secret project."
    }
  });

  assert.equal(error.name, "AssistoError");
  assert.equal(error.code, "validation_failed");
  assert.equal(error.component, "core");
  assert.equal(error.operation, "apply_transaction");
  assert.equal(error.status, 400);
  assert.equal(errors.isAssistoError(error), true);
  assert.equal(errors.assistoErrorCode(error), "validation_failed");

  const summary = errors.safeErrorSummary(error);
  assert.deepEqual(summary, {
    name: "AssistoError",
    code: "validation_failed",
    component: "core",
    operation: "apply_transaction",
    status_class: "4xx"
  });
  assert.equal(JSON.stringify(summary).includes("Priya"), false);

  const wrapped = errors.toAssistoError(new Error("raw provider response leaked here"), {
    code: "provider_failed",
    component: "core",
    operation: "extract_claims",
    status: 502
  });

  assert.equal(wrapped.name, "AssistoError");
  assert.equal(wrapped.code, "provider_failed");
  assert.equal(wrapped.component, "core");
  assert.equal(wrapped.operation, "extract_claims");
  assert.equal(wrapped.status, 502);
  assert.equal(errors.assistoErrorCode(new Error("plain")), "unknown");
  assert.equal(errors.safeErrorSummary(new Error("plain")).code, "unknown");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCoreErrorContractTests();
  console.log("core error contract tests passed");
}
