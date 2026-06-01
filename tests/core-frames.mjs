import assert from "node:assert/strict";
import { loadTsModule } from "./ts-module-loader.mjs";

function validRelationFrame(overrides = {}) {
  return {
    frame_id: "frame_reports_to_kuastav_jeff",
    frame_kind: "relation",
    relation: "reports_to",
    subject: {
      entity_id: "person_kuastav",
      entity_kind: "Person"
    },
    object: {
      entity_id: "person_jeff",
      entity_kind: "Person"
    },
    source_events: ["ev_2026_05_31_001"],
    scope_state: "complete",
    evidence_strength: "explicit",
    statement: "Kuastav reports to Jeff.",
    ...overrides
  };
}

export async function runCoreFrameTests() {
  const frames = await loadTsModule("packages/core/src/frames/index.ts");

  const valid = frames.validateMemoryFrame(validRelationFrame());
  assert.equal(valid.passed, true);
  assert.equal(valid.requires_review, false);
  assert.deepEqual(valid.errors, []);

  const missingEvidence = frames.validateMemoryFrame(validRelationFrame({ source_events: [] }));
  assert.equal(missingEvidence.passed, false);
  assert.equal(missingEvidence.requires_review, true);
  assert.equal(missingEvidence.review_reasons.includes("FRAME_MISSING_SOURCE_EVENT"), true);

  const relationWithoutObject = frames.validateMemoryFrame(validRelationFrame({ object: undefined }));
  assert.equal(relationWithoutObject.passed, false);
  assert.equal(relationWithoutObject.review_reasons.includes("FRAME_RELATION_MISSING_OBJECT"), true);

  const unknownScope = frames.validateMemoryFrame(validRelationFrame({ scope_state: "unknown" }));
  assert.equal(unknownScope.passed, false);
  assert.equal(unknownScope.requires_review, true);
  assert.equal(unknownScope.review_reasons.includes("FRAME_UNKNOWN_SCOPE"), true);

  const invalidSubjectKind = frames.validateMemoryFrame(
    validRelationFrame({
      subject: {
        entity_id: "project_inventory",
        entity_kind: "Project"
      }
    })
  );
  assert.equal(invalidSubjectKind.passed, false);
  assert.equal(invalidSubjectKind.review_reasons.includes("FRAME_SUBJECT_KIND_INVALID"), true);


  const validServiceFrame = frames.validateMemoryFrame({
    frame_id: "frame_service_depends_repo",
    frame_kind: "relation",
    relation: "depends_on",
    subject: {
      entity_id: "svc_search_api",
      entity_kind: "Service"
    },
    object: {
      entity_id: "repo_billing",
      entity_kind: "Repository"
    },
    statement: "Search API depends on Billing repository.",
    source_events: ["ev_2026_06_01_001"],
    scope_state: "complete",
    evidence_strength: "explicit"
  });
  assert.equal(validServiceFrame.passed, true);

  const validAttribute = frames.validateMemoryFrame({
    frame_id: "frame_alice_role",
    frame_kind: "attribute",
    attribute: "role_title",
    subject: {
      entity_id: "person_alice",
      entity_kind: "Person"
    },
    value: "DBA",
    source_events: ["ev_2026_05_31_002"],
    scope_state: "partial",
    evidence_strength: "explicit"
  });
  assert.equal(validAttribute.passed, true);

  const missingAttributeValue = frames.validateMemoryFrame({
    ...validAttributeFrame(),
    value: ""
  });
  assert.equal(missingAttributeValue.passed, false);
  assert.equal(missingAttributeValue.review_reasons.includes("FRAME_VALUE_REQUIRED"), true);

  const validDecision = frames.validateMemoryFrame({
    frame_id: "frame_decision_mysql",
    frame_kind: "decision",
    subject: {
      entity_id: "ctx_inventory",
      entity_kind: "Context"
    },
    statement: "Inventory will keep MySQL for the next migration window.",
    source_events: ["ev_2026_05_31_003"],
    scope_state: "complete",
    evidence_strength: "explicit"
  });
  assert.equal(validDecision.passed, true);
}

function validAttributeFrame() {
  return {
    frame_id: "frame_alice_role",
    frame_kind: "attribute",
    attribute: "role_title",
    subject: {
      entity_id: "person_alice",
      entity_kind: "Person"
    },
    value: "DBA",
    source_events: ["ev_2026_05_31_002"],
    scope_state: "partial",
    evidence_strength: "explicit"
  };
}
