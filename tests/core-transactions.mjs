import assert from "node:assert/strict";
import { loadTsModule } from "./ts-module-loader.mjs";

const docsTransactionExample = `---
id: tx_2026_05_20_001
type: transaction
transaction_state: pending
created_at: 2026-05-20T12:00:00-03:00
source_events:
  - ev_2026_05_20_001
operations:
  - ADD_EVENT
  - UPSERT_CLAIM
  - STAGE_REVIEW
affected_files:
  - events/2026/2026-05/2026-05-20-001.md
  - people/joe.md
  - topics/mysql.md
  - review/unscoped-claims.md
risk_level: medium
requires_review: true
validation_state: not_run
validation_errors: []
---

# Transaction tx_2026_05_20_001

## Intent

Capture a user note about Joe and MySQL. Add the explicit Joe role claim. Stage the MySQL claim because the system/project/team scope is unknown.

## Proposed operations

- ADD_EVENT: create \`events/2026/2026-05/2026-05-20-001.md\`
- UPSERT_CLAIM: add \`clm_joe_role_dba\` to \`people/joe.md\`
- STAGE_REVIEW: add \`clm_mysql_used_unknown_scope\` to \`review/unscoped-claims.md\`
- NOOP: create no follow-up

## Proposed changes

### Create

- \`events/2026/2026-05/2026-05-20-001.md\`

### Modify

- \`people/joe.md\`
- \`topics/mysql.md\`

### Stage

- \`review/unscoped-claims.md\`

## Validation checklist

- [ ] All new IDs are unique
- [ ] All wikilinks resolve
- [ ] All active claims cite Event IDs
- [ ] No committed follow-up exists without explicit trigger
- [ ] No active system/context claim has \`scope_state: unknown\`
- [ ] No ambiguous entity update bypasses review
- [ ] Summaries are generated from active claims only
- [ ] Transaction risk level is set
- [ ] Rollback/repair notes are present

## Rollback / repair notes

If partially applied, preserve the Event, remove \`clm_joe_role_dba\` from \`people/joe.md\` if necessary, keep the MySQL claim staged, mark this transaction failed, and append a failure entry to \`logs/ingest-log.md\`.

## Application log

Pending.
`;

const missingRollbackTransaction = `---
id: tx_2026_05_20_002
type: transaction
transaction_state: pending
created_at: 2026-05-20T12:00:00-03:00
source_events:
  - ev_2026_05_20_001
operations:
  - ADD_EVENT
affected_files:
  - events/2026/2026-05/2026-05-20-001.md
---

# Transaction tx_2026_05_20_002

## Intent

Capture a user note.

## Rollback / repair notes
`;

function errorCodes(result) {
  return result.errors.map((error) => error.code);
}

export async function runCoreTransactionTests() {
  const transactions = await loadTsModule("packages/core/src/transactions/index.ts");
  const validators = await loadTsModule("packages/core/src/validators/index.ts");

  const parsed = transactions.parseTransactionMarkdown(docsTransactionExample);
  assert.equal(parsed.id, "tx_2026_05_20_001");
  assert.equal(parsed.transaction_state, "pending");
  assert.deepEqual(
    parsed.operations.map((operation) => operation.operation),
    ["ADD_EVENT", "UPSERT_CLAIM", "STAGE_REVIEW"]
  );
  assert.equal(parsed.operations[0].description, "create `events/2026/2026-05/2026-05-20-001.md`");
  assert.equal(parsed.risk_level, "medium");
  assert.equal(parsed.requires_review, true);
  assert.match(parsed.rollback_notes, /preserve the Event/);

  const serialized = transactions.serializeTransactionMarkdown(parsed);
  const reparsed = transactions.parseTransactionMarkdown(serialized);
  assert.equal(reparsed.id, parsed.id);
  assert.deepEqual(
    reparsed.operations.map((operation) => operation.operation),
    ["ADD_EVENT", "UPSERT_CLAIM", "STAGE_REVIEW"]
  );
  assert.match(reparsed.rollback_notes, /preserve the Event/);

  const draft = transactions.createTransactionDraft({
    id: "tx_2026_05_20_003",
    created_at: "2026-05-20T12:00:00-03:00",
    source_events: ["ev_2026_05_20_001"],
    operations: ["ADD_EVENT", { operation: "NOOP", description: "create no follow-up" }],
    affected_files: ["events/2026/2026-05/2026-05-20-001.md"],
    rollback_notes: "Preserve the Event and mark the transaction failed.",
    intent: "Create a deterministic draft."
  });
  assert.equal(draft.transaction_state, "pending");
  assert.deepEqual(
    draft.operations.map((operation) => operation.operation),
    ["ADD_EVENT", "NOOP"]
  );

  assert.throws(
    () => transactions.parseTransactionMarkdown(docsTransactionExample.replace("STAGE_REVIEW", "MERGE")),
    /Unsupported MVP operation: MERGE/
  );
  assert.throws(
    () =>
      transactions.createTransactionDraft({
        id: "tx_bad",
        created_at: "2026-05-20T12:00:00-03:00",
        source_events: [],
        operations: ["DELETE"],
        affected_files: [],
        rollback_notes: "n/a"
      }),
    /Unsupported MVP operation: DELETE/
  );

  const validationDoc = validators.toValidationDocument(
    "transactions/pending/tx-2026-05-20-002.md",
    missingRollbackTransaction
  );
  assert.deepEqual(errorCodes(validators.validateTransactionRollback(validationDoc)), [
    "TRANSACTION_ROLLBACK_MISSING"
  ]);

  assert.equal(
    transactions.transactionFilePaths.pending("tx_2026_05_20_001"),
    "memory/transactions/pending/tx_2026_05_20_001.md"
  );
  assert.equal(
    transactions.transactionFilePaths.applied("tx_2026_05_20_001"),
    "memory/transactions/applied/tx_2026_05_20_001.md"
  );
  assert.equal(
    transactions.transactionFilePaths.rejected("tx_2026_05_20_001"),
    "memory/transactions/rejected/tx_2026_05_20_001.md"
  );
  assert.equal(
    transactions.transactionFilePaths.failed("tx_2026_05_20_001"),
    "memory/transactions/failed/tx_2026_05_20_001.md"
  );
}

