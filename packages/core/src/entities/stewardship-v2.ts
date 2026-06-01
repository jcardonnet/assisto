import type { SymbolicFact } from "../symbolic";

export type EntityStewardshipV2Lane =
  | "safe"
  | "identity_risk"
  | "role_change"
  | "reporting_change"
  | "ownership_change"
  | "stale"
  | "conflict";

export interface EntityStewardshipV2Entity {
  id: string;
  kind: string;
  name: string;
  aliases?: string[];
}

export interface EntityStewardshipV2Claim {
  claim_id: string;
  text: string;
  claim_state: string;
  source_events: string[];
  scope_state?: string;
  valid_to?: string | null;
}

export interface EntityStewardshipV2Change {
  from_claim_id: string;
  to_claim_id: string;
}

export interface EntityStewardshipV2Result {
  entity: EntityStewardshipV2Entity;
  identityRisk: "low" | "medium" | "high";
  nearDuplicates: string[];
  aliasConflicts: string[];
  roleChanges: EntityStewardshipV2Change[];
  reportingChanges: EntityStewardshipV2Change[];
  ownershipChanges: EntityStewardshipV2Change[];
  staleClaims: string[];
  conflictingClaims: string[];
  symbolicFactIds: string[];
  recommendedReviewLane: EntityStewardshipV2Lane;
  warnings: string[];
}

export function buildEntityStewardshipV2(input: {
  entity: EntityStewardshipV2Entity;
  claims: EntityStewardshipV2Claim[];
  symbolicFacts?: SymbolicFact[];
  nearDuplicates?: string[];
  aliasConflicts?: string[];
}): EntityStewardshipV2Result {
  const claims = [...input.claims];
  const roleChanges = claimChangePairs(claims.filter((claim) => matchesRoleIntent(claim.text)));
  const reportingChanges = claimChangePairs(claims.filter((claim) => matchesReportingIntent(claim.text)));
  const ownershipChanges = claimChangePairs(claims.filter((claim) => matchesOwnershipIntent(claim.text)));
  const staleClaims = claims
    .filter((claim) => claim.claim_state === "superseded" || claim.claim_state === "rejected" || Boolean(claim.valid_to))
    .map((claim) => claim.claim_id);
  const conflictingClaims = claims
    .filter((claim) => claim.claim_state === "staged" || claim.scope_state === "unknown" || claim.scope_state === "partial")
    .map((claim) => claim.claim_id);
  const nearDuplicates = [...(input.nearDuplicates ?? [])].sort();
  const aliasConflicts = [...(input.aliasConflicts ?? [])].sort();
  const symbolicFactIds = (input.symbolicFacts ?? [])
    .filter((fact) => fact.source_claim_ids.some((claimId) => claims.some((claim) => claim.claim_id === claimId)))
    .map((fact) => fact.fact_id)
    .sort();
  const recommendedReviewLane = recommendedLane({
    nearDuplicates,
    aliasConflicts,
    roleChanges,
    reportingChanges,
    ownershipChanges,
    staleClaims,
    conflictingClaims
  });

  return {
    entity: input.entity,
    identityRisk: identityRiskLevel({ nearDuplicates, aliasConflicts, staleClaims, conflictingClaims }),
    nearDuplicates,
    aliasConflicts,
    roleChanges,
    reportingChanges,
    ownershipChanges,
    staleClaims,
    conflictingClaims,
    symbolicFactIds,
    recommendedReviewLane,
    warnings: [
      "Entity stewardship v2 is derived and read-only.",
      "Durable identity, role, reporting, or ownership corrections must be staged through Transactions."
    ]
  };
}

function claimChangePairs(claims: EntityStewardshipV2Claim[]): EntityStewardshipV2Change[] {
  const sorted = [...claims].sort((left, right) => claimChangeOrder(left) - claimChangeOrder(right) || left.claim_id.localeCompare(right.claim_id));
  if (sorted.length < 2) {
    return [];
  }

  return [
    {
      from_claim_id: sorted[0]?.claim_id ?? "",
      to_claim_id: sorted.at(-1)?.claim_id ?? ""
    }
  ];
}

function claimChangeOrder(claim: EntityStewardshipV2Claim): number {
  if (claim.claim_state === "superseded" || claim.claim_state === "rejected" || claim.valid_to) {
    return 0;
  }

  if (claim.claim_state === "staged") {
    return 1;
  }

  return 2;
}

function matchesRoleIntent(text: string): boolean {
  return /\b(role|title|manager|cto|dba|lead|responsible)\b/iu.test(text);
}

function matchesReportingIntent(text: string): boolean {
  return /\b(manager|reports to|reporting to|direct report|org chart)\b/iu.test(text);
}

function matchesOwnershipIntent(text: string): boolean {
  return /\b(owner|owns|owned by|ownership)\b/iu.test(text);
}

function identityRiskLevel(input: {
  nearDuplicates: string[];
  aliasConflicts: string[];
  staleClaims: string[];
  conflictingClaims: string[];
}): "low" | "medium" | "high" {
  if (input.nearDuplicates.length > 0 || input.aliasConflicts.length > 0) {
    return "high";
  }

  if (input.staleClaims.length > 0 || input.conflictingClaims.length > 0) {
    return "medium";
  }

  return "low";
}

function recommendedLane(input: {
  nearDuplicates: string[];
  aliasConflicts: string[];
  roleChanges: EntityStewardshipV2Change[];
  reportingChanges: EntityStewardshipV2Change[];
  ownershipChanges: EntityStewardshipV2Change[];
  staleClaims: string[];
  conflictingClaims: string[];
}): EntityStewardshipV2Lane {
  if (input.nearDuplicates.length > 0 || input.aliasConflicts.length > 0) {
    return "identity_risk";
  }

  if (input.conflictingClaims.length > 0) {
    return "conflict";
  }

  if (input.reportingChanges.length > 0) {
    return "reporting_change";
  }

  if (input.ownershipChanges.length > 0) {
    return "ownership_change";
  }

  if (input.roleChanges.length > 0) {
    return "role_change";
  }

  if (input.staleClaims.length > 0) {
    return "stale";
  }

  return "safe";
}
