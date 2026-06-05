import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runWorkbenchModularizationTests() {
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  const http = await loadTsModule("packages/workbench/src/server/http.ts");
  const registry = await loadTsModule("packages/workbench/src/server/route-registry.ts");
  const routeUtils = await loadTsModule("packages/workbench/src/server/route-utils.ts");
  const ask = await loadTsModule("packages/workbench/src/server/routes/ask.ts");

  assert.equal(typeof workbench.startWorkbenchServer, "function");
  assert.equal(typeof workbench.handleWorkbenchRoute, "function");
  assert.equal(typeof http.createWorkbenchHttpServer, "function");
  assert.equal(typeof registry.findRoute, "function");
  assert.equal(typeof routeUtils.jsonRoute, "function");
  assert.equal(typeof routeUtils.optionalQuery, "function");
  assert.equal(typeof ask.createAskRoute, "function");

  const route = { method: "GET", pathname: "/api/example", handler: () => ({}) };
  assert.equal(registry.findRoute([route], "GET", "/api/example"), route);
  assert.equal(registry.findRoute([route], "HEAD", "/api/example"), route);
  assert.equal(registry.findRoute([route], "get", "/api/example"), null);
  assert.equal(registry.findRoute([route], "POST", "/api/example"), null);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runWorkbenchModularizationTests();
  console.log("workbench modularization tests passed");
}
