import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { makeTempVault, readVaultFile, writeVaultFile } from "./helpers/temp-vault.mjs";
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
    assert.equal(result.needs_context, false);
    assert.equal(result.why_staged.some((reason) => reason.includes("Review")), true);
    assert.match(result.likely_next_review_action, /Open Review/);
    assert.equal(result.proposed_file_writes.some((write) => write.path === "memory/people/joe.md"), true);
    assert.equal(result.staged_review_paths.includes("memory/review/unscoped-claims.md"), true);
    await assert.rejects(() => readVaultFile(previewRoot, result.event_path), /ENOENT/);
    await assert.rejects(() => readVaultFile(previewRoot, result.transaction_path), /ENOENT/);

    const noContext = await capture.previewCaptureNote(previewRoot, "We use MySQL.", {
      now: "2026-05-22T09:05:00-03:00",
      observed_at: "2026-05-21",
      source_label: "daily note"
    });
    assert.equal(noContext.needs_context, true);
  } finally {
    await rm(previewRoot, { recursive: true, force: true });
  }

  const createRoot = await makeTempVault("assisto-capture-create-");

  try {
    await writeVaultFile(
      createRoot,
      "memory/contexts/inventory-project.md",
      `---
id: ctx_inventory_project
type: context
object_state: active
review_state: reviewed
created_at: 2026-05-20T12:00:00-03:00
updated_at: 2026-05-20T12:00:00-03:00
aliases:
  - Inventory
source_events: []
related: []
summary_generated_from: []
---

# Inventory Project
`
    );
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

    const inbox = await capture.buildCaptureInboxResult(createRoot, {
      now: "2026-05-22T12:00:00-03:00"
    });
    assert.equal(inbox.recent_events[0].event_id, result.event_id);
    assert.equal(inbox.pending_capture_transactions[0].transaction_id, result.transaction_id);
    assert.equal(inbox.pending_capture_transactions[0].likely_next_review_action, result.likely_next_review_action);
    assert.equal(inbox.context_suggestions[0].id, "ctx_inventory_project");
    assert.equal(inbox.source_label_presets.some((preset) => preset.source_label === "daily note"), true);
    assert.equal(inbox.observed_at_shortcuts[0].date, "2026-05-22");
    assert.equal(inbox.capture_templates.some((template) => template.template_id === "manager_team"), true);
  } finally {
    await rm(createRoot, { recursive: true, force: true });
  }
}
