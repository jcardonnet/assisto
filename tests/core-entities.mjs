import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeTempVault, readVaultFile, writeVaultFile } from "./helpers/temp-vault.mjs";
import { writeBriefFixture } from "./core-briefs.mjs";

export async function runCoreEntityTests() {
  const entities = await loadTsModule("packages/core/src/entities/index.ts");
  const root = await makeTempVault("assisto-entities-");

  try {
    await writeBriefFixture(root);
    await writeEntityStewardshipFixtures(root);

    const people = await entities.listEntities(root, "person");
    assert.equal(people.some((item) => item.id === "per_jeff" && item.active_claims === 1), true);

    const detail = await entities.getEntityDetail(root, "per_jeff");
    assert.equal(detail.id, "per_jeff");
    assert.equal(detail.activeClaims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(detail.evidenceEvents.some((event) => event.id === "ev_2026_05_21_001"), true);
    assert.equal(detail.linkedFollowUps.some((followup) => followup.id === "fu_ask_jeff"), true);
    assert.equal(detail.relatedPages.some((page) => page.id === "ctx_inventory_project"), true);

    await writeContextOperatingFixtures(root);
    const contextDetail = await entities.getEntityDetail(root, "ctx_inventory_project");
    assert.equal(contextDetail.type, "context");
    assert.equal(contextDetail.contextOperatingPage.context_id, "ctx_inventory_project");
    assert.equal(contextDetail.contextOperatingPage.activeFacts.some((claim) => claim.claim_id === "clm_inventory_uses_mysql"), true);
    assert.equal(contextDetail.contextOperatingPage.roleClaims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(contextDetail.contextOperatingPage.decisionClaims.some((claim) => claim.claim_id === "clm_inventory_decision_mysql"), true);
    assert.equal(contextDetail.contextOperatingPage.openQuestionClaims.some((claim) => claim.claim_id === "clm_inventory_open_question"), true);
    assert.equal(contextDetail.contextOperatingPage.ownerClaims.some((claim) => claim.claim_id === "clm_inventory_owner"), true);
    assert.equal(contextDetail.contextOperatingPage.relatedPeople.some((page) => page.id === "per_jeff"), true);
    assert.equal(contextDetail.contextOperatingPage.relatedTopics.some((page) => page.id === "top_mysql"), true);
    assert.equal(contextDetail.contextOperatingPage.openFollowUps.some((followup) => followup.id === "fu_ask_jeff"), true);
    assert.equal(contextDetail.contextOperatingPage.recentChanges.some((claim) => claim.claim_id === "clm_inventory_decision_mysql"), true);

    const dashboard = await entities.buildContextDashboardResult(root, "ctx_inventory_project", {
      now: "2026-05-24T13:00:00-03:00"
    });

    assert.equal(dashboard.context.id, "ctx_inventory_project");
    assert.equal(dashboard.context.path, "memory/contexts/inventory-project.md");
    assert.equal(dashboard.active_facts.some((claim) => claim.claim_id === "clm_inventory_uses_mysql"), true);
    assert.equal(dashboard.role_claims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(dashboard.decision_claims.some((claim) => claim.claim_id === "clm_inventory_decision_mysql"), true);
    assert.equal(dashboard.open_question_claims.some((claim) => claim.claim_id === "clm_inventory_open_question"), true);
    assert.equal(dashboard.owner_claims.some((claim) => claim.claim_id === "clm_inventory_owner"), true);
    assert.equal(dashboard.stale_claims.some((claim) => claim.claim_id === "clm_inventory_old_owner"), true);
    assert.equal(dashboard.followups.some((followup) => followup.id === "fu_ask_jeff"), true);
    assert.equal(dashboard.review_items.some((item) => item.id === "rev_inventory_context_risk"), true);
    assert.equal(dashboard.evidence_events.some((event) => event.id === "ev_2026_05_21_003"), true);
    assert.equal(dashboard.related_people.some((page) => page.id === "per_jeff"), true);
    assert.equal(dashboard.related_topics.some((page) => page.id === "top_mysql"), true);
    assert.equal(dashboard.quick_briefs.some((brief) => brief.kind === "context" && brief.target === "ctx_inventory_project"), true);
    assert.equal(dashboard.citations.event_ids.includes("ev_2026_05_21_003"), true);
    assert.equal(dashboard.citations.page_paths.includes("memory/contexts/inventory-project.md"), true);
    assert.match(dashboard.warnings.join("\n"), /derived/);

    await assert.rejects(
      () => entities.buildContextDashboardResult(root, "per_jeff"),
      /Context dashboard target must be a Context/
    );

    const beforeContext = await readVaultFile(root, "memory/contexts/inventory-project.md");
    const contextNote = await entities.createContextNoteTransaction(root, "ctx_inventory_project", "Inventory Project uses PostgreSQL for reporting.", {
      now: "2026-05-24T12:00:00-03:00",
      noteType: "correction"
    });

    assert.equal(contextNote.action, "stage_context_note");
    assert.equal(contextNote.created, true);
    assert.equal(contextNote.context_id, "ctx_inventory_project");
    assert.equal(contextNote.context_path, "memory/contexts/inventory-project.md");
    assert.equal(contextNote.validation.passed, true);
    assert.equal(contextNote.event_path.startsWith("memory/events/2026/2026-05/2026-05-24-"), true);
    assert.match(await readVaultFile(root, contextNote.event_path), /source_label: context_correction:ctx_inventory_project/);
    assert.match(await readVaultFile(root, contextNote.event_path), /ctx_inventory_project/);
    assert.match(await readVaultFile(root, contextNote.transaction_path), /transaction_state: pending/);
    assert.equal(await readVaultFile(root, "memory/contexts/inventory-project.md"), beforeContext);

    const beforeJeff = await readVaultFile(root, "memory/people/jeff.md");
    const alias = await entities.createEntityAliasTransaction(root, "per_jeff", "Jeffrey", {
      now: "2026-05-24T12:00:00-03:00",
      note: "Jeff confirmed this alias."
    });

    assert.equal(alias.action, "stage_entity_alias");
    assert.equal(alias.created, true);
    assert.equal(alias.validation.passed, true);
    assert.deepEqual(alias.operations, ["UPSERT_CLAIM"]);
    assert.equal(alias.affected_files.includes("people/jeff.md"), true);
    assert.match(alias.proposed_file_writes[0].content, /- Jeffrey/);
    assert.match(await readVaultFile(root, alias.transaction_path), /Stage alias "Jeffrey"/);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);

    const aliasConflict = await entities.createEntityAliasTransaction(root, "per_jeff", "Jefe", {
      now: "2026-05-24T12:00:00-03:00"
    });

    assert.deepEqual(aliasConflict.operations, ["STAGE_REVIEW"]);
    assert.equal(aliasConflict.transaction.requires_review, true);
    assert.match(aliasConflict.proposed_file_writes[0].path, /^memory\/review\/rev_entity_alias_conflict_/);
    assert.match(aliasConflict.proposed_file_writes[0].content, /Alias "Jefe" already appears/);
    await assert.rejects(() => readVaultFile(root, aliasConflict.proposed_file_writes[0].path), /ENOENT/);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);

    const beforeRedis = await readVaultFile(root, "memory/topics/redis.md");
    const contextLink = await entities.createEntityContextTransaction(root, "top_redis", "Warehouse Project", {
      now: "2026-05-24T12:00:00-03:00"
    });

    assert.equal(contextLink.validation.passed, true);
    assert.deepEqual(contextLink.operations, ["UPSERT_CLAIM"]);
    assert.match(contextLink.proposed_file_writes[0].content, /- ctx_inventory_project/);
    assert.equal(await readVaultFile(root, "memory/topics/redis.md"), beforeRedis);

    const contextReview = await entities.createEntityContextTransaction(root, "top_redis", "No Such Project", {
      now: "2026-05-24T12:00:00-03:00",
      note: "Human needs to choose the scope."
    });

    assert.deepEqual(contextReview.operations, ["STAGE_REVIEW"]);
    assert.match(contextReview.proposed_file_writes[0].path, /^memory\/review\/rev_entity_context_resolution_/);
    assert.match(contextReview.proposed_file_writes[0].content, /Context "No Such Project" did not resolve exactly/);
    assert.equal(await readVaultFile(root, "memory/topics/redis.md"), beforeRedis);

    const roleRepair = await entities.createEntityRoleTransaction(root, "per_jeff", "Jeff is the platform DBA.", {
      now: "2026-05-24T12:00:00-03:00",
      context: "ctx_inventory_project",
      supersedeClaimId: "clm_jeff_manager",
      note: "Human selected the old manager claim to supersede."
    });

    assert.equal(roleRepair.action, "stage_entity_role");
    assert.equal(roleRepair.validation.passed, true);
    assert.deepEqual(roleRepair.operations, ["SUPERSEDE_CLAIM", "UPSERT_CLAIM"]);
    assert.equal(roleRepair.transaction.requires_review, true);
    assert.match(roleRepair.proposed_file_writes[0].content, /claim_state: superseded/);
    assert.match(roleRepair.proposed_file_writes[0].content, /statement: Jeff is the platform DBA\./);
    assert.match(roleRepair.proposed_file_writes[0].content, /claim_state: staged/);
    assert.match(roleRepair.proposed_file_writes[0].content, /scope: ctx_inventory_project/);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);

    const reportingRepair = await entities.createEntityReportingTransaction(root, "per_jeff", "Jeff reports to Dana.", {
      now: "2026-05-24T12:00:00-03:00"
    });

    assert.equal(reportingRepair.action, "stage_entity_reporting");
    assert.deepEqual(reportingRepair.operations, ["UPSERT_CLAIM"]);
    assert.match(reportingRepair.proposed_file_writes[0].content, /statement: Jeff reports to Dana\./);
    assert.match(reportingRepair.proposed_file_writes[0].content, /scope_state: unknown/);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);

    const identityReview = await entities.createEntityIdentityReviewTransaction(root, "per_jeff", {
      now: "2026-05-24T12:00:00-03:00",
      reason: "Jeff may be duplicated with Jeffrey."
    });

    assert.equal(identityReview.action, "stage_entity_identity_review");
    assert.deepEqual(identityReview.operations, ["STAGE_REVIEW"]);
    assert.equal(identityReview.transaction.requires_review, true);
    assert.match(identityReview.proposed_file_writes[0].path, /^memory\/review\/rev_entity_identity_review_/);
    assert.match(identityReview.proposed_file_writes[0].content, /Identity review requested for Jeff/);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeEntityStewardshipFixtures(root) {
  await writeVaultFile(
    root,
    "memory/people/joe-sales.md",
    `---
id: per_joe_sales
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases:
  - Jefe
source_events:
  - ev_2026_05_21_001
related: []
summary_generated_from:
  - clm_joe_sales
---

# Joe Sales

## Active claims

- claim_id: clm_joe_sales
  statement: Joe Sales works with Jeff.
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
    "memory/topics/redis.md",
    `---
id: top_redis
type: topic
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
  - ev_2026_05_21_001
related: []
summary_generated_from:
  - clm_redis_cache
---

# Redis

## Active claims

- claim_id: clm_redis_cache
  statement: Redis is being evaluated for cache work.
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
}

async function writeContextOperatingFixtures(root) {
  const contextPage = await readVaultFile(root, "memory/contexts/inventory-project.md");

  await writeVaultFile(
    root,
    "memory/contexts/inventory-project.md",
    `${contextPage.trimEnd()}

- claim_id: clm_inventory_decision_mysql
  statement: Decision: Inventory Project will keep MySQL for catalog storage.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_2026_05_21_003]
  recorded_at: 2026-05-22T10:00:00-03:00
  observed_at: 2026-05-22
  valid_from: null
  valid_to: null

- claim_id: clm_inventory_open_question
  statement: Open question: Inventory Project needs to confirm the reporting dashboard owner.
  claim_kind: assumption
  claim_state: active
  evidence_strength: explicit
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_2026_05_21_003]
  recorded_at: 2026-05-22T10:05:00-03:00
  observed_at: 2026-05-22
  valid_from: null
  valid_to: null

- claim_id: clm_inventory_owner
  statement: Jeff owns Inventory Project coordination.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_2026_05_21_003]
  recorded_at: 2026-05-22T10:10:00-03:00
  observed_at: 2026-05-22
  valid_from: null
  valid_to: null

- claim_id: clm_inventory_old_owner
  statement: Joe previously owned Inventory Project coordination.
  claim_kind: fact
  claim_state: superseded
  evidence_strength: explicit
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_2026_05_21_003]
  recorded_at: 2026-05-20T10:10:00-03:00
  observed_at: 2026-05-20
  valid_from: null
  valid_to: 2026-05-21
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
recorded_at: 2026-05-22T10:00:00-03:00
observed_at: 2026-05-22
source_type: user_note
source_actor: user
participants: []
topics: []
contexts:
  - ctx_inventory_project
derived_claims: []
transactions: []
---

# Event ev_2026_05_21_003

## Raw text

Decision: Inventory Project will keep MySQL. Open question: confirm dashboard owner. Jeff owns coordination.
`
  );
  await writeVaultFile(
    root,
    "memory/review/inventory-context-risk.md",
    `---
id: rev_inventory_context_risk
type: review_item
object_state: active
review_state: staged
review_reason: context_open_question
created_at: 2026-05-22T11:00:00-03:00
updated_at: 2026-05-22T11:00:00-03:00
source_events:
  - ev_2026_05_21_003
affected_files:
  - contexts/inventory-project.md
linked_transaction: tx_inventory_context_risk
---

# Review rev_inventory_context_risk

Inventory Project has an open question that should be resolved before relying on the dashboard as complete.
`
  );
}
