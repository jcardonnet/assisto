import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";

async function makeTempVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-ingest-"));
  await mkdir(path.join(root, "memory", "transactions", "pending"), { recursive: true });
  return root;
}

async function readVaultFile(root, relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function expectMissing(root, relativePath) {
  await assert.rejects(() => readVaultFile(root, relativePath));
}

function operationsOf(transaction) {
  return transaction.operations.map((operation) => operation.operation);
}

function proposedWrite(transaction, pathSuffix) {
  return transaction.proposed_file_writes.find((write) => write.path.endsWith(pathSuffix));
}

export async function runCoreIngestTests() {
  const ingest = await loadTsModule("packages/core/src/ingest/index.ts");
  const transactions = await loadTsModule("packages/core/src/transactions/index.ts");

  const joeRoot = await makeTempVault();

  try {
    const result = await ingest.ingestNote(joeRoot, "Joe is the DBA. We use MySQL.", {
      now: "2026-05-20T12:00:00-03:00"
    });
    const event = await readVaultFile(joeRoot, "memory/events/2026/2026-05/2026-05-20-001.md");
    const transactionMarkdown = await readVaultFile(
      joeRoot,
      "memory/transactions/pending/tx_2026_05_20_001.md"
    );
    const transaction = transactions.parseTransactionMarkdown(transactionMarkdown);

    assert.equal(result.event_id, "ev_2026_05_20_001");
    assert.match(event, /Joe is the DBA\. We use MySQL\./);
    assert.deepEqual(operationsOf(transaction), ["UPSERT_CLAIM", "STAGE_REVIEW"]);
    assert.ok(proposedWrite(transaction, "memory/people/joe.md"));
    assert.ok(proposedWrite(transaction, "memory/review/unscoped-claims.md"));
    assert.match(proposedWrite(transaction, "memory/people/joe.md").content, /clm_joe_role_dba/);
    assert.match(
      proposedWrite(transaction, "memory/review/unscoped-claims.md").content,
      /clm_mysql_used_unknown_scope/
    );
    assert.match(proposedWrite(transaction, "memory/review/unscoped-claims.md").content, /review_state: staged/);
    await expectMissing(joeRoot, "memory/people/joe.md");
    await expectMissing(joeRoot, "memory/review/unscoped-claims.md");
  } finally {
    await rm(joeRoot, { recursive: true, force: true });
  }

  const selfJobRoot = await makeTempVault();

  try {
    const result = await ingest.ingestNote(
      selfJobRoot,
      "I started new job this monday as a AI Engineer at SmartEquip",
      { now: "2026-05-20T12:00:00-03:00" }
    );
    const event = await readVaultFile(selfJobRoot, "memory/events/2026/2026-05/2026-05-20-001.md");
    const transactionMarkdown = await readVaultFile(
      selfJobRoot,
      "memory/transactions/pending/tx_2026_05_20_001.md"
    );
    const transaction = transactions.parseTransactionMarkdown(transactionMarkdown);
    const userPage = proposedWrite(transaction, "memory/people/user.md").content;

    assert.deepEqual(result.extracted_claim_ids, ["clm_user_job_ai_engineer_smartequip"]);
    assert.match(event, /observed_at: 2026-05-18/);
    assert.match(event, /clm_user_job_ai_engineer_smartequip/);
    assert.deepEqual(operationsOf(transaction), ["UPSERT_CLAIM"]);
    assert.match(userPage, /User started a new job at SmartEquip as an AI Engineer\./);
    assert.match(userPage, /scope: SmartEquip/);
    assert.match(userPage, /scope_state: complete/);
    assert.match(userPage, /valid_from: 2026-05-18/);
    await expectMissing(selfJobRoot, "memory/people/user.md");
  } finally {
    await rm(selfJobRoot, { recursive: true, force: true });
  }

  const mikeRoot = await makeTempVault();

  try {
    const result = await ingest.ingestNote(
      mikeRoot,
      "Mike is my manager. He is a generalist Java developer with lots of CRM experience. He has a PhD in Statistics.",
      { now: "2026-05-20T12:00:00-03:00" }
    );
    const transactionMarkdown = await readVaultFile(
      mikeRoot,
      "memory/transactions/pending/tx_2026_05_20_001.md"
    );
    const transaction = transactions.parseTransactionMarkdown(transactionMarkdown);
    const mikePage = proposedWrite(transaction, "memory/people/mike.md").content;

    assert.deepEqual(result.extracted_claim_ids, [
      "clm_mike_manager",
      "clm_mike_java_generalist",
      "clm_mike_crm_experience",
      "clm_mike_phd_stats",
      "clm_mike_comm_guidance_stats"
    ]);
    assert.match(mikePage, /clm_mike_manager/);
    assert.match(mikePage, /clm_mike_comm_guidance_stats/);
    assert.match(mikePage, /claim_kind: inference/);
    assert.match(mikePage, /claim_state: staged/);
  } finally {
    await rm(mikeRoot, { recursive: true, force: true });
  }

  const pgvectorRoot = await makeTempVault();

  try {
    await ingest.ingestNote(
      pgvectorRoot,
      "Today I talked with Joe about pgvector for storing CLIP embeddings of product pictures.",
      { now: "2026-05-20T12:00:00-03:00" }
    );
    const event = await readVaultFile(pgvectorRoot, "memory/events/2026/2026-05/2026-05-20-001.md");
    const transactionMarkdown = await readVaultFile(
      pgvectorRoot,
      "memory/transactions/pending/tx_2026_05_20_001.md"
    );
    const transaction = transactions.parseTransactionMarkdown(transactionMarkdown);
    const topicPage = proposedWrite(transaction, "memory/topics/pgvector.md").content;

    assert.match(event, /observed_at: 2026-05-20/);
    assert.match(topicPage, /clm_pgvector_discussed/);
    assert.match(topicPage, /Discussed pgvector with Joe\./);
    await expectMissing(pgvectorRoot, "memory/topics/pgvector.md");
  } finally {
    await rm(pgvectorRoot, { recursive: true, force: true });
  }

  const queryRoot = await makeTempVault();

  try {
    await ingest.ingestNote(
      queryRoot,
      "How should I explain Joe and Mike the difference between Solr and Qdrant?",
      { now: "2026-05-20T12:00:00-03:00" }
    );
    const event = await readVaultFile(queryRoot, "memory/events/2026/2026-05/2026-05-20-001.md");
    const transactionMarkdown = await readVaultFile(
      queryRoot,
      "memory/transactions/pending/tx_2026_05_20_001.md"
    );
    const transaction = transactions.parseTransactionMarkdown(transactionMarkdown);

    assert.match(event, /No durable claim candidates extracted/);
    assert.deepEqual(operationsOf(transaction), ["NOOP"]);
    assert.equal(transaction.proposed_file_writes.length, 0);
  } finally {
    await rm(queryRoot, { recursive: true, force: true });
  }

  const fakeObligationRoot = await makeTempVault();

  try {
    await ingest.ingestNote(fakeObligationRoot, "We discussed asking Joe", {
      now: "2026-05-20T12:00:00-03:00"
    });
    const noFollowupTransaction = transactions.parseTransactionMarkdown(
      await readVaultFile(fakeObligationRoot, "memory/transactions/pending/tx_2026_05_20_001.md")
    );
    assert.deepEqual(operationsOf(noFollowupTransaction), ["NOOP"]);
    assert.equal(noFollowupTransaction.proposed_file_writes.length, 0);

    await ingest.ingestNote(fakeObligationRoot, "Maybe I should ask Joe", {
      now: "2026-05-20T12:00:00-03:00"
    });
    const candidateTransaction = transactions.parseTransactionMarkdown(
      await readVaultFile(fakeObligationRoot, "memory/transactions/pending/tx_2026_05_20_002.md")
    );
    assert.match(
      proposedWrite(candidateTransaction, "memory/followups/ask-joe.md").content,
      /followup_state: candidate/
    );

    await ingest.ingestNote(fakeObligationRoot, "Remind me to ask Joe", {
      now: "2026-05-20T12:00:00-03:00"
    });
    const committedTransaction = transactions.parseTransactionMarkdown(
      await readVaultFile(fakeObligationRoot, "memory/transactions/pending/tx_2026_05_20_003.md")
    );
    assert.match(
      proposedWrite(committedTransaction, "memory/followups/ask-joe.md").content,
      /followup_state: committed/
    );
    assert.match(proposedWrite(committedTransaction, "memory/followups/ask-joe.md").content, /remind me to/i);
  } finally {
    await rm(fakeObligationRoot, { recursive: true, force: true });
  }
}
