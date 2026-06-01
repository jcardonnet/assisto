import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeScenarioVault, writeManagerChainScenario } from "./helpers/scenario-factory.mjs";

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
}

if (process.argv[1]?.endsWith("symbolic-index-builder.mjs")) {
  await runSymbolicIndexBuilderTests();
}
