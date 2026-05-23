import type { ClaimBlock, EntityResolutionState } from "../model";

export type FollowUpIntent = "none" | "candidate" | "committed";

export interface FollowUpPolicyResult {
  intent: FollowUpIntent;
  trigger?: string;
  matched_text?: string;
}

export interface EntityResolutionCandidate {
  id: string;
  name: string;
  aliases?: string[];
  contextHints?: string[];
}

export interface EntityResolutionResult {
  state: EntityResolutionState;
  mention: string;
  candidates: EntityResolutionCandidate[];
  matchedCandidate?: EntityResolutionCandidate;
  reason: string;
}

export type StagingReason =
  | "missing_scope"
  | "entity_near_match"
  | "entity_ambiguous"
  | "high_impact_change"
  | "active_claim_conflict"
  | "possible_action_without_commitment"
  | "inferred_person_communication_guidance"
  | "generated_explanation_without_save"
  | "scope_new_context"
  | "scope_near_match"
  | "scope_ambiguous";

export interface StagingPolicyInput {
  claim?: Pick<ClaimBlock, "claim_kind" | "claim_state" | "scope" | "scope_state" | "statement">;
  claimDomain?: "system" | "project" | "architecture" | "person" | "topic" | "followup" | "other";
  entityResolution?: EntityResolutionState;
  changedFields?: Array<"role" | "owner" | "decision" | "deadline" | "commitment" | "other">;
  conflictsWithActiveClaim?: boolean;
  possibleActionLacksExplicitCommitment?: boolean;
  inferredPersonCommunicationGuidance?: boolean;
  generatedExplanationWouldPersist?: boolean;
  explicitSaveRequested?: boolean;
}

export interface StagingPolicyResult {
  stage: boolean;
  reasons: StagingReason[];
}

interface PatternRule {
  trigger: string;
  pattern: RegExp;
}

