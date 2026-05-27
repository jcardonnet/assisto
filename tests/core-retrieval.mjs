import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";

async function makeTempVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-retrieval-"));
  await mkdir(path.join(root, "memory"), { recursive: true });
  return root;
}

async function writeVaultFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

function personPage({ id, name, claimId, statement, evidence, scopeState = "partial", reviewState = "reviewed" }) {
  return `---
id: ${id}
type: person
object_state: active
review_state: ${reviewState}
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
  - ${evidence}
related: []
summary_generated_from:
  - ${claimId}
---

# ${name}

## Active claims

- claim_id: ${claimId}
  statement: ${statement}
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: current-work-context
  scope_state: ${scopeState}
  evidence: [${evidence}]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`;
}

function topicPage({
  id,
  name,
  claimId,
  statement,
  evidence,
  claimState = "active",
  scopeState = "complete",
  reviewState = "reviewed"
}) {
  const section = claimState === "active" ? "Active claims" : "Staged claims";

  return `---
id: ${id}
type: topic
object_state: active
review_state: ${reviewState}
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
  - ${evidence}
related: []
summary_generated_from:
  - ${claimState === "active" ? claimId : ""}
---

# ${name}

## ${section}

- claim_id: ${claimId}
  statement: ${statement}
  claim_kind: fact
  claim_state: ${claimState}
  evidence_strength: explicit
  scope: current-work-context
  scope_state: ${scopeState}
  evidence: [${evidence}]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`;
}

