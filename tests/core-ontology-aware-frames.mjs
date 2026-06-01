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


  const validServiceDependency = frames.validateMemoryFrame(
    {
      frame_id: "frame_search_depends_billing_repo",
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
      statement: "Search API depends on the Billing repository.",
      source_events: ["ev_ontology_003"],
      scope: "ctx_search",
      scope_state: "complete",
      evidence_strength: "explicit"
    },
    { ontology: registry }
  );
  assert.equal(validServiceDependency.passed, true);
  assert.equal(validServiceDependency.requires_review, false);

  const invalidBlockerScope = frames.validateMemoryFrame(
    {
      frame_id: "frame_risk_blocks_service",
      frame_kind: "relation",
      relation: "blocks",
      subject: {
        entity_id: "risk_latency",
        entity_kind: "Risk"
      },
      object: {
        entity_id: "svc_search_api",
        entity_kind: "Service"
      },
      statement: "Latency blocks Search API rollout.",
      source_events: ["ev_ontology_004"],
      scope_state: "unknown",
      evidence_strength: "explicit"
    },
    { ontology: registry }
  );
  assert.equal(invalidBlockerScope.passed, false);
  assert.equal(invalidBlockerScope.review_reasons.includes("ONTOLOGY_SCOPE_REQUIRED"), true);

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
