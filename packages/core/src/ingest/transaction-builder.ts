import { serializeMarkdownFile, type Frontmatter } from "../markdown";
import type { FollowUpState, SupportedOperationType } from "../model";
import { evaluateStagingPolicy, type StagingReason } from "../policies";
import {
  slugify,
  stripMemoryPrefix,
  type CandidateClaim,
  type CandidateWrite,
  type ClaimDomain,
  type IngestExtractionDraft,
  type IngestPipelineContext,
  type ResolvedCandidate,
  type ResolvedClaimCandidate,
  type ResolvedFollowUpCandidate
} from "./candidates";
import { renderClaimBlock } from "./page-upsert";

interface PageClaimGroup {
  entityName: string;
  entityId: string;
  aliases?: string[];
  summary: string;
  claims: CandidateClaim[];
}

type WriteOrderItem =
  | { kind: "write"; write: CandidateWrite }
  | { kind: "person"; path: string }
  | { kind: "topic"; path: string };

export function buildIngestExtractionDraft(
  context: IngestPipelineContext,
  candidates: ResolvedCandidate[]
): IngestExtractionDraft {
  const claims: CandidateClaim[] = [];
  const writeOrder: WriteOrderItem[] = [];
  const stagedReviewPaths: string[] = [];
  const followupPaths: string[] = [];
  const participants = new Set<string>();
  const topics = new Set<string>();
  const personGroups = new Map<string, PageClaimGroup>();
  const topicGroups = new Map<string, PageClaimGroup>();

  for (const candidate of candidates) {
    if (candidate.kind === "followup") {
      const write = writeForFollowUp(context, candidate);
      followupPaths.push(write.path);
      writeOrder.push({ kind: "write", write });
      continue;
    }

    const policyCandidate = applyCandidatePolicy(candidate);
    const claim = createClaim(context, policyCandidate);
    claims.push(claim);
    collectEventLinks(policyCandidate, participants, topics);

    if (requiresEntityReview(policyCandidate)) {
      const write = renderEntityResolutionReviewWrite(context, policyCandidate, claim);
      stagedReviewPaths.push(write.path);
      writeOrder.push({ kind: "write", write });
      continue;
    }

    if (requiresScopeReview(policyCandidate)) {
      const write = renderScopeResolutionReviewWrite(context, policyCandidate, claim);
      stagedReviewPaths.push(write.path);
      writeOrder.push({ kind: "write", write });
      continue;
    }

    const conflictReason = claimConflictReason(policyCandidate);

    if (conflictReason) {
      const write = renderClaimConflictReviewWrite(context, policyCandidate, claim, conflictReason);
      stagedReviewPaths.push(write.path);
      writeOrder.push({ kind: "write", write });
      continue;
    }

    if (policyCandidate.entity.kind !== "person" && policyCandidate.staging_reasons.includes("missing_scope")) {
      const write = {
        path: "memory/review/unscoped-claims.md",
        operation: "STAGE_REVIEW" as const,
        content: renderUnscopedClaimReviewPage(context, policyCandidate, claim)
      };
      stagedReviewPaths.push(write.path);
      writeOrder.push({ kind: "write", write });
      continue;
    }

    if (policyCandidate.entity.kind === "person") {
      if (!personGroups.has(policyCandidate.entity.path)) {
        writeOrder.push({ kind: "person", path: policyCandidate.entity.path });
      }

      addClaimToGroup(personGroups, policyCandidate.entity.path, policyCandidate, claim);
      continue;
    }

    if (policyCandidate.entity.kind === "topic" || policyCandidate.entity.kind === "system") {
      if (!topicGroups.has(policyCandidate.entity.path)) {
        writeOrder.push({ kind: "topic", path: policyCandidate.entity.path });
      }

      addClaimToGroup(topicGroups, policyCandidate.entity.path, policyCandidate, claim);
    }
  }

  const writes = materializeWrites(context, writeOrder, personGroups, topicGroups);

  const operations = buildOperations(writes);

  return {
    claims,
    writes: writes.map((write) => ({
      path: write.path,
      content: write.content
    })),
    operations,
    stagedReviewPaths,
    followupPaths,
    participants: [...participants],
    topics: [...topics],
    intent:
      writes.length === 0
        ? "Capture source note as Event and make no canonical page changes."
        : "Capture source note as Event and draft deterministic MVP memory mutations for review."
  };
}

