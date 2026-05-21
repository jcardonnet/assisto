import assert from "node:assert/strict";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runCorePolicyTests() {
  const policies = await loadTsModule("packages/core/src/policies/index.ts");

  assert.equal(policies.classifyFollowUpIntent("We discussed asking Joe").intent, "none");
  assert.equal(policies.classifyFollowUpIntent("Maybe I should ask Joe").intent, "candidate");
  assert.equal(policies.classifyFollowUpIntent("Remind me to ask Joe").intent, "committed");
  assert.equal(
    policies.classifyFollowUpIntent("Joe asked me to send him the numbers").intent,
    "committed"
  );

  const joeAmbiguity = policies.resolveEntityReference("Joe", [
    { id: "per_joseph", name: "Joseph" },
    { id: "per_joey", name: "Joey" }
  ]);
  assert.equal(joeAmbiguity.state, "ambiguous");
  assert.deepEqual(
    joeAmbiguity.candidates.map((candidate) => candidate.id),
    ["per_joseph", "per_joey"]
  );

  const joeRoleAmbiguity = policies.resolveEntityReference("Joe", [
    { id: "per_joe_dba", name: "Joe", contextHints: ["DBA"] },
    { id: "per_joe_sales", name: "Joe", contextHints: ["sales"] }
  ]);
  assert.equal(joeRoleAmbiguity.state, "ambiguous");

  const mysqlStaging = policies.evaluateStagingPolicy({
    claimDomain: "system",
    claim: {
      claim_kind: "fact",
      claim_state: "active",
      statement: "We use MySQL.",
      scope: null,
      scope_state: "unknown"
    }
  });
  assert.equal(mysqlStaging.stage, true);
  assert.deepEqual(mysqlStaging.reasons, ["missing_scope"]);

  const mikeGuidanceStaging = policies.evaluateStagingPolicy({
    claimDomain: "person",
    claim: {
      claim_kind: "inference",
      claim_state: "staged",
      statement: "Statistical framing may be useful when explaining technical trade-offs to Mike.",
      scope: "communication-guidance",
      scope_state: "partial"
    }
  });
  assert.equal(mikeGuidanceStaging.stage, true);
  assert.deepEqual(mikeGuidanceStaging.reasons, ["inferred_person_communication_guidance"]);

  assert.deepEqual(
    policies.evaluateStagingPolicy({ entityResolution: "near_match" }).reasons,
    ["entity_near_match"]
  );
  assert.deepEqual(
    policies.evaluateStagingPolicy({ changedFields: ["role", "owner"] }).reasons,
    ["high_impact_change"]
  );
  assert.deepEqual(
    policies.evaluateStagingPolicy({
      generatedExplanationWouldPersist: true,
      explicitSaveRequested: false
    }).reasons,
    ["generated_explanation_without_save"]
  );
}

