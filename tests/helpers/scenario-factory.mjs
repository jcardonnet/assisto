import { mkdir } from "node:fs/promises";
import path from "node:path";
import { writeWorkbenchFixture } from "../workbench.mjs";
import { makeTempVault, writeVaultFile } from "./temp-vault.mjs";

const scenarioWriters = {
  "manager-chain": writeManagerChainScenario,
  "review-backlog": writeReviewBacklogScenario,
  "stale-noop": writeStaleNoopScenario,
  "context-project": writeContextProjectScenario,
  "duplicate-import": writeDuplicateImportScenario,
  "conflicting-role-claims": writeConflictingRoleScenario,
  "missing-evidence": writeMissingEvidenceScenario,
  "retrieval-no-match": writeRetrievalNoMatchScenario
};

export const scenarioNames = Object.freeze(Object.keys(scenarioWriters));

export async function makeScenarioVault(name, options = {}) {
  if (options.root !== undefined) {
    return options.root;
  }
  return await makeTempVault(options.prefix ?? `assisto-${name}-`);
}

export async function createScenarioVault(name, options = {}) {
  if (!scenarioNames.includes(name)) {
    throw new Error(`Unknown scenario: ${name}`);
  }

  const root = await makeScenarioVault(name, options);
  await scenarioWriters[name](root);
  return { root, name };
}

export async function writeContextProjectScenario(root) {
  await writeWorkbenchFixture(root);
}

export async function writeReviewBacklogScenario(root) {
  await writeWorkbenchFixture(root);
}

export async function writeStaleNoopScenario(root) {
  await writeWorkbenchFixture(root);
}

export async function writeDuplicateImportScenario(root) {
  await writeVaultFile(
    root,
    "notes/import-a.md",
    "Jeff is my manager.\n\nI need to ask Jeff about the warehouse rollout.\n"
  );
  await writeVaultFile(
    root,
    "notes/import-b.md",
    "Jeff is my manager.\n\nI need to ask Jeff about the warehouse rollout.\n"
  );
}

export async function writeManagerChainScenario(root) {
  await writeVaultFile(
    root,
    "memory/events/2026/2026-05/2026-05-21-001.md",
    `---
id: ev_manager_chain_001
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-21T10:00:00.000Z
observed_at: 2026-05-21
source_type: user_note
source_actor: user
participants: []
topics: []
contexts: []
derived_claims: []
transactions: []
---

# Event ev_manager_chain_001

## Raw text

Kuastav reports to Jeff. Jeff is my manager.
`
  );
  await writeVaultFile(
    root,
    "memory/people/kuastav.md",
    `---
id: per_kuastav
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00.000Z
updated_at: 2026-05-21T10:00:00.000Z
aliases: []
source_events:
  - ev_manager_chain_001
related:
  - per_jeff
summary_generated_from:
  - clm_kuastav_reports_to_jeff
---

# Kuastav

## Active claims

- claim_id: clm_kuastav_reports_to_jeff
  statement: Kuastav reports to Jeff.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: null
  scope_state: complete
  evidence: [ev_manager_chain_001]
  recorded_at: 2026-05-21T10:00:00.000Z
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`
  );
  await writeVaultFile(
    root,
    "memory/people/jeff.md",
    `---
id: per_jeff
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00.000Z
updated_at: 2026-05-21T10:00:00.000Z
aliases: []
source_events:
  - ev_manager_chain_001
related:
  - per_kuastav
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
  scope: null
  scope_state: complete
  evidence: [ev_manager_chain_001]
  recorded_at: 2026-05-21T10:00:00.000Z
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`
  );
}

export async function writeConflictingRoleScenario(root) {
  await writeManagerChainScenario(root);
  await writeVaultFile(
    root,
    "memory/review/role-conflict.md",
    `---
id: rev_role_conflict
type: review_item
object_state: active
review_state: staged
review_reason: role_change
created_at: 2026-05-22T10:00:00.000Z
updated_at: 2026-05-22T10:00:00.000Z
source_events:
  - ev_manager_chain_001
affected_files:
  - memory/people/jeff.md
linked_transaction: tx_role_conflict
---

# Review rev_role_conflict

## Staged claim

- claim_id: clm_jeff_role_cto
  statement: Jeff is the CTO.
  claim_kind: fact
  claim_state: staged
  evidence_strength: explicit
  scope: null
  scope_state: complete
  evidence: [ev_manager_chain_001]
  recorded_at: 2026-05-22T10:00:00.000Z
  observed_at: 2026-05-22
  valid_from: null
  valid_to: null
`
  );
}

export async function writeMissingEvidenceScenario(root) {
  await writeVaultFile(
    root,
    "memory/topics/mysql.md",
    `---
id: top_mysql
type: topic
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00.000Z
updated_at: 2026-05-21T10:00:00.000Z
aliases: []
source_events: []
related: []
summary_generated_from:
  - clm_mysql_missing_evidence
---

# MySQL

## Active claims

- claim_id: clm_mysql_missing_evidence
  statement: Inventory uses MySQL.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: null
  scope_state: complete
  evidence: [ev_missing]
  recorded_at: 2026-05-21T10:00:00.000Z
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`
  );
}

export async function writeRetrievalNoMatchScenario(root) {
  await writeEmptyUsableVault(root);
}

async function writeEmptyUsableVault(root) {
  await mkdir(path.join(root, "memory/schema"), { recursive: true });
  await mkdir(path.join(root, "memory/events"), { recursive: true });
}
