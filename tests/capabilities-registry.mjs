import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runCapabilityRegistryTests() {
  const capabilities = await loadTsModule("packages/core/src/capabilities/index.ts");
  const core = await loadTsModule("packages/core/src/index.ts");

  const ids = capabilities.capabilityRegistry.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);

  assert.equal(ids.includes("capture"), true);
  assert.equal(ids.includes("ask-answer-contract"), true);
  assert.equal(ids.includes("entity-stewardship"), true);
  assert.equal(ids.includes("context-operating-room"), true);

  assert.deepEqual(capabilities.validateCapabilityRegistry(capabilities.capabilityRegistry).errors, []);
  assert.equal(core.capabilityRegistry, capabilities.capabilityRegistry);
  assert.equal(core.validateCapabilityRegistry, capabilities.validateCapabilityRegistry);

  const answerContract = capabilities.capabilityRegistry.find((item) => item.id === "ask-answer-contract");
  assert.equal(answerContract.cliCommands.includes("wm ask --contract-v3"), true);
  assert.equal(answerContract.cliCommands.includes("wm ask --contract-v4"), true);

  const entityStewardship = capabilities.capabilityRegistry.find((item) => item.id === "entity-stewardship");
  assert.equal(entityStewardship.workbenchRoutes.includes("/api/entities/stewardship/detail"), true);
  assert.equal(entityStewardship.workbenchRoutes.includes("/api/entities/identity-review/preview"), true);
  assert.equal(entityStewardship.workbenchRoutes.includes("/api/entities/repair-v2/preview"), true);

  assert.deepEqual(
    capabilities.validateCapabilityRegistry([
      capabilities.capabilityRegistry[0],
      { ...capabilities.capabilityRegistry[0] }
    ]).errors,
    ["duplicate id: capture"]
  );
  assert.deepEqual(
    capabilities.validateCapabilityRegistry([
      {
        ...capabilities.capabilityRegistry[0],
        id: "capture-without-transaction",
        invariants: ["Durable updates are staged."]
      }
    ]).errors,
    ["capture-without-transaction is transaction_backed but invariant text does not mention transactions"]
  );
  assert.deepEqual(
    capabilities.validateCapabilityRegistry([
      {
        ...capabilities.capabilityRegistry[1],
        invariants: ["Derived output writes nothing."]
      }
    ]).errors,
    ["ask-answer-contract is read_only but invariant text mentions writes"]
  );
  assert.deepEqual(
    capabilities.validateCapabilityRegistry([
      {
        ...capabilities.capabilityRegistry[0],
        id: "missing-docs",
        docs: []
      }
    ]).errors,
    ["missing-docs.docs must not be empty"]
  );
  assert.deepEqual(
    capabilities.validateCapabilityRegistry([
      {
        ...capabilities.capabilityRegistry[0],
        id: "unknown-validation-group",
        validationGroups: ["surprise"]
      }
    ]).errors,
    ["unknown-validation-group has unknown validation group: surprise"]
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCapabilityRegistryTests();
  console.log("capability registry tests passed");
}
