import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runCoreObservabilityTests() {
  const observability = await loadTsModule("packages/core/src/observability/index.ts");
  const sink = observability.createInMemoryObservabilitySink();
  const run = observability.createRunContext({
    run_id: "run_w1_contract_001",
    component: "core",
    sink,
    now: () => "2026-06-03T00:00:00.000Z"
  });

  assert.equal(run.run_id, "run_w1_contract_001");
  assert.equal(run.component, "core");
  assert.equal(run.started_at, "2026-06-03T00:00:00.000Z");

  const span = observability.startSpan(run, {
    domain: "transaction",
    operation: "apply",
    attributes: {
      route: "/api/transactions/tx_2026_06_03_001/apply?raw=true",
      raw_note: "Jeff is the DBA.",
      status: 404,
      attempted_writes: 2
    }
  });

  span.end({
    result: "validation_failed",
    attributes: {
      provider_prompt: "Summarize Priya private note."
    },
    now: () => "2026-06-03T00:00:01.250Z"
  });

  assert.equal(sink.spans.length, 1);
  assert.deepEqual(sink.spans[0], {
    run_id: "run_w1_contract_001",
    component: "core",
    domain: "transaction",
    operation: "apply",
    result: "validation_failed",
    started_at: "2026-06-03T00:00:00.000Z",
    ended_at: "2026-06-03T00:00:01.250Z",
    duration_ms: 1250,
    attributes: {
      attempted_writes: 2,
      provider_prompt: "[redacted:provider_prompt chars=29 lines=1]",
      raw_note: "[redacted:raw_note chars=16 lines=1]",
      route: "/api/transactions/:id/apply",
      status_class: "4xx"
    }
  });

  observability.recordMetric(run, {
    name: "assisto.operation.count",
    value: 3.9,
    labels: {
      domain: "transaction",
      operation: "apply",
      result: "validation_failed",
      route: "/api/events/ev_2026_06_03_001",
      status_class: 500,
      run_id: "run_w1_contract_001"
    }
  });

  assert.deepEqual(sink.metrics[0], {
    run_id: "run_w1_contract_001",
    component: "core",
    name: "assisto.operation.count",
    value: 3,
    labels: {
      domain: "transaction",
      operation: "apply",
      result: "validation_failed",
      route: "/api/events/:id",
      status_class: "5xx",
      run_id: "redacted"
    }
  });

  const noopRun = observability.createRunContext({ component: "cli" });
  observability.startSpan(noopRun, { domain: "cli", operation: "noop" }).end();
  observability.recordMetric(noopRun, { name: "noop", value: 1, labels: { domain: "cli" } });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCoreObservabilityTests();
  console.log("core observability tests passed");
}
