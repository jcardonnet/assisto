import assert from "node:assert/strict";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { makeTempVault, readVaultFile, writeVaultFile } from "./helpers/temp-vault.mjs";
import { loadTsModule } from "./ts-module-loader.mjs";

const expectedPresetIds = [
  "quick-note",
  "meeting-note",
  "person-fact",
  "project-context",
  "follow-up",
  "retrieval-miss",
  "correction",
  "decision-as-claim",
  "open-question-as-claim"
];

export async function runCoreWorkdayCaptureTests() {
  const workdayCapture = await loadTsModule("packages/core/src/workday-capture/index.ts");

  await testPresetsArePresent(workdayCapture);
  await testPreviewIsReadOnly(workdayCapture);
  await testCreateWritesOnlyEventAndPendingTransaction(workdayCapture);
  await testExplicitFieldsOverridePresetDefaults(workdayCapture);
  await testContextSuggestionsSkipInactiveOrMalformedPages(workdayCapture);
  await testFollowUpPresetRespectsExplicitTriggerPolicy(workdayCapture);
  await testSensitivePresetsDoNotCreateCanonicalTruth(workdayCapture);
}

async function testPresetsArePresent(workdayCapture) {
  const presets = await workdayCapture.listWorkdayCapturePresets();
  const ids = presets.map((preset) => preset.preset_id);

  assert.deepEqual(ids, expectedPresetIds);

  for (const preset of presets) {
    assert.equal(typeof preset.label, "string");
    assert.equal(preset.label.length > 0, true);
    assert.equal(typeof preset.source_label, "string");
    assert.equal(preset.source_label.length > 0, true);
    assert.equal(typeof preset.template, "string");
    assert.equal(Array.isArray(preset.suggested_contexts), true);
    assert.match(preset.provider, /^(rule|openai)$/);
  }
}

