import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rm } from "node:fs/promises";
import path from "node:path";
import { makeTempVault, readVaultFile, writeVaultFile } from "./helpers/temp-vault.mjs";

const execFileAsync = promisify(execFile);
const wmBin = path.resolve("packages/cli/bin/wm.mjs");

async function runWm(root, args) {
  const result = await execFileAsync(process.execPath, [wmBin, "--root", root, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      COREPACK_HOME: process.env.COREPACK_HOME ?? "/tmp/corepack",
      LOCALAPPDATA: process.env.LOCALAPPDATA ?? "/tmp",
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? "/tmp",
      TMPDIR: process.env.TMPDIR ?? "/tmp",
      TEMP: process.env.TEMP ?? "/tmp",
      TMP: process.env.TMP ?? "/tmp"
    }
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}

async function expectMissing(root, relativePath) {
  await assert.rejects(() => readVaultFile(root, relativePath));
}

async function runCliWorkflowE2e() {
  const root = await makeTempVault("assisto-e2e-cli-");

  try {
    const ingest = await runWm(root, ["ingest", "Joe is the DBA. We use MySQL."]);
    assert.match(ingest.stdout, /Pending transaction: tx_2026_05_20_001/);

    const show = await runWm(root, ["tx", "show", "tx_2026_05_20_001"]);
    assert.match(show.stdout, /path=memory\/people\/joe\.md/);
    assert.match(show.stdout, /path=memory\/review\/unscoped-claims\.md/);
    await expectMissing(root, "memory/people/joe.md");

    const apply = await runWm(root, ["tx", "apply", "tx_2026_05_20_001"]);
    assert.match(apply.stdout, /Applied transaction tx_2026_05_20_001/);
    assert.match(await readVaultFile(root, "memory/people/joe.md"), /clm_joe_role_dba/);

    const validate = await runWm(root, ["validate"]);
    assert.match(validate.stdout, /Validation passed/);

    const ask = await runWm(root, ["ask", "--pack-context", "What is Joe's role?"]);
    assert.match(ask.stdout, /# Context pack/);
    assert.match(ask.stdout, /Joe is the DBA/);

    const reviewList = await runWm(root, ["review", "list"]);
    assert.match(reviewList.stdout, /rev_unscoped_claims/);

    const reviewShow = await runWm(root, ["review", "show", "rev_unscoped_claims"]);
    assert.match(reviewShow.stdout, /# Review: Unscoped claims/);

    const reviewMark = await runWm(root, [
      "review",
      "mark",
      "rev_unscoped_claims",
      "--state",
      "contested",
      "--note",
      "Needs scope."
    ]);
    assert.match(reviewMark.stdout, /Pending review transaction: tx_2026_05_21_001/);

    await runWm(root, ["tx", "apply", "tx_2026_05_21_001"]);
    const allReview = await runWm(root, ["review", "list", "--all"]);
    assert.match(allReview.stdout, /contested/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function runProviderStubE2e() {
  const root = await makeTempVault("assisto-e2e-provider-");

  try {
    const ingest = await runWm(root, ["ingest", "--provider", "llm-stub", "Joe is the DBA."]);
    assert.match(ingest.stdout, /Pending transaction: tx_2026_05_21_001/);
    assert.match(ingest.stdout, /Staged review proposals:/);

    const tx = await readVaultFile(root, "memory/transactions/pending/tx_2026_05_21_001.md");
    assert.match(tx, /llm_output_malformed/);
    assert.doesNotMatch(tx, /path=memory\/people\/joe\.md/);
    await expectMissing(root, "memory/people/joe.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function runWorkbenchBrowserE2e() {
  const workbench = await importModule("packages/workbench/src/index.ts");
  const root = await makeTempVault("assisto-e2e-workbench-");
  let running = null;

  try {
    await writeWorkbenchBrowserFixture(root);
    const beforeEvent = await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-003.md");
    running = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    const html = await fetchText(`${running.url}/`);
    assert.match(html, /data-tab="review"/);
    assert.match(html, /data-tab="briefs"/);

    const client = await fetchText(`${running.url}/assets/workbench.js`);
    assert.match(client, /renderAnswerBasis/);
    assert.match(client, /renderBrief/);
    assert.match(client, /renderActionResult/);
    assert.match(client, /reviewSummaryHtml/);
    assert.match(client, /data-review-reason/);
    assert.match(client, /Proposed file writes/);

    const review = await fetchJson(`${running.url}/api/review`);
    assert.equal(review.items.some((item) => item.id === "rev_mysql_scope"), true);
    assert.equal(review.grouped_by_reason.some((group) => group.review_reason === "unscoped_claim"), true);
    assert.equal(review.grouped_by_reason.some((group) => group.item_ids.includes("rev_mysql_scope")), true);
    assert.equal(review.items.some((item) => /explicit Context/.test(item.suggested_action)), true);

    const preview = await postJson(`${running.url}/api/review/apply-staged/preview`, {
      reviewId: "rev_mysql_scope",
      target: "memory/topics/mysql.md",
      context: "ctx_inventory_project",
      note: "Scope confirmed."
    });
    assert.equal(preview.created, false);
    assert.equal(preview.operations.includes("UPSERT_CLAIM"), true);
    await expectMissing(root, preview.transaction_path);

    const apply = await postJson(`${running.url}/api/review/apply-staged`, {
      reviewId: "rev_mysql_scope",
      target: "memory/topics/mysql.md",
      context: "ctx_inventory_project",
      note: "Scope confirmed."
    });
    assert.equal(apply.created, true);
    assert.match(await readVaultFile(root, apply.transaction_path), /ctx_inventory_project/);
    await expectMissing(root, "memory/topics/mysql.md");

    const reprocess = await postJson(`${running.url}/api/events/reprocess`, {
      eventId: "ev_2026_05_21_003",
      stageOnly: true
    });
    assert.equal(reprocess.created, true);
    assert.equal(reprocess.event_id, "ev_2026_05_21_003");
    assert.equal(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-003.md"), beforeEvent);

    const ask = await fetchJson(`${running.url}/api/ask?q=Who%20is%20my%20manager%3F`);
    assert.equal(ask.evidenceEvents.some((event) => event.id === "ev_2026_05_21_001"), true);

    const noMatch = await fetchJson(`${running.url}/api/ask?q=What%20is%20the%20Neptune%20deploy%20key%3F`);
    assert.equal(noMatch.missingInformation.some((item) => item.code === "no_match"), true);

    const health = await fetchJson(`${running.url}/api/health`);
    assert.equal(health.counts.stale_noop_events, 1);

    const brief = await fetchJson(`${running.url}/api/brief?kind=person&target=per_jeff`);
    assert.equal(brief.activeClaims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(brief.evidenceEvents.some((event) => event.id === "ev_2026_05_21_001"), true);
  } finally {
    if (running) {
      await running.close();
    }

    await rm(root, { recursive: true, force: true });
  }
}

await runCliWorkflowE2e();
await runProviderStubE2e();
await runWorkbenchBrowserE2e();

console.log("near-e2e tests passed");

async function importModule(relativePath) {
  const { loadTsModule } = await import("./ts-module-loader.mjs");
  return loadTsModule(relativePath);
}

async function fetchText(url) {
  const response = await globalThis.fetch(url);
  const text = await response.text();

  assert.equal(response.ok, true, text);
  return text;
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

async function postJson(url, body) {
  const response = await globalThis.fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();

  assert.equal(response.ok, true, text);
  return JSON.parse(text);
}

async function writeWorkbenchBrowserFixture(root) {
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
