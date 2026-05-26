import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "../ts-module-loader.mjs";

const thresholds = JSON.parse(await readFile("tests/golden/v4-eval-thresholds.json", "utf8"));
const workbench = await loadTsModule("packages/workbench/src/index.ts");

const metrics = {
  unsafeCanonicalWrites: 0,
  generatedPersistenceViolations: 0,
  autonomousSupersessions: 0,
  eventRawTextRewrites: 0,
  citationCoverage: 0,
  reviewResolutionFlow: 0,
  sessionBriefGeneration: 0,
  healthDetection: 0,
  noMatchGuidance: 0
};

const root = await makeTempVault("eval-v4-");

try {
  await writeV4Fixture(root);
  const canonicalBefore = await snapshotNonTransactionMemory(root);
  const eventBefore = await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-003.md");

  await suite("v4 workbench shell and derived ask output", async () => {
    const shell = await route("GET", "/");
    const client = await route("GET", "/assets/workbench.js");
    const ask = await jsonRoute("GET", "/api/ask?q=Who%20is%20my%20manager%3F");
    const noMatch = await jsonRoute("GET", "/api/ask?q=What%20is%20the%20Neptune%20deploy%20key%3F");

    assert.match(shell.body, /data-tab="review"/);
    assert.match(shell.body, /data-tab="briefs"/);
    assert.match(client.body, /renderAnswerBasis/);
    assert.match(client.body, /renderBrief/);

    if (ask.evidenceEvents.some((event) => event.id === "ev_2026_05_21_001")) {
      metrics.citationCoverage += 1;
    }

    if (noMatch.missingInformation.some((item) => item.code === "no_match")) {
      metrics.noMatchGuidance += 1;
    }
  });

  await suite("v4 review triage creates pending transaction only", async () => {
    const review = await jsonRoute("GET", "/api/review");
    const preview = await jsonRoute("POST", "/api/review/apply-staged/preview", {
      reviewId: "rev_mysql_scope",
      target: "memory/topics/mysql.md",
      context: "ctx_inventory_project",
      note: "Scope confirmed."
    });
    const apply = await jsonRoute("POST", "/api/review/apply-staged", {
      reviewId: "rev_mysql_scope",
      target: "memory/topics/mysql.md",
      context: "ctx_inventory_project",
      note: "Scope confirmed."
    });

    assert.equal(review.items.some((item) => item.id === "rev_mysql_scope"), true);
    assert.equal(preview.created, false);
    assert.equal(apply.created, true);
    assert.equal(apply.operations.includes("UPSERT_CLAIM"), true);

    metrics.autonomousSupersessions += apply.operations.filter((operation) => operation === "SUPERSEDE_CLAIM").length;
    metrics.unsafeCanonicalWrites += (await exists(root, "memory/topics/mysql.md")) ? 1 : 0;

    if (apply.source_events.includes("ev_2026_05_21_002")) {
      metrics.citationCoverage += 1;
    }

    if (apply.transaction_path.startsWith("memory/transactions/pending/")) {
      metrics.reviewResolutionFlow += 1;
    }
  });

  await suite("v4 stale Event reprocess preserves raw Event text", async () => {
    const reprocess = await jsonRoute("POST", "/api/events/reprocess", {
      eventId: "ev_2026_05_21_003",
      stageOnly: true
    });
    const eventAfter = await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-003.md");

    assert.equal(reprocess.created, true);
    assert.equal(reprocess.event_id, "ev_2026_05_21_003");
    metrics.eventRawTextRewrites += eventAfter === eventBefore ? 0 : 1;
  });

  await suite("v4 health and session brief remain derived", async () => {
    const health = await jsonRoute("GET", "/api/health");
    const brief = await jsonRoute("GET", "/api/brief?kind=person&target=per_jeff");

    if (health.counts.stale_noop_events === 1 && health.findings.some((finding) => finding.code === "stale_noop_event")) {
      metrics.healthDetection += 1;
    }

    if (
      brief.activeClaims.some((claim) => claim.claim_id === "clm_jeff_manager") &&
      brief.evidenceEvents.some((event) => event.id === "ev_2026_05_21_001")
    ) {
      metrics.sessionBriefGeneration += 1;
      metrics.citationCoverage += 1;
    }
  });

  const canonicalAfter = await snapshotNonTransactionMemory(root);
  metrics.generatedPersistenceViolations += snapshotsEqual(canonicalBefore, canonicalAfter) ? 0 : 1;
} finally {
  await rm(root, { recursive: true, force: true });
}

