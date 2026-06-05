import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { readVaultFile } from "./helpers/temp-vault.mjs";
import {
  createScenarioVault,
  makeScenarioVault,
  scenarioNames,
  writeConflictingRoleScenario,
  writeContextProjectScenario,
  writeDuplicateImportScenario,
  writeManagerChainScenario,
  writeMissingEvidenceScenario,
  writeRetrievalNoMatchScenario,
  writeReviewBacklogScenario,
  writeStaleNoopScenario
} from "./helpers/scenario-factory.mjs";

export async function runScenarioFactoryTests() {
  assert.deepEqual(scenarioNames, [
    "manager-chain",
    "review-backlog",
    "stale-noop",
    "context-project",
    "duplicate-import",
    "conflicting-role-claims",
    "missing-evidence",
    "retrieval-no-match"
  ]);

  const createdManager = await createScenarioVault("manager-chain");
  try {
    const personPage = await readVaultFile(createdManager.root, "memory/people/kuastav.md");
    assert.match(personPage, /claim_id: clm_kuastav_reports_to_jeff/);
    assert.match(personPage, /source_events:/);
    assert.match(personPage, /ev_manager_chain_001/);
  } finally {
    await rm(createdManager.root, { recursive: true, force: true });
  }

  const emptyRetrieval = await createScenarioVault("retrieval-no-match");
  try {
    assert.equal(existsSync(path.join(emptyRetrieval.root, "memory/schema")), true);
    assert.equal(existsSync(path.join(emptyRetrieval.root, "memory/events")), true);
  } finally {
    await rm(emptyRetrieval.root, { recursive: true, force: true });
  }

  await assert.rejects(() => createScenarioVault("unknown-scenario"), /Unknown scenario/);

  const managerRoot = await makeScenarioVault("manager-chain");
  try {
    await writeManagerChainScenario(managerRoot);
    assert.match(await readVaultFile(managerRoot, "memory/people/kuastav.md"), /Kuastav reports to Jeff/);
    assert.match(await readVaultFile(managerRoot, "memory/people/jeff.md"), /Jeff is my manager/);
  } finally {
    await rm(managerRoot, { recursive: true, force: true });
  }

  const workbenchRoot = await makeScenarioVault("context-project");
  try {
    await writeContextProjectScenario(workbenchRoot);
    await writeReviewBacklogScenario(workbenchRoot);
    await writeStaleNoopScenario(workbenchRoot);
    assert.match(await readVaultFile(workbenchRoot, "memory/review/mysql-scope.md"), /unscoped_claim/);
    assert.match(await readVaultFile(workbenchRoot, "memory/events/2026/2026-05/2026-05-21-003.md"), /SmartEquip/);
  } finally {
    await rm(workbenchRoot, { recursive: true, force: true });
  }

  const importRoot = await makeScenarioVault("duplicate-import");
  try {
    await writeDuplicateImportScenario(importRoot);
    assert.match(await readVaultFile(importRoot, "notes/import-a.md"), /Jeff is my manager/);
    assert.match(await readVaultFile(importRoot, "notes/import-b.md"), /warehouse rollout/);
  } finally {
    await rm(importRoot, { recursive: true, force: true });
  }

  const edgeRoot = await makeScenarioVault("edge-cases");
  try {
    await writeConflictingRoleScenario(edgeRoot);
    await writeMissingEvidenceScenario(edgeRoot);
    await writeRetrievalNoMatchScenario(edgeRoot);
    assert.match(await readVaultFile(edgeRoot, "memory/review/role-conflict.md"), /role_change/);
    assert.match(await readVaultFile(edgeRoot, "memory/topics/mysql.md"), /ev_missing/);
    assert.equal(existsSync(path.join(edgeRoot, "memory/schema")), true);
  } finally {
    await rm(edgeRoot, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("scenario-factory.mjs")) {
  await runScenarioFactoryTests();
  console.log("scenario factory tests passed");
}
