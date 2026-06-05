import type {
  EntityDetailResult,
  EntityKind,
  EntityStewardshipCommandCenterResult,
  EntityStewardshipResult,
  EntitySummary
} from "@assisto/core";
import type { WorkbenchRoute } from "../route-registry";
import { jsonRoute } from "../route-utils";

export interface EntityRouteDependencies {
  buildEntityStewardshipCommandCenter: (root: string, kind: EntityKind) => Promise<EntityStewardshipCommandCenterResult>;
  buildEntityStewardshipResult: (root: string, kind: EntityKind) => Promise<EntityStewardshipResult>;
  getEntityDetail: (root: string, target: string) => Promise<EntityDetailResult>;
  listEntities: (root: string, kind: EntityKind) => Promise<EntitySummary[]>;
}

export function createEntityRoutes({
  buildEntityStewardshipCommandCenter,
  buildEntityStewardshipResult,
  getEntityDetail,
  listEntities
}: EntityRouteDependencies): WorkbenchRoute[] {
  return [
    {
      method: "GET",
      pathname: "/api/entities",
      handler: async ({ root, requestUrl }) => {
        const kind = optionalEntityKind(requestUrl);

        if (!kind) {
          return jsonRoute(400, { error: "Missing required query parameter: kind=person|topic|context." });
        }

        return jsonRoute(200, { kind, items: await listEntities(root, kind) });
      }
    },
    {
      method: "GET",
      pathname: "/api/entities/stewardship",
      handler: async ({ root, requestUrl }) => {
        const kind = optionalEntityKind(requestUrl);

        if (!kind) {
          return jsonRoute(400, { error: "Missing required query parameter: kind=person|topic|context." });
        }

        return jsonRoute(200, await buildEntityStewardshipResult(root, kind));
      }
    },
    {
      method: "GET",
      pathname: "/api/entities/stewardship-v2",
      handler: async ({ root, requestUrl }) => entityCommandCenterRoute(root, requestUrl, buildEntityStewardshipCommandCenter)
    },
    {
      method: "GET",
      pathname: "/api/entities/command-center",
      handler: async ({ root, requestUrl }) => entityCommandCenterRoute(root, requestUrl, buildEntityStewardshipCommandCenter)
    },
    createEntityDetailRoute("/api/entities/stewardship/detail", getEntityDetail),
    createEntityDetailRoute("/api/entities/detail", getEntityDetail)
  ];
}

async function entityCommandCenterRoute(
  root: string,
  requestUrl: URL,
  buildEntityStewardshipCommandCenter: EntityRouteDependencies["buildEntityStewardshipCommandCenter"]
) {
  const kind = optionalEntityKind(requestUrl);

  if (!kind) {
    return jsonRoute(400, { error: "Missing required query parameter: kind=person|topic|context." });
  }

  return jsonRoute(200, await buildEntityStewardshipCommandCenter(root, kind));
}

function createEntityDetailRoute(
  pathname: string,
  getEntityDetail: EntityRouteDependencies["getEntityDetail"]
): WorkbenchRoute {
  return {
    method: "GET",
    pathname,
    handler: async ({ root, requestUrl }) => {
      const target = optionalTarget(requestUrl);

      if (!target) {
        return jsonRoute(400, { error: "Missing required query parameter: id." });
      }

      try {
        return jsonRoute(200, await getEntityDetail(root, target));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.startsWith("Entity not found:") ? 404 : 400;
        return jsonRoute(status, { error: message });
      }
    }
  };
}

function optionalEntityKind(requestUrl: URL): EntityKind | undefined {
  const kind = requestUrl.searchParams.get("kind")?.trim();

  if (kind === "person" || kind === "topic" || kind === "context") {
    return kind;
  }

  return undefined;
}

function optionalTarget(requestUrl: URL): string | undefined {
  const target = requestUrl.searchParams.get("target") ?? requestUrl.searchParams.get("id") ?? requestUrl.searchParams.get("path");
  const trimmed = target?.trim();

  return trimmed || undefined;
}
