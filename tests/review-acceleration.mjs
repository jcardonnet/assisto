import assert from "node:assert/strict";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runReviewAccelerationTests() {
  const reviewAcceleration = await loadTsModule("packages/core/src/review/acceleration.ts");

  const result = reviewAcceleration.buildReviewAccelerationQueue({
    reviewItems: [
      { id: "review_1", review_reason: "ontology_violation", source_events: ["event_1"] },
      { id: "review_2", review_reason: "reporting_change", source_events: ["event_2"] },
      { id: "review_3", review_reason: "unscoped_claim", source_events: ["event_3"] },
      { id: "review_4", review_reason: "source_missing", source_events: [] }
    ],
    proofPaths: [{ proof_id: "proof_1", source_event_ids: ["event_1"] }]
  });

  assert.deepEqual(result.lanes.map((lane) => lane.id), [
    "needs_ontology_review",
    "conflict_or_change",
    "needs_context",
    "other"
  ]);
  assert.equal(result.nextItem.id, "review_1");
  assert.equal(result.batchApplyAllowed, false);
  assert.equal(result.items[0].lane_id, "needs_ontology_review");
  assert.equal(result.items[0].proof_previews[0].proof_id, "proof_1");
  assert.equal(result.items[1].suggested_action, "Compare current and staged claims before any explicit supersession.");
}

if (process.argv[1]?.endsWith("review-acceleration.mjs")) {
  await runReviewAccelerationTests();
}
