import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeTempVault, readVaultFile } from "./helpers/temp-vault.mjs";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runCoreImportTests() {
  const importModule = await loadTsModule("packages/core/src/import/index.ts");
  const previewRoot = await makeTempVault("assisto-import-preview-");
  const sourceDir = path.join(previewRoot, "curated-notes");

  try {
    await mkdir(path.join(sourceDir, "nested"), { recursive: true });
    await writeFile(path.join(sourceDir, "one.md"), "Joe is the DBA. We use MySQL.", "utf8");
    await writeFile(path.join(sourceDir, "two.txt"), "Maybe I should ask Jeff about budgets.", "utf8");
    await writeFile(path.join(sourceDir, "skip.csv"), "not imported", "utf8");
    await writeFile(path.join(sourceDir, "nested", "three.md"), "Kuastav reports to Jeff.", "utf8");

    const preview = await importModule.previewImportNotes(
      previewRoot,
      {
        path: sourceDir
      },
      {
        now: "2026-05-23T09:00:00-03:00",
        observed_at: "2026-05-22",
        source_label: "curated import",
        limit: 2
      }
    );

    assert.equal(preview.created, false);
    assert.equal(preview.units_total, 2);
    assert.equal(preview.units_imported, 2);
    assert.equal(preview.units_skipped, 0);
    assert.equal(preview.units[0].event_id, "ev_2026_05_23_001");
    assert.equal(preview.units[1].event_id, "ev_2026_05_23_002");
    assert.equal(preview.units[0].validation.passed, true);
    await assert.rejects(() => readVaultFile(previewRoot, "memory/events/2026/2026-05/2026-05-23-001.md"), /ENOENT/);
  } finally {
    await rm(previewRoot, { recursive: true, force: true });
  }

  const createRoot = await makeTempVault("assisto-import-create-");

  try {
    const created = await importModule.createImportNotes(
      createRoot,
      {
        text: "Joe is the DBA. We use MySQL.\n---\nJoe is the DBA. We use MySQL.\n---\nI will ask Jeff about budgets."
      },
      {
        now: "2026-05-23T09:00:00-03:00",
        source_label: "pasted batch"
      }
    );

    assert.equal(created.created, true);
    assert.equal(created.units_total, 3);
    assert.equal(created.units_imported, 2);
    assert.equal(created.units_skipped, 1);
    assert.equal(created.units[1].skip_reason, "duplicate_source_hash");
    assert.equal(created.units[1].existing_event_id, "ev_2026_05_23_001");
    assert.match(await readVaultFile(createRoot, "memory/events/2026/2026-05/2026-05-23-001.md"), /source_hash: [a-f0-9]{64}/);
    assert.match(await readVaultFile(createRoot, "memory/events/2026/2026-05/2026-05-23-001.md"), /source_label: pasted batch/);
    assert.match(await readVaultFile(createRoot, "memory/transactions/pending/tx_2026_05_23_001.md"), /transaction_state: pending/);
    assert.match(await readVaultFile(createRoot, "memory/transactions/pending/tx_2026_05_23_002.md"), /transaction_state: pending/);
    await assert.rejects(() => readVaultFile(createRoot, "memory/people/joe.md"), /ENOENT/);
  } finally {
    await rm(createRoot, { recursive: true, force: true });
  }

  const triagePreviewRoot = await makeTempVault("assisto-import-triage-preview-");

  try {
    const preview = await importModule.previewImportTriage(
      triagePreviewRoot,
      {
        text: "This initial text is replaced by explicit triage units.",
        units: [
          {
            unit_id: "unit_1",
            action: "keep",
            raw_text: "Joe is the DBA.",
            source_label: "triaged person note",
            observed_at: "2026-05-22",
            context: "ctx_inventory_project"
          },
          {
            unit_id: "unit_2",
            action: "skip",
            raw_text: "Skip this weak duplicate."
          },
          {
            unit_id: "unit_3",
            action: "keep",
            raw_text: "I will ask Jeff about budgets.",
            source_label: "triaged follow-up"
          }
        ]
      },
      {
        now: "2026-05-24T09:00:00-03:00",
        source_label: "fallback triage label"
      }
    );

    assert.equal(preview.action, "import_triage");
    assert.equal(preview.created, false);
    assert.equal(preview.units_total, 3);
    assert.equal(preview.units_kept, 2);
    assert.equal(preview.units_skipped, 1);
    assert.equal(preview.units[0].unit_id, "unit_1");
    assert.equal(preview.units[0].triage_action, "keep");
    assert.equal(preview.units[0].source_label, "triaged person note");
    assert.equal(preview.units[0].observed_at, "2026-05-22");
    assert.equal(preview.units[0].context, "ctx_inventory_project");
    assert.equal(preview.units[0].validation.passed, true);
    assert.equal(preview.units[1].triage_action, "skip");
    assert.equal(preview.units[1].skip_reason, "triage_skip");
    assert.equal(preview.units[2].event_id, "ev_2026_05_24_002");
    await assert.rejects(() => readVaultFile(triagePreviewRoot, "memory/events/2026/2026-05/2026-05-24-001.md"), /ENOENT/);
  } finally {
    await rm(triagePreviewRoot, { recursive: true, force: true });
  }

  const triageCreateRoot = await makeTempVault("assisto-import-triage-create-");

  try {
    const created = await importModule.createImportTriage(
      triageCreateRoot,
      {
        units: [
          {
            unit_id: "unit_1",
            action: "keep",
            raw_text: "Joe is the DBA.",
            source_label: "triaged person note",
            observed_at: "2026-05-22",
            context: "ctx_inventory_project"
          },
          {
            unit_id: "unit_2",
            action: "keep",
            raw_text: "Joe is the DBA.",
            source_label: "triaged duplicate"
          },
          {
            unit_id: "unit_3",
            action: "skip",
            raw_text: "Skip this unit."
          }
        ]
      },
      {
        now: "2026-05-24T09:00:00-03:00"
      }
    );

    assert.equal(created.action, "import_triage");
    assert.equal(created.created, true);
    assert.equal(created.units_total, 3);
    assert.equal(created.units_kept, 1);
    assert.equal(created.units_skipped, 2);
    assert.equal(created.units[1].skip_reason, "duplicate_source_hash");
    assert.equal(created.units[2].skip_reason, "triage_skip");
    assert.match(await readVaultFile(triageCreateRoot, "memory/events/2026/2026-05/2026-05-24-001.md"), /source_label: triaged person note/);
    assert.match(await readVaultFile(triageCreateRoot, "memory/events/2026/2026-05/2026-05-24-001.md"), /ctx_inventory_project/);
    assert.match(await readVaultFile(triageCreateRoot, "memory/transactions/pending/tx_2026_05_24_001.md"), /transaction_state: pending/);
    await assert.rejects(() => readVaultFile(triageCreateRoot, "memory/events/2026/2026-05/2026-05-24-002.md"), /ENOENT/);
    await assert.rejects(() => readVaultFile(triageCreateRoot, "memory/people/joe.md"), /ENOENT/);
  } finally {
    await rm(triageCreateRoot, { recursive: true, force: true });
  }
}
