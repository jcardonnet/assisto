import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";

async function makeTempVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-answer-v4-"));
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
recorded_at: 2026-06-01T10:00:00.000Z
observed_at: 2026-06-01
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

function contextPage() {
  return `---
id: ctx_inventory_project
type: context
object_state: active
review_state: reviewed
created_at: 2026-06-01T10:00:00.000Z
updated_at: 2026-06-01T10:00:00.000Z
aliases:
  - Search API
source_events:
  - ev_answer_v4_dependencies
related: []
summary_generated_from:
  - clm_search_dependencies
---

# Search API

## Active claims

- claim_id: clm_search_dependencies
  statement: Search API depends on Billing repository. Billing repository depends on MySQL.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: Inventory Project
  scope_state: complete
  evidence: [ev_answer_v4_dependencies]
  recorded_at: 2026-06-01T10:00:00.000Z
  observed_at: 2026-06-01
  valid_from: null
  valid_to: null
`;
}

async function writeFixture(root) {
  await writeVaultFile(
    root,
    "memory/events/2026/2026-06/ev_answer_v4_dependencies.md",
    eventPage(
      "ev_answer_v4_dependencies",
      "Search API depends on Billing repository. Billing repository depends on MySQL."
    )
  );
  await writeVaultFile(root, "memory/contexts/search-api.md", contextPage());
}

export async function runCoreAnswerContractV4Tests() {
  const retrieval = await loadTsModule("packages/core/src/retrieval/index.ts");
  const root = await makeTempVault();

  try {
    await writeFixture(root);
    const before = await snapshotFiles(root);

    const dependency = await retrieval.retrieveCitedAnswerContractV4(root, "What does Search API depend on?");
    assert.equal(dependency.version, "answer-contract-v4");
    assert.equal(dependency.queryPlan.retrieval.intent.primary, "project_context");
    assert.equal(dependency.queryPlan.symbolic.intent, "dependency_chain");
    assert.equal(dependency.directAnswers.some((answer) => answer.claim_id === "clm_search_dependencies"), true);
    assert.equal(dependency.reasoningSteps.some((step) => step.step_id === "symbolic_plan"), true);
    assert.equal(dependency.proofTree.some((tree) => tree.rule === "transitive_relation" && tree.children.length > 0), true);
    assert.equal(dependency.sourceExcerpts.some((excerpt) => excerpt.event_id === "ev_answer_v4_dependencies"), true);
    assert.equal(
      dependency.sourceExcerpts.some((excerpt) =>
        excerpt.excerpt.includes("Search API depends on Billing repository") &&
        excerpt.cited_claim_ids.includes("clm_search_dependencies")
      ),
      true
    );
    assert.equal(dependency.missingMemoryDiagnostics.length, 0);
    assert.equal(dependency.suggestedSourceImports.length, 0);
    assert.match(dependency.contextPack, /# Context pack/);

    const noMatch = await retrieval.retrieveCitedAnswerContractV4(root, "What is the Neptune deploy key?");
    assert.equal(noMatch.version, "answer-contract-v4");
    assert.deepEqual(noMatch.directAnswers, []);
    assert.equal(noMatch.missingMemoryDiagnostics.some((item) => item.code === "no_match" && item.severity === "warning"), true);
    assert.equal(
      noMatch.suggestedSourceImports.some((item) =>
        item.source_import_id === "source_import_missing_memory" && item.adapter_kinds.includes("repo_markdown")
      ),
      true
    );

    const after = await snapshotFiles(root);
    assert.deepEqual(after, before, "answer contract v4 should not persist generated output or indexes");
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

if (process.argv[1]?.endsWith("core-answer-contract-v4.mjs")) {
  await runCoreAnswerContractV4Tests();
}
