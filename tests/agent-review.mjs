import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  buildReviewPlan,
  formatValidationCommand,
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
  assert.equal(invariantPlan.commands.includes("TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm eval:mvp"), true);
  assert.equal(invariantPlan.commands.includes("TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm eval:source-adapters"), true);
  assert.equal(invariantPlan.commands.includes("TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm eval:v10"), true);
  assert.match(invariantPlan.subagent_prompt, /Do not edit files/);

  assert.equal(
    formatValidationCommand({
      env: { TMPDIR: "/tmp" },
      command: "pnpm eval:mvp"
    }),
    "TMPDIR=/tmp pnpm eval:mvp"
  );
  assert.equal(
    formatValidationCommand({
      env: {
        TMPDIR: "/tmp",
        TEMP: "/tmp",
        TMP: "/tmp",
        FOO: "bar",
        BAR: "baz"
      },
      command: "pnpm eval:mvp"
    }),
    "TMPDIR=/tmp TEMP=/tmp TMP=/tmp BAR=baz FOO=bar pnpm eval:mvp"
  );

  const testsPlan = buildReviewPlan({
    kind: "tests",
    changedFiles: ["packages/workbench/src/client/tabs/ask.ts"]
  });

  assert.equal(testsPlan.kind, "tests");
  assert.equal(testsPlan.focus_areas.includes("workbench-ui"), true);
  assert.equal(testsPlan.checks.some((item) => item.includes("focused regression test")), true);
  assert.equal(testsPlan.commands.includes("TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm test:e2e"), true);
  assert.equal(testsPlan.commands.includes("TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm test:browser"), true);
  assert.equal(testsPlan.commands.includes("TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm eval:v10"), true);
  assert.equal(testsPlan.commands.includes("pnpm check:memory-data"), true);

  const currentMemoryPlan = buildReviewPlan({
    kind: "invariant",
    changedFiles: ["memory/people/jeff.md"]
  });

  assert.equal(currentMemoryPlan.focus_areas.includes("canonical-memory-pages"), true);
  assert.equal(currentMemoryPlan.checks.some((item) => item.includes("canonical memory page edits")), true);

  const guardedPlan = buildReviewPlan({
    kind: "invariant",
    changedFiles: ["memory/events/2026/example.md", "scripts/agent-review.mjs", "scripts/agent-review.mjs"]
  });

  assert.deepEqual(guardedPlan.changed_files, ["memory/events/2026/example.md", "scripts/agent-review.mjs"]);
  assert.equal(guardedPlan.focus_areas.includes("guarded-memory-data"), true);
  assert.equal(guardedPlan.checks.some((item) => item.includes("intentionally approved")), true);

  const dotPrefixedPlan = buildReviewPlan({
    kind: "invariant",
    changedFiles: [
      "./packages/core/src/transactions/apply.ts",
      "././packages/core/src/transactions/commit.ts",
      "packages/core/src/transactions/rollback.ts"
    ]
  });

  assert.deepEqual(dotPrefixedPlan.changed_files, [
    "packages/core/src/transactions/apply.ts",
    "packages/core/src/transactions/commit.ts",
    "packages/core/src/transactions/rollback.ts"
  ]);
  assert.deepEqual(dotPrefixedPlan.focus_areas, ["core-memory-semantics"]);
  assert.equal(dotPrefixedPlan.commands.includes("TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm eval:v10"), true);

  const evalHarnessPlan = buildReviewPlan({
    kind: "tests",
    changedFiles: ["tests/scenarios/run-retrieval.mjs"]
  });

  assert.equal(evalHarnessPlan.focus_areas.includes("eval-test-harness"), true);
  assert.equal(evalHarnessPlan.checks.some((item) => item.includes("golden-threshold")), true);
  assert.equal(evalHarnessPlan.commands.includes("TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm eval:source-adapters"), true);

  const mixedEvalHarnessPlan = buildReviewPlan({
    kind: "tests",
    changedFiles: ["tests/scenarios/run-retrieval.mjs", "scripts/workflows/run-tests.mjs"]
  });

  assert.equal(mixedEvalHarnessPlan.focus_areas.includes("eval-test-harness"), true);
  assert.equal(mixedEvalHarnessPlan.focus_areas.includes("workflow-and-tests"), true);
  assert.equal(mixedEvalHarnessPlan.checks.some((item) => item.includes("golden-threshold")), true);
  assert.equal(mixedEvalHarnessPlan.checks.some((item) => item.includes("workflow helpers")), true);

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
