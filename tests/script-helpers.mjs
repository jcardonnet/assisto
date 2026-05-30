import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export async function runScriptHelperTests() {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts["validate:local"], "node scripts/validate-local.mjs");
  assert.equal(packageJson.scripts["validate:ci-parity"], "node scripts/validate-local.mjs --ci-parity");
  assert.equal(packageJson.scripts["env:doctor"], "node scripts/env-doctor.mjs");
  assert.equal(packageJson.scripts["check:memory-data"], "node scripts/check-memory-data.mjs");
  assert.equal(packageJson.scripts["pr:review-wait"], "node scripts/wait-for-pr-review.mjs");
  assert.equal(packageJson.scripts["pr:closeout"], "node scripts/agent-pr.mjs closeout");
  assert.equal(packageJson.scripts["mxbai:upload"], "bash scripts/mxbai-upload.sh");
  assert.equal(packageJson.scripts["mxbai:smoke"], "bash scripts/mxbai-smoke.sh");
  assert.equal(packageJson.scripts["eval:dogfood-local"], "node tests/scenarios/run-dogfood-local.mjs");
  assert.equal(packageJson.scripts["eval:v7"], "node tests/scenarios/run-v7.mjs");
  assert.equal(packageJson.scripts["eval:v8"], "node tests/scenarios/run-v8.mjs");
  assert.equal(packageJson.scripts["eval:answers"], "node tests/scenarios/run-answers.mjs");
  assert.equal(packageJson.scripts["agent:start"], "node scripts/agent-control.mjs start");
  assert.equal(packageJson.scripts["agent:status"], "node scripts/agent-control.mjs status");
  assert.equal(packageJson.scripts["agent:handoff"], "node scripts/agent-control.mjs handoff");
  assert.equal(packageJson.scripts["agent:note"], "node scripts/agent-control.mjs note");
  assert.equal(packageJson.scripts["agent:policy"], "node scripts/agent-policy.mjs policy");
  assert.equal(packageJson.scripts["agent:validate"], "node scripts/agent-policy.mjs validate");
  assert.equal(packageJson.scripts["agent:run"], "node scripts/agent-run.mjs run");
  assert.equal(packageJson.scripts["agent:diagnose:last"], "node scripts/agent-run.mjs diagnose-last");
  assert.equal(packageJson.scripts["agent:diagnose"], "node scripts/agent-run.mjs diagnose");
  assert.equal(packageJson.scripts["agent:pr"], "node scripts/agent-pr.mjs");
  assert.equal(packageJson.scripts["agent:ci-local"], "node scripts/agent-ci-local.mjs");
  assert.equal(packageJson.scripts["agent:map"], "node scripts/agent-map.mjs");
  assert.equal(packageJson.scripts["agent:workbench"], "node scripts/agent-workbench.mjs");

  assert.match(readFileSync("scripts/validate-local.mjs", "utf8"), /Usage: pnpm validate:local/);
  assert.match(readFileSync(".gitignore", "utf8"), /\.assisto-agent\/runs\//);
  assert.match(readFileSync("scripts/validate-local.mjs", "utf8"), /TMPDIR=\/tmp/);
  assert.match(readFileSync("scripts/env-doctor.mjs", "utf8"), /Usage: pnpm env:doctor/);
  assert.match(readFileSync("scripts/check-memory-data.mjs", "utf8"), /Usage: pnpm check:memory-data/);
  assert.match(readFileSync("scripts/check-memory-data.mjs", "utf8"), /memory\/events/);
  assert.match(readFileSync("scripts/check-memory-data.mjs", "utf8"), /memory\/transactions/);
  assert.match(readFileSync("scripts/check-memory-data.mjs", "utf8"), /untracked_user_memory_paths/);
  assert.match(readFileSync("scripts/agent-pr.mjs", "utf8"), /Usage: pnpm agent:pr status/);
  assert.match(readFileSync("scripts/agent-ci-local.mjs", "utf8"), /Usage: pnpm agent:ci-local --plan/);
  assert.match(readFileSync("scripts/agent-map.mjs", "utf8"), /Usage: pnpm agent:map build/);
  assert.match(readFileSync("scripts/agent-workbench.mjs", "utf8"), /Usage: pnpm agent:workbench serve/);
  assert.match(readFileSync(".devcontainer/ci-local.sh", "utf8"), /pnpm validate:ci-parity/);
  assert.match(readFileSync("scripts/mxbai-smoke.sh", "utf8"), /MXBAI_SMOKE_VERBOSE/);
}
