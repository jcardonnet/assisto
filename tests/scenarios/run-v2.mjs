import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "../ts-module-loader.mjs";

const thresholds = JSON.parse(await readFile("tests/golden/v2-eval-thresholds.json", "utf8"));
const fixedNow = "2026-05-21T12:00:00-03:00";

const modules = {
  ingest: await loadTsModule("packages/core/src/ingest/index.ts"),
  extraction: await loadTsModule("packages/core/src/extraction/index.ts"),
  transactions: await loadTsModule("packages/core/src/transactions/index.ts"),
  lint: await loadTsModule("packages/core/src/lint/index.ts"),
  retrieval: await loadTsModule("packages/core/src/retrieval/index.ts")
};

const metrics = {
  committedFollowupFalsePositives: 0,
  duplicatePersonFalseMerges: 0,
  unscopedActiveClaims: 0,
  unsafeProviderCanonicalWrites: 0,
  newContextAutoPromotions: 0,
  ambiguousAutoUpdates: 0,
  generatedExplanationPersistence: 0,
  brokenLinks: 0,
  retrievalCitations: 0,
  retrievalCitationOpportunities: 0
};

const notes = [
  "Joe is the DBA. We use MySQL.",
  "Today I talked with Joe about pgvector for storing CLIP embeddings of product pictures.",
  "Maybe I should ask Joe about backups.",
  "Remind me to ask Joe about the migration.",
  "Mike is my manager. He is a generalist Java developer with lots of CRM experience. He has a PhD in Statistics.",
  "How should I explain Joe and Mike the difference between Solr and Qdrant?",
  "We discussed asking Joe.",
  "Joe mentioned Solr.",
  "Qdrant came up.",
  "I started new job this monday as a AI Engineer at SmartEquip",
  ...Array.from({ length: 40 }, (_, index) => `How should I think about work memory topic ${index + 1}?`)
];

