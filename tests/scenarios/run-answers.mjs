import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "../ts-module-loader.mjs";

const thresholds = JSON.parse(await readFile("tests/golden/answers-eval-thresholds.json", "utf8"));
const retrieval = await loadTsModule("packages/core/src/retrieval/index.ts");

const metrics = {
  directAnswerCoverage: 0,
  citationCoverage: 0,
  unsupportedAnswerCount: 0,
  irrelevantInclusionCount: 0,
  missingMemoryGuidance: 0,
  conflictCoverage: 0,
  staleSignalCoverage: 0,
  repairActionCoverage: 0,
  generatedPersistenceViolations: 0,
  contractV3DirectCitationCoverage: 0,
  contractV3RepairLinkCoverage: 0,
  proofPathCoverage: 0,
  unsupportedDirectAnswers: 0
};

const root = await makeTempVault("eval-answers-");

try {
  await writeAnswerEvalFixture(root);
  const beforeSnapshot = await snapshotFiles(root);

  await suite("manager and reporting answers are directly cited", async () => {
    const manager = await retrieval.retrieveCitedAnswerContract(root, "Who is my manager?");
    const reporting = await retrieval.retrieveCitedAnswerContract(root, "Who reports to Jeff?");

    assert.equal(manager.directAnswers.some((answer) => answer.claim_id === "clm_mike_manager"), true);
    assert.equal(reporting.directAnswers.some((answer) => answer.claim_id === "clm_maria_reports_to_jeff"), true);
    assert.equal(manager.citationMap.claims.clm_mike_manager.evidence.includes("ev_manager"), true);
    assert.equal(reporting.citationMap.events.ev_reporting.path, "memory/events/2026/2026-05/ev_reporting.md");

    metrics.directAnswerCoverage += 2;
    metrics.citationCoverage += countSupportedDirectAnswers(manager) + countSupportedDirectAnswers(reporting);
    metrics.unsupportedAnswerCount += countUnsupportedDirectAnswers(manager) + countUnsupportedDirectAnswers(reporting);
    metrics.irrelevantInclusionCount += reporting.directAnswers.filter(
      (answer) => answer.claim_id !== "clm_maria_reports_to_jeff"
    ).length;
  });


  await suite("answer contract v3 carries per-answer citations and repair links", async () => {
    const manager = await retrieval.retrieveCitedAnswerContractV3(root, "Who is my manager?");
    const noMatch = await retrieval.retrieveCitedAnswerContractV3(root, "What is the Neptune deploy key?");

    assert.equal(manager.version, "answer-contract-v3");
    assert.equal(manager.directAnswers.some((answer) =>
      answer.claim_id === "clm_mike_manager" &&
      answer.citations.some((citation) => citation.kind === "claim" && citation.id === "clm_mike_manager") &&
      answer.citations.some((citation) => citation.kind === "event" && citation.id === "ev_manager") &&
      answer.inference_paths.includes("claim:clm_mike_manager") &&
      (answer.proof_paths ?? []).length > 0 &&
      answer.inference_paths.some((item) => item.startsWith("proof:"))
    ), true);
    const noMatchItem = noMatch.cannotConfirm.find((item) => item.code === "no_match");
    assert.ok(noMatchItem);
    assert.equal(noMatchItem.repair_action_ids.length >= 2, true);
    assert.equal(noMatchItem.repair_action_ids.every((actionId) => noMatch.repairActions.some((action) => action.action_id === actionId)), true);
    assert.equal(noMatchItem.repair_action_ids.some((actionId) => noMatch.repairActions.some((action) => action.action_id === actionId && action.action === "capture_note")), true);
    assert.equal(noMatchItem.repair_action_ids.some((actionId) => noMatch.repairActions.some((action) => action.action_id === actionId && action.action === "log_friction")), true);

    metrics.contractV3DirectCitationCoverage += countSupportedDirectAnswersV3(manager);
    metrics.proofPathCoverage += proofPathCoverage(manager);
    metrics.unsupportedAnswerCount += manager.directAnswers.length - countSupportedDirectAnswersV3(manager);
    metrics.unsupportedDirectAnswers += manager.directAnswers.length - countSupportedDirectAnswersV3(manager);
    metrics.contractV3RepairLinkCoverage += noMatch.cannotConfirm.filter((item) =>
      item.repair_action_ids.length >= 2 &&
      item.repair_action_ids.every((actionId) => noMatch.repairActions.some((action) => action.action_id === actionId))
    ).length;
  });

  await suite("source-evidence lookup keeps claim and Event citations together", async () => {
    const source = await retrieval.retrieveCitedAnswerContract(
      root,
      "What source Event supports clm_joe_role_engineer?"
    );

    assert.equal(source.directAnswers.some((answer) => answer.claim_id === "clm_joe_role_engineer"), true);
    assert.equal(source.citationMap.claims.clm_joe_role_engineer.page_path, "memory/people/joe.md");
    assert.equal(source.citationMap.events.ev_joe_role_active.path, "memory/events/2026/2026-05/ev_joe_role_active.md");

    metrics.directAnswerCoverage += 1;
    metrics.citationCoverage += countSupportedDirectAnswers(source);
    metrics.unsupportedAnswerCount += countUnsupportedDirectAnswers(source);
  });

  await suite("role changes surface active answer, conflict, and stale signal", async () => {
    const role = await retrieval.retrieveCitedAnswerContract(root, "What changed about Joe's role?");

    assert.equal(role.directAnswers.some((answer) => answer.claim_id === "clm_joe_role_engineer"), true);
    assert.equal(role.conflicts.some((conflict) => conflict.claim_id === "clm_joe_role_dba_old"), true);
    assert.equal(role.staleSignals.some((signal) => signal.claim_id === "clm_joe_role_dba_old"), true);

    metrics.directAnswerCoverage += 1;
    metrics.citationCoverage += countSupportedDirectAnswers(role);
    metrics.unsupportedAnswerCount += countUnsupportedDirectAnswers(role);
    metrics.conflictCoverage += 1;
    metrics.staleSignalCoverage += 1;
  });

  await suite("review risks and follow-ups become repair actions, not unsupported answers", async () => {
    const review = await retrieval.retrieveCitedAnswerContract(root, "What do I need to review about MySQL?");
    const followup = await retrieval.retrieveCitedAnswerContract(root, "What open follow-ups are linked to Joe?");

    assert.equal(review.linkedReviewItems.some((item) => item.id === "rev_mysql_scope"), true);
    assert.equal(review.repairActions.some((action) => action.action === "review_item"), true);
    assert.equal(followup.linkedFollowUps.some((item) => item.id === "fu_ask_joe"), true);
    assert.equal(followup.repairActions.some((action) => action.action === "open_followups"), true);

    metrics.repairActionCoverage += 2;
    metrics.unsupportedAnswerCount += countUnsupportedDirectAnswers(review) + countUnsupportedDirectAnswers(followup);
  });

  await suite("no-match answer contract refuses invention and suggests repair", async () => {
    const noMatch = await retrieval.retrieveCitedAnswerContract(root, "What is the Neptune deploy key?");

    assert.deepEqual(noMatch.directAnswers, []);
    assert.equal(noMatch.cannotConfirm.some((item) => item.code === "no_match"), true);
    assert.equal(noMatch.repairActions.some((action) => action.action === "capture_note"), true);
    assert.equal(noMatch.repairActions.some((action) => action.action === "log_friction"), true);

    metrics.missingMemoryGuidance += 1;
    metrics.repairActionCoverage += 1;
    metrics.irrelevantInclusionCount += noMatch.matchedPages.length + noMatch.directAnswers.length;
  });

  const afterSnapshot = await snapshotFiles(root);
  metrics.generatedPersistenceViolations += arraysEqual(beforeSnapshot, afterSnapshot) ? 0 : 1;
} finally {
  await rm(root, { recursive: true, force: true });
}