function materializeWrites(
  context: IngestPipelineContext,
  writeOrder: WriteOrderItem[],
  personGroups: Map<string, PageClaimGroup>,
  topicGroups: Map<string, PageClaimGroup>
): CandidateWrite[] {
  return writeOrder.map((item) => {
    if (item.kind === "write") {
      return item.write;
    }

    if (item.kind === "person") {
      const group = personGroups.get(item.path);

      if (!group) {
        throw new Error(`Missing person claim group for ${item.path}.`);
      }

      return {
        path: item.path,
        operation: "UPSERT_CLAIM",
        content: renderPersonPage({
          personName: group.entityName,
          personId: group.entityId,
          now: context.now,
          eventId: context.eventId,
          claims: group.claims,
          summary: group.summary,
          aliases: group.aliases
        })
      };
    }

    const group = topicGroups.get(item.path);

    if (!group) {
      throw new Error(`Missing topic claim group for ${item.path}.`);
    }

    return {
      path: item.path,
      operation: "UPSERT_CLAIM",
      content: renderTopicPage({
        topicName: group.entityName,
        topicId: group.entityId,
        now: context.now,
        eventId: context.eventId,
        claims: group.claims,
        summary: group.summary
      })
    };
  });
}

function applyCandidatePolicy(candidate: ResolvedClaimCandidate): ResolvedClaimCandidate {
  const staging = evaluateStagingPolicy({
    claimDomain: policyDomain(candidate),
    claim: {
      claim_kind: candidate.claim_kind,
      claim_state: "active",
      scope: candidate.scope,
      scope_state: candidate.scope_state,
      statement: candidate.statement
    },
    entityResolution: candidate.entity.resolution_state
  });
  const reasons = [
    ...staging.reasons,
    ...contextEntityStagingReasons(candidate),
    ...scopeStagingReasons(candidate)
  ];

  return {
    ...candidate,
    claim_state: reasons.length > 0 ? "staged" : "active",
    staging_reasons: reasons
  };
}

function createClaim(
  context: IngestPipelineContext,
  candidate: ResolvedClaimCandidate
): CandidateClaim {
  return {
    claim_id: candidate.claim_id,
    statement: candidate.statement,
    claim_kind: candidate.claim_kind,
    claim_state: candidate.claim_state,
    evidence_strength: candidate.evidence_strength,
    scope: candidate.scope,
    scope_state: candidate.scope_state,
    evidence: [context.eventId],
    recorded_at: context.now,
    observed_at: context.observedAt,
    valid_from: candidate.valid_from ?? null,
    valid_to: null,
    domain: claimDomain(candidate)
  };
}

function collectEventLinks(
  candidate: ResolvedClaimCandidate,
  participants: Set<string>,
  topics: Set<string>
): void {
  if (candidate.entity.kind === "person") {
    participants.add(candidate.entity.id);
  }

  if (candidate.entity.kind === "topic" || candidate.entity.kind === "system") {
    topics.add(candidate.entity.id);
  }

  for (const participantName of candidate.participant_names ?? []) {
    participants.add(`per_${slugify(participantName).replace(/-/g, "_")}`);
  }

  for (const topicName of candidate.topic_names ?? []) {
    topics.add(`top_${slugify(topicName).replace(/-/g, "_")}`);
  }
}

function requiresEntityReview(candidate: ResolvedClaimCandidate): boolean {
  return (
    candidate.staging_reasons.includes("entity_near_match") ||
    candidate.staging_reasons.includes("entity_ambiguous") ||
    (candidate.entity.kind === "context" && candidate.staging_reasons.includes("scope_new_context"))
  );
}

function requiresScopeReview(candidate: ResolvedClaimCandidate): boolean {
  return (
    candidate.staging_reasons.includes("scope_new_context") ||
    candidate.staging_reasons.includes("scope_near_match") ||
    candidate.staging_reasons.includes("scope_ambiguous")
  );
}

