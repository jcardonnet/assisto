import { fileURLToPath } from "node:url";
import { normalizeDuration, normalizeId, normalizeResult, summarizeResults } from "./baseline-utils.mjs";

const SCHEMA_VERSION = "assisto.baseline.local.v1";

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(createBaselineReport(), null, 2));
}