await suite("50-note deterministic v2 corpus", async () => {
  assert.equal(notes.length, 50);
  const root = await makeTempVault("eval-v2-corpus-");

  try {
    for (const [index, note] of notes.entries()) {
      const result = await modules.ingest.ingestNote(root, note, { now: addMinutes(fixedNow, index) });
      const transaction = await readTransaction(root, result.transaction_id);

      metrics.unscopedActiveClaims += countUnscopedActiveClaims(transaction);

      if (/\b(discussed|mentioned|came up)\b/i.test(note)) {
        metrics.committedFollowupFalsePositives += transaction.proposed_file_writes.filter((write) =>
          write.path.startsWith("memory/followups/")
        ).length;
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await suite("entity caution and provider boundary", async () => {
  const root = await makeTempVault("eval-v2-provider-");

  try {
    await writeVaultFile(root, "memory/people/joe-dba.md", minimalPerson("per_joe_dba", "Joe DBA"));
    await writeVaultFile(root, "memory/people/joe-sales.md", minimalPerson("per_joe_sales", "Joe Sales"));

    const ambiguous = await modules.ingest.ingestNote(root, "Joe is the DBA.", { now: fixedNow });
    const ambiguousTx = await readTransaction(root, ambiguous.transaction_id);
    metrics.duplicatePersonFalseMerges += ambiguousTx.proposed_file_writes.some(
      (write) => write.path === "memory/people/joe.md"
    )
      ? 1
      : 0;

    const provider = new modules.extraction.LlmExtractionProvider({
      extract: async () => ({
        claims: [
          {
            entity_kind: "person",
            entity_name: "Joe",
            statement: "Joe is the DBA.",
            entity_resolution: "exact_match"
          }
        ],
        entities: [{ kind: "person", name: "Joe", resolution_state: "ambiguous" }]
      })
    });
    const providerResult = await modules.extraction.ingestWithExtractionProvider(root, "Joe is the DBA.", {
      now: addMinutes(fixedNow, 1),
      provider
    });
    const providerTx = await readTransaction(root, providerResult.transaction_id);
    metrics.ambiguousAutoUpdates += providerTx.proposed_file_writes.some((write) => write.path === "memory/people/joe.md")
      ? 1
      : 0;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await suite("context staging and generated explanation boundary", async () => {
  const root = await makeTempVault("eval-v2-context-");
  const provider = new modules.extraction.LlmExtractionProvider({
    extract: async () => ({
      claims: [
        {
          entity_kind: "topic",
          entity_name: "Inventory API",
          statement: "Inventory API uses Redis.",
          scope: "New Warehouse Project",
          scope_state: "complete",
          entity_resolution: "new_entity"
        }
      ],
      explanations: [
        {
          title: "Inventory API explanation",
          body: "This generated explanation body must not persist.",
          explicit_save: false
        }
      ]
    })
  });

  try {
    const result = await modules.extraction.ingestWithExtractionProvider(root, "Inventory API uses Redis.", {
      now: fixedNow,
      provider
    });
    const txMarkdown = await readFile(path.join(root, result.transaction_path), "utf8");
    const tx = modules.transactions.parseTransactionMarkdown(txMarkdown);

    metrics.newContextAutoPromotions += tx.proposed_file_writes.some((write) => write.path === "memory/contexts/new-warehouse-project.md")
      ? 1
      : 0;
    metrics.unsafeProviderCanonicalWrites += tx.proposed_file_writes.some((write) => write.path === "memory/topics/inventory-api.md")
      ? 1
      : 0;
    metrics.generatedExplanationPersistence += /This generated explanation body must not persist/.test(txMarkdown) ? 1 : 0;
    assert.equal(tx.proposed_file_writes.some((write) => write.path.startsWith("memory/review/")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await suite("retrieval citation coverage", async () => {
  const root = await makeTempVault("eval-v2-retrieval-");

  try {
    const result = await modules.ingest.ingestNote(root, "Joe is the DBA.", { now: fixedNow });
    await modules.transactions.applyTransaction(root, result.transaction_id);
    const lint = await modules.lint.lintVault(root, { now: fixedNow });
    metrics.brokenLinks += lint.issues.filter((issue) => issue.code === "broken_link").length;

    const context = await modules.retrieval.retrieveContextForAnswer(root, "What is Joe's role?");
    const opportunities = context.pages.flatMap((page) => page.claims).length;
    const cited = context.pages
      .flatMap((page) => page.claims)
      .filter((claim) => Array.isArray(claim.fields.evidence) && claim.fields.evidence.length > 0).length;

    metrics.retrievalCitationOpportunities += opportunities;
    metrics.retrievalCitations += cited;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const citationCoverage =
  metrics.retrievalCitationOpportunities === 0
    ? 1
    : metrics.retrievalCitations / metrics.retrievalCitationOpportunities;

assertAtMost("committed follow-up false positives", metrics.committedFollowupFalsePositives, thresholds.committedFollowupFalsePositivesMax);
assertAtMost("duplicate person false merges", metrics.duplicatePersonFalseMerges, thresholds.duplicatePersonFalseMergesMax);
assertAtMost("unscoped active claims", metrics.unscopedActiveClaims, thresholds.unscopedActiveClaimsMax);
assertAtMost("unsafe provider canonical writes", metrics.unsafeProviderCanonicalWrites, thresholds.unsafeProviderCanonicalWritesMax);
assertAtMost("new context auto promotions", metrics.newContextAutoPromotions, thresholds.newContextAutoPromotionsMax);
assertAtMost("ambiguous auto updates", metrics.ambiguousAutoUpdates, thresholds.ambiguousAutoUpdatesMax);
assertAtMost("generated explanation persistence", metrics.generatedExplanationPersistence, thresholds.generatedExplanationPersistenceMax);
assertAtMost("broken links", metrics.brokenLinks, thresholds.brokenLinksMax);
assertAtLeast("retrieval citation coverage", citationCoverage, thresholds.retrievalCitationCoverageMin);

console.log(JSON.stringify({ metrics: { ...metrics, retrievalCitationCoverage: citationCoverage } }, null, 2));

async function suite(name, run) {
  await run();
  console.log(`✓ ${name}`);
}

async function makeTempVault(prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await mkdir(path.join(root, "memory", "transactions", "pending"), { recursive: true });
  return root;
}

async function readTransaction(root, id) {
  const markdown = await readFile(path.join(root, "memory", "transactions", "pending", `${id}.md`), "utf8");
  return modules.transactions.parseTransactionMarkdown(markdown);
}

async function writeVaultFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

function countUnscopedActiveClaims(transaction) {
  return transaction.proposed_file_writes.filter((write) =>
    /claim_state: active[\s\S]*scope_state: unknown|scope_state: unknown[\s\S]*claim_state: active/.test(write.content)
  ).length;
}

function minimalPerson(id, name) {
  return `---
id: ${id}
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events: []
related: []
summary_generated_from: []
---

# ${name}
`;
}

function addMinutes(iso, minutes) {
  const date = new Date(iso);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

function assertAtMost(name, actual, max) {
  assert.ok(actual <= max, `${name}: expected <= ${max}, received ${actual}`);
}

function assertAtLeast(name, actual, min) {
  assert.ok(actual >= min, `${name}: expected >= ${min}, received ${actual}`);
}
