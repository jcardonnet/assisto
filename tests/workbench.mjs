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
  - ctx_inventory_project
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

async function writeReviewTurboFixture(root) {
  await writeVaultFile(
    root,
    "memory/review/alias-ambiguous.md",
    `---
id: rev_alias_ambiguous
type: review_item
object_state: active
review_state: staged
review_reason: ambiguous_entity
created_at: 2026-05-21T10:20:00-03:00
source_events:
  - ev_2026_05_21_001
affected_files:
  - people/jeff.md
---

# Review: Ambiguous Jeff

## Staged claims

- claim_id: clm_ambiguous_jeff_alias
  statement: Jeff may be the same person as Jeffrey.
  claim_kind: inference
  claim_state: staged
  evidence_strength: weak
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_2026_05_21_001]
  recorded_at: 2026-05-21T10:20:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`
  );
  await writeVaultFile(
    root,
    "memory/review/jeff-role.md",
    `---
id: rev_jeff_role
type: review_item
object_state: active
review_state: staged
review_reason: role_change
created_at: 2026-05-21T10:15:00-03:00
source_events:
  - ev_2026_05_21_001
affected_files:
  - people/jeff.md
---

# Review: Jeff role

## Staged claims

- claim_id: clm_jeff_role_change
  statement: Jeff changed roles.
  claim_kind: fact
  claim_state: staged
  evidence_strength: explicit
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_2026_05_21_001]
  recorded_at: 2026-05-21T10:15:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`
  );
  await writeVaultFile(
    root,
    "memory/review/other.md",
    `---
id: rev_other
type: review_item
object_state: active
review_state: staged
review_reason: manual_review
created_at: 2026-05-21T10:35:00-03:00
source_events:
  - ev_2026_05_21_001
affected_files:
  - topics/manual.md
---

# Review: Manual check

Human judgment is needed before choosing a memory action.
`
  );
  await writeVaultFile(
    root,
    "memory/review/safe-apply.md",
    `---
id: rev_safe_apply
type: review_item
object_state: active
review_state: staged
review_reason: scoped_claim
created_at: 2026-05-21T10:25:00-03:00
source_events:
  - ev_2026_05_21_002
affected_files:
  - topics/mysql.md
---

# Review: Safe apply

## Staged claims

- claim_id: clm_mysql_ready_to_apply
  statement: MySQL is used for inventory work.
  claim_kind: fact
  claim_state: staged
  evidence_strength: explicit
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_2026_05_21_002]
  recorded_at: 2026-05-21T10:25:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`
  );
  await writeVaultFile(
    root,
    "memory/review/stale-noop.md",
    `---
id: rev_stale_noop
type: review_item
object_state: active
review_state: staged
review_reason: stale_noop_event
created_at: 2026-05-21T10:30:00-03:00
source_events:
  - ev_2026_05_21_003
affected_files:
  - events/2026/2026-05/2026-05-21-003.md
linked_transaction: tx_2026_05_21_002
---

# Review: Stale NOOP

Reprocess the source Event with stage-only semantics.
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
    assert.match(shell.body, /activation-wizard/);
    assert.match(shell.body, /data-tab="today"/);
    assert.match(shell.body, /quick-capture-open/);
    assert.match(shell.body, /quick-capture-dialog/);
    assert.match(shell.body, /Preview quick capture/);
    assert.match(shell.body, /Source label preset/);
    assert.match(shell.body, /data-tab="today" aria-pressed="true"/);
    assert.match(shell.body, /data-tab="capture"/);
    assert.match(shell.body, /data-tab="import"/);
    assert.match(shell.body, /data-tab="entities"/);
    assert.match(shell.body, /data-tab="review" aria-pressed="false"/);
    assert.match(shell.body, /data-tab="transactions"/);
    assert.match(shell.body, /data-tab="ask"/);
    assert.match(shell.body, /data-tab="health"/);
    assert.match(shell.body, /data-tab="briefs"/);

    const client = await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/assets/workbench.js" });
    assert.match(client.body, /\/api\/activation\/status/);
    assert.match(client.body, /\/api\/use-tomorrow/);
    assert.match(client.body, /\/api\/daily\/queue/);
    assert.match(client.body, /\/api\/daily\/session/);
    assert.match(client.body, /\/api\/modes\/morning/);
    assert.match(client.body, /\/api\/modes\/meeting/);
    assert.match(client.body, /\/api\/contexts\/dashboard/);
    assert.match(client.body, /renderActivationWizard/);
    assert.match(client.body, /renderUseTomorrow/);
    assert.match(client.body, /renderDailyQueue/);
    assert.match(client.body, /renderDogfoodHome/);
    assert.match(client.body, /\/api\/dogfood\/home/);
    assert.match(client.body, /next recommended action/);
    assert.match(client.body, /daily review complete/);
    assert.match(client.body, /today-stale-reprocess-form/);
    assert.match(client.body, /today-transaction-apply-form/);
    assert.match(client.body, /today-open-review/);
    assert.match(client.body, /Read warnings/);
    assert.match(client.body, /capture-form/);
    assert.match(client.body, /capture-inbox/);
    assert.match(client.body, /quick-capture-form/);
    assert.match(client.body, /quick-capture-context-options/);
    assert.match(client.body, /\/api\/capture\/inbox/);
    assert.match(client.body, /\/api\/capture\/preview/);
    assert.match(client.body, /\/api\/capture/);
    assert.match(client.body, /seed-kit-form/);
    assert.match(client.body, /\/api\/seed\/preview/);
    assert.match(client.body, /\/api\/seed\/create/);
    assert.match(client.body, /import-form/);
    assert.match(client.body, /\/api\/import\/preview/);
    assert.match(client.body, /\/api\/import/);
    assert.match(client.body, /\/api\/import\/session/);
    assert.match(client.body, /\/api\/import\/triage\/preview/);
    assert.match(client.body, /\/api\/import\/triage/);
    assert.match(client.body, /import-triage-form/);
    assert.match(client.body, /Split unit/);
    assert.match(client.body, /Merge next/);
    assert.match(client.body, /renderImportResult/);
    assert.match(client.body, /renderEntities/);
    assert.match(client.body, /entity-alias-form/);
    assert.match(client.body, /entity-context-form/);
    assert.match(client.body, /entity-context-note-form/);
    assert.match(client.body, /Context operating page/);
    assert.match(client.body, /\/api\/entities\?kind=/);
    assert.match(client.body, /\/api\/entities\/alias\/preview/);
    assert.match(client.body, /\/api\/entities\/context\/preview/);
    assert.match(client.body, /\/api\/entities\/context-note\/preview/);
    assert.match(client.body, /review-apply-form/);
    assert.match(client.body, /event-reprocess-form/);
    assert.match(client.body, /reviewSummaryHtml/);
    assert.match(client.body, /data-review-reason/);
    assert.match(client.body, /\/api\/review\/turbo/);
    assert.match(client.body, /renderReviewTurbo/);
    assert.match(client.body, /data-review-lane/);
    assert.match(client.body, /claim-diff-card/);
    assert.match(client.body, /Review lanes/);
    assert.match(client.body, /Suggested action/);
    assert.match(client.body, /renderAnswerBasis/);
    assert.match(client.body, /renderAnswerDraft/);
    assert.match(client.body, /\/api\/ask\/draft\/preview/);
    assert.match(client.body, /\/api\/friction\/log\/preview/);
    assert.match(client.body, /\/api\/friction\/log/);
    assert.match(client.body, /Draft answer/);
    assert.match(client.body, /ask-friction-log-form/);
    assert.match(client.body, /Log retrieval miss/);
    assert.match(client.body, /renderAskResult/);
    assert.match(client.body, /retrievalPlanHtml/);
    assert.match(client.body, /copy-derived-text/);
    assert.match(client.body, /Retrieval plan/);
    assert.match(client.body, /Answer candidates/);
    assert.match(client.body, /Supporting claims/);
    assert.match(client.body, /Suggested manual actions/);
    assert.match(client.body, /Suggested next questions/);
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
    assert.match(client.body, /brief-target-kind/);
    assert.match(client.body, /brief-target-select/);
    assert.match(client.body, /\/api\/brief\/targets/);
    assert.match(client.body, /brief-export-text/);
    assert.match(client.body, /data-copy-target="#brief-export-text"/);
    assert.match(client.body, /Before meeting with Person/);
    assert.match(client.body, /What changed recently/);
    assert.match(client.body, /open-brief-link/);
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

    const reviewTurbo = JSON.parse((await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/review/turbo" })).body);
    assert.equal(reviewTurbo.lanes.find((lane) => lane.lane_id === "needs_context").count, 1);
    assert.equal(reviewTurbo.items[0].lane_id, "needs_context");
    assert.equal(reviewTurbo.items[0].staged_claims[0].claim_id, "clm_mysql_used_unknown_scope");
    assert.equal(reviewTurbo.items[0].staged_claims[0].scope_state, "unknown");
    assert.equal(reviewTurbo.items[0].source_events.includes("ev_2026_05_21_002"), true);
    assert.equal(reviewTurbo.items[0].affected_files.includes("topics/mysql.md"), true);

    const turboRoot = await makeTempVault("assisto-workbench-review-turbo-");

    try {
      await writeWorkbenchFixture(turboRoot);
      await writeReviewTurboFixture(turboRoot);

      const turbo = JSON.parse((await workbench.handleWorkbenchRoute(turboRoot, { method: "GET", url: "/api/review/turbo" })).body);
      const laneCounts = Object.fromEntries(turbo.lanes.map((lane) => [lane.lane_id, lane.count]));

      assert.deepEqual(laneCounts, {
        safe_apply: 1,
        needs_context: 1,
        identity_ambiguity: 1,
        conflict_or_change: 1,
        stale_noop: 1,
        other: 1
      });

      assert.deepEqual(
        turbo.lanes.find((lane) => lane.lane_id === "conflict_or_change").item_ids,
        ["rev_jeff_role"]
      );
      assert.equal(turbo.items.find((item) => item.id === "rev_safe_apply").lane_id, "safe_apply");
      assert.equal(turbo.items.find((item) => item.id === "rev_alias_ambiguous").lane_id, "identity_ambiguity");
      assert.equal(turbo.items.find((item) => item.id === "rev_stale_noop").lane_id, "stale_noop");
      assert.equal(turbo.items.find((item) => item.id === "rev_other").lane_id, "other");
      assert.equal(
        turbo.items.find((item) => item.id === "rev_jeff_role").staged_claims[0].statement,
        "Jeff changed roles."
      );
      assert.match(turbo.items.find((item) => item.id === "rev_safe_apply").suggested_action, /Preview apply one item/);

      const turboReadOnly = await workbench.handleWorkbenchRoute(turboRoot, { method: "POST", url: "/api/review/turbo" });
      assert.equal(turboReadOnly.status, 405);
      await assert.rejects(() => readVaultFile(turboRoot, "memory/topics/mysql.md"), /ENOENT/);
    } finally {
      await rm(turboRoot, { recursive: true, force: true });
    }

    const routeSnapshot = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/snapshot" })).body
    );
    assert.equal(routeSnapshot.health, null);

    const today = JSON.parse((await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/today" })).body);
    assert.equal(today.daily_review_complete, false);
    assert.equal(today.triage_complete, false);
    assert.equal(today.counts.pending_transactions, 4);
    assert.equal(today.counts.staged_review_items, 1);
    assert.equal(today.counts.stale_noop_events, 1);
    assert.equal(today.counts.open_followups, 1);
    assert.equal(today.pending_transactions.some((transaction) => transaction.id === "tx_2026_05_21_apply"), true);
    assert.equal(today.staged_review_groups[0].review_reason, "unscoped_claim");
    assert.equal(today.stale_noop_events[0].event_id, "ev_2026_05_21_003");
    assert.equal(today.open_followups[0].id, "fu_ask_jeff");
    assert.equal(today.recent_events[0].id, "ev_2026_05_21_003");
    assert.match(today.suggested_manual_actions.join("\n"), /Review pending Transactions/);

    const dogfoodHome = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/dogfood/home" })).body
    );
    assert.equal(dogfoodHome.daily_progress.completed, false);
    assert.equal(dogfoodHome.next_recommended_action.action, "review_pending_transaction");
    assert.equal(dogfoodHome.next_recommended_action.target_id, "tx_2026_05_21_apply");
    assert.equal(dogfoodHome.quick_briefs.some((brief) => brief.kind === "today"), true);

    const activationStatus = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/activation/status" })).body
    );
    assert.equal(activationStatus.memory_state, "active");
    assert.equal(activationStatus.counts.pending_transactions, 4);
    assert.equal(activationStatus.next_wizard_step.step_id, "review_one_transaction");

    const useTomorrow = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/use-tomorrow" })).body
    );
    assert.equal(useTomorrow.memory_state, "active");
    assert.equal(useTomorrow.counts.pending_transactions, 4);
    assert.equal(useTomorrow.steps.find((step) => step.step_id === "review_one_transaction").state, "ready");
    assert.equal(useTomorrow.next_step.step_id, "review_one_transaction");
    assert.equal(useTomorrow.linked_routes.brief, "/api/brief?kind=today");

    const dailyQueue = JSON.parse((await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/daily/queue" })).body);
    assert.equal(dailyQueue.current_item.item_type, "pending_transaction");
    assert.equal(dailyQueue.current_item.target_id, "tx_2026_05_21_apply");
    assert.equal(dailyQueue.items.some((item) => item.item_type === "review_item"), true);

    const dailySessionInitial = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/daily/session" })).body
    );
    assert.equal(dailySessionInitial.exists, false);
    const dailySessionUpdated = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/daily/session",
          body: JSON.stringify({
            dismissed_prompts: ["seed_prompt"],
            pinned_daily_questions: ["Who is my manager?"],
            last_selected_mode: "morning",
            last_completed_derived_step: "pin_question"
          })
        })
      ).body
    );
    assert.equal(dailySessionUpdated.exists, true);
    assert.deepEqual(dailySessionUpdated.state.pinned_daily_questions, ["Who is my manager?"]);
    assert.match(await readFile(path.join(root, ".assisto-local/daily/session.json"), "utf8"), /pin_question/);
    const dailySessionReset = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/daily/session",
          body: JSON.stringify({ reset: true })
        })
      ).body
    );
    assert.equal(dailySessionReset.exists, false);
    await assert.rejects(() => readFile(path.join(root, ".assisto-local/daily/session.json"), "utf8"), /ENOENT/);

    const morningMode = JSON.parse((await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/modes/morning" })).body);
    assert.equal(morningMode.mode, "morning");
    assert.equal(morningMode.next_queue_item.target_id, "tx_2026_05_21_apply");
    assert.equal(morningMode.open_followups.some((followup) => followup.id === "fu_ask_jeff"), true);

    const endDayMode = JSON.parse((await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/modes/end-day" })).body);
    assert.equal(endDayMode.mode, "end-day");
    assert.equal(endDayMode.recent_changes.some((change) => change.id === "ev_2026_05_21_003"), true);
    assert.equal(endDayMode.unresolved_transactions.length, 4);

    const meetingMode = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/modes/meeting?id=per_jeff" })).body
    );
    assert.equal(meetingMode.mode, "meeting");
    assert.equal(meetingMode.target.id, "per_jeff");
    assert.match(meetingMode.brief.contextPack, /# Session brief: Jeff/);

    const afterMeetingMode = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/modes/after-meeting?id=ctx_inventory_project" })).body
    );
    assert.equal(afterMeetingMode.mode, "after-meeting");
    assert.equal(afterMeetingMode.target.id, "ctx_inventory_project");

    const unknownMeeting = await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/modes/meeting?id=missing" });
    assert.equal(unknownMeeting.status, 404);

    const captureInbox = JSON.parse((await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/capture/inbox" })).body);
    assert.equal(captureInbox.recent_events[0].event_id, "ev_2026_05_21_003");
    assert.equal(captureInbox.pending_capture_transactions.some((transaction) => transaction.transaction_id === "tx_2026_05_21_apply"), true);
    assert.equal(captureInbox.source_label_presets.some((preset) => preset.source_label === "daily note"), true);
    assert.equal(captureInbox.capture_templates.some((template) => template.template_id === "manager_team"), true);

    const capturePreview = await workbench.handleWorkbenchRoute(root, {
      method: "POST",
      url: "/api/capture/preview",
      body: JSON.stringify({
        note: "Joe is the DBA. We use MySQL.",
        observedAt: "2026-05-21",
        sourceLabel: "workbench capture",
        context: "ctx_inventory_project"
      })
    });
    assert.equal(capturePreview.status, 200);
    const previewPayload = JSON.parse(capturePreview.body);
    assert.equal(previewPayload.created, false);
    assert.equal(previewPayload.validation.passed, true);
    assert.equal(previewPayload.needs_context, false);
    assert.match(previewPayload.likely_next_review_action, /Open Review/);
    assert.equal(previewPayload.proposed_file_writes.some((write) => write.path === "memory/people/joe.md"), true);
    await assert.rejects(() => readVaultFile(root, previewPayload.event_path), /ENOENT/);

    const openAiPreview = await workbench.handleWorkbenchRoute(root, {
      method: "POST",
      url: "/api/capture/preview",
      body: JSON.stringify({
        note: "Alice is the PM.",
        provider: "openai"
      })
    });
    assert.equal(openAiPreview.status, 200);
    const openAiPreviewPayload = JSON.parse(openAiPreview.body);
    assert.equal(openAiPreviewPayload.created, false);
    assert.equal(openAiPreviewPayload.provider_name, "openai");
    assert.equal(openAiPreviewPayload.staged_review_paths.length, 1);
    await assert.rejects(() => readVaultFile(root, openAiPreviewPayload.event_path), /ENOENT/);

    const captureCreateRoot = await makeTempVault("assisto-workbench-capture-route-");

    try {
      const captureCreate = await workbench.handleWorkbenchRoute(captureCreateRoot, {
        method: "POST",
        url: "/api/capture",
        body: JSON.stringify({
          note: "Joe is the DBA. We use MySQL.",
          observedAt: "2026-05-21",
          sourceLabel: "workbench capture",
          context: "ctx_inventory_project"
        })
      });
      assert.equal(captureCreate.status, 200);
      const createPayload = JSON.parse(captureCreate.body);
      assert.equal(createPayload.created, true);
      assert.equal(createPayload.validation.passed, true);
      assert.match(await readVaultFile(captureCreateRoot, createPayload.event_path), /source_label: workbench capture/);
    assert.match(await readVaultFile(captureCreateRoot, createPayload.transaction_path), /transaction_state: pending/);
    await assert.rejects(() => readVaultFile(captureCreateRoot, "memory/people/joe.md"), /ENOENT/);
    } finally {
      await rm(captureCreateRoot, { recursive: true, force: true });
    }

    const seedPreview = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/seed/preview",
          body: JSON.stringify({
            myRole: "I am an AI Engineer at SmartEquip.",
            managerTeam: "Jeff is my manager.",
            openLoops: "I need to ask Jeff about onboarding."
          })
        })
      ).body
    );
    assert.equal(seedPreview.action, "seed_kit");
    assert.equal(seedPreview.created, false);
    assert.equal(seedPreview.units.length, 3);
    assert.equal(seedPreview.validation.passed, true);
    await assert.rejects(() => readVaultFile(root, seedPreview.units[0].event_path), /ENOENT/);

    const seedCreateRoot = await makeTempVault("assisto-workbench-seed-route-");

    try {
      const seedCreated = JSON.parse(
        (
          await workbench.handleWorkbenchRoute(seedCreateRoot, {
            method: "POST",
            url: "/api/seed/create",
            body: JSON.stringify({
              currentProjects: "Inventory Project uses MySQL.",
              importantPeople: "Jeff is my manager."
            })
          })
        ).body
      );
      assert.equal(seedCreated.created, true);
      assert.equal(seedCreated.units.length, 2);
      assert.match(await readVaultFile(seedCreateRoot, seedCreated.units[0].event_path), /source_label: seed:context/);
      await assert.rejects(() => readVaultFile(seedCreateRoot, "memory/people/jeff.md"), /ENOENT/);
    } finally {
      await rm(seedCreateRoot, { recursive: true, force: true });
    }

    const importPreview = await workbench.handleWorkbenchRoute(root, {
      method: "POST",
      url: "/api/import/preview",
      body: JSON.stringify({
        text: "Joe is the DBA. We use MySQL.\n---\nI will ask Jeff about budgets.",
        sourceLabel: "workbench import",
        observedAt: "2026-05-21",
        limit: 1
      })
    });
    assert.equal(importPreview.status, 200);
    const importPreviewPayload = JSON.parse(importPreview.body);
    assert.equal(importPreviewPayload.created, false);
    assert.equal(importPreviewPayload.units_total, 1);
    assert.equal(importPreviewPayload.units[0].validation.passed, true);
    await assert.rejects(() => readVaultFile(root, importPreviewPayload.units[0].event_path), /ENOENT/);

    const importCreateRoot = await makeTempVault("assisto-workbench-import-route-");

    try {
      const importCreate = await workbench.handleWorkbenchRoute(importCreateRoot, {
        method: "POST",
        url: "/api/import",
        body: JSON.stringify({
          text: "Joe is the DBA. We use MySQL.\n---\nJoe is the DBA. We use MySQL.",
          sourceLabel: "workbench import"
        })
      });
      assert.equal(importCreate.status, 200);
      const importCreatePayload = JSON.parse(importCreate.body);
      assert.equal(importCreatePayload.created, true);
      assert.equal(importCreatePayload.units_imported, 1);
      assert.equal(importCreatePayload.units_skipped, 1);
      assert.match(await readVaultFile(importCreateRoot, importCreatePayload.units[0].event_path), /source_hash: [a-f0-9]{64}/);
      assert.match(await readVaultFile(importCreateRoot, importCreatePayload.units[0].transaction_path), /transaction_state: pending/);
      await assert.rejects(() => readVaultFile(importCreateRoot, "memory/people/joe.md"), /ENOENT/);
    } finally {
      await rm(importCreateRoot, { recursive: true, force: true });
    }

    const importTriagePreview = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/import/triage/preview",
          body: JSON.stringify({
            units: [
              {
                unit_id: "unit_1",
                action: "keep",
                raw_text: "Joe is the DBA.",
                source_label: "workbench triage",
                observed_at: "2026-05-22",
                context: "ctx_inventory_project"
              },
              {
                unit_id: "unit_2",
                action: "skip",
                raw_text: "Skip this import unit."
              }
            ]
          })
        })
      ).body
    );
    assert.equal(importTriagePreview.action, "import_triage");
    assert.equal(importTriagePreview.created, false);
    assert.equal(importTriagePreview.units_kept, 1);
    assert.equal(importTriagePreview.units_skipped, 1);
    assert.equal(importTriagePreview.units[0].context, "ctx_inventory_project");
    assert.equal(importTriagePreview.likely_counts.safe, 1);
    assert.ok(importTriagePreview.session_id);
    await assert.rejects(() => readVaultFile(root, importTriagePreview.units[0].event_path), /ENOENT/);

    const importSession = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "GET",
          url: `/api/import/session?id=${encodeURIComponent(importTriagePreview.session_id)}`
        })
      ).body
    );
    assert.equal(importSession.session_id, importTriagePreview.session_id);
    assert.equal(importSession.result.units_total, 2);
    assert.equal(importSession.result.created, false);

    const importTriageCreateRoot = await makeTempVault("assisto-workbench-import-triage-route-");

    try {
      const importTriageCreate = JSON.parse(
        (
          await workbench.handleWorkbenchRoute(importTriageCreateRoot, {
            method: "POST",
            url: "/api/import/triage",
            body: JSON.stringify({
              units: [
                {
                  unit_id: "unit_1",
                  action: "keep",
                  raw_text: "Joe is the DBA.",
                  source_label: "workbench triage",
                  observed_at: "2026-05-22",
                  context: "ctx_inventory_project"
                },
                {
                  unit_id: "unit_2",
                  action: "skip",
                  raw_text: "Skip this import unit."
                }
              ]
            })
          })
        ).body
      );
      assert.equal(importTriageCreate.action, "import_triage");
      assert.equal(importTriageCreate.created, true);
      assert.equal(importTriageCreate.units_kept, 1);
      assert.equal(importTriageCreate.units_skipped, 1);
      assert.match(await readVaultFile(importTriageCreateRoot, importTriageCreate.units[0].event_path), /source_label: workbench triage/);
      assert.match(await readVaultFile(importTriageCreateRoot, importTriageCreate.units[0].transaction_path), /transaction_state: pending/);
      await assert.rejects(() => readVaultFile(importTriageCreateRoot, "memory/people/joe.md"), /ENOENT/);
    } finally {
      await rm(importTriageCreateRoot, { recursive: true, force: true });
    }

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
    assert.equal(ask.queryIntent.primary, "manager_reporting");
    assert.equal(ask.plannedLookups.some((lookup) => lookup.kind === "relation_claims"), true);
    assert.equal(ask.activeClaims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(ask.answerCandidates.some((candidate) => candidate.claim_id === "clm_jeff_manager"), true);
    assert.equal(ask.supportingClaims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(ask.evidenceEvents.some((event) => event.id === "ev_2026_05_21_001"), true);
    assert.equal(ask.linkedFollowUps.some((item) => item.id === "fu_ask_jeff"), true);
    assert.equal(ask.manualActions.some((action) => action.action === "open_followups"), true);
    assert.equal(ask.suggestedNextQuestions.some((question) => /source Event supports/i.test(question)), true);
    assert.equal(ask.matchedPages.some((page) => page.path === "memory/people/jeff.md"), true);
    assert.match(ask.contextPack, /clm_jeff_manager/);
    assert.match(ask.contextPack, /ev_2026_05_21_001/);

    const askSession = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/ask/session?q=Who%20is%20my%20manager%3F" }))
        .body
    );
    assert.equal(askSession.query, "Who is my manager?");
    assert.equal(askSession.basis.answerCandidates.some((candidate) => candidate.claim_id === "clm_jeff_manager"), true);
    assert.equal(askSession.citation_explorer.claim_ids.includes("clm_jeff_manager"), true);
    assert.equal(askSession.citation_explorer.event_ids.includes("ev_2026_05_21_001"), true);
    assert.equal(askSession.citation_explorer.page_paths.includes("memory/people/jeff.md"), true);
    assert.equal(askSession.matched_page_previews.some((preview) => preview.path === "memory/people/jeff.md"), true);
    assert.equal(
      askSession.source_event_previews.some((preview) => /Jeff is my manager/.test(preview.raw_text_preview)),
      true
    );
    assert.deepEqual(askSession.pinned_questions, []);

    const pinnedAsk = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/ask/pin",
          body: JSON.stringify({ question: "Who is my manager?" })
        })
      ).body
    );
    assert.deepEqual(pinnedAsk.pinned_questions, ["Who is my manager?"]);
    assert.match(await readFile(path.join(root, ".assisto-local/retrieval/questions.json"), "utf8"), /Who is my manager/);

    const pinnedAskSession = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/ask/session" })).body
    );
    assert.deepEqual(pinnedAskSession.pinned_questions, ["Who is my manager?"]);
    assert.equal(pinnedAskSession.basis, null);

    await writeVaultFile(
      root,
      ".assisto-local/eval/questions.json",
      JSON.stringify({
        questions: [
          {
            question: "Who is my manager?",
            expected_claim_ids: ["clm_jeff_manager", "clm_missing_manager"],
            expected_event_ids: ["ev_2026_05_21_001"],
            expected_page_paths: ["memory/people/jeff.md"],
            tags: ["manager"]
          },
          {
            question: "What is the Neptune deploy key?",
            tags: ["no_match"]
          }
        ]
      })
    );
    const dogfoodEval = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/dogfood/eval" })).body
    );
    assert.equal(dogfoodEval.metrics.total_questions, 2);
    assert.equal(dogfoodEval.metrics.expected_items, 4);
    assert.equal(dogfoodEval.metrics.found_expected_items, 3);
    assert.equal(dogfoodEval.questions[0].found_claim_ids.includes("clm_jeff_manager"), true);
    assert.equal(dogfoodEval.questions[0].found_claim_ids.includes("clm_missing_manager"), false);
    assert.equal(dogfoodEval.questions[1].missing_memory_guidance, true);

    const dogfoodEvalRun = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/dogfood/eval/run",
          body: JSON.stringify({})
        })
      ).body
    );
    assert.equal(dogfoodEvalRun.metrics.generated_persistence_violations, 0);
    assert.equal(dogfoodEvalRun.metrics.missing_memory_guidance_count, 1);

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
    assert.equal(noMatchAsk.manualActions.some((action) => action.action === "capture_note"), true);
    assert.equal(noMatchAsk.manualActions.some((action) => action.action === "log_friction"), true);
    assert.match(noMatchAsk.warnings.join("\n"), /memory has no match/);

    const missingMemoryPreview = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/ask/missing-memory/preview",
          body: JSON.stringify({
            question: "What is the Neptune deploy key?",
            note: "Need to capture the Neptune deploy key source."
          })
        })
      ).body
    );
    assert.equal(missingMemoryPreview.action, "log_friction");
    assert.equal(missingMemoryPreview.created, false);
    assert.equal(missingMemoryPreview.kind, "retrieval_miss");
    assert.match(missingMemoryPreview.event_raw_text, /Need to capture the Neptune deploy key source/);
    await assert.rejects(() => readVaultFile(root, missingMemoryPreview.event_path), /ENOENT/);

    const frictionPreview = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/friction/log/preview",
          body: JSON.stringify({
            kind: "retrieval_miss",
            question: "What is the Neptune deploy key?",
            note: "Memory could not answer the Neptune deploy key question."
          })
        })
      ).body
    );
    assert.equal(frictionPreview.action, "log_friction");
    assert.equal(frictionPreview.created, false);
    assert.equal(frictionPreview.kind, "retrieval_miss");
    assert.deepEqual(frictionPreview.operations, ["NOOP"]);
    assert.equal(frictionPreview.validation.passed, true);
    await assert.rejects(() => readVaultFile(root, frictionPreview.event_path), /ENOENT/);

    const frictionCreateRoot = await makeTempVault("assisto-workbench-friction-route-");

    try {
      const frictionCreate = JSON.parse(
        (
          await workbench.handleWorkbenchRoute(frictionCreateRoot, {
            method: "POST",
            url: "/api/friction/log",
            body: JSON.stringify({
              kind: "retrieval_miss",
              question: "What is the Neptune deploy key?",
              note: "Memory could not answer the Neptune deploy key question."
            })
          })
        ).body
      );
      assert.equal(frictionCreate.action, "log_friction");
      assert.equal(frictionCreate.created, true);
      assert.equal(frictionCreate.kind, "retrieval_miss");
      assert.match(await readVaultFile(frictionCreateRoot, frictionCreate.event_path), /source_label: friction:retrieval_miss/);
      assert.match(await readVaultFile(frictionCreateRoot, frictionCreate.transaction_path), /transaction_state: pending/);
      await assert.rejects(() => readVaultFile(frictionCreateRoot, "memory/review/friction.md"), /ENOENT/);

      const frictionHome = JSON.parse(
        (await workbench.handleWorkbenchRoute(frictionCreateRoot, { method: "GET", url: "/api/dogfood/home" })).body
      );
      assert.equal(frictionHome.recent_friction_logs.length, 1);
      assert.equal(frictionHome.recent_friction_logs[0].kind, "retrieval_miss");
      assert.equal(frictionHome.recent_friction_logs[0].question, "What is the Neptune deploy key?");
    } finally {
      await rm(frictionCreateRoot, { recursive: true, force: true });
    }

    const oldOpenAiKey = process.env.OPENAI_API_KEY;
    const oldOpenAiModel = process.env.ASSISTO_OPENAI_MODEL;

    try {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ASSISTO_OPENAI_MODEL;

      const draftPreview = JSON.parse(
        (
          await workbench.handleWorkbenchRoute(root, {
            method: "POST",
            url: "/api/ask/draft/preview",
            body: JSON.stringify({ question: "Who is my manager?" })
          })
        ).body
      );

      assert.equal(draftPreview.provider_name, "openai");
      assert.equal(draftPreview.answer_text, "");
      assert.equal(draftPreview.basis.answerCandidates.some((candidate) => candidate.claim_id === "clm_jeff_manager"), true);
      assert.equal(draftPreview.warnings.some((warning) => /OPENAI_API_KEY/.test(warning)), true);
      assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);
    } finally {
      if (oldOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = oldOpenAiKey;
      }

      if (oldOpenAiModel === undefined) {
        delete process.env.ASSISTO_OPENAI_MODEL;
      } else {
        process.env.ASSISTO_OPENAI_MODEL = oldOpenAiModel;
      }
    }

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

    const recentBrief = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "GET",
          url: "/api/brief?kind=recent&targetKind=person&target=per_jeff"
        })
      ).body
    );
    assert.equal(recentBrief.kind, "recent");
    assert.equal(recentBrief.target.id, "per_jeff");
    assert.match(recentBrief.contextPack, /# Session brief: Recent changes: Jeff/);

    const invalidBriefTargetKind = await workbench.handleWorkbenchRoute(root, {
      method: "GET",
      url: "/api/brief?kind=recent&targetKind=topic"
    });
    assert.equal(invalidBriefTargetKind.status, 400);
    assert.match(JSON.parse(invalidBriefTargetKind.body).error, /Invalid query parameter targetKind/);

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

    const entities = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/entities?kind=person" })).body
    );
    assert.equal(entities.kind, "person");
    assert.equal(entities.items.some((item) => item.id === "per_jeff" && item.active_claims === 1), true);

    const entityDetail = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/entities/detail?id=per_jeff" })).body
    );
    assert.equal(entityDetail.id, "per_jeff");
    assert.equal(entityDetail.activeClaims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(entityDetail.evidenceEvents.some((event) => event.id === "ev_2026_05_21_001"), true);
    assert.equal(entityDetail.linkedFollowUps.some((followup) => followup.id === "fu_ask_jeff"), true);

    const contextEntityDetail = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/entities/detail?id=ctx_inventory_project" })).body
    );
    assert.equal(contextEntityDetail.contextOperatingPage.context_id, "ctx_inventory_project");
    assert.equal(contextEntityDetail.contextOperatingPage.roleClaims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);

    const contextDashboard = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/contexts/dashboard?id=ctx_inventory_project" })).body
    );
    assert.equal(contextDashboard.context.id, "ctx_inventory_project");
    assert.equal(contextDashboard.role_claims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(contextDashboard.followups.some((followup) => followup.id === "fu_ask_jeff"), true);
    assert.equal(contextDashboard.citations.page_paths.includes("memory/contexts/inventory-project.md"), true);

    const unknownContextDashboard = await workbench.handleWorkbenchRoute(root, {
      method: "GET",
      url: "/api/contexts/dashboard?id=ctx_missing"
    });
    assert.equal(unknownContextDashboard.status, 404);

    const entityAliasPreview = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/entities/alias/preview",
          body: JSON.stringify({ id: "per_jeff", alias: "Jeffrey" })
        })
      ).body
    );
    assert.equal(entityAliasPreview.action, "stage_entity_alias");
    assert.equal(entityAliasPreview.created, false);
    assert.equal(entityAliasPreview.validation.passed, true);
    assert.deepEqual(entityAliasPreview.operations, ["UPSERT_CLAIM"]);
    assert.equal(entityAliasPreview.proposed_file_writes[0].path, "memory/people/jeff.md");
    assert.match(entityAliasPreview.proposed_file_writes[0].content, /- Jeffrey/);
    await assert.rejects(() => readVaultFile(root, entityAliasPreview.transaction_path), /ENOENT/);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);

    const entityAliasStage = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/entities/alias/stage",
          body: JSON.stringify({ id: "per_jeff", alias: "Jeffrey" })
        })
      ).body
    );
    assert.equal(entityAliasStage.action, "stage_entity_alias");
    assert.equal(entityAliasStage.created, true);
    assert.match(await readVaultFile(root, entityAliasStage.transaction_path), /Stage alias "Jeffrey"/);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);

    const unresolvedContextPreview = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/entities/context/preview",
          body: JSON.stringify({ id: "per_jeff", context: "No Such Project" })
        })
      ).body
    );
    assert.equal(unresolvedContextPreview.action, "stage_entity_context");
    assert.equal(unresolvedContextPreview.created, false);
    assert.deepEqual(unresolvedContextPreview.operations, ["STAGE_REVIEW"]);
    assert.match(unresolvedContextPreview.proposed_file_writes[0].path, /^memory\/review\/rev_entity_context_resolution_/);
    await assert.rejects(() => readVaultFile(root, unresolvedContextPreview.proposed_file_writes[0].path), /ENOENT/);

    const beforeContextPage = await readVaultFile(root, "memory/contexts/inventory-project.md");
    const contextNotePreview = JSON.parse(
      (
        await workbench.handleWorkbenchRoute(root, {
          method: "POST",
          url: "/api/entities/context-note/preview",
          body: JSON.stringify({
            id: "ctx_inventory_project",
            noteType: "correction",
            note: "Inventory Project uses PostgreSQL for reporting."
          })
        })
      ).body
    );
    assert.equal(contextNotePreview.action, "stage_context_note");
    assert.equal(contextNotePreview.created, false);
    assert.equal(contextNotePreview.context_path, "memory/contexts/inventory-project.md");
    await assert.rejects(() => readVaultFile(root, contextNotePreview.transaction_path), /ENOENT/);
    assert.equal(await readVaultFile(root, "memory/contexts/inventory-project.md"), beforeContextPage);

    const contextNoteRoot = await makeTempVault("assisto-workbench-context-note-route-");

    try {
      await writeWorkbenchFixture(contextNoteRoot);
      const beforeContextNotePage = await readVaultFile(contextNoteRoot, "memory/contexts/inventory-project.md");
      const contextNoteStage = JSON.parse(
        (
          await workbench.handleWorkbenchRoute(contextNoteRoot, {
            method: "POST",
            url: "/api/entities/context-note/stage",
            body: JSON.stringify({
              id: "ctx_inventory_project",
              noteType: "correction",
              note: "Inventory Project uses PostgreSQL for reporting."
            })
          })
        ).body
      );
      assert.equal(contextNoteStage.action, "stage_context_note");
      assert.equal(contextNoteStage.created, true);
      assert.match(await readVaultFile(contextNoteRoot, contextNoteStage.event_path), /source_label: context_correction:ctx_inventory_project/);
      assert.match(await readVaultFile(contextNoteRoot, contextNoteStage.transaction_path), /transaction_state: pending/);
      assert.equal(await readVaultFile(contextNoteRoot, "memory/contexts/inventory-project.md"), beforeContextNotePage);
    } finally {
      await rm(contextNoteRoot, { recursive: true, force: true });
    }

    const entitiesWithoutKind = await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/entities" });
    assert.equal(entitiesWithoutKind.status, 400);

    const missingEntityDetail = await workbench.handleWorkbenchRoute(root, {
      method: "GET",
      url: "/api/entities/detail?id=per_missing"
    });
    assert.equal(missingEntityDetail.status, 404);

    await writeVaultFile(root, "memory/followups/broken.md", "---\nid: fu_broken\n");
    await writeVaultFile(root, "memory/topics/broken.md", "---\nid: top_broken\n");

    const followups = JSON.parse(
      (await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/followups" })).body
    );
    assert.equal(followups.items.some((item) => item.id === "fu_ask_jeff"), true);
    assert.equal(followups.warnings.some((warning) => warning.path === "memory/followups/broken.md"), true);

    const health = JSON.parse((await workbench.handleWorkbenchRoute(root, { method: "GET", url: "/api/health" })).body);
    assert.equal(health.counts.pending_transactions, 3);
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
