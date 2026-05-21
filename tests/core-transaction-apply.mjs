import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";

const eventPage = `---
id: ev_2026_05_20_001
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-20T12:00:00-03:00
observed_at: null
source_type: user_note
source_actor: user
participants: []
topics: []
contexts: []
derived_claims:
  - clm_joe_role_dba
transactions:
  - tx_2026_05_20_001
---

# Event ev_2026_05_20_001

## Raw text

Joe is the DBA. We use MySQL.
`;

const joePage = `---
id: per_joe
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-20T12:00:00-03:00
updated_at: 2026-05-20T12:00:00-03:00
aliases: []
source_events:
  - ev_2026_05_20_001
related: []
summary_generated_from:
  - clm_joe_role_dba
---

# Joe

## Current summary

Joe is the DBA.

## Active claims

- claim_id: clm_joe_role_dba
  statement: Joe is the DBA.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: current-work-context
  scope_state: partial
  evidence: [ev_2026_05_20_001]
  recorded_at: 2026-05-20T12:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
`;

const unscopedReviewPage = `---
id: rev_unscoped_claims
type: review_item
object_state: active
review_state: staged
review_reason: unscoped_claim
created_at: 2026-05-20T12:00:00-03:00
source_events:
  - ev_2026_05_20_001
affected_files:
  - topics/mysql.md
linked_transaction: tx_2026_05_20_001
---

# Review: Unscoped claims

## Issue

The claim "We use MySQL" is explicit but lacks scope.

## Evidence

- Event: [[events/2026/2026-05/2026-05-20-001]]
- Candidate claim: \`clm_mysql_used_unknown_scope\`
`;

function transactionMarkdown(id, fileBlocks, operations = ["ADD_EVENT", "UPSERT_CLAIM", "STAGE_REVIEW"]) {
  return `---
id: ${id}
type: transaction
transaction_state: pending
created_at: 2026-05-20T12:00:00-03:00
source_events:
  - ev_2026_05_20_001
operations:
${operations.map((operation) => `  - ${operation}`).join("\n")}
affected_files:
${fileBlocks.map((block) => `  - ${block.path.replace(/^memory\//, "")}`).join("\n")}
risk_level: medium
requires_review: true
validation_errors: []
---

# Transaction ${id}

## Intent

Capture Joe/MySQL note through explicit proposed file writes.

## Proposed operations

${operations.map((operation) => `- ${operation}: proposed`).join("\n")}

## Proposed changes

### Create

${fileBlocks.map((block) => `\`\`\`markdown path=${block.path}\n${block.content.trimEnd()}\n\`\`\``).join("\n\n")}

## Rollback / repair notes

Preserve Event files already written and repair non-Event writes manually.

## Application log

Pending.
`;
}

async function makeTempVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-tx-"));
  await mkdir(path.join(root, "memory", "transactions", "pending"), { recursive: true });
  return root;
}

async function writePendingTransaction(root, id, content) {
  await writeFile(path.join(root, "memory", "transactions", "pending", `${id}.md`), content, "utf8");
}

export async function runCoreTransactionApplyTests() {
  const transactions = await loadTsModule("packages/core/src/transactions/index.ts");

  const root = await makeTempVault();

  try {
    await writePendingTransaction(
      root,
      "tx_2026_05_20_001",
      transactionMarkdown("tx_2026_05_20_001", [
        { path: "memory/events/2026/2026-05/2026-05-20-001.md", content: eventPage },
        { path: "memory/people/joe.md", content: joePage },
        { path: "memory/review/unscoped-claims.md", content: unscopedReviewPage }
      ])
    );

    await transactions.applyTransaction(root, "tx_2026_05_20_001");

    assert.match(
      await readFile(
        path.join(root, "memory", "events", "2026", "2026-05", "2026-05-20-001.md"),
        "utf8"
      ),
      /Joe is the DBA/
    );
    assert.match(await readFile(path.join(root, "memory", "people", "joe.md"), "utf8"), /clm_joe_role_dba/);
    assert.match(
      await readFile(path.join(root, "memory", "review", "unscoped-claims.md"), "utf8"),
      /review_state: staged/
    );
    assert.match(
      await readFile(path.join(root, "memory", "transactions", "applied", "tx_2026_05_20_001.md"), "utf8"),
      /transaction_state: applied/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const partialRoot = await makeTempVault();

  try {
    await writePendingTransaction(
      partialRoot,
      "tx_partial",
      transactionMarkdown("tx_partial", [
        { path: "memory/events/2026/2026-05/2026-05-20-001.md", content: eventPage },
        { path: "memory/people/joe.md", content: joePage }
      ])
    );
    await writeFile(path.join(partialRoot, "memory", "people"), "not a directory", "utf8");

    await assert.rejects(() => transactions.applyTransaction(partialRoot, "tx_partial"));

    assert.match(
      await readFile(
        path.join(partialRoot, "memory", "events", "2026", "2026-05", "2026-05-20-001.md"),
        "utf8"
      ),
      /ev_2026_05_20_001/
    );
    assert.match(
      await readFile(path.join(partialRoot, "memory", "transactions", "failed", "tx_partial.md"), "utf8"),
      /transaction_state: failed/
    );
    assert.match(
      await readFile(path.join(partialRoot, "memory", "transactions", "failed", "tx_partial.md"), "utf8"),
      /Repair notes/
    );
  } finally {
    await rm(partialRoot, { recursive: true, force: true });
  }

  const invalidRoot = await makeTempVault();

  try {
    const invalidTransaction = transactions.createTransactionDraft({
      id: "tx_invalid",
      created_at: "2026-05-20T12:00:00-03:00",
      source_events: ["ev_2026_05_20_001"],
      operations: ["UPSERT_CLAIM"],
      affected_files: ["people/joe.md"],
      rollback_notes: "No writes should happen.",
      proposed_file_writes: [
        {
          path: "memory/people/joe.md",
          content: joePage.replace("evidence: [ev_2026_05_20_001]", "evidence: []")
        }
      ]
    });
    const validation = await transactions.validateTransaction(invalidRoot, invalidTransaction);
    assert.equal(validation.passed, false);
    assert.equal(
      validation.errors.some((error) => error.code === "ACTIVE_CLAIM_MISSING_EVENT_EVIDENCE"),
      true
    );

    await writePendingTransaction(
      invalidRoot,
      "tx_invalid",
      transactions.serializeTransactionMarkdown(invalidTransaction)
    );
    await assert.rejects(
      () => transactions.applyTransaction(invalidRoot, "tx_invalid"),
      transactions.TransactionValidationError
    );
    await assert.rejects(() => readFile(path.join(invalidRoot, "memory", "people", "joe.md"), "utf8"));
  } finally {
    await rm(invalidRoot, { recursive: true, force: true });
  }

  const unsupportedRoot = await makeTempVault();

  try {
    for (const operation of ["MERGE", "DELETE", "AUTO_RESOLVE_CONTRADICTION"]) {
      const validation = await transactions.validateTransaction(unsupportedRoot, {
        id: `tx_${operation.toLowerCase()}`,
        type: "Transaction",
        transaction_state: "pending",
        created_at: "2026-05-20T12:00:00-03:00",
        source_events: [],
        operations: [{ operation }],
        affected_files: [],
        rollback_notes: "Do not apply unsupported operations.",
        proposed_file_writes: []
      });
      assert.equal(validation.passed, false);
      assert.equal(validation.errors.some((error) => error.code === "INVALID_OPERATION"), true);
    }
  } finally {
    await rm(unsupportedRoot, { recursive: true, force: true });
  }

  assert.equal("writeMarkdownPageAtomic" in transactions, false);
}