function claimConflictReason(candidate: ResolvedClaimCandidate): "role_change" | "reporting_change" | "claim_id_conflict" | null {
  if (candidate.entity.resolution_state !== "exact_match" && candidate.entity.resolution_state !== "alias_match") {
    return null;
  }

  const existingClaimIds = new Set(candidate.entity.existing_claim_ids);

  if (existingClaimIds.has(candidate.claim_id)) {
    return null;
  }

  if (existingClaimIds.size > 0 && existingClaimIds.has(candidate.claim_id)) {
    return "claim_id_conflict";
  }

  const entitySlug = candidate.entity.slug.replace(/-/g, "_");

  if (
    candidate.claim_id.startsWith(`clm_${entitySlug}_reports_to_`) &&
    [...existingClaimIds].some((claimId) => claimId.startsWith(`clm_${entitySlug}_reports_to_`))
  ) {
    return "reporting_change";
  }

  if (
    candidate.claim_id.startsWith(`clm_${entitySlug}_role_`) &&
    [...existingClaimIds].some((claimId) => claimId.startsWith(`clm_${entitySlug}_role_`))
  ) {
    return "role_change";
  }

  return null;
}

function renderClaimConflictReviewWrite(
  context: IngestPipelineContext,
  candidate: ResolvedClaimCandidate,
  claim: CandidateClaim,
  reason: "role_change" | "reporting_change" | "claim_id_conflict"
): CandidateWrite {
  const reviewId = `rev_${reason}_${slugify(candidate.entity.slug || candidate.entity.name)}`;
  const stagedClaim: CandidateClaim = {
    ...claim,
    claim_state: "staged"
  };
  const frontmatter: Frontmatter = {
    id: reviewId,
    type: "review_item",
    object_state: "active",
    review_state: "staged",
    review_reason: reason,
    created_at: context.now,
    source_events: [context.eventId],
    affected_files: [stripMemoryPrefix(candidate.entity.path)],
    linked_transaction: context.transactionId
  };
  const body = [
    `# Review: ${candidate.entity.name}`,
    "",
    "## Issue",
    "",
    `${reason} requires explicit review before updating canonical memory.`,
    "",
    "## Evidence",
    "",
    `- Event: [[${context.eventLinkPath}]]`,
    `- Candidate claim: \`${claim.claim_id}\``,
    `- Source text: ${candidate.source_text}`,
    "",
    "## Existing claim IDs",
    "",
    ...candidate.entity.existing_claim_ids.map((claimId) => `- ${claimId}`),
    "",
    "## Staged claims",
    "",
    renderClaimBlock(stagedClaim)
  ].join("\n");

  return {
    path: `memory/review/${reviewId}.md`,
    operation: "STAGE_REVIEW",
    content: serializeMarkdownFile(frontmatter, body)
  };
}

function contextEntityStagingReasons(candidate: ResolvedClaimCandidate): StagingReason[] {
  if (candidate.entity.kind !== "context" || candidate.entity.resolution_state === "exact_match" || candidate.entity.resolution_state === "alias_match") {
    return [];
  }

  if (candidate.entity.resolution_state === "ambiguous") {
    return ["entity_ambiguous"];
  }

  if (candidate.entity.resolution_state === "near_match") {
    return ["entity_near_match"];
  }

  return ["scope_new_context"];
}

function scopeStagingReasons(candidate: ResolvedClaimCandidate): StagingReason[] {
  if (!candidate.scope_resolution || candidate.entity.kind === "person") {
    return [];
  }

  if (candidate.scope_resolution.resolution_state === "ambiguous") {
    return ["scope_ambiguous"];
  }

  if (candidate.scope_resolution.resolution_state === "near_match") {
    return ["scope_near_match"];
  }

  if (candidate.scope_resolution.resolution_state === "new_entity") {
    return ["scope_new_context"];
  }

  return [];
}

function addClaimToGroup(
  groups: Map<string, PageClaimGroup>,
  path: string,
  candidate: ResolvedClaimCandidate,
  claim: CandidateClaim
): void {
  const existing = groups.get(path);

  if (existing) {
    existing.claims.push(claim);
    return;
  }

  groups.set(path, {
    entityName: candidate.entity.name,
    entityId: candidate.entity.id,
    aliases: candidate.aliases,
    summary: candidate.page_summary ?? claim.statement,
    claims: [claim]
  });
}

function writeForFollowUp(
  context: IngestPipelineContext,
  candidate: ResolvedFollowUpCandidate
): CandidateWrite {
  return {
    path: candidate.path,
    operation: "UPSERT_CLAIM",
    content: renderFollowUpPage({
      context,
      id: candidate.id,
      action: candidate.action,
      state: candidate.followup_state,
      trigger: candidate.trigger
    })
  };
}

