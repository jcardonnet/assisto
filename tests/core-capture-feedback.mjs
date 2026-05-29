import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeTempVault, readVaultFile } from "./helpers/temp-vault.mjs";
import { writeWorkbenchFixture } from "./workbench.mjs";

export async function runCoreCaptureFeedbackTests() {
  const feedback = await loadTsModule("packages/core/src/capture-feedback/index.ts");
  const kinds = ["wrong_person", "missing_context", "bad_followup", "bad_role_reporting", "other_extraction_issue"];

  for (const kind of kinds) {
    const root = await makeTempVault(`assisto-capture-feedback-${kind}-`);

    try {
      await writeWorkbenchFixture(root);
      const beforeJeff = await readVaultFile(root, "memory/people/jeff.md");
      const preview = await feedback.previewCaptureFeedback(root, {
        kind,
        note: `Capture feedback for ${kind}.`,
        event: "ev_2026_05_21_001",
        transaction: "tx_2026_05_21_001",
        now: "2026-05-24T12:00:00-03:00"
      });

      assert.equal(preview.action, "log_capture_feedback");
      assert.equal(preview.created, false);
      assert.equal(preview.kind, kind);
      assert.deepEqual(preview.operations, ["NOOP"]);
      assert.equal(preview.validation.passed, true);
      assert.equal(preview.linked_event, "ev_2026_05_21_001");
      assert.equal(preview.linked_transaction, "tx_2026_05_21_001");
      assert.equal(preview.source_label, `capture_feedback:${kind}`);
      await assert.rejects(() => readVaultFile(root, preview.event_path), /ENOENT/);
      assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);

      const created = await feedback.createCaptureFeedback(root, {
        kind,
        note: `Capture feedback for ${kind}.`,
        event: "ev_2026_05_21_001",
        transaction: "tx_2026_05_21_001",
        now: "2026-05-24T12:00:00-03:00"
      });

      assert.equal(created.created, true);
      assert.match(await readVaultFile(root, created.event_path), new RegExp(`source_label: capture_feedback:${kind}`));
      assert.match(await readVaultFile(root, created.event_path), /Linked Event:\nev_2026_05_21_001/);
      assert.match(await readVaultFile(root, created.event_path), /Linked Transaction:\ntx_2026_05_21_001/);
      assert.match(await readVaultFile(root, created.transaction_path), /transaction_state: pending/);
      assert.match(await readVaultFile(root, created.transaction_path), /NOOP/);
      await assert.rejects(() => readVaultFile(root, "memory/review/capture-feedback.md"), /ENOENT/);
      assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  const invalidRoot = await makeTempVault("assisto-capture-feedback-invalid-");

  try {
    await assert.rejects(
      () => feedback.previewCaptureFeedback(invalidRoot, { kind: "not_real", note: "Bad kind" }),
      /Unsupported capture feedback kind/
    );
  } finally {
    await rm(invalidRoot, { recursive: true, force: true });
  }
}
