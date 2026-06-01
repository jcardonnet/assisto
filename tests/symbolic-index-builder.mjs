import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeScenarioVault, writeManagerChainScenario } from "./helpers/scenario-factory.mjs";
import { writeVaultFile } from "./helpers/temp-vault.mjs";

export async function runSymbolicIndexBuilderTests() {
  const symbolic = await loadTsModule("packages/core/src/symbolic/index.ts");

  await test("buildSymbolicIndex emits derived facts and proof paths", async () => {
    const root = await makeScenarioVault("symbolic-manager-chain");
    await writeManagerChainScenario(root);

    const result = await symbolic.buildSymbolicIndex({ root, write: true });

    assert.equal(result.canonical_writes.length, 0);
    assert.ok(result.derived_facts.some((fact) => fact.relation === "reports_to"));
    assert.ok(result.derived_facts.some((fact) => fact.relation === "manages"));
    assert.ok(result.proofs.every((proof) => proof.source_events.length > 0));

    const factsJsonl = await readFile(join(root, "memory/indexes/symbolic/facts.jsonl"), "utf8");
    const proofsJsonl = await readFile(join(root, "memory/indexes/symbolic/proofs.jsonl"), "utf8");

    assert.match(factsJsonl, /"relation":"reports_to"/);
    assert.match(proofsJsonl, /"rule":"canonical_frame"/);
    assert.deepEqual(
      result.index_paths.map((indexPath) => indexPath.replace(`${root}/`, "")),
      ["memory/indexes/symbolic/facts.jsonl", "memory/indexes/symbolic/proofs.jsonl"]
    );
  });

  await test("buildSymbolicIndex emits proof-backed dependency and blocker chains", async () => {
    const root = await makeScenarioVault("symbolic-reasoning-v2");
    await writeReasoningKernelScenario(root);

    const result = await symbolic.buildSymbolicIndex({ root });
    const proofByFact = new Map(result.proofs.map((proof) => [proof.derived_fact_id, proof]));
    const dependencyChain = result.derived_facts.find((fact) =>
      fact.relation === "depends_on" &&
      fact.subject_id === "service_search_api" &&
      fact.object_id === "topic_mysql"
    );
    const blockerChain = result.derived_facts.find((fact) =>
      fact.relation === "blocks" &&
      fact.subject_id === "risk_latency" &&
      fact.object_id === "artifact_rollout_dashboard"
    );

    assert.ok(dependencyChain);
    assert.equal(dependencyChain.inference_rule, "transitive_relation");
    assert.equal(proofByFact.get(dependencyChain.fact_id)?.source_fact_ids.length, 2);
    assert.ok(blockerChain);
    assert.equal(blockerChain.inference_rule, "transitive_relation");
    assert.equal(proofByFact.get(blockerChain.fact_id)?.rule, "transitive_relation");
    assert.ok(result.derived_facts.some((fact) => fact.relation === "participant_in" && fact.subject_id === "person_bob"));
    assert.ok(result.derived_facts.some((fact) => fact.relation === "open_question"));
    assert.ok(result.derived_facts.some((fact) => fact.relation === "due_on" && fact.object_id === "due_2026_06_15"));
    assert.equal(result.canonical_writes.length, 0);
  });

}


async function writeReasoningKernelScenario(root) {
  await writeVaultFile(
    root,
    "memory/events/2026/2026-06/2026-06-01-001.md",
    `---
id: ev_reasoning_v2_001
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-06-01T10:00:00.000Z
observed_at: 2026-06-01
source_type: user_note
source_actor: user
participants: []
topics: []
contexts: []
derived_claims: []
transactions: []
---

# Event ev_reasoning_v2_001

## Raw text

For Inventory Project, Alice owns Search API. Search API depends on Billing repository. Billing repository depends on MySQL. Latency blocks Search API. Search API blocks rollout dashboard. Meeting: Search Sync with Alice and Bob about Search API. Open question: who owns restore testing? Alice committed to finish restore testing by 2026-06-15.
`
  );
  await writeVaultFile(
    root,
    "memory/contexts/inventory-project.md",
    `---
id: ctx_inventory_project
type: context
object_state: active
review_state: reviewed
created_at: 2026-06-01T10:00:00.000Z
updated_at: 2026-06-01T10:00:00.000Z
aliases: []
source_events:
  - ev_reasoning_v2_001
related: []
summary_generated_from:
  - clm_reasoning_v2_source
---

# Inventory Project

## Active claims

- claim_id: clm_reasoning_v2_source
  statement: For Inventory Project, Alice owns Search API. Search API depends on Billing repository. Billing repository depends on MySQL. Latency blocks Search API. Search API blocks rollout dashboard. Meeting: Search Sync with Alice and Bob about Search API. Open question: who owns restore testing? Alice committed to finish restore testing by 2026-06-15.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: Inventory Project
  scope_state: complete
  evidence: [ev_reasoning_v2_001]
  recorded_at: 2026-06-01T10:00:00.000Z
  observed_at: 2026-06-01
  valid_from: null
  valid_to: null
`
  );
}

if (process.argv[1]?.endsWith("symbolic-index-builder.mjs")) {
  await runSymbolicIndexBuilderTests();
}
