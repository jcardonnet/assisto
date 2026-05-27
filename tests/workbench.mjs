import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeTempVault, readVaultFile, writeVaultFile } from "./helpers/temp-vault.mjs";

export async function writeWorkbenchFixture(root) {
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
source_events:
  - ev_2026_05_21_001
related:
  - per_jeff
summary_generated_from: []
---

# Inventory Project
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
linked_transaction: tx_2026_05_21_001
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
    "memory/transactions/pending/tx_2026_05_21_002.md",
    `---
id: tx_2026_05_21_002
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

# Transaction tx_2026_05_21_002

## Intent

No durable claims were extracted from the Event.

## Proposed operations

- NOOP: no durable claims extracted

## Rollback / repair notes

Preserve source Events.
`
  );
  await writeVaultFile(
    root,
    "memory/transactions/pending/tx_2026_05_21_apply.md",
    `---
id: tx_2026_05_21_apply
type: transaction
transaction_state: pending
created_at: 2026-05-21T10:30:00-03:00
source_events:
  - ev_2026_05_21_001
operations:
  - UPSERT_CLAIM
affected_files:
  - topics/transaction-console.md
risk_level: low
requires_review: false
validation_errors: []
---

# Transaction tx_2026_05_21_apply

## Intent

Apply a transaction console smoke claim through explicit proposed file writes.

## Proposed operations

- UPSERT_CLAIM: write transaction console smoke claim

## Proposed changes

### Create

\`\`\`markdown path=memory/topics/transaction-console.md
---
id: top_transaction_console
type: topic
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:30:00-03:00
updated_at: 2026-05-21T10:30:00-03:00
aliases: []
source_events:
  - ev_2026_05_21_001
related: []
summary_generated_from:
  - clm_transaction_console_ready
---

# Transaction Console

## Active claims

- claim_id: clm_transaction_console_ready
  statement: The transaction console apply path is ready for manual validation.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_2026_05_21_001]
  recorded_at: 2026-05-21T10:30:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
\`\`\`

## Rollback / repair notes

Remove the proposed topic page if the manual validation action is wrong.

## Application log

Pending.
`
  );
  await writeVaultFile(
    root,
    "memory/transactions/pending/tx_2026_05_21_reject.md",
    `---
id: tx_2026_05_21_reject
type: transaction
transaction_state: pending
created_at: 2026-05-21T10:45:00-03:00
source_events:
  - ev_2026_05_21_001
operations:
  - UPSERT_CLAIM
affected_files:
  - topics/rejected-transaction-console.md
risk_level: low
requires_review: false
validation_errors: []
---

# Transaction tx_2026_05_21_reject

## Intent

Rejectable transaction console smoke claim.

## Proposed operations

- UPSERT_CLAIM: write rejectable transaction console smoke claim

## Proposed changes

### Create

\`\`\`markdown path=memory/topics/rejected-transaction-console.md
---
id: top_rejected_transaction_console
type: topic
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:45:00-03:00
updated_at: 2026-05-21T10:45:00-03:00
aliases: []
source_events:
  - ev_2026_05_21_001
related: []
summary_generated_from:
  - clm_rejected_transaction_console
---

# Rejected Transaction Console

## Active claims

- claim_id: clm_rejected_transaction_console
  statement: The rejected transaction console claim should never become canonical.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_2026_05_21_001]
  recorded_at: 2026-05-21T10:45:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
\`\`\`

## Rollback / repair notes

No canonical page should be written when this transaction is rejected.

## Application log

Pending.
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
  await writeVaultFile(
    root,
    "memory/topics/health-contested.md",
    `---
id: top_health_contested
type: topic
object_state: active
review_state: contested
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
  - ev_2026_05_21_001
related: []
summary_generated_from:
  - clm_health_contested
---

# Health Contested

## Active claims

- claim_id: clm_health_contested
  statement: Health contested memory needs review.
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

- claim_id: clm_health_superseded
  statement: Old health claim.
  claim_kind: fact
  claim_state: superseded
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
    "memory/topics/health-orphan.md",
    `---
id: top_health_orphan
type: topic
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events: []
related: []
summary_generated_from:
  - clm_health_orphan
---

# Health Orphan

## Active claims

- claim_id: clm_health_orphan
  statement: Health orphan page exists.
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
    "memory/people/health-missing-source.md",
    `---
id: per_health_missing_source
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
  - ev_missing_source
related: []
summary_generated_from:
  - clm_health_missing_source
---

# Health Missing Source

## Active claims

- claim_id: clm_health_missing_source
  statement: Health Missing Source owns the service.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_missing_source]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
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
    assert.equal(snapshot.transactions.items.length, 4);
    assert.equal(snapshot.transactions.items[0].transaction_state, "pending");
    assert.equal(snapshot.followups.items.some((item) => item.id === "fu_ask_jeff"), true);
    assert.equal(snapshot.health.counts.staged_review_items, 1);
    assert.equal(snapshot.health.counts.stale_noop_events, 1);
    assert.equal(snapshot.health.counts.superseded_claims, 1);
    assert.equal(snapshot.health.counts.pages_missing_source_events, 1);
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
    assert.match(client.body, /reviewSummaryHtml/);
    assert.match(client.body, /data-review-reason/);
    assert.match(client.body, /Suggested action/);
    assert.match(client.body, /renderAnswerBasis/);
    assert.match(client.body, /renderAskResult/);
    assert.match(client.body, /copy-derived-text/);
    assert.match(client.body, /Answer candidates/);
    assert.match(client.body, /Supporting claims/);
    assert.match(client.body, /Linked ReviewItems/);
    assert.match(client.body, /Linked FollowUps/);
    assert.match(client.body, /Matched pages/);
    assert.match(client.body, /Context pack/);
    assert.match(client.body, /Derived text only; not saved/);
    assert.match(client.body, /data-copy-target="#context-pack-text"/);
    assert.doesNotMatch(client.body, /data-copy-text="\\\$\{escapeHtml\(text\)\}">Copy context pack/);
    assert.match(client.body, /renderActionResult/);
    assert.match(client.body, /Pending transaction created/);
    assert.match(client.body, /Preview only/);
    assert.match(client.body, /Proposed file writes/);
    assert.match(client.body, /transactionStateFilter/);
    assert.match(client.body, /renderTransactions/);
    assert.match(client.body, /\/api\/transactions\/detail/);
    assert.match(client.body, /\/api\/transactions\/apply\/preview/);
    assert.match(client.body, /\/api\/transactions\/reject\/preview/);
    assert.match(client.body, /health-stage-form/);
    assert.match(client.body, /health-finding-form/);
    assert.match(client.body, /\/api\/health\/stage-finding\/preview/);
    assert.match(client.body, /data-finding-id/);
    assert.match(client.body, /renderHealthCenter/);
    assert.match(client.body, /brief-form/);
    assert.match(client.body, /brief-target-select/);
    assert.match(client.body, /\/api\/brief\/targets/);
    assert.match(client.body, /brief-export-text/);
    assert.match(client.body, /data-copy-target="#brief-export-text"/);
    assert.match(client.body, /Review Risk/);
    assert.match(client.body, /renderBrief/);
    assert.match(client.body, /\/api\/brief/);
    assert.match(client.body, /refreshAfterAction/);

    const review = JSON.parse((await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/review" })).body);
    assert.equal(review.items[0].id, "rev_mysql_scope");
    assert.deepEqual(review.items[0].staged_claim_ids, ["clm_mysql_used_unknown_scope"]);
    assert.equal(review.items[0].linked_transaction, "tx_2026_05_21_001");
    assert.match(review.items[0].suggested_action, /explicit Context/);
    assert.deepEqual(review.grouped_by_reason, [
      {
        review_reason: "unscoped_claim",
        count: 1,
        item_ids: ["rev_mysql_scope"],
        suggested_action: review.items[0].suggested_action
      }
    ]);

    const routeSnapshot = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/snapshot" })).body
    );
    assert.equal(routeSnapshot.health, null);

    const transactionDetail = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "GET",
          url: "/api/transactions/detail?id=tx_2026_05_21_apply"
        })
      ).body
    );

    assert.equal(transactionDetail.id, "tx_2026_05_21_apply");
    assert.equal(transactionDetail.transaction_state, "pending");
    assert.equal(transactionDetail.validation.passed, true);
    assert.equal(transactionDetail.operations.includes("UPSERT_CLAIM"), true);
    assert.equal(transactionDetail.source_events.includes("ev_2026_05_21_001"), true);
    assert.equal(transactionDetail.affected_files.includes("topics/transaction-console.md"), true);
    assert.equal(transactionDetail.proposed_file_writes[0].path, "memory/topics/transaction-console.md");
    assert.match(transactionDetail.proposed_file_writes[0].content, /clm_transaction_console_ready/);
    assert.match(transactionDetail.body, /## Proposed changes/);

    const transactionDetailByPath = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "GET",
          url: "/api/transactions/detail?id=memory%2Ftransactions%2Fpending%2Ftx_2026_05_21_apply.md"
        })
      ).body
    );
    assert.equal(transactionDetailByPath.id, "tx_2026_05_21_apply");

    const missingTransactionDetail = await workbench.handleWorkbenchRoute(root, {
      method: "GET",
      url: "/api/transactions/detail"
    });
    assert.equal(missingTransactionDetail.status, 400);
    assert.deepEqual(JSON.parse(missingTransactionDetail.body), { error: "Missing required query parameter: id." });

    const unknownTransactionDetail = await workbench.handleWorkbenchRoute(root, {
      method: "GET",
      url: "/api/transactions/detail?id=tx_missing"
    });
    assert.equal(unknownTransactionDetail.status, 404);
    assert.match(JSON.parse(unknownTransactionDetail.body).error, /Transaction not found: tx_missing/);

    await writeVaultFile(
      root,
      "memory/transactions/pending/tx_broken.md",
      "---\nid: tx_broken\ntype: transaction\ntransaction_state: pending\n"
    );
    const brokenTransactionDetail = await workbench.handleWorkbenchRoute(root, {
      method: "GET",
      url: "/api/transactions/detail?id=memory%2Ftransactions%2Fpending%2Ftx_broken.md"
    });
    assert.equal(brokenTransactionDetail.status, 400);
    assert.match(JSON.parse(brokenTransactionDetail.body).error, /frontmatter/);
    await rm(path.join(root, "memory/transactions/pending/tx_broken.md"), { force: true });

    const transactionApplyPreview = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/transactions/apply/preview",
          body: JSON.stringify({ id: "tx_2026_05_21_apply" })
        })
      ).body
    );
    assert.equal(transactionApplyPreview.action, "apply_transaction");
    assert.equal(transactionApplyPreview.created, false);
    assert.equal(transactionApplyPreview.transaction_id, "tx_2026_05_21_apply");
    assert.equal(transactionApplyPreview.transaction_state, "pending");
    assert.equal(transactionApplyPreview.validation.passed, true);
    assert.equal(
      transactionApplyPreview.proposed_file_writes.includes("memory/topics/transaction-console.md"),
      true
    );
    await assert.rejects(() => readVaultFile(root, "memory/topics/transaction-console.md"), /ENOENT/);

    const transactionApply = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/transactions/apply",
          body: JSON.stringify({ id: "tx_2026_05_21_apply" })
        })
      ).body
    );
    assert.equal(transactionApply.action, "apply_transaction");
    assert.equal(transactionApply.created, true);
    assert.equal(transactionApply.transaction_state, "applied");
    assert.equal(transactionApply.validation.passed, true);
    assert.match(await readVaultFile(root, "memory/topics/transaction-console.md"), /clm_transaction_console_ready/);
    assert.match(await readVaultFile(root, "memory/transactions/applied/tx_2026_05_21_apply.md"), /transaction_state: applied/);

    const transactionRejectPreview = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/transactions/reject/preview",
          body: JSON.stringify({ id: "tx_2026_05_21_reject", reason: "Not needed after manual review." })
        })
      ).body
    );
    assert.equal(transactionRejectPreview.action, "reject_transaction");
    assert.equal(transactionRejectPreview.created, false);
    assert.equal(transactionRejectPreview.transaction_state, "pending");
    assert.equal(transactionRejectPreview.reason, "Not needed after manual review.");
    await assert.rejects(() => readVaultFile(root, "memory/transactions/rejected/tx_2026_05_21_reject.md"), /ENOENT/);
    await assert.rejects(() => readVaultFile(root, "memory/topics/rejected-transaction-console.md"), /ENOENT/);

    const transactionReject = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/transactions/reject",
          body: JSON.stringify({ id: "tx_2026_05_21_reject", reason: "Not needed after manual review." })
        })
      ).body
    );
    assert.equal(transactionReject.action, "reject_transaction");
    assert.equal(transactionReject.created, true);
    assert.equal(transactionReject.transaction_state, "rejected");
    assert.match(
      await readVaultFile(root, "memory/transactions/rejected/tx_2026_05_21_reject.md"),
      /transaction_state: rejected/
    );
    await assert.rejects(() => readVaultFile(root, "memory/topics/rejected-transaction-console.md"), /ENOENT/);

    const ask = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/ask?q=Who%20is%20my%20manager%3F" }))
        .body
    );
    assert.equal(ask.query, "Who is my manager?");
    assert.equal(ask.activeClaims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(ask.answerCandidates.some((candidate) => candidate.claim_id === "clm_jeff_manager"), true);
    assert.equal(ask.supportingClaims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(ask.evidenceEvents.some((event) => event.id === "ev_2026_05_21_001"), true);
    assert.equal(ask.linkedFollowUps.some((item) => item.id === "fu_ask_jeff"), true);
    assert.equal(ask.matchedPages.some((page) => page.path === "memory/people/jeff.md"), true);
    assert.match(ask.contextPack, /clm_jeff_manager/);
    assert.match(ask.contextPack, /ev_2026_05_21_001/);

    const noMatchAsk = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "GET",
          url: "/api/ask?q=What%20is%20the%20Neptune%20deploy%20key%3F"
        })
      ).body
    );
    assert.equal(noMatchAsk.answerCandidates.length, 0);
    assert.equal(noMatchAsk.matchedPages.length, 0);
    assert.equal(noMatchAsk.missingInformation.some((item) => item.code === "no_match"), true);
    assert.match(noMatchAsk.warnings.join("\n"), /memory has no match/);

    const askWithoutQuery = await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/ask" });
    assert.equal(askWithoutQuery.status, 400);

    const brief = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/brief?kind=person&target=per_jeff" }))
        .body
    );
    assert.equal(brief.kind, "person");
    assert.equal(brief.target.id, "per_jeff");
    assert.equal(brief.activeClaims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(brief.openFollowUps.some((followup) => followup.id === "fu_ask_jeff"), true);
    assert.match(brief.contextPack, /# Session brief: Jeff/);

    const briefPersonTargets = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/brief/targets?kind=person" })).body
    );
    assert.equal(briefPersonTargets.kind, "person");
    assert.deepEqual(
      briefPersonTargets.targets.find((target) => target.id === "per_jeff"),
      {
        id: "per_jeff",
        path: "memory/people/jeff.md",
        type: "person",
        name: "Jeff",
        aliases: []
      }
    );

    const briefContextTargets = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/brief/targets?kind=context" })).body
    );
    assert.equal(briefContextTargets.kind, "context");
    assert.deepEqual(briefContextTargets.targets, [
      {
        id: "ctx_inventory_project",
        path: "memory/contexts/inventory-project.md",
        type: "context",
        name: "Inventory Project",
        aliases: ["Warehouse Project"]
      }
    ]);

    const briefWithoutKind = await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/brief" });
    assert.equal(briefWithoutKind.status, 400);

    const briefTargetsWithoutKind = await workbench.handleWorkbenchRoute(root, {
      method: "GET",
      url: "/api/brief/targets"
    });
    assert.equal(briefTargetsWithoutKind.status, 400);
    assert.match(JSON.parse(briefTargetsWithoutKind.body).error, /Missing required query parameter/);

    const briefTargetsWithInvalidKind = await workbench.handleWorkbenchRoute(root, {
      method: "GET",
      url: "/api/brief/targets?kind=topic"
    });
    assert.equal(briefTargetsWithInvalidKind.status, 400);
    assert.match(JSON.parse(briefTargetsWithInvalidKind.body).error, /Invalid query parameter kind/);

    await writeVaultFile(root, "memory/followups/broken.md", "---\nid: fu_broken\n");
    await writeVaultFile(root, "memory/topics/broken.md", "---\nid: top_broken\n");

    const followups = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/followups" })).body
    );
    assert.equal(followups.items.some((item) => item.id === "fu_ask_jeff"), true);
    assert.equal(followups.warnings.some((warning) => warning.path === "memory/followups/broken.md"), true);

    const health = JSON.parse((await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/health" })).body);
    assert.equal(health.counts.pending_transactions, 2);
    assert.equal(health.counts.stale_noop_events, 1);
    assert.equal(health.counts.contested_claims >= 1, true);
    assert.equal(health.counts.orphan_pages, 1);
    assert.equal(health.findings.some((finding) => finding.code === "missing_source_event"), true);
    assert.equal(health.findings.every((finding) => /^hlth_[a-z_]+_[a-f0-9]{12}$/.test(finding.finding_id)), true);
    assert.equal(health.warnings.some((warning) => /memory\/topics\/broken\.md/.test(warning)), true);
    await rm(path.join(root, "memory/followups/broken.md"), { force: true });
    await rm(path.join(root, "memory/topics/broken.md"), { force: true });

    const staleNoopFinding = health.findings.find((finding) => finding.code === "stale_noop_event");
    assert.ok(staleNoopFinding);
    const singleHealthPreview = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/health/stage-finding/preview",
          body: JSON.stringify({ findingId: staleNoopFinding.finding_id, note: "Only this finding." })
        })
      ).body
    );

    assert.equal(singleHealthPreview.action, "stage_health_review");
    assert.equal(singleHealthPreview.created, false);
    assert.deepEqual(singleHealthPreview.proposed_file_writes, ["memory/review/health-stale_noop_event.md"]);
    await assert.rejects(() => readVaultFile(root, singleHealthPreview.transaction_path), /ENOENT/);
    await assert.rejects(() => readVaultFile(root, "memory/review/health-stale_noop_event.md"), /ENOENT/);

    const missingHealthFinding = await workbench.handleWorkbenchRoute(root, {
      method: "POST",
      url: "/api/health/stage-finding/preview",
      body: JSON.stringify({ findingId: "hlth_missing_000000000000" })
    });
    assert.equal(missingHealthFinding.status, 400);
    assert.match(JSON.parse(missingHealthFinding.body).error, /Health finding not found/);

    const singleHealthStage = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/health/stage-finding",
          body: JSON.stringify({ findingId: staleNoopFinding.finding_id, note: "Only this finding." })
        })
      ).body
    );

    assert.equal(singleHealthStage.action, "stage_health_review");
    assert.equal(singleHealthStage.created, true);
    assert.deepEqual(singleHealthStage.proposed_file_writes, ["memory/review/health-stale_noop_event.md"]);
    assert.match(await readVaultFile(root, singleHealthStage.transaction_path), /Only this finding/);
    assert.doesNotMatch(await readVaultFile(root, singleHealthStage.transaction_path), /health-missing_source_event/);
    await assert.rejects(() => readVaultFile(root, "memory/review/health-stale_noop_event.md"), /ENOENT/);

    const healthPreview = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/health/stage-review/preview",
          body: JSON.stringify({ note: "Manual health triage." })
        })
      ).body
    );

    assert.equal(healthPreview.action, "stage_health_review");
    assert.equal(healthPreview.created, false);
    assert.equal(healthPreview.operations.includes("STAGE_REVIEW"), true);
    assert.equal(healthPreview.proposed_file_writes.some((file) => file === "memory/review/health-stale_noop_event.md"), true);
    await assert.rejects(() => readVaultFile(root, healthPreview.transaction_path), /ENOENT/);
    await assert.rejects(() => readVaultFile(root, "memory/review/health-stale_noop_event.md"), /ENOENT/);

    const healthStage = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/health/stage-review",
          body: JSON.stringify({ note: "Manual health triage." })
        })
      ).body
    );

    assert.equal(healthStage.action, "stage_health_review");
    assert.equal(healthStage.created, true);
    assert.match(await readVaultFile(root, healthStage.transaction_path), /health-stale_noop_event/);
    await assert.rejects(() => readVaultFile(root, "memory/review/health-stale_noop_event.md"), /ENOENT/);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);

    const readOnly = await workbench.handleWorkbenchRoute(root, { method: "POST", url: "/api/review" });
    assert.equal(readOnly.status, 405);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);

    const applyRequest = {
      reviewId: "rev_mysql_scope",
      target: "memory/topics/mysql.md",
      context: "ctx_inventory_project",
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
