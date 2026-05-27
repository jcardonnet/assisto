import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeTempVault, readVaultFile, writeVaultFile } from "./helpers/temp-vault.mjs";

export async function writeBriefFixture(root) {
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
  - top_mysql
summary_generated_from:
  - clm_inventory_uses_mysql
---

# Inventory Project

## Active claims

- claim_id: clm_inventory_uses_mysql
  statement: Inventory Project uses MySQL for catalog storage.
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
`
  );
  await writeVaultFile(
    root,
    "memory/topics/mysql.md",
    `---
id: top_mysql
type: topic
object_state: active
review_state: contested
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
  - ev_2026_05_21_002
related:
  - ctx_inventory_project
summary_generated_from:
  - clm_mysql_unknown_scope
---

# MySQL

## Staged claims

- claim_id: clm_mysql_unknown_scope
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

Ask Jeff to confirm the reporting path.
`
  );
  await writeVaultFile(
    root,
    "memory/followups/closed.md",
    `---
id: fu_closed
type: followup
object_state: active
review_state: reviewed
followup_state: closed
created_at: 2026-05-20T10:00:00-03:00
updated_at: 2026-05-20T10:00:00-03:00
owner: user
source_events:
  - ev_2026_05_21_001
related: []
---

# Follow-up: Closed
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

- claim_id: clm_mysql_unknown_scope
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

Jeff is my manager for the Inventory Project.
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
}

export async function runCoreBriefTests() {
  const briefs = await loadTsModule("packages/core/src/briefs/index.ts");
  const fsModule = await loadTsModule("packages/core/src/fs/index.ts");
  const root = await makeTempVault("assisto-briefs-");

  try {
    await writeBriefFixture(root);
    const beforeFiles = await fsModule.listMarkdownFiles(root, "memory/**/*.md");

    const person = await briefs.buildSessionBrief(root, {
      kind: "person",
      target: "per_jeff",
      now: "2026-05-22T12:00:00.000Z"
    });

    assert.equal(person.kind, "person");
    assert.equal(person.target?.id, "per_jeff");
    assert.equal(person.generated_at, "2026-05-22T12:00:00.000Z");
    assert.equal(person.activeClaims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(person.openFollowUps.some((followup) => followup.id === "fu_ask_jeff"), true);
    assert.equal(person.evidenceEvents.some((event) => event.id === "ev_2026_05_21_001"), true);
    assert.match(person.contextPack, /Generated explanations were not saved/);
    assert.match(person.contextPack, /Jeff is my manager/);

    const personTargets = await briefs.listSessionBriefTargets(root, "person");
    assert.deepEqual(personTargets, [
      {
        id: "per_jeff",
        path: "memory/people/jeff.md",
        type: "person",
        name: "Jeff",
        aliases: []
      }
    ]);

    const contextTargets = await briefs.listSessionBriefTargets(root, "context");
    assert.deepEqual(contextTargets, [
      {
        id: "ctx_inventory_project",
        path: "memory/contexts/inventory-project.md",
        type: "context",
        name: "Inventory Project",
        aliases: ["Warehouse Project"]
      }
    ]);

    const context = await briefs.buildSessionBrief(root, { kind: "context", target: "ctx_inventory_project" });
    assert.equal(context.target?.path, "memory/contexts/inventory-project.md");
    assert.equal(context.activeClaims.some((claim) => claim.claim_id === "clm_inventory_uses_mysql"), true);
    assert.equal(context.openFollowUps.some((followup) => followup.id === "fu_ask_jeff"), true);

    const review = await briefs.buildSessionBrief(root, { kind: "review" });
    assert.equal(review.reviewItems.some((item) => item.id === "rev_mysql_scope"), true);
    assert.equal(review.uncertainClaims.some((claim) => claim.claim_id === "clm_mysql_unknown_scope"), true);

    const followups = await briefs.buildSessionBrief(root, { kind: "followups" });
    assert.deepEqual(
      followups.openFollowUps.map((followup) => followup.id),
      ["fu_ask_jeff"]
    );
    assert.equal(followups.evidenceEvents.some((event) => event.id === "ev_2026_05_21_001"), true);

    const today = await briefs.buildSessionBrief(root, { kind: "today", now: "2026-05-21T23:59:00.000Z" });
    assert.equal(today.evidenceEvents.length, 2);
    assert.equal(today.warnings.some((warning) => /derived view/i.test(warning)), true);

    const afterFiles = await fsModule.listMarkdownFiles(root, "memory/**/*.md");
    assert.deepEqual(afterFiles, beforeFiles);
    assert.match(await readVaultFile(root, "memory/people/jeff.md"), /Jeff is my manager/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
