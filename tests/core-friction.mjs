import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { makeTempVault, readVaultFile } from "./helpers/temp-vault.mjs";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runCoreFrictionTests() {
  const friction = await loadTsModule("packages/core/src/friction/index.ts");
  const core = await loadTsModule("packages/core/src/index.ts");
  const previewRoot = await makeTempVault("assisto-friction-preview-");

  try {
    const preview = await friction.previewFrictionLog(previewRoot, {
      kind: "retrieval_miss",
      question: "What is the Neptune deploy key?",
      note: "Memory could not answer the Neptune deploy key question.",
      now: "2026-05-27T10:00:00.000Z"
    });

    assert.equal(preview.action, "log_friction");
    assert.equal(preview.created, false);
    assert.equal(preview.kind, "retrieval_miss");
    assert.equal(preview.event_id, "ev_2026_05_27_001");
    assert.equal(preview.transaction_id, "tx_2026_05_27_001");
    assert.deepEqual(preview.operations, ["NOOP"]);
    assert.deepEqual(preview.affected_files, ["events/2026/2026-05/2026-05-27-001.md"]);
    assert.deepEqual(preview.source_events, ["ev_2026_05_27_001"]);
    assert.deepEqual(preview.proposed_file_writes, []);
    assert.equal(preview.source_label, "friction:retrieval_miss");
    assert.equal(preview.validation.passed, true);
    assert.match(preview.event_raw_text, /What is the Neptune deploy key\?/);
    await assert.rejects(() => readVaultFile(previewRoot, preview.event_path), /ENOENT/);
    await assert.rejects(() => readVaultFile(previewRoot, preview.transaction_path), /ENOENT/);
  } finally {
    await rm(previewRoot, { recursive: true, force: true });
  }

  const createRoot = await makeTempVault("assisto-friction-create-");

  try {
    const created = await friction.createFrictionLog(createRoot, {
      kind: "bad_answer",
      question: "Who owns Neptune?",
      note: "The answer mixed up Neptune with the inventory project.",
      now: "2026-05-27T10:00:00.000Z"
    });

    assert.equal(created.action, "log_friction");
    assert.equal(created.created, true);
    assert.equal(created.kind, "bad_answer");
    assert.deepEqual(created.operations, ["NOOP"]);
    assert.equal(created.validation.passed, true);
    assert.match(await readVaultFile(createRoot, created.event_path), /source_label: friction:bad_answer/);
    assert.match(await readVaultFile(createRoot, created.event_path), /Who owns Neptune\?/);
    assert.match(await readVaultFile(createRoot, created.event_path), /The answer mixed up Neptune/);
    assert.match(await readVaultFile(createRoot, created.transaction_path), /transaction_state: pending/);
    assert.match(await readVaultFile(createRoot, created.transaction_path), /NOOP/);

    const files = await core.listMarkdownFiles(createRoot, "memory/**/*.md");
    assert.deepEqual(files.sort(), [created.event_path, created.transaction_path].sort());
  } finally {
    await rm(createRoot, { recursive: true, force: true });
  }

  const invalidRoot = await makeTempVault("assisto-friction-invalid-");

  try {
    await assert.rejects(
      () =>
        friction.previewFrictionLog(invalidRoot, {
          kind: "merge_people",
          note: "This should not be accepted."
        }),
      /Unsupported friction kind/
    );
  } finally {
    await rm(invalidRoot, { recursive: true, force: true });
  }
}
