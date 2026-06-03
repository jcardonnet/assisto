import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = "assisto.perf.baseline.v1";
const RESULT_VALUES = new Set(["passed", "warning", "failed"]);

export function createPerfBaselineReport(input = {}) {
  const benchmarks = (input.benchmarks ?? []).map(normalizeBenchmark);

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: input.generated_at ?? new Date().toISOString(),
    summary: summarizeResults(benchmarks),
    benchmarks
  };
}

function normalizeBenchmark(benchmark) {
  const samples = (benchmark.samples_ms ?? [])
    .filter((sample) => Number.isFinite(sample) && sample >= 0)
    .map((sample) => Math.floor(sample))
    .sort((left, right) => left - right);

  return {
    id: normalizeId(benchmark.id),
    result: normalizeResult(benchmark.result),
    samples: samples.length,
    min_ms: samples[0] ?? 0,
    p50_ms: percentile(samples, 0.5),
    p90_ms: percentile(samples, 0.9),
    max_ms: samples.at(-1) ?? 0,
    ...(benchmark.warning_code === undefined ? {} : { warning_code: normalizeId(benchmark.warning_code) })
  };
}

function percentile(samples, percentileValue) {
  if (samples.length === 0) {
    return 0;
  }

  const index = Math.max(0, Math.ceil(samples.length * percentileValue) - 1);
  return samples[Math.min(index, samples.length - 1)];
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
  console.log(JSON.stringify(createPerfBaselineReport(), null, 2));
}
