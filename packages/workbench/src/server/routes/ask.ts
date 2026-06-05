import type { WorkbenchRouteResponse } from "../../shared/contracts";
import type { WorkbenchRoute } from "../route-registry";

type JsonRoute = (status: number, body: unknown) => WorkbenchRouteResponse;
type OptionalQuery = (requestUrl: URL) => string | undefined;
type RetrieveContextForAnswer = (root: string, query: string) => Promise<unknown>;

export interface AskRouteDependencies {
  jsonRoute: JsonRoute;
  optionalQuery: OptionalQuery;
  retrieveContextForAnswer: RetrieveContextForAnswer;
}

export function askRoutes(dependencies: AskRouteDependencies): WorkbenchRoute[] {
  return [
    {
      method: "GET",
      pathname: "/api/ask",
      handler: async ({ root, requestUrl }) => {
        const query = dependencies.optionalQuery(requestUrl);
        return query
          ? dependencies.jsonRoute(200, await dependencies.retrieveContextForAnswer(root, query))
          : dependencies.jsonRoute(400, { error: "Missing required query parameter: q." });
      }
    }
  ];
}
