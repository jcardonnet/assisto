import type { EntityResolutionCandidate } from "../policies";
import { resolveEntityReference } from "../policies";
import type { VaultIndex, VaultIndexEntry } from "../vault";
import {
  slugify,
  type CandidateEntityKind,
  type DetectorProposal,
  type ExtractedClaimCandidate,
  type ResolvedCandidate,
  type ResolvedClaimCandidate,
  type ResolvedEntity,
  type ResolvedScope,
  type ResolvedFollowUpCandidate
} from "./candidates";

interface ExistingEntity extends EntityResolutionCandidate {
  path: string;
  kind: CandidateEntityKind;
  claimIds: string[];
}

export function resolveDetectorProposals(
  proposals: DetectorProposal[],
  index: VaultIndex
): ResolvedCandidate[] {
  return proposals.map((proposal) =>
    proposal.kind === "claim" ? resolveClaimProposal(proposal, index) : resolveFollowUpProposal(proposal)
  );
}

function resolveClaimProposal(
  proposal: ExtractedClaimCandidate,
  index: VaultIndex
): ResolvedClaimCandidate {
  const existing = existingEntitiesForKind(index, proposal.entity_kind);
  const resolution = resolveEntityReference(proposal.entity_name, existing);
  const matched = resolution.matchedCandidate as ExistingEntity | undefined;
  const resolutionState = cautiousResolutionState(resolution.state, proposal.entity_resolution_hint);
  const slug = matched ? slugFromPath(matched.path) : slugify(proposal.entity_name);
  const proposedPath = matched?.path ?? pathForEntity(proposal.entity_kind, slug);
  const existingClaimPath = index.claimIds.get(proposal.claim_id);
  const entity = entityForProposal(proposal, {
    slug,
    id: matched?.id,
    path: proposedPath,
    existingClaimIds: matched?.claimIds ?? [],
    claimIdConflictPath:
      existingClaimPath && normalizePath(existingClaimPath) !== normalizePath(proposedPath) ? existingClaimPath : undefined,
    resolutionState,
    resolutionReason:
      resolutionState === resolution.state
        ? resolution.reason
        : `${resolution.reason} Provider hint ${proposal.entity_resolution_hint} requires review.`
  });
  const scopeResolution = resolveScope(proposal, index);

  return {
    ...proposal,
    scope: scopeResolution?.scope ?? proposal.scope,
    entity,
    scope_resolution: scopeResolution,
    claim_state: "active",
    staging_reasons: []
  };
}

function resolveFollowUpProposal(proposal: DetectorProposal): ResolvedFollowUpCandidate {
  if (proposal.kind !== "followup") {
    throw new Error("Expected follow-up proposal.");
  }

  const slug = slugify(proposal.action || "follow-up");

  return {
    ...proposal,
    id: `fu_${slug}`,
    slug,
    path: `memory/followups/${slug}.md`
  };
}

function entityForProposal(
  proposal: ExtractedClaimCandidate,
  input: {
    slug: string;
    id?: string;
    path?: string;
    existingClaimIds?: string[];
    claimIdConflictPath?: string;
    resolutionState: ResolvedEntity["resolution_state"];
    resolutionReason: string;
  }
): ResolvedEntity {
  const slug = input.slug;

  return {
    kind: proposal.entity_kind,
    name: proposal.entity_name,
    id: input.id ?? idForEntity(proposal.entity_kind, slug),
    slug,
    path: input.path ?? pathForEntity(proposal.entity_kind, slug),
    existing_claim_ids: input.existingClaimIds ?? [],
    claim_id_conflict_path: input.claimIdConflictPath,
    resolution_state: input.resolutionState,
    resolution_reason: input.resolutionReason
  };
}

function existingEntitiesForKind(index: VaultIndex, kind: CandidateEntityKind): ExistingEntity[] {
  const entityType = kind === "system" ? "topic" : kind;

  return index.entries
    .filter((entry) => normalizeType(entry.type) === entityType)
    .filter((entry): entry is VaultIndexEntry & { id: string } => typeof entry.id === "string")
    .map((entry) => ({
      id: entry.id,
      name: entityNameFromPath(entry.path),
      aliases: entry.aliases,
      claimIds: entry.claimIds,
      path: entry.path,
      kind
    }));
}

function resolveScope(proposal: ExtractedClaimCandidate, index: VaultIndex): ResolvedScope | undefined {
  const scope = typeof proposal.scope === "string" ? proposal.scope.trim() : "";

  if (!scope || proposal.scope_state !== "complete" || isBuiltInScope(scope)) {
    return undefined;
  }

  const contexts = existingEntitiesForKind(index, "context");
  const resolution = resolveEntityReference(scope, contexts);
  const matched = resolution.matchedCandidate as ExistingEntity | undefined;

  if (matched && (resolution.state === "exact_match" || resolution.state === "alias_match")) {
    return {
      original_scope: scope,
      scope: matched.id,
      scope_id: matched.id,
      scope_path: matched.path,
      resolution_state: resolution.state,
      resolution_reason: resolution.reason
    };
  }

  return {
    original_scope: scope,
    scope,
    scope_id: matched?.id,
    scope_path: matched?.path,
    resolution_state: resolution.state,
    resolution_reason: resolution.reason
  };
}

function cautiousResolutionState(
  deterministic: ResolvedEntity["resolution_state"],
  hint: ResolvedEntity["resolution_state"] | undefined
): ResolvedEntity["resolution_state"] {
  if (hint === "ambiguous") {
    return "ambiguous";
  }

  if (hint === "near_match" && deterministic !== "ambiguous") {
    return "near_match";
  }

  return deterministic;
}

function isBuiltInScope(scope: string): boolean {
  return [
    "current-work-context",
    "professional-profile",
    "communication-guidance",
    "discussion"
  ].includes(scope.toLowerCase());
}

function idForEntity(kind: CandidateEntityKind, slug: string): string {
  if (kind === "person") {
    return `per_${slug.replace(/-/g, "_")}`;
  }

  if (kind === "context") {
    return `ctx_${slug.replace(/-/g, "_")}`;
  }

  return `top_${slug.replace(/-/g, "_")}`;
}

function pathForEntity(kind: CandidateEntityKind, slug: string): string {
  if (kind === "person") {
    return `memory/people/${slug}.md`;
  }

  if (kind === "context") {
    return `memory/contexts/${slug}.md`;
  }

  return `memory/topics/${slug}.md`;
}

function normalizeType(value: string | undefined): string {
  return (value ?? "").toLowerCase();
}

function entityNameFromPath(path: string): string {
  const basename = path.split("/").pop()?.replace(/\.md$/i, "") ?? "";

  return basename
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugFromPath(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/i, "") ?? "";
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}
