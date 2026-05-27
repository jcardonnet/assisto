import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "../ts-module-loader.mjs";

const thresholds = JSON.parse(await readFile("tests/golden/retrieval-eval-thresholds.json", "utf8"));
const retrieval = await loadTsModule("packages/core/src/retrieval/index.ts");

const metrics = {
  targetRecall: 0,
  irrelevantInclusionCount: 0,
  citationCoverage: 0,
  uncertaintySurfaced: 0,
  generatedPersistenceViolations: 0,
  noMatchGuidance: 0,
  answerBasisCoverage: 0
};

const root = await makeTempVault("eval-retrieval-");

try {
  await writeRetrievalEvalFixture(root);
  const beforeSnapshot = await snapshotFiles(root);

  await suite("manager/reporting relation lookup", async () => {
    const manager = await retrieval.retrieveContextForAnswer(root, "Who is my manager?");
    const reporting = await retrieval.retrieveContextForAnswer(root, "Who reports to Jeff?");

    assert.equal(manager.queryIntent.primary, "manager_reporting");
    assert.equal(reporting.plannedLookups.some((lookup) => lookup.kind === "relation_claims"), true);

    if (manager.activeClaims.some((claim) => claim.claim_id === "clm_mike_manager")) {
      metrics.targetRecall += 1;
    }

    if (manager.answerCandidates.some((candidate) => candidate.claim_id === "clm_mike_manager")) {
      metrics.answerBasisCoverage += 1;
    }

    if (manager.evidenceEvents.some((event) => event.id === "ev_manager")) {
      metrics.citationCoverage += 1;
    }

    if (reporting.activeClaims.some((claim) => claim.claim_id === "clm_maria_reports_to_jeff")) {
      metrics.targetRecall += 1;
    }

    if (reporting.answerCandidates.some((candidate) => candidate.claim_id === "clm_maria_reports_to_jeff")) {
      metrics.answerBasisCoverage += 1;
    }

    if (reporting.evidenceEvents.some((event) => event.id === "ev_reporting")) {
      metrics.citationCoverage += 1;
    }

    metrics.irrelevantInclusionCount += reporting.matchedPages.filter((page) =>
      ["memory/people/mike.md", "memory/people/joel.md"].includes(page.path)
    ).length;
  });

  await suite("source evidence and role-change history", async () => {
    const source = await retrieval.retrieveContextForAnswer(root, "What source Event supports clm_joe_role_engineer?");
    const role = await retrieval.retrieveContextForAnswer(root, "What changed about Joe's role?");

    assert.equal(source.queryIntent.primary, "source_evidence");
    assert.equal(role.queryIntent.intents.includes("role_ownership"), true);
    assert.equal(role.queryIntent.intents.includes("recent_changes"), true);

    if (source.evidenceEvents.some((event) => event.id === "ev_joe_role_active")) {
      metrics.targetRecall += 1;
      metrics.citationCoverage += 1;
    }

    if (source.supportingClaims.some((claim) => claim.claim_id === "clm_joe_role_engineer")) {
      metrics.answerBasisCoverage += 1;
    }

    if (
      role.activeClaims.some((claim) => claim.claim_id === "clm_joe_role_engineer") &&
      role.uncertainClaims.some((claim) => claim.claim_id === "clm_joe_role_dba_old")
    ) {
      metrics.targetRecall += 1;
      metrics.uncertaintySurfaced += 1;
    }

    if (role.evidenceEvents.some((event) => event.id === "ev_joe_role_active")) {
      metrics.citationCoverage += 1;
    }
  });

  await suite("review, follow-up, and scoped context recall", async () => {
    const review = await retrieval.retrieveContextForAnswer(root, "What do I need to review about MySQL?");
    const followup = await retrieval.retrieveContextForAnswer(root, "What open follow-ups are linked to Joe?");
    const context = await retrieval.retrieveContextForAnswer(root, "What changed for Warehouse Project?");

    assert.equal(review.queryIntent.primary, "review_risk");
    assert.equal(followup.queryIntent.primary, "follow_up");
    assert.equal(context.queryIntent.intents.includes("project_context"), true);

    if (review.linkedItems.some((item) => item.id === "rev_mysql_scope")) {
      metrics.targetRecall += 1;
      metrics.uncertaintySurfaced += 1;
    }

    if (followup.linkedItems.some((item) => item.id === "fu_ask_joe")) {
      metrics.targetRecall += 1;
    }

    if (context.matchedPages.some((page) => page.id === "ctx_inventory_project")) {
      metrics.targetRecall += 1;
    }
  });

  await suite("no-match guidance", async () => {
    const noMatch = await retrieval.retrieveContextForAnswer(root, "What is the Neptune deploy key?");

    metrics.irrelevantInclusionCount += noMatch.matchedPages.length;

    if (noMatch.warnings.some((warning) => /No named/.test(warning))) {
      metrics.noMatchGuidance += 1;
    }

    if (noMatch.missingInformation.some((item) => item.code === "no_match")) {
      metrics.answerBasisCoverage += 1;
    }

    assert.equal(noMatch.manualActions.some((action) => action.action === "capture_note"), true);
  });

  await suite("recent-change planner loads Events without persistence", async () => {
    const recent = await retrieval.retrieveContextForAnswer(root, "What changed recently?");

    assert.equal(recent.queryIntent.primary, "recent_changes");
    assert.equal(recent.plannedLookups.some((lookup) => lookup.kind === "recent_events"), true);
    assert.equal(recent.evidenceEvents.length > 0, true);
    assert.equal(recent.manualActions.some((action) => action.action === "open_today"), true);
    metrics.citationCoverage += recent.evidenceEvents.length > 0 ? 1 : 0;
  });

  const afterSnapshot = await snapshotFiles(root);
  metrics.generatedPersistenceViolations += arraysEqual(beforeSnapshot, afterSnapshot) ? 0 : 1;
} finally {
  await rm(root, { recursive: true, force: true });
}

assertAtLeast("target recall", metrics.targetRecall, thresholds.targetRecallMin);
assertAtMost("irrelevant inclusion count", metrics.irrelevantInclusionCount, thresholds.irrelevantInclusionMax);
assertAtLeast("citation coverage", metrics.citationCoverage, thresholds.citationCoverageMin);
assertAtLeast("uncertainty surfaced", metrics.uncertaintySurfaced, thresholds.uncertaintySurfacedMin);
assertAtMost(
  "generated persistence violations",
  metrics.generatedPersistenceViolations,
  thresholds.generatedPersistenceViolationsMax
);
assertAtLeast("no-match guidance", metrics.noMatchGuidance, thresholds.noMatchGuidanceMin);
assertAtLeast("answer basis coverage", metrics.answerBasisCoverage, thresholds.answerBasisCoverageMin);

console.log(JSON.stringify({ metrics }, null, 2));

async function suite(name, run) {
  await run();
  console.log(`✓ ${name}`);
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

async function writeRetrievalEvalFixture(root) {
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
  await writeVaultFile(root, "memory/topics/mysql.md", topicPage("top_mysql", "MySQL", "clm_mysql_usage", "We use MySQL.", "ev_mysql"));
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
  return (await walk(root)).sort();
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
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertAtMost(label, actual, expected) {
  assert.equal(actual <= expected, true, `${label}: expected <= ${expected}, got ${actual}`);
}

function assertAtLeast(label, actual, expected) {
  assert.equal(actual >= expected, true, `${label}: expected >= ${expected}, got ${actual}`);
}
