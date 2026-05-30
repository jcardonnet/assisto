import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { makeTempVault, readVaultFile, writeVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

const thresholds = JSON.parse(await readFile("tests/golden/v8-eval-thresholds.json", "utf8"));
const retrieval = await loadTsModule("packages/core/src/retrieval/index.ts");
const workbench = await loadTsModule("packages/workbench/src/index.ts");

const metrics = {
  unsafeCanonicalWrites: 0,
  generatedPersistenceViolations: 0,
  autonomousMerges: 0,
  autonomousSupersessions: 0,
  eventRawTextRewrites: 0,
  unsupportedAnswerCount: 0,
  citationCoverage: 0,
  answerContractFlow: 0,
  askRepairPreviewFlow: 0,
  entityRiskLaneFlow: 0,
  entityRepairStagingFlow: 0,
  contextOperatingRoomFlow: 0,
  contextTimelineFlow: 0,
  docsCoverage: 0
};

const root = await makeTempVault("eval-v8-");

try {
  await writeWorkbenchFixture(root);
  await writeEntityRiskFixture(root);
  const beforeJeff = await readVaultFile(root, "memory/people/jeff.md");
  const beforeContext = await readVaultFile(root, "memory/contexts/inventory-project.md");
  const beforeEvent = await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md");

  await suite("cited answer contract returns supported answers and cannot-confirm repairs", async () => {
    const answer = await retrieval.retrieveCitedAnswerContract(root, "Who is my manager?");
    const noMatch = await jsonRoute("GET", "/api/ask/answer-contract?q=What%20is%20the%20Neptune%20deploy%20key%3F");

    assert.equal(answer.directAnswers.some((item) => item.claim_id === "clm_jeff_manager"), true);
    assert.equal(answer.citationMap.claims.clm_jeff_manager.evidence.includes("ev_2026_05_21_001"), true);
    assert.equal(answer.citationMap.events.ev_2026_05_21_001.path, "memory/events/2026/2026-05/2026-05-21-001.md");
    assert.equal(noMatch.directAnswers.length, 0);
    assert.equal(noMatch.cannotConfirm.some((item) => item.code === "no_match"), true);
    assert.equal(noMatch.repairActions.some((item) => item.action === "capture_note"), true);
    assert.equal(noMatch.repairActions.some((item) => item.action === "log_friction"), true);

    metrics.citationCoverage += countSupportedDirectAnswers(answer);
    metrics.unsupportedAnswerCount += countUnsupportedDirectAnswers(answer) + countUnsupportedDirectAnswers(noMatch);
    metrics.answerContractFlow += 1;
  });

  await suite("Ask repair action preview is read-only", async () => {
    const preview = await jsonRoute("POST", "/api/ask/missing-memory/preview", {
      question: "What is the Neptune deploy key?",
      note: "Need to capture the source for the Neptune deploy key."
    });

    assert.equal(preview.action, "log_friction");
    assert.equal(preview.created, false);
    assert.equal(preview.kind, "retrieval_miss");
    assert.deepEqual(preview.operations, ["NOOP"]);
    assert.equal(preview.validation.passed, true);
    await assert.rejects(() => readVaultFile(root, preview.event_path), /ENOENT/);
    metrics.askRepairPreviewFlow += 1;
  });

  await suite("entity stewardship risk lanes are derived", async () => {
    const stewardship = await jsonRoute("GET", "/api/entities/stewardship?kind=person");
    const jeff = stewardship.items.find((item) => item.id === "per_jeff");
    const detail = await jsonRoute("GET", "/api/entities/stewardship/detail?id=per_jeff");

    assert.equal(stewardship.summary.identity_ambiguity >= 1, true);
    assert.equal(jeff.recommendedReviewLane, "identity_ambiguity");
    assert.equal(jeff.nearDuplicates.some((item) => item.id === "per_jeffrey"), true);
    assert.equal(detail.identityRisk.level, "high");
    assert.equal(detail.reportingChanges.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    metrics.entityRiskLaneFlow += 1;
  });

  await suite("entity repair actions stage Transactions without canonical page edits", async () => {
    const pendingBefore = await pendingTransactionFiles(root);
    const explicitSupersedePreview = await jsonRoute("POST", "/api/entities/role/preview", {
      id: "per_jeff",
      statement: "Jeff is the platform DBA.",
      context: "ctx_inventory_project",
      supersede: "clm_jeff_manager",
      note: "Human selected the old claim for possible supersession."
    });
    assert.equal(explicitSupersedePreview.created, false);
    assert.deepEqual(explicitSupersedePreview.operations, ["SUPERSEDE_CLAIM", "UPSERT_CLAIM"]);
    assert.deepEqual(await pendingTransactionFiles(root), pendingBefore);

    const identityReview = await jsonRoute("POST", "/api/entities/identity-review/stage", {
      id: "per_jeff",
      reason: "Jeff may be duplicated with Jeffrey."
    });

    assert.equal(identityReview.created, true);
    assert.equal(identityReview.action, "stage_entity_identity_review");
    assert.deepEqual(identityReview.operations, ["STAGE_REVIEW"]);
    assert.notDeepEqual(await pendingTransactionFiles(root), pendingBefore);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);
    metrics.entityRepairStagingFlow += 1;
  });

  await suite("Context operating room and timeline stay cited and derived", async () => {
    const operatingRoom = await jsonRoute("GET", "/api/contexts/operating-room?id=ctx_inventory_project");
    const timeline = await jsonRoute("GET", "/api/contexts/timeline?id=ctx_inventory_project");

    assert.equal(operatingRoom.context.id, "ctx_inventory_project");
    assert.equal(operatingRoom.currentState.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(operatingRoom.followupQueue.some((item) => item.id === "fu_ask_jeff"), true);
    assert.equal(operatingRoom.quickActions.some((action) => action.action_id === "capture_context_note"), true);
    assert.match(operatingRoom.warnings.join("\n"), /derived/);
    assert.equal(timeline.items.some((item) => item.item_type === "claim" && item.claim_id === "clm_jeff_manager"), true);
    assert.equal(timeline.items.some((item) => item.item_type === "event" && item.event_id === "ev_2026_05_21_001"), true);
    assert.equal(timeline.items.some((item) => item.item_type === "followup" && item.followup_id === "fu_ask_jeff"), true);
    assert.match(timeline.warnings.join("\n"), /temporal inference/);
    metrics.contextOperatingRoomFlow += 1;
    metrics.contextTimelineFlow += 1;
  });

  await suite("cited work-memory docs describe Ask to Entity to Context workflow", async () => {
    const citedDoc = await readFile("docs/cited-work-memory.md", "utf8");
    const tomorrowDoc = await readFile("docs/use-assisto-tomorrow.md", "utf8");

    assert.match(citedDoc, /Ask -> Entity -> Context/i);
    assert.match(citedDoc, /generated answers stay disposable/i);
    assert.match(tomorrowDoc, /Ask -> Entity -> Context/i);
    metrics.docsCoverage += 1;
  });

  metrics.unsafeCanonicalWrites += (await readVaultFile(root, "memory/people/jeff.md")) === beforeJeff ? 0 : 1;
  metrics.unsafeCanonicalWrites += (await readVaultFile(root, "memory/contexts/inventory-project.md")) === beforeContext ? 0 : 1;
  metrics.eventRawTextRewrites += (await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md")) === beforeEvent ? 0 : 1;

  const memoryText = await readAllMemoryText(root);
  metrics.generatedPersistenceViolations += /type:\s*explanation|generated_explanation_body|Draft is ephemeral and not saved\.\n\n# /i.test(
    memoryText
  )
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
assertAtMost("unsupported answer count", metrics.unsupportedAnswerCount, thresholds.unsupportedAnswerCountMax);
assertAtLeast("citation coverage", metrics.citationCoverage, thresholds.citationCoverageMin);
assertAtLeast("answer contract flow", metrics.answerContractFlow, thresholds.answerContractFlowMin);
assertAtLeast("Ask repair preview flow", metrics.askRepairPreviewFlow, thresholds.askRepairPreviewFlowMin);
assertAtLeast("entity risk lane flow", metrics.entityRiskLaneFlow, thresholds.entityRiskLaneFlowMin);
assertAtLeast("entity repair staging flow", metrics.entityRepairStagingFlow, thresholds.entityRepairStagingFlowMin);
assertAtLeast("Context operating room flow", metrics.contextOperatingRoomFlow, thresholds.contextOperatingRoomFlowMin);
assertAtLeast("Context timeline flow", metrics.contextTimelineFlow, thresholds.contextTimelineFlowMin);
assertAtLeast("docs coverage", metrics.docsCoverage, thresholds.docsCoverageMin);

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

function countSupportedDirectAnswers(result) {
  return (result.directAnswers ?? []).filter((answer) =>
    answer.citations?.claim_ids?.includes(answer.claim_id) &&
    (answer.citations?.event_ids ?? []).length > 0 &&
    answer.citations?.page_paths?.includes(answer.page_path) &&
    result.citationMap?.claims?.[answer.claim_id] &&
    (answer.citations?.event_ids ?? []).every((eventId) => result.citationMap?.events?.[eventId])
  ).length;
}

function countUnsupportedDirectAnswers(result) {
  return (result.directAnswers ?? []).length - countSupportedDirectAnswers(result);
}

async function pendingTransactionFiles(root) {
  return (await readdir(path.join(root, "memory/transactions/pending"))).sort((left, right) => left.localeCompare(right));
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

async function writeEntityRiskFixture(root) {
  await writeVaultFile(
    root,
    "memory/people/jeffrey.md",
    `---
id: per_jeffrey
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases:
  - Jeff
source_events:
  - ev_2026_05_21_001
related: []
summary_generated_from:
  - clm_jeffrey_reports
---

# Jeffrey

## Active claims

- claim_id: clm_jeffrey_reports
  statement: Jeffrey reports to Dana.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_2026_05_21_001]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`
  );
}
