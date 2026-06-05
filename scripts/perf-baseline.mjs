import { fileURLToPath } from "node:url";
import { normalizeId, normalizeResult, summarizeResults } from "./baseline-utils.mjs";

const SCHEMA_VERSION = "assisto.perf.baseline.v1";

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(createPerfBaselineReport(), null, 2));
}
