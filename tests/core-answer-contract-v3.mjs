import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";

async function makeTempVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-answer-v3-"));
  await mkdir(path.join(root, "memory"), { recursive: true });
  return root;
}

async function writeVaultFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
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

function personPage(id, name, claims) {
  const activeClaims = claims.filter((claim) => claim.state === "active").map((claim) => claim.block).join("\n");
  const inactiveClaims = claims.filter((claim) => claim.state !== "active").map((claim) => claim.block).join("\n");

  return `---
id: ${id}
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
  - ${claims[0].evidence}
related: []
summary_generated_from:
${claims.filter((claim) => claim.state === "active").map((claim) => `  - ${claim.id}`).join("\n")}
---

# ${name}

## Active claims

${activeClaims}
${inactiveClaims ? `\n## Non-active claims\n\n${inactiveClaims}` : ""}
`;
}

function claim(id, statement, state, evidence, scopeState = "complete") {
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

async function writeFixture(root) {
  await writeVaultFile(root, "memory/people/mike.md", personPage("per_mike", "Mike", [
    claim("clm_mike_manager", "Mike is my manager.", "active", "ev_manager")
  ]));
  await writeVaultFile(root, "memory/people/joe.md", personPage("per_joe", "Joe", [
    claim("clm_joe_role_engineer", "Joe is the AI Engineer.", "active", "ev_joe_role_active"),
    claim("clm_joe_role_dba_old", "Joe was the DBA.", "superseded", "ev_joe_role_old")
  ]));
  await writeVaultFile(root, "memory/events/2026/2026-05/ev_manager.md", eventPage("ev_manager", "Mike is my manager."));
  await writeVaultFile(
    root,
    "memory/events/2026/2026-05/ev_joe_role_active.md",
    eventPage("ev_joe_role_active", "Joe is the AI Engineer.")
  );
  await writeVaultFile(root, "memory/events/2026/2026-05/ev_joe_role_old.md", eventPage("ev_joe_role_old", "Joe was the DBA."));
}

export async function runCoreAnswerContractV3Tests() {
  const retrieval = await loadTsModule("packages/core/src/retrieval/index.ts");
  const root = await makeTempVault();

  try {
    await writeFixture(root);
    const before = await snapshotFiles(root);

    const manager = await retrieval.retrieveCitedAnswerContractV3(root, "Who is my manager?");
    assert.equal(manager.version, "answer-contract-v3");
    assert.equal(manager.question, "Who is my manager?");
    assert.equal(manager.contextPack.includes("# Context pack"), true);
    assert.equal(manager.directAnswers.some((answer) => answer.claim_id === "clm_mike_manager"), true);
    const direct = manager.directAnswers.find((answer) => answer.claim_id === "clm_mike_manager");
    assert.ok(direct);
    assert.equal(direct.text, "Mike is my manager.");
    assert.equal(direct.answer_kind, "manager_reporting_fact");
    assert.equal(direct.confidence_label, "source_backed");
    assert.equal(direct.citations.some((citation) => citation.kind === "claim" && citation.id === "clm_mike_manager"), true);
    assert.equal(direct.citations.some((citation) => citation.kind === "event" && citation.id === "ev_manager"), true);
    assert.equal(direct.citations.some((citation) => citation.kind === "page" && citation.id === "memory/people/mike.md"), true);
    assert.equal(direct.citation_ids.every((citationId) => manager.citationIndex[citationId]), true);
    assert.equal(manager.directAnswers.every((answer) => hasResolvedClaimPageAndEventCitations(answer, manager)), true);
    assert.equal(direct.inference_paths.includes("claim:clm_mike_manager"), true);

    const role = await retrieval.retrieveCitedAnswerContractV3(root, "What changed about Joe's role?");
    assert.equal(role.directAnswers.some((answer) => answer.claim_id === "clm_joe_role_engineer"), true);
    assert.equal(role.conflicts.some((item) => item.claim_id === "clm_joe_role_dba_old"), true);
    assert.equal(role.staleSignals.some((item) => item.claim_id === "clm_joe_role_dba_old"), true);

    const noMatch = await retrieval.retrieveCitedAnswerContractV3(root, "What is the Neptune deploy key?");
    assert.deepEqual(noMatch.directAnswers, []);
    const noMatchItem = noMatch.cannotConfirm.find((item) => item.code === "no_match");
    assert.ok(noMatchItem);
    assert.equal(noMatchItem.repair_action_ids.length >= 2, true);
    assert.equal(noMatchItem.repair_action_ids.every((actionId) => noMatch.repairActions.some((action) => action.action_id === actionId)), true);
    assert.equal(noMatchItem.repair_action_ids.some((actionId) => noMatch.repairActions.some((action) => action.action_id === actionId && action.action === "capture_note")), true);
    assert.equal(noMatchItem.repair_action_ids.some((actionId) => noMatch.repairActions.some((action) => action.action_id === actionId && action.action === "log_friction")), true);

    const after = await snapshotFiles(root);
    assert.deepEqual(after, before, "answer contract v3 should not persist generated output");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function hasResolvedClaimPageAndEventCitations(answer, contract) {
  const citationIds = new Set(answer.citation_ids ?? []);
  return citationIds.has(`claim:${answer.claim_id}`) &&
    citationIds.has(`page:${answer.page_path}`) &&
    (answer.citations ?? []).some((citation) => citation.kind === "event") &&
    (answer.citation_ids ?? []).every((citationId) => contract.citationIndex[citationId]);
}