assertAtLeast("direct answer coverage", metrics.directAnswerCoverage, thresholds.directAnswerCoverageMin);
assertAtLeast("citation coverage", metrics.citationCoverage, thresholds.citationCoverageMin);
assertAtMost("unsupported answer count", metrics.unsupportedAnswerCount, thresholds.unsupportedAnswerCountMax);
assertAtMost("irrelevant inclusion count", metrics.irrelevantInclusionCount, thresholds.irrelevantInclusionMax);
assertAtLeast("missing memory guidance", metrics.missingMemoryGuidance, thresholds.missingMemoryGuidanceMin);
assertAtLeast("conflict coverage", metrics.conflictCoverage, thresholds.conflictCoverageMin);
assertAtLeast("stale signal coverage", metrics.staleSignalCoverage, thresholds.staleSignalCoverageMin);
assertAtLeast("repair action coverage", metrics.repairActionCoverage, thresholds.repairActionCoverageMin);
assertAtLeast("contract v3 direct citation coverage", metrics.contractV3DirectCitationCoverage, thresholds.contractV3DirectCitationCoverageMin);
assertAtLeast("contract v3 repair link coverage", metrics.contractV3RepairLinkCoverage, thresholds.contractV3RepairLinkCoverageMin);
assertAtLeast("proof path coverage", metrics.proofPathCoverage, thresholds.proofPathCoverageMin);
assertAtMost("unsupported direct answers", metrics.unsupportedDirectAnswers, thresholds.unsupportedDirectAnswersMax);
assertAtMost(
  "generated persistence violations",
  metrics.generatedPersistenceViolations,
  thresholds.generatedPersistenceViolationsMax
);

