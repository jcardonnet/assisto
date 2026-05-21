import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";

async function makeTempVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-lint-"));
  await mkdir(path.join(root, "memory"), { recursive: true });
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

function personPage({ id, title, aliases = [], claimId, statement, evidence }) {
  return `---
id: ${id}
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: [${aliases.join(", ")}]
source_events:
  - ${evidence}
related: []
summary_generated_from:
  - ${claimId}
---

# ${title}

## Current summary

${statement}

## Active claims

- claim_id: ${claimId}
  statement: ${statement}
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: current-work-context
  scope_state: partial
  evidence: [${evidence}]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`;
}

function claimBlock(index, statement, evidence, scope = "current-work-context", scopeState = "complete") {
  return `- claim_id: clm_topic_${index}
  statement: ${statement}
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: ${scope}
  scope_state: ${scopeState}
  evidence: [${evidence}]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null`;
}

function topicPage({
  id,
  title,
  claims,
  related = [],
  summaryGeneratedFrom = ["clm_topic_1"],
  evidence = "ev_2026_05_21_001"
}) {
  return `---
id: ${id}
type: topic
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
  - ${evidence}
related: [${related.join(", ")}]
summary_generated_from: [${summaryGeneratedFrom.join(", ")}]
---

# ${title}

## Current summary

${title} summary.

## Active claims

${claims.join("\n\n")}
`;
}

function eventPage(id) {
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

Source event.
`;
}

export async function runCoreLintTests() {
  const lint = await loadTsModule("packages/core/src/lint/index.ts");
  const root = await makeTempVault();

  try {
    await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md", eventPage("ev_2026_05_21_001"));
    await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-21-002.md", eventPage("ev_2026_05_21_002"));
    await writeVaultFile(
      root,
      "memory/people/joe.md",
      personPage({
        id: "per_joe",
        title: "Joe",
        claimId: "clm_joe_role",
        statement: "Joe is the DBA.",
        evidence: "ev_2026_05_21_001"
      })
    );
    await writeVaultFile(
      root,
      "memory/people/joseph.md",
      personPage({
        id: "per_joseph",
        title: "Joseph",
        aliases: ["Joe"],
        claimId: "clm_joseph_role",
        statement: "Joseph is the database owner.",
        evidence: "ev_2026_05_21_002"
      })
    );
    const originalJoe = await readVaultFile(root, "memory/people/joe.md");
    const bloatClaims = Array.from({ length: 8 }, (_, index) =>
      claimBlock(index + 1, `Search topic claim ${index + 1}.`, "ev_2026_05_21_001")
    );
    await writeVaultFile(
      root,
      "memory/topics/search.md",
      topicPage({
        id: "top_search",
        title: "Search",
        claims: bloatClaims,
        related: ["people/joe.md"]
      })
    );
    await writeVaultFile(
      root,
      "memory/topics/mysql.md",
      topicPage({
        id: "top_mysql",
        title: "MySQL",
        claims: [
          claimBlock(1, "We use MySQL.", "ev_2026_05_21_001"),
          claimBlock(2, "We do not use MySQL.", "ev_2026_05_21_002"),
          claimBlock(3, "We use MySQL for reporting.", "ev_2026_05_21_001", "null", "unknown")
        ],
        summaryGeneratedFrom: ["missing_claim"]
      })
    );

    const result = await lint.lintVault(root, { now: "2026-05-21T12:00:00-03:00" });
    const codes = result.issues.map((issue) => issue.code);

    assert.equal(codes.includes("duplicate_people"), true);
    assert.equal(codes.includes("unscoped_claim"), true);
    assert.equal(codes.includes("topic_bloat"), true);
    assert.equal(codes.includes("contradiction"), true);
    assert.equal(codes.includes("summary_drift"), true);
    assert.equal(result.review_items.length >= 5, true);

    for (const item of result.review_items) {
      const content = await readVaultFile(root, item.path);
      assert.match(content, /type: review_item/);
      assert.match(content, /review_state: staged/);
      assert.match(content, /No auto-merge/);
      assert.match(content, /No delete or archive/);
    }

    assert.equal(await readVaultFile(root, "memory/people/joe.md"), originalJoe);
    assert.match(await readVaultFile(root, "memory/people/joseph.md"), /object_state: active/);
    assert.match(await readVaultFile(root, "memory/topics/mysql.md"), /We do not use MySQL/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
