import type {
  MaintenanceMode,
  MaintenancePlanOptions,
  MaintenancePlanResult,
  MaintenanceRunListItem,
  MaintenanceRunResult,
  MemoryHealthResult
} from "@assisto/core";
import type { WorkbenchRoute } from "../route-registry";
import { jsonRoute } from "../route-utils";

export interface HealthRouteDependencies {
  buildMaintenancePlan: (root: string, options: MaintenancePlanOptions) => Promise<MaintenancePlanResult>;
  checkMemoryHealth: (root: string) => Promise<MemoryHealthResult>;
  listMaintenanceRuns: (root: string) => Promise<MaintenanceRunListItem[]>;
  readMaintenanceRun: (root: string, runId: string) => Promise<MaintenanceRunResult>;
}

export function createHealthRoutes({
  buildMaintenancePlan,
  checkMemoryHealth,
  listMaintenanceRuns,
  readMaintenanceRun
}: HealthRouteDependencies): WorkbenchRoute[] {
  return [
    {
      method: "GET",
      pathname: "/api/health",
      handler: async ({ root }) => jsonRoute(200, await checkMemoryHealth(root))
    },
    {
      method: "GET",
      pathname: "/api/maintenance/plan",
      handler: async ({ root, requestUrl }) => jsonRoute(200, await buildMaintenancePlan(root, maintenanceOptionsFromUrl(requestUrl)))
    },
    {
      method: "GET",
      pathname: "/api/maintenance/runs",
      handler: async ({ root }) => jsonRoute(200, { runs: await listMaintenanceRuns(root) })
    },
    {
      method: "GET",
      pathname: "/api/maintenance/run",
      handler: async ({ root, requestUrl }) => {
        const target = optionalTarget(requestUrl);
        return target
          ? jsonRoute(200, await readMaintenanceRun(root, target))
          : jsonRoute(400, { error: "Missing required query parameter: id." });
      }
    }
  ];
}

function maintenanceOptionsFromUrl(requestUrl: URL): MaintenancePlanOptions {
  const mode = requestUrl.searchParams.get("mode") ?? "full";
  return {
    mode: isMaintenanceMode(mode) ? mode : "full",
    seed: requestUrl.searchParams.get("seed") ?? undefined,
    topic: requestUrl.searchParams.get("topic") ?? undefined,
    limit: optionalNumberQuery(requestUrl, "limit")
  };
}

function isMaintenanceMode(value: string): value is MaintenanceMode {
  return value === "changed" || value === "random" || value === "topic" || value === "full";
}

function optionalNumberQuery(requestUrl: URL, key: string): number | undefined {
  const value = requestUrl.searchParams.get(key);

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalTarget(requestUrl: URL): string | undefined {
  const target = requestUrl.searchParams.get("target") ?? requestUrl.searchParams.get("id") ?? requestUrl.searchParams.get("path");
  const trimmed = target?.trim();

  return trimmed ? trimmed : undefined;
}
