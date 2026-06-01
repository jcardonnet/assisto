import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { makeTempVault, readVaultFile } from "./helpers/temp-vault.mjs";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runDogfoodFeedbackV2Tests() {
  const dogfoodFeedback = await loadTsModule("packages/core/src/dogfood/feedback.ts");
  const purePreview = dogfoodFeedback.previewDogfoodFeedback({
    kind: "retrieval_miss",
    question: "Who owns backups?",
    note: "Expected Atlas backup owner."
  });

  assert.equal(purePreview.event.type, "Event");
  assert.equal(purePreview.event.source_label, "dogfood:retrieval_miss");
  assert.match(purePreview.event.raw_text, /Who owns backups\?/);
  assert.match(purePreview.event.raw_text, /Expected Atlas backup owner/);
  assert.equal(purePreview.transaction.operations[0].op, "NOOP");
  assert.equal(purePreview.canonical_writes.length, 0);

  const previewRoot = await makeTempVault("assisto-dogfood-feedback-preview-");

  try {
    const preview = await dogfoodFeedback.previewDogfoodFeedbackTransaction(previewRoot, {
      kind: "bad_answer",
      question: "Who owns backups?",
      note: "The answer cited the wrong owner.",
      now: "2026-05-29T10:00:00.000Z"
    });

    assert.equal(preview.action, "log_dogfood_feedback");
    assert.equal(preview.created, false);
    assert.equal(preview.kind, "bad_answer");
    assert.deepEqual(preview.operations, ["NOOP"]);
    assert.deepEqual(preview.proposed_file_writes, []);
    assert.deepEqual(preview.canonical_writes, []);
    assert.equal(preview.validation.passed, true);
    assert.equal(preview.source_label, "dogfood:bad_answer");
    await assert.rejects(() => readVaultFile(previewRoot, preview.event_path), /ENOENT/);
    await assert.rejects(() => readVaultFile(previewRoot, preview.transaction_path), /ENOENT/);
  } finally {
    await rm(previewRoot, { recursive: true, force: true });
  }

  const createRoot = await makeTempVault("assisto-dogfood-feedback-create-");

  try {
    const created = await dogfoodFeedback.createDogfoodFeedback(createRoot, {
      kind: "missing_context",
      question: "What is the rollout status?",
      note: "Memory needs the inventory rollout context.",
      now: "2026-05-29T10:00:00.000Z"
    });

    assert.equal(created.action, "log_dogfood_feedback");
    assert.equal(created.created, true);
    assert.equal(created.validation.passed, true);
    assert.match(await readVaultFile(createRoot, created.event_path), /source_label: dogfood:missing_context/);
    assert.match(await readVaultFile(createRoot, created.event_path), /What is the rollout status\?/);
    assert.match(await readVaultFile(createRoot, created.transaction_path), /transaction_state: pending/);
    assert.match(await readVaultFile(createRoot, created.transaction_path), /NOOP/);
    await assert.rejects(() => readVaultFile(createRoot, "memory/topics/dogfood-feedback.md"), /ENOENT/);
  } finally {
    await rm(createRoot, { recursive: true, force: true });
  }

  const evalV2 = await loadTsModule("packages/core/src/dogfood/eval-v2.ts");
  const metrics = evalV2.summarizePersonalDogfoodEvalV2({
    metrics: {
      answerability: 0.75,
      citation_coverage: 0.5,
      missing_memory_guidance_count: 2,
      generated_persistence_violations: 0
    },
    questions: [
      { basis: { proofPaths: [{ proof_id: "proof_1" }] } },
      { basis: { proofPaths: [] } }
    ]
  });

  assert.equal(metrics.answerability, 0.75);
  assert.equal(metrics.citationCoverage, 0.5);
  assert.equal(metrics.proofPathCoverage, 0.5);
  assert.equal(metrics.missingMemoryGuidance, 2);
  assert.equal(metrics.generatedPersistenceViolations, 0);
}

if (process.argv[1]?.endsWith("dogfood-feedback-v2.mjs")) {
  await runDogfoodFeedbackV2Tests();
}
