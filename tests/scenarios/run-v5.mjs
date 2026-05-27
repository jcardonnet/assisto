import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { makeTempVault, readVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

const thresholds = JSON.parse(await readFile("tests/golden/v5-eval-thresholds.json", "utf8"));
const capture = await loadTsModule("packages/core/src/capture/index.ts");
const importNotes = await loadTsModule("packages/core/src/import/index.ts");
const extraction = await loadTsModule("packages/core/src/extraction/index.ts");
const entities = await loadTsModule("packages/core/src/entities/index.ts");
const retrieval = await loadTsModule("packages/core/src/retrieval/index.ts");
const briefs = await loadTsModule("packages/core/src/briefs/index.ts");
const workbench = await loadTsModule("packages/workbench/src/index.ts");

const metrics = {
  unsafeCanonicalWrites: 0,
  generatedPersistenceViolations: 0,
  autonomousMerges: 0,
  autonomousSupersessions: 0,
  eventRawTextRewrites: 0,
  duplicateImportPrevention: 0,
  captureToReviewSuccess: 0,
  providerFallbackReview: 0,
  todayTriageFlow: 0,
  entityStewardshipStaging: 0,
  retrievalCitationCoverage: 0,
  briefGeneration: 0
};

const root = await makeTempVault("eval-v5-");

try {
  await writeWorkbenchFixture(root);

  await suite("capture daily note creates Event plus pending Transaction only", async () => {
    const note = "Joe is the DBA. We use MySQL. I need to ask Jeff about onboarding.";
    const preview = await capture.previewCaptureNote(root, note, {
      now: "2026-05-27T09:00:00-03:00",
      observed_at: "2026-05-27",
      source_label: "daily dogfood note"
    });

    assert.equal(preview.created, false);
    await assert.rejects(() => readVaultFile(root, preview.event_path), /ENOENT/);
    await assert.rejects(() => readVaultFile(root, preview.transaction_path), /ENOENT/);

    const created = await capture.createCaptureNote(root, note, {
      now: "2026-05-27T09:00:00-03:00",
      observed_at: "2026-05-27",
      source_label: "daily dogfood note"
    });

    assert.equal(created.created, true);
    assert.equal(created.validation.passed, true);
    assert.match(await readVaultFile(root, created.event_path), /Joe is the DBA\. We use MySQL/);
    assert.match(await readVaultFile(root, created.transaction_path), /transaction_state: pending/);
    metrics.unsafeCanonicalWrites += (await exists(root, "memory/people/joe.md")) ? 1 : 0;

    if (created.staged_review_paths.length > 0 && created.transaction_path.startsWith("memory/transactions/pending/")) {
      metrics.captureToReviewSuccess += 1;
    }
  });

  await suite("OpenAI-style malformed output becomes staged review input", async () => {
    const result = await extraction.ingestWithExtractionProvider(root, "Alice is the PM.", {
      now: "2026-05-27T09:30:00-03:00",
      provider: {
        name: "openai",
        async extract() {
          return { malformed_reason: "mock malformed OpenAI response" };
        }
      }
    });

    assert.equal(result.provider_name, "openai");
    assert.equal(result.deterministic_review_reasons.includes("llm_output_malformed"), true);
    assert.match(await readVaultFile(root, result.event_path), /Alice is the PM/);

    if (result.transaction_path.startsWith("memory/transactions/pending/")) {
      metrics.providerFallbackReview += 1;
    }
  });

  await suite("curated import dedupes by source_hash and never batch-applies", async () => {
    const imported = await importNotes.createImportNotes(
      root,
      {
        text: "Kuastav reports to Jeff.\n---\nKuastav reports to Jeff."
      },
      {
        now: "2026-05-27T10:00:00-03:00",
        observed_at: "2026-05-27",
        source_label: "curated dogfood import"
      }
    );

    assert.equal(imported.created, true);
    assert.equal(imported.units_imported, 1);
    assert.equal(imported.units_skipped, 1);
    assert.equal(imported.units[1].skip_reason, "duplicate_source_hash");
    metrics.duplicateImportPrevention += imported.units_skipped === 1 ? 1 : 0;

    const eventPath = imported.units[0].event_path;
    const eventBefore = await readVaultFile(root, eventPath);
    const duplicate = await importNotes.createImportNotes(
      root,
      {
        text: "Kuastav reports to Jeff."
      },
      {
        now: "2026-05-27T10:05:00-03:00",
        source_label: "curated dogfood import"
      }
    );
    const eventAfter = await readVaultFile(root, eventPath);

    assert.equal(duplicate.units_imported, 0);
    assert.equal(duplicate.units_skipped, 1);
    metrics.eventRawTextRewrites += eventAfter === eventBefore ? 0 : 1;
    metrics.unsafeCanonicalWrites += (await exists(root, "memory/people/kuastav.md")) ? 1 : 0;
  });

  await suite("today, retrieval, and briefs expose cited dogfood context", async () => {
    const today = await jsonRoute("GET", "/api/today");
    const answer = await retrieval.retrieveContextForAnswer(root, "Who is my manager?");
    const recentBrief = await briefs.buildSessionBrief(root, {
      kind: "recent",
      targetKind: "context",
      target: "ctx_inventory_project",
      now: "2026-05-27T12:00:00-03:00"
    });

    assert.equal(today.counts.pending_transactions > 0, true);
    assert.equal(today.suggested_manual_actions.length > 0, true);
    assert.equal(answer.answerCandidates.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(answer.evidenceEvents.some((event) => event.id === "ev_2026_05_21_001"), true);
    assert.match(recentBrief.contextPack, /# Session brief: Recent changes: Inventory Project/);
    assert.equal(recentBrief.warnings.some((warning) => /derived view/i.test(warning)), true);

    metrics.todayTriageFlow += 1;
    metrics.retrievalCitationCoverage += answer.evidenceEvents.length > 0 ? 1 : 0;
    metrics.briefGeneration += recentBrief.evidenceEvents.length > 0 ? 1 : 0;
    metrics.retrievalCitationCoverage += recentBrief.evidenceEvents.length > 0 ? 1 : 0;
  });

  await suite("entity stewardship stages pending Transactions without canonical edits", async () => {
    const beforeJeff = await readVaultFile(root, "memory/people/jeff.md");
    const alias = await entities.createEntityAliasTransaction(root, "per_jeff", "Jeffrey", {
      now: "2026-05-27T11:00:00-03:00",
      note: "Dogfood alias check."
    });

    assert.equal(alias.created, true);
    assert.equal(alias.validation.passed, true);
    assert.deepEqual(alias.operations, ["UPSERT_CLAIM"]);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);
    metrics.entityStewardshipStaging += alias.transaction_path.startsWith("memory/transactions/pending/") ? 1 : 0;
    metrics.autonomousMerges += alias.operations.filter((operation) => operation === "MERGE").length;
    metrics.autonomousSupersessions += alias.operations.filter((operation) => operation === "SUPERSEDE_CLAIM").length;
  });

  const memoryText = await readAllMemoryText(root);
  metrics.generatedPersistenceViolations += /type:\s*explanation|generated_explanation_body|This generated explanation body/i.test(memoryText)
    ? 1
    : 0;
} finally {
  await rm(root, { recursive: true, force: true });
}

assertAtMost("unsafe canonical writes", metrics.unsafeCanonicalWrites, thresholds.unsafeCanonicalWritesMax);
assertAtMost(
  "generated persistence violations",
  metrics.generatedPersistenceViolations,
  thresholds.generatedPersistenceViolationsMax
);
assertAtMost("autonomous merges", metrics.autonomousMerges, thresholds.autonomousMergesMax);
assertAtMost("autonomous supersessions", metrics.autonomousSupersessions, thresholds.autonomousSupersessionsMax);
assertAtMost("Event raw text rewrites", metrics.eventRawTextRewrites, thresholds.eventRawTextRewritesMax);
assertAtLeast("duplicate import prevention", metrics.duplicateImportPrevention, thresholds.duplicateImportPreventionMin);
assertAtLeast("capture to review success", metrics.captureToReviewSuccess, thresholds.captureToReviewSuccessMin);
assertAtLeast("provider fallback review", metrics.providerFallbackReview, thresholds.providerFallbackReviewMin);
assertAtLeast("today triage flow", metrics.todayTriageFlow, thresholds.todayTriageFlowMin);
assertAtLeast("entity stewardship staging", metrics.entityStewardshipStaging, thresholds.entityStewardshipStagingMin);
assertAtLeast("retrieval citation coverage", metrics.retrievalCitationCoverage, thresholds.retrievalCitationCoverageMin);
assertAtLeast("brief generation", metrics.briefGeneration, thresholds.briefGenerationMin);

console.log(JSON.stringify({ metrics }, null, 2));

async function suite(name, run) {
  await run();
  console.log(`✓ ${name}`);
}

async function jsonRoute(method, url, body) {
  const response = await workbench.handleWorkbenchRoute(root, {
    method,
    url,
    body: body ? JSON.stringify(body) : undefined
  });

  assert.equal(response.status >= 200 && response.status < 300, true, response.body);
  return JSON.parse(response.body);
}

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
