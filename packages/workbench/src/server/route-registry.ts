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

export function findRoute(
  routes: WorkbenchRoute[],
  method: WorkbenchRouteMethod,
  pathname: string
): WorkbenchRoute | null {
  const normalizedMethod: WorkbenchRouteMethod = method === "HEAD" ? "GET" : method;

  return routes.find((route) => route.pathname === pathname && route.method === normalizedMethod) ?? null;
}
