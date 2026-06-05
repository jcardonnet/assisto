import type {
  ContextDashboardResult,
  ContextOperatingRoomResult,
  ContextOperatingRoomV3Result,
  ContextTimelineResult,
  EntityClaimSummary,
  SymbolicIndexResult
} from "@assisto/core";
import type { WorkbenchRoute } from "../route-registry";
import { jsonRoute } from "../route-utils";

export interface ContextRouteDependencies {
  buildContextDashboardResult: (root: string, target: string) => Promise<ContextDashboardResult>;
  buildContextOperatingRoomResult: (root: string, target: string) => Promise<ContextOperatingRoomResult>;
  buildContextOperatingRoomV3: (input: {
    context: { id: string; name: string };
    claims: Array<{ claim_id: string; text: string; source_events: string[] }>;
    symbolicFacts: Array<{ fact_id: string; relation: string; source_events: string[] }>;
    reviewItems: unknown[];
    followUps: unknown[];
  }) => ContextOperatingRoomV3Result;
  buildContextTimelineResult: (root: string, target: string) => Promise<ContextTimelineResult>;
  buildSymbolicIndex: (options: { root: string; write?: boolean }) => Promise<SymbolicIndexResult>;
}

type ContextRouteBuilder = (root: string, target: string) => Promise<unknown>;

export function createContextRoutes(dependencies: ContextRouteDependencies): WorkbenchRoute[] {
  return [
    createContextResultRoute("/api/contexts/dashboard", dependencies.buildContextDashboardResult),
    createContextResultRoute("/api/contexts/operating-room", dependencies.buildContextOperatingRoomResult),
    createContextResultRoute("/api/contexts/operating-room-v3", (root, target) =>
      buildWorkbenchContextOperatingRoomV3(root, target, dependencies)
    ),
    createContextResultRoute("/api/contexts/timeline", dependencies.buildContextTimelineResult)
  ];
}

function createContextResultRoute(pathname: string, buildResult: ContextRouteBuilder): WorkbenchRoute {
  return {
    method: "GET",
    pathname,
    handler: async ({ root, requestUrl }) => {
      const target = optionalTarget(requestUrl);

      if (!target) {
        return jsonRoute(400, { error: "Missing required query parameter: id." });
      }

      try {
        return jsonRoute(200, await buildResult(root, target));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.startsWith("Entity not found:") ? 404 : 400;
        return jsonRoute(status, { error: message });
      }
    }
  };
}

async function buildWorkbenchContextOperatingRoomV3(
  root: string,
  target: string,
  {
    buildContextOperatingRoomResult,
    buildContextOperatingRoomV3,
    buildSymbolicIndex
  }: Pick<ContextRouteDependencies, "buildContextOperatingRoomResult" | "buildContextOperatingRoomV3" | "buildSymbolicIndex">
) {
  const room = await buildContextOperatingRoomResult(root, target);
  const symbolicIndex = await buildSymbolicIndex({ root });
  const claims = uniqueContextRoomClaims([
    ...room.currentState,
    ...room.decisions,
    ...room.openQuestions,
    ...room.staleClaims
  ]);
  const claimIds = new Set(claims.map((claim) => claim.claim_id));
  const symbolicFacts = symbolicIndex.derived_facts
    .filter((fact) => fact.source_claim_ids.some((claimId) => claimIds.has(claimId)) || fact.relation.includes("system"))
    .map((fact) => ({
      fact_id: fact.fact_id,
      relation: fact.relation,
      source_events: fact.source_events
    }));
  const result = buildContextOperatingRoomV3({
    context: {
      id: room.context.id ?? room.context.path,
      name: room.context.name
    },
    claims: claims.map((claim) => ({
      claim_id: claim.claim_id,
      text: claim.statement,
      source_events: claim.evidence
    })),
    symbolicFacts,
    reviewItems: room.reviewQueue,
    followUps: room.followupQueue
  });

  return {
    version: "context-operating-room-v3",
    generated_at: room.generated_at,
    ...result,
    citations: room.citations,
    warnings: uniqueStrings([
      ...room.warnings,
      "Context operating room v3 is derived from claims, reviews, follow-ups, and symbolic facts.",
      "No canonical memory files were written."
    ])
  };
}

function uniqueContextRoomClaims(claims: EntityClaimSummary[]): EntityClaimSummary[] {
  const seen = new Set<string>();
  const output: EntityClaimSummary[] = [];

  for (const claim of claims) {
    if (seen.has(claim.claim_id)) {
      continue;
    }

    seen.add(claim.claim_id);
    output.push(claim);
  }

  return output;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function optionalTarget(requestUrl: URL): string | undefined {
  const target = requestUrl.searchParams.get("target") ?? requestUrl.searchParams.get("id") ?? requestUrl.searchParams.get("path");
  const trimmed = target?.trim();

  return trimmed || undefined;
}
