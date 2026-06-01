import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";

async function makeTempVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-ontology-"));
  await mkdir(path.join(root, "memory", "schema", "ontology"), { recursive: true });
  return root;
}

async function writeRegistry(root, registry) {
  await writeFile(
    path.join(root, "memory", "schema", "ontology", "registry.json"),
    `${JSON.stringify(registry, null, 2)}\n`,
    "utf8"
  );
}

export async function runCoreOntologyTests() {
  const ontology = await loadTsModule("packages/core/src/ontology/index.ts");
  const root = await makeTempVault();

  try {
    await writeRegistry(root, ontology.defaultOntologyRegistry);
    const registry = await ontology.loadOntologyRegistry(root);

    assert.equal(registry.ontology_version, "2026-06-01.2");
    assert.equal(registry.relations.some((relation) => relation.relation === "reports_to"), true);

    const reportsTo = registry.relations.find((relation) => relation.relation === "reports_to");
    assert.equal(reportsTo.domain, "Person");
    assert.equal(reportsTo.range, "Person");
    assert.equal(reportsTo.requires_scope, false);
    assert.equal(reportsTo.review_risk, "high");
    assert.equal(reportsTo.review_lane, "reporting_change");
    assert.equal(reportsTo.cardinality, "many_to_one");

    const defaultRegistry = ontology.loadDefaultOntologyRegistry();
    assert.equal(defaultRegistry.ontology_version, registry.ontology_version);
    assert.equal(ontology.findOntologyRelation(defaultRegistry, "manages").inverse, "reports_to");
    assert.deepEqual(defaultRegistry.entity_kinds.filter((kind) => ["Service", "Repository", "Artifact", "Incident", "Risk", "Meeting", "Decision", "OpenQuestion", "Commitment", "DueDate"].includes(kind)), ["Service", "Repository", "Artifact", "Incident", "Risk", "Meeting", "Decision", "OpenQuestion", "Commitment", "DueDate"]);
    assert.equal(ontology.findOntologyRelation(defaultRegistry, "owns_system").domain, "Person");
    assert.deepEqual(ontology.findOntologyRelation(defaultRegistry, "owned_by").range, ["Person", "Team"]);
    assert.equal(ontology.findOntologyRelation(defaultRegistry, "depends_on").transitive, true);
    assert.equal(ontology.findOntologyRelation(defaultRegistry, "blocks").review_lane, "blocker_change");
    assert.equal(ontology.findOntologyRelation(defaultRegistry, "participant_in").requires_scope, false);
    assert.equal(ontology.findOntologyRelation(defaultRegistry, "due_on").range, "DueDate");
    assert.equal(ontology.normalizeEntityKind("open question"), "OpenQuestion");
    assert.equal(ontology.normalizeEntityKind("due_date"), "DueDate");

    const validOwnership = ontology.validateOntologyFrame({
      subject_kind: "Person",
      subject_id: "per_alice",
      relation: "owns",
      object_kind: "Context",
      object_id: "ctx_inventory",
      statement: "Alice owns Inventory.",
      scope: "ctx_inventory",
      evidence: ["ev_2026_05_31_001"]
    }, registry);
    assert.equal(validOwnership.passed, true);
    assert.equal(validOwnership.requires_review, false);


    const serviceDependency = ontology.validateOntologyFrame({
      subject_kind: "Service",
      subject_id: "svc_search_api",
      relation: "depends_on",
      object_kind: "Repository",
      object_id: "repo_billing",
      statement: "Search API depends on the Billing repository.",
      scope: "ctx_search",
      evidence: ["ev_2026_06_01_001"]
    }, registry);
    assert.equal(serviceDependency.passed, true);
    assert.equal(serviceDependency.requires_review, false);

    const meetingParticipant = ontology.validateOntologyFrame({
      subject_kind: "Person",
      subject_id: "per_joe",
      relation: "participant_in",
      object_kind: "Meeting",
      object_id: "mtg_search_sync",
      statement: "Joe participated in the search sync.",
      evidence: ["ev_2026_06_01_002"]
    }, registry);
    assert.equal(meetingParticipant.passed, true);
    assert.equal(meetingParticipant.requires_review, false);

    const commitmentDueDate = ontology.validateOntologyFrame({
      subject_kind: "Commitment",
      subject_id: "commit_follow_up_billing",
      relation: "due_on",
      object_kind: "DueDate",
      object_id: "date_2026_06_07",
      statement: "The Billing follow-up is due on 2026-06-07.",
      scope: "ctx_search",
      evidence: ["ev_2026_06_01_003"]
    }, registry);
    assert.equal(commitmentDueDate.passed, true);

    const blockerMissingScope = ontology.validateOntologyFrame({
      subject_kind: "Risk",
      subject_id: "risk_billing_latency",
      relation: "blocks",
      object_kind: "Service",
      object_id: "svc_search_api",
      statement: "Billing latency blocks Search API rollout.",
      evidence: ["ev_2026_06_01_004"]
    }, registry);
    assert.equal(blockerMissingScope.passed, false);
    assert.equal(blockerMissingScope.review_reasons.includes("ONTOLOGY_SCOPE_REQUIRED"), true);

    const blockerChange = ontology.validateOntologyFrame({
      subject_kind: "Risk",
      subject_id: "risk_billing_latency",
      relation: "blocks",
      object_kind: "Service",
      object_id: "svc_search_api",
      statement: "Billing latency blocks Search API rollout.",
      scope: "ctx_search",
      evidence: ["ev_2026_06_01_004"],
      change_type: "change"
    }, registry);
    assert.equal(blockerChange.passed, true);
    assert.equal(blockerChange.requires_review, true);
    assert.equal(blockerChange.review_reasons.includes("ONTOLOGY_HIGH_RISK_RELATION_CHANGE"), true);

    const invalidDueDateDomain = ontology.validateOntologyFrame({
      subject_kind: "Person",
      subject_id: "per_joe",
      relation: "due_on",
      object_kind: "DueDate",
      object_id: "date_2026_06_07",
      statement: "Joe is due on 2026-06-07.",
      scope: "ctx_search",
      evidence: ["ev_2026_06_01_005"]
    }, registry);
    assert.equal(invalidDueDateDomain.passed, false);
    assert.equal(invalidDueDateDomain.review_reasons.includes("ONTOLOGY_DOMAIN_INVALID"), true);

    const unknownRelation = ontology.validateOntologyFrame({
      subject_kind: "Person",
      relation: "mentors",
      object_kind: "Person",
      statement: "Alice mentors Bob.",
      scope: "ctx_inventory",
      evidence: ["ev_2026_05_31_001"]
    }, registry);
    assert.equal(unknownRelation.passed, false);
    assert.equal(unknownRelation.review_reasons.includes("ONTOLOGY_RELATION_UNKNOWN"), true);

    const domainMismatch = ontology.validateOntologyFrame({
      subject_kind: "Person",
      relation: "uses_technology",
      object_kind: "Topic",
      statement: "Alice uses Redis.",
      scope: "ctx_inventory",
      evidence: ["ev_2026_05_31_001"]
    }, registry);
    assert.equal(domainMismatch.passed, false);
    assert.equal(domainMismatch.review_reasons.includes("ONTOLOGY_DOMAIN_INVALID"), true);

    const unknownSubjectKind = ontology.validateOntologyFrame({
      subject_kind: "Project",
      relation: "uses_technology",
      object_kind: "Topic",
      statement: "Inventory uses Redis.",
      scope: "ctx_inventory",
      evidence: ["ev_2026_05_31_001"]
    }, registry);
    assert.equal(unknownSubjectKind.passed, false);
    assert.equal(unknownSubjectKind.review_reasons.includes("ONTOLOGY_DOMAIN_INVALID"), true);

    const missingScope = ontology.validateOntologyFrame({
      subject_kind: "Context",
      relation: "uses_technology",
      object_kind: "Topic",
      statement: "Inventory uses Redis.",
      evidence: ["ev_2026_05_31_001"]
    }, registry);
    assert.equal(missingScope.passed, false);
    assert.equal(missingScope.review_reasons.includes("ONTOLOGY_SCOPE_REQUIRED"), true);

    const highRiskChange = ontology.validateOntologyFrame({
      subject_kind: "Person",
      relation: "reports_to",
      object_kind: "Person",
      statement: "Alice reports to Bob.",
      scope: "ctx_inventory",
      evidence: ["ev_2026_05_31_001"],
      change_type: "change"
    }, registry);
    assert.equal(highRiskChange.passed, true);
    assert.equal(highRiskChange.requires_review, true);
    assert.equal(highRiskChange.review_reasons.includes("ONTOLOGY_HIGH_RISK_RELATION_CHANGE"), true);

    assert.throws(
      () => ontology.parseOntologyRegistry({ ...ontology.defaultOntologyRegistry, ontology_version: undefined }),
      /ontology_version/
    );
    assert.throws(
      () => ontology.parseOntologyRegistry({
        ...ontology.defaultOntologyRegistry,
        relations: [registry.relations[0], registry.relations[0]]
      }),
      /Duplicate ontology relation/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
