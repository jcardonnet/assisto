import assert from "node:assert/strict";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeTempVault, readVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

const thresholds = JSON.parse(await readFile("tests/golden/v7-eval-thresholds.json", "utf8"));
const workbench = await loadTsModule("packages/workbench/src/index.ts");
const dogfoodEval = await loadTsModule("packages/core/src/dogfood-eval/index.ts");

const metrics = {
  unsafeCanonicalWrites: 0,
  generatedPersistenceViolations: 0,
  autonomousMerges: 0,
  autonomousSupersessions: 0,
  eventRawTextRewrites: 0,
  memoryDataGuardBypass: 0,
  dogfoodEvalSuccess: 0,
  firstDayLoop: 0,
  citedWorkdayModes: 0,
  reviewAccelerationFlow: 0,
  importAssistantFlow: 0,
  captureFeedbackFlow: 0
};

const root = await makeTempVault("eval-v7-");

try {
  await writeWorkbenchFixture(root);
  const fixtureEventBefore = await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md");
  const beforeJeff = await readVaultFile(root, "memory/people/jeff.md");
  const beforeContext = await readVaultFile(root, "memory/contexts/inventory-project.md");

  await suite("personal dogfood eval scores local questions without memory writes", async () => {
    await mkdir(path.join(root, ".assisto-local", "eval"), { recursive: true });
    await writeFile(
      path.join(root, ".assisto-local", "eval", "questions.json"),
      `${JSON.stringify(
        {
          questions: [
            {
              question: "Who is my manager?",
              expected_claim_ids: ["clm_jeff_manager"],
              expected_event_ids: ["ev_2026_05_21_001"],
              tags: ["activation"]
            },
            {
              question: "What Neptune deploy key should I use?",
              tags: ["missing-memory"]
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    const beforeMemory = await readAllMemoryText(root);
    const result = await dogfoodEval.runPersonalDogfoodEval(root);
    const afterMemory = await readAllMemoryText(root);

    assert.equal(result.metrics.total_questions, 2);
    assert.equal(result.metrics.found_expected_items >= 2, true);
    assert.equal(result.metrics.missing_memory_guidance_count >= 1, true);
    assert.equal(afterMemory, beforeMemory);
    metrics.dogfoodEvalSuccess += 1;
  });

  await suite("Use-Assisto-Tomorrow loop is derived and actionable", async () => {
    const filesBefore = await listFiles(path.join(root, "memory"));
    const result = await jsonRoute("GET", "/api/use-tomorrow");
    const filesAfter = await listFiles(path.join(root, "memory"));

    assert.equal(result.steps.some((step) => step.step_id === "capture"), true);
    assert.equal(result.steps.some((step) => step.step_id === "ask_cited_question"), true);
    assert.equal(result.linked_routes.dogfood_eval, "/api/dogfood/eval");
    assert.deepEqual(filesAfter.sort(), filesBefore.sort());
    metrics.firstDayLoop += 1;
  });

  await suite("workday modes are cited and disposable", async () => {
    const meeting = await jsonRoute("GET", "/api/modes/meeting?id=ctx_inventory_project");
    const endDay = await jsonRoute("GET", "/api/modes/end-day");

    assert.equal(meeting.target.id, "ctx_inventory_project");
    assert.equal(meeting.citations.page_paths.includes("memory/contexts/inventory-project.md"), true);
    assert.equal(meeting.citations.event_ids.includes("ev_2026_05_21_001"), true);
    assert.equal(endDay.disclaimer.includes("do not persist"), true);
    metrics.citedWorkdayModes += 1;
  });

  await suite("review acceleration exposes one next item without writes", async () => {
    const filesBefore = await listFiles(path.join(root, "memory"));
    const nextReview = await jsonRoute("GET", "/api/review/next");
    const filesAfter = await listFiles(path.join(root, "memory"));

    assert.equal(nextReview.total >= 1, true);
    assert.equal(nextReview.position, 1);
    assert.equal(nextReview.item.preview_actions.some((action) => action.endpoint === "/api/review/apply-staged/preview"), true);
    assert.deepEqual(filesAfter.sort(), filesBefore.sort());
    metrics.reviewAccelerationFlow += 1;
  });

  await suite("capture feedback creates Event plus pending NOOP only", async () => {
    const result = await jsonRoute("POST", "/api/capture/feedback", {
      kind: "missing_context",
      note: "The capture should have asked me for the Inventory Project context.",
      event: "ev_2026_05_21_001",
      transaction: "tx_2026_05_21_001"
    });

    assert.equal(result.created, true);
    assert.match(await readVaultFile(root, result.event_path), /source_label: capture_feedback:missing_context/);
    assert.match(await readVaultFile(root, result.transaction_path), /NOOP/);
    metrics.unsafeCanonicalWrites += (await exists(root, "memory/topics/capture-feedback.md")) ? 1 : 0;
    metrics.captureFeedbackFlow += 1;
  });

  await suite("import assistant guides next batch from local sessions", async () => {
    const triage = await jsonRoute("POST", "/api/import/triage/preview", {
      units: [
        {
          unit_id: "unit_1",
          action: "keep",
          raw_text: "Kuastav reports to Jeff.",
          source_label: "v7 import",
          context: "ctx_inventory_project"
        },
        {
          unit_id: "unit_2",
          action: "keep",
          raw_text: "Kuastav reports to Jeff.",
          source_label: "v7 duplicate import"
        }
      ]
    });
    const assistant = await jsonRoute("GET", "/api/import/assistant");

    assert.equal(triage.created, false);
    assert.equal(assistant.session_count >= 1, true);
    assert.equal(assistant.recipe.title, "Import 10 curated notes");
    assert.equal(assistant.duplicate_groups.length >= 1, true);
    assert.equal([5, 10, 20].includes(assistant.suggested_next_batch_size), true);
    metrics.memoryDataGuardBypass += (await exists(root, "memory/import-sessions")) ? 1 : 0;
    metrics.importAssistantFlow += 1;
  });

  assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);
  assert.equal(await readVaultFile(root, "memory/contexts/inventory-project.md"), beforeContext);
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
assertAtMost("memory-data guard bypass", metrics.memoryDataGuardBypass, thresholds.memoryDataGuardBypassMax);
assertAtLeast("dogfood eval success", metrics.dogfoodEvalSuccess, thresholds.dogfoodEvalSuccessMin);
assertAtLeast("first day loop", metrics.firstDayLoop, thresholds.firstDayLoopMin);
assertAtLeast("cited workday modes", metrics.citedWorkdayModes, thresholds.citedWorkdayModesMin);
assertAtLeast("review acceleration flow", metrics.reviewAccelerationFlow, thresholds.reviewAccelerationFlowMin);
assertAtLeast("import assistant flow", metrics.importAssistantFlow, thresholds.importAssistantFlowMin);
assertAtLeast("capture feedback flow", metrics.captureFeedbackFlow, thresholds.captureFeedbackFlowMin);

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
