import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { evaluatePrCloseoutReadiness } from "../scripts/agent-pr.mjs";

const greenPr = {
  isDraft: false,
  mergeable: "MERGEABLE",
  statusCheckRollup: [{ conclusion: "SUCCESS" }]
};

function noCopilotInputs(overrides = {}) {
  return {
    prInfo: greenPr,
    reviewSummary: null,
    memoryGuard: { changed: [] },
    run: {
      validation_status: "passed",
      pr_state: { state: "pr_opened" }
    },
    options: { skipReviewCheck: true },
    ...overrides
  };
}

export async function runAgentNoCopilotPrTests() {
  const ready = evaluatePrCloseoutReadiness(noCopilotInputs());
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.blockers, []);
  assert.equal(ready.review_check, "skipped_copilot_disabled");

  const guardedMemory = evaluatePrCloseoutReadiness(
    noCopilotInputs({ memoryGuard: { changed: ["memory/events/2026/example.md"] } })
  );
  assert.equal(guardedMemory.ready, false);
  assert.equal(guardedMemory.blockers.includes("memory_guard_failed"), true);

  const draftPr = evaluatePrCloseoutReadiness(
    noCopilotInputs({ prInfo: { ...greenPr, isDraft: true } })
  );
  assert.equal(draftPr.ready, false);
  assert.equal(draftPr.blockers.includes("pr_is_draft"), true);

  const missingValidation = evaluatePrCloseoutReadiness(
    noCopilotInputs({
      run: {
        validation_status: "partial",
        pr_state: { state: "pr_opened" }
      }
    })
  );
  assert.equal(missingValidation.ready, false);
  assert.equal(missingValidation.blockers.includes("validation_not_recorded_passed"), true);

  const explicitReviewCheck = evaluatePrCloseoutReadiness(
    noCopilotInputs({
      reviewSummary: { unresolvedThreadCount: 1 },
      options: { skipReviewCheck: false }
    })
  );
  assert.equal(explicitReviewCheck.ready, false);
  assert.deepEqual(explicitReviewCheck.blockers, ["unresolved_review_threads", "review_wait_not_elapsed"]);
  assert.equal(explicitReviewCheck.review_check, "required");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runAgentNoCopilotPrTests();
  console.log("agent no-copilot PR tests passed");
}
