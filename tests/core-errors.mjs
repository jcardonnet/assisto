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
      nested: { raw_note: "Priya nested detail." },
      provider_prompt: "Summarize Priya private note.",
      raw_note: "Priya is assigned to a secret project.",
      unsafe_context: "Priya owns the private rollout.",
      unsafe_items: ["Priya array detail."]
    }
  });

  assert.equal(error.name, "AssistoError");
  assert.equal(error.code, "validation_failed");
  assert.equal(error.component, "core");
  assert.equal(error.operation, "apply_transaction");
  assert.equal(error.status, 400);
  assert.equal(error.details.issue_count, 2);
  assert.deepEqual(error.details.nested, { kind: "object", key_count: 1 });
  assert.match(String(error.details.provider_prompt), /^\[redacted:provider_prompt chars=\d+ lines=1\]$/);
  assert.match(String(error.details.raw_note), /^\[redacted:raw_note chars=\d+ lines=1\]$/);
  assert.match(String(error.details.unsafe_context), /^\[redacted:user_string chars=\d+ lines=1\]$/);
  assert.deepEqual(error.details.unsafe_items, { kind: "array", item_count: 1 });
  assert.equal(errors.isAssistoError(error), true);
  assert.equal(errors.assistoErrorCode(error), "validation_failed");
  assert.equal(JSON.stringify(error).includes("Priya"), false);
  assert.equal(JSON.stringify(error).includes("private rollout"), false);

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
  assert.equal(wrapped.message, "Assisto operation failed.");
  assert.equal(wrapped.message.includes("raw provider response"), false);
  assert.equal(errors.assistoErrorCode(new Error("plain")), "unknown");
  assert.equal(errors.safeErrorSummary(new Error("plain")).code, "unknown");

  const nonErrorWrappedFromString = errors.toAssistoError("string failure with private text", {
    code: "provider_failed",
    component: "core",
    operation: "extract_claims",
    status: 500
  });
  assert.equal(nonErrorWrappedFromString.name, "AssistoError");
  assert.equal(nonErrorWrappedFromString.code, "provider_failed");
  assert.equal(nonErrorWrappedFromString.component, "core");
  assert.equal(nonErrorWrappedFromString.operation, "extract_claims");
  assert.equal(nonErrorWrappedFromString.status, 500);
  assert.equal(nonErrorWrappedFromString.message, "Assisto operation failed.");
  assert.equal(nonErrorWrappedFromString.message.includes("private text"), false);

  const nonErrorWrappedFromObject = errors.toAssistoError({ message: "object failure with raw note" }, {
    code: "provider_failed",
    component: "core",
    operation: "extract_claims",
    status: 500
  });
  assert.equal(nonErrorWrappedFromObject.name, "AssistoError");
  assert.equal(nonErrorWrappedFromObject.code, "provider_failed");
  assert.equal(nonErrorWrappedFromObject.component, "core");
  assert.equal(nonErrorWrappedFromObject.operation, "extract_claims");
  assert.equal(nonErrorWrappedFromObject.status, 500);
  assert.equal(nonErrorWrappedFromObject.message, "Assisto operation failed.");
  assert.equal(nonErrorWrappedFromObject.message.includes("raw note"), false);

  const explicitSafeMessage = errors.toAssistoError(new Error("raw upstream text"), {
    code: "provider_failed",
    component: "core",
    operation: "extract_claims",
    status: 502,
    message: "Provider request failed."
  });
  assert.equal(explicitSafeMessage.message, "Provider request failed.");
  assert.equal(explicitSafeMessage.message.includes("raw upstream"), false);

  for (const status of [99, 600, Number.NaN]) {
    const statusSummary = errors.safeErrorSummary(
      errors.toAssistoError(new Error("bad status"), {
        code: "provider_failed",
        component: "core",
        operation: "extract_claims",
        status
      })
    );
    assert.equal(statusSummary.status_class, "unknown");
  }

  const normalized = errors.toAssistoError(new Error("normalized identifiers"), {
    code: "provider_failed",
    component: " Core-Service ",
    operation: " Extract Claims ",
    status: 502
  });
  assert.equal(normalized.component, "core_service");
  assert.equal(normalized.operation, "extract_claims");
  assert.deepEqual(errors.safeErrorSummary(normalized), {
    name: "AssistoError",
    code: "provider_failed",
    component: "core_service",
    operation: "extract_claims",
    status_class: "5xx"
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCoreErrorContractTests();
  console.log("core error contract tests passed");
}
