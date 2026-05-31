import type {
  AnswerBasisResult,
  AnswerCannotConfirm,
  AnswerCitationMap,
  AnswerCitationSet,
  AnswerConflict,
  AnswerStaleSignal,
  PackedAnswerCandidate,
  CitedDirectAnswer,
  PackedClaim,
  PackedEvidenceEvent,
  PackedLinkedItem,
  PackedMissingInformation,
  PackedPageSummary,
  RetrievalManualAction,
  RetrievalQueryIntent
} from "../retrieval";

export type AnswerCitationKind = "claim" | "event" | "page" | "review_item" | "followup";

export interface AnswerCitationV3 {
  citation_id: string;
  kind: AnswerCitationKind;
  id: string;
  label: string;
  path?: string;
  claim_id?: string;
  event_id?: string;
  page_path?: string;
}

export interface CitedDirectAnswerV3 {
  answer_id: string;
  text: string;
  answer: string;
  answer_kind: string;
  confidence_label: "source_backed" | "partial_scope" | "scope_uncertain" | "source_missing";
  claim_id: string;
  page_path: string;
  statement: string;
  claim_kind: string;
  scope: string | null;
  scope_state: string;
  basis: CitedDirectAnswer["basis"];
  why_included: string;
  citations: AnswerCitationV3[];
  citation_ids: string[];
  inference_paths: string[];
}

export interface CannotConfirmV3 {
  item_id: string;
  code: AnswerCannotConfirm["code"];
  message: string;
  text: string;
  missing_evidence: string[];
  citations: AnswerCitationV3[];
  citation_ids: string[];
  repair_action_ids: string[];
}

export interface AnswerConflictV3 extends Omit<AnswerConflict, "citations"> {
  citations: AnswerCitationV3[];
  citation_ids: string[];
}

export interface AnswerStaleSignalV3 extends Omit<AnswerStaleSignal, "citations"> {
  citations: AnswerCitationV3[];
  citation_ids: string[];
}

export interface RepairActionV3 extends RetrievalManualAction {
  action_id: string;
}

export interface CitedAnswerContractV3 {
  version: "answer-contract-v3";
  query: string;
  question: string;
  queryIntent: RetrievalQueryIntent;
  plannedLookups: AnswerBasisResult["plannedLookups"];
  directAnswers: CitedDirectAnswerV3[];
  cannotConfirm: CannotConfirmV3[];
  conflicts: AnswerConflictV3[];
  staleSignals: AnswerStaleSignalV3[];
  citationMap: AnswerCitationMap;
  citationIndex: Record<string, AnswerCitationV3>;
  repairActions: RepairActionV3[];
  matchedPages: PackedPageSummary[];
  answerCandidates: PackedAnswerCandidate[];
  supportingClaims: PackedClaim[];
  uncertainClaims: PackedClaim[];
  evidenceEvents: PackedEvidenceEvent[];
  linkedReviewItems: PackedLinkedItem[];
  linkedFollowUps: PackedLinkedItem[];
  missingInformation: PackedMissingInformation[];
  suggestedNextQuestions: string[];
  warnings: string[];
  contextPack: string;
}

export function buildCitedAnswerContractV3(basis: AnswerBasisResult): CitedAnswerContractV3 {
  const repairActions = (basis.repairActions ?? basis.manualActions ?? []).map((action, index) => ({
    ...action,
    action_id: repairActionId(action, index)
  }));
  const citationIndex: Record<string, AnswerCitationV3> = {};
  const directAnswers = (basis.directAnswers ?? []).map((answer) =>
    directAnswerV3(answer, basis, citationIndex)
  );
  const cannotConfirm = (basis.cannotConfirm ?? []).map((item, index) =>
    cannotConfirmV3(item, index, basis, repairActions, citationIndex)
  );
  const conflicts = (basis.conflicts ?? []).map((item) => conflictV3(item, basis, citationIndex));
  const staleSignals = (basis.staleSignals ?? []).map((item) => staleSignalV3(item, basis, citationIndex));

  return {
    version: "answer-contract-v3",
    query: basis.query,
    question: basis.query,
    queryIntent: basis.queryIntent,
    plannedLookups: basis.plannedLookups,
    directAnswers,
    cannotConfirm,
    conflicts,
    staleSignals,
    citationMap: basis.citationMap,
    citationIndex,
    repairActions,
    matchedPages: basis.matchedPages,
    answerCandidates: basis.answerCandidates,
    supportingClaims: basis.supportingClaims,
    uncertainClaims: basis.uncertainClaims,
    evidenceEvents: basis.evidenceEvents,
    linkedReviewItems: basis.linkedReviewItems,
    linkedFollowUps: basis.linkedFollowUps,
    missingInformation: basis.missingInformation,
    suggestedNextQuestions: basis.suggestedNextQuestions,
    warnings: basis.warnings,
    contextPack: basis.contextPack
  };
}

