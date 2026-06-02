import assert from "node:assert/strict";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { makeTempVault } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

const thresholds = JSON.parse(await readFile("tests/golden/context-packs-eval-thresholds.json", "utf8"));
const contextPacks = await loadTsModule("packages/core/src/context-packs/index.ts");

const metrics = {
  citationCoverage: 0,
  unsupportedPackClaims: 0,
  generatedPersistenceViolations: 0,
  cannotConfirmCoverage: 0
};

const root = await makeTempVault("eval-context-packs-");

try {
  await writeWorkbenchFixture(root);
  const beforeSnapshot = await snapshotFiles(root);

  await suite("task and person packs carry cited claims and Event evidence", async () => {
    const taskPack = await contextPacks.buildTaskPack(root, "Who is my manager?", "2026-06-02T00:00:00.000Z");
    const personPack = await contextPacks.buildPersonPack(root, "Jeff", "2026-06-02T00:00:00.000Z");

    assert.equal(taskPack.active_claims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(personPack.active_claims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(taskPack.evidence_events.some((event) => event.id === "ev_2026_05_21_001"), true);
    assert.deepEqual(taskPack.canonical_writes, []);
    assert.match(taskPack.compact_markdown, /clm_jeff_manager/);
    assert.match(taskPack.compact_markdown, /ev_2026_05_21_001/);

    const packs = [taskPack, personPack];
    metrics.citationCoverage = ratio(
      packs.reduce((count, pack) => count + supportedClaims(pack), 0),
      packs.reduce((count, pack) => count + pack.active_claims.length, 0)
    );
    metrics.unsupportedPackClaims += packs.reduce((count, pack) => count + unsupportedClaims(pack), 0);
  });

  await suite("no-match packs surface missing-memory guidance", async () => {
    const noMatchPack = await contextPacks.buildTaskPack(root, "What is the Neptune deploy key?", "2026-06-02T00:00:00.000Z");

    assert.equal(noMatchPack.cannot_confirm.some((item) => item.code === "no_match"), true);
    assert.equal(noMatchPack.repair_actions.some((action) => action.action === "capture_note"), true);
    assert.equal(noMatchPack.repair_actions.some((action) => action.action === "log_friction"), true);

    metrics.cannotConfirmCoverage = noMatchPack.cannot_confirm.length > 0 && noMatchPack.repair_actions.length >= 2 ? 1 : 0;
  });

  const afterSnapshot = await snapshotFiles(root);
  metrics.generatedPersistenceViolations = arraysEqual(beforeSnapshot, afterSnapshot) ? 0 : 1;

  assert.equal(metrics.unsupportedPackClaims <= thresholds.unsupportedPackClaimsMax, true);
  assert.equal(metrics.generatedPersistenceViolations <= thresholds.generatedPersistenceViolationsMax, true);
  assert.equal(metrics.citationCoverage >= thresholds.citationCoverageMin, true);
  assert.equal(metrics.cannotConfirmCoverage >= thresholds.cannotConfirmCoverageMin, true);

  console.log(JSON.stringify({ ok: true, metrics }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}

async function suite(name, fn) {
  await fn();
  console.log(`ok - ${name}`);
}

function supportedClaims(pack) {
  return pack.active_claims.filter((claim) =>
    claim.evidence.length > 0 && claim.evidence.every((eventId) => pack.evidence_events.some((event) => event.id === eventId))
  ).length;
}

function unsupportedClaims(pack) {
  return pack.active_claims.length - supportedClaims(pack);
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : numerator / denominator;
}

async function snapshotFiles(root) {
  const files = await listFiles(path.join(root, "memory"));
  return Promise.all(
    files.sort().map(async (file) => ({
      path: path.relative(root, file),
      content: await readFile(file, "utf8")
    }))
  );
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function arraysEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
