import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "../ts-module-loader.mjs";

const thresholds = JSON.parse(await readFile("tests/golden/mvp-eval-thresholds.json", "utf8"));
const fixedNow = "2026-05-21T12:00:00-03:00";

const modules = {
  ingest: await loadTsModule("packages/core/src/ingest/index.ts"),
  transactions: await loadTsModule("packages/core/src/transactions/index.ts"),
  policies: await loadTsModule("packages/core/src/policies/index.ts"),
  retrieval: await loadTsModule("packages/core/src/retrieval/index.ts"),
  lint: await loadTsModule("packages/core/src/lint/index.ts"),
  markdown: await loadTsModule("packages/core/src/markdown/index.ts"),
  validators: await loadTsModule("packages/core/src/validators/index.ts")
};

const metrics = {
  committedFollowupTruePositives: 0,
  committedFollowupFalsePositives: 0,
  duplicatePersonFalseMerges: 0,
  duplicatePersonOpportunities: 0,
  unscopedSystemClaimsAutoPromoted: 0,
  factualContextClaimsWithCitation: 0,
  factualContextClaimsTotal: 0,
  transactionValidationFailuresCaught: 0,
  transactionValidationFailureCases: 0,
  summaryUnsupportedClaims: 0,
  summaryClaimsChecked: 0,
  brokenLinksAfterAppliedTransactions: 0,
  linksAfterAppliedTransactions: 0
};

const suites = [];

