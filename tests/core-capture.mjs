import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { makeTempVault, readVaultFile } from "./helpers/temp-vault.mjs";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runCoreCaptureTests() {
  const capture = await loadTsModule("packages/core/src/capture/index.ts");
  const previewRoot = await makeTempVault("assisto-capture-preview-");

  try {
    const result = await capture.previewCaptureNote(previewRoot, "Joe is the DBA.\nWe use MySQL.", {
      now: "2026-05-22T09:00:00-03:00",
      observed_at: "2026-05-21",
      source_label: "daily note",
      context: "ctx_inventory_project"
    });

    assert.equal(result.created, false);
    assert.equal(result.event_id, "ev_2026_05_22_001");
    assert.equal(result.transaction_id, "tx_2026_05_22_001");
    assert.equal(result.validation.passed, true);
    assert.deepEqual(result.contexts, ["ctx_inventory_project"]);
    assert.equal(result.source_label, "daily note");
    assert.equal(result.proposed_file_writes.some((write) => write.path === "memory/people/joe.md"), true);
    assert.equal(result.staged_review_paths.includes("memory/review/unscoped-claims.md"), true);
    await assert.rejects(() => readVaultFile(previewRoot, result.event_path), /ENOENT/);
    await assert.rejects(() => readVaultFile(previewRoot, result.transaction_path), /ENOENT/);
  } finally {
    await rm(previewRoot, { recursive: true, force: true });
  }

  const createRoot = await makeTempVault("assisto-capture-create-");

  try {
    const result = await capture.createCaptureNote(createRoot, "Joe is the DBA.\nWe use MySQL.", {
      now: "2026-05-22T09:00:00-03:00",
      observed_at: "2026-05-21",
      source_label: "daily note",
      context: "ctx_inventory_project"
    });

    assert.equal(result.created, true);
    assert.equal(result.event_id, "ev_2026_05_22_001");
    assert.equal(result.transaction_id, "tx_2026_05_22_001");
    assert.equal(result.validation.passed, true);
    assert.match(await readVaultFile(createRoot, result.event_path), /source_label: daily note/);
    assert.match(await readVaultFile(createRoot, result.event_path), /ctx_inventory_project/);
    assert.match(await readVaultFile(createRoot, result.event_path), /Joe is the DBA\.\nWe use MySQL\./);
    assert.match(await readVaultFile(createRoot, result.transaction_path), /transaction_state: pending/);
    await assert.rejects(() => readVaultFile(createRoot, "memory/people/joe.md"), /ENOENT/);
    await assert.rejects(() => readVaultFile(createRoot, "memory/review/unscoped-claims.md"), /ENOENT/);
  } finally {
    await rm(createRoot, { recursive: true, force: true });
  }
}
