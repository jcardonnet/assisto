import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";

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
  } finally {
    await rm(askRoot, { recursive: true, force: true });
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
}
