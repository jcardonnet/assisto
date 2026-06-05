import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { WorkbenchRouteRequest, WorkbenchRouteResponse } from "../shared/contracts";

export type WorkbenchRouteHandler = (root: string, request: WorkbenchRouteRequest) => Promise<WorkbenchRouteResponse>;

export function createWorkbenchHttpServer(root: string, handler: WorkbenchRouteHandler) {
  return createServer((request, response) => {
    void handleHttpRequest(root, request, response, handler);
  });
}

async function handleHttpRequest(
  root: string,
  request: IncomingMessage,
  response: ServerResponse,
  handler: WorkbenchRouteHandler
): Promise<void> {
  try {
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await readRequestBody(request);
    const route = await handler(root, {
      method: request.method,
      url: request.url ?? "/",
      body
    });
    writeRouteResponse(request, response, route);
  } catch (error) {
    writeRouteResponse(request, response, errorRoute(error));
  }
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > 1_000_000) {
      throw new Error("Workbench request body is too large.");
    }

    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeRouteResponse(
  request: IncomingMessage,
  response: ServerResponse,
  route: WorkbenchRouteResponse
): void {
  response.writeHead(route.status, {
    "content-type": route.content_type,
    "cache-control": "no-store"
  });
  response.end(request.method === "HEAD" ? "" : route.body);
}

function errorRoute(error: unknown): WorkbenchRouteResponse {
  return {
    status: 500,
    content_type: "application/json; charset=utf-8",
    body: `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`
  };
}
