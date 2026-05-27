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
