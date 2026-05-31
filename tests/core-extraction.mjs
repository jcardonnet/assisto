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

  const missingKey = await new extraction.OpenAiExtractionProvider({
    apiKey: "",
    model: "gpt-test"
  }).extract({ note: "Alice is the PM.", now: "2026-05-21T12:00:00-03:00" });
  assert.match(missingKey.malformed_reason, /OPENAI_API_KEY/);

  const missingModel = await new extraction.OpenAiExtractionProvider({
    apiKey: "test-key",
    model: ""
  }).extract({ note: "Alice is the PM.", now: "2026-05-21T12:00:00-03:00" });
  assert.match(missingModel.malformed_reason, /ASSISTO_OPENAI_MODEL/);

  let openAiRequest = null;
  const openAiOutput = await new extraction.OpenAiExtractionProvider({
    apiKey: "test-key",
    model: "gpt-test",
    baseUrl: "https://api.example.test/v1",
    fetch: async (url, init) => {
      openAiRequest = { url, init };

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
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
              }
            }
          ]
        }),
        text: async () => ""
      };
    }
  }).extract({ note: "Alice is the PM.", now: "2026-05-21T12:00:00-03:00" });
  assert.equal(openAiOutput.claims[0].entity_name, "Alice");
  assert.equal(openAiRequest.url, "https://api.example.test/v1/chat/completions");
  assert.equal(openAiRequest.init.headers.authorization, "Bearer test-key");
  const openAiRequestBody = JSON.parse(openAiRequest.init.body);
  assert.equal(openAiRequestBody.model, "gpt-test");
  assert.match(openAiRequestBody.messages[0].content, /candidate-only/);

  const openAiMalformed = await new extraction.OpenAiExtractionProvider({
    apiKey: "test-key",
    model: "gpt-test",
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "not json" } }]
      }),
      text: async () => ""
    })
  }).extract({ note: "Alice is the PM.", now: "2026-05-21T12:00:00-03:00" });
  assert.match(openAiMalformed.malformed_reason, /valid JSON/);

  const openAiRoot = await makeTempVault();

  try {
    const result = await extraction.ingestWithExtractionProvider(openAiRoot, "Alice is the PM.", {
      now: "2026-05-21T12:00:00-03:00",
      provider: new extraction.OpenAiExtractionProvider({
        apiKey: "test-key",
        model: "gpt-test",
        fetch: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    claims: [
                      {
                        entity_kind: "person",
                        entity_name: "Alice",
                        statement: "Alice is the PM.",
                        scope: "current-work-context",
                        scope_state: "partial",
                        entity_resolution: "new_entity"
                      }
                    ]
                  })
                }
              }
            ]
          }),
          text: async () => ""
        })
      })
    });
    const tx = transactions.parseTransactionMarkdown(await readVaultFile(openAiRoot, result.transaction_path));

    assert.equal(result.provider_name, "openai");
    assert.equal(proposedWrites(tx).some((write) => write.path === "memory/people/alice.md"), true);
    assert.match(await readVaultFile(openAiRoot, result.event_path), /Alice is the PM/);
    await expectMissing(openAiRoot, "memory/people/alice.md");
  } finally {
    await rm(openAiRoot, { recursive: true, force: true });
  }

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

  const ontologyInvalidRoot = await makeTempVault();

  try {
    const result = await extraction.ingestWithExtractionProvider(ontologyInvalidRoot, "Alice uses Redis.", {
      now: "2026-05-21T12:00:00-03:00",
      provider: mockProvider(extraction, {
        frames: [
          {
            subject_kind: "Person",
            subject_id: "per_alice",
            relation: "uses_technology",
            object_kind: "Topic",
            object_id: "top_redis",
            statement: "Alice uses Redis.",
            scope: "ctx_inventory_project",
            evidence: ["source_note"]
          }
        ]
      })
    });
    const tx = transactions.parseTransactionMarkdown(await readVaultFile(ontologyInvalidRoot, result.transaction_path));
    const content = proposedWrites(tx).map((write) => write.content).join("\n");

    assert.equal(result.deterministic_review_reasons.includes("ontology_domain_range_mismatch"), true);
    assert.equal(proposedWrites(tx).some((write) => write.path.startsWith("memory/people/")), false);
    assert.equal(proposedWrites(tx).some((write) => write.path.startsWith("memory/topics/")), false);
    assert.equal(proposedWrites(tx).every((write) => write.path.startsWith("memory/review/")), true);
    assert.match(content, /review_reason: ontology_domain_range_mismatch/);
    assert.match(content, /source_events:\n {2}- ev_2026_05_21_001/);
    assert.match(content, /relation: uses_technology/);
  } finally {
    await rm(ontologyInvalidRoot, { recursive: true, force: true });
  }

  const ontologyHighRiskRoot = await makeTempVault();

  try {
    const result = await extraction.ingestWithExtractionProvider(ontologyHighRiskRoot, "Alice now reports to Bob.", {
      now: "2026-05-21T12:00:00-03:00",
      provider: mockProvider(extraction, {
        frames: [
          {
            subject_kind: "Person",
            subject_id: "per_alice",
            relation: "reports_to",
            object_kind: "Person",
            object_id: "per_bob",
            statement: "Alice reports to Bob.",
            scope: "ctx_inventory_project",
            evidence: ["source_note"],
            change_type: "change"
          }
        ]
      })
    });
    const tx = transactions.parseTransactionMarkdown(await readVaultFile(ontologyHighRiskRoot, result.transaction_path));

    assert.equal(result.deterministic_review_reasons.includes("ontology_high_risk_relation_change"), true);
    assert.equal(proposedWrites(tx).every((write) => write.path.startsWith("memory/review/")), true);
    assert.match(proposedWrites(tx).map((write) => write.content).join("\n"), /ONTOLOGY_HIGH_RISK_RELATION_CHANGE/);
  } finally {
    await rm(ontologyHighRiskRoot, { recursive: true, force: true });
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
