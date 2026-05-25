import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeTempVault, readVaultFile, writeVaultFile } from "./helpers/temp-vault.mjs";

async function writeWorkbenchFixture(root) {
  await writeVaultFile(
    root,
    "memory/people/jeff.md",
    `---
id: per_jeff
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
  - ev_2026_05_21_001
related: []
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
`
  );
  await writeVaultFile(
    root,
    "memory/review/mysql-scope.md",
    `---
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
`
  );
  await writeVaultFile(
    root,
    "memory/followups/ask-jeff.md",
    `---
id: fu_ask_jeff
type: followup
object_state: active
review_state: reviewed
followup_state: open
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
owner: user
source_events:
  - ev_2026_05_21_001
related:
  - per_jeff
---

# Follow-up: Ask Jeff
`
  );
  await writeVaultFile(
    root,
    "memory/transactions/pending/tx_2026_05_21_001.md",
    `---
id: tx_2026_05_21_001
type: transaction
transaction_state: pending
created_at: 2026-05-21T10:00:00-03:00
source_events:
  - ev_2026_05_21_002
operations:
  - STAGE_REVIEW
affected_files:
  - review/mysql-scope.md
risk_level: low
requires_review: false
validation_errors: []
---

# Transaction tx_2026_05_21_001

## Intent

Stage review item.

## Proposed operations

- STAGE_REVIEW: stage MySQL scope review

## Rollback / repair notes

No canonical claim writes are included.
`
  );
  await writeVaultFile(
    root,
    "memory/events/2026/2026-05/2026-05-21-001.md",
    `---
id: ev_2026_05_21_001
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

# Event ev_2026_05_21_001

## Raw text

Jeff is my manager.
`
  );
}

export async function runWorkbenchTests() {
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  const cliSource = await readFile("packages/cli/src/index.ts", "utf8");
  const workbenchPackage = JSON.parse(await readFile("packages/workbench/package.json", "utf8"));
  const cliPackage = JSON.parse(await readFile("packages/cli/package.json", "utf8"));

  assert.match(cliSource, /from "@assisto\/workbench"/);
  assert.equal(workbenchPackage.dependencies["@assisto/core"], "workspace:*");
  assert.equal(cliPackage.dependencies["@assisto/workbench"], "workspace:*");

  const root = await makeTempVault("assisto-workbench-");

  try {
    await writeWorkbenchFixture(root);
    const beforePersonPage = await readVaultFile(root, "memory/people/jeff.md");
    const snapshot = await workbench.createWorkbenchSnapshot(root, {
      query: "Who is my manager?",
      now: "2026-05-25T12:34:56.000Z"
    });

    assert.equal(snapshot.generated_at, "2026-05-25T12:34:56.000Z");
    assert.equal(snapshot.review.items.length, 1);
    assert.equal(snapshot.review.items[0].id, "rev_mysql_scope");
    assert.equal(snapshot.transactions.items.length, 1);
    assert.equal(snapshot.transactions.items[0].transaction_state, "pending");
    assert.equal(snapshot.followups.items.length, 1);
    assert.equal(snapshot.followups.items[0].id, "fu_ask_jeff");
    assert.equal(snapshot.health.counts.staged_review_items, 1);
    assert.equal(snapshot.ask.query, "Who is my manager?");
    assert.equal(snapshot.ask.activeClaims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);

    const shell = await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/" });
    assert.equal(shell.status, 200);
    assert.match(shell.body, /data-tab="review"/);
    assert.match(shell.body, /data-tab="transactions"/);
    assert.match(shell.body, /data-tab="ask"/);
    assert.match(shell.body, /data-tab="health"/);
    assert.match(shell.body, /data-tab="briefs"/);

    const review = JSON.parse((await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/review" })).body);
    assert.equal(review.items[0].id, "rev_mysql_scope");

    const routeSnapshot = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/snapshot" })).body
    );
    assert.equal(routeSnapshot.health, null);

    const ask = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/ask?q=Who%20is%20my%20manager%3F" }))
        .body
    );
    assert.equal(ask.query, "Who is my manager?");
    assert.equal(ask.activeClaims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);

    const askWithoutQuery = await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/ask" });
    assert.equal(askWithoutQuery.status, 400);

    await writeVaultFile(root, "memory/followups/broken.md", "---\nid: fu_broken\n");
    await writeVaultFile(root, "memory/topics/broken.md", "---\nid: top_broken\n");

    const followups = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/followups" })).body
    );
    assert.equal(followups.items.length, 1);
    assert.equal(followups.warnings.some((warning) => warning.path === "memory/followups/broken.md"), true);

    const health = JSON.parse((await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/health" })).body);
    assert.equal(health.counts.pending_transactions, 1);
    assert.equal(health.warnings.some((warning) => /memory\/topics\/broken\.md/.test(warning)), true);

    const readOnly = await workbench.handleWorkbenchRoute(root, { method: "POST", url: "/api/review" });
    assert.equal(readOnly.status, 405);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