async function testPreviewIsReadOnly(workdayCapture) {
  const root = await makeTempVault("assisto-workday-preview-");

  try {
    const before = await tree(root);
    const preview = await workdayCapture.previewWorkdayCapture(root, {
      preset_id: "meeting-note",
      note: "Joe is the DBA. We use MySQL.",
      observed_at: "2026-05-21",
      context: "ctx_inventory_project"
    });
    const after = await tree(root);

    assert.deepEqual(after, before);
    assert.equal(preview.note, "Joe is the DBA. We use MySQL.");
    assert.equal(preview.preset.preset_id, "meeting-note");
    assert.equal(preview.event_preview.source_label, "meeting note");
    assert.equal(preview.event_preview.observed_at, "2026-05-21");
    assert.equal(preview.candidate_claims.includes("clm_joe_role_dba"), true);
    assert.equal(preview.pending_transaction_preview.operation_count > 0, true);
    assert.equal(preview.pending_transaction_preview.affected_files.includes("people/joe.md"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testCreateWritesOnlyEventAndPendingTransaction(workdayCapture) {
  const root = await makeTempVault("assisto-workday-create-");

  try {
    const result = await workdayCapture.createWorkdayCapture(root, {
      preset_id: "person-fact",
      note: "Joe is the DBA.",
      observed_at: "2026-05-22",
      source_label: "daily note",
      provider: "rule"
    });

    assert.equal(result.created, true);
    assert.equal(result.event_id, "ev_2026_05_20_001");
    assert.equal(result.transaction_id, "tx_2026_05_20_001");
    assert.match(await readVaultFile(root, result.event_path), /source_label: daily note/);
    assert.match(await readVaultFile(root, result.event_path), /Joe is the DBA\./);
    assert.match(await readVaultFile(root, result.transaction_path), /transaction_state: pending/);
    await assert.rejects(() => readVaultFile(root, "memory/people/joe.md"), /ENOENT/);
    await assert.rejects(() => readVaultFile(root, "memory/review/unscoped-claims.md"), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testExplicitFieldsOverridePresetDefaults(workdayCapture) {
  const root = await makeTempVault("assisto-workday-overrides-");

  try {
    await writeVaultFile(
      root,
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

    const preview = await workdayCapture.previewWorkdayCapture(root, {
      preset_id: "meeting-note",
      note: "For Inventory Project, we use MySQL.",
      observed_at: "2026-05-23",
      source_label: "slack thread",
      context: "ctx_inventory_project",
      provider: "rule"
    });

    assert.equal(preview.event_preview.source_label, "slack thread");
    assert.equal(preview.event_preview.observed_at, "2026-05-23");
    assert.equal(preview.note, "For Inventory Project, we use MySQL.");
    assert.equal(preview.pending_transaction_preview.affected_files.includes("topics/mysql.md"), true);

    const presets = await workdayCapture.listWorkdayCapturePresets(root);
    assert.equal(
      presets.some((preset) => preset.suggested_contexts.some((context) => context.id === "ctx_inventory_project")),
      true
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testContextSuggestionsSkipInactiveOrMalformedPages(workdayCapture) {
  const root = await makeTempVault("assisto-workday-contexts-");

  try {
    await writeVaultFile(
      root,
      "memory/contexts/active-project.md",
      `---
id: ctx_active_project
type: context
object_state: active
review_state: reviewed
aliases:
  - Active
source_events: []
related: []
summary_generated_from: []
---

# Active Project
`
    );
    await writeVaultFile(
      root,
      "memory/contexts/archived-project.md",
      `---
id: ctx_archived_project
type: context
object_state: archived
review_state: reviewed
aliases: []
source_events: []
related: []
summary_generated_from: []
---

# Archived Project
`
    );
    await writeVaultFile(
      root,
      "memory/contexts/not-a-context.md",
      `---
id: top_not_context
type: topic
object_state: active
review_state: reviewed
aliases: []
source_events: []
related: []
summary_generated_from: []
---

# Not A Context
`
    );
    await writeVaultFile(root, "memory/contexts/malformed.md", "---\nid: ctx_broken\ntype: context\n");

    const presets = await workdayCapture.listWorkdayCapturePresets(root);
    const contexts = presets[0].suggested_contexts;

    assert.deepEqual(contexts.map((context) => context.id), ["ctx_active_project"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testFollowUpPresetRespectsExplicitTriggerPolicy(workdayCapture) {
  const root = await makeTempVault("assisto-workday-followup-");

  try {
    const casual = await workdayCapture.previewWorkdayCapture(root, {
      preset_id: "follow-up",
      note: "We discussed asking Joe about budgets."
    });
    assert.equal(casual.candidate_claims.some((claim) => claim.includes("followup")), false);
    assert.equal(casual.pending_transaction_preview.affected_files.some((file) => file.startsWith("followups/")), false);

    const explicit = await workdayCapture.previewWorkdayCapture(root, {
      preset_id: "follow-up",
      note: "I need to ask Joe about budgets."
    });
    assert.equal(explicit.pending_transaction_preview.affected_files.some((file) => file.startsWith("followups/")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testSensitivePresetsDoNotCreateCanonicalTruth(workdayCapture) {
  for (const preset_id of ["retrieval-miss", "correction"]) {
    const root = await makeTempVault(`assisto-workday-${preset_id}-`);

    try {
      const result = await workdayCapture.createWorkdayCapture(root, {
        preset_id,
        note:
          preset_id === "retrieval-miss"
            ? "Assisto could not answer who owns the billing dashboard."
            : "Correction: Alice is not the PM."
      });

      assert.equal(result.created, true);
      assert.match(await readVaultFile(root, result.event_path), /type: event/);
      assert.match(await readVaultFile(root, result.transaction_path), /transaction_state: pending/);
      await assert.rejects(() => readVaultFile(root, "memory/topics/retrieval-miss.md"), /ENOENT/);
      await assert.rejects(() => readVaultFile(root, "memory/people/alice.md"), /ENOENT/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}

async function tree(root) {
  const files = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        await walk(absolute);
      } else {
        files.push(relative);
      }
    }
  }

  await walk(root);
  return files.sort();
}
