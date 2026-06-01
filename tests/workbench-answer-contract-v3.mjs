import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { makeTempVault } from "./helpers/temp-vault.mjs";
import { loadTsModule } from "./ts-module-loader.mjs";
import { writeWorkbenchFixture } from "./workbench.mjs";

export async function runWorkbenchAnswerContractV3Tests() {
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  const root = await makeTempVault("assisto-workbench-answer-v3-");

  try {
    await writeWorkbenchFixture(root);
    const response = await workbench.handleWorkbenchRoute(root, {
      method: "GET",
      url: "/api/ask/answer-contract-v3?q=Who%20is%20my%20manager%3F"
    });
    const body = JSON.parse(response.body);

    assert.equal(response.status, 200);
    assert.equal(body.version, "answer-contract-v3");
    assert.equal(Array.isArray(body.directAnswers), true);
    assert.equal(Array.isArray(body.repairActions), true);
    assert.equal(body.directAnswers.some((answer) => (answer.proof_paths ?? []).length > 0), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("workbench-answer-contract-v3.mjs")) {
  await runWorkbenchAnswerContractV3Tests();
}
