import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  buildReviewPlan,
  parseReviewArgs
} from "../scripts/agent-review.mjs";

export function runAgentReviewTests() {
  const invariantPlan = buildReviewPlan({
    kind: "invariant",
    changedFiles: ["packages/core/src/transactions/apply.ts"]
  });

  assert.equal(invariantPlan.schema_version, 1);
  assert.equal(invariantPlan.kind, "invariant");
  assert.deepEqual(invariantPlan.focus_areas, ["core-memory-semantics"]);
  assert.equal(invariantPlan.checks.some((item) => item.includes("direct canonical writes")), true);
  assert.equal(invariantPlan.checks.some((item) => item.includes("Event evidence")), true);
  assert.equal(invariantPlan.commands.includes("TMPDIR=/tmp pnpm eval:mvp"), true);
  assert.equal(invariantPlan.commands.includes("TMPDIR=/tmp pnpm eval:source-adapters"), true);
  assert.equal(invariantPlan.commands.includes("TMPDIR=/tmp pnpm eval:v10"), true);
  assert.match(invariantPlan.subagent_prompt, /Do not edit files/);

  const testsPlan = buildReviewPlan({
    kind: "tests",
    changedFiles: ["packages/workbench/src/client/tabs/ask.ts"]
  });

  assert.equal(testsPlan.kind, "tests");
  assert.equal(testsPlan.focus_areas.includes("workbench-ui"), true);
  assert.equal(testsPlan.checks.some((item) => item.includes("focused regression test")), true);
  assert.equal(testsPlan.commands.includes("TMPDIR=/tmp pnpm test:e2e"), true);
  assert.equal(testsPlan.commands.includes("TMPDIR=/tmp pnpm test:browser"), true);
  assert.equal(testsPlan.commands.includes("TMPDIR=/tmp pnpm eval:v10"), true);
  assert.equal(testsPlan.commands.includes("pnpm check:memory-data"), true);

  const guardedPlan = buildReviewPlan({
    kind: "invariant",
    changedFiles: ["memory/events/2026/example.md", "scripts/agent-review.mjs", "scripts/agent-review.mjs"]
  });

  assert.deepEqual(guardedPlan.changed_files, ["memory/events/2026/example.md", "scripts/agent-review.mjs"]);
  assert.equal(guardedPlan.focus_areas.includes("guarded-memory-data"), true);
  assert.equal(guardedPlan.checks.some((item) => item.includes("intentionally approved")), true);

  assert.throws(
    () => buildReviewPlan({ kind: "security", changedFiles: [] }),
    /Unknown review kind/
  );

  const parsed = parseReviewArgs(["--kind", "tests", "--json", "scripts/agent-review.mjs"]);
  assert.deepEqual(parsed, {
    kind: "tests",
    files: ["scripts/agent-review.mjs"],
    json: true,
    help: false
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAgentReviewTests();
  console.log("agent review tests passed");
}
