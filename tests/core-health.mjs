import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";

async function makeTempVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-health-"));
  await mkdir(path.join(root, "memory", "transactions", "pending"), { recursive: true });
  return root;
}

async function writeVaultFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

async function readVaultFile(root, relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

export async function runCoreHealthTests() {
  const health = await loadTsModule("packages/core/src/health/index.ts");
  const root = await makeTempVault();

  try {
    await writeHealthFixture(root);
    const beforeTopic = await readVaultFile(root, "memory/topics/mysql.md");
    const result = await health.checkMemoryHealth(root, {
      now: "2026-05-26T12:00:00.000Z",
      retrievalNoMatchQueries: ["What is the Neptune deploy key?"]
    });

    assert.equal(result.counts.staged_review_items, 1);
    assert.equal(result.counts.pending_transactions, 2);
    assert.equal(result.counts.stale_noop_events, 1);
    assert.equal(result.counts.superseded_claims, 1);
    assert.equal(result.counts.contested_claims, 1);
    assert.equal(result.counts.orphan_pages, 1);
    assert.equal(result.counts.pages_missing_source_events, 1);
    assert.equal(result.counts.retrieval_no_match_hotspots, 1);
    assert.equal(result.review_reasons.some((reason) => reason.review_reason === "role_change"), true);
    assert.equal(result.findings.some((finding) => finding.code === "stale_noop_event"), true);
    assert.equal(result.findings.some((finding) => finding.code === "missing_source_event"), true);
    assert.equal(result.findings.some((finding) => finding.suggested_action.includes("manual")), true);
    assert.equal(await readVaultFile(root, "memory/topics/mysql.md"), beforeTopic);

    const staged = await health.createHealthReviewTransaction(root, result, {
      now: "2026-05-26T12:00:00.000Z",
      note: "Health center manual stage."
    });
    const transaction = await readVaultFile(root, staged.transaction_path);

    assert.equal(staged.transaction_id, "tx_2026_05_26_001");
    assert.match(transaction, /STAGE_REVIEW/);
    assert.match(transaction, /health-stale_noop_event/);
    assert.match(transaction, /Health center manual stage/);
    await assert.rejects(() => readVaultFile(root, "memory/review/health-stale_noop_event.md"));
    assert.equal(await readVaultFile(root, "memory/topics/mysql.md"), beforeTopic);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function writeHealthFixture(root) {
  await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md", eventPage("ev_health_001", "We use MySQL."));
  await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-20-002.md", eventPage("ev_noop_old", "No durable memory here."));
  await writeVaultFile(root, "memory/review/joe-role.md", `---
id: rev_joe_role
type: review_item
object_state: active
review_state: staged
review_reason: role_change
created_at: 2026-05-20T12:00:00.000Z
source_events:
  - ev_health_001
affected_files:
  - people/joe.md
---

# Review: Joe role
`);
  await writeVaultFile(root, "memory/transactions/pending/tx_2026_05_20_001.md", transactionPage("tx_2026_05_20_001", ["NOOP"], ["ev_noop_old"], ["events/2026/2026-05/2026-05-20-002.md"]));
  await writeVaultFile(root, "memory/transactions/pending/tx_2026_05_20_002.md", transactionPage("tx_2026_05_20_002", ["STAGE_REVIEW"], ["ev_health_001"], ["review/joe-role.md"]));
  await writeVaultFile(root, "memory/topics/mysql.md", topicPage({
    id: "top_mysql",
    reviewState: "contested",
    sourceEvents: ["ev_health_001"],
    claims: [
      claimBlock("clm_mysql_active", "We use MySQL.", "active", "ev_health_001"),
      claimBlock("clm_mysql_old", "We used MySQL only for reporting.", "superseded", "ev_health_001")
    ]
  }));
  await writeVaultFile(root, "memory/topics/orphan.md", topicPage({
    id: "top_orphan",
    reviewState: "reviewed",
    sourceEvents: [],
    claims: [claimBlock("clm_orphan", "Orphan topic exists.", "active", "ev_health_001")]
  }));
  await writeVaultFile(root, "memory/people/missing-evidence.md", topicPage({
    id: "per_missing_evidence",
    type: "person",
    reviewState: "reviewed",
    sourceEvents: ["ev_missing"],
    claims: [claimBlock("clm_missing_evidence", "Missing Evidence owns the service.", "active", "ev_missing")]
  }));
}

function eventPage(id, rawText) {
  return `---
id: ${id}
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-20T12:00:00.000Z
observed_at: 2026-05-20
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

function transactionPage(id, operations, sourceEvents, affectedFiles) {
  return `---
id: ${id}
type: transaction
transaction_state: pending
created_at: 2026-05-20T12:00:00.000Z
source_events:
${sourceEvents.map((eventId) => `  - ${eventId}`).join("\n")}
operations:
${operations.map((operation) => `  - ${operation}`).join("\n")}
affected_files:
${affectedFiles.map((file) => `  - ${file}`).join("\n")}
risk_level: low
requires_review: false
validation_errors: []
---

# Transaction ${id}

## Intent

Health fixture transaction.

## Proposed operations

${operations.map((operation) => `- ${operation}`).join("\n")}

## Rollback / repair notes

Preserve source Events.
`;
}

function topicPage({ id, type = "topic", reviewState, sourceEvents, claims }) {
  return `---
id: ${id}
type: ${type}
object_state: active
review_state: ${reviewState}
created_at: 2026-05-20T12:00:00.000Z
updated_at: 2026-05-20T12:00:00.000Z
aliases: []
source_events:
${sourceEvents.length ? sourceEvents.map((eventId) => `  - ${eventId}`).join("\n") : "  []"}
related: []
summary_generated_from:
  - ${claims[0].id}
---

# ${id}

## Active claims

${claims.map((claim) => claim.block).join("\n\n")}
`;
}

function claimBlock(id, statement, state, evidence) {
  return {
    id,
    block: `- claim_id: ${id}
  statement: ${statement}
  claim_kind: fact
  claim_state: ${state}
  evidence_strength: explicit
  scope: current-work-context
  scope_state: complete
  evidence: [${evidence}]
  recorded_at: 2026-05-20T12:00:00.000Z
  observed_at: 2026-05-20
  valid_from: null
  valid_to: null`
  };
}
