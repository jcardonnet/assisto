import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
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
  await writeVaultFile(
    root,
    "memory/events/2026/2026-05/2026-05-21-002.md",
    `---
id: ev_2026_05_21_002
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-21T09:30:00-03:00
observed_at: 2026-05-21
source_type: user_note
source_actor: user
participants: []
topics: []
contexts: []
derived_claims: []
transactions: []
---

# Event ev_2026_05_21_002

## Raw text

We use MySQL.
`
  );
  await writeVaultFile(
    root,
    "memory/events/2026/2026-05/2026-05-21-003.md",
    `---
id: ev_2026_05_21_003
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-21T09:45:00-03:00
observed_at: 2026-05-21
source_type: user_note
source_actor: user
participants: []
topics: []
contexts: []
derived_claims: []
transactions: []
---

# Event ev_2026_05_21_003

## Raw text

I started new job this monday as a AI Engineer at SmartEquip
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

    const client = await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/assets/workbench.js" });
    assert.match(client.body, /review-apply-form/);
    assert.match(client.body, /event-reprocess-form/);
    assert.match(client.body, /renderAnswerBasis/);
    assert.match(client.body, /snapshot = await fetchJson\("\/api\/snapshot"\);\n\s*health = null;\n\s*render\(\);/);

    const review = JSON.parse((await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/review" })).body);
    assert.equal(review.items[0].id, "rev_mysql_scope");
    assert.deepEqual(review.items[0].staged_claim_ids, ["clm_mysql_used_unknown_scope"]);

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
    assert.equal(ask.answerCandidates.some((candidate) => candidate.claim_id === "clm_jeff_manager"), true);

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
    await rm(path.join(root, "memory/followups/broken.md"), { force: true });
    await rm(path.join(root, "memory/topics/broken.md"), { force: true });

    const readOnly = await workbench.handleWorkbenchRoute(root, { method: "POST", url: "/api/review" });
    assert.equal(readOnly.status, 405);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);

    const applyRequest = {
      reviewId: "rev_mysql_scope",
      target: "memory/topics/mysql.md",
      createContext: "Inventory Project",
      note: "Inventory Project confirmed."
    };
    const preview = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/review/apply-staged/preview",
          body: JSON.stringify(applyRequest)
        })
      ).body
    );

    assert.equal(preview.action, "apply_staged_claim");
    assert.equal(preview.review_id, "rev_mysql_scope");
    assert.equal(preview.created, false);
    assert.equal(preview.source_events.includes("ev_2026_05_21_002"), true);
    assert.equal(preview.operations.includes("UPSERT_CLAIM"), true);
    assert.equal(preview.affected_files.includes("topics/mysql.md"), true);
    assert.equal(preview.proposed_file_writes.includes("memory/topics/mysql.md"), true);
    await assert.rejects(() => readVaultFile(root, preview.transaction_path), /ENOENT/);
    await assert.rejects(() => readVaultFile(root, "memory/topics/mysql.md"), /ENOENT/);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);

    const apply = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/review/apply-staged",
          body: JSON.stringify(applyRequest)
        })
      ).body
    );

    assert.equal(apply.created, true);
    assert.equal(apply.transaction_id, preview.transaction_id);
    assert.match(await readVaultFile(root, apply.transaction_path), /path=memory\/topics\/mysql\.md/);
    await assert.rejects(() => readVaultFile(root, "memory/topics/mysql.md"), /ENOENT/);
    assert.match(await readVaultFile(root, "memory/review/mysql-scope.md"), /review_state: staged/);

    const mark = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/review/mark",
          body: JSON.stringify({
            reviewId: "rev_mysql_scope",
            state: "contested",
            note: "Needs human scope confirmation."
          })
        })
      ).body
    );

    assert.equal(mark.action, "mark_review_item");
    assert.equal(mark.created, true);
    assert.equal(mark.operations.includes("STAGE_REVIEW"), true);
    assert.match(await readVaultFile(root, mark.transaction_path), /marked contested\. Needs human scope confirmation\./);
    assert.match(await readVaultFile(root, "memory/review/mysql-scope.md"), /review_state: staged/);

    const eventBefore = await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-003.md");
    const reprocessWithoutStageOnly = await workbench.handleWorkbenchRoute(root, {
      method: "POST",
      url: "/api/events/reprocess",
      body: JSON.stringify({ eventId: "ev_2026_05_21_003" })
    });

    assert.equal(reprocessWithoutStageOnly.status, 400);

    const reprocess = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/events/reprocess",
          body: JSON.stringify({ eventId: "ev_2026_05_21_003", stageOnly: true })
        })
      ).body
    );

    assert.equal(reprocess.action, "reprocess_event");
    assert.equal(reprocess.created, true);
    assert.equal(reprocess.event_id, "ev_2026_05_21_003");
    assert.equal(reprocess.source_events.includes("ev_2026_05_21_003"), true);
    assert.match(await readVaultFile(root, reprocess.transaction_path), /Reprocess existing Event/);
    assert.equal(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-003.md"), eventBefore);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
