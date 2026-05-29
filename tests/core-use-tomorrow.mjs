import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeTempVault, readVaultFile, writeVaultFile } from "./helpers/temp-vault.mjs";
import { writeContextProjectScenario, writeManagerChainScenario } from "./helpers/scenario-factory.mjs";

export async function runCoreUseTomorrowTests() {
  const useTomorrow = await loadTsModule("packages/core/src/use-tomorrow/index.ts");

  const emptyRoot = await makeTempVault("assisto-use-tomorrow-empty-");

  try {
    const result = await useTomorrow.buildUseAssistoTomorrowResult(emptyRoot, {
      now: "2026-05-29T09:00:00.000Z"
    });

    assert.equal(result.generated_at, "2026-05-29T09:00:00.000Z");
    assert.equal(result.memory_state, "empty");
    assert.equal(result.complete, false);
    assert.equal(result.counts.events, 0);
    assert.equal(result.counts.pinned_questions, 0);
    assert.equal(result.next_step.step_id, "seed");
    assert.equal(result.steps.find((step) => step.step_id === "seed").state, "ready");
    assert.equal(result.steps.find((step) => step.step_id === "capture").state, "ready");
    assert.equal(result.steps.find((step) => step.step_id === "ask_cited_question").state, "blocked");
    assert.equal(result.steps.find((step) => step.step_id === "generate_brief").state, "blocked");
    await assert.rejects(() => readVaultFile(emptyRoot, ".assisto-local/retrieval/questions.json"), /ENOENT/);
  } finally {
    await rm(emptyRoot, { recursive: true, force: true });
  }

  const seededRoot = await makeTempVault("assisto-use-tomorrow-seeded-");

  try {
    await writeManagerChainScenario(seededRoot);
    const result = await useTomorrow.buildUseAssistoTomorrowResult(seededRoot, {
      now: "2026-05-29T09:00:00.000Z"
    });

    assert.equal(result.memory_state, "seeded");
    assert.equal(result.counts.seeded_pages, 2);
    assert.equal(result.counts.events, 1);
    assert.equal(result.steps.find((step) => step.step_id === "seed").state, "complete");
    assert.equal(result.steps.find((step) => step.step_id === "capture").state, "complete");
    assert.equal(result.steps.find((step) => step.step_id === "review_one_transaction").state, "complete");
    assert.equal(result.steps.find((step) => step.step_id === "ask_cited_question").state, "ready");
    assert.equal(result.steps.find((step) => step.step_id === "pin_question").state, "ready");
    assert.equal(result.next_step.step_id, "ask_cited_question");
    assert.equal(result.suggested_actions.some((action) => /Ask/.test(action)), true);
  } finally {
    await rm(seededRoot, { recursive: true, force: true });
  }

  const activeRoot = await makeTempVault("assisto-use-tomorrow-active-");

  try {
    await writeContextProjectScenario(activeRoot);
    await writeVaultFile(
      activeRoot,
      ".assisto-local/retrieval/questions.json",
      JSON.stringify({ updated_at: "2026-05-29T09:00:00.000Z", questions: ["Who is my manager?"] }, null, 2)
    );
    const beforePersonPage = await readVaultFile(activeRoot, "memory/people/jeff.md");
    const result = await useTomorrow.buildUseAssistoTomorrowResult(activeRoot, {
      now: "2026-05-29T09:00:00.000Z"
    });

    assert.equal(result.memory_state, "active");
    assert.equal(result.counts.pinned_questions, 1);
    assert.equal(result.counts.pending_transactions, 4);
    assert.equal(result.steps.find((step) => step.step_id === "ask_cited_question").state, "complete");
    assert.equal(result.steps.find((step) => step.step_id === "pin_question").state, "complete");
    assert.equal(result.steps.find((step) => step.step_id === "preview_missing_memory").state, "ready");
    assert.equal(result.next_step.step_id, "review_one_transaction");
    assert.equal(result.linked_routes.ask, "/api/ask/session");
    assert.equal(await readVaultFile(activeRoot, "memory/people/jeff.md"), beforePersonPage);
  } finally {
    await rm(activeRoot, { recursive: true, force: true });
  }
}
