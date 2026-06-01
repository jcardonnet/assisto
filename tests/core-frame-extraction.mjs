import assert from "node:assert/strict";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runCoreFrameExtractionTests() {
  const frames = await loadTsModule("packages/core/src/frames/index.ts");

  const managerFrames = frames.extractCandidateFramesFromText({
    text: "Kuastav is my manager. Kuastav reports to Jeff.",
    sourceEventId: "event_manager"
  });

  assert.equal(
    managerFrames.some((frame) =>
      frame.relation === "manages" &&
      frame.subject.entity_id === "person_kuastav" &&
      frame.object?.entity_id === "person_user" &&
      frame.source_events.includes("event_manager")
    ),
    true
  );
  assert.equal(
    managerFrames.some((frame) =>
      frame.relation === "reports_to" &&
      frame.subject.entity_id === "person_kuastav" &&
      frame.object?.entity_id === "person_jeff" &&
      frame.source_events.includes("event_manager")
    ),
    true
  );

  const pronounFrames = frames.extractCandidateFramesFromText({
    text: "Kuastav, the Sr. Director of Software Engineering, is my manager. He reports to Jeff, the CTO.",
    sourceEventId: "event_org_chart"
  });

  assert.equal(
    pronounFrames.some((frame) =>
      frame.frame_kind === "attribute" &&
      frame.attribute === "role_title" &&
      frame.subject.entity_id === "person_kuastav" &&
      frame.value === "Sr. Director of Software Engineering"
    ),
    true
  );
  assert.equal(
    pronounFrames.some((frame) =>
      frame.relation === "reports_to" &&
      frame.subject.entity_id === "person_kuastav" &&
      frame.object?.entity_id === "person_jeff"
    ),
    true
  );
  assert.equal(
    pronounFrames.some((frame) =>
      frame.frame_kind === "attribute" &&
      frame.attribute === "role_title" &&
      frame.subject.entity_id === "person_jeff" &&
      frame.value === "CTO"
    ),
    true
  );

  const decisionFrames = frames.extractCandidateFramesFromText({
    text: "For Project Atlas, decision: use MySQL. Open question: who owns backup restore testing?",
    sourceEventId: "event_project"
  });

  assert.equal(
    decisionFrames.some((frame) =>
      frame.frame_kind === "decision" &&
      frame.subject.entity_id === "context_project_atlas" &&
      frame.source_events.includes("event_project") &&
      frame.scope_state === "partial"
    ),
    true
  );
  assert.equal(
    decisionFrames.some((frame) =>
      frame.frame_kind === "open_question" &&
      frame.subject.entity_id === "context_project_atlas" &&
      frame.source_events.includes("event_project")
    ),
    true
  );

  const validFrames = [...managerFrames, ...pronounFrames, ...decisionFrames].map(frames.validateMemoryFrame);
  assert.equal(validFrames.every((result) => result.passed), true);
}
