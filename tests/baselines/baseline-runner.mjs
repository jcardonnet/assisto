import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

export async function runBaselineRunnerTests() {
  const localBaseline = await import("../../scripts/baseline-local.mjs");
  const perfBaseline = await import("../../scripts/perf-baseline.mjs");

  const report = localBaseline.createBaselineReport({
    generated_at: "2026-06-03T00:00:00.000Z",
    checks: [
      { id: "core-contracts", result: "passed", duration_ms: 7.8 },
      { id: "future-warning", result: "warning", duration_ms: 2.2, warning_code: "not_integrated" }
    ]
  });

  assert.deepEqual(report, {
    schema_version: "assisto.baseline.local.v1",
    generated_at: "2026-06-03T00:00:00.000Z",
    summary: {
      total: 2,
      passed: 1,
      warning: 1,
      failed: 0
    },
    checks: [
      { id: "core-contracts", result: "passed", duration_ms: 7 },
      { id: "future-warning", result: "warning", duration_ms: 2, warning_code: "not_integrated" }
    ]
  });

  const perfReport = perfBaseline.createPerfBaselineReport({
    generated_at: "2026-06-03T00:00:00.000Z",
    benchmarks: [
      { id: "cold-vault-index", samples_ms: [30, 10, 20], result: "passed" },
      { id: "warm-vault-index", samples_ms: [], result: "warning", warning_code: "no_samples" }
    ]
  });

  assert.deepEqual(perfReport.benchmarks[0], {
    id: "cold-vault-index",
    result: "passed",
    samples: 3,
    min_ms: 10,
    p50_ms: 20,
    p90_ms: 30,
    max_ms: 30
  });
  assert.deepEqual(perfReport.summary, {
    total: 2,
    passed: 1,
    warning: 1,
    failed: 0
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runBaselineRunnerTests();
  console.log("baseline runner tests passed");
}
