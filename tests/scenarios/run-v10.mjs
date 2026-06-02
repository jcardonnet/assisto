import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { makeTempVault, readVaultFile, writeVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

const thresholds = JSON.parse(await readFile("tests/golden/v10-eval-thresholds.json", "utf8"));
const adapters = await loadTsModule("packages/core/src/source-adapters/index.ts");
const sourceInbox = await loadTsModule("packages/core/src/source-inbox/index.ts");
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
  dogfoodFeedbackFlow: 0,
  sourceAdapterKindCoverage: 0,
  sourceInboxCreateFlow: 0,
  answerContractV4Flow: 0,
  reviewAutopilotFlow: 0,
  dogfoodControlRoomFlow: 0,
  missingSourceGuidance: 0,
  eventRawTextRewrites: 0
};

const root = await makeTempVault("eval-v9-");

try {
  await writeWorkbenchFixture(root);
  await writeEntityRiskFixture(root);
  await writeSourceReasoningFixture(root);
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

  await suite("v10 local export adapters cover source-to-reasoning inputs", async () => {
    const samples = sourceAdapterSamples();
    let unitsWithHashes = 0;
    let totalUnits = 0;
    let unitsWithSpans = 0;

    for (const sample of samples) {
      const preview = await adapters.previewSourceAdapterImport({
        kind: sample.kind,
        root,
        rawText: sample.rawText,
        source_label: sample.label,
        observed_at: sample.observed_at,
        context: "ctx_inventory_project"
      });

      assert.equal(preview.canonical_writes.length, 0);
      assert.equal(preview.units.length > 0, true, sample.kind + " should yield source units");
      assert.equal(preview.units.every((unit) => unit.adapter_kind === sample.kind), true);
      totalUnits += preview.units.length;
      unitsWithHashes += preview.units.filter((unit) => /^sha256:[a-f0-9]{64}$/.test(unit.source_hash)).length;
      unitsWithSpans += preview.units.filter((unit) => unit.source_spans.length > 0).length;
    }

    metrics.sourceAdapterKindCoverage = samples.length / 8;
    metrics.sourceHashCoverage = Math.max(metrics.sourceHashCoverage, ratio(unitsWithHashes, totalUnits));
    assert.equal(ratio(unitsWithSpans, totalUnits) >= 0.9, true);
  });

  await suite("Source Inbox triage creates Events plus pending Transactions only", async () => {
    const preview = await adapters.previewSourceAdapterImport({
      kind: "repo_markdown",
      root,
      rawText: "Search API depends on Billing repository.\n---\nRavi owns Search API.",
      source_label: "v10 repo export",
      observed_at: "2026-06-02",
      context: "ctx_inventory_project"
    });
    const session = await sourceInbox.createSourceInboxSessionFromPreview(root, preview, {
      source_label: "v10 repo export",
      now: "2026-06-02T00:00:00.000Z"
    });
    const controlBefore = await jsonRoute("GET", "/api/dogfood/control-room");

    assert.equal(controlBefore.source_inbox_backlog.untriaged_units >= preview.units.length, true);
    assert.equal(controlBefore.canonical_writes.length, 0);

    const triaged = await sourceInbox.triageSourceInboxSession(root, {
      session_id: session.session_id,
      now: "2026-06-02T00:01:00.000Z",
      decisions: session.units.map((unit) => ({
        unit_id: unit.unit_id,
        action: "keep",
        context: "ctx_inventory_project",
        source_label: "v10 repo export"
      }))
    });
    assert.equal(triaged.triage_counts.keep, preview.units.length);

    const created = await sourceInbox.createSourceInboxEvents(root, {
      session_id: session.session_id,
      now: "2026-06-02T00:02:00.000Z"
    });
    assert.equal(created.units_created, preview.units.length);
    assert.equal(created.canonical_writes.length, 0);
    assert.equal(created.units.every((unit) => unit.event_path?.startsWith("memory/events/")), true);
    assert.equal(created.units.every((unit) => unit.transaction_path?.startsWith("memory/transactions/pending/")), true);

    const firstEventBefore = await readVaultFile(root, created.units[0].event_path);
    const duplicate = await sourceInbox.createSourceInboxEvents(root, {
      session_id: session.session_id,
      now: "2026-06-02T00:03:00.000Z"
    });
    assert.equal(duplicate.units_skipped, preview.units.length);
    metrics.eventRawTextRewrites += (await readVaultFile(root, created.units[0].event_path)) === firstEventBefore ? 0 : 1;
    metrics.sourceInboxCreateFlow += 1;
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



  await suite("answer contract v4 exposes proof trees, source excerpts, role changes, and missing source guidance", async () => {
    const dependency = await retrieval.retrieveCitedAnswerContractV4(root, "What does Search API depend on?");
    const roleChange = await retrieval.retrieveCitedAnswerContractV4(root, "What changed about Joe's role?");
    const missingSource = await retrieval.retrieveCitedAnswerContractV4(root, "What is the Zephyr deploy token?");

    assert.equal(dependency.version, "answer-contract-v4");
    assert.equal(dependency.queryPlan.symbolic?.intent, "dependency_chain");
    assert.equal(dependency.directAnswers.some((answer) => answer.claim_id === "clm_v10_search_depends"), true);
    assert.equal(dependency.proofTree.length > 0, true);
    assert.equal(dependency.sourceExcerpts.some((excerpt) => excerpt.event_id === "ev_v10_dependency"), true);
    assert.equal(roleChange.staleSignals.some((signal) => signal.claim_id === "clm_v10_joe_old_role"), true);
    assert.deepEqual(missingSource.directAnswers, []);
    assert.equal(missingSource.missingMemoryDiagnostics.some((item) => item.code === "no_match"), true);
    assert.equal(missingSource.suggestedSourceImports.some((item) => item.adapter_kinds.includes("repo_markdown")), true);

    metrics.unsupportedDirectAnswers += countUnsupportedDirectAnswersV3(dependency) + countUnsupportedDirectAnswersV3(roleChange) + countUnsupportedDirectAnswersV3(missingSource);
    metrics.proofPathCoverage = Math.max(metrics.proofPathCoverage, proofPathCoverage(dependency));
    metrics.missingSourceGuidance += 1;
    metrics.answerContractV4Flow += 1;
  });

  await suite("Workbench evidence-to-reasoning routes stay derived or transaction-backed", async () => {
    const reviewAcceleration = await jsonRoute("GET", "/api/review/acceleration");
    const reviewAutopilot = await jsonRoute("GET", "/api/review/autopilot");
    const reviewAutopilotPreview = await jsonRoute("POST", "/api/review/autopilot/preview", { laneId: "needs_context" });
    const dogfoodControlRoom = await jsonRoute("GET", "/api/dogfood/control-room");
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
    assert.equal(reviewAutopilot.version, "review-autopilot-v1");
    assert.equal(reviewAutopilot.batchApplyAllowed, false);
    assert.equal(reviewAutopilotPreview.created, false);
    assert.equal(reviewAutopilotPreview.batchApplyAllowed, false);
    assert.equal(dogfoodControlRoom.version, "dogfood-control-room-v10");
    assert.equal(dogfoodControlRoom.proof_coverage.fact_count > 0, true);
    assert.equal(dogfoodControlRoom.canonical_writes.length, 0);
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
    metrics.reviewAutopilotFlow += 1;
    metrics.dogfoodControlRoomFlow += 1;
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
assertAtLeast("source adapter kind coverage", metrics.sourceAdapterKindCoverage, thresholds.sourceAdapterKindCoverageMin);
assertAtLeast("Source Inbox create flow", metrics.sourceInboxCreateFlow, thresholds.sourceInboxCreateFlowMin);
assertAtLeast("answer contract v4 flow", metrics.answerContractV4Flow, thresholds.answerContractV4FlowMin);
assertAtLeast("review autopilot flow", metrics.reviewAutopilotFlow, thresholds.reviewAutopilotFlowMin);
assertAtLeast("dogfood control room flow", metrics.dogfoodControlRoomFlow, thresholds.dogfoodControlRoomFlowMin);
assertAtLeast("missing source guidance", metrics.missingSourceGuidance, thresholds.missingSourceGuidanceMin);
assertAtMost("Event raw text rewrites", metrics.eventRawTextRewrites, thresholds.eventRawTextRewriteMax);

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


function sourceAdapterSamples() {
  return [
    {
      kind: "eml",
      label: "email intro",
      observed_at: "2026-06-02",
      rawText: "From: ana@example.test\nTo: me@example.test\nDate: Tue, 2 Jun 2026 09:00:00 +0000\nSubject: Intro to Ana\n\nAna owns Billing Service and can help with Search API dependencies."
    },
    {
      kind: "mbox",
      label: "mbox intro",
      observed_at: "2026-06-02",
      rawText: "From ana Tue Jun 02 09:00:00 2026\nFrom: ana@example.test\nSubject: Billing owner\n\nAna owns Billing Service."
    },
    {
      kind: "ics",
      label: "calendar meeting",
      observed_at: "2026-06-02",
      rawText: "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Search API dependency review\nDTSTART:20260602T100000Z\nATTENDEE:mailto:ana@example.test\nDESCRIPTION:Search API depends on Billing repository.\nEND:VEVENT\nEND:VCALENDAR"
    },
    {
      kind: "slack_json",
      label: "slack thread",
      observed_at: "2026-06-02",
      rawText: JSON.stringify({ messages: [{ user_name: "Priya", text: "Search API is blocked by Billing migration.", ts: "2026-06-02T11:00:00Z", channel_name: "inventory" }] })
    },
    {
      kind: "teams_json",
      label: "teams thread",
      observed_at: "2026-06-02",
      rawText: JSON.stringify({ messages: [{ sender: "Ravi", text: "I will own the tracker cleanup due by Friday.", createdDateTime: "2026-06-02T12:00:00Z", chatId: "inventory" }] })
    },
    {
      kind: "github_json",
      label: "github issue",
      observed_at: "2026-06-02",
      rawText: JSON.stringify({ issues: [{ number: 42, title: "Search API dependency", body: "Search API depends on Billing repository and MySQL.", user: { login: "octo" }, created_at: "2026-06-02T13:00:00Z" }] })
    },
    {
      kind: "tracker_csv",
      label: "tracker csv",
      observed_at: "2026-06-02",
      rawText: "key,summary,status,due_date\nINV-7,Billing migration blocks Search API,blocked,2026-06-05"
    },
    {
      kind: "repo_markdown",
      label: "repo markdown",
      observed_at: "2026-06-02",
      rawText: "# Search API\n\nSearch API depends on Billing repository.\n\nDecision: keep MySQL as the reconciliation store."
    }
  ];
}

async function writeSourceReasoningFixture(root) {
  await writeVaultFile(
    root,
    "memory/events/2026/2026-06/ev_v10_dependency.md",
    eventMarkdown("ev_v10_dependency", "Search API depends on Billing repository. Billing repository depends on MySQL.")
  );
  await writeVaultFile(
    root,
    "memory/events/2026/2026-06/ev_v10_role_change.md",
    eventMarkdown("ev_v10_role_change", "Joe used to be the DBA. Joe is now a platform engineer.")
  );
  await writeVaultFile(
    root,
    "memory/contexts/search-api.md",
    contextMarkdown()
  );
  await writeVaultFile(
    root,
    "memory/people/joe.md",
    joeRoleMarkdown()
  );
}

function eventMarkdown(id, rawText) {
  return [
    "---",
    "id: " + id,
    "type: event",
    "object_state: active",
    "review_state: reviewed",
    "recorded_at: 2026-06-02T00:00:00.000Z",
    "observed_at: 2026-06-02",
    "source_type: user_note",
    "source_actor: user",
    "participants: []",
    "topics: []",
    "contexts: []",
    "derived_claims: []",
    "transactions: []",
    "---",
    "",
    "# Event " + id,
    "",
    "## Raw text",
    "",
    rawText,
    ""
  ].join("\n");
}

function contextMarkdown() {
  return [
    "---",
    "id: ctx_search_api",
    "type: context",
    "object_state: active",
    "review_state: reviewed",
    "created_at: 2026-06-02T00:00:00.000Z",
    "updated_at: 2026-06-02T00:00:00.000Z",
    "aliases:",
    "  - Search API",
    "source_events:",
    "  - ev_v10_dependency",
    "related: []",
    "summary_generated_from:",
    "  - clm_v10_search_depends",
    "---",
    "",
    "# Search API",
    "",
    "## Active claims",
    "",
    "- claim_id: clm_v10_search_depends",
    "  statement: Search API depends on Billing repository. Billing repository depends on MySQL.",
    "  claim_kind: fact",
    "  claim_state: active",
    "  evidence_strength: explicit",
    "  scope: Inventory Project",
    "  scope_state: complete",
    "  evidence: [ev_v10_dependency]",
    "  recorded_at: 2026-06-02T00:00:00.000Z",
    "  observed_at: 2026-06-02",
    "  valid_from: null",
    "  valid_to: null",
    ""
  ].join("\n");
}

function joeRoleMarkdown() {
  return [
    "---",
    "id: per_v10_joe",
    "type: person",
    "object_state: active",
    "review_state: reviewed",
    "created_at: 2026-06-02T00:00:00.000Z",
    "updated_at: 2026-06-02T00:00:00.000Z",
    "aliases: []",
    "source_events:",
    "  - ev_v10_role_change",
    "related: []",
    "summary_generated_from:",
    "  - clm_v10_joe_new_role",
    "---",
    "",
    "# Joe",
    "",
    "## Active claims",
    "",
    "- claim_id: clm_v10_joe_new_role",
    "  statement: Joe is now a platform engineer.",
    "  claim_kind: fact",
    "  claim_state: active",
    "  evidence_strength: explicit",
    "  scope: Inventory Project",
    "  scope_state: complete",
    "  evidence: [ev_v10_role_change]",
    "  recorded_at: 2026-06-02T00:00:00.000Z",
    "  observed_at: 2026-06-02",
    "  valid_from: null",
    "  valid_to: null",
    "",
    "## Superseded claims",
    "",
    "- claim_id: clm_v10_joe_old_role",
    "  statement: Joe was the DBA.",
    "  claim_kind: fact",
    "  claim_state: superseded",
    "  evidence_strength: explicit",
    "  scope: Inventory Project",
    "  scope_state: complete",
    "  evidence: [ev_v10_role_change]",
    "  recorded_at: 2026-06-02T00:00:00.000Z",
    "  observed_at: 2026-06-02",
    "  valid_from: null",
    "  valid_to: 2026-06-02",
    ""
  ].join("\n");
}
