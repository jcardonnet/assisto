import assert from "node:assert/strict";
import { fileURLToPath, URL } from "node:url";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runWorkbenchModularizationTests() {
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  const http = await loadTsModule("packages/workbench/src/server/http.ts");
  const registry = await loadTsModule("packages/workbench/src/server/route-registry.ts");
  const routeUtils = await loadTsModule("packages/workbench/src/server/route-utils.ts");
  const ask = await loadTsModule("packages/workbench/src/server/routes/ask.ts");
  const briefs = await loadTsModule("packages/workbench/src/server/routes/briefs.ts");

  assert.equal(typeof workbench.startWorkbenchServer, "function");
  assert.equal(typeof workbench.handleWorkbenchRoute, "function");
  assert.equal(typeof http.createWorkbenchHttpServer, "function");
  assert.equal(typeof registry.findRoute, "function");
  assert.equal(typeof routeUtils.jsonRoute, "function");
  assert.equal(typeof routeUtils.optionalQuery, "function");
  assert.equal(typeof ask.createAskRoute, "function");
  assert.equal(typeof briefs.createBriefRoutes, "function");

  const route = { method: "GET", pathname: "/api/example", handler: () => ({}) };
  assert.equal(registry.findRoute([route], "GET", "/api/example"), route);
  assert.equal(registry.findRoute([route], "HEAD", "/api/example"), route);
  assert.equal(registry.findRoute([route], "get", "/api/example"), null);
  assert.equal(registry.findRoute([route], "POST", "/api/example"), null);

  const briefRoutes = briefs.createBriefRoutes({
    buildSessionBrief: async (_root, options) => ({
      kind: options.kind,
      generated_at: "2026-06-05T00:00:00.000Z",
      title: "Brief",
      target: options.target ? { id: options.target, path: "memory/people/jeff.md", name: "Jeff", aliases: [] } : undefined,
      activeClaims: [],
      uncertainClaims: [],
      openFollowUps: [],
      reviewItems: [],
      evidenceEvents: [],
      warnings: [],
      contextPack: ""
    }),
    listSessionBriefTargets: async (_root, kind) => [
      {
        id: kind === "person" ? "per_jeff" : "ctx_inventory_project",
        path: kind === "person" ? "memory/people/jeff.md" : "memory/contexts/inventory-project.md",
        type: kind,
        name: kind === "person" ? "Jeff" : "Inventory Project",
        aliases: []
      }
    ]
  });
  const briefRoute = registry.findRoute(briefRoutes, "GET", "/api/brief");
  const briefTargetsRoute = registry.findRoute(briefRoutes, "HEAD", "/api/brief/targets");
  assert.notEqual(briefRoute, null);
  assert.notEqual(briefTargetsRoute, null);
  const routeContextRoot = "assisto-test-root";

  const invalidBrief = await briefRoute.handler({
    root: routeContextRoot,
    request: { method: "GET", url: "/api/brief?kind=recent&targetKind=topic" },
    requestUrl: new URL("http://127.0.0.1/api/brief?kind=recent&targetKind=topic")
  });
  assert.equal(invalidBrief.status, 400);
  assert.match(JSON.parse(invalidBrief.body).error, /Invalid query parameter targetKind/);

  const brief = await briefRoute.handler({
    root: routeContextRoot,
    request: { method: "GET", url: "/api/brief?kind=person&id=per_jeff" },
    requestUrl: new URL("http://127.0.0.1/api/brief?kind=person&id=per_jeff")
  });
  assert.equal(JSON.parse(brief.body).target.id, "per_jeff");

  const missingTargetsKind = await briefTargetsRoute.handler({
    root: routeContextRoot,
    request: { method: "GET", url: "/api/brief/targets" },
    requestUrl: new URL("http://127.0.0.1/api/brief/targets")
  });
  assert.equal(missingTargetsKind.status, 400);
  assert.match(JSON.parse(missingTargetsKind.body).error, /Missing required query parameter/);

  const targets = await briefTargetsRoute.handler({
    root: routeContextRoot,
    request: { method: "GET", url: "/api/brief/targets?kind=context" },
    requestUrl: new URL("http://127.0.0.1/api/brief/targets?kind=context")
  });
  assert.equal(JSON.parse(targets.body).kind, "context");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runWorkbenchModularizationTests();
  console.log("workbench modularization tests passed");
}
