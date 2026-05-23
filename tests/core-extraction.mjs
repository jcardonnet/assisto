import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";

async function makeTempVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-extraction-"));
  await mkdir(path.join(root, "memory", "transactions", "pending"), { recursive: true });
  return root;
}

async function readVaultFile(root, relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function expectMissing(root, relativePath) {
  await assert.rejects(() => readVaultFile(root, relativePath));
}

async function writeVaultFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

function mockProvider(extraction, output) {
  return new extraction.LlmExtractionProvider({
    extract: async () => output
  });
}

function proposedWrites(transaction) {
  return transaction.proposed_file_writes;
}

export async function runCoreExtractionTests() {
  const extraction = await loadTsModule("packages/core/src/extraction/index.ts");
  const transactions = await loadTsModule("packages/core/src/transactions/index.ts");

  const followupRoot = await makeTempVault();

  try {
    const result = await extraction.ingestWithExtractionProvider(followupRoot, "We discussed asking Joe", {
      now: "2026-05-21T12:00:00-03:00",
      provider: mockProvider(extraction, {
        followups: [{ action: "ask Joe", followup_state: "committed" }]
      })
    });
    const tx = transactions.parseTransactionMarkdown(await readVaultFile(followupRoot, result.transaction_path));

    assert.equal(result.provider_name, "llm");
    assert.equal(result.deterministic_review_reasons.includes("llm_followup_rejected"), true);
    assert.equal(proposedWrites(tx).some((write) => write.path.startsWith("memory/followups/")), false);
    assert.equal(proposedWrites(tx).some((write) => write.path.startsWith("memory/review/")), true);
  } finally {
    await rm(followupRoot, { recursive: true, force: true });
  }

  const unscopedRoot = await makeTempVault();

  try {
    const result = await extraction.ingestWithExtractionProvider(unscopedRoot, "We use MySQL.", {
      now: "2026-05-21T12:00:00-03:00",
      provider: mockProvider(extraction, {
        claims: [
          {
            entity_kind: "system",
            entity_name: "MySQL",
            statement: "We use MySQL.",
            claim_kind: "fact",
            evidence_strength: "explicit",
            scope: null,
            scope_state: "unknown",
            entity_resolution: "new_entity"
          }
        ]
      })
    });
    const tx = transactions.parseTransactionMarkdown(await readVaultFile(unscopedRoot, result.transaction_path));

    assert.equal(proposedWrites(tx).some((write) => write.path === "memory/topics/mysql.md"), false);
    assert.match(proposedWrites(tx).map((write) => write.content).join("\n"), /review_reason: unscoped_claim/);
  } finally {
    await rm(unscopedRoot, { recursive: true, force: true });
  }

  const ambiguousRoot = await makeTempVault();

  try {
    const result = await extraction.ingestWithExtractionProvider(ambiguousRoot, "Joe is the DBA.", {
      now: "2026-05-21T12:00:00-03:00",
      provider: mockProvider(extraction, {
        entities: [{ kind: "person", name: "Joe", resolution_state: "ambiguous", candidates: ["per_joe_dba", "per_joe_sales"] }],
        claims: [
          {
            entity_kind: "person",
            entity_name: "Joe",
            statement: "Joe is the DBA.",
            claim_kind: "fact",
            evidence_strength: "explicit",
            scope: "current-work-context",
            scope_state: "partial",
            entity_resolution: "ambiguous"
          }
        ]
      })
    });
    const tx = transactions.parseTransactionMarkdown(await readVaultFile(ambiguousRoot, result.transaction_path));

    assert.equal(result.deterministic_review_reasons.includes("llm_entity_resolution_staged"), true);
    assert.equal(proposedWrites(tx).some((write) => write.path === "memory/people/joe.md"), false);
    assert.match(proposedWrites(tx).map((write) => write.content).join("\n"), /ambiguous entity resolution/);
  } finally {
    await rm(ambiguousRoot, { recursive: true, force: true });
  }

  const explanationRoot = await makeTempVault();

  try {
    const result = await extraction.ingestWithExtractionProvider(explanationRoot, "How should I explain Solr and Qdrant?", {
      now: "2026-05-21T12:00:00-03:00",
      provider: mockProvider(extraction, {
        explanations: [
          {
            title: "Solr versus Qdrant",
            body: "This generated explanation should never be persisted without explicit save.",
            explicit_save: false
          }
        ]
      })
    });
    const txMarkdown = await readVaultFile(explanationRoot, result.transaction_path);

    assert.equal(result.deterministic_review_reasons.includes("llm_explanation_not_persisted"), true);
    assert.doesNotMatch(txMarkdown, /This generated explanation should never be persisted/);
    assert.match(txMarkdown, /Generated explanation "Solr versus Qdrant" was omitted/);
  } finally {
    await rm(explanationRoot, { recursive: true, force: true });
  }

  const personRoot = await makeTempVault();

  try {
    const result = await extraction.ingestWithExtractionProvider(personRoot, "Alice is the PM.", {
      now: "2026-05-21T12:00:00-03:00",
      provider: mockProvider(extraction, {
        claims: [
          {
            entity_kind: "person",
            entity_name: "Alice",
            statement: "Alice is the PM.",
            claim_kind: "fact",
            evidence_strength: "explicit",
            scope: "current-work-context",
            scope_state: "partial",
            entity_resolution: "new_entity"
          }
        ]
      })
    });
    const tx = transactions.parseTransactionMarkdown(await readVaultFile(personRoot, result.transaction_path));
    const validation = await transactions.validateTransaction(personRoot, tx);
    const aliceWrite = proposedWrites(tx).find((write) => write.path === "memory/people/alice.md");

    assert.equal(result.deterministic_review_reasons.length, 0);
    assert.equal(validation.passed, true);
    assert.ok(aliceWrite);
    assert.match(aliceWrite.content, /Alice is the PM\./);
    assert.match(aliceWrite.content, /evidence: \[ev_2026_05_21_001\]/);
    await expectMissing(personRoot, "memory/people/alice.md");
  } finally {
    await rm(personRoot, { recursive: true, force: true });
  }

  const contextRoot = await makeTempVault();

  try {
    await writeVaultFile(
      contextRoot,
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
source_events: []
related: []
---

# Inventory Project
`
    );
    const result = await extraction.ingestWithExtractionProvider(contextRoot, "Inventory API uses Redis.", {
      now: "2026-05-21T12:00:00-03:00",
      provider: mockProvider(extraction, {
        claims: [
          {
            entity_kind: "topic",
            entity_name: "Inventory API",
            statement: "Inventory API uses Redis.",
            scope: "Warehouse Project",
            scope_state: "complete",
            entity_resolution: "new_entity"
          }
        ]
      })
    });
    const tx = transactions.parseTransactionMarkdown(await readVaultFile(contextRoot, result.transaction_path));
    const topicWrite = proposedWrites(tx).find((write) => write.path === "memory/topics/inventory-api.md");

    assert.ok(topicWrite);
    assert.match(topicWrite.content, /scope: ctx_inventory_project/);
    assert.equal(proposedWrites(tx).some((write) => write.path.startsWith("memory/review/")), false);
  } finally {
    await rm(contextRoot, { recursive: true, force: true });
  }

  const newContextRoot = await makeTempVault();

  try {
    const result = await extraction.ingestWithExtractionProvider(newContextRoot, "Inventory API uses Redis.", {
      now: "2026-05-21T12:00:00-03:00",
      provider: mockProvider(extraction, {
        claims: [
          {
            entity_kind: "topic",
            entity_name: "Inventory API",
            statement: "Inventory API uses Redis.",
            scope: "New Warehouse Project",
            scope_state: "complete",
            entity_resolution: "new_entity"
          }
        ]
      })
    });
    const tx = transactions.parseTransactionMarkdown(await readVaultFile(newContextRoot, result.transaction_path));

    assert.equal(proposedWrites(tx).some((write) => write.path === "memory/topics/inventory-api.md"), false);
    assert.equal(proposedWrites(tx).some((write) => write.path === "memory/contexts/new-warehouse-project.md"), false);
    assert.match(proposedWrites(tx).map((write) => write.content).join("\n"), /review_reason: context_scope_new/);
  } finally {
    await rm(newContextRoot, { recursive: true, force: true });
  }

  const malformedRoot = await makeTempVault();

  try {
    const result = await extraction.ingestWithExtractionProvider(malformedRoot, "Joe is the DBA.", {
      now: "2026-05-21T12:00:00-03:00",
      provider: mockProvider(extraction, "not an object")
    });
    const tx = transactions.parseTransactionMarkdown(await readVaultFile(malformedRoot, result.transaction_path));

    assert.equal(result.deterministic_review_reasons.includes("llm_output_malformed"), true);
    assert.equal(proposedWrites(tx).some((write) => write.path.startsWith("memory/review/")), true);
    assert.match(await readVaultFile(malformedRoot, result.event_path), /Joe is the DBA/);
  } finally {
    await rm(malformedRoot, { recursive: true, force: true });
  }
}
