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
  const contexts = await loadTsModule("packages/workbench/src/server/routes/contexts.ts");
  const health = await loadTsModule("packages/workbench/src/server/routes/health.ts");

  assert.equal(typeof workbench.startWorkbenchServer, "function");
  assert.equal(typeof workbench.handleWorkbenchRoute, "function");
  assert.equal(typeof http.createWorkbenchHttpServer, "function");
  assert.equal(typeof registry.findRoute, "function");
  assert.equal(typeof routeUtils.jsonRoute, "function");
  assert.equal(typeof routeUtils.optionalQuery, "function");
  assert.equal(typeof ask.createAskRoute, "function");
  assert.equal(typeof briefs.createBriefRoutes, "function");
  assert.equal(typeof contexts.createContextRoutes, "function");
  assert.equal(typeof health.createHealthRoutes, "function");

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

  const contextClaim = {
    claim_id: "clm_context",
    statement: "Decision: keep context routes read-only.",
    evidence: ["ev_context"]
  };
  const contextRoutes = contexts.createContextRoutes({
    buildContextDashboardResult: async (_root, target) => {
      if (target === "ctx_missing") {
        throw new Error("Entity not found: ctx_missing");
      }

      return {
        generated_at: "2026-06-05T00:00:00.000Z",
        context: { id: target, path: "memory/contexts/inventory-project.md", name: "Inventory Project" },
        active_facts: [contextClaim],
        role_claims: [],
        decision_claims: [contextClaim],
        open_question_claims: [],
        owner_claims: [],
        recent_changes: [],
        stale_claims: [],
        risks: [],
        followups: [],
        review_items: [],
        quick_briefs: [],
        citations: { page_paths: [], claim_ids: [], event_ids: [], followup_ids: [], review_item_ids: [], transaction_ids: [] },
        warnings: []
      };
    },
    buildContextOperatingRoomResult: async (_root, target) => {
      if (target === "ctx_missing") {
        throw new Error("Entity not found: ctx_missing");
      }

      return {
        generated_at: "2026-06-05T00:00:00.000Z",
        context: { id: target, path: "memory/contexts/inventory-project.md", name: "Inventory Project" },
        currentState: [contextClaim],
        owners: [],
        systems: [],
        decisions: [contextClaim],
        openQuestions: [],
        risks: [],
        recentChanges: [],
        staleClaims: [],
        reviewQueue: [],
        followupQueue: [],
        quickActions: [],
        citations: { page_paths: [], claim_ids: [], event_ids: [], followup_ids: [], review_item_ids: [], transaction_ids: [] },
        warnings: ["Context operating room is derived."]
      };
    },
    buildContextOperatingRoomV3: (input) => ({
      context: input.context,
      currentState: input.claims,
      owners: [],
      systems: input.symbolicFacts,
      decisions: input.claims.filter((claim) => claim.text.startsWith("Decision:")),
      openQuestions: [],
      risks: [],
      symbolicFacts: input.symbolicFacts,
      reviewQueue: input.reviewItems,
      followupQueue: input.followUps,
      missingMemoryPrompts: [],
      canonical_writes: []
    }),
    buildContextTimelineResult: async (_root, target) => ({
      generated_at: "2026-06-05T00:00:00.000Z",
      context: { id: target, path: "memory/contexts/inventory-project.md", name: "Inventory Project" },
      items: [],
      citations: { page_paths: [], claim_ids: [], event_ids: [], followup_ids: [], review_item_ids: [], transaction_ids: [] },
      warnings: []
    }),
    buildSymbolicIndex: async () => ({
      derived_facts: [
        {
          fact_id: "fact_system",
          relation: "depends_on_system",
          subject_id: "ctx_inventory_project",
          source_claim_ids: ["clm_context"],
          source_events: ["ev_context"],
          inference_rule: "canonical_frame"
        }
      ],
      proofs: [],
      canonical_writes: [],
      index_paths: []
    })
  });
  const contextDashboardRoute = registry.findRoute(contextRoutes, "GET", "/api/contexts/dashboard");
  const contextRoomRoute = registry.findRoute(contextRoutes, "GET", "/api/contexts/operating-room");
  const contextRoomV3Route = registry.findRoute(contextRoutes, "HEAD", "/api/contexts/operating-room-v3");
  const contextTimelineRoute = registry.findRoute(contextRoutes, "GET", "/api/contexts/timeline");
  assert.notEqual(contextDashboardRoute, null);
  assert.notEqual(contextRoomRoute, null);
  assert.notEqual(contextRoomV3Route, null);
  assert.notEqual(contextTimelineRoute, null);

  for (const [pathname, route] of [
    ["/api/contexts/dashboard", contextDashboardRoute],
    ["/api/contexts/operating-room", contextRoomRoute],
    ["/api/contexts/operating-room-v3", contextRoomV3Route],
    ["/api/contexts/timeline", contextTimelineRoute]
  ]) {
    const missingContextId = await route.handler({
      root: routeContextRoot,
      request: { method: "GET", url: pathname },
      requestUrl: new URL(`http://127.0.0.1${pathname}`)
    });
    assert.equal(missingContextId.status, 400);
  }

  const missingContext = await contextDashboardRoute.handler({
    root: routeContextRoot,
    request: { method: "GET", url: "/api/contexts/dashboard?id=ctx_missing" },
    requestUrl: new URL("http://127.0.0.1/api/contexts/dashboard?id=ctx_missing")
  });
  assert.equal(missingContext.status, 404);

  const missingContextRoomV3 = await contextRoomV3Route.handler({
    root: routeContextRoot,
    request: { method: "GET", url: "/api/contexts/operating-room-v3?id=ctx_missing" },
    requestUrl: new URL("http://127.0.0.1/api/contexts/operating-room-v3?id=ctx_missing")
  });
  assert.equal(missingContextRoomV3.status, 404);

  const contextDashboard = await contextDashboardRoute.handler({
    root: routeContextRoot,
    request: { method: "GET", url: "/api/contexts/dashboard?id=ctx_inventory_project" },
    requestUrl: new URL("http://127.0.0.1/api/contexts/dashboard?id=ctx_inventory_project")
  });
  assert.equal(JSON.parse(contextDashboard.body).context.id, "ctx_inventory_project");

  const contextRoomV3 = await contextRoomV3Route.handler({
    root: routeContextRoot,
    request: { method: "GET", url: "/api/contexts/operating-room-v3?id=ctx_inventory_project" },
    requestUrl: new URL("http://127.0.0.1/api/contexts/operating-room-v3?id=ctx_inventory_project")
  });
  const contextRoomV3Body = JSON.parse(contextRoomV3.body);
  assert.equal(contextRoomV3Body.version, "context-operating-room-v3");
  assert.deepEqual(contextRoomV3Body.canonical_writes, []);
  assert.match(contextRoomV3Body.warnings.join("\n"), /No canonical memory files were written/);

  const healthRoutes = health.createHealthRoutes({
    buildMaintenancePlan: async (_root, options) => ({
      version: "maintenance-dream-cycle-v1",
      generated_at: "2026-06-05T00:00:00.000Z",
      mode: options.mode ?? "full",
      seed: options.seed ?? "default",
      topic: options.topic,
      summary: {
        total_findings: 0,
        high: 0,
        medium: 0,
        low: 0,
        stageable: 0,
        health: 0,
        lint: 0,
        review_throughput: 0
      },
      selected_files: [],
      findings: [],
      review_throughput: { generated_at: "2026-06-05T00:00:00.000Z", lanes: [], bottlenecks: [], suggested_focus: [] },
      warnings: [],
      canonical_writes: []
    }),
    checkMemoryHealth: async () => ({
      generated_at: "2026-06-05T00:00:00.000Z",
      counts: {
        staged_review_items: 0,
        pending_transactions: 0,
        stale_noop_events: 0,
        contested_claims: 0,
        superseded_claims: 0,
        orphan_pages: 0,
        pages_missing_source_events: 0,
        retrieval_no_match_hotspots: 0
      },
      review_reasons: [],
      findings: [],
      affected_files: [],
      source_events: [],
      suggested_actions: [],
      warnings: []
    }),
    listMaintenanceRuns: async () => [
      {
        run_id: "run_123",
        run_path: ".assisto-local/lint-runs/run_123.json",
        generated_at: "2026-06-05T00:00:00.000Z",
        mode: "changed",
        finding_count: 0
      }
    ],
    readMaintenanceRun: async (_root, runId) => ({
      version: "maintenance-dream-cycle-v1",
      generated_at: "2026-06-05T00:00:00.000Z",
      mode: "changed",
      seed: "default",
      summary: {
        total_findings: 0,
        high: 0,
        medium: 0,
        low: 0,
        stageable: 0,
        health: 0,
        lint: 0,
        review_throughput: 0
      },
      selected_files: [],
      findings: [],
      review_throughput: { generated_at: "2026-06-05T00:00:00.000Z", lanes: [], bottlenecks: [], suggested_focus: [] },
      warnings: [],
      canonical_writes: [],
      run_id: runId,
      run_path: `.assisto-local/lint-runs/${runId}.json`
    })
  });
  const healthRoute = registry.findRoute(healthRoutes, "GET", "/api/health");
  const maintenancePlanRoute = registry.findRoute(healthRoutes, "GET", "/api/maintenance/plan");
  const maintenanceRunsRoute = registry.findRoute(healthRoutes, "GET", "/api/maintenance/runs");
  const maintenanceRunRoute = registry.findRoute(healthRoutes, "HEAD", "/api/maintenance/run");
  assert.notEqual(healthRoute, null);
  assert.notEqual(maintenancePlanRoute, null);
  assert.notEqual(maintenanceRunsRoute, null);
  assert.notEqual(maintenanceRunRoute, null);

  const healthResult = await healthRoute.handler({
    root: routeContextRoot,
    request: { method: "GET", url: "/api/health" },
    requestUrl: new URL("http://127.0.0.1/api/health")
  });
  assert.deepEqual(JSON.parse(healthResult.body).findings, []);

  const maintenancePlan = await maintenancePlanRoute.handler({
    root: routeContextRoot,
    request: { method: "GET", url: "/api/maintenance/plan?mode=unknown&seed=test&limit=4" },
    requestUrl: new URL("http://127.0.0.1/api/maintenance/plan?mode=unknown&seed=test&limit=4")
  });
  assert.equal(JSON.parse(maintenancePlan.body).mode, "full");

  const maintenanceRuns = await maintenanceRunsRoute.handler({
    root: routeContextRoot,
    request: { method: "GET", url: "/api/maintenance/runs" },
    requestUrl: new URL("http://127.0.0.1/api/maintenance/runs")
  });
  assert.equal(JSON.parse(maintenanceRuns.body).runs[0].run_id, "run_123");

  const missingRunId = await maintenanceRunRoute.handler({
    root: routeContextRoot,
    request: { method: "GET", url: "/api/maintenance/run" },
    requestUrl: new URL("http://127.0.0.1/api/maintenance/run")
  });
  assert.equal(missingRunId.status, 400);
  assert.match(JSON.parse(missingRunId.body).error, /Missing required query parameter: id/);

  const maintenanceRun = await maintenanceRunRoute.handler({
    root: routeContextRoot,
    request: { method: "GET", url: "/api/maintenance/run?id=run_123" },
    requestUrl: new URL("http://127.0.0.1/api/maintenance/run?id=run_123")
  });
  assert.equal(JSON.parse(maintenanceRun.body).run_id, "run_123");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runWorkbenchModularizationTests();
  console.log("workbench modularization tests passed");
}
