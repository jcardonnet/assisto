import assert from "node:assert/strict";
import { buildCiLocalPlan } from "../scripts/agent-ci-local.mjs";

function commandText(step) {
  return step.command.join(" ");
}

export async function runAgentCiLocalTests() {
  const plan = buildCiLocalPlan({ root: "/repo", image: "assisto-test-ci" });
  assert.equal(plan.image, "assisto-test-ci");
  assert.equal(plan.dockerfile, ".devcontainer/Dockerfile");
  assert.equal(plan.script, ".devcontainer/ci-local.sh");
  assert.equal(plan.temp_env.TMPDIR, "/tmp");
  assert.equal(plan.temp_env.PLAYWRIGHT_BROWSERS_PATH, "/ms-playwright");
  assert.equal(plan.credential_env.includes("GH_TOKEN"), true);
  assert.equal(plan.credential_env.includes("MXBAI_API_KEY"), true);
  assert.equal(plan.credential_env.includes("OPENAI_API_KEY"), true);
  assert.match(commandText(plan.steps[1]), /docker build -f \.devcontainer\/Dockerfile/);
  assert.match(commandText(plan.steps[2]), /docker run/);
  assert.match(commandText(plan.steps[2]), /\/repo:\/workspace/);
  assert.match(commandText(plan.steps[2]), /GH_TOKEN/);
}
