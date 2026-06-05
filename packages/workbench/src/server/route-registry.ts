import type { WorkbenchRouteRequest, WorkbenchRouteResponse } from "../shared/contracts";

export type WorkbenchRouteMethod = "GET" | "HEAD" | "POST";

export interface WorkbenchRouteContext {
  root: string;
  request: WorkbenchRouteRequest;
  requestUrl: URL;
}

export interface WorkbenchRoute {
  method: WorkbenchRouteMethod;
  pathname: string;
  handler: (context: WorkbenchRouteContext) => Promise<WorkbenchRouteResponse> | WorkbenchRouteResponse;
}

export function findRoute(routes: WorkbenchRoute[], method: string, pathname: string): WorkbenchRoute | null {
  return (
    routes.find(
      (route) =>
        route.pathname === pathname && (route.method === method || (method === "HEAD" && route.method === "GET"))
    ) ?? null
  );
}
