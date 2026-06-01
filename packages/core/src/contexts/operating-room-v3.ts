export interface ContextOperatingRoomV3Claim {
  claim_id: string;
  text: string;
  source_events: string[];
}

export interface ContextOperatingRoomV3SymbolicFact {
  fact_id: string;
  relation: string;
  source_events: string[];
}

export interface ContextOperatingRoomV3Result {
  context: { id: string; name: string };
  currentState: ContextOperatingRoomV3Claim[];
  owners: ContextOperatingRoomV3SymbolicFact[];
  systems: ContextOperatingRoomV3SymbolicFact[];
  decisions: ContextOperatingRoomV3Claim[];
  openQuestions: ContextOperatingRoomV3Claim[];
  risks: ContextOperatingRoomV3Claim[];
  symbolicFacts: ContextOperatingRoomV3SymbolicFact[];
  reviewQueue: unknown[];
  followupQueue: unknown[];
  missingMemoryPrompts: string[];
  canonical_writes: string[];
}

export function buildContextOperatingRoomV3(input: {
  context: { id: string; name: string };
  claims: ContextOperatingRoomV3Claim[];
  symbolicFacts: ContextOperatingRoomV3SymbolicFact[];
  reviewItems: unknown[];
  followUps: unknown[];
}): ContextOperatingRoomV3Result {
  return {
    context: input.context,
    currentState: input.claims,
    owners: input.symbolicFacts.filter((fact) => fact.relation === "owns_system" || fact.relation === "owns"),
    systems: input.symbolicFacts.filter((fact) => fact.relation.includes("system")),
    decisions: input.claims.filter((claim) => /^Decision:/iu.test(claim.text)),
    openQuestions: input.claims.filter((claim) => /^Open question:/iu.test(claim.text)),
    risks: input.claims.filter((claim) => /\brisk\b/iu.test(claim.text)),
    symbolicFacts: input.symbolicFacts,
    reviewQueue: input.reviewItems,
    followupQueue: input.followUps,
    missingMemoryPrompts: ["Capture current owner, current risks, and unresolved open questions."],
    canonical_writes: []
  };
}