const committedFollowUpRules: PatternRule[] = [
  { trigger: "remind me to", pattern: /\bremind me to\b/i },
  { trigger: "I need to", pattern: /\bi need to\b/i },
  { trigger: "I have to", pattern: /\bi have to\b/i },
  { trigger: "I will", pattern: /\bi will\b/i },
  { trigger: "I'll", pattern: /\bi['’]ll\b/i },
  { trigger: "please track", pattern: /\bplease track\b/i },
  { trigger: "add a follow-up", pattern: /\badd a follow-up\b/i },
  { trigger: "asked me to", pattern: /\basked me to\b/i },
  { trigger: "due by", pattern: /\bdue by\b/i },
  { trigger: "by DATE I need to", pattern: /\bby\s+\S+(?:\s+\S+){0,5}\s+i need to\b/i }
];

const candidateFollowUpRules: PatternRule[] = [
  { trigger: "maybe I should", pattern: /\bmaybe i should\b/i },
  { trigger: "we should probably", pattern: /\bwe should probably\b/i },
  { trigger: "it might be worth", pattern: /\bit might be worth\b/i },
  { trigger: "need to understand", pattern: /\bneed to understand\b/i },
  { trigger: "I wonder if we should", pattern: /\bi wonder if we should\b/i },
  { trigger: "could follow up", pattern: /\bcould follow up\b/i }
];

const noFollowUpRules: PatternRule[] = [
  { trigger: "we discussed", pattern: /\bwe discussed\b/i },
  { trigger: "today I talked about", pattern: /\btoday i talked about\b/i },
  { trigger: "mentioned", pattern: /\bmentioned\b/i },
  { trigger: "cares about", pattern: /\bcares about\b/i },
  { trigger: "came up", pattern: /\bcame up\b/i },
  { trigger: "we talked with", pattern: /\bwe talked with\b/i }
];

const nicknameEquivalents = new Map<string, string[]>([
  ["joe", ["joseph", "joey"]],
  ["joseph", ["joe", "joey"]],
  ["joey", ["joe", "joseph"]],
  ["mike", ["michael", "miguel"]],
  ["michael", ["mike", "miguel"]],
  ["miguel", ["mike", "michael"]]
]);

const highImpactChangedFields = new Set(["role", "owner", "decision", "deadline", "commitment"]);

export function classifyFollowUpIntent(text: string): FollowUpPolicyResult {
  const noFollowUpMatch = firstMatch(text, noFollowUpRules);

  if (noFollowUpMatch) {
    return {
      intent: "none",
      trigger: noFollowUpMatch.trigger,
      matched_text: noFollowUpMatch.matched_text
    };
  }

  const committedMatch = firstMatch(text, committedFollowUpRules);

  if (committedMatch) {
    return {
      intent: "committed",
      trigger: committedMatch.trigger,
      matched_text: committedMatch.matched_text
    };
  }

  const candidateMatch = firstMatch(text, candidateFollowUpRules);

  if (candidateMatch) {
    return {
      intent: "candidate",
      trigger: candidateMatch.trigger,
      matched_text: candidateMatch.matched_text
    };
  }

  return {
    intent: "none"
  };
}

export function resolveEntityReference(
  mention: string,
  candidates: EntityResolutionCandidate[]
): EntityResolutionResult {
  const normalizedMention = normalizeEntityText(mention);

  if (!normalizedMention) {
    return {
      state: "new_entity",
      mention,
      candidates: [],
      reason: "Empty mention has no usable entity match."
    };
  }

  const exactMatches = candidates.filter(
    (candidate) => normalizeEntityText(candidate.name) === normalizedMention
  );
  const aliasMatches = candidates.filter((candidate) =>
    (candidate.aliases ?? []).some((alias) => normalizeEntityText(alias) === normalizedMention)
  );
  const nearMatches = candidates.filter(
    (candidate) =>
      !exactMatches.includes(candidate) &&
      !aliasMatches.includes(candidate) &&
      isNearEntityName(normalizedMention, candidate)
  );
  const plausibleMatches = uniqueCandidates([...exactMatches, ...aliasMatches, ...nearMatches]);

  if (plausibleMatches.length > 1) {
    return {
      state: "ambiguous",
      mention,
      candidates: plausibleMatches,
      reason: "Multiple plausible entity matches; stage review instead of merging."
    };
  }

  if (exactMatches.length === 1) {
    return {
      state: "exact_match",
      mention,
      candidates: exactMatches,
      matchedCandidate: exactMatches[0],
      reason: "Mention exactly matches one canonical entity name."
    };
  }

  if (aliasMatches.length === 1) {
    return {
      state: "alias_match",
      mention,
      candidates: aliasMatches,
      matchedCandidate: aliasMatches[0],
      reason: "Mention matches one existing canonical alias."
    };
  }

  if (nearMatches.length === 1) {
    return {
      state: "near_match",
      mention,
      candidates: nearMatches,
      matchedCandidate: nearMatches[0],
      reason: "Mention is similar to one existing entity; stage review before update."
    };
  }

  return {
    state: "new_entity",
    mention,
    candidates: [],
    reason: "No existing entity appears to match the mention."
  };
}

export function evaluateStagingPolicy(input: StagingPolicyInput): StagingPolicyResult {
  const reasons: StagingReason[] = [];

  if (hasMissingScopeForScopedClaim(input)) {
    reasons.push("missing_scope");
  }

  if (input.entityResolution === "near_match") {
    reasons.push("entity_near_match");
  }

  if (input.entityResolution === "ambiguous") {
    reasons.push("entity_ambiguous");
  }

  if ((input.changedFields ?? []).some((field) => highImpactChangedFields.has(field))) {
    reasons.push("high_impact_change");
  }

  if (input.conflictsWithActiveClaim) {
    reasons.push("active_claim_conflict");
  }

  if (input.possibleActionLacksExplicitCommitment) {
    reasons.push("possible_action_without_commitment");
  }

  if (input.inferredPersonCommunicationGuidance || isCommunicationGuidanceInference(input.claim)) {
    reasons.push("inferred_person_communication_guidance");
  }

  if (input.generatedExplanationWouldPersist && !input.explicitSaveRequested) {
    reasons.push("generated_explanation_without_save");
  }

  return {
    stage: reasons.length > 0,
    reasons
  };
}

function firstMatch(
  text: string,
  rules: PatternRule[]
): { trigger: string; matched_text: string } | null {
  for (const rule of rules) {
    const match = rule.pattern.exec(text);

    if (match?.[0]) {
      return {
        trigger: rule.trigger,
        matched_text: match[0]
      };
    }
  }

  return null;
}

function hasMissingScopeForScopedClaim(input: StagingPolicyInput): boolean {
  const scopedDomain =
    input.claimDomain === "system" ||
    input.claimDomain === "project" ||
    input.claimDomain === "architecture" ||
    input.claimDomain === "topic";

  if (!scopedDomain || !input.claim) {
    return false;
  }

  const scope = typeof input.claim.scope === "string" ? input.claim.scope.trim() : input.claim.scope;

  return input.claim.scope_state === "unknown" || scope === null || scope === undefined || scope === "";
}

function isCommunicationGuidanceInference(claim: StagingPolicyInput["claim"]): boolean {
  if (!claim) {
    return false;
  }

  const scope = typeof claim.scope === "string" ? claim.scope.toLowerCase() : "";
  const statement = claim.statement.toLowerCase();

  return (
    claim.claim_kind === "inference" &&
    (scope.includes("communication-guidance") ||
      statement.includes("communication") ||
      statement.includes("explaining") ||
      statement.includes("framing"))
  );
}

function normalizeEntityText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNearEntityName(mention: string, candidate: EntityResolutionCandidate): boolean {
  const names = [candidate.name, ...(candidate.aliases ?? [])].map(normalizeEntityText);

  for (const name of names) {
    if (areNicknames(mention, name)) {
      return true;
    }

    if (mention.length >= 3 && name.length >= 3 && (name.startsWith(mention) || mention.startsWith(name))) {
      return true;
    }

    if (mention.length >= 4 && name.length >= 4 && levenshteinDistance(mention, name) <= 2) {
      return true;
    }
  }

  return false;
}

function areNicknames(left: string, right: string): boolean {
  return (
    nicknameEquivalents.get(left)?.includes(right) === true ||
    nicknameEquivalents.get(right)?.includes(left) === true
  );
}

function uniqueCandidates(candidates: EntityResolutionCandidate[]): EntityResolutionCandidate[] {
  const seen = new Set<string>();
  const unique: EntityResolutionCandidate[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      continue;
    }

    seen.add(candidate.id);
    unique.push(candidate);
  }

  return unique;
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + substitutionCost
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index]!;
    }
  }

  return previous[right.length]!;
}
