import assert from "node:assert/strict";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runEntityRepairActionsV2Tests() {
  const entities = await loadTsModule("packages/core/src/entities/index.ts");

  const blocked = entities.previewEntityRepairActionV2({
    kind: "reporting",
    entityId: "person_kuastav",
    newTargetId: "person_jeff"
  });

  assert.equal(blocked.version, "entity-repair-action-v2");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.errors[0].code, "supersede_claim_required");
  assert.equal(blocked.canonical_writes.length, 0);
  assert.equal(blocked.transaction, null);

  const identityReview = entities.previewEntityRepairActionV2({
    kind: "identity_review",
    entityId: "person_joseph",
    note: "May be same person as Joe."
  });

  assert.equal(identityReview.allowed, true);
  assert.equal(identityReview.canonical_writes.length, 0);
  assert.equal(identityReview.transaction.operations[0].op, "STAGE_REVIEW");
  assert.equal(identityReview.transaction.operations[0].target, "person_joseph");

  const roleRepair = entities.previewEntityRepairActionV2({
    kind: "role",
    entityId: "person_jeff",
    statement: "Jeff is the platform DBA.",
    supersedeClaimId: "clm_old_role",
    note: "Human selected old role claim."
  });

  assert.equal(roleRepair.allowed, true);
  assert.deepEqual(
    roleRepair.transaction.operations.map((operation) => operation.op),
    ["SUPERSEDE_CLAIM", "UPSERT_CLAIM"]
  );
  assert.equal(roleRepair.canonical_writes.length, 0);
}

if (process.argv[1]?.endsWith("entity-repair-actions-v2.mjs")) {
  await runEntityRepairActionsV2Tests();
}
