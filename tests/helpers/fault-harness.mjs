export function createFaultPlan(input) {
  return {
    id: input.id,
    cases: input.cases.map((faultCase) => ({
      id: faultCase.id,
      run: faultCase.run
    }))
  };
}

export async function runFaultPlan(plan, options = {}) {
  const cases = [];

  for (const faultCase of plan.cases) {
    const caseResult = await runFaultCase(faultCase);
    cases.push(caseResult);
    options.onCaseResult?.(caseResult);
  }

  const failed = cases.filter((caseResult) => caseResult.result === "failed").length;
  const passed = cases.filter((caseResult) => caseResult.result === "passed").length;

  return {
    plan_id: plan.id,
    total: cases.length,
    passed,
    failed,
    cases
  };
}

async function runFaultCase(faultCase) {
  try {
    await faultCase.run();
    return {
      id: faultCase.id,
      result: "passed",
      error_code: null
    };
  } catch {
    return {
      id: faultCase.id,
      result: "failed",
      error_code: "fault_case_failed"
    };
  }
}