console.log(JSON.stringify({ metrics }, null, 2));

async function suite(name, run) {
  await run();
  console.log(`✓ ${name}`);
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

function countSupportedDirectAnswersV3(result) {
  return (result.directAnswers ?? []).filter((answer) => {
    const ids = new Set((answer.citations ?? []).map((citation) => citation.citation_id));
    return ids.has(`claim:${answer.claim_id}`) &&
      ids.has(`page:${answer.page_path}`) &&
      (answer.citations ?? []).some((citation) => citation.kind === "event") &&
      (answer.citation_ids ?? []).every((citationId) => result.citationIndex?.[citationId]);
  }).length;
}

function proofPathCoverage(result) {
  const answers = result.directAnswers ?? [];
  if (answers.length === 0) {
    return 1;
  }
  return answers.filter((answer) => (answer.proof_paths ?? []).length > 0).length / answers.length;
}

function countUnsupportedDirectAnswers(result) {
  return (result.directAnswers ?? []).length - countSupportedDirectAnswers(result);
}

async function makeTempVault(prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await mkdir(path.join(root, "memory"), { recursive: true });
  return root;
}

async function writeVaultFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function writeAnswerEvalFixture(root) {
  await writeVaultFile(root, "memory/people/mike.md", personPage("per_mike", "Mike", [
    claim("clm_mike_manager", "Mike is my manager.", "active", "complete", "ev_manager")
  ]));
  await writeVaultFile(root, "memory/people/maria.md", personPage("per_maria", "Maria", [
    claim("clm_maria_reports_to_jeff", "Maria reports to Jeff.", "active", "complete", "ev_reporting")
  ]));
  await writeVaultFile(root, "memory/people/joel.md", personPage("per_joel", "Joel", [
    claim("clm_joel_owner_reporting", "Joel owns reporting dashboards.", "active", "complete", "ev_joel")
  ]));
  await writeVaultFile(root, "memory/people/joe.md", personPage("per_joe", "Joe", [
    claim("clm_joe_role_engineer", "Joe is the AI Engineer.", "active", "complete", "ev_joe_role_active"),
    claim("clm_joe_role_dba_old", "Joe was the DBA.", "superseded", "complete", "ev_joe_role_old")
  ]));
  await writeVaultFile(
    root,
    "memory/topics/mysql.md",
    topicPage("top_mysql", "MySQL", "clm_mysql_usage", "We use MySQL.", "ev_mysql")
  );
  await writeVaultFile(root, "memory/review/mysql-scope.md", `---
id: rev_mysql_scope
type: review_item
object_state: active
review_state: staged
review_reason: unscoped_claim
created_at: 2026-05-21T10:00:00-03:00
source_events:
  - ev_mysql
affected_files:
  - topics/mysql.md
linked_transaction: tx_mysql_scope
---

# Review: MySQL scope

## Staged claims

- claim_id: clm_mysql_unknown_scope
  statement: We use MySQL.
  claim_kind: fact
  claim_state: staged
  evidence_strength: explicit
  scope: null
  scope_state: unknown
  evidence: [ev_mysql]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
`);
  await writeVaultFile(root, "memory/followups/ask-joe.md", `---
id: fu_ask_joe
type: followup
object_state: active
review_state: staged
followup_state: candidate
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
owner: user
source_events:
  - ev_joe_role_active
related:
  - per_joe
---

# Follow-up: Ask Joe
`);
  await writeVaultFile(root, "memory/contexts/inventory-project.md", `---
id: ctx_inventory_project
type: context
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases:
  - Warehouse Project
source_events:
  - ev_inventory
related: []
---

# Inventory Project
`);

  for (const [id, text] of Object.entries({
    ev_manager: "Mike is my manager.",
    ev_reporting: "Maria reports to Jeff.",
    ev_joel: "Joel owns reporting dashboards.",
    ev_joe_role_active: "Joe is the AI Engineer.",
    ev_joe_role_old: "Joe was the DBA.",
    ev_mysql: "We use MySQL.",
    ev_inventory: "Warehouse Project is the inventory project."
  })) {
    await writeVaultFile(root, `memory/events/2026/2026-05/${id}.md`, eventPage(id, text));
  }
}

function personPage(id, name, claims) {
  return objectPage("person", id, name, claims);
}

function topicPage(id, name, claimId, statement, evidence) {
  return objectPage("topic", id, name, [claim(claimId, statement, "active", "complete", evidence)]);
}

function objectPage(type, id, name, claims) {
  const activeClaims = claims.filter((item) => item.state === "active").map((item) => item.block).join("\n");
  const otherClaims = claims.filter((item) => item.state !== "active").map((item) => item.block).join("\n");
  const firstEvent = claims[0]?.evidence ?? "ev_unknown";
  const summaryClaimIds = claims.filter((item) => item.state === "active").map((item) => `  - ${item.id}`).join("\n");

  return `---
id: ${id}
type: ${type}
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
  - ${firstEvent}
related: []
summary_generated_from:
${summaryClaimIds}
---

# ${name}

## Active claims

${activeClaims || "- None."}
${otherClaims ? `\n## Non-active claims\n\n${otherClaims}` : ""}
`;
}

function claim(id, statement, state, scopeState, evidence) {
  return {
    id,
    state,
    evidence,
    block: `- claim_id: ${id}
  statement: ${statement}
  claim_kind: fact
  claim_state: ${state}
  evidence_strength: explicit
  scope: current-work-context
  scope_state: ${scopeState}
  evidence: [${evidence}]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null`
  };
}

function eventPage(id, rawText) {
  return `---
id: ${id}
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-21T10:00:00-03:00
observed_at: 2026-05-21
source_type: user_note
source_actor: user
participants: []
topics: []
contexts: []
derived_claims: []
transactions: []
---

# Event ${id}

## Raw text

${rawText}
`;
}

async function snapshotFiles(root) {
  const files = (await walk(root)).sort();
  return Promise.all(files.map(async (filePath) => ({
    path: path.relative(root, filePath),
    content: await readFile(filePath, "utf8")
  })));
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function arraysEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertAtMost(label, actual, expected) {
  assert.equal(actual <= expected, true, `${label}: expected <= ${expected}, got ${actual}`);
}

function assertAtLeast(label, actual, expected) {
  assert.equal(actual >= expected, true, `${label}: expected >= ${expected}, got ${actual}`);
}