await suite("ingestion precision benchmark", async () => {
  const root = await makeTempVault("eval-ingest-");

  try {
    const joe = await modules.ingest.ingestNote(root, "Joe is the DBA. We use MySQL.", { now: fixedNow });
    const tx = await readTransaction(root, joe.transaction_id);
    assert.deepEqual(operationNames(tx), ["UPSERT_CLAIM", "STAGE_REVIEW"]);
    assert.equal(tx.proposed_file_writes.some((write) => write.path.endsWith("memory/people/joe.md")), true);
    assert.equal(tx.proposed_file_writes.some((write) => write.path.endsWith("memory/review/unscoped-claims.md")), true);
    assert.equal(tx.proposed_file_writes.some((write) => /scope_state: unknown[\s\S]*claim_state: active/.test(write.content)), false);

    const query = await modules.ingest.ingestNote(
      root,
      "How should I explain Joe and Mike the difference between Solr and Qdrant?",
      { now: fixedNow }
    );
    const queryTx = await readTransaction(root, query.transaction_id);
    assert.deepEqual(operationNames(queryTx), ["NOOP"]);
    assert.equal(queryTx.proposed_file_writes.length, 0);

    await modules.transactions.applyTransaction(root, joe.transaction_id);
    const postApplyLint = await modules.lint.lintVault(root, { now: fixedNow });
    metrics.brokenLinksAfterAppliedTransactions += postApplyLint.issues.filter((issue) => issue.code === "broken_link").length;
    metrics.linksAfterAppliedTransactions += await countWikilinks(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await suite("source-event granularity A/B", async () => {
  const oneFactRoot = await makeTempVault("eval-event-a-");
  const twoFactRoot = await makeTempVault("eval-event-b-");

  try {
    const one = await modules.ingest.ingestNote(oneFactRoot, "Joe is the DBA.", { now: fixedNow });
    const two = await modules.ingest.ingestNote(twoFactRoot, "Joe is the DBA. We use MySQL.", { now: fixedNow });
    const oneEvent = await readVaultFile(oneFactRoot, one.event_path);
    const twoEvent = await readVaultFile(twoFactRoot, two.event_path);

    assert.match(oneEvent, /Joe is the DBA\./);
    assert.match(twoEvent, /Joe is the DBA\. We use MySQL\./);
    assert.match(twoEvent, /clm_joe_role_dba/);
    assert.match(twoEvent, /clm_mysql_used_unknown_scope/);
    assert.equal((oneEvent.match(/^## Raw text$/gm) ?? []).length, 1);
    assert.equal((twoEvent.match(/^## Raw text$/gm) ?? []).length, 1);
  } finally {
    await rm(oneFactRoot, { recursive: true, force: true });
    await rm(twoFactRoot, { recursive: true, force: true });
  }
});

await suite("follow-up extraction stress test", async () => {
  const cases = [
    ["Remind me to ask Joe", true],
    ["I need to send Mike the numbers", true],
    ["I have to review the migration plan", true],
    ["I will ask Joe about backups", true],
    ["I'll ask Mike tomorrow", true],
    ["Please track the Qdrant decision", true],
    ["Add a follow-up to call Joe", true],
    ["Joe asked me to send him the numbers", true],
    ["Due by Friday: send the report", true],
    ["By Friday I need to explain Solr", true],
    ["We discussed asking Joe", false],
    ["Today I talked about Qdrant", false],
    ["Joe mentioned backups", false],
    ["Mike cares about clarity", false],
    ["The MySQL migration came up", false],
    ["We talked with Joe about Solr", false],
    ["Maybe I should ask Joe", false],
    ["We should probably revisit Solr", false],
    ["It might be worth asking Mike", false],
    ["Could follow up on the migration", false]
  ];

  for (const [note, expectedCommitted] of cases) {
    const result = modules.policies.classifyFollowUpIntent(note);

    if (result.intent === "committed" && expectedCommitted) {
      metrics.committedFollowupTruePositives += 1;
    }

    if (result.intent === "committed" && !expectedCommitted) {
      metrics.committedFollowupFalsePositives += 1;
    }
  }

  assert.equal(metrics.committedFollowupFalsePositives, 0);
});

await suite("entity resolution torture test", async () => {
  const candidates = [
    { id: "per_joe_dba", name: "Joe", contextHints: ["DBA"] },
    { id: "per_joe_sales", name: "Joe", contextHints: ["sales"] },
    { id: "per_mike", name: "Mike", aliases: ["Michael"] }
  ];
  const ambiguity = modules.policies.resolveEntityReference("Joe", candidates);
  const nearMatch = modules.policies.resolveEntityReference("Joey", [{ id: "per_joe", name: "Joe" }]);

  metrics.duplicatePersonOpportunities += 2;
  assert.equal(ambiguity.state, "ambiguous");
  assert.equal(nearMatch.state, "near_match");
  assert.notEqual(ambiguity.state, "exact_match");
  assert.notEqual(nearMatch.state, "exact_match");
});

await suite("temporal supersession test", async () => {
  const root = await makeTempVault("eval-temporal-");

  try {
    await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md", eventPage("ev_temporal_001", "Joe is the DBA."));
    await writeVaultFile(
      root,
      "memory/people/joe.md",
      personPage({
        id: "per_joe",
        title: "Joe",
        sourceEvents: ["ev_temporal_001"],
        claims: [
          claimBlock("clm_joe_dba_old", "Joe is the DBA.", "superseded", "fact", "explicit", "current-work-context", "partial", ["ev_temporal_001"], "2026-01-01", "2026-05-01"),
          claimBlock("clm_joe_dba_current", "Joe is the DBA.", "active", "fact", "explicit", "current-work-context", "partial", ["ev_temporal_001"], "2026-05-01", null)
        ],
        summaryGeneratedFrom: ["clm_joe_dba_current"]
      })
    );
    const result = await modules.retrieval.retrieveContextForAnswer(root, "What is Joe role?");

    assert.match(result.contextPack, /Joe is the DBA/);
    assert.match(result.contextPack, /#### Active claims[\s\S]*Joe is the DBA[\s\S]*#### Non-active or uncertain claims[\s\S]*claim_state=superseded/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await suite("summary drift test", async () => {
  const root = await makeTempVault("eval-summary-");

  try {
    await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md", eventPage("ev_summary_001", "Solr is a search platform."));
    await writeVaultFile(
      root,
      "memory/topics/solr.md",
      topicPage({
        id: "top_solr",
        title: "Solr",
        sourceEvents: ["ev_summary_001"],
        claims: [claimBlock("clm_solr_search", "Solr is a search platform.", "active", "fact", "explicit", "current-work-context", "complete", ["ev_summary_001"])],
        summaryGeneratedFrom: ["clm_solr_search"]
      })
    );

    const lintResult = await modules.lint.lintVault(root, { now: fixedNow });
    assert.equal(lintResult.issues.some((issue) => issue.code === "summary_drift"), false);
    metrics.summaryClaimsChecked += 1;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await suite("review backlog simulation", async () => {
  const root = await makeTempVault("eval-backlog-");

  try {
    for (let index = 0; index < 11; index += 1) {
      await writeVaultFile(root, `memory/review/item-${index}.md`, reviewItemPage(`rev_existing_${index}`, "existing_review", [`topics/topic-${index}.md`]));
    }

    const lintResult = await modules.lint.lintVault(root, { now: fixedNow, reviewBacklogThreshold: 10 });
    assert.equal(lintResult.issues.some((issue) => issue.code === "review_backlog_growth"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await suite("retrieval context packing test", async () => {
  const root = await makeTempVault("eval-retrieval-");

  try {
    await writeRetrievalFixture(root);
    const result = await modules.retrieval.retrieveContextForAnswer(
      root,
      "How should I explain Joe and Mike the difference between Solr and Qdrant?"
    );

    for (const pathSuffix of ["people/joe.md", "people/mike.md", "topics/solr.md", "topics/qdrant.md"]) {
      assert.match(result.contextPack, new RegExp(escapeRegExp(pathSuffix)));
    }

    assert.doesNotMatch(result.contextPack, /Payroll/);
    assert.match(result.contextPack, /uncertain:/);
    collectSourceCitationMetric(result);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await suite("markdown noise endurance test", async () => {
  const root = await makeTempVault("eval-noise-");

  try {
    await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md", eventPage("ev_noise_001", "Noisy source."));
    await writeVaultFile(
      root,
      "memory/topics/noisy.md",
      `---
id: top_noisy
type: topic
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
  - ev_noise_001
related: []
summary_generated_from:
  - clm_noise_001
---

# Noisy

Intro text with [[events/2026/2026-05/2026-05-21-001]] and odd spacing.

## Active claims

- claim_id: clm_noise_001
  statement: Noisy markdown still parses.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: current-work-context
  scope_state: complete
  evidence: [ev_noise_001]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null

> quoted block

- unrelated bullet
`
    );

    const lintResult = await modules.lint.lintVault(root, { now: fixedNow });
    assert.equal(lintResult.issues.some((issue) => issue.code === "broken_link"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await suite("multi-file rollback test", async () => {
  const root = await makeTempVault("eval-rollback-");

  try {
    await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md", eventPage("ev_rollback_001", "Joe is the DBA."));
    const invalidTransaction = modules.transactions.createTransactionDraft({
      id: "tx_invalid_eval",
      created_at: fixedNow,
      source_events: ["ev_rollback_001"],
      operations: ["UPSERT_CLAIM"],
      affected_files: ["people/joe.md"],
      rollback_notes: "Preserve Event and repair manually.",
      proposed_file_writes: [
        {
          path: "memory/people/joe.md",
          content: personPage({
            id: "per_joe",
            title: "Joe",
            sourceEvents: ["ev_rollback_001"],
            claims: [claimBlock("clm_joe_invalid", "Joe is the DBA.", "active", "fact", "explicit", "current-work-context", "partial", [])],
            summaryGeneratedFrom: ["clm_joe_invalid"]
          })
        }
      ]
    });

    await writeVaultFile(
      root,
      "memory/transactions/pending/tx_invalid_eval.md",
      modules.transactions.serializeTransactionMarkdown(invalidTransaction)
    );

    metrics.transactionValidationFailureCases += 1;
    const validation = await modules.transactions.validateTransaction(root, invalidTransaction);

    if (!validation.passed) {
      metrics.transactionValidationFailuresCaught += 1;
    }

    await assert.rejects(() => modules.transactions.applyTransaction(root, "tx_invalid_eval"));
    await assert.rejects(() => readVaultFile(root, "memory/people/joe.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const thresholdResults = evaluateThresholds(metrics, thresholds);

for (const result of thresholdResults) {
  assert.equal(result.passed, true, `${result.name} failed: ${result.actual} ${result.operator} ${result.expected}`);
}

printReport(suites, metrics, thresholdResults);

async function suite(name, run) {
  const startedAt = Date.now();
  await run();
  suites.push({ name, durationMs: Date.now() - startedAt });
}

function evaluateThresholds(values, golden) {
  const committedPredictions =
    values.committedFollowupTruePositives + values.committedFollowupFalsePositives;
  const committedFollowupPrecision = committedPredictions === 0 ? 1 : values.committedFollowupTruePositives / committedPredictions;
  const duplicatePersonFalseMergeRate =
    values.duplicatePersonOpportunities === 0 ? 0 : values.duplicatePersonFalseMerges / values.duplicatePersonOpportunities;
  const sourceCitationCoverage =
    values.factualContextClaimsTotal === 0 ? 1 : values.factualContextClaimsWithCitation / values.factualContextClaimsTotal;
  const transactionValidationFailureCaughtBeforeWrite =
    values.transactionValidationFailureCases === 0
      ? 1
      : values.transactionValidationFailuresCaught / values.transactionValidationFailureCases;
  const summaryUnsupportedClaimRate =
    values.summaryClaimsChecked === 0 ? 0 : values.summaryUnsupportedClaims / values.summaryClaimsChecked;
  const brokenLinkRate =
    values.linksAfterAppliedTransactions === 0
      ? 0
      : values.brokenLinksAfterAppliedTransactions / values.linksAfterAppliedTransactions;

  return [
    passAtLeast("committed follow-up precision", committedFollowupPrecision, golden.committedFollowupPrecisionMin),
    passAtMost("duplicate-person false merge rate", duplicatePersonFalseMergeRate, golden.duplicatePersonFalseMergeRateMax),
    passAtMost("unscoped system claims auto-promoted", values.unscopedSystemClaimsAutoPromoted, golden.unscopedSystemClaimsAutoPromotedMax),
    passAtLeast("source citation coverage for factual context packs", sourceCitationCoverage, golden.sourceCitationCoverageMin),
    passAtLeast(
      "transaction validation failure caught before write",
      transactionValidationFailureCaughtBeforeWrite,
      golden.transactionValidationFailureCaughtBeforeWriteMin
    ),
    passAtMost("summary unsupported-claim rate", summaryUnsupportedClaimRate, golden.summaryUnsupportedClaimRateMax),
    passAtMost("broken-link rate after applied transactions", brokenLinkRate, golden.brokenLinkRateAfterAppliedTransactionsMax)
  ];
}

function passAtLeast(name, actual, expected) {
  return { name, actual, expected, operator: ">=", passed: actual >= expected };
}

function passAtMost(name, actual, expected) {
  return { name, actual, expected, operator: "<=", passed: actual <= expected };
}

function printReport(suiteResults, values, thresholdResults) {
  console.log("MVP eval passed");
  console.log("");
  console.log("Scenario suites:");

  for (const result of suiteResults) {
    console.log(`- ${result.name} (${result.durationMs} ms)`);
  }

  console.log("");
  console.log("Thresholds:");

  for (const result of thresholdResults) {
    console.log(`- ${result.name}: ${formatNumber(result.actual)} ${result.operator} ${formatNumber(result.expected)}`);
  }

  console.log("");
  console.log("Raw counters:");
  console.log(JSON.stringify(values, null, 2));
}

async function makeTempVault(prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await mkdir(path.join(root, "memory", "transactions", "pending"), { recursive: true });
  return root;
}

async function readTransaction(root, id) {
  const content = await readVaultFile(root, `memory/transactions/pending/${id}.md`);
  return modules.transactions.parseTransactionMarkdown(content);
}

async function readVaultFile(root, relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function writeVaultFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

async function countWikilinks(root) {
  const files = await listMarkdownFilesOnDisk(path.join(root, "memory"));
  let count = 0;

  for (const file of files) {
    const content = await readFile(file, "utf8");
    count += modules.markdown.parseWikilinks(content).length;
  }

  return count;
}

async function listMarkdownFilesOnDisk(directory) {
  let entries = [];

  try {
    entries = await import("node:fs/promises").then((fs) => fs.readdir(directory, { withFileTypes: true }));
  } catch {
    return [];
  }

  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFilesOnDisk(absolutePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(absolutePath);
    }
  }

  return files;
}

function operationNames(transaction) {
  return transaction.operations.map((operation) => operation.operation);
}

function collectSourceCitationMetric(result) {
  for (const page of result.pages) {
    const factualClaims = page.claims.filter((claim) => claim.fields.claim_state === "active" && claim.fields.claim_kind === "fact");

    for (const claim of factualClaims) {
      metrics.factualContextClaimsTotal += 1;

      if (Array.isArray(claim.fields.evidence) && claim.fields.evidence.length > 0) {
        metrics.factualContextClaimsWithCitation += 1;
      }
    }
  }
}

async function writeRetrievalFixture(root) {
  await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md", eventPage("ev_retrieval_001", "Joe works with search."));
  await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-21-002.md", eventPage("ev_retrieval_002", "Mike manages the work."));
  await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-21-003.md", eventPage("ev_retrieval_003", "Solr is search."));
  await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-21-004.md", eventPage("ev_retrieval_004", "Qdrant is a vector database."));
  await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-21-999.md", eventPage("ev_retrieval_999", "Payroll meeting."));
  await writeVaultFile(
    root,
    "memory/people/joe.md",
    personPage({
      id: "per_joe",
      title: "Joe",
      sourceEvents: ["ev_retrieval_001"],
      claims: [claimBlock("clm_joe_search", "Joe works with search infrastructure.", "active", "fact", "explicit", "current-work-context", "partial", ["ev_retrieval_001"])],
      summaryGeneratedFrom: ["clm_joe_search"]
    })
  );
  await writeVaultFile(
    root,
    "memory/people/mike.md",
    personPage({
      id: "per_mike",
      title: "Mike",
      sourceEvents: ["ev_retrieval_002"],
      claims: [claimBlock("clm_mike_manager", "Mike is my manager.", "active", "fact", "explicit", "current-work-context", "partial", ["ev_retrieval_002"])],
      summaryGeneratedFrom: ["clm_mike_manager"]
    })
  );
  await writeVaultFile(
    root,
    "memory/topics/solr.md",
    topicPage({
      id: "top_solr",
      title: "Solr",
      sourceEvents: ["ev_retrieval_003"],
      claims: [claimBlock("clm_solr_search", "Solr is a search platform.", "active", "fact", "explicit", "current-work-context", "complete", ["ev_retrieval_003"])],
      summaryGeneratedFrom: ["clm_solr_search"]
    })
  );
  await writeVaultFile(
    root,
    "memory/topics/qdrant.md",
    topicPage({
      id: "top_qdrant",
      title: "Qdrant",
      reviewState: "contested",
      sourceEvents: ["ev_retrieval_004"],
      claims: [claimBlock("clm_qdrant_vector", "Qdrant is a vector database.", "staged", "fact", "explicit", "current-work-context", "unknown", ["ev_retrieval_004"])],
      summaryGeneratedFrom: []
    })
  );
}

function eventPage(id, rawText) {
  return `---
id: ${id}
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-21T10:00:00-03:00
observed_at: 2026-05-21
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

function personPage({ id, title, sourceEvents, claims, summaryGeneratedFrom }) {
  return `---
id: ${id}
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
${sourceEvents.map((eventId) => `  - ${eventId}`).join("\n")}
related: []
summary_generated_from:
${summaryGeneratedFrom.map((claimId) => `  - ${claimId}`).join("\n")}
---

# ${title}

## Current summary

${claims[0]?.statement ?? ""}

## Active claims

${claims.filter((claim) => claim.claim_state === "active").map(renderClaimBlock).join("\n\n")}

## Superseded claims

${claims.filter((claim) => claim.claim_state === "superseded").map(renderClaimBlock).join("\n\n")}
`;
}

function topicPage({ id, title, sourceEvents, claims, summaryGeneratedFrom, reviewState = "reviewed" }) {
  return `---
id: ${id}
type: topic
object_state: active
review_state: ${reviewState}
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
${sourceEvents.map((eventId) => `  - ${eventId}`).join("\n")}
related: []
summary_generated_from:
${summaryGeneratedFrom.map((claimId) => `  - ${claimId}`).join("\n")}
---

# ${title}

## Current summary

${claims[0]?.statement ?? ""}

## Active claims

${claims.filter((claim) => claim.claim_state === "active").map(renderClaimBlock).join("\n\n")}

## Staged claims

${claims.filter((claim) => claim.claim_state === "staged").map(renderClaimBlock).join("\n\n")}
`;
}

function reviewItemPage(id, reason, affectedFiles) {
  return `---
id: ${id}
type: review_item
object_state: active
review_state: staged
review_reason: ${reason}
created_at: 2026-05-21T10:00:00-03:00
source_events: []
affected_files:
${affectedFiles.map((file) => `  - ${file}`).join("\n")}
---

# Review ${id}
`;
}

function claimBlock(
  claim_id,
  statement,
  claim_state,
  claim_kind,
  evidence_strength,
  scope,
  scope_state,
  evidence,
  valid_from = null,
  valid_to = null
) {
  return {
    claim_id,
    statement,
    claim_state,
    claim_kind,
    evidence_strength,
    scope,
    scope_state,
    evidence,
    recorded_at: "2026-05-21T10:00:00-03:00",
    observed_at: "2026-05-21",
    valid_from,
    valid_to
  };
}

function renderClaimBlock(claim) {
  if (claim.scope_state === "unknown" && claim.claim_state === "active") {
    metrics.unscopedSystemClaimsAutoPromoted += 1;
  }

  return [
    `- claim_id: ${claim.claim_id}`,
    `  statement: ${claim.statement}`,
    `  claim_kind: ${claim.claim_kind}`,
    `  claim_state: ${claim.claim_state}`,
    `  evidence_strength: ${claim.evidence_strength}`,
    `  scope: ${claim.scope ?? "null"}`,
    `  scope_state: ${claim.scope_state}`,
    `  evidence: [${claim.evidence.join(", ")}]`,
    `  recorded_at: ${claim.recorded_at}`,
    `  observed_at: ${claim.observed_at}`,
    `  valid_from: ${claim.valid_from ?? "null"}`,
    `  valid_to: ${claim.valid_to ?? "null"}`
  ].join("\n");
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
