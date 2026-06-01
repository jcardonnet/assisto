import assert from "node:assert/strict";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runEntityStewardshipV2Tests() {
  const entities = await loadTsModule("packages/core/src/entities/index.ts");

  const reportingResult = entities.buildEntityStewardshipV2({
    entity: { id: "person_kuastav", kind: "Person", name: "Kuastav" },
    claims: [
      { claim_id: "claim_old", text: "Kuastav reports to Mike.", claim_state: "superseded", source_events: ["event_old"] },
      { claim_id: "claim_new", text: "Kuastav reports to Jeff.", claim_state: "active", source_events: ["event_new"] }
    ],
    symbolicFacts: [
      {
        fact_id: "sym_fact_reporting",
        relation: "reports_to",
        subject_id: "person_kuastav",
        object_id: "person_jeff",
        source_claim_ids: ["claim_new"],
        source_events: ["event_new"],
        inference_rule: "canonical_frame"
      }
    ]
  });

  assert.equal(reportingResult.reportingChanges.length, 1);
  assert.equal(reportingResult.reportingChanges[0].from_claim_id, "claim_old");
  assert.equal(reportingResult.reportingChanges[0].to_claim_id, "claim_new");
  assert.equal(reportingResult.staleClaims.includes("claim_old"), true);
  assert.equal(reportingResult.symbolicFactIds.includes("sym_fact_reporting"), true);
  assert.equal(reportingResult.recommendedReviewLane, "reporting_change");

  const ownershipResult = entities.buildEntityStewardshipV2({
    entity: { id: "topic_mysql", kind: "Topic", name: "MySQL" },
    claims: [
      { claim_id: "claim_owner_old", text: "Mike owns MySQL.", claim_state: "superseded", source_events: ["event_old"] },
      { claim_id: "claim_owner_new", text: "Jeff owns MySQL.", claim_state: "active", source_events: ["event_new"] }
    ],
    nearDuplicates: ["memory/topics/mysql-db.md"],
    aliasConflicts: []
  });

  assert.equal(ownershipResult.ownershipChanges.length, 1);
  assert.equal(ownershipResult.identityRisk, "high");
  assert.equal(ownershipResult.recommendedReviewLane, "identity_risk");

  const conflictResult = entities.buildEntityStewardshipV2({
    entity: { id: "person_joe", kind: "Person", name: "Joe" },
    claims: [
      { claim_id: "claim_staged", text: "Joe is the DBA.", claim_state: "staged", scope_state: "unknown", source_events: ["event_staged"] }
    ],
    symbolicFacts: []
  });

  assert.equal(conflictResult.conflictingClaims.includes("claim_staged"), true);
  assert.equal(conflictResult.recommendedReviewLane, "conflict");
}

if (process.argv[1]?.endsWith("entity-stewardship-v2.mjs")) {
  await runEntityStewardshipV2Tests();
}
