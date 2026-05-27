import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";
import { writeHealthFixture } from "./core-health.mjs";
import { writeBriefFixture } from "./core-briefs.mjs";
import { writeWorkbenchFixture } from "./workbench.mjs";

let cliModule = null;

async function makeTempVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-cli-"));
  await mkdir(path.join(root, "memory", "transactions", "pending"), { recursive: true });
  return root;
}

async function runWm(root, args) {
  if (!cliModule) {
    cliModule = await loadTsModule("packages/cli/src/index.ts");
  }

  const stdout = [];
  const stderr = [];
  const exitCode = await cliModule.main(["--root", root, ...args], {
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text)
  });

  assert.equal(exitCode, 0, stderr.join(""));

  return {
    stdout: stdout.join(""),
    stderr: stderr.join("")
  };
}

async function readVaultFile(root, relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function writeVaultFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

async function expectMissing(root, relativePath) {
  await assert.rejects(() => readVaultFile(root, relativePath));
}

export async function runCliIntegrationTests() {
  cliModule = await loadTsModule("packages/cli/src/index.ts");
  const helpStdout = [];
  const helpExitCode = await cliModule.main(["--help"], {
    stdout: (text) => helpStdout.push(text),
    stderr: () => undefined
  });
  const help = { stdout: helpStdout.join("") };
  assert.equal(helpExitCode, 0);
  assert.match(help.stdout, /wm - local markdown work-memory MVP/);
  assert.match(help.stdout, /capture/);
  assert.match(help.stdout, /import notes/);
  assert.match(help.stdout, /provider rule\|llm-stub\|openai/);
  assert.match(help.stdout, /workbench serve/);
  assert.match(help.stdout, /brief <today\|person\|context\|review\|followups\|recent>/);

  const txRoot = await makeTempVault();

  try {
    const ingestResult = await runWm(txRoot, ["ingest", "Joe is the DBA. We use MySQL."]);
    assert.match(ingestResult.stdout, /Pending transaction: tx_2026_05_20_001/);
    assert.match(ingestResult.stdout, /Staged review proposals: memory\/review\/unscoped-claims\.md/);

    const pendingTransaction = await readVaultFile(
      txRoot,
      "memory/transactions/pending/tx_2026_05_20_001.md"
    );
    assert.match(pendingTransaction, /path=memory\/people\/joe\.md/);
    assert.match(pendingTransaction, /path=memory\/review\/unscoped-claims\.md/);
    assert.match(pendingTransaction, /clm_mysql_used_unknown_scope/);
    await expectMissing(txRoot, "memory/people/joe.md");
    await expectMissing(txRoot, "memory/review/unscoped-claims.md");

    const listResult = await runWm(txRoot, ["tx", "list"]);
    assert.match(listResult.stdout, /tx_2026_05_20_001\s+pending/);

    const showResult = await runWm(txRoot, ["tx", "show", "tx_2026_05_20_001"]);
    assert.match(showResult.stdout, /# Transaction tx_2026_05_20_001/);

    const applyResult = await runWm(txRoot, ["tx", "apply", "tx_2026_05_20_001"]);
    assert.match(applyResult.stdout, /Applied transaction tx_2026_05_20_001/);
    assert.match(await readVaultFile(txRoot, "memory/people/joe.md"), /clm_joe_role_dba/);
    assert.match(await readVaultFile(txRoot, "memory/review/unscoped-claims.md"), /review_state: staged/);

    const reviewResult = await runWm(txRoot, ["review", "inbox"]);
    assert.match(reviewResult.stdout, /Staged review items:/);
    assert.match(reviewResult.stdout, /rev_unscoped_claims/);
  } finally {
    await rm(txRoot, { recursive: true, force: true });
  }

  const captureRoot = await makeTempVault();

  try {
    const dryRun = await runWm(captureRoot, [
      "capture",
      "--dry-run",
      "--observed-at",
      "2026-05-21",
      "--source-label",
      "standup",
      "--context",
      "ctx_inventory_project",
      "Joe is the DBA. We use MySQL."
    ]);
    assert.match(dryRun.stdout, /Dry run\. No changes written/);
    assert.match(dryRun.stdout, /Event: ev_2026_05_20_001/);
    assert.match(dryRun.stdout, /Validation: passed/);
    await expectMissing(captureRoot, "memory/events/2026/2026-05/2026-05-20-001.md");

    const created = await runWm(captureRoot, [
      "capture",
      "--observed-at",
      "2026-05-21",
      "--source-label",
      "standup",
      "--context",
      "ctx_inventory_project",
      "Joe is the DBA. We use MySQL."
    ]);
    assert.match(created.stdout, /Event: ev_2026_05_20_001/);
    assert.match(created.stdout, /Pending transaction: tx_2026_05_20_001/);
    assert.match(created.stdout, /Validation: passed/);
    assert.match(
      await readVaultFile(captureRoot, "memory/events/2026/2026-05/2026-05-20-001.md"),
      /source_label: standup/
    );
    assert.match(
      await readVaultFile(captureRoot, "memory/transactions/pending/tx_2026_05_20_001.md"),
      /transaction_state: pending/
    );
    await expectMissing(captureRoot, "memory/people/joe.md");

    const openAiDryRun = await runWm(captureRoot, [
      "capture",
      "--dry-run",
      "--provider",
      "openai",
      "Alice is the PM."
    ]);
    assert.match(openAiDryRun.stdout, /Provider: openai/);
    assert.match(openAiDryRun.stdout, /Staged review proposals:/);
  } finally {
    await rm(captureRoot, { recursive: true, force: true });
  }

  const importRoot = await makeTempVault();
  const importSource = path.join(importRoot, "curated");

  try {
    await mkdir(importSource, { recursive: true });
    await writeFile(path.join(importSource, "note.md"), "Joe is the DBA. We use MySQL.", "utf8");
    await writeFile(path.join(importSource, "ignore.csv"), "not imported", "utf8");

    const dryRun = await runWm(importRoot, [
      "import",
      "notes",
      "--path",
      importSource,
      "--limit",
      "1",
      "--dry-run"
    ]);
    assert.match(dryRun.stdout, /Dry run\. No changes written/);
    assert.match(dryRun.stdout, /Import units: 1/);
    assert.match(dryRun.stdout, /Event: ev_2026_05_20_001/);
    await expectMissing(importRoot, "memory/events/2026/2026-05/2026-05-20-001.md");

    const created = await runWm(importRoot, [
      "import",
      "notes",
      "--path",
      importSource,
      "--source-label",
      "curated import"
    ]);
    assert.match(created.stdout, /Imported: 1/);
    assert.match(created.stdout, /Pending transaction: tx_2026_05_20_001/);
    assert.match(
      await readVaultFile(importRoot, "memory/events/2026/2026-05/2026-05-20-001.md"),
      /source_hash: [a-f0-9]{64}/
    );
    assert.match(
      await readVaultFile(importRoot, "memory/events/2026/2026-05/2026-05-20-001.md"),
      /source_label: curated import/
    );
    await expectMissing(importRoot, "memory/people/joe.md");

    const duplicate = await runWm(importRoot, ["import", "notes", "--path", importSource]);
    assert.match(duplicate.stdout, /Imported: 0/);
    assert.match(duplicate.stdout, /Skipped: 1/);
    assert.match(duplicate.stdout, /Skipped duplicate source_hash/);
  } finally {
    await rm(importRoot, { recursive: true, force: true });
  }

  const askRoot = await makeTempVault();

  try {
    await writeVaultFile(
      askRoot,
      "memory/people/joe.md",
      "# Joe\n\n## Current summary\n\nJoe works with search infrastructure.\n"
    );
    await writeVaultFile(
      askRoot,
      "memory/people/mike.md",
      "# Mike\n\n## Current summary\n\nMike is a manager who needs clear tradeoffs.\n"
    );
    await writeVaultFile(
      askRoot,
      "memory/topics/solr.md",
      "# Solr\n\n## Current summary\n\nSolr is a search platform.\n"
    );
    await writeVaultFile(
      askRoot,
      "memory/topics/qdrant.md",
      "# Qdrant\n\n## Current summary\n\nQdrant is a vector database.\n"
    );

    const askResult = await runWm(askRoot, [
      "ask",
      "--pack-context",
      "How should I explain Joe and Mike the difference between Solr and Qdrant?"
    ]);
    assert.match(askResult.stdout, /# Context pack/);
    assert.match(askResult.stdout, /memory\/people\/joe\.md/);
    assert.match(askResult.stdout, /memory\/people\/mike\.md/);
    assert.match(askResult.stdout, /memory\/topics\/solr\.md/);
    assert.match(askResult.stdout, /memory\/topics\/qdrant\.md/);

    const answerBasisResult = await runWm(askRoot, [
      "ask",
      "--answer-basis",
      "How should I explain Joe and Mike the difference between Solr and Qdrant?"
    ]);
    const answerBasis = JSON.parse(answerBasisResult.stdout);
    assert.equal(typeof answerBasis.queryIntent.primary, "string");
    assert.equal(Array.isArray(answerBasis.plannedLookups), true);
    assert.equal(Array.isArray(answerBasis.answerCandidates), true);
    assert.equal(Array.isArray(answerBasis.missingInformation), true);
    assert.equal(Array.isArray(answerBasis.manualActions), true);
    assert.equal(Array.isArray(answerBasis.suggestedNextQuestions), true);
    assert.match(answerBasis.contextPack, /# Context pack/);
  } finally {
    await rm(askRoot, { recursive: true, force: true });
  }

  const briefRoot = await makeTempVault();

  try {
    await writeBriefFixture(briefRoot);
    const brief = await runWm(briefRoot, ["brief", "person", "per_jeff"]);
    assert.match(brief.stdout, /# Session brief: Jeff/);
    assert.match(brief.stdout, /Jeff is my manager/);
    assert.match(brief.stdout, /Open follow-ups/);
    assert.match(brief.stdout, /fu_ask_jeff/);
    assert.match(brief.stdout, /Generated explanations were not saved/);

    const followups = await runWm(briefRoot, ["brief", "followups"]);
    assert.match(followups.stdout, /# Session brief: Follow-ups/);
    assert.match(followups.stdout, /fu_ask_jeff/);
    assert.doesNotMatch(followups.stdout, /fu_closed/);

    const recent = await runWm(briefRoot, ["brief", "recent", "person", "per_jeff"]);
    assert.match(recent.stdout, /# Session brief: Recent changes: Jeff/);
    assert.match(recent.stdout, /Jeff is my manager/);
    assert.doesNotMatch(recent.stdout, /prefers email/);
  } finally {
    await rm(briefRoot, { recursive: true, force: true });
  }

  const todayRoot = await makeTempVault();

  try {
    await writeWorkbenchFixture(todayRoot);
    const today = await runWm(todayRoot, ["today"]);
    assert.match(today.stdout, /Daily review: needs attention/);
    assert.match(today.stdout, /pending_transactions\t4/);
    assert.match(today.stdout, /Stale NOOP Events/);
    assert.match(today.stdout, /ev_2026_05_21_003 via tx_2026_05_21_002/);

    const todayJsonResult = await runWm(todayRoot, ["today", "--json"]);
    const todayJson = JSON.parse(todayJsonResult.stdout);
    assert.equal(todayJson.daily_review_complete, false);
    assert.equal(todayJson.staged_review_groups[0].review_reason, "unscoped_claim");

    const dogfood = await runWm(todayRoot, ["dogfood", "status"]);
    assert.match(dogfood.stdout, /Dogfood Home/);
    assert.match(dogfood.stdout, /Next action: Review pending transaction/);
    assert.match(dogfood.stdout, /pending_transactions\t4/);

    const dogfoodJsonResult = await runWm(todayRoot, ["dogfood", "status", "--json"]);
    const dogfoodJson = JSON.parse(dogfoodJsonResult.stdout);
    assert.equal(dogfoodJson.next_recommended_action.action, "review_pending_transaction");
    assert.equal(dogfoodJson.daily_progress.open_items, 7);
  } finally {
    await rm(todayRoot, { recursive: true, force: true });
  }

  const rejectRoot = await makeTempVault();

  try {
    await runWm(rejectRoot, ["ingest", "Maybe I should ask Joe"]);
    const rejectResult = await runWm(rejectRoot, [
      "tx",
      "reject",
      "tx_2026_05_20_001",
      "--reason",
      "Not needed"
    ]);
    assert.match(rejectResult.stdout, /Rejected transaction tx_2026_05_20_001: Not needed/);
    assert.match(
      await readVaultFile(rejectRoot, "memory/transactions/rejected/tx_2026_05_20_001.md"),
      /transaction_state: rejected/
    );
  } finally {
    await rm(rejectRoot, { recursive: true, force: true });
  }

  const lintRoot = await makeTempVault();

  try {
    await writeVaultFile(
      lintRoot,
      "memory/topics/mysql.md",
      `---
id: top_mysql
type: topic
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events: []
related: []
summary_generated_from: []
---

# MySQL

## Active claims

- claim_id: clm_mysql_unknown_scope
  statement: We use MySQL.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: null
  scope_state: unknown
  evidence: []
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`
    );
    const lintResult = await runWm(lintRoot, ["lint"]);
    assert.match(lintResult.stdout, /Staged \d+ lint review item/);
    const reviewResult = await runWm(lintRoot, ["review", "inbox"]);
    assert.match(reviewResult.stdout, /lint-unscoped_claim/);
    assert.match(await readVaultFile(lintRoot, "memory/topics/mysql.md"), /object_state: active/);
  } finally {
    await rm(lintRoot, { recursive: true, force: true });
  }

  const healthRoot = await makeTempVault();

  try {
    await writeHealthFixture(healthRoot);

    const healthCheck = await runWm(healthRoot, ["health", "check"]);
    assert.match(healthCheck.stdout, /Memory health/);
    assert.match(healthCheck.stdout, /staged_review_items\s+1/);
    assert.match(healthCheck.stdout, /stale_noop_events\s+1/);
    assert.match(healthCheck.stdout, /pages_missing_source_events\s+1/);
    assert.match(healthCheck.stdout, /Suggested manual actions/);

    const healthStage = await runWm(healthRoot, [
      "health",
      "check",
      "--stage-review",
      "--note",
      "Manual health triage."
    ]);
    const healthTransactionId = /Pending health review transaction: (tx_\d{4}_\d{2}_\d{2}_\d{3})/.exec(
      healthStage.stdout
    )?.[1];
    assert.ok(healthTransactionId);
    assert.match(
      await readVaultFile(healthRoot, `memory/transactions/pending/${healthTransactionId}.md`),
      /health-stale_noop_event/
    );
    await expectMissing(healthRoot, "memory/review/health-stale_noop_event.md");
    assert.match(await readVaultFile(healthRoot, "memory/topics/mysql.md"), /review_state: contested/);
  } finally {
    await rm(healthRoot, { recursive: true, force: true });
  }

  const v3CliRoot = await makeTempVault();

  try {
    await writeVaultFile(v3CliRoot, "memory/events/2026/2026-05/2026-05-20-001.md", `---
id: ev_2026_05_20_001
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-20T12:00:00-03:00
observed_at: null
source_type: user_note
source_actor: user
derived_claims: []
---

# Event ev_2026_05_20_001

## Raw text

I started new job this monday as a AI Engineer at SmartEquip

## Candidate extraction

- No durable claim candidates extracted.
`);
    await writeVaultFile(v3CliRoot, "memory/review/mysql-scope.md", `---
id: rev_mysql_scope
type: review_item
object_state: active
review_state: staged
review_reason: unscoped_claim
created_at: 2026-05-20T12:00:00-03:00
source_events:
  - ev_2026_05_20_001
affected_files:
  - topics/mysql.md
---

# Review: MySQL scope

## Staged claims

- claim_id: clm_mysql_used_unknown_scope
  statement: We use MySQL.
  claim_kind: fact
  claim_state: staged
  evidence_strength: explicit
  scope: null
  scope_state: unknown
  evidence: [ev_2026_05_20_001]
  recorded_at: 2026-05-20T12:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
`);

    const applyReview = await runWm(v3CliRoot, [
      "review",
      "apply-staged",
      "rev_mysql_scope",
      "--target",
      "memory/topics/mysql.md",
      "--create-context",
      "Inventory Project",
      "--note",
      "Scope confirmed"
    ]);
    const applyReviewId = /Pending review apply transaction: (tx_\d{4}_\d{2}_\d{2}_\d{3})/.exec(applyReview.stdout)?.[1];
    assert.ok(applyReviewId);
    assert.match(await readVaultFile(v3CliRoot, `memory/transactions/pending/${applyReviewId}.md`), /scope: ctx_inventory_project/);

    const reprocess = await runWm(v3CliRoot, [
      "events",
      "reprocess",
      "ev_2026_05_20_001",
      "--stage-only"
    ]);
    const reprocessId = /Pending reprocess transaction: (tx_\d{4}_\d{2}_\d{2}_\d{3})/.exec(reprocess.stdout)?.[1];
    assert.ok(reprocessId);
    assert.match(await readVaultFile(v3CliRoot, `memory/transactions/pending/${reprocessId}.md`), /clm_user_job_ai_engineer_smartequip/);
  } finally {
    await rm(v3CliRoot, { recursive: true, force: true });
  }
}
