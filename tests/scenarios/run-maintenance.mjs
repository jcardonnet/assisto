import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { makeTempVault } from "../helpers/temp-vault.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";

const root = await makeTempVault("assisto-eval-maintenance-");

try {
  await writeWorkbenchFixture(root);
  const maintenance = await loadTsModule("packages/core/src/maintenance/index.ts");
  const plan = await maintenance.buildMaintenancePlan(root, { mode: "full", seed: "eval", now: "2026-05-27T12:00:00.000Z" });
  const randomA = await maintenance.buildMaintenancePlan(root, { mode: "random", seed: "eval", now: "2026-05-27T12:00:00.000Z" });
  const randomB = await maintenance.buildMaintenancePlan(root, { mode: "random", seed: "eval", now: "2026-05-27T12:00:00.000Z" });
  const run = await maintenance.runMaintenance(root, { mode: "changed", seed: "eval", now: "2026-05-27T12:00:00.000Z" });
  const metrics = {
    unsafeCanonicalWrites: plan.canonical_writes.length,
    findings: plan.summary.total_findings,
    stageableFindings: plan.summary.stageable,
    deterministicRandom: JSON.stringify(randomA.findings.map((finding) => finding.finding_id)) === JSON.stringify(randomB.findings.map((finding) => finding.finding_id)) ? 1 : 0,
    localRunCreated: run.run_path.startsWith(".assisto-local/lint-runs/") ? 1 : 0,
    backgroundLinting: 0
  };

  assert.equal(metrics.unsafeCanonicalWrites, 0);
  assert.equal(metrics.findings > 0, true);
  assert.equal(metrics.stageableFindings > 0, true);
  assert.equal(metrics.deterministicRandom, 1);
  assert.equal(metrics.localRunCreated, 1);
  assert.equal(metrics.backgroundLinting, 0);

  console.log("✓ maintenance plan is derived, deterministic, and local-run backed");
  console.log(JSON.stringify({ metrics }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