function directAnswerV3(
  answer: CitedDirectAnswer,
  basis: AnswerBasisResult,
  citationIndex: Record<string, AnswerCitationV3>
): CitedDirectAnswerV3 {
  const citations = citationsForSet(answer.citations, basis, citationIndex);
  const eventCount = answer.citations.event_ids.length;

  return {
    answer_id: answer.answer_id,
    text: answer.answer,
    answer: answer.answer,
    answer_kind: answerKind(answer, basis.queryIntent),
    confidence_label: confidenceLabel(answer, eventCount),
    claim_id: answer.claim_id,
    page_path: answer.page_path,
    statement: answer.statement,
    claim_kind: answer.claim_kind,
    scope: answer.scope,
    scope_state: answer.scope_state,
    basis: answer.basis,
    why_included: answer.why_included,
    citations,
    citation_ids: citations.map((citation) => citation.citation_id),
    inference_paths: inferencePaths(answer)
  };
}

function cannotConfirmV3(
  item: AnswerCannotConfirm,
  index: number,
  basis: AnswerBasisResult,
  repairActions: RepairActionV3[],
  citationIndex: Record<string, AnswerCitationV3>
): CannotConfirmV3 {
  const citations = citationsForSet(item.citations, basis, citationIndex);

  return {
    item_id: `cannot_confirm_${index + 1}_${item.code}`,
    code: item.code,
    message: item.message,
    text: item.message,
    missing_evidence: missingEvidenceForCannotConfirm(item),
    citations,
    citation_ids: citations.map((citation) => citation.citation_id),
    repair_action_ids: repairActionsForCannotConfirm(item, repairActions)
  };
}

function conflictV3(
  item: AnswerConflict,
  basis: AnswerBasisResult,
  citationIndex: Record<string, AnswerCitationV3>
): AnswerConflictV3 {
  const citations = citationsForSet(item.citations, basis, citationIndex);

  return {
    ...item,
    citations,
    citation_ids: citations.map((citation) => citation.citation_id)
  };
}

function staleSignalV3(
  item: AnswerStaleSignal,
  basis: AnswerBasisResult,
  citationIndex: Record<string, AnswerCitationV3>
): AnswerStaleSignalV3 {
  const citations = citationsForSet(item.citations, basis, citationIndex);

  return {
    ...item,
    citations,
    citation_ids: citations.map((citation) => citation.citation_id)
  };
}

function citationsForSet(
  set: AnswerCitationSet,
  basis: AnswerBasisResult,
  citationIndex: Record<string, AnswerCitationV3>
): AnswerCitationV3[] {
  return dedupeCitations([
    ...set.claim_ids.map((claimId) => claimCitation(claimId, basis)),
    ...set.event_ids.map((eventId) => eventCitation(eventId, basis)),
    ...set.page_paths.map((pagePath) => pageCitation(pagePath, basis))
  ].filter((citation): citation is AnswerCitationV3 => Boolean(citation))).map((citation) => {
    citationIndex[citation.citation_id] = citation;
    return citation;
  });
}

function claimCitation(claimId: string, basis: AnswerBasisResult): AnswerCitationV3 | null {
  const claim = basis.citationMap.claims[claimId] ?? findClaim(claimId, basis);

  if (!claim) {
    return {
      citation_id: `claim:${claimId}`,
      kind: "claim",
      id: claimId,
      claim_id: claimId,
      label: `claim ${claimId}`
    };
  }

  return {
    citation_id: `claim:${claimId}`,
    kind: "claim",
    id: claimId,
    claim_id: claimId,
    page_path: claim.page_path,
    path: claim.page_path,
    label: `claim ${claimId}: ${claim.statement}`
  };
}

