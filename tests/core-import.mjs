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
            raw_text: "We use MySQL.",
            source_label: "triaged unscoped topic"
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
    assert.equal(preview.units[0].extraction_summary.claim_count > 0, true);
    assert.equal(preview.units[0].extraction_summary.likely_outcome, "safe");
    assert.equal(preview.units[1].triage_action, "skip");
    assert.equal(preview.units[1].skip_reason, "triage_skip");
    assert.equal(preview.units[1].extraction_summary.likely_outcome, "skipped");
    assert.equal(preview.units[2].event_id, "ev_2026_05_24_002");
    assert.equal(preview.units[2].extraction_summary.likely_outcome, "staged");
    assert.equal(preview.estimated_review_load.units_needing_review, 1);
    assert.equal(preview.likely_counts.staged, 1);
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
    assert.equal(created.duplicate_groups.length, 1);
    assert.equal(created.duplicate_groups[0].unit_ids.includes("unit_1"), true);
    assert.equal(created.duplicate_groups[0].unit_ids.includes("unit_2"), true);
    assert.equal(created.likely_counts.duplicates, 1);
    assert.match(await readVaultFile(triageCreateRoot, "memory/events/2026/2026-05/2026-05-24-001.md"), /source_label: triaged person note/);
    assert.match(await readVaultFile(triageCreateRoot, "memory/events/2026/2026-05/2026-05-24-001.md"), /ctx_inventory_project/);
    assert.match(await readVaultFile(triageCreateRoot, "memory/transactions/pending/tx_2026_05_24_001.md"), /transaction_state: pending/);
    await assert.rejects(() => readVaultFile(triageCreateRoot, "memory/events/2026/2026-05/2026-05-24-002.md"), /ENOENT/);
    await assert.rejects(() => readVaultFile(triageCreateRoot, "memory/people/joe.md"), /ENOENT/);
  } finally {
    await rm(triageCreateRoot, { recursive: true, force: true });
  }

  const assistantEmptyRoot = await makeTempVault("assisto-import-assistant-empty-");

  try {
    const assistant = await importModule.buildImportAssistantResult(assistantEmptyRoot, {
      now: "2026-05-25T09:00:00-03:00"
    });

    assert.equal(assistant.generated_at, "2026-05-25T09:00:00-03:00");
    assert.equal(assistant.session_count, 0);
    assert.equal(assistant.recipe.title, "Import 10 curated notes");
    assert.equal(assistant.suggested_next_batch_size, 10);
    assert.equal(assistant.review_load_forecast.level, "empty");
    assert.equal(assistant.likely_counts.safe, 0);
    await assert.rejects(() => readVaultFile(assistantEmptyRoot, "memory/events/2026/2026-05/2026-05-25-001.md"), /ENOENT/);
  } finally {
    await rm(assistantEmptyRoot, { recursive: true, force: true });
  }

  const assistantDuplicateRoot = await makeTempVault("assisto-import-assistant-duplicate-");

  try {
    await writeImportAssistantSession(assistantDuplicateRoot, "imp_duplicate", {
      action: "import_triage",
      created: false,
      units_total: 4,
      units_kept: 2,
      units_skipped: 2,
      provider_name: "rule-based",
      units: [],
      duplicate_groups: [
        {
          source_hash: "a".repeat(64),
          unit_ids: ["unit_1", "unit_3"],
          existing_event_id: "ev_existing",
          existing_event_path: "memory/events/2026/2026-05/2026-05-20-001.md"
        }
      ],
      estimated_review_load: {
        units_needing_review: 1,
        staged_review_items: 1,
        conflict_units: 0,
        duplicate_units: 2
      },
      likely_counts: {
        safe: 1,
        staged: 1,
        conflicts: 0,
        duplicates: 2,
        skipped: 0
      }
    });

    const assistant = await importModule.buildImportAssistantResult(assistantDuplicateRoot, {
      now: "2026-05-25T09:00:00-03:00"
    });

    assert.equal(assistant.session_count, 1);
    assert.equal(assistant.duplicate_groups.length, 1);
    assert.deepEqual(assistant.duplicate_groups[0].unit_ids, ["unit_1", "unit_3"]);
    assert.equal(assistant.review_load_forecast.duplicate_units, 2);
    assert.equal(assistant.review_load_forecast.level, "light");
    assert.equal(assistant.suggested_next_batch_size, 10);
    assert.match(assistant.suggested_actions.join("\n"), /Prune duplicate/);
  } finally {
    await rm(assistantDuplicateRoot, { recursive: true, force: true });
  }

  const assistantHighLoadRoot = await makeTempVault("assisto-import-assistant-high-");

  try {
    await writeImportAssistantSession(assistantHighLoadRoot, "imp_high_load", {
      action: "import_triage",
      created: false,
      units_total: 16,
      units_kept: 16,
      units_skipped: 0,
      provider_name: "rule-based",
      units: [],
      duplicate_groups: [],
      estimated_review_load: {
        units_needing_review: 12,
        staged_review_items: 18,
        conflict_units: 2,
        duplicate_units: 0
      },
      likely_counts: {
        safe: 4,
        staged: 10,
        conflicts: 2,
        duplicates: 0,
        skipped: 0
      }
    });

    const assistant = await importModule.buildImportAssistantResult(assistantHighLoadRoot, {
      now: "2026-05-25T09:00:00-03:00"
    });

    assert.equal(assistant.review_load_forecast.level, "high");
    assert.equal(assistant.review_load_forecast.units_needing_review, 12);
    assert.equal(assistant.likely_counts.conflicts, 2);
    assert.equal(assistant.suggested_next_batch_size, 5);
    assert.match(assistant.suggested_actions.join("\n"), /Use a smaller next batch/);
  } finally {
    await rm(assistantHighLoadRoot, { recursive: true, force: true });
  }
}

async function writeImportAssistantSession(root, sessionId, result) {
  const sessionDir = path.join(root, ".assisto-local", "import-sessions");
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    path.join(sessionDir, `${sessionId}.json`),
    `${JSON.stringify(
      {
        session_id: sessionId,
        created_at: "2026-05-25T09:00:00-03:00",
        result: {
          ...result,
          session_id: sessionId
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}
