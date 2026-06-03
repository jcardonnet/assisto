import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = "assisto.baseline.local.v1";
const RESULT_VALUES = new Set(["passed", "warning", "failed"]);

export function createBaselineReport(input = {}) {
  const checks = normalizeChecks(input.checks ?? []);

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: input.generated_at ?? new Date().toISOString(),
    summary: summarizeResults(checks),
    checks
  };
}

function normalizeChecks(checks) {
  return checks.map((check) => ({
    id: normalizeId(check.id),
    result: normalizeResult(check.result),
    duration_ms: normalizeDuration(check.duration_ms),
    ...(check.warning_code === undefined ? {} : { warning_code: normalizeId(check.warning_code) })
  }));
}

function summarizeResults(items) {
  return {
    total: items.length,
    passed: items.filter((item) => item.result === "passed").length,
    warning: items.filter((item) => item.result === "warning").length,
    failed: items.filter((item) => item.result === "failed").length
  };
}

function normalizeResult(value) {
  const result = normalizeId(value);
  return RESULT_VALUES.has(result) ? result : "warning";
}

function normalizeDuration(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function normalizeId(value) {
  let output = "";
  let pendingSeparator = false;

  for (const char of String(value ?? "unknown").trim().toLowerCase()) {
    if (isAsciiAlphaNumeric(char) || char === "-") {
      if (pendingSeparator && output) {
        output += "_";
      }
      output += char;
      pendingSeparator = false;
      continue;
    }

    if (char === "_") {
      pendingSeparator = output.length > 0;
      continue;
    }

    pendingSeparator = output.length > 0;
  }

  return output || "unknown";
}

function isAsciiAlphaNumeric(char) {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
}


if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(createBaselineReport(), null, 2));
}
