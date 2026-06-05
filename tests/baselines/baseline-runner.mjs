import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

export async function runBaselineRunnerTests() {
  const baselineUtils = await import("../../scripts/baseline-utils.mjs");
  const localBaseline = await import("../../scripts/baseline-local.mjs");
  const perfBaseline = await import("../../scripts/perf-baseline.mjs");

  assert.equal(baselineUtils.normalizeId(" Core Contracts! "), "core_contracts");
  assert.equal(baselineUtils.normalizeId("core-contracts"), "core-contracts");
  assert.equal(baselineUtils.normalizeId("future_warning"), "future_warning");
  assert.equal(baselineUtils.normalizeId("  mixed-separators id  "), "mixed-separators_id");
  assert.equal(baselineUtils.normalizeId("INVALID ID!"), "invalid_id");
  assert.equal(baselineUtils.normalizeId(""), "unknown");
  assert.equal(baselineUtils.normalizeResult("PASSED"), "passed");
  assert.equal(baselineUtils.normalizeResult("unexpected"), "warning");
  assert.equal(baselineUtils.normalizeResult(undefined), "warning");
  assert.equal(baselineUtils.normalizeResult(null), "warning");
  assert.equal(baselineUtils.normalizeResult(""), "warning");
  assert.equal(baselineUtils.normalizeDuration(7.8), 7);
  assert.equal(baselineUtils.normalizeDuration(0), 0);
  assert.equal(baselineUtils.normalizeDuration(-5), 0);
  assert.equal(baselineUtils.normalizeDuration(Number.NaN), 0);
  assert.equal(baselineUtils.normalizeDuration("2.2"), 2);
  assert.equal(baselineUtils.normalizeDuration(" 3.9 "), 3);
  assert.equal(baselineUtils.normalizeDuration(""), 0);
  assert.equal(baselineUtils.normalizeDuration("not numeric"), 0);
  assert.equal(baselineUtils.normalizeDuration(Number.POSITIVE_INFINITY), 0);
  assert.deepEqual(baselineUtils.summarizeResults([
    { result: "passed" },
    { result: "warning" },
    { result: "failed" },
    { result: "unexpected" }
  ]), {
    total: 4,
    passed: 1,
    warning: 1,
    failed: 1
  });

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
