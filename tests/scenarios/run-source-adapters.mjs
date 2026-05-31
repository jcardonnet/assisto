import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { makeTempVault, readVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";

const thresholds = JSON.parse(await readFile("tests/golden/source-adapters-eval-thresholds.json", "utf8"));
const adapters = await loadTsModule("packages/core/src/source-adapters/index.ts");

const metrics = {
  unsafeCanonicalWrites: 0,
  eventRawTextRewrite: 0,
  duplicateImportPrevention: 0,
  sourceHashCoverage: 0,
  sourceSpanCoverage: 0
};

const root = await makeTempVault("eval-source-adapters-");

try {
  const preview = await adapters.previewSourceAdapterImport({
    kind: "markdown",
    root,
    rawText: "Joe is the DBA.\n---\nI will ask Jeff about budgets.",
    source_label: "eval markdown",
    observed_at: "2026-05-31"
  });

  assert.equal(preview.units.length, 2);
  assert.equal(preview.units.every((unit) => unit.source_hash.startsWith("sha256:")), true);
  metrics.sourceHashCoverage = preview.units.filter((unit) => /^sha256:[a-f0-9]{64}$/.test(unit.source_hash)).length / preview.units.length;
  metrics.sourceSpanCoverage = preview.units.filter((unit) => unit.source_spans.length > 0).length / preview.units.length;

  const created = await adapters.createSourceAdapterImport({
    kind: "markdown",
    root,
    rawText: "Joe is the DBA.\n---\nI will ask Jeff about budgets.",
    source_label: "eval markdown",
    observed_at: "2026-05-31"
  });

  assert.equal(created.created_events.length, 2);
  assert.equal(created.pending_transactions.length, 2);
  const firstEventBefore = await readVaultFile(root, created.created_events[0]);

  const duplicate = await adapters.createSourceAdapterImport({
    kind: "markdown",
    root,
    rawText: "Joe is the DBA.",
    source_label: "eval duplicate"
  });

  assert.equal(duplicate.created_events.length, 0);
  assert.equal(duplicate.review_load_forecast.duplicates, 1);
  metrics.duplicateImportPrevention += duplicate.units[0].duplicate_state === "duplicate" ? 1 : 0;
  metrics.eventRawTextRewrite += (await readVaultFile(root, created.created_events[0])) === firstEventBefore ? 0 : 1;

  metrics.unsafeCanonicalWrites += (await exists(root, "memory/people/joe.md")) ? 1 : 0;
  metrics.unsafeCanonicalWrites += (await exists(root, "memory/followups/fup_2026_05_31_001.md")) ? 1 : 0;

  const memoryText = await readAllMemoryText(root);
  metrics.eventRawTextRewrite += /source_label: eval duplicate/.test(memoryText) ? 1 : 0;
} finally {
  await rm(root, { recursive: true, force: true });
}

assertAtMost("unsafe canonical writes", metrics.unsafeCanonicalWrites, thresholds.unsafeCanonicalWritesMax);
assertAtMost("Event raw text rewrites", metrics.eventRawTextRewrite, thresholds.eventRawTextRewriteMax);
assertAtLeast("duplicate import prevention", metrics.duplicateImportPrevention, thresholds.duplicateImportPreventionMin);
assertAtLeast("source hash coverage", metrics.sourceHashCoverage, thresholds.sourceHashCoverageMin);
assertAtLeast("source span coverage", metrics.sourceSpanCoverage, thresholds.sourceSpanCoverageMin);

console.log(JSON.stringify({ metrics }, null, 2));

async function exists(root, relativePath) {
  try {
    await readVaultFile(root, relativePath);
    return true;
  } catch {
    return false;
  }
}

async function readAllMemoryText(root) {
  const files = await listFiles(path.join(root, "memory"));
  const chunks = [];

  for (const file of files.filter((item) => item.endsWith(".md"))) {
    chunks.push(await readFile(file, "utf8"));
  }

  return chunks.join("\n");
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function assertAtMost(label, actual, max) {
  assert.equal(actual <= max, true, `${label}: expected <= ${max}, got ${actual}`);
}

function assertAtLeast(label, actual, min) {
  assert.equal(actual >= min, true, `${label}: expected >= ${min}, got ${actual}`);
}
