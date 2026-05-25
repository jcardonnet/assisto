import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";

const now = "2026-05-21T12:00:00-03:00";

async function makeTempVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-v3-"));
  await mkdir(path.join(root, "memory", "transactions", "pending"), { recursive: true });
  return root;
}

async function readVaultFile(root, relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function writeVaultFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

function proposedWrite(transaction, path) {
  return transaction.proposed_file_writes.find((write) => write.path === path);
}

export async function runCoreV3MemoryHardeningTests() {
  const ingest = await loadTsModule("packages/core/src/ingest/index.ts");
  const transactions = await loadTsModule("packages/core/src/transactions/index.ts");
  const review = await loadTsModule("packages/core/src/review/index.ts");

  const upsertRoot = await makeTempVault();

  try {
    await writeVaultFile(upsertRoot, "memory/events/2026/2026-05/2026-05-01-001.md", eventPage("ev_existing_001"));
    await writeVaultFile(
      upsertRoot,
      "memory/people/joe.md",
      personPage({
        id: "per_joe",
        name: "Joe",
        aliases: ["Joseph"],
        sourceEvents: ["ev_existing_001"],
        related: ["[[topics/mysql]]"],
        claims: [
          claimBlock({
            id: "clm_joe_role_dba",
            statement: "Joe is the DBA.",
            evidence: ["ev_existing_001"]
          })
        ]
      })
    );

    const result = await ingest.ingestNote(upsertRoot, "Joe is the DBA.", { now });
    const transaction = transactions.parseTransactionMarkdown(
      await readVaultFile(upsertRoot, "memory/transactions/pending/tx_2026_05_21_001.md")
    );
    const joeWrite = proposedWrite(transaction, "memory/people/joe.md")?.content ?? "";

    assert.equal(result.extracted_claim_ids.includes("clm_joe_role_dba"), true);
    assert.equal((joeWrite.match(/claim_id: clm_joe_role_dba/g) ?? []).length, 1);
    assert.match(joeWrite, /aliases:\n {2}- Joseph/);
    assert.match(joeWrite, /source_events:\n {2}- ev_existing_001\n {2}- ev_2026_05_21_001/);
    assert.match(joeWrite, /related:\n {2}- \[\[topics\/mysql\]\]/);
    assert.match(joeWrite, /Joe is the DBA\./);
  } finally {
    await rm(upsertRoot, { recursive: true, force: true });
  }

  const reviewRoot = await makeTempVault();

  try {
    await writeVaultFile(reviewRoot, "memory/events/2026/2026-05/2026-05-20-001.md", eventPage("ev_2026_05_20_001"));
    await writeVaultFile(reviewRoot, "memory/review/mysql-scope.md", mysqlScopeReviewItem());

    const result = await review.createReviewApplyTransaction(reviewRoot, "rev_mysql_scope", {
      target: "memory/topics/mysql.md",
      createContext: "Inventory Project",
      now,
      note: "Inventory Project confirmed as the scope."
    });
    const transaction = result.transaction;
    const contextWrite = proposedWrite(transaction, "memory/contexts/inventory-project.md")?.content ?? "";
    const topicWrite = proposedWrite(transaction, "memory/topics/mysql.md")?.content ?? "";
    const reviewWrite = proposedWrite(transaction, "memory/review/mysql-scope.md")?.content ?? "";

    assert.equal(result.transaction_id, "tx_2026_05_21_001");
    assert.match(contextWrite, /id: ctx_inventory_project/);
    assert.match(topicWrite, /claim_state: active/);
    assert.match(topicWrite, /scope: ctx_inventory_project/);
    assert.match(reviewWrite, /review_state: reviewed/);
    assert.match(reviewWrite, /marked reviewed\. Inventory Project confirmed as the scope\./);
    assert.match(await readVaultFile(reviewRoot, result.transaction_path), /path=memory\/topics\/mysql\.md/);
  } finally {
    await rm(reviewRoot, { recursive: true, force: true });
  }

  const supersedeRoot = await makeTempVault();

  try {
    await writeVaultFile(supersedeRoot, "memory/events/2026/2026-05/2026-05-20-001.md", eventPage("ev_2026_05_20_001"));
    await writeVaultFile(
      supersedeRoot,
      "memory/people/joe.md",
      personPage({
        id: "per_joe",
        name: "Joe",
        aliases: [],
        sourceEvents: ["ev_2026_05_20_001"],
        related: [],
        claims: [
          claimBlock({
            id: "clm_joe_role_dba",
            statement: "Joe is the DBA.",
            evidence: ["ev_2026_05_20_001"]
          })
        ]
      })
    );
    await writeVaultFile(supersedeRoot, "memory/review/joe-role.md", joeRoleReviewItem());

    const result = await review.createReviewApplyTransaction(supersedeRoot, "rev_joe_role", {
      target: "memory/people/joe.md",
      supersede: "clm_joe_role_dba",
      now
    });
    const joeWrite = proposedWrite(result.transaction, "memory/people/joe.md")?.content ?? "";

    assert.match(joeWrite, /claim_id: clm_joe_role_dba[\s\S]*claim_state: superseded/);
    assert.match(joeWrite, /claim_id: clm_joe_manager[\s\S]*claim_state: active/);
    assert.deepEqual(
      result.transaction.operations.map((operation) => operation.operation),
      ["SUPERSEDE_CLAIM", "UPSERT_CLAIM", "STAGE_REVIEW"]
    );
  } finally {
    await rm(supersedeRoot, { recursive: true, force: true });
  }

  const reprocessRoot = await makeTempVault();

  try {
    await writeVaultFile(
      reprocessRoot,
      "memory/events/2026/2026-05/2026-05-20-001.md",
      eventPage("ev_2026_05_20_001", "I started new job this monday as a AI Engineer at SmartEquip")
    );
    const before = await readVaultFile(reprocessRoot, "memory/events/2026/2026-05/2026-05-20-001.md");
    const result = await ingest.reprocessEvent(reprocessRoot, "ev_2026_05_20_001", { now });
    const transaction = transactions.parseTransactionMarkdown(await readVaultFile(reprocessRoot, result.transaction_path));
    const userWrite = proposedWrite(transaction, "memory/people/user.md")?.content ?? "";

    assert.equal(result.event_id, "ev_2026_05_20_001");
    assert.equal(result.transaction_id, "tx_2026_05_21_001");
    assert.match(userWrite, /evidence: \[ev_2026_05_20_001\]/);
    assert.match(userWrite, /User started a new job at SmartEquip as an AI Engineer\./);
    assert.equal(await readVaultFile(reprocessRoot, "memory/events/2026/2026-05/2026-05-20-001.md"), before);
  } finally {
    await rm(reprocessRoot, { recursive: true, force: true });
  }
}

function eventPage(id, rawText = "Source note") {
  return `---
id: ${id}
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-20T12:00:00-03:00
observed_at: null
source_type: user_note
source_actor: user
derived_claims: []
---

# Event ${id}

## Raw text

${rawText}

## Candidate extraction

- No durable claim candidates extracted.
`;
}

function personPage({ id, name, aliases, sourceEvents, related, claims }) {
  return `---
id: ${id}
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-01T12:00:00-03:00
updated_at: 2026-05-01T12:00:00-03:00
aliases:
${aliases.map((alias) => `  - ${alias}`).join("\n") || "  []"}
source_events:
${sourceEvents.map((eventId) => `  - ${eventId}`).join("\n")}
related:
${related.map((item) => `  - ${item}`).join("\n") || "  []"}
summary_generated_from:
${claims.map((claim) => `  - ${claim.id}`).join("\n")}
---

# ${name}

## Current summary

${claims[0]?.statement ?? ""}

## Active claims

${claims.map((claim) => claim.block).join("\n\n")}
`;
}

function claimBlock({ id, statement, evidence, state = "active", scope = "current-work-context" }) {
  return {
    id,
    statement,
    block: `- claim_id: ${id}
  statement: ${statement}
  claim_kind: fact
  claim_state: ${state}
  evidence_strength: explicit
  scope: ${scope}
  scope_state: partial
  evidence: [${evidence.join(", ")}]
  recorded_at: 2026-05-20T12:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null`
  };
}

function mysqlScopeReviewItem() {
  return `---
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
`;
}

function joeRoleReviewItem() {
  return `---
id: rev_joe_role
type: review_item
object_state: active
review_state: staged
review_reason: role_change
created_at: 2026-05-20T12:00:00-03:00
source_events:
  - ev_2026_05_20_001
affected_files:
  - people/joe.md
---

# Review: Joe role

## Staged claims

- claim_id: clm_joe_manager
  statement: Joe is my manager.
  claim_kind: fact
  claim_state: staged
  evidence_strength: explicit
  scope: current-work-context
  scope_state: partial
  evidence: [ev_2026_05_20_001]
  recorded_at: 2026-05-20T12:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
`;
}