function eventPage(id, rawText, recordedAt) {
  return `---
id: ${id}
type: event
object_state: active
review_state: reviewed
recorded_at: ${recordedAt}
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

async function writeRetrievalFixture(root) {
  await writeVaultFile(
    root,
    "memory/people/joe.md",
    personPage({
      id: "per_joe",
      name: "Joe",
      claimId: "clm_joe_search",
      statement: "Joe works with search infrastructure.",
      evidence: "ev_2026_05_21_001"
    })
  );
  await writeVaultFile(
    root,
    "memory/people/mike.md",
    personPage({
      id: "per_mike",
      name: "Mike",
      claimId: "clm_mike_manager",
      statement: "Mike is my manager.",
      evidence: "ev_2026_05_21_002"
    })
  );
  await writeVaultFile(
    root,
    "memory/people/maria.md",
    personPage({
      id: "per_maria",
      name: "Maria",
      claimId: "clm_maria_reports_to_jeff",
      statement: "Maria reports to Jeff.",
      evidence: "ev_2026_05_21_005",
      scopeState: "complete"
    })
  );
  await writeVaultFile(
    root,
    "memory/people/joel.md",
    personPage({
      id: "per_joel",
      name: "Joel",
      claimId: "clm_joel_owner_reporting",
      statement: "Joel owns reporting dashboards.",
      evidence: "ev_2026_05_21_006",
      scopeState: "complete"
    })
  );
  await writeVaultFile(
    root,
    "memory/topics/solr.md",
    topicPage({
      id: "top_solr",
      name: "Solr",
      claimId: "clm_solr_search",
      statement: "Solr is a search platform.",
      evidence: "ev_2026_05_21_003"
    })
  );
  await writeVaultFile(
    root,
    "memory/topics/qdrant.md",
    topicPage({
      id: "top_qdrant",
      name: "Qdrant",
      claimId: "clm_qdrant_vector_db",
      statement: "Qdrant is a vector database.",
      evidence: "ev_2026_05_21_004",
      claimState: "staged",
      scopeState: "unknown",
      reviewState: "contested"
    })
  );
  await writeVaultFile(
    root,
    "memory/review/qdrant-scope.md",
    `---
id: rev_qdrant_scope
type: review_item
object_state: active
review_state: staged
review_reason: unscoped_claim
created_at: 2026-05-21T10:00:00-03:00
source_events:
  - ev_2026_05_21_004
affected_files:
  - topics/qdrant.md
---

# Review: Qdrant scope
`
  );
  await writeVaultFile(
    root,
    "memory/followups/ask-joe.md",
    `---
id: fu_ask_joe
type: followup
object_state: active
review_state: staged
followup_state: candidate
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
owner: user
source_events:
  - ev_2026_05_21_001
related:
  - per_joe
---

# Follow-up: Ask Joe
`
  );
  await writeVaultFile(
    root,
    "memory/contexts/inventory-project.md",
    `---
id: ctx_inventory_project
type: context
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases:
  - Warehouse Project
source_events:
  - ev_2026_05_21_003
related: []
---

# Inventory Project
`
  );
  await writeVaultFile(
    root,
    "memory/events/2026/2026-05/2026-05-21-001.md",
    eventPage("ev_2026_05_21_001", "Joe discussed search infrastructure.", "2026-05-21T09:00:00-03:00")
  );
  await writeVaultFile(
    root,
    "memory/events/2026/2026-05/2026-05-21-002.md",
    eventPage("ev_2026_05_21_002", "Mike talked about explaining tradeoffs.", "2026-05-21T09:15:00-03:00")
  );
  await writeVaultFile(
    root,
    "memory/events/2026/2026-05/2026-05-21-003.md",
    eventPage("ev_2026_05_21_003", "Solr was discussed as search infrastructure.", "2026-05-21T09:30:00-03:00")
  );
  await writeVaultFile(
    root,
    "memory/events/2026/2026-05/2026-05-21-004.md",
    eventPage("ev_2026_05_21_004", "Qdrant was mentioned as vector database tooling.", "2026-05-21T09:45:00-03:00")
  );
  await writeVaultFile(
    root,
    "memory/events/2026/2026-05/2026-05-21-005.md",
    eventPage("ev_2026_05_21_005", "Maria reports to Jeff.", "2026-05-21T10:00:00-03:00")
  );
  await writeVaultFile(
    root,
    "memory/events/2026/2026-05/2026-05-21-006.md",
    eventPage("ev_2026_05_21_006", "Joel owns reporting dashboards.", "2026-05-21T10:15:00-03:00")
  );
  await writeVaultFile(
    root,
    "memory/events/2026/2026-05/2026-05-21-999.md",
    eventPage("ev_2026_05_21_999", "Unrelated meeting about payroll.", "2026-05-21T11:00:00-03:00")
  );
}

export async function runCoreRetrievalTests() {
  const retrieval = await loadTsModule("packages/core/src/retrieval/index.ts");
  const vault = await loadTsModule("packages/core/src/vault/index.ts");
  const root = await makeTempVault();

  try {
    await writeRetrievalFixture(root);

    const index = await vault.loadVaultIndex(root);
    const query = "How should I explain Joe and Mike the difference between Solr and Qdrant?";
    const targets = retrieval.identifyNamedTargets(query, index);
    assert.deepEqual(
      targets.map((target) => target.path).sort(),
      [
        "memory/people/joe.md",
        "memory/people/mike.md",
        "memory/topics/qdrant.md",
        "memory/topics/solr.md"
      ]
    );
    const aliasTargets = retrieval.identifyNamedTargets("What changed for Warehouse Project?", index);
    assert.equal(aliasTargets.some((target) => target.path === "memory/contexts/inventory-project.md"), true);

    const pages = await retrieval.loadExactPages(root, targets);
    const linked = await retrieval.loadLinkedReviewAndFollowupItems(root, pages);
    assert.equal(linked.some((page) => page.path === "memory/review/qdrant-scope.md"), true);
    assert.equal(linked.some((page) => page.path === "memory/followups/ask-joe.md"), true);

    const events = await retrieval.loadLatestRelevantEvents(root, pages, { query, limit: 3 });
    assert.equal(events.length, 3);
    assert.equal(events.some((event) => event.path.endsWith("2026-05-21-999.md")), false);
    assert.equal(events.some((event) => event.frontmatter.id === "ev_2026_05_21_004"), true);

    const pack = retrieval.packContextForAnswer(query, pages, linked, events);
    assert.match(pack, /memory\/people\/joe\.md/);
    assert.match(pack, /memory\/people\/mike\.md/);
    assert.match(pack, /memory\/topics\/solr\.md/);
    assert.match(pack, /memory\/topics\/qdrant\.md/);
    assert.match(pack, /scope_state=partial/);
    assert.match(pack, /claim_id: clm_joe_search/);
    assert.match(pack, /claim_kind: fact/);
    assert.match(pack, /evidence: ev_2026_05_21_001/);
    assert.match(pack, /claim_state=staged/);
    assert.match(pack, /scope_state=unknown/);
    assert.doesNotMatch(pack, /payroll/);

    const fullResult = await retrieval.retrieveContextForAnswer(root, query);
    assert.equal(fullResult.queryIntent.primary, "person_facts");
    assert.equal(fullResult.plannedLookups.some((lookup) => lookup.kind === "named_targets"), true);
    assert.match(fullResult.contextPack, /# Context pack/);
    assert.match(fullResult.contextPack, /GPT was not called/);
    assert.match(fullResult.contextPack, /## Retrieval plan/);
    assert.equal(fullResult.matchedPages.some((page) => page.path === "memory/people/joe.md"), true);
    assert.equal(fullResult.activeClaims.some((claim) => claim.claim_id === "clm_joe_search"), true);
    assert.equal(fullResult.uncertainClaims.some((claim) => claim.scope_state === "partial"), true);
    assert.equal(fullResult.linkedItems.some((item) => item.id === "rev_qdrant_scope"), true);
    assert.equal(fullResult.evidenceEvents.some((event) => event.id === "ev_2026_05_21_004"), true);
    assert.equal(fullResult.answerCandidates.some((candidate) => candidate.claim_id === "clm_joe_search"), true);
    assert.equal(fullResult.supportingClaims.some((claim) => claim.claim_id === "clm_joe_search"), true);
    assert.equal(fullResult.linkedReviewItems.some((item) => item.id === "rev_qdrant_scope"), true);
    assert.equal(fullResult.linkedFollowUps.some((item) => item.id === "fu_ask_joe"), true);
    assert.deepEqual(fullResult.missingInformation, []);
    assert.equal(fullResult.manualActions.some((action) => action.action === "inspect_entity"), true);
    assert.equal(fullResult.suggestedNextQuestions.some((question) => /source Event supports/i.test(question)), true);
    assert.match(fullResult.contextPack, /What memory can say/);
    assert.match(fullResult.contextPack, /What memory cannot confirm/);
    assert.match(fullResult.contextPack, /Suggested manual actions/);

    const managerResult = await retrieval.retrieveContextForAnswer(root, "Who is my manager?");
    assert.equal(managerResult.queryIntent.primary, "manager_reporting");
    assert.equal(managerResult.plannedLookups.some((lookup) => lookup.kind === "relation_claims"), true);
    assert.equal(managerResult.activeClaims.some((claim) => claim.claim_id === "clm_mike_manager"), true);
    assert.equal(managerResult.evidenceEvents.some((event) => event.id === "ev_2026_05_21_002"), true);
    assert.equal(managerResult.answerCandidates.some((candidate) => candidate.claim_id === "clm_mike_manager"), true);

    const reportingResult = await retrieval.retrieveContextForAnswer(root, "Who reports to Jeff?");
    assert.equal(reportingResult.queryIntent.primary, "manager_reporting");
    assert.equal(reportingResult.matchedPages.some((page) => page.path === "memory/people/maria.md"), true);
    assert.equal(reportingResult.activeClaims.some((claim) => claim.claim_id === "clm_maria_reports_to_jeff"), true);
    assert.equal(reportingResult.matchedPages.some((page) => page.path === "memory/people/mike.md"), false);
    assert.equal(reportingResult.matchedPages.some((page) => page.path === "memory/people/joel.md"), false);

    const sourceResult = await retrieval.retrieveContextForAnswer(root, "What source Event supports clm_joe_search?");
    assert.equal(sourceResult.queryIntent.primary, "source_evidence");
    assert.equal(sourceResult.plannedLookups.some((lookup) => lookup.kind === "source_events"), true);
    assert.equal(sourceResult.evidenceEvents.some((event) => event.id === "ev_2026_05_21_001"), true);

    const reviewResult = await retrieval.retrieveContextForAnswer(root, "What do I need to review about Qdrant?");
    assert.equal(reviewResult.queryIntent.primary, "review_risk");
    assert.equal(reviewResult.linkedItems.some((item) => item.id === "rev_qdrant_scope"), true);
    assert.equal(reviewResult.manualActions.some((action) => action.action === "review_item"), true);

    const followupResult = await retrieval.retrieveContextForAnswer(root, "What open follow-ups are linked to Joe?");
    assert.equal(followupResult.queryIntent.primary, "follow_up");
    assert.equal(followupResult.manualActions.some((action) => action.action === "open_followups"), true);

    const recentResult = await retrieval.retrieveContextForAnswer(root, "What changed recently?");
    assert.equal(recentResult.queryIntent.primary, "recent_changes");
    assert.equal(recentResult.plannedLookups.some((lookup) => lookup.kind === "recent_events"), true);
    assert.equal(recentResult.evidenceEvents.length > 0, true);
    assert.equal(recentResult.manualActions.some((action) => action.action === "open_today"), true);

    const noMatch = await retrieval.retrieveContextForAnswer(root, "What is the Neptune deploy key?");
    assert.equal(noMatch.queryIntent.primary, "general");
    assert.deepEqual(noMatch.matchedPages, []);
    assert.deepEqual(noMatch.answerCandidates, []);
    assert.equal(noMatch.missingInformation.some((item) => item.code === "no_match"), true);
    assert.equal(noMatch.manualActions.some((action) => action.action === "capture_note"), true);
    assert.equal(noMatch.warnings.some((warning) => /No named/.test(warning)), true);
    assert.match(noMatch.contextPack, /No-match guidance/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