assertAtMost("unsafe canonical writes", metrics.unsafeCanonicalWrites, thresholds.unsafeCanonicalWritesMax);
assertAtMost(
  "generated persistence violations",
  metrics.generatedPersistenceViolations,
  thresholds.generatedPersistenceViolationsMax
);
assertAtMost("autonomous supersessions", metrics.autonomousSupersessions, thresholds.autonomousSupersessionsMax);
assertAtMost("Event raw text rewrites", metrics.eventRawTextRewrites, thresholds.eventRawTextRewritesMax);
assertAtLeast("citation coverage", metrics.citationCoverage, thresholds.citationCoverageMin);
assertAtLeast("review resolution flow", metrics.reviewResolutionFlow, thresholds.reviewResolutionFlowMin);
assertAtLeast("session brief generation", metrics.sessionBriefGeneration, thresholds.sessionBriefGenerationMin);
assertAtLeast("health detection", metrics.healthDetection, thresholds.healthDetectionMin);
assertAtLeast("no-match guidance", metrics.noMatchGuidance, thresholds.noMatchGuidanceMin);

console.log(JSON.stringify({ metrics }, null, 2));

async function suite(name, run) {
  await run();
  console.log(`✓ ${name}`);
}

async function route(method, url, body) {
  return workbench.handleWorkbenchRoute(root, {
    method,
    url,
    body: body ? JSON.stringify(body) : undefined
  });
}

async function jsonRoute(method, url, body) {
  const response = await route(method, url, body);

  assert.equal(response.status >= 200 && response.status < 300, true, response.body);
  return JSON.parse(response.body);
}

async function makeTempVault(prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await mkdir(path.join(root, "memory", "transactions", "pending"), { recursive: true });
  return root;
}

async function writeV4Fixture(root) {
  await writeVaultFile(root, "memory/contexts/inventory-project.md", `---
id: ctx_inventory_project
type: context
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases:
  - Inventory Project
source_events:
  - ev_2026_05_21_001
related: []
---

# Inventory Project
`);
  await writeVaultFile(root, "memory/people/jeff.md", `---
id: per_jeff
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
  - ev_2026_05_21_001
related:
  - ctx_inventory_project
summary_generated_from:
  - clm_jeff_manager
---

# Jeff

## Active claims

- claim_id: clm_jeff_manager
  statement: Jeff is my manager.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_2026_05_21_001]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`);
  await writeVaultFile(root, "memory/review/mysql-scope.md", `---
id: rev_mysql_scope
type: review_item
object_state: active
review_state: staged
review_reason: unscoped_claim
created_at: 2026-05-21T10:00:00-03:00
source_events:
  - ev_2026_05_21_002
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
  evidence: [ev_2026_05_21_002]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
`);
  await writeVaultFile(root, "memory/transactions/pending/tx_2026_05_21_001.md", `---
id: tx_2026_05_21_001
type: transaction
transaction_state: pending
created_at: 2026-05-21T10:15:00-03:00
source_events:
  - ev_2026_05_21_003
operations:
  - NOOP
affected_files:
  - events/2026/2026-05/2026-05-21-003.md
risk_level: low
requires_review: false
validation_errors: []
---

# Transaction tx_2026_05_21_001

## Intent

No durable claims were extracted from the Event.

## Proposed operations

- NOOP: no durable claims extracted
`);
  await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md", eventPage("ev_2026_05_21_001", "Jeff is my manager."));
  await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-21-002.md", eventPage("ev_2026_05_21_002", "We use MySQL."));
  await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-21-003.md", eventPage("ev_2026_05_21_003", "I started new job this monday as a AI Engineer at SmartEquip"));
}

async function snapshotNonTransactionMemory(root) {
  const files = (await walkFiles(path.join(root, "memory")))
    .map((file) => path.relative(root, file).replace(/\\/g, "/"))
    .filter((file) => file.endsWith(".md") && !file.startsWith("memory/transactions/"))
    .sort();
  const snapshot = {};

  for (const file of files) {
    snapshot[file] = await readVaultFile(root, file);
  }

  return snapshot;
}

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolutePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function writeVaultFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function readVaultFile(root, relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function exists(root, relativePath) {
  try {
    await readVaultFile(root, relativePath);
    return true;
  } catch {
    return false;
  }
}

function eventPage(id, rawText) {
  return `---
id: ${id}
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-21T09:00:00-03:00
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

function snapshotsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertAtMost(label, actual, expected) {
  assert.equal(actual <= expected, true, `${label}: expected <= ${expected}, got ${actual}`);
}

function assertAtLeast(label, actual, expected) {
  assert.equal(actual >= expected, true, `${label}: expected >= ${expected}, got ${actual}`);
}
