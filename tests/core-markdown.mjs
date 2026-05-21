import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import ts from "typescript";

async function loadMarkdownModule() {
  const source = readFileSync("packages/core/src/markdown/index.ts", "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true
    }
  }).outputText;
  const encoded = Buffer.from(output).toString("base64");

  return import(`data:text/javascript;base64,${encoded}`);
}

const eventExample = `---
id: ev_2026_05_20_001
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-20T12:00:00-03:00
observed_at: null
source_type: user_note
source_actor: user
participants: []
topics:
  - [[topics/mysql]]
contexts: []
derived_claims:
  - clm_joe_role_dba
  - clm_mysql_used_unknown_scope
transactions:
  - tx_2026_05_20_001
---

# Event ev_2026_05_20_001

## Raw text

Joe is the DBA. We use MySQL.

## Extraction candidates

- candidate_id: cand_joe_dba
  text: Joe is the DBA.
  candidate_kind: fact
  target_entities: [per_joe]
  scope_guess: current-work-context
  extraction_notes: Explicit person-role claim.

## Mutation result

- transaction: [[transactions/pending/tx-2026-05-20-001]]
- result: pending
`;

const personExample = `---
id: per_joe
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-20T12:00:00-03:00
updated_at: 2026-05-20T12:00:00-03:00
aliases: []
source_events:
  - ev_2026_05_20_001
related:
  - [[topics/mysql]]
summary_generated_at: 2026-05-20T12:00:00-03:00
summary_generated_from:
  - clm_joe_role_dba
---

# Joe

## Current summary

Joe is known in the current work context as a DBA.

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

## Open review items

- [[review/unscoped-claims]]
`;

const transactionExample = `---
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

Capture a user note about Joe and MySQL.

## Proposed operations

- ADD_EVENT: create \`events/2026/2026-05/2026-05-20-001.md\`
- UPSERT_CLAIM: add \`clm_joe_role_dba\` to \`people/joe.md\`
- STAGE_REVIEW: add \`clm_mysql_used_unknown_scope\` to \`review/unscoped-claims.md\`

## Rollback / repair notes

Preserve the Event if partially applied.
`;

export async function runCoreMarkdownTests() {
  const markdown = await loadMarkdownModule();

  const parsedEvent = markdown.parseMarkdownFile(eventExample);
  assert.equal(parsedEvent.frontmatter.id, "ev_2026_05_20_001");
  assert.equal(parsedEvent.frontmatter.type, "event");
  assert.deepEqual(parsedEvent.frontmatter.topics, ["[[topics/mysql]]"]);
  assert.equal(markdown.getSection(parsedEvent.body, "Raw text"), "Joe is the DBA. We use MySQL.");

  const parsedPerson = markdown.parseMarkdownFile(personExample);
  assert.equal(parsedPerson.frontmatter.id, "per_joe");
  assert.deepEqual(parsedPerson.frontmatter.source_events, ["ev_2026_05_20_001"]);

  const claims = markdown.parseClaimBlocks(parsedPerson.body);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].claim_id, "clm_joe_role_dba");
  assert.equal(claims[0].claim_state, "active");
  assert.equal(claims[0].claim_kind, "fact");
  assert.deepEqual(claims[0].evidence, ["ev_2026_05_20_001"]);
  assert.equal(claims[0].valid_from, null);

  const parsedTransaction = markdown.parseMarkdownFile(transactionExample);
  assert.equal(parsedTransaction.frontmatter.transaction_state, "pending");
  assert.equal(parsedTransaction.frontmatter.requires_review, true);
  assert.deepEqual(parsedTransaction.frontmatter.operations, [
    "ADD_EVENT",
    "UPSERT_CLAIM",
    "STAGE_REVIEW"
  ]);

  assert.deepEqual(markdown.parseWikilinks(`${eventExample}\n${personExample}`), [
    "topics/mysql",
    "transactions/pending/tx-2026-05-20-001",
    "review/unscoped-claims"
  ]);

  const replaced = markdown.replaceSection(parsedEvent.body, "Raw text", "Joe is the DBA.");
  assert.equal(markdown.getSection(replaced, "Raw text"), "Joe is the DBA.");

  const appended = markdown.appendToSection(replaced, "Notes", "Checked manually.");
  assert.equal(markdown.getSection(appended, "Notes"), "Checked manually.");

  const roundtrip = markdown.parseMarkdownFile(
    markdown.serializeMarkdownFile(parsedPerson.frontmatter, parsedPerson.body)
  );
  assert.equal(roundtrip.frontmatter.id, "per_joe");
  assert.deepEqual(roundtrip.frontmatter.related, ["[[topics/mysql]]"]);
  assert.equal(markdown.parseClaimBlocks(roundtrip.body).length, 1);
}

