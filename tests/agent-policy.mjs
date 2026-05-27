import assert from "node:assert/strict";
import {
  buildPolicyResult,
  buildValidationPlan
} from "../scripts/agent-policy.mjs";

function commandNames(plan) {
  return plan.commands.map((command) => command.name);
}

export async function runAgentPolicyTests() {
  const docsPlan = buildValidationPlan({ changedFiles: ["README.md"] });
  assert.deepEqual(commandNames(docsPlan), ["lint", "typecheck", "test"]);
  assert.equal(docsPlan.mode, "docs-process");

  const workflowPlan = buildValidationPlan({ changedFiles: ["scripts/env-doctor.mjs"] });
  assert.deepEqual(commandNames(workflowPlan), ["lint", "typecheck", "test", "check:memory-data"]);
  assert.equal(workflowPlan.categories.includes("workflow"), true);

  const corePlan = buildValidationPlan({ changedFiles: ["packages/core/src/retrieval/index.ts"] });
  assert.deepEqual(commandNames(corePlan), [
    "lint",
    "typecheck",
    "test",
    "eval:mvp",
    "eval:v2",
    "eval:v3",
    "eval:retrieval",
    "eval:v4",
    "eval:v5",
    "eval:v6",
    "check:memory-data"
  ]);

  const workbenchPlan = buildValidationPlan({ changedFiles: ["packages/workbench/src/index.ts"] });
  assert.equal(commandNames(workbenchPlan).includes("test:e2e"), true);
  assert.equal(commandNames(workbenchPlan).includes("test:browser"), true);

  const evalPlan = buildValidationPlan({ changedFiles: ["tests/scenarios/run-v6.mjs"] });
  assert.equal(evalPlan.mode, "eval-test-harness");
  assert.equal(commandNames(evalPlan).includes("eval:v6"), true);

  const skipBrowserPlan = buildValidationPlan({
    changedFiles: ["packages/workbench/src/index.ts"],
    skipBrowser: true
  });
  assert.equal(commandNames(skipBrowserPlan).includes("test:browser"), false);

  const forcedFull = buildValidationPlan({ changedFiles: ["README.md"], full: true });
  assert.equal(forcedFull.mode, "full");
  assert.equal(commandNames(forcedFull).includes("test:browser"), true);

  const memoryPolicy = buildPolicyResult({ changedFiles: ["memory/events/2026/example.md"] });
  assert.equal(memoryPolicy.passed, false);
  assert.equal(memoryPolicy.findings.some((finding) => finding.code === "guarded_memory_data_changed"), true);

  const obsidianPolicy = buildPolicyResult({ changedFiles: [".obsidian/workspace.json"] });
  assert.equal(obsidianPolicy.passed, false);
  assert.equal(obsidianPolicy.findings.some((finding) => finding.code === "obsidian_changed"), true);
}
