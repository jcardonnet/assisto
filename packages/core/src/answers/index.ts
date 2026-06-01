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
import type { SymbolicProof, SymbolicProofTree, SymbolicQueryResult, SymbolicReasoningResultV2 } from "../symbolic";

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
  proof_paths: SymbolicProof[];
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

export interface AnswerQueryPlanV4 {
  retrieval: {
    intent: RetrievalQueryIntent;
    planned_lookups: AnswerBasisResult["plannedLookups"];
  };
  symbolic: SymbolicReasoningResultV2["query_plan"] | null;
}

export interface AnswerReasoningStepV4 {
  step_id: string;
  kind: "retrieval" | "symbolic" | "citation" | "missing_memory";
  summary: string;
  citation_ids: string[];
}

export interface AnswerSourceExcerptV4 {
  excerpt_id: string;
  event_id?: string;
  path: string;
  observed_at?: string;
  recorded_at?: string;
  excerpt: string;
  cited_claim_ids: string[];
  citation_ids: string[];
  why_included: string;
}

export interface MissingMemoryDiagnosticV4 {
  diagnostic_id: string;
  code: CannotConfirmV3["code"];
  message: string;
  severity: "info" | "warning";
  repair_action_ids: string[];
  suggested_source_import_ids: string[];
}

export interface SuggestedSourceImportV4 {
  source_import_id: string;
  label: string;
  reason: string;
  adapter_kinds: string[];
  trigger_codes: CannotConfirmV3["code"][];
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

export interface CitedAnswerContractV4 extends Omit<CitedAnswerContractV3, "version"> {
  version: "answer-contract-v4";
  queryPlan: AnswerQueryPlanV4;
  reasoningSteps: AnswerReasoningStepV4[];
  proofTree: SymbolicProofTree[];
  sourceExcerpts: AnswerSourceExcerptV4[];
  missingMemoryDiagnostics: MissingMemoryDiagnosticV4[];
  suggestedSourceImports: SuggestedSourceImportV4[];
}

export function buildCitedAnswerContractV3(
  basis: AnswerBasisResult,
  options: { symbolicMatches?: SymbolicQueryResult["matches"] } = {}
): CitedAnswerContractV3 {
  const repairActions = (basis.repairActions ?? basis.manualActions ?? []).map((action, index) => ({
    ...action,
    action_id: repairActionId(action, index)
  }));
  const citationIndex: Record<string, AnswerCitationV3> = {};
  const symbolicMatches = options.symbolicMatches ?? [];
  const directAnswers = (basis.directAnswers ?? []).map((answer) =>
    directAnswerV3(answer, basis, citationIndex, symbolicMatches)
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

export function buildCitedAnswerContractV4(
  basis: AnswerBasisResult,
  options: { symbolicResult?: SymbolicReasoningResultV2 } = {}
): CitedAnswerContractV4 {
  const symbolicResult = options.symbolicResult;
  const v3 = buildCitedAnswerContractV3(basis, { symbolicMatches: symbolicResult?.matches ?? [] });
  const suggestedSourceImports = suggestedSourceImportsV4(v3.cannotConfirm);
  const missingMemoryDiagnostics = missingMemoryDiagnosticsV4(v3.cannotConfirm, suggestedSourceImports);

  return {
    ...v3,
    version: "answer-contract-v4",
    queryPlan: queryPlanV4(basis, symbolicResult),
    reasoningSteps: reasoningStepsV4(v3, symbolicResult),
    proofTree: symbolicResult?.proof_trees ?? [],
    sourceExcerpts: sourceExcerptsV4(basis, v3.citationIndex),
    missingMemoryDiagnostics,
    suggestedSourceImports
  };
}

function queryPlanV4(
  basis: AnswerBasisResult,
  symbolicResult: SymbolicReasoningResultV2 | undefined
): AnswerQueryPlanV4 {
  return {
    retrieval: {
      intent: basis.queryIntent,
      planned_lookups: basis.plannedLookups
    },
    symbolic: symbolicResult?.query_plan ?? null
  };
}

function reasoningStepsV4(
  contract: CitedAnswerContractV3,
  symbolicResult: SymbolicReasoningResultV2 | undefined
): AnswerReasoningStepV4[] {
  const directCitationIds = uniqueStrings(contract.directAnswers.flatMap((answer) => answer.citation_ids));
  const steps: AnswerReasoningStepV4[] = [
    {
      step_id: "retrieval_plan",
      kind: "retrieval",
      summary: `retrieval_intent=${contract.queryIntent.primary}; planned_lookups=${contract.plannedLookups.length}; direct_answers=${contract.directAnswers.length}`,
      citation_ids: directCitationIds
    }
  ];

  if (symbolicResult) {
    steps.push({
      step_id: "symbolic_plan",
      kind: "symbolic",
      summary: symbolicResult.reasoning_steps.join("; "),
      citation_ids: uniqueStrings(symbolicResult.matches.flatMap((match) => [
        ...match.proof.source_claim_ids.map((claimId) => `claim:${claimId}`),
        ...match.proof.source_events.map((eventId) => `event:${eventId}`)
      ]))
    });
  }

  if (contract.cannotConfirm.length > 0) {
    steps.push({
      step_id: "missing_memory",
      kind: "missing_memory",
      summary: `cannot_confirm=${contract.cannotConfirm.map((item) => item.code).join(",")}`,
      citation_ids: uniqueStrings(contract.cannotConfirm.flatMap((item) => item.citation_ids))
    });
  }

  steps.push({
    step_id: "citation_coverage",
    kind: "citation",
    summary: `claims=${Object.keys(contract.citationMap.claims).length}; events=${Object.keys(contract.citationMap.events).length}; pages=${Object.keys(contract.citationMap.pages).length}`,
    citation_ids: Object.keys(contract.citationIndex).sort()
  });

  return steps;
}

function sourceExcerptsV4(
  basis: AnswerBasisResult,
  citationIndex: Record<string, AnswerCitationV3>
): AnswerSourceExcerptV4[] {
  return basis.evidenceEvents.map((event, index) => {
    const eventId = event.id;
    const loadedEvent = eventId ? basis.events.find((page) => String(page.frontmatter.id ?? "") === eventId) : undefined;
    const citedClaimIds = eventId
      ? uniqueStrings([...basis.supportingClaims, ...basis.uncertainClaims]
          .filter((claim) => claim.evidence.includes(eventId))
          .map((claim) => claim.claim_id))
      : [];
    const citationIds = uniqueStrings([
      ...(eventId ? [`event:${eventId}`] : []),
      ...citedClaimIds.map((claimId) => `claim:${claimId}`),
      ...(loadedEvent?.path ? [`page:${loadedEvent.path}`] : [])
    ]).filter((citationId) => citationIndex[citationId] || citationId.startsWith("event:"));

    return {
      excerpt_id: `source_excerpt_${index + 1}`,
      event_id: eventId,
      path: event.path,
      observed_at: event.observed_at,
      recorded_at: event.recorded_at,
      excerpt: rawTextExcerpt(loadedEvent),
      cited_claim_ids: citedClaimIds,
      citation_ids: citationIds,
      why_included: event.why_included
    };
  });
}

function rawTextExcerpt(eventPage: AnswerBasisResult["events"][number] | undefined): string {
  if (!eventPage) {
    return "";
  }

  const rawMatch = eventPage.body.match(/## Raw text\s*\n([\s\S]*?)(?:\n## |$)/);
  const raw = (rawMatch?.[1] ?? eventPage.body).replace(/\s+/g, " ").trim();
  return raw.slice(0, 700);
}

function missingMemoryDiagnosticsV4(
  cannotConfirm: CannotConfirmV3[],
  suggestedSourceImports: SuggestedSourceImportV4[]
): MissingMemoryDiagnosticV4[] {
  return cannotConfirm.map((item, index) => ({
    diagnostic_id: `missing_memory_${index + 1}_${item.code}`,
    code: item.code,
    message: item.message,
    severity: item.code === "no_match" || item.code === "missing_evidence_events" ? "warning" : "info",
    repair_action_ids: item.repair_action_ids,
    suggested_source_import_ids: suggestedSourceImports
      .filter((sourceImport) => sourceImport.trigger_codes.includes(item.code))
      .map((sourceImport) => sourceImport.source_import_id)
  }));
}

function suggestedSourceImportsV4(cannotConfirm: CannotConfirmV3[]): SuggestedSourceImportV4[] {
  const codes = new Set(cannotConfirm.map((item) => item.code));
  const suggestions: SuggestedSourceImportV4[] = [];

  if (codes.has("no_match") || codes.has("no_active_claims")) {
    suggestions.push({
      source_import_id: "source_import_missing_memory",
      label: "Import or capture source material for this topic",
      reason: "Memory cannot currently identify active source-backed claims for the question.",
      adapter_kinds: ["repo_markdown", "github_json", "tracker_csv", "slack_json", "teams_json", "eml", "mbox"],
      trigger_codes: ["no_match", "no_active_claims"]
    });
  }

  if (codes.has("missing_evidence_events")) {
    suggestions.push({
      source_import_id: "source_import_missing_evidence",
      label: "Import the source Event that supports this claim",
      reason: "A claim was found, but memory could not load cited Event evidence.",
      adapter_kinds: ["repo_markdown", "github_json", "tracker_csv", "eml", "mbox"],
      trigger_codes: ["missing_evidence_events"]
    });
  }

  if (codes.has("retrieval_warning")) {
    suggestions.push({
      source_import_id: "source_import_retrieval_warning",
      label: "Capture a clarifying note or import a narrow source export",
      reason: "Retrieval surfaced uncertainty that should be resolved with explicit evidence.",
      adapter_kinds: ["repo_markdown", "slack_json", "teams_json", "github_json"],
      trigger_codes: ["retrieval_warning"]
    });
  }

  return suggestions;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function directAnswerV3(
  answer: CitedDirectAnswer,
  basis: AnswerBasisResult,
  citationIndex: Record<string, AnswerCitationV3>,
  symbolicMatches: SymbolicQueryResult["matches"]
): CitedDirectAnswerV3 {
  const citations = citationsForSet(answer.citations, basis, citationIndex);
  const eventCount = answer.citations.event_ids.length;
  const proofPaths = proofPathsForAnswer(answer, symbolicMatches);

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
    inference_paths: inferencePaths(answer, proofPaths),
    proof_paths: proofPaths
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

function proofPathsForAnswer(
  answer: CitedDirectAnswer,
  symbolicMatches: SymbolicQueryResult["matches"]
): SymbolicProof[] {
  return symbolicMatches
    .filter((match) => match.proof.source_claim_ids.includes(answer.claim_id))
    .map((match) => match.proof)
    .sort((left, right) => left.proof_id.localeCompare(right.proof_id));
}

function inferencePaths(answer: CitedDirectAnswer, proofPaths: SymbolicProof[]): string[] {
  return [
    `claim:${answer.claim_id}`,
    `page:${answer.page_path}`,
    ...answer.citations.event_ids.map((eventId) => `event:${eventId}`),
    ...proofPaths.map((proof) => `proof:${proof.proof_id}`)
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
