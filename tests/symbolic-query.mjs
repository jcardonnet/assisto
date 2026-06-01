import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./ts-module-loader.mjs";

const facts = [
  {
    fact_id: "sym_fact_1",
    relation: "reports_to",
    subject_id: "person_kuastav",
    object_id: "person_jeff",
    source_claim_ids: ["claim_1"],
    source_events: ["event_1"],
    inference_rule: "canonical_frame"
  }
];

const proofs = [
  {
    proof_id: "proof_1",
    derived_fact_id: "sym_fact_1",
    rule: "canonical_frame",
    source_fact_ids: [],
    source_claim_ids: ["claim_1"],
    source_events: ["event_1"]
  }
];

export async function runSymbolicQueryTests() {
  const symbolic = await loadTsModule("packages/core/src/symbolic/index.ts");

  await test("querySymbolicFacts returns proof path for relation lookup", () => {
    const result = symbolic.querySymbolicFacts({
      facts,
      proofs,
      relation: "reports_to",
      subject_id: "person_kuastav"
    });

    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].proof.proof_id, "proof_1");
  });



  await test("querySymbolicFacts plans dependency and due-date lookups from natural questions", () => {
    const extendedFacts = [
      ...facts,
      {
        fact_id: "sym_fact_dep_1",
        relation: "depends_on",
        subject_id: "service_search_api",
        object_id: "repo_billing",
        source_claim_ids: ["claim_dep_1"],
        source_events: ["event_dep_1"],
        inference_rule: "canonical_frame"
      },
      {
        fact_id: "sym_fact_dep_2",
        relation: "depends_on",
        subject_id: "repo_billing",
        object_id: "topic_mysql",
        source_claim_ids: ["claim_dep_2"],
        source_events: ["event_dep_2"],
        inference_rule: "canonical_frame"
      },
      {
        fact_id: "sym_fact_dep_3",
        relation: "depends_on",
        subject_id: "service_search_api",
        object_id: "topic_mysql",
        source_claim_ids: ["claim_dep_1", "claim_dep_2"],
        source_events: ["event_dep_1", "event_dep_2"],
        inference_rule: "transitive_relation"
      },
      {
        fact_id: "sym_fact_due_1",
        relation: "due_on",
        subject_id: "commitment_finish_restore_testing",
        object_id: "due_2026_06_15",
        source_claim_ids: ["claim_due_1"],
        source_events: ["event_due_1"],
        inference_rule: "canonical_frame"
      }
    ];
    const extendedProofs = [
      ...proofs,
      {
        proof_id: "proof_dep_1",
        derived_fact_id: "sym_fact_dep_1",
        rule: "canonical_frame",
        source_fact_ids: [],
        source_claim_ids: ["claim_dep_1"],
        source_events: ["event_dep_1"]
      },
      {
        proof_id: "proof_dep_2",
        derived_fact_id: "sym_fact_dep_2",
        rule: "canonical_frame",
        source_fact_ids: [],
        source_claim_ids: ["claim_dep_2"],
        source_events: ["event_dep_2"]
      },
      {
        proof_id: "proof_dep_3",
        derived_fact_id: "sym_fact_dep_3",
        rule: "transitive_relation",
        source_fact_ids: ["sym_fact_dep_1", "sym_fact_dep_2"],
        source_claim_ids: ["claim_dep_1", "claim_dep_2"],
        source_events: ["event_dep_1", "event_dep_2"]
      },
      {
        proof_id: "proof_due_1",
        derived_fact_id: "sym_fact_due_1",
        rule: "canonical_frame",
        source_fact_ids: [],
        source_claim_ids: ["claim_due_1"],
        source_events: ["event_due_1"]
      }
    ];

    const dependency = symbolic.querySymbolicFacts({
      facts: extendedFacts,
      proofs: extendedProofs,
      query: "What does Search API depend on?"
    });
    assert.equal(dependency.query_plan.intent, "dependency_chain");
    assert.equal(dependency.matches.some((match) => match.fact.fact_id === "sym_fact_dep_3"), true);
    assert.equal(
      dependency.matches.find((match) => match.fact.fact_id === "sym_fact_dep_3")?.proof_tree.children.length,
      2
    );

    const due = symbolic.querySymbolicFacts({
      facts: extendedFacts,
      proofs: extendedProofs,
      query: "What is due for restore testing?"
    });
    assert.equal(due.query_plan.intent, "commitment_due_lookup");
    assert.equal(due.matches.length, 1);
    assert.equal(due.matches[0].fact.object_id, "due_2026_06_15");
  });

  await test("querySymbolicFacts reports missing when no proof-backed fact matches", () => {
    const result = symbolic.querySymbolicFacts({
      facts,
      proofs,
      relation: "reports_to",
      subject_id: "person_missing"
    });

    assert.deepEqual(result.matches, []);
    assert.deepEqual(result.missing, ["no_symbolic_fact_match"]);
  });
}

if (process.argv[1]?.endsWith("symbolic-query.mjs")) {
  await runSymbolicQueryTests();
}
