import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeTempVault, readVaultFile } from "./helpers/temp-vault.mjs";

export async function runCoreSeedTests() {
  const seed = await loadTsModule("packages/core/src/seed/index.ts");

  const previewRoot = await makeTempVault("assisto-core-seed-preview-");

  try {
    const preview = await seed.previewSeedKit(previewRoot, {
      my_role: "I am an AI Engineer at SmartEquip.",
      manager_team: ["Jeff is my manager.", "Kuastav reports to Jeff."],
      open_loops: ["I need to ask Jeff about onboarding."]
    });

    assert.equal(preview.action, "seed_kit");
    assert.equal(preview.created, false);
    assert.equal(preview.units.length, 3);
    assert.equal(preview.units[0].source_label, "seed:role");
    assert.equal(preview.units[1].source_label, "seed:manager-team");
    assert.equal(preview.validation.passed, true);
    assert.equal(preview.units.some((unit) => unit.followup_paths.length > 0), true);
    await assert.rejects(() => readVaultFile(previewRoot, preview.units[0].event_path), /ENOENT/);
    await assert.rejects(() => readVaultFile(previewRoot, "memory/people/jeff.md"), /ENOENT/);
  } finally {
    await rm(previewRoot, { recursive: true, force: true });
  }

  const createRoot = await makeTempVault("assisto-core-seed-create-");

  try {
    const created = await seed.createSeedKit(createRoot, {
      current_projects: ["Inventory Project uses MySQL."],
      important_people: ["Jeff is my manager."]
    });

    assert.equal(created.created, true);
    assert.equal(created.units.length, 2);
    assert.match(await readVaultFile(createRoot, created.units[0].event_path), /source_label: seed:context/);
    assert.match(await readVaultFile(createRoot, created.units[0].transaction_path), /transaction_state: pending/);
    assert.match(await readVaultFile(createRoot, created.units[1].event_path), /source_label: seed:person/);
    await assert.rejects(() => readVaultFile(createRoot, "memory/people/jeff.md"), /ENOENT/);
    await assert.rejects(() => readVaultFile(createRoot, "memory/contexts/inventory-project.md"), /ENOENT/);
  } finally {
    await rm(createRoot, { recursive: true, force: true });
  }
}
