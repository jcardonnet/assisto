import type { WorkbenchRouteResponse } from "../shared/contracts";

export function optionalQuery(requestUrl: URL): string | undefined {
  const query = requestUrl.searchParams.get("q") ?? requestUrl.searchParams.get("query");
  const trimmed = query?.trim();

  return trimmed ? trimmed : undefined;
}

export function jsonRoute(status: number, body: unknown): WorkbenchRouteResponse {
  return textRoute(status, `${JSON.stringify(body, null, 2)}\n`, "application/json; charset=utf-8");
}

export function textRoute(status: number, body: string, contentType: string): WorkbenchRouteResponse {
  return {
    status,
    content_type: contentType,
    body
  };
}