function eventCitation(eventId: string, basis: AnswerBasisResult): AnswerCitationV3 {
  const event = basis.citationMap.events[eventId] ?? basis.evidenceEvents.find((item) => item.id === eventId);

  return {
    citation_id: `event:${eventId}`,
    kind: "event",
    id: eventId,
    event_id: eventId,
    path: event?.path,
    label: event?.path ? `Event ${eventId} (${event.path})` : `Event ${eventId}`
  };
}

function pageCitation(pagePath: string, basis: AnswerBasisResult): AnswerCitationV3 {
  const page = basis.citationMap.pages[pagePath] ?? basis.matchedPages.find((item) => item.path === pagePath);

  return {
    citation_id: `page:${pagePath}`,
    kind: "page",
    id: pagePath,
    page_path: pagePath,
    path: pagePath,
    label: page?.name ? `${page.name} (${pagePath})` : pagePath
  };
}

function findClaim(claimId: string, basis: AnswerBasisResult): PackedClaim | undefined {
  return [...basis.supportingClaims, ...basis.uncertainClaims].find((claim) => claim.claim_id === claimId);
}

function dedupeCitations(citations: AnswerCitationV3[]): AnswerCitationV3[] {
  const seen = new Set<string>();
  const deduped: AnswerCitationV3[] = [];

  for (const citation of citations) {
    if (seen.has(citation.citation_id)) {
      continue;
    }

    seen.add(citation.citation_id);
    deduped.push(citation);
  }

  return deduped.sort((left, right) => left.citation_id.localeCompare(right.citation_id));
}

function answerKind(answer: CitedDirectAnswer, intent: RetrievalQueryIntent): string {
  const statement = answer.statement.toLowerCase();

  if (intent.intents.includes("manager_reporting") || /manager|reports to|reporting/.test(statement)) {
    return "manager_reporting_fact";
  }

  if (intent.intents.includes("role_ownership") || /role|owner|owns|title|cto|dba/.test(statement)) {
    return "role_or_ownership_fact";
  }

  if (intent.intents.includes("source_evidence")) {
    return "source_evidence_fact";
  }

  return "active_claim_fact";
}

function confidenceLabel(
  answer: CitedDirectAnswer,
  eventCount: number
): CitedDirectAnswerV3["confidence_label"] {
  if (eventCount === 0) {
    return "source_missing";
  }

  if (answer.scope_state === "unknown") {
    return "scope_uncertain";
  }

  if (answer.scope_state === "partial") {
    return "partial_scope";
  }

  return "source_backed";
}

function inferencePaths(answer: CitedDirectAnswer): string[] {
  return [
    `claim:${answer.claim_id}`,
    `page:${answer.page_path}`,
    ...answer.citations.event_ids.map((eventId) => `event:${eventId}`)
  ];
}

function missingEvidenceForCannotConfirm(item: AnswerCannotConfirm): string[] {
  switch (item.code) {
    case "missing_evidence_events":
      return ["source_event"];
    case "no_active_claims":
      return ["active_claim"];
    case "no_match":
      return ["matching_page", "active_claim", "source_event"];
    default:
      return ["confirmed_memory"];
  }
}

function repairActionsForCannotConfirm(item: AnswerCannotConfirm, repairActions: RepairActionV3[]): string[] {
  const allowed = repairActions.filter((action) => {
    if (item.code === "missing_evidence_events") {
      return action.action === "run_health_check" || action.action === "capture_note";
    }

    if (item.code === "no_match" || item.code === "no_active_claims") {
      return action.action === "capture_note" || action.action === "log_friction";
    }

    return action.action === "log_friction";
  });

  return allowed.map((action) => action.action_id);
}

function repairActionId(action: RetrievalManualAction, index: number): string {
  const raw = `${action.action}:${action.target ?? action.label}:${index}`;
  const safe = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 72);
  return `repair_${safe || index + 1}`;
}
