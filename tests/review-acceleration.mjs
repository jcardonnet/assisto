import assert from "node:assert/strict";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runReviewAccelerationTests() {
  const reviewAcceleration = await loadTsModule("packages/core/src/review/acceleration.ts");

  const result = reviewAcceleration.buildReviewAccelerationQueue({
    reviewItems: [
      { id: "review_1", review_reason: "ontology_violation", source_events: ["event_1"] },
      { id: "review_2", review_reason: "reporting_change", source_events: ["event_2"] },
      { id: "review_3", review_reason: "unscoped_claim", source_events: ["event_3"] },
      { id: "review_4", review_reason: "stale_noop_event", source_events: ["event_4"] },
      { id: "review_5", review_reason: "manual_apply", source_events: ["event_5"], staged_claim_ids: ["claim_5"] },
      { id: "review_6", review_reason: "source_missing", source_events: [] }
    ],
    proofPaths: [{ proof_id: "proof_1", source_event_ids: ["event_1"] }]
  });

  assert.deepEqual(result.lanes.map((lane) => lane.id), [
    "needs_ontology_review",
    "conflict_or_change",
    "needs_context",
    "safe_apply",
    "stale_noop",
    "other"
  ]);
  assert.equal(result.nextItem.id, "review_1");
  assert.equal(result.batchApplyAllowed, false);
  assert.equal(result.items[0].lane_id, "needs_ontology_review");
  assert.equal(result.items[0].proof_previews[0].proof_id, "proof_1");
  assert.equal(result.items[1].suggested_action, "Compare current and staged claims before any explicit supersession.");
  const autopilot = reviewAcceleration.buildReviewAutopilotResult(result);
  assert.equal(autopilot.version, "review-autopilot-v1");
  assert.equal(autopilot.batchApplyAllowed, false);
  assert.equal(autopilot.next_item_id, "review_1");
  assert.equal(autopilot.total_items, 6);
  assert.equal(autopilot.lanes[0].lane_id, "needs_ontology_review");
  assert.equal(autopilot.lanes[0].risk_factors.includes("ontology_or_frame_validation"), true);
  assert.match(autopilot.warnings[0], /preview-only/i);

  const throughput = reviewAcceleration.buildReviewThroughputResult(result);
  assert.equal(throughput.version, "review-throughput-v1");
  assert.equal(throughput.total_items, 6);
  assert.equal(throughput.ready_now_count, 2);
  assert.equal(throughput.needs_input_count, 1);
  assert.equal(throughput.risk_review_count, 3);
  assert.equal(throughput.batchApplyAllowed, false);
  assert.equal(throughput.next_action?.item_id, "review_1");
  assert.equal(throughput.lanes.find((lane) => lane.lane_id === "needs_context")?.required_inputs.includes("context"), true);
  assert.equal(throughput.lanes.find((lane) => lane.lane_id === "safe_apply")?.action_checklist.includes("Preview apply-staged"), true);
  assert.equal(throughput.bottlenecks[0].lane_id, "needs_ontology_review");
}

if (process.argv[1]?.endsWith("review-acceleration.mjs")) {
  await runReviewAccelerationTests();
}
