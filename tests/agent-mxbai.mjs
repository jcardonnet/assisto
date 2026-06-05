import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildLoggedMxbaiCommand, buildMxbaiRefreshPlan, runMxbaiCli } from "../scripts/agent-mxbai.mjs";

export async function runAgentMxbaiTests() {
  const plan = buildMxbaiRefreshPlan({ store: "assisto" });

  assert.deepEqual(plan.commands, [
    { name: "upload", command: "pnpm mxbai:upload", store: "assisto" },
    { name: "smoke", command: "pnpm mxbai:smoke", store: "assisto" }
  ]);

  const envPlan = buildMxbaiRefreshPlan({ env: { MXBAI_STORE: "dogfood" } });
  assert.equal(envPlan.store, "dogfood");
  assert.deepEqual(
    envPlan.commands.map((item) => item.store),
    ["dogfood", "dogfood"]
  );
  assert.deepEqual(buildLoggedMxbaiCommand("mxbai:upload"), ["pnpm", "agent:run", "--", "pnpm", "mxbai:upload"]);

  const writes = [];
  const jsonResult = runMxbaiCli(["refresh", "--json"], {
    write: (value) => writes.push(value),
    runScript: () => {
      throw new Error("json mode should not run refresh commands");
    }
  });
  assert.equal(jsonResult.ran, false);
  assert.deepEqual(JSON.parse(writes[0]).commands, plan.commands);

  const ran = [];
  const runResult = runMxbaiCli(["refresh"], {
    write: () => {},
    runScript: (script) => ran.push(script)
  });
  assert.equal(runResult.ran, true);
  assert.deepEqual(ran, ["mxbai:upload", "mxbai:smoke"]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runAgentMxbaiTests();
  console.log("agent mxbai tests passed");
}
