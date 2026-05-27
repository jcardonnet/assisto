import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { makeTempVault, readVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

const thresholds = JSON.parse(await readFile("tests/golden/v6-eval-thresholds.json", "utf8"));
const importNotes = await loadTsModule("packages/core/src/import/index.ts");
const entities = await loadTsModule("packages/core/src/entities/index.ts");
const retrieval = await loadTsModule("packages/core/src/retrieval/index.ts");
const workbench = await loadTsModule("packages/workbench/src/index.ts");

const metrics = {
  unsafeCanonicalWrites: 0,
  generatedPersistenceViolations: 0,
  autonomousMerges: 0,
  autonomousSupersessions: 0,
  eventRawTextRewrites: 0,
  dailyDogfoodFlow: 0,
  globalCaptureFlow: 0,
  reviewTurboFlow: 0,
  answerDraftFlow: 0,
  frictionLogFlow: 0,
  importTriageFlow: 0,
  duplicateImportPrevention: 0,
  contextOperatingFlow: 0,
  citedAnswerCoverage: 0
};

const root = await makeTempVault("eval-v6-");

try {
  await writeWorkbenchFixture(root);
  const fixtureEventBefore = await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md");

  await suite("Dogfood Home is derived and read-only", async () => {
    const filesBefore = await listFiles(path.join(root, "memory"));
    const home = await jsonRoute("GET", "/api/dogfood/home");
    const filesAfter = await listFiles(path.join(root, "memory"));

    assert.equal(home.next_recommended_action.action, "review_pending_transaction");
    assert.equal(home.pending_transactions.length > 0, true);
    assert.deepEqual(filesAfter.sort(), filesBefore.sort());
    metrics.dailyDogfoodFlow += 1;
  });

  await suite("global capture creates Event plus pending Transaction only", async () => {
    const beforeJeff = await readVaultFile(root, "memory/people/jeff.md");
    const preview = await jsonRoute("POST", "/api/capture/preview", {
      note: "Jordan reports to Jeff. I need to ask Jeff about onboarding.",
      observedAt: "2026-05-28",
      sourceLabel: "v6 global capture",
      context: "ctx_inventory_project",
      provider: "rule"
    });

    assert.equal(preview.created, false);
    await assert.rejects(() => readVaultFile(root, preview.event_path), /ENOENT/);

    const created = await jsonRoute("POST", "/api/capture", {
      note: "Jordan reports to Jeff. I need to ask Jeff about onboarding.",
      observedAt: "2026-05-28",
      sourceLabel: "v6 global capture",
      context: "ctx_inventory_project",
      provider: "rule"
    });

    assert.equal(created.created, true);
    assert.equal(created.validation.passed, true);
    assert.match(await readVaultFile(root, created.event_path), /Jordan reports to Jeff/);
    assert.match(await readVaultFile(root, created.transaction_path), /transaction_state: pending/);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);
    metrics.unsafeCanonicalWrites += (await exists(root, "memory/people/jordan.md")) ? 1 : 0;
    metrics.globalCaptureFlow += 1;
  });

  await suite("Review Turbo lanes stay derived and one-at-a-time", async () => {
    const filesBefore = await listFiles(path.join(root, "memory"));
    const turbo = await jsonRoute("GET", "/api/review/turbo");
    const filesAfter = await listFiles(path.join(root, "memory"));

    assert.equal(turbo.lanes.some((lane) => lane.lane_id === "needs_context"), true);
    assert.equal(turbo.lanes.some((lane) => lane.count > 0), true);
    assert.deepEqual(filesAfter.sort(), filesBefore.sort());
    metrics.reviewTurboFlow += 1;
  });

  await suite("assisted answer drafts are cited and ephemeral", async () => {
    const beforeMemory = await readAllMemoryText(root);
    const draft = await retrieval.previewAnswerDraft(root, "Who is my manager?", {
      now: "2026-05-28T10:00:00.000Z",
      provider: {
        name: "mock-v6-drafter",
        async draft(input) {
          assert.equal(input.basis.answerCandidates.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
          return {
            provider_model: "mock-model",
            answer_text: "Jeff is your manager.",
            citations: ["clm_jeff_manager", "ev_2026_05_21_001"],
            cannot_confirm: ["Memory does not confirm when Jeff became manager."],
            warnings: ["Draft is ephemeral and not saved."]
          };
        }
      }
    });
    const afterMemory = await readAllMemoryText(root);

    assert.equal(draft.answer_text, "Jeff is your manager.");
    assert.equal(draft.citations.includes("clm_jeff_manager"), true);
    assert.equal(afterMemory, beforeMemory);
    metrics.answerDraftFlow += 1;
    metrics.citedAnswerCoverage += draft.citations.length >= 2 ? 1 : 0;
  });

  await suite("friction logging creates Event plus pending Transaction only", async () => {
    const result = await jsonRoute("POST", "/api/friction/log", {
      kind: "retrieval_miss",
      question: "What is the Neptune deploy key?",
      note: "Memory could not answer the Neptune deploy key question."
    });

    assert.equal(result.action, "log_friction");
    assert.equal(result.created, true);
    assert.match(await readVaultFile(root, result.event_path), /source_label: friction:retrieval_miss/);
    assert.match(await readVaultFile(root, result.transaction_path), /NOOP/);
    metrics.unsafeCanonicalWrites += (await exists(root, "memory/topics/friction.md")) ? 1 : 0;
    metrics.frictionLogFlow += 1;
  });

  await suite("import triage handles keep, skip, metadata, and duplicates", async () => {
    const result = await importNotes.createImportTriage(
      root,
      {
        units: [
          {
            unit_id: "unit_1",
            action: "keep",
            raw_text: "Kuastav reports to Jeff.",
            source_label: "v6 triage import",
            observed_at: "2026-05-28",
            context: "ctx_inventory_project"
          },
          {
            unit_id: "unit_2",
            action: "skip",
            raw_text: "Skip this weak unit."
          },
          {
            unit_id: "unit_3",
            action: "keep",
            raw_text: "Kuastav reports to Jeff.",
            source_label: "v6 triage duplicate"
          }
        ]
      },
      {
        now: "2026-05-28T10:30:00-03:00"
      }
    );

    assert.equal(result.created, true);
    assert.equal(result.units_kept, 1);
    assert.equal(result.units_skipped, 2);
    assert.equal(result.units[1].skip_reason, "triage_skip");
    assert.equal(result.units[2].skip_reason, "duplicate_source_hash");
    metrics.duplicateImportPrevention += result.units[2].skip_reason === "duplicate_source_hash" ? 1 : 0;
    metrics.unsafeCanonicalWrites += (await exists(root, "memory/people/kuastav.md")) ? 1 : 0;
    metrics.importTriageFlow += 1;
  });

  await suite("Context operating pages are derived and stage corrections transactionally", async () => {
    const detail = await entities.getEntityDetail(root, "ctx_inventory_project");
    const beforeContext = await readVaultFile(root, "memory/contexts/inventory-project.md");
    const contextNote = await entities.createContextNoteTransaction(
      root,
      "ctx_inventory_project",
      "Inventory Project uses PostgreSQL for reporting.",
      {
        now: "2026-05-28T11:00:00-03:00",
        noteType: "correction"
      }
    );

    assert.equal(detail.contextOperatingPage.context_id, "ctx_inventory_project");
    assert.equal(detail.contextOperatingPage.roleClaims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(contextNote.action, "stage_context_note");
    assert.match(await readVaultFile(root, contextNote.event_path), /source_label: context_correction:ctx_inventory_project/);
    assert.match(await readVaultFile(root, contextNote.transaction_path), /transaction_state: pending/);
    assert.equal(await readVaultFile(root, "memory/contexts/inventory-project.md"), beforeContext);
    metrics.contextOperatingFlow += 1;
  });

  const fixtureEventAfter = await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md");
  metrics.eventRawTextRewrites += fixtureEventAfter === fixtureEventBefore ? 0 : 1;

  const memoryText = await readAllMemoryText(root);
  metrics.generatedPersistenceViolations += /type:\s*explanation|generated_explanation_body|Draft is ephemeral and not saved\.\n\n# /i.test(memoryText)
    ? 1
    : 0;
  metrics.autonomousMerges += countMatches(memoryText, /\bMERGE\b/g);
  metrics.autonomousSupersessions += countMatches(memoryText, /\bSUPERSEDE_CLAIM\b/g);
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
assertAtLeast("daily dogfood flow", metrics.dailyDogfoodFlow, thresholds.dailyDogfoodFlowMin);
assertAtLeast("global capture flow", metrics.globalCaptureFlow, thresholds.globalCaptureFlowMin);
assertAtLeast("review turbo flow", metrics.reviewTurboFlow, thresholds.reviewTurboFlowMin);
assertAtLeast("answer draft flow", metrics.answerDraftFlow, thresholds.answerDraftFlowMin);
assertAtLeast("friction log flow", metrics.frictionLogFlow, thresholds.frictionLogFlowMin);
assertAtLeast("import triage flow", metrics.importTriageFlow, thresholds.importTriageFlowMin);
assertAtLeast("duplicate import prevention", metrics.duplicateImportPrevention, thresholds.duplicateImportPreventionMin);
assertAtLeast("context operating flow", metrics.contextOperatingFlow, thresholds.contextOperatingFlowMin);
assertAtLeast("cited answer coverage", metrics.citedAnswerCoverage, thresholds.citedAnswerCoverageMin);

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

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function assertAtMost(label, actual, max) {
  assert.equal(actual <= max, true, `${label}: expected <= ${max}, got ${actual}`);
}

function assertAtLeast(label, actual, min) {
  assert.equal(actual >= min, true, `${label}: expected >= ${min}, got ${actual}`);
}
