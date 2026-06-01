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

    assert.equal(registry.ontology_version, "2026-06-01.1");
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
    assert.equal(ontology.findOntologyRelation(defaultRegistry, "owns_system").domain, "Person");
    assert.equal(ontology.findOntologyRelation(defaultRegistry, "owned_by").range, "Person");

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
