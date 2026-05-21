import assert from "node:assert/strict";
import { loadTsModule } from "./ts-module-loader.mjs";

const eventDoc = `---
id: ev_2026_05_20_001
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-20T12:00:00-03:00
observed_at: null
source_type: user_note
source_actor: user
participants: []
topics: []
contexts: []
derived_claims: []
transactions: []
---

# Event ev_2026_05_20_001

## Raw text

Joe is the DBA.
`;

const personWithActiveClaim = `---
id: per_joe
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-20T12:00:00-03:00
updated_at: 2026-05-20T12:00:00-03:00
aliases: []
source_events:
  - ev_2026_05_20_001
related: []
summary_generated_from:
  - clm_joe_role_dba
---

# Joe

## Current summary

Joe is the DBA.

## Active claims

- claim_id: clm_joe_role_dba
  statement: Joe is the DBA.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: current-work-context
  scope_state: partial
  evidence: [ev_2026_05_20_001]
  recorded_at: 2026-05-20T12:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
`;

const personWithStagedInference = `---
id: per_mike
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-20T12:05:00-03:00
updated_at: 2026-05-20T12:05:00-03:00
aliases: []
source_events:
  - ev_2026_05_20_001
related: []
summary_generated_from: []
---

# Mike

## Current summary

## Inferences

- claim_id: clm_mike_comm_guidance_stats
  statement: Statistical framing may be useful when explaining technical trade-offs to Mike.
  claim_kind: inference
  claim_state: staged
  evidence_strength: inferred
  scope: communication-guidance
  scope_state: partial
  evidence: [ev_2026_05_20_001]
  recorded_at: 2026-05-20T12:05:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
`;

const topicWithUnknownScope = `---
id: top_mysql
type: topic
object_state: active
review_state: reviewed
created_at: 2026-05-20T12:00:00-03:00
updated_at: 2026-05-20T12:00:00-03:00
aliases: []
source_events:
  - ev_2026_05_20_001
related: []
---

# MySQL

## Active claims

- claim_id: clm_mysql_used
  statement: We use MySQL.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: null
  scope_state: unknown
  evidence: [ev_2026_05_20_001]
  recorded_at: 2026-05-20T12:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
`;

const committedFollowupWithoutTrigger = `---
id: fol_send_numbers
type: followup
object_state: active
review_state: staged
followup_state: committed
created_at: 2026-05-20T12:00:00-03:00
updated_at: 2026-05-20T12:00:00-03:00
owner: user
due_at: null
source_events:
  - ev_2026_05_20_001
related: []
---

# Send numbers

## Action

Send Joe the numbers.
`;

const transactionWithoutRollback = `---
id: tx_2026_05_20_001
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

# Transaction tx_2026_05_20_001

## Intent

Capture a note.

## Rollback / repair notes
`;

function errorCodes(result) {
  return result.errors.map((error) => error.code);
}

export async function runCoreValidatorTests() {
  const validators = await loadTsModule("packages/core/src/validators/index.ts");

  const event = validators.toValidationDocument("events/2026/2026-05/2026-05-20-001.md", eventDoc);
  const person = validators.toValidationDocument("people/joe.md", personWithActiveClaim);

  assert.equal(validators.validateDocuments({ documents: [event, person] }).passed, true);

  const missingEvidence = validators.toValidationDocument(
    "people/joe.md",
    personWithActiveClaim.replace("evidence: [ev_2026_05_20_001]", "evidence: []")
  );
  assert.deepEqual(errorCodes(validators.validateSourceEventLinks({ documents: [event, missingEvidence] })), [
    "ACTIVE_CLAIM_MISSING_EVENT_EVIDENCE"
  ]);

  const invalidEnum = validators.toValidationDocument(
    "people/joe.md",
    personWithActiveClaim.replace("object_state: active", "object_state: deleted")
  );
  assert.deepEqual(errorCodes(validators.validateFrontmatter(invalidEnum)), [
    "INVALID_FRONTMATTER_ENUM"
  ]);

  const duplicateResult = validators.validateUniqueIds([
    person,
    validators.toValidationDocument("people/joe-copy.md", personWithActiveClaim)
  ]);
  assert.equal(errorCodes(duplicateResult).includes("DUPLICATE_PAGE_ID"), true);
  assert.equal(errorCodes(duplicateResult).includes("DUPLICATE_CLAIM_ID"), true);

  const unknownScope = validators.toValidationDocument("topics/mysql.md", topicWithUnknownScope);
  assert.deepEqual(errorCodes(validators.validateNoActiveSystemClaimWithScopeUnknown(unknownScope)), [
    "ACTIVE_SYSTEM_CLAIM_UNKNOWN_SCOPE"
  ]);

  const followup = validators.toValidationDocument(
    "followups/send-numbers.md",
    committedFollowupWithoutTrigger
  );
  assert.deepEqual(errorCodes(validators.validateNoCommittedFollowupWithoutTrigger(followup)), [
    "COMMITTED_FOLLOWUP_MISSING_TRIGGER"
  ]);

  const stagedInference = validators.toValidationDocument("people/mike.md", personWithStagedInference);
  assert.equal(validators.validateClaimBlocks(stagedInference).passed, true);
  assert.equal(
    validators.validateSourceEventLinks({
      documents: [stagedInference],
      existingEventIds: ["ev_2026_05_20_001"]
    }).passed,
    true
  );

  const transaction = validators.toValidationDocument(
    "transactions/pending/tx-2026-05-20-001.md",
    transactionWithoutRollback
  );
  assert.deepEqual(errorCodes(validators.validateTransactionRollback(transaction)), [
    "TRANSACTION_ROLLBACK_MISSING"
  ]);
}

