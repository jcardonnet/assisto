import assert from "node:assert/strict";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runCoreFrameExtractionTests() {
  const frames = await loadTsModule("packages/core/src/frames/index.ts");
  const ontology = await loadTsModule("packages/core/src/ontology/index.ts");
  const registry = ontology.loadDefaultOntologyRegistry();

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


  const workFrames = frames.extractCandidateFramesFromText({
    text: "For Inventory Project, Alice owns Search API. Search API depends on Billing repository. Risk: latency affects Search API. Meeting: Search Sync with Alice and Bob about Search API. Alice committed to finish restore testing by 2026-06-15.",
    sourceEventId: "event_work_frames"
  });

  assert.equal(
    workFrames.some((frame) =>
      frame.relation === "owns" &&
      frame.subject.entity_id === "person_alice" &&
      frame.object?.entity_id === "service_search_api" &&
      frame.scope === "Inventory Project" &&
      frame.scope_state === "complete"
    ),
    true
  );
  assert.equal(
    workFrames.some((frame) =>
      frame.relation === "depends_on" &&
      frame.subject.entity_id === "service_search_api" &&
      frame.object?.entity_id === "repo_billing"
    ),
    true
  );
  assert.equal(
    workFrames.some((frame) =>
      frame.relation === "risk_affects" &&
      frame.subject.entity_id === "risk_latency" &&
      frame.object?.entity_id === "service_search_api"
    ),
    true
  );
  assert.equal(
    workFrames.some((frame) =>
      frame.relation === "participant_in" &&
      frame.subject.entity_id === "person_bob" &&
      frame.object?.entity_id === "meeting_search_sync"
    ),
    true
  );
  assert.equal(
    workFrames.some((frame) =>
      frame.relation === "committed_to" &&
      frame.subject.entity_id === "person_alice" &&
      frame.object?.entity_id === "commitment_finish_restore_testing"
    ),
    true
  );
  assert.equal(
    workFrames.some((frame) =>
      frame.relation === "due_on" &&
      frame.subject.entity_id === "commitment_finish_restore_testing" &&
      frame.object?.entity_id === "due_2026_06_15"
    ),
    true
  );

  const validatedWorkFrames = workFrames.map((frame) => frames.validateMemoryFrame(frame, { ontology: registry }));
  assert.equal(validatedWorkFrames.every((result) => result.passed), true);

  const reviewFrames = frames.extractCandidateFramesFromText({
    text: "Search API depends on Billing repository. Latency blocks Search API. Joe now reports to Dana. Joe's role changed to DBA.",
    sourceEventId: "event_review_frames"
  });
  const dependencyReview = reviewFrames.find((frame) => frame.relation === "depends_on");
  const blockerReview = reviewFrames.find((frame) => frame.relation === "blocks");
  const reportingChange = reviewFrames.find((frame) => frame.relation === "reports_to" && frame.change_type === "change");
  const roleChange = reviewFrames.find((frame) => frame.relation === "role_in" && frame.change_type === "change");

  assert.ok(dependencyReview);
  assert.ok(blockerReview);
  assert.ok(reportingChange);
  assert.ok(roleChange);

  const dependencyValidation = frames.validateMemoryFrame(dependencyReview, { ontology: registry });
  assert.equal(dependencyValidation.passed, false);
  assert.equal(dependencyValidation.review_reasons.includes("ONTOLOGY_SCOPE_REQUIRED"), true);

  const blockerValidation = frames.validateMemoryFrame(blockerReview, { ontology: registry });
  assert.equal(blockerValidation.passed, false);
  assert.equal(blockerValidation.review_reasons.includes("ONTOLOGY_SCOPE_REQUIRED"), true);

  const reportingValidation = frames.validateMemoryFrame(reportingChange, { ontology: registry });
  assert.equal(reportingValidation.passed, true);
  assert.equal(reportingValidation.requires_review, true);
  assert.equal(reportingValidation.review_reasons.includes("ONTOLOGY_HIGH_RISK_RELATION_CHANGE"), true);

  const roleValidation = frames.validateMemoryFrame(roleChange, { ontology: registry });
  assert.equal(roleValidation.passed, false);
  assert.equal(roleValidation.review_reasons.includes("ONTOLOGY_SCOPE_REQUIRED"), true);
  assert.equal(roleValidation.review_reasons.includes("ONTOLOGY_HIGH_RISK_RELATION_CHANGE"), true);

  const validFrames = [...managerFrames, ...pronounFrames, ...decisionFrames].map(frames.validateMemoryFrame);
  assert.equal(validFrames.every((result) => result.passed), true);
}
