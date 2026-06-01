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