function renderPersonPage(input: {
  personName: string;
  personId: string;
  now: string;
  eventId: string;
  claims: CandidateClaim[];
  summary: string;
  aliases?: string[];
}): string {
  const activeClaims = input.claims.filter((claim) => claim.claim_state === "active");
  const frontmatter: Frontmatter = {
    id: input.personId,
    type: "person",
    object_state: "active",
    review_state: input.claims.some((claim) => claim.claim_state === "staged") ? "staged" : "reviewed",
    created_at: input.now,
    updated_at: input.now,
    aliases: input.aliases ?? [],
    source_events: [input.eventId],
    related: [],
    summary_generated_from: activeClaims.map((claim) => claim.claim_id)
  };
  const body = [
    `# ${input.personName}`,
    "",
    "## Current summary",
    "",
    input.summary,
    "",
    "## Active claims",
    "",
    ...input.claims.filter((claim) => claim.claim_state === "active").map(renderClaimBlock),
    "",
    "## Staged claims",
    "",
    ...input.claims.filter((claim) => claim.claim_state === "staged").map(renderClaimBlock)
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

function renderTopicPage(input: {
  topicName: string;
  topicId: string;
  now: string;
  eventId: string;
  claims: CandidateClaim[];
  summary: string;
}): string {
  const activeClaims = input.claims.filter((claim) => claim.claim_state === "active");
  const frontmatter: Frontmatter = {
    id: input.topicId,
    type: "topic",
    object_state: "active",
    review_state: "reviewed",
    created_at: input.now,
    updated_at: input.now,
    aliases: [],
    source_events: [input.eventId],
    related: [],
    summary_generated_from: activeClaims.map((claim) => claim.claim_id)
  };
  const body = [
    `# ${input.topicName}`,
    "",
    "## Current summary",
    "",
    input.summary,
    "",
    "## Active claims",
    "",
    ...activeClaims.map(renderClaimBlock)
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

function renderUnscopedClaimReviewPage(
  context: IngestPipelineContext,
  candidate: ResolvedClaimCandidate,
  claim: CandidateClaim
): string {
  const frontmatter: Frontmatter = {
    id: "rev_unscoped_claims",
    type: "review_item",
    object_state: "active",
    review_state: "staged",
    review_reason: "unscoped_claim",
    created_at: context.now,
    source_events: [context.eventId],
    affected_files: [stripMemoryPrefix(candidate.entity.path)],
    linked_transaction: context.transactionId
  };
  const body = [
    "# Review: Unscoped claims",
    "",
    "## Issue",
    "",
    `The claim "${claim.statement.replace(/\.$/, "")}" is explicit but lacks system/project scope.`,
    "",
    "## Evidence",
    "",
    `- Event: [[${context.eventLinkPath}]]`,
    `- Candidate claim: \`${claim.claim_id}\``,
    "",
    "## Staged claims",
    "",
    renderClaimBlock(claim)
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

function renderScopeResolutionReviewWrite(
  context: IngestPipelineContext,
  candidate: ResolvedClaimCandidate,
  claim: CandidateClaim
): CandidateWrite {
  const scope = candidate.scope_resolution;
  const reviewId = `rev_scope_${slugify(scope?.original_scope ?? claim.scope ?? "unknown")}`;
  const reason = scopeReviewReason(candidate.staging_reasons);
  const frontmatter: Frontmatter = {
    id: reviewId,
    type: "review_item",
    object_state: "active",
    review_state: "staged",
    review_reason: reason,
    created_at: context.now,
    source_events: [context.eventId],
    affected_files: [stripMemoryPrefix(candidate.entity.path)],
    linked_transaction: context.transactionId
  };
  const body = [
    `# Review: ${scope?.original_scope ?? "Unknown scope"}`,
    "",
    "## Issue",
    "",
    `The candidate claim references scope "${scope?.original_scope ?? String(claim.scope)}" but no reviewed Context match was available.`,
    "",
    "## Evidence",
    "",
    `- Event: [[${context.eventLinkPath}]]`,
    `- Candidate claim: \`${claim.claim_id}\``,
    `- Source text: ${candidate.source_text}`,
    "",
    "## Resolution note",
    "",
    scope?.resolution_reason ?? "No deterministic scope resolution was available.",
    "",
    "## Staged claims",
    "",
    renderClaimBlock(claim)
  ].join("\n");

  return {
    path: `memory/review/${reviewId}.md`,
    operation: "STAGE_REVIEW",
    content: serializeMarkdownFile(frontmatter, body)
  };
}

function renderEntityResolutionReviewWrite(
  context: IngestPipelineContext,
  candidate: ResolvedClaimCandidate,
  claim: CandidateClaim
): CandidateWrite {
  const reviewId = `rev_entity_${candidate.entity.slug || slugify(candidate.entity.name)}`;
  const reason = entityReviewReason(candidate.staging_reasons);
  const frontmatter: Frontmatter = {
    id: reviewId,
    type: "review_item",
    object_state: "active",
    review_state: "staged",
    review_reason: reason,
    created_at: context.now,
    source_events: [context.eventId],
    affected_files: [stripMemoryPrefix(candidate.entity.path)],
    linked_transaction: context.transactionId
  };
  const body = [
    `# Review: ${candidate.entity.name}`,
    "",
    "## Issue",
    "",
    `${candidate.entity.resolution_state} entity resolution must be reviewed before updating canonical memory.`,
    "",
    "## Evidence",
    "",
    `- Event: [[${context.eventLinkPath}]]`,
    `- Candidate claim: \`${claim.claim_id}\``,
    `- Source text: ${candidate.source_text}`,
    "",
    "## Resolution note",
    "",
    candidate.entity.resolution_reason,
    "",
    "## Staged claims",
    "",
    renderClaimBlock(claim)
  ].join("\n");

  return {
    path: `memory/review/${reviewId}.md`,
    operation: "STAGE_REVIEW",
    content: serializeMarkdownFile(frontmatter, body)
  };
}

function renderFollowUpPage(input: {
  context: IngestPipelineContext;
  id: string;
  action: string;
  state: Extract<FollowUpState, "candidate" | "committed">;
  trigger: string;
}): string {
  const frontmatter: Frontmatter = {
    id: input.id,
    type: "followup",
    object_state: "active",
    review_state: input.state === "committed" ? "reviewed" : "staged",
    followup_state: input.state,
    created_at: input.context.now,
    updated_at: input.context.now,
    owner: "user",
    source_events: [input.context.eventId],
    related: [],
    transactions: [input.context.transactionId]
  };
  const body = [
    `# Follow-up: ${input.action}`,
    "",
    "## Action",
    "",
    input.action,
    "",
    "## Trigger",
    "",
    input.trigger,
    "",
    "## Evidence",
    "",
    `- Event: [[${input.context.eventLinkPath}]]`,
    `- Source note: ${input.context.note}`
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

function buildOperations(writes: CandidateWrite[]): Array<{ operation: SupportedOperationType; description?: string }> {
  const operations = new Map<SupportedOperationType, string>();

  for (const write of writes) {
    operations.set(write.operation, `draft ${stripMemoryPrefix(write.path)}`);
  }

  return [...operations.entries()].map(([operation, description]) => ({
    operation,
    description
  }));
}

function claimDomain(candidate: ResolvedClaimCandidate): ClaimDomain {
  if (candidate.entity.kind === "person") {
    return "person";
  }

  if (candidate.entity.kind === "topic") {
    return "topic";
  }

  return "system";
}

function policyDomain(candidate: ResolvedClaimCandidate): Parameters<typeof evaluateStagingPolicy>[0]["claimDomain"] {
  if (candidate.entity.kind === "system") {
    return "system";
  }

  if (candidate.entity.kind === "context") {
    return "project";
  }

  return candidate.entity.kind;
}

function entityReviewReason(reasons: StagingReason[]): string {
  if (reasons.includes("entity_ambiguous")) {
    return "entity_ambiguous";
  }

  if (reasons.includes("scope_new_context")) {
    return "context_new";
  }

  return "entity_near_match";
}

function scopeReviewReason(reasons: StagingReason[]): string {
  if (reasons.includes("scope_ambiguous")) {
    return "context_scope_ambiguous";
  }

  if (reasons.includes("scope_near_match")) {
    return "context_scope_near_match";
  }

  return "context_scope_new";
}
