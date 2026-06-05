import type { WorkbenchRoute } from "../route-registry";
import { jsonRoute, optionalQuery } from "../route-utils";

type RetrieveContextForAnswer = (root: string, query: string) => Promise<unknown>;

export interface AskRouteDependencies {
  retrieveContextForAnswer: RetrieveContextForAnswer;
}

export function createAskRoute({ retrieveContextForAnswer }: AskRouteDependencies): WorkbenchRoute {
  return {
    method: "GET",
    pathname: "/api/ask",
    handler: async ({ root, requestUrl }) => {
      const query = optionalQuery(requestUrl);
      return query
        ? jsonRoute(200, await retrieveContextForAnswer(root, query))
        : jsonRoute(400, { error: "Missing required query parameter: q." });
    }
  };
}
