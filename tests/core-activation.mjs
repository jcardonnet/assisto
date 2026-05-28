import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeTempVault } from "./helpers/temp-vault.mjs";
import { writeContextProjectScenario, writeManagerChainScenario } from "./helpers/scenario-factory.mjs";

export async function runCoreActivationTests() {
  const activationModule = await loadTsModule("packages/core/src/activation/index.ts");

  const seededRoot = await makeTempVault("assisto-core-activation-seeded-");

  try {
    await writeManagerChainScenario(seededRoot);
    const status = await activationModule.buildActivationStatusResult(seededRoot, {
      now: "2026-05-28T12:00:00.000Z"
    });

    assert.equal(status.generated_at, "2026-05-28T12:00:00.000Z");
    assert.equal(status.memory_state, "seeded");
    assert.equal(status.activated, true);
    assert.equal(status.counts.seeded_people, 2);
    assert.equal(status.counts.seeded_contexts, 0);
    assert.equal(status.counts.events, 1);
    assert.equal(status.first_useful_ask.ready, true);
    assert.equal(status.first_useful_ask.suggested_questions.includes("Who is my manager?"), true);
    assert.equal(status.next_wizard_step.step_id, "ask_cited_question");
    assert.equal(status.wizard_steps.find((step) => step.step_id === "create_first_capture").state, "complete");
    assert.equal(status.wizard_steps.find((step) => step.step_id === "review_one_transaction").state, "complete");
    assert.equal(status.wizard_steps.find((step) => step.step_id === "ask_cited_question").state, "ready");
    assert.equal(status.health_blockers.length, 0);
  } finally {
    await rm(seededRoot, { recursive: true, force: true });
  }

  const activeRoot = await makeTempVault("assisto-core-activation-active-");

  try {
    await writeContextProjectScenario(activeRoot);
    const status = await activationModule.buildActivationStatusResult(activeRoot, {
      now: "2026-05-28T12:00:00.000Z"
    });

    assert.equal(status.memory_state, "active");
    assert.equal(status.activated, true);
    assert.equal(status.counts.seeded_people > 0, true);
    assert.equal(status.counts.seeded_contexts > 0, true);
    assert.equal(status.counts.pending_transactions, 4);
    assert.equal(status.review_backlog[0].review_reason, "unscoped_claim");
    assert.equal(status.next_wizard_step.step_id, "review_one_transaction");
    assert.match(status.suggested_next_action, /Review pending transaction/);
  } finally {
    await rm(activeRoot, { recursive: true, force: true });
  }

  const emptyRoot = await makeTempVault("assisto-core-activation-empty-");

  try {
    const status = await activationModule.buildActivationStatusResult(emptyRoot, {
      now: "2026-05-28T12:00:00.000Z"
    });

    assert.equal(status.memory_state, "empty");
    assert.equal(status.activated, false);
    assert.equal(status.counts.seeded_people, 0);
    assert.equal(status.counts.seeded_contexts, 0);
    assert.equal(status.first_useful_ask.ready, false);
    assert.match(status.first_useful_ask.blockers.join("\n"), /Capture or import at least one Event/);
    assert.equal(status.next_wizard_step.step_id, "create_first_capture");
    assert.equal(status.wizard_steps.find((step) => step.step_id === "check_environment").state, "complete");
    assert.equal(status.wizard_steps.find((step) => step.step_id === "create_first_capture").state, "ready");
    assert.equal(status.wizard_steps.find((step) => step.step_id === "ask_cited_question").state, "blocked");
  } finally {
    await rm(emptyRoot, { recursive: true, force: true });
  }
}
