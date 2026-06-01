import assert from "node:assert/strict";
import { loadTsModule } from "./ts-module-loader.mjs";

function reportsToFrame(overrides = {}) {
  return {
    frame_id: "frame_reports_to",
    frame_kind: "relation",
    relation: "reports_to",
    subject: {
      entity_id: "person_alice",
      entity_kind: "Person"
    },
    object: {
      entity_id: "person_bob",
      entity_kind: "Person"
    },
    statement: "Alice reports to Bob.",
    source_events: ["ev_ontology_001"],
    scope_state: "complete",
    evidence_strength: "explicit",
    ...overrides
  };
}

export async function runCoreOntologyAwareFrameTests() {
  const frames = await loadTsModule("packages/core/src/frames/index.ts");
  const ontology = await loadTsModule("packages/core/src/ontology/index.ts");
  const registry = ontology.loadDefaultOntologyRegistry();

  const validReporting = frames.validateMemoryFrame(reportsToFrame(), { ontology: registry });
  assert.equal(validReporting.passed, true);
  assert.equal(validReporting.requires_review, false);

  const wrongDomain = frames.validateMemoryFrame(
    reportsToFrame({
      subject: {
        entity_id: "topic_mysql",
        entity_kind: "Topic"
      }
    }),
    { ontology: registry }
  );
  assert.equal(wrongDomain.passed, false);
  assert.equal(wrongDomain.review_reasons.includes("ONTOLOGY_DOMAIN_INVALID"), true);

  const unknownRelation = frames.validateMemoryFrame(
    reportsToFrame({
      relation: "mentors",
      statement: "Alice mentors Bob."
    }),
    { ontology: registry }
  );
  assert.equal(unknownRelation.passed, false);
  assert.equal(unknownRelation.review_reasons.includes("ONTOLOGY_RELATION_UNKNOWN"), true);

  const unknownScopeOwnership = frames.validateMemoryFrame(
    {
      frame_id: "frame_owner",
      frame_kind: "relation",
      relation: "owns_system",
      subject: {
        entity_id: "person_joe",
        entity_kind: "Person"
      },
      object: {
        entity_id: "topic_mysql",
        entity_kind: "Topic"
      },
      statement: "Joe owns MySQL.",
      source_events: ["ev_ontology_002"],
      scope_state: "unknown",
      evidence_strength: "explicit"
    },
    { ontology: registry }
  );
  assert.equal(unknownScopeOwnership.passed, false);
  assert.equal(unknownScopeOwnership.review_reasons.includes("FRAME_UNKNOWN_SCOPE"), true);
  assert.equal(unknownScopeOwnership.review_reasons.includes("ONTOLOGY_SCOPE_REQUIRED"), true);

  const highRiskChange = frames.validateMemoryFrame(
    reportsToFrame({
      change_type: "change"
    }),
    { ontology: registry }
  );
  assert.equal(highRiskChange.passed, true);
  assert.equal(highRiskChange.requires_review, true);
  assert.equal(highRiskChange.review_reasons.includes("ONTOLOGY_HIGH_RISK_RELATION_CHANGE"), true);
}
