import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { makeTempVault, readVaultFile, writeVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

const thresholds = JSON.parse(await readFile("tests/golden/v9-eval-thresholds.json", "utf8"));
const adapters = await loadTsModule("packages/core/src/source-adapters/index.ts");
const frames = await loadTsModule("packages/core/src/frames/index.ts");
const ontology = await loadTsModule("packages/core/src/ontology/index.ts");
const symbolic = await loadTsModule("packages/core/src/symbolic/index.ts");
const retrieval = await loadTsModule("packages/core/src/retrieval/index.ts");
const workbench = await loadTsModule("packages/workbench/src/index.ts");

const metrics = {
  unsafeCanonicalWrites: 0,
  generatedPersistenceViolations: 0,
  symbolicOutputsWithoutProof: 0,
  ontologyDomainRangeViolationsMissed: 0,
  unsupportedDirectAnswers: 0,
  automaticEntityMerges: 0,
  proofPathCoverage: 0,
  sourceHashCoverage: 0,
  repairActionCoverage: 0,
  sourceAdapterFlow: 0,
  ontologyFrameFlow: 0,
  symbolicIndexFlow: 0,
  answerContractV3Flow: 0,
  reviewAccelerationFlow: 0,
  contextOperatingRoomV3Flow: 0,
  dogfoodFeedbackFlow: 0
};

const root = await makeTempVault("eval-v9-");

try {
  await writeWorkbenchFixture(root);
  await writeEntityRiskFixture(root);
  const beforeJeff = await readVaultFile(root, "memory/people/jeff.md");
  const beforeContext = await readVaultFile(root, "memory/contexts/inventory-project.md");
  const beforeEvent = await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md");

  await suite("source adapters preserve provenance hashes and write only Events plus pending Transactions", async () => {
    const preview = await adapters.previewSourceAdapterImport({
      kind: "markdown",
      root,
      rawText: "Jeff reports to Dana.\n---\nDecision: Inventory Project keeps the reconciliation dashboard.",
      source_label: "v9 eval source",
      observed_at: "2026-06-01",
      context: "ctx_inventory_project"
    });

    assert.equal(preview.units.length, 2);
    assert.equal(preview.canonical_writes.length, 0);
    metrics.sourceHashCoverage = ratio(
      preview.units.filter((unit) => /^sha256:[a-f0-9]{64}$/.test(unit.source_hash)).length,
      preview.units.length
    );

    const created = await adapters.createSourceAdapterImport({
      kind: "markdown",
      root,
      rawText: "Jeff reports to Dana.\n---\nDecision: Inventory Project keeps the reconciliation dashboard.",
      source_label: "v9 eval source",
      observed_at: "2026-06-01",
      context: "ctx_inventory_project"
    });

    assert.equal(created.created_events.length, 2);
    assert.equal(created.pending_transactions.length, 2);
    assert.equal(created.canonical_writes.length, 0);
    assert.match(await readVaultFile(root, created.created_events[0]), /source_hash: sha256:[a-f0-9]{64}/);
    metrics.sourceAdapterFlow += 1;
  });

  await suite("typed frames and ontology reject unsafe domain-range promotion", async () => {
    const registry = await ontology.loadOntologyRegistry(root);
    const extracted = frames.extractCandidateFramesFromText({
      text: "Jeff reports to Dana. In Inventory Project, we use MySQL.",
      sourceEventId: "ev_v9_eval"
    });
    const validReporting = extracted.find((frame) => frame.relation === "reports_to");
    const technology = extracted.find((frame) => frame.relation === "uses_technology");

    assert.ok(validReporting);
    assert.ok(technology);
    assert.equal(frames.validateMemoryFrame(validReporting, { ontology: registry }).passed, true);
    assert.equal(frames.validateMemoryFrame(technology, { ontology: registry }).passed, true);

    const invalid = ontology.validateOntologyFrame(
      {
        subject_id: "topic_mysql",
        subject_kind: "Topic",
        relation: "reports_to",
        object_id: "person_dana",
        object_kind: "Person",
        statement: "MySQL reports to Dana.",
        scope: "ctx_inventory_project",
        evidence: ["ev_v9_eval"]
      },
      registry
    );

    metrics.ontologyDomainRangeViolationsMissed += invalid.passed ? 1 : 0;
    assert.equal(invalid.errors.some((error) => error.code === "ONTOLOGY_DOMAIN_INVALID"), true);
    metrics.ontologyFrameFlow += 1;
  });

  await suite("symbolic index outputs are proof-backed and rebuildable", async () => {
    const index = await symbolic.buildSymbolicIndex({ root });
    const proofByFact = new Map(index.proofs.map((proof) => [proof.derived_fact_id, proof]));
    metrics.symbolicOutputsWithoutProof += index.derived_facts.filter((fact) => !proofByFact.has(fact.fact_id)).length;

    assert.equal(index.canonical_writes.length, 0);
    assert.equal(index.derived_facts.length > 0, true);
    assert.equal(index.proofs.length >= index.derived_facts.length, true);

    const relationLookup = symbolic.querySymbolicFacts({
      query: "Who reports to Jeff?",
      facts: index.derived_facts,
      proofs: index.proofs
    });

    assert.equal(relationLookup.matches.some((match) => match.proof.source_events.includes("ev_2026_05_21_001")), true);
    metrics.symbolicIndexFlow += 1;
  });

  await suite("answer contract v3 refuses unsupported answers and links repair actions", async () => {
    const manager = await retrieval.retrieveCitedAnswerContractV3(root, "Who is my manager?");
    const noMatch = await retrieval.retrieveCitedAnswerContractV3(root, "What is the Neptune deploy key?");

    assert.equal(manager.version, "answer-contract-v3");
    assert.equal(manager.directAnswers.some((answer) => answer.claim_id === "clm_jeff_manager"), true);
    assert.equal(noMatch.directAnswers.length, 0);
    assert.equal(noMatch.cannotConfirm.some((item) => item.code === "no_match"), true);

    metrics.unsupportedDirectAnswers += countUnsupportedDirectAnswersV3(manager) + countUnsupportedDirectAnswersV3(noMatch);
    metrics.proofPathCoverage = proofPathCoverage(manager);
    metrics.repairActionCoverage = repairActionCoverage(noMatch);
    metrics.answerContractV3Flow += 1;
  });

  await suite("Workbench evidence-to-reasoning routes stay derived or transaction-backed", async () => {
    const reviewAcceleration = await jsonRoute("GET", "/api/review/acceleration");
    const contextRoom = await jsonRoute("GET", "/api/contexts/operating-room-v3?id=ctx_inventory_project");
    const feedbackPreview = await jsonRoute("POST", "/api/dogfood/feedback/preview", {
      kind: "bad_answer",
      question: "Who owns Inventory Project?",
      note: "The answer needs clearer proof paths before I trust it."
    });
    const feedbackCreate = await jsonRoute("POST", "/api/dogfood/feedback", {
      kind: "bad_answer",
      question: "Who owns Inventory Project?",
      note: "The answer needs clearer proof paths before I trust it."
    });

    assert.equal(reviewAcceleration.batchApplyAllowed, false);
    assert.equal(reviewAcceleration.nextItem.proof_previews.length >= 0, true);
    assert.equal(contextRoom.version, "context-operating-room-v3");
    assert.equal(contextRoom.symbolicFacts.length > 0, true);
    assert.equal(contextRoom.canonical_writes.length, 0);
    assert.equal(contextRoom.missingMemoryPrompts.some((prompt) => /Capture current owner/.test(prompt)), true);
    assert.equal(feedbackPreview.created, false);
    assert.equal(feedbackPreview.canonical_writes.length, 0);
    assert.equal(feedbackCreate.created, true);
    assert.equal(feedbackCreate.operations.includes("NOOP"), true);
    assert.equal(feedbackCreate.canonical_writes.length, 0);
    assert.match(await readVaultFile(root, feedbackCreate.event_path), /source_label: dogfood:bad_answer/);
    assert.match(await readVaultFile(root, feedbackCreate.transaction_path), /NOOP/);

    metrics.reviewAccelerationFlow += 1;
    metrics.contextOperatingRoomV3Flow += 1;
    metrics.dogfoodFeedbackFlow += 1;
  });

  metrics.unsafeCanonicalWrites += (await readVaultFile(root, "memory/people/jeff.md")) === beforeJeff ? 0 : 1;
  metrics.unsafeCanonicalWrites += (await readVaultFile(root, "memory/contexts/inventory-project.md")) === beforeContext ? 0 : 1;
  metrics.unsafeCanonicalWrites += (await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md")) === beforeEvent ? 0 : 1;

  const memoryText = await readAllMemoryText(root);
  metrics.generatedPersistenceViolations += /type:\s*explanation|generated_explanation_body|Draft is ephemeral and not saved\./i.test(
    memoryText
  )
    ? 1
    : 0;
  metrics.automaticEntityMerges += countMatches(memoryText, /\bMERGE\b/g);
} finally {
  await rm(root, { recursive: true, force: true });
}

assertAtMost("unsafe canonical writes", metrics.unsafeCanonicalWrites, thresholds.unsafeCanonicalWritesMax);
assertAtMost(
  "generated persistence violations",
  metrics.generatedPersistenceViolations,
  thresholds.generatedPersistenceViolationsMax
);
assertAtMost(
  "symbolic outputs without proof",
  metrics.symbolicOutputsWithoutProof,
  thresholds.symbolicOutputsWithoutProofMax
);
assertAtMost(
  "ontology domain-range violations missed",
  metrics.ontologyDomainRangeViolationsMissed,
  thresholds.ontologyDomainRangeViolationsMissedMax
);
assertAtMost("unsupported direct answers", metrics.unsupportedDirectAnswers, thresholds.unsupportedDirectAnswersMax);
assertAtMost("automatic entity merges", metrics.automaticEntityMerges, thresholds.automaticEntityMergesMax);
assertAtLeast("proof path coverage", metrics.proofPathCoverage, thresholds.proofPathCoverageMin);
assertAtLeast("source hash coverage", metrics.sourceHashCoverage, thresholds.sourceHashCoverageMin);
assertAtLeast("repair action coverage", metrics.repairActionCoverage, thresholds.repairActionCoverageMin);
assertAtLeast("source adapter flow", metrics.sourceAdapterFlow, thresholds.sourceAdapterFlowMin);
assertAtLeast("ontology frame flow", metrics.ontologyFrameFlow, thresholds.ontologyFrameFlowMin);
assertAtLeast("symbolic index flow", metrics.symbolicIndexFlow, thresholds.symbolicIndexFlowMin);
assertAtLeast("answer contract v3 flow", metrics.answerContractV3Flow, thresholds.answerContractV3FlowMin);
assertAtLeast("review acceleration flow", metrics.reviewAccelerationFlow, thresholds.reviewAccelerationFlowMin);
assertAtLeast("Context operating room v3 flow", metrics.contextOperatingRoomV3Flow, thresholds.contextOperatingRoomV3FlowMin);
assertAtLeast("dogfood feedback flow", metrics.dogfoodFeedbackFlow, thresholds.dogfoodFeedbackFlowMin);

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

function countUnsupportedDirectAnswersV3(result) {
  return (result.directAnswers ?? []).length - countSupportedDirectAnswersV3(result);
}

function countSupportedDirectAnswersV3(result) {
  return (result.directAnswers ?? []).filter((answer) => {
    const citationIds = new Set((answer.citations ?? []).map((citation) => citation.citation_id));
    return citationIds.has(`claim:${answer.claim_id}`) &&
      citationIds.has(`page:${answer.page_path}`) &&
      (answer.citations ?? []).some((citation) => citation.kind === "event") &&
      (answer.citation_ids ?? []).every((citationId) => result.citationIndex?.[citationId]);
  }).length;
}

function proofPathCoverage(result) {
  const answers = result.directAnswers ?? [];
  if (answers.length === 0) {
    return 1;
  }

  return ratio(answers.filter((answer) => (answer.proof_paths ?? []).length > 0).length, answers.length);
}

function repairActionCoverage(result) {
  const cannotConfirm = result.cannotConfirm ?? [];
  if (cannotConfirm.length === 0) {
    return 1;
  }

  return ratio(
    cannotConfirm.filter(
      (item) =>
        item.repair_action_ids.length > 0 &&
        item.repair_action_ids.every((actionId) => result.repairActions.some((action) => action.action_id === actionId))
    ).length,
    cannotConfirm.length
  );
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

function ratio(numerator, denominator) {
  if (denominator === 0) {
    return 1;
  }

  return numerator / denominator;
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
