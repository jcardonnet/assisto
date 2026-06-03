import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createFaultPlan, runFaultPlan } from "../helpers/fault-harness.mjs";

export async function runFaultHarnessTests() {
  const observed = [];
  const plan = createFaultPlan({
    id: "w1-fault-plan",
    cases: [
      {
        id: "read-fails",
        run: async () => {
          throw new Error("simulated read failure");
        }
      },
      {
        id: "write-recovers",
        run: async () => ({ writes: 1 })
      }
    ]
  });

  const result = await runFaultPlan(plan, {
    onCaseResult: (caseResult) => observed.push(caseResult)
  });

  assert.equal(result.plan_id, "w1-fault-plan");
  assert.equal(result.total, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.passed, 1);
  assert.deepEqual(
    result.cases.map((caseResult) => ({
      id: caseResult.id,
      result: caseResult.result,
      error_code: caseResult.error_code
    })),
    [
      { id: "read-fails", result: "failed", error_code: "fault_case_failed" },
      { id: "write-recovers", result: "passed", error_code: null }
    ]
  );
  assert.equal(observed.length, 2);
  assert.equal(JSON.stringify(result).includes("simulated read failure"), false);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runFaultHarnessTests();
  console.log("fault harness tests passed");
}
