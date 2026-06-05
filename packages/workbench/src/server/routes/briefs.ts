import type {
  BuildSessionBriefOptions,
  SessionBriefKind,
  SessionBriefResult,
  SessionBriefTarget,
  SessionBriefTargetKind
} from "@assisto/core";
import type { WorkbenchRoute } from "../route-registry";
import { jsonRoute } from "../route-utils";

export type WorkbenchBriefTargetOption = SessionBriefTarget;

export interface WorkbenchBriefTargetsResponse {
  kind: SessionBriefTargetKind;
  targets: WorkbenchBriefTargetOption[];
}

export interface BriefRouteDependencies {
  buildSessionBrief: (root: string, options: BuildSessionBriefOptions) => Promise<SessionBriefResult>;
  listSessionBriefTargets: (root: string, kind: SessionBriefTargetKind) => Promise<SessionBriefTarget[]>;
}

export function createBriefRoutes({
  buildSessionBrief,
  listSessionBriefTargets
}: BriefRouteDependencies): WorkbenchRoute[] {
  return [
    {
      method: "GET",
      pathname: "/api/brief/targets",
      handler: async ({ root, requestUrl }) => {
        const parsedKind = parseBriefTargetKind(requestUrl);
        const kind = parsedKind.kind;

        if (!kind) {
          return jsonRoute(400, { error: parsedKind.error });
        }

        const response: WorkbenchBriefTargetsResponse = {
          kind,
          targets: await listSessionBriefTargets(root, kind)
        };

        return jsonRoute(200, response);
      }
    },
    {
      method: "GET",
      pathname: "/api/brief",
      handler: async ({ root, requestUrl }) => {
        const kind = optionalBriefKind(requestUrl);

        if (!kind) {
          return jsonRoute(400, { error: "Missing required query parameter: kind." });
        }

        const targetKind = optionalBriefTargetKind(requestUrl);

        if (targetKind.error) {
          return jsonRoute(400, { error: targetKind.error });
        }

        return jsonRoute(200, await buildSessionBrief(root, { kind, targetKind: targetKind.kind, target: optionalTarget(requestUrl) }));
      }
    }
  ];
}

function optionalTarget(requestUrl: URL): string | undefined {
  const target = requestUrl.searchParams.get("target") ?? requestUrl.searchParams.get("id") ?? requestUrl.searchParams.get("path");
  const trimmed = target?.trim();

  return trimmed ? trimmed : undefined;
}

function optionalBriefKind(requestUrl: URL): SessionBriefKind | undefined {
  const kind = requestUrl.searchParams.get("kind")?.trim();

  if (kind === "today" || kind === "person" || kind === "context" || kind === "review" || kind === "followups" || kind === "recent") {
    return kind;
  }

  return undefined;
}

function optionalBriefTargetKind(requestUrl: URL): { kind?: SessionBriefTargetKind; error?: string } {
  const kind = requestUrl.searchParams.get("targetKind")?.trim();

  if (!kind) {
    return {};
  }

  if (kind === "person" || kind === "context") {
    return { kind };
  }

  return { error: "Invalid query parameter targetKind; expected person|context." };
}

function parseBriefTargetKind(requestUrl: URL): { kind: SessionBriefTargetKind; error?: never } | { kind?: never; error: string } {
  const kind = requestUrl.searchParams.get("kind")?.trim();

  if (!kind) {
    return { error: "Missing required query parameter: kind=person|context." };
  }

  if (kind === "person" || kind === "context") {
    return { kind };
  }

  return { error: "Invalid query parameter kind; expected person|context." };
}
