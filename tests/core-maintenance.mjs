import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeTempVault, readVaultFile, writeVaultFile } from "./helpers/temp-vault.mjs";
import { writeWorkbenchFixture } from "./workbench.mjs";

export async function runCoreMaintenanceTests() {
  const maintenance = await loadTsModule("packages/core/src/maintenance/index.ts");
  const root = await makeTempVault("assisto-maintenance-");

  try {
    await writeWorkbenchFixture(root);
    await writeVaultFile(root, "memory/topics/malformed.md", "---\ntype: topic\nid: topic_malformed\n");
    const beforePerson = await readVaultFile(root, "memory/people/jeff.md");
    const plan = await maintenance.buildMaintenancePlan(root, { now: "2026-05-27T12:00:00.000Z", mode: "full" });

    assert.equal(plan.version, "maintenance-dream-cycle-v1");
    assert.equal(plan.canonical_writes.length, 0);
    assert.equal(plan.summary.total_findings > 0, true);
    assert.equal(plan.findings.some((finding) => finding.source === "health" && finding.stageable), true);
    assert.equal(plan.findings.some((finding) => finding.source === "review_throughput"), true);
    assert.match(plan.warnings.join("\n"), /does not run in the background/);

    const topicWithoutTopic = await maintenance.buildMaintenancePlan(root, { mode: "topic", now: "2026-05-27T12:00:00.000Z" });
    assert.match(topicWithoutTopic.warnings.join("\n"), /without a topic/);
    await writeVaultFile(root, "memory/topics/malformed.md", "---\ntype: topic\nid: topic_malformed\nobject_state: archived\n---\n\n# Malformed fixture restored for transaction-backed staging.\n");

    const randomA = await maintenance.buildMaintenancePlan(root, { mode: "random", seed: "abc", now: "2026-05-27T12:00:00.000Z" });
    const randomB = await maintenance.buildMaintenancePlan(root, { mode: "random", seed: "abc", now: "2026-05-27T12:00:00.000Z" });
    assert.deepEqual(randomA.findings.map((finding) => finding.finding_id), randomB.findings.map((finding) => finding.finding_id));

    const run = await maintenance.runMaintenance(root, { mode: "changed", seed: "daily", now: "2026-05-27T12:00:00.000Z" });
    assert.equal(run.run_path.startsWith(".assisto-local/lint-runs/"), true);
    const readRun = await maintenance.readMaintenanceRun(root, run.run_id);
    assert.equal(readRun.run_id, run.run_id);
    const runs = await maintenance.listMaintenanceRuns(root);
    assert.equal(runs.some((item) => item.run_id === run.run_id), true);

    const healthFinding = plan.findings.find((finding) => finding.source === "health" && finding.stageable);
    const staged = await maintenance.stageMaintenanceFinding(root, healthFinding.finding_id, {
      now: "2026-05-27T12:00:00.000Z",
      note: "Maintenance review."
    });
    assert.equal(staged.created, true);
    assert.equal(staged.maintenance_finding_id, healthFinding.finding_id);
    assert.match(await readVaultFile(root, staged.transaction_path), /transaction_state: pending/);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePerson);

    const lintOrThroughput = plan.findings.find((finding) => finding.source !== "health");
    if (lintOrThroughput) {
      await assert.rejects(
        () => maintenance.stageMaintenanceFinding(root, lintOrThroughput.finding_id, { now: "2026-05-27T12:00:00.000Z" }),
        /read-only in v1/
      );
    }

    const cleared = await maintenance.clearMaintenanceRuns(root);
    assert.equal(cleared.cleared, true);
    assert.deepEqual(await maintenance.listMaintenanceRuns(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("core-maintenance.mjs")) {
  await runCoreMaintenanceTests();
}
