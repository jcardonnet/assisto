import assert from "node:assert/strict";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runContextOperatingRoomV3Tests() {
  const contexts = await loadTsModule("packages/core/src/contexts/index.ts");

  const result = contexts.buildContextOperatingRoomV3({
    context: { id: "context_atlas", name: "Project Atlas" },
    claims: [
      { claim_id: "claim_decision", text: "Decision: use MySQL.", source_events: ["event_1"] },
      { claim_id: "claim_question", text: "Open question: who owns restore testing?", source_events: ["event_2"] },
      { claim_id: "claim_risk", text: "Risk: restore testing is not owned.", source_events: ["event_3"] }
    ],
    symbolicFacts: [
      { fact_id: "sym_1", relation: "owns_system", source_events: ["event_4"] },
      { fact_id: "sym_2", relation: "uses_system", source_events: ["event_5"] }
    ],
    reviewItems: [{ id: "rev_1" }],
    followUps: [{ id: "fu_1" }]
  });

  assert.equal(result.decisions.length, 1);
  assert.equal(result.openQuestions.length, 1);
  assert.equal(result.risks.length, 1);
  assert.equal(result.symbolicFacts.length, 2);
  assert.equal(result.owners.length, 1);
  assert.equal(result.systems.length, 2);
  assert.equal(result.reviewQueue.length, 1);
  assert.equal(result.followupQueue.length, 1);
  assert.equal(result.canonical_writes.length, 0);
}

if (process.argv[1]?.endsWith("context-operating-room-v3.mjs")) {
  await runContextOperatingRoomV3Tests();
}
