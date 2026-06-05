import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
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
  assert.deepEqual(docsPlan.targeted_groups, []);

  const workflowPlan = buildValidationPlan({ changedFiles: ["scripts/env-doctor.mjs"] });
  assert.deepEqual(commandNames(workflowPlan), ["lint", "typecheck", "test", "check:memory-data"]);
  assert.equal(workflowPlan.categories.includes("workflow"), true);
  assert.deepEqual(workflowPlan.targeted_groups.map((group) => group.name), ["agent"]);
  assert.equal(workflowPlan.targeted_groups[0].commands.includes("tests/agent-policy.mjs"), true);

  const testPlan = buildValidationPlan({ changedFiles: ["tests/agent-policy.mjs"] });
  assert.deepEqual(testPlan.targeted_groups.map((group) => group.name), ["agent"]);

  const corePlan = buildValidationPlan({ changedFiles: ["packages/core/src/retrieval/index.ts"] });
  assert.deepEqual(commandNames(corePlan), [
    "lint",
    "typecheck",
    "test",
    "eval:mvp",
    "eval:v2",
    "eval:v3",
    "eval:retrieval",
    "eval:source-adapters",
    "eval:v4",
    "eval:v5",
    "eval:v6",
    "eval:dogfood-local",
    "eval:v7",
    "eval:answers",
    "eval:context-packs",
    "eval:v8",
    "eval:v9",
    "eval:v10",
    "eval:maintenance",
    "check:memory-data"
  ]);

  const workbenchPlan = buildValidationPlan({ changedFiles: ["packages/workbench/src/index.ts"] });
  assert.equal(commandNames(workbenchPlan).includes("test:e2e"), true);
  assert.equal(commandNames(workbenchPlan).includes("test:browser"), true);
  assert.deepEqual(workbenchPlan.targeted_groups.map((group) => group.name), ["workbench"]);
  const browser = workbenchPlan.commands.find((item) => item.name === "test:browser");
  assert.equal(browser.required, true);
  assert.equal(browser.cost, "high");
  assert.match(browser.reason, /Workbench/);

  const docsOnlyPlan = buildValidationPlan({
    changedFiles: ["docs/revised-design.md"],
    docsOnly: true
  });
  assert.equal(docsOnlyPlan.mode, "docs-process");
  assert.equal(docsOnlyPlan.skipped.some((item) => item.name === "eval:v8"), true);
  assert.equal(docsOnlyPlan.skipped.some((item) => item.name === "eval:v10"), true);
  assert.match(docsOnlyPlan.skipped.find((item) => item.name === "eval:v8").reason, /docs-only/);

  const evalPlan = buildValidationPlan({ changedFiles: ["tests/scenarios/run-v6.mjs"] });
  assert.equal(evalPlan.mode, "eval-test-harness");
  assert.equal(commandNames(evalPlan).includes("eval:v6"), true);
  assert.equal(commandNames(evalPlan).includes("eval:dogfood-local"), true);
  assert.equal(commandNames(evalPlan).includes("eval:v7"), true);
  assert.equal(commandNames(evalPlan).includes("eval:answers"), true);
  assert.equal(commandNames(evalPlan).includes("eval:source-adapters"), true);
  assert.equal(commandNames(evalPlan).includes("eval:context-packs"), true);
  assert.equal(commandNames(evalPlan).includes("eval:v8"), true);
  assert.equal(commandNames(evalPlan).includes("eval:v9"), true);
  assert.equal(commandNames(evalPlan).includes("eval:v10"), true);
  assert.equal(commandNames(evalPlan).includes("eval:maintenance"), true);
  assert.deepEqual(evalPlan.targeted_groups.map((group) => group.name), ["retrieval"]);

  const skipBrowserPlan = buildValidationPlan({
    changedFiles: ["packages/workbench/src/index.ts"],
    skipBrowser: true
  });
  assert.equal(commandNames(skipBrowserPlan).includes("test:browser"), false);
  assert.match(skipBrowserPlan.skipped.find((item) => item.name === "test:browser").reason, /skipBrowser/);

  const forcedFull = buildValidationPlan({ changedFiles: ["README.md"], full: true });
  assert.equal(forcedFull.mode, "full");
  assert.equal(commandNames(forcedFull).includes("test:browser"), true);
  assert.equal(commandNames(forcedFull).includes("eval:source-adapters"), true);
  assert.equal(commandNames(forcedFull).includes("eval:v10"), true);

  const ciParity = buildValidationPlan({ changedFiles: ["README.md"], ciParity: true });
  assert.equal(ciParity.mode, "ci-parity");
  assert.equal(commandNames(ciParity).includes("eval:context-packs"), true);
  assert.equal(commandNames(ciParity).includes("eval:v9"), true);
  assert.equal(commandNames(ciParity).includes("eval:v10"), true);
  assert.equal(commandNames(ciParity).includes("eval:maintenance"), true);
  assert.equal(commandNames(ciParity).includes("eval:source-adapters"), false);

  assert.deepEqual(corePlan.file_reasons, [
    {
      file: "packages/core/src/retrieval/index.ts",
      category: "core",
      reason: "Classified as core by deterministic path rules."
    }
  ]);
  assert.deepEqual(corePlan.targeted_groups.map((group) => group.name), ["retrieval"]);
  assert.equal(corePlan.commands.every((item) => typeof item.cost === "string" && item.required === true), true);
  assert.equal(corePlan.skipped.some((item) => item.required === false), true);

  const memoryPolicy = buildPolicyResult({ changedFiles: ["memory/events/2026/example.md"] });
  assert.equal(memoryPolicy.passed, false);
  assert.equal(memoryPolicy.findings.some((finding) => finding.code === "guarded_memory_data_changed"), true);
  assert.deepEqual(memoryPolicy.validation_plan.targeted_groups.map((group) => group.name), ["memory"]);
  assert.equal(commandNames(memoryPolicy.validation_plan).includes("check:memory-data"), true);

  const obsidianPolicy = buildPolicyResult({ changedFiles: [".obsidian/workspace.json"] });
  assert.equal(obsidianPolicy.passed, false);
  assert.equal(obsidianPolicy.findings.some((finding) => finding.code === "obsidian_changed"), true);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runAgentPolicyTests();
  console.log("agent policy tests passed");
}
