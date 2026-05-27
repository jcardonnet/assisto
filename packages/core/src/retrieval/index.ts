import { listMarkdownFiles, readMarkdownPage } from "../fs";
import {
  parseClaimBlockRecords,
  parseMarkdownFile,
  parseWikilinks,
  type Frontmatter,
  type FrontmatterValue,
  type ParsedClaimBlockRecord
} from "../markdown";
import { loadVaultIndex, type VaultIndex, type VaultIndexEntry } from "../vault";

export type RetrievalTargetKind = "person" | "topic" | "context";

export interface RetrievalTarget {
  kind: RetrievalTargetKind;
  path: string;
  id?: string;
  name: string;
  matched_terms: string[];
  score: number;
  why_included?: string;
}

export interface LoadedRetrievalPage {
  path: string;
  content: string;
  frontmatter: Frontmatter;
  body: string;
  claims: ParsedClaimBlockRecord[];
  uncertainty_markers: string[];
}

export interface LoadEventsOptions {
  query?: string;
  limit?: number;
}

export interface ContextPackResult {
  query: string;
  queryIntent: RetrievalQueryIntent;
  plannedLookups: RetrievalPlannedLookup[];
  targets: RetrievalTarget[];
  pages: LoadedRetrievalPage[];
  reviewItems: LoadedRetrievalPage[];
  events: LoadedRetrievalPage[];
  contextPack: string;
  matchedPages: PackedPageSummary[];
  answerCandidates: PackedAnswerCandidate[];
  supportingClaims: PackedClaim[];
  activeClaims: PackedClaim[];
  uncertainClaims: PackedClaim[];
  linkedItems: PackedLinkedItem[];
  linkedReviewItems: PackedLinkedItem[];
  linkedFollowUps: PackedLinkedItem[];
  evidenceEvents: PackedEvidenceEvent[];
  missingInformation: PackedMissingInformation[];
  suggestedNextQuestions: string[];
  manualActions: RetrievalManualAction[];
  warnings: string[];
}

export type AnswerBasisResult = ContextPackResult;

export interface AnswerDraftProviderInput {
  question: string;
  basis: AnswerBasisResult;
  now: string;
}

export interface AnswerDraftProviderOutput {
  answer_text?: string;
  citations?: string[];
  cannot_confirm?: string[];
  warnings?: string[];
  provider_model?: string;
}

export interface AnswerDraftProvider {
  readonly name: string;
  draft(input: AnswerDraftProviderInput): Promise<AnswerDraftProviderOutput>;
}

export interface AnswerDraftOptions {
  now?: string;
  provider?: AnswerDraftProvider;
}

export interface AnswerDraftResult {
  question: string;
  generated_at: string;
  provider_name: string;
  provider_model?: string;
  answer_text: string;
  citations: string[];
  cannot_confirm: string[];
  warnings: string[];
  basis: AnswerBasisResult;
}

export interface OpenAiAnswerDraftProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetch?: AnswerDraftFetch;
}

export type AnswerDraftFetch = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  }
) => Promise<AnswerDraftFetchResponse>;

export interface AnswerDraftFetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export type RetrievalQueryIntentKind =
  | "person_facts"
  | "manager_reporting"
  | "role_ownership"
  | "project_context"
  | "source_evidence"
  | "follow_up"
  | "review_risk"
  | "recent_changes"
  | "general"
  | "no_match";

export interface RetrievalQueryIntent {
  primary: RetrievalQueryIntentKind;
  intents: RetrievalQueryIntentKind[];
  matched_terms: string[];
  summary: string;
}

export interface RetrievalPlannedLookup {
  kind:
    | "named_targets"
    | "relation_claims"
    | "source_events"
    | "linked_review_items"
    | "linked_followups"
    | "recent_events"
    | "no_match_probe";
  reason: string;
  terms: string[];
  result_state: "found" | "not_found" | "skipped";
  result_count: number;
  target_paths: string[];
}

export interface RetrievalManualAction {
  action: "capture_note" | "inspect_entity" | "review_item" | "open_followups" | "open_today" | "run_health_check";
  label: string;
  reason: string;
  target?: string;
}

export interface PackedPageSummary {
  path: string;
  id?: string;
  type?: string;
  name: string;
  matchedTerms: string[];
  score: number;
  whyIncluded: string;
  uncertaintyMarkers: string[];
}

export interface PackedClaim {
  page_path: string;
  claim_id: string;
  statement: string;
  claim_kind: string;
  claim_state: string;
  scope: string | null;
  scope_state: string;
  evidence: string[];
  evidence_strength?: string;
  why_included: string;
  uncertainty_markers: string[];
}

export interface PackedAnswerCandidate {
  claim_id: string;
  page_path: string;
  statement: string;
  claim_kind: string;
  scope: string | null;
  scope_state: string;
  evidence: string[];
  basis: "active_claim";
  why_included: string;
}

export interface PackedLinkedItem {
  path: string;
  id?: string;
  type?: string;
  review_state?: string;
  review_reason?: string;
  followup_state?: string;
  source_events: string[];
  affected_files: string[];
  staged_claim_ids: string[];
  why_included: string;
  uncertainty_markers: string[];
}

export interface PackedEvidenceEvent {
  path: string;
  id?: string;
  recorded_at?: string;
  observed_at?: string;
  why_included: string;
}

export interface PackedMissingInformation {
  code: "no_match" | "no_active_claims" | "missing_evidence_events";
  message: string;
}

const stopWords = new Set([
  "about",
  "after",
  "before",
  "between",
  "difference",
  "explain",
  "from",
  "how",
  "is",
  "my",
  "should",
  "the",
  "this",
  "that",
  "to",
  "what",
  "when",
  "where",
  "who",
  "whom",
  "with"
]);

const temporalTerms = new Set(["today", "yesterday", "recent", "recently", "latest", "current", "when"]);
const recentChangeTerms = new Set(["change", "changed", "changes", "recent", "recently", "latest", "today", "history"]);
const highImpactTerms = new Set([
  "role",
  "owner",
  "decision",
  "deadline",
  "commitment",
  "manager",
  "dba",
  "reporting",
  "reports"
]);
const evidenceTerms = new Set(["event", "events", "evidence", "source", "sources", "support", "supports", "cites"]);
const followUpLookupTerms = new Set(["followup", "followups", "follow-up", "follow-ups", "open"]);
const reviewRiskLookupTerms = new Set(["review", "reviews", "reviewed", "risk", "risks", "staged", "contested", "uncertain"]);
const reviewLookupTerms = new Set([...followUpLookupTerms, ...reviewRiskLookupTerms]);
const projectContextTerms = new Set(["project", "context", "system", "service", "team", "client", "environment", "status"]);
const relationIntentTerms = new Set([
  "manager",
  "manages",
  "report",
  "reports",
  "reporting",
  "owner",
  "owns",
  "owned",
  "role",
  "title",
  "cto",
  "dba"
]);

export async function retrieveContextForAnswer(root: string, query: string): Promise<ContextPackResult> {
  const vaultIndex = await loadVaultIndexOrEmpty(root);
  const targets = dedupeTargets([
    ...identifyNamedTargets(query, vaultIndex),
    ...(await identifyRelationTargets(root, query, vaultIndex))
  ]).sort(sortTargets);
  const queryIntent = planRetrievalQuery(query, targets);
  const pages = await loadExactPages(root, targets);
  const reviewItems = await loadLinkedReviewAndFollowupItems(root, pages, { query });
  const events = await loadEventsForIntent(root, pages, queryIntent, { query });
  const matchedPages = summarizeMatchedPages(pages, targets);
  const activeClaims = collectPackedClaims(pages, "active");
  const uncertainClaims = collectPackedClaims(pages, "uncertain");
  const linkedItems = summarizeLinkedItems(reviewItems, query);
  const linkedReviewItems = linkedItems.filter((item) => item.type === "review_item");
  const linkedFollowUps = linkedItems.filter((item) => item.type === "followup");
  const evidenceEvents = summarizeEvidenceEvents(
    events,
    queryIntent.primary === "recent_changes" && pages.length === 0
      ? "recent Event loaded for recent-changes intent"
      : "cited by retrieved claim evidence"
  );
  const warnings = retrievalWarnings(query, pages, uncertainClaims, events);
  const supportingClaims = activeClaims;
  const answerCandidates = buildAnswerCandidates(supportingClaims);
  const missingInformation = summarizeMissingInformation(query, pages, supportingClaims, events);
  const plannedLookups = buildPlannedLookups(query, queryIntent, targets, pages, reviewItems, events);
  const manualActions = buildManualActions(queryIntent, matchedPages, linkedReviewItems, linkedFollowUps, uncertainClaims, missingInformation, evidenceEvents);
  const suggestedNextQuestions = buildSuggestedNextQuestions(queryIntent, matchedPages, answerCandidates, linkedReviewItems, linkedFollowUps, missingInformation);
  const contextPack = packContextForAnswer(query, pages, reviewItems, events, {
    queryIntent,
    plannedLookups,
    targets,
    matchedPages,
    answerCandidates,
    supportingClaims,
    activeClaims,
    uncertainClaims,
    linkedItems,
    linkedReviewItems,
    linkedFollowUps,
    evidenceEvents,
    missingInformation,
    suggestedNextQuestions,
    manualActions,
    warnings
  });

  return {
    query,
    queryIntent,
    plannedLookups,
    targets,
    pages,
    reviewItems,
    events,
    contextPack,
    matchedPages,
    answerCandidates,
    supportingClaims,
    activeClaims,
    uncertainClaims,
    linkedItems,
    linkedReviewItems,
    linkedFollowUps,
    evidenceEvents,
    missingInformation,
    suggestedNextQuestions,
    manualActions,
    warnings
  };
}

export async function retrieveAnswerBasis(root: string, query: string): Promise<AnswerBasisResult> {
  return retrieveContextForAnswer(root, query);
}

export async function previewAnswerDraft(
  root: string,
  question: string,
  options: AnswerDraftOptions = {}
): Promise<AnswerDraftResult> {
  const basis = await retrieveAnswerBasis(root, question);
  const generatedAt = options.now ?? new Date().toISOString();
  const provider = options.provider ?? createOpenAiAnswerDraftProvider();
  const output = await provider.draft({ question, basis, now: generatedAt });
  const normalized = normalizeAnswerDraftProviderOutput(output);
  const citationNormalization = normalizeDraftCitations(normalized.citations, basis);

  return {
    question,
    generated_at: generatedAt,
    provider_name: provider.name,
    provider_model: normalized.provider_model,
    answer_text: normalized.answer_text,
    citations: citationNormalization.citations,
    cannot_confirm: uniqueStrings([
      ...normalized.cannot_confirm,
      ...basis.missingInformation.map((item) => item.message)
    ]),
    warnings: uniqueStrings([...normalized.warnings, ...citationNormalization.warnings]),
    basis
  };
}

export function createOpenAiAnswerDraftProvider(
  options: OpenAiAnswerDraftProviderOptions = {}
): AnswerDraftProvider {
  return new OpenAiAnswerDraftProvider(options);
}

export class OpenAiAnswerDraftProvider implements AnswerDraftProvider {
  readonly name = "openai";

  constructor(private readonly options: OpenAiAnswerDraftProviderOptions = {}) {}

  async draft(input: AnswerDraftProviderInput): Promise<AnswerDraftProviderOutput> {
    const apiKey = this.options.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    const model = this.options.model ?? process.env.ASSISTO_OPENAI_MODEL ?? "";
    const fetchImpl = this.options.fetch ?? defaultAnswerDraftFetch();

    if (!apiKey.trim()) {
      return {
        answer_text: "",
        citations: [],
        cannot_confirm: [],
        warnings: ["OpenAI answer drafting requires OPENAI_API_KEY."]
      };
    }

    if (!model.trim()) {
      return {
        answer_text: "",
        citations: [],
        cannot_confirm: [],
        warnings: ["OpenAI answer drafting requires ASSISTO_OPENAI_MODEL; no model default is hard-coded."]
      };
    }

    if (!fetchImpl) {
      return {
        answer_text: "",
        citations: [],
        cannot_confirm: [],
        warnings: ["OpenAI answer drafting requires a fetch implementation."]
      };
    }

    const baseUrl = (this.options.baseUrl ?? process.env.ASSISTO_OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(
      /\/+$/,
      ""
    );

    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: openAiAnswerDraftSystemPrompt()
            },
            {
              role: "user",
              content: JSON.stringify(answerDraftPromptInput(input))
            }
          ]
        })
      });

      if (!response.ok) {
        return {
          answer_text: "",
          citations: [],
          cannot_confirm: [],
          warnings: [`OpenAI answer draft request failed: ${response.status} ${truncateText(await response.text(), 240)}`]
        };
      }

      const payload = await response.json();
      const content = openAiDraftMessageContent(payload);

      if (!content) {
        return {
          answer_text: "",
          citations: [],
          cannot_confirm: [],
          warnings: ["OpenAI answer draft response must include choices[0].message.content."]
        };
      }

      let parsed: unknown;

      try {
        parsed = JSON.parse(content);
      } catch {
        return {
          answer_text: "",
          citations: [],
          cannot_confirm: [],
          warnings: ["OpenAI answer draft response content must be valid JSON."]
        };
      }

      return {
        ...normalizeAnswerDraftProviderOutput(parsed),
        provider_model: model
      };
    } catch (error) {
      return {
        answer_text: "",
        citations: [],
        cannot_confirm: [],
        warnings: [error instanceof Error ? error.message : String(error)]
      };
    }
  }
}

function normalizeAnswerDraftProviderOutput(output: unknown): Required<AnswerDraftProviderOutput> {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return {
      answer_text: "",
      citations: [],
      cannot_confirm: [],
      warnings: ["Answer draft provider output must be a JSON object."],
      provider_model: ""
    };
  }

  const record = output as Record<string, unknown>;

  return {
    answer_text: typeof record.answer_text === "string" ? record.answer_text : "",
    citations: stringList(record.citations),
    cannot_confirm: stringList(record.cannot_confirm),
    warnings: stringList(record.warnings),
    provider_model: typeof record.provider_model === "string" ? record.provider_model : ""
  };
}

function normalizeDraftCitations(
  citations: string[],
  basis: AnswerBasisResult
): { citations: string[]; warnings: string[] } {
  const allowed = answerDraftCitationSet(basis);
  const accepted: string[] = [];
  const warnings: string[] = [];

  for (const citation of uniqueStrings(citations)) {
    if (allowed.has(citation)) {
      accepted.push(citation);
    } else {
      warnings.push(`Unsupported draft citation omitted: ${citation}`);
    }
  }

  return {
    citations: accepted,
    warnings
  };
}

function answerDraftCitationSet(basis: AnswerBasisResult): Set<string> {
  const citations = new Set<string>();

  for (const claim of [...basis.answerCandidates, ...basis.supportingClaims, ...basis.uncertainClaims]) {
    citations.add(claim.claim_id);
    citations.add(claim.page_path);

    for (const eventId of claim.evidence) {
      citations.add(eventId);
    }
  }

  for (const event of basis.evidenceEvents) {
    citations.add(event.path);

    if (event.id) {
      citations.add(event.id);
    }
  }

  for (const page of basis.matchedPages) {
    citations.add(page.path);

    if (page.id) {
      citations.add(page.id);
    }
  }

  for (const item of [...basis.linkedReviewItems, ...basis.linkedFollowUps]) {
    citations.add(item.path);

    if (item.id) {
      citations.add(item.id);
    }

    for (const eventId of item.source_events) {
      citations.add(eventId);
    }
  }

  return citations;
}

function answerDraftPromptInput(input: AnswerDraftProviderInput): Record<string, unknown> {
  return {
    question: input.question,
    generated_at: input.now,
    rules: [
      "Use only this deterministic AnswerBasisResult.",
      "If the basis cannot confirm something, put it in cannot_confirm.",
      "Every factual sentence should be supported by citations from allowed_citations.",
      "Do not invent pages, claims, Events, people, projects, dates, or explanations.",
      "Return JSON only."
    ],
    allowed_citations: [...answerDraftCitationSet(input.basis)].sort(),
    answer_candidates: input.basis.answerCandidates,
    supporting_claims: input.basis.supportingClaims,
    uncertain_claims: input.basis.uncertainClaims,
    evidence_events: input.basis.evidenceEvents,
    linked_review_items: input.basis.linkedReviewItems,
    linked_followups: input.basis.linkedFollowUps,
    missing_information: input.basis.missingInformation,
    warnings: input.basis.warnings,
    context_pack: input.basis.contextPack
  };
}

function openAiAnswerDraftSystemPrompt(): string {
  return [
    "You draft disposable work-memory answers from a deterministic retrieval basis.",
    "You must not use outside knowledge or infer facts absent from the basis.",
    "You never write memory and never claim that generated answer text is canonical.",
    "Return JSON with exactly these top-level fields:",
    "{ \"answer_text\": string, \"citations\": string[], \"cannot_confirm\": string[], \"warnings\": string[] }.",
    "Citations must be claim IDs, Event IDs, or page paths present in allowed_citations."
  ].join("\n");
}

function openAiDraftMessageContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const choices = (payload as { choices?: unknown }).choices;

  if (!Array.isArray(choices)) {
    return null;
  }

  const firstChoice = choices[0];

  if (!firstChoice || typeof firstChoice !== "object") {
    return null;
  }

  const message = (firstChoice as { message?: unknown }).message;

  if (!message || typeof message !== "object") {
    return null;
  }

  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

function defaultAnswerDraftFetch(): AnswerDraftFetch | undefined {
  return typeof fetch === "function" ? fetch : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

export function planRetrievalQuery(query: string, targets: RetrievalTarget[] = []): RetrievalQueryIntent {
  const terms = queryTerms(query);
  const intents = new Set<RetrievalQueryIntentKind>();
  const matchedTerms = new Set<string>();

  for (const target of targets) {
    if (target.kind === "person") {
      intents.add("person_facts");
    }

    if (target.kind === "context") {
      intents.add("project_context");
    }
  }

  if (terms.some((term) => evidenceTerms.has(term))) {
    intents.add("source_evidence");
    addMatchingTerms(matchedTerms, terms, evidenceTerms);
  }

  if (relationTermsInQuery(query).some((term) => term === "manager" || term === "report" || term === "reports" || term === "reporting" || term === "manages")) {
    intents.add("manager_reporting");
    addMatchingTerms(matchedTerms, terms, relationIntentTerms);
  }

  if (relationTermsInQuery(query).some((term) => term === "owner" || term === "owns" || term === "owned" || term === "role" || term === "title" || term === "cto" || term === "dba")) {
    intents.add("role_ownership");
    addMatchingTerms(matchedTerms, terms, relationIntentTerms);
  }

  if (terms.some((term) => followUpLookupTerms.has(term))) {
    intents.add("follow_up");
    addMatchingTerms(matchedTerms, terms, followUpLookupTerms);
  }

  if (terms.some((term) => reviewRiskLookupTerms.has(term))) {
    intents.add("review_risk");
    addMatchingTerms(matchedTerms, terms, reviewRiskLookupTerms);
  }

  if (terms.some((term) => recentChangeTerms.has(term))) {
    intents.add("recent_changes");
    addMatchingTerms(matchedTerms, terms, recentChangeTerms);
  }

  if (terms.some((term) => projectContextTerms.has(term)) || targets.some((target) => target.kind === "context")) {
    intents.add("project_context");
    addMatchingTerms(matchedTerms, terms, projectContextTerms);
  }

  if (intents.size === 0) {
    intents.add(targets.length === 0 ? "general" : targets.some((target) => target.kind === "person") ? "person_facts" : "project_context");
  }

  const orderedIntents = orderIntentKinds([...intents]);
  const primary = orderedIntents[0] ?? "general";

  return {
    primary,
    intents: orderedIntents,
    matched_terms: [...matchedTerms].sort(),
    summary: intentSummary(primary, orderedIntents)
  };
}

function addMatchingTerms(target: Set<string>, terms: string[], lookup: Set<string>): void {
  for (const term of terms) {
    if (lookup.has(term)) {
      target.add(term);
    }
  }
}

function orderIntentKinds(intents: RetrievalQueryIntentKind[]): RetrievalQueryIntentKind[] {
  const priority: RetrievalQueryIntentKind[] = [
    "source_evidence",
    "review_risk",
    "follow_up",
    "manager_reporting",
    "role_ownership",
    "recent_changes",
    "project_context",
    "person_facts",
    "general",
    "no_match"
  ];
  const set = new Set(intents);

  return priority.filter((intent) => set.has(intent));
}

function intentSummary(primary: RetrievalQueryIntentKind, intents: RetrievalQueryIntentKind[]): string {
  switch (primary) {
    case "source_evidence":
      return "Find claims and cited Event evidence that support a specific memory question.";
    case "review_risk":
      return "Surface staged or contested ReviewItems and related uncertain memory.";
    case "follow_up":
      return "Find open or candidate FollowUps linked to retrieved memory.";
    case "manager_reporting":
      return "Resolve manager and reports-to relationship claims from deterministic claim text.";
    case "role_ownership":
      return "Resolve role, title, owner, or ownership claims from deterministic claim text.";
    case "recent_changes":
      return "Load recent Events and any matched pages without treating generated summaries as memory.";
    case "project_context":
      return "Retrieve Context/project pages and their linked claims or actions.";
    case "person_facts":
      return "Retrieve Person facts and cited evidence.";
    case "no_match":
      return "No deterministic lookup matched the question.";
    default:
      return `General deterministic lookup (${intents.join(", ")}).`;
  }
}

export function identifyNamedTargets(query: string, vaultIndex: VaultIndex): RetrievalTarget[] {
  const terms = queryTerms(query);
  const normalizedQuery = normalizeName(query);
  const targets: RetrievalTarget[] = [];

  for (const entry of vaultIndex.entries) {
    const kind = targetKind(entry);

    if (!kind) {
      continue;
    }

    const names = targetNames(entry);
    const matchedNameTerms = terms.filter((term) => names.some((name) => tokenMatchesName(term, name)));
    const matchedClaimIds = (entry.claimIds ?? []).filter((claimId) => normalizedQuery.includes(normalizeName(claimId)));
    const matchedTerms = [...matchedNameTerms, ...matchedClaimIds];

    if (matchedTerms.length === 0) {
      continue;
    }

    targets.push({
      kind,
      path: normalizePath(entry.path),
      id: entry.id,
      name: displayNameFromPath(entry.path),
      matched_terms: matchedTerms,
      score: matchedNameTerms.length * 10 + matchedClaimIds.length * 25 + (entry.id ? 1 : 0),
      why_included: `name/id matched: ${matchedTerms.join(", ")}`
    });
  }

  return dedupeTargets(targets).sort(sortTargets);
}

async function identifyRelationTargets(root: string, query: string, vaultIndex: VaultIndex): Promise<RetrievalTarget[]> {
  const intentTerms = relationTermsInQuery(query);

  if (intentTerms.length === 0) {
    return [];
  }

  const terms = queryTerms(query);
  const restrictiveTerms = terms.filter((term) => !relationIntentTerms.has(term));
  const targets: RetrievalTarget[] = [];
  const files = await listFilesOrEmpty(root, "memory/**/*.md");
  const indexEntriesByPath = new Map(vaultIndex.entries.map((entry) => [normalizePath(entry.path), entry]));

  for (const file of files) {
    if (!isRetrievalPagePath(file)) {
      continue;
    }

    const page = await loadPage(root, file);
    const matchingClaims = page.claims.filter((claim) =>
      relationClaimMatches(claim, intentTerms, restrictiveTerms)
    );

    if (matchingClaims.length === 0) {
      continue;
    }

    const entry = indexEntriesByPath.get(normalizePath(file));
    const kind = entry ? targetKind(entry) : targetKind({ path: file, aliases: [], wikilinks: [], claimIds: [] });

    if (!kind) {
      continue;
    }

    targets.push({
      kind,
      path: normalizePath(file),
      id: entry?.id ?? stringValue(page.frontmatter.id),
      name: displayNameFromPath(file),
      matched_terms: [...new Set([...intentTerms, ...restrictiveTerms])],
      score: 30 + matchingClaims.length * 5 + restrictiveTerms.length,
      why_included: `relation claim matched: ${matchingClaims
        .map((claim) => stringValue(claim.fields.claim_id))
        .filter(Boolean)
        .join(", ")}`
    });
  }

  return dedupeTargets(targets).sort(sortTargets);
}

export async function loadExactPages(root: string, targets: RetrievalTarget[]): Promise<LoadedRetrievalPage[]> {
  const pages: LoadedRetrievalPage[] = [];

  for (const target of targets) {
    try {
      pages.push(await loadPage(root, target.path));
    } catch {
      // Ignore stale index entries. The index can be regenerated from disk.
    }
  }

  return pages;
}

export async function loadLinkedReviewAndFollowupItems(
  root: string,
  pages: LoadedRetrievalPage[],
  options: { query?: string } = {}
): Promise<LoadedRetrievalPage[]> {
  if (pages.length === 0 && !isReviewLookupQuery(options.query ?? "")) {
    return [];
  }

  const pagePaths = new Set(pages.map((page) => stripMemoryPrefix(page.path)));
  const pageIds = new Set(pages.map((page) => stringValue(page.frontmatter.id)).filter((id): id is string => Boolean(id)));
  const pageEventIds = new Set(pages.flatMap(referencedEventIds));
  const pageClaimIds = new Set(
    pages.flatMap((page) =>
      page.claims
        .map((claim) => stringValue(claim.fields.claim_id))
        .filter((claimId): claimId is string => Boolean(claimId))
    )
  );
  const linked: LoadedRetrievalPage[] = [];
  const linkedPaths = new Set<string>();
  const files = await listFilesOrEmpty(root, "memory/**/*.md");

  for (const file of files) {
    if (!file.startsWith("memory/review/") && !file.startsWith("memory/followups/")) {
      continue;
    }

    const page = await loadPage(root, file);

    if (
      isLinkedPage(page, pagePaths, pageIds, pageEventIds, pageClaimIds) ||
      isDirectReviewLookupMatch(page, options.query ?? "")
    ) {
      if (linkedPaths.has(page.path)) {
        continue;
      }

      linkedPaths.add(page.path);
      linked.push(page);
    }
  }

  return linked.sort((left, right) => left.path.localeCompare(right.path));
}

export async function loadLatestRelevantEvents(
  root: string,
  pages: LoadedRetrievalPage[],
  options: LoadEventsOptions = {}
): Promise<LoadedRetrievalPage[]> {
  if (pages.length === 0 || !shouldLoadEvents(pages, options.query ?? "")) {
    return [];
  }

  const relevantEventIds = new Set(pages.flatMap(referencedEventIds));

  if (relevantEventIds.size === 0) {
    return [];
  }

  const eventFiles = await listFilesOrEmpty(root, "memory/events/**/*.md");
  const events: LoadedRetrievalPage[] = [];

  for (const file of eventFiles) {
    const event = await loadPage(root, file);
    const id = stringValue(event.frontmatter.id);

    if (id && relevantEventIds.has(id)) {
      events.push(event);
    }
  }

  return events
    .sort((left, right) => timestampForSort(right).localeCompare(timestampForSort(left)) || left.path.localeCompare(right.path))
    .slice(0, options.limit ?? 3);
}

async function loadEventsForIntent(
  root: string,
  pages: LoadedRetrievalPage[],
  queryIntent: RetrievalQueryIntent,
  options: LoadEventsOptions = {}
): Promise<LoadedRetrievalPage[]> {
  if (pages.length === 0 && queryIntent.intents.includes("recent_changes")) {
    return loadRecentEvents(root, options.limit ?? 5);
  }

  return loadLatestRelevantEvents(root, pages, options);
}

async function loadRecentEvents(root: string, limit: number): Promise<LoadedRetrievalPage[]> {
  const eventFiles = await listFilesOrEmpty(root, "memory/events/**/*.md");
  const events: LoadedRetrievalPage[] = [];

  for (const file of eventFiles) {
    try {
      events.push(await loadPage(root, file));
    } catch {
      // Health checks surface malformed Events; retrieval skips unreadable derived context.
    }
  }

  return events
    .sort((left, right) => timestampForSort(right).localeCompare(timestampForSort(left)) || left.path.localeCompare(right.path))
    .slice(0, limit);
}

function buildPlannedLookups(
  query: string,
  queryIntent: RetrievalQueryIntent,
  targets: RetrievalTarget[],
  pages: LoadedRetrievalPage[],
  reviewItems: LoadedRetrievalPage[],
  events: LoadedRetrievalPage[]
): RetrievalPlannedLookup[] {
  const terms = queryTerms(query);
  const lookups: RetrievalPlannedLookup[] = [
    lookupResult("named_targets", "Exact names, aliases, ids, and claim ids.", terms, targets.length, targets.map((target) => target.path))
  ];

  if (queryIntent.intents.some((intent) => intent === "manager_reporting" || intent === "role_ownership")) {
    lookups.push(
      lookupResult(
        "relation_claims",
        "Manager/reporting/role/ownership intent matched deterministic claim text and claim ids.",
        relationTermsInQuery(query),
        pages.length,
        pages.map((page) => page.path)
      )
    );
  }

  if (queryIntent.intents.includes("source_evidence")) {
    lookups.push(
      lookupResult(
        "source_events",
        "Evidence/source intent loads cited Event pages only.",
        terms.filter((term) => evidenceTerms.has(term)),
        events.length,
        events.map((event) => event.path)
      )
    );
  }

  if (queryIntent.intents.includes("review_risk")) {
    const reviewItemsOnly = reviewItems.filter((item) => item.frontmatter.type === "review_item");
    lookups.push(
      lookupResult(
        "linked_review_items",
        "Review-risk intent scans linked or directly matched ReviewItems.",
        terms.filter((term) => reviewRiskLookupTerms.has(term)),
        reviewItemsOnly.length,
        reviewItemsOnly.map((item) => item.path)
      )
    );
  }

  if (queryIntent.intents.includes("follow_up")) {
    const followUpsOnly = reviewItems.filter((item) => item.frontmatter.type === "followup");
    lookups.push(
      lookupResult(
        "linked_followups",
        "Follow-up intent scans linked or directly matched FollowUps.",
        terms.filter((term) => followUpLookupTerms.has(term)),
        followUpsOnly.length,
        followUpsOnly.map((item) => item.path)
      )
    );
  }

  if (queryIntent.intents.includes("recent_changes")) {
    lookups.push(
      lookupResult(
        "recent_events",
        "Recent-change intent loads recent cited Events, or recent Events directly when no page matched.",
        terms.filter((term) => recentChangeTerms.has(term)),
        events.length,
        events.map((event) => event.path)
      )
    );
  }

  if (pages.length === 0 && events.length === 0) {
    lookups.push(lookupResult("no_match_probe", "No deterministic page, claim, relation, or recent Event lookup matched.", terms, 0, []));
  }

  return lookups;
}

function lookupResult(
  kind: RetrievalPlannedLookup["kind"],
  reason: string,
  terms: string[],
  count: number,
  targetPaths: string[]
): RetrievalPlannedLookup {
  return {
    kind,
    reason,
    terms: uniqueSorted(terms),
    result_state: count > 0 ? "found" : "not_found",
    result_count: count,
    target_paths: uniqueSorted(targetPaths)
  };
}

function buildManualActions(
  queryIntent: RetrievalQueryIntent,
  matchedPages: PackedPageSummary[],
  linkedReviewItems: PackedLinkedItem[],
  linkedFollowUps: PackedLinkedItem[],
  uncertainClaims: PackedClaim[],
  missingInformation: PackedMissingInformation[],
  evidenceEvents: PackedEvidenceEvent[]
): RetrievalManualAction[] {
  const actions: RetrievalManualAction[] = [];

  if (matchedPages.length > 0) {
    actions.push({
      action: "inspect_entity",
      label: "Inspect matched memory pages",
      reason: "Matched pages may contain adjacent claims, aliases, and related links.",
      target: matchedPages.map((page) => page.path).slice(0, 3).join(", ")
    });
  }

  for (const item of linkedReviewItems.slice(0, 3)) {
    actions.push({
      action: "review_item",
      label: `Review ${item.id ?? item.path}`,
      reason: item.review_reason ?? "linked staged review",
      target: item.path
    });
  }

  for (const item of linkedFollowUps.slice(0, 3)) {
    actions.push({
      action: "open_followups",
      label: `Check follow-up ${item.id ?? item.path}`,
      reason: item.followup_state ?? "linked follow-up",
      target: item.path
    });
  }

  if (uncertainClaims.length > 0 && linkedReviewItems.length === 0) {
    actions.push({
      action: "review_item",
      label: "Review uncertain claims",
      reason: "Retrieved claims include staged, superseded, rejected, partial, unknown-scope, or contested memory.",
      target: uncertainClaims.map((claim) => claim.claim_id).slice(0, 3).join(", ")
    });
  }

  if (queryIntent.intents.includes("recent_changes") && evidenceEvents.length > 0) {
    actions.push({
      action: "open_today",
      label: "Review recent Events in Today",
      reason: "Recent-change intent loaded Event evidence rather than generating a durable summary."
    });
  }

  if (missingInformation.some((item) => item.code === "no_match")) {
    actions.push({
      action: "capture_note",
      label: "Capture a note if this should become memory",
      reason: "No deterministic memory match was found."
    });
  }

  if (missingInformation.some((item) => item.code === "missing_evidence_events")) {
    actions.push({
      action: "run_health_check",
      label: "Run memory health for missing evidence",
      reason: "The question asked for evidence, but no cited Event page was loaded."
    });
  }

  return dedupeManualActions(actions);
}

function dedupeManualActions(actions: RetrievalManualAction[]): RetrievalManualAction[] {
  const seen = new Set<string>();
  const deduped: RetrievalManualAction[] = [];

  for (const action of actions) {
    const key = `${action.action}:${action.target ?? action.label}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(action);
  }

  return deduped;
}

function buildSuggestedNextQuestions(
  queryIntent: RetrievalQueryIntent,
  matchedPages: PackedPageSummary[],
  answerCandidates: PackedAnswerCandidate[],
  linkedReviewItems: PackedLinkedItem[],
  linkedFollowUps: PackedLinkedItem[],
  missingInformation: PackedMissingInformation[]
): string[] {
  const questions: string[] = [];
  const firstClaim = answerCandidates[0]?.claim_id;
  const firstPage = matchedPages[0]?.id ?? matchedPages[0]?.name;

  if (firstClaim) {
    questions.push(`What source Event supports ${firstClaim}?`);
  }

  if (queryIntent.intents.includes("manager_reporting")) {
    questions.push("Who reports to this person?");
  }

  if (queryIntent.intents.includes("role_ownership")) {
    questions.push(firstPage ? `What changed recently about ${firstPage}?` : "What changed recently about this role or ownership?");
  }

  if (queryIntent.intents.includes("project_context")) {
    questions.push(firstPage ? `What open follow-ups are linked to ${firstPage}?` : "What open follow-ups are linked to this context?");
  }

  if (linkedReviewItems.length > 0) {
    questions.push("What needs review before this memory can be applied?");
  }

  if (linkedFollowUps.length > 0) {
    questions.push("Which source Event created this follow-up?");
  }

  if (missingInformation.some((item) => item.code === "no_match")) {
    questions.push("What note should I capture about this?");
  }

  return uniqueSorted(questions).slice(0, 5);
}

export function packContextForAnswer(
  query: string,
  pages: LoadedRetrievalPage[],
  reviewItems: LoadedRetrievalPage[],
  events: LoadedRetrievalPage[],
  options: {
    queryIntent?: RetrievalQueryIntent;
    plannedLookups?: RetrievalPlannedLookup[];
    targets?: RetrievalTarget[];
    matchedPages?: PackedPageSummary[];
    answerCandidates?: PackedAnswerCandidate[];
    supportingClaims?: PackedClaim[];
    activeClaims?: PackedClaim[];
    uncertainClaims?: PackedClaim[];
    linkedItems?: PackedLinkedItem[];
    linkedReviewItems?: PackedLinkedItem[];
    linkedFollowUps?: PackedLinkedItem[];
    evidenceEvents?: PackedEvidenceEvent[];
    missingInformation?: PackedMissingInformation[];
    suggestedNextQuestions?: string[];
    manualActions?: RetrievalManualAction[];
    warnings?: string[];
  } = {}
): string {
  const targetByPath = new Map((options.targets ?? []).map((target) => [target.path, target]));
  const queryIntent = options.queryIntent ?? planRetrievalQuery(query, options.targets ?? []);
  const activeClaims = options.activeClaims ?? collectPackedClaims(pages, "active");
  const uncertainClaims = options.uncertainClaims ?? collectPackedClaims(pages, "uncertain");
  const supportingClaims = options.supportingClaims ?? activeClaims;
  const answerCandidates = options.answerCandidates ?? buildAnswerCandidates(supportingClaims);
  const missingInformation =
    options.missingInformation ?? summarizeMissingInformation(query, pages, supportingClaims, events);
  const evidenceEvents = options.evidenceEvents ?? summarizeEvidenceEvents(events);
  const plannedLookups =
    options.plannedLookups ?? buildPlannedLookups(query, queryIntent, options.targets ?? [], pages, reviewItems, events);
  const manualActions =
    options.manualActions ??
    buildManualActions(
      queryIntent,
      options.matchedPages ?? summarizeMatchedPages(pages, options.targets ?? []),
      options.linkedReviewItems ?? [],
      options.linkedFollowUps ?? [],
      uncertainClaims,
      missingInformation,
      evidenceEvents
    );
  const suggestedNextQuestions =
    options.suggestedNextQuestions ??
    buildSuggestedNextQuestions(
      queryIntent,
      options.matchedPages ?? summarizeMatchedPages(pages, options.targets ?? []),
      answerCandidates,
      options.linkedReviewItems ?? [],
      options.linkedFollowUps ?? [],
      missingInformation
    );
  const lines = [
    "# Context pack",
    "",
    "## Question",
    "",
    query,
    "",
    "## Retrieval policy",
    "",
    "- Lexical exact-page retrieval only.",
    "- Relation intents use deterministic claim text and claim IDs only.",
    "- GPT was not called.",
    "- Generated explanations were not saved.",
    "",
    "## Retrieval plan",
    "",
    `- query_intent: ${queryIntent.primary}`,
    `- intent_summary: ${queryIntent.summary}`,
    `- matched_intent_terms: ${queryIntent.matched_terms.join(", ") || "none"}`,
    "",
    ...renderPlannedLookups(plannedLookups),
    "",
    "## Exact pages",
    ""
  ];

  if (pages.length === 0) {
    lines.push("No named people, topics, or contexts matched.", "");
  } else {
    for (const page of pages) {
      lines.push(...renderPackedPage(page, targetByPath.get(page.path)), "");
    }
  }

  lines.push("## Structured result summary", "");
  lines.push(`- matched_pages: ${options.matchedPages?.length ?? pages.length}`);
  lines.push(`- active_claims: ${activeClaims.length}`);
  lines.push(`- uncertain_or_staged_claims: ${uncertainClaims.length}`);
  lines.push(`- evidence_events: ${evidenceEvents.length}`);
  lines.push(`- manual_actions: ${manualActions.length}`);
  lines.push(`- suggested_next_questions: ${suggestedNextQuestions.length}`);
  lines.push("");

  lines.push("## Answer basis", "");
  lines.push("### What memory can say", "");

  if (answerCandidates.length === 0) {
    lines.push("- No active answer candidates found.", "");
  } else {
    for (const candidate of answerCandidates) {
      lines.push(
        `- ${candidate.statement} (claim_id: ${candidate.claim_id}; claim_kind: ${candidate.claim_kind}; scope: ${candidate.scope ?? "null"}; scope_state: ${candidate.scope_state}; evidence: ${candidate.evidence.join(", ") || "none"})`
      );
    }

    lines.push("");
  }

  lines.push("### What memory cannot confirm", "");

  if (missingInformation.length === 0 && uncertainClaims.length === 0) {
    lines.push("- No missing information detected for loaded active claims.", "");
  } else {
    for (const item of missingInformation) {
      lines.push(`- ${item.message}`);
    }

    for (const claim of uncertainClaims) {
      lines.push(
        `- Uncertain claim ${claim.claim_id}: ${claim.uncertainty_markers.join(", ") || claim.claim_state}`
      );
    }

    lines.push("");
  }

  lines.push("## Linked review and follow-up items", "");

  if (reviewItems.length === 0) {
    lines.push("No linked staged review or follow-up items found.", "");
  } else {
    for (const item of reviewItems) {
      lines.push(...renderLinkedItem(item, query), "");
    }
  }

  lines.push("## Recent relevant events", "");

  if (events.length === 0) {
    lines.push("No Event pages included; exact pages were not sparse, contested, high-impact, or temporal.", "");
  } else {
    for (const event of events) {
      lines.push(...renderEvent(event), "");
    }
  }

  lines.push("## No-match guidance", "");

  if ((options.warnings ?? []).length === 0) {
    lines.push("- None.", "");
  } else {
    for (const warning of options.warnings ?? []) {
      lines.push(`- ${warning}`);
    }

    lines.push("");
  }

  lines.push("## Suggested manual actions", "");

  if (manualActions.length === 0) {
    lines.push("- None.", "");
  } else {
    for (const action of manualActions) {
      lines.push(`- ${action.label} (${action.action}; target: ${action.target ?? "none"}; reason: ${action.reason})`);
    }

    lines.push("");
  }

  lines.push("## Suggested next questions", "");

  if (suggestedNextQuestions.length === 0) {
    lines.push("- None.", "");
  } else {
    for (const question of suggestedNextQuestions) {
      lines.push(`- ${question}`);
    }

    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

async function loadVaultIndexOrEmpty(root: string): Promise<VaultIndex> {
  try {
    return await loadVaultIndex(root);
  } catch {
    return {
      entries: [],
      ids: new Map(),
      paths: new Set(),
      wikilinks: new Map(),
      eventIds: new Set(),
      claimIds: new Map(),
      transactionIds: new Set()
    };
  }
}

async function loadPage(root: string, path: string): Promise<LoadedRetrievalPage> {
  const content = await readMarkdownPage(root, path);
  const parsed = parseMarkdownFile(content);
  const claims = parseClaimBlockRecords(parsed.body);

  return {
    path: normalizePath(path),
    content,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    claims,
    uncertainty_markers: uncertaintyMarkers(parsed.frontmatter, claims)
  };
}

async function listFilesOrEmpty(root: string, globPattern: string): Promise<string[]> {
  try {
    return await listMarkdownFiles(root, globPattern);
  } catch {
    return [];
  }
}

function targetKind(entry: VaultIndexEntry): RetrievalTargetKind | null {
  const type = entry.type?.toLowerCase();

  if (type === "person" || entry.path.startsWith("memory/people/")) {
    return "person";
  }

  if (type === "topic" || entry.path.startsWith("memory/topics/")) {
    return "topic";
  }

  if (type === "context" || entry.path.startsWith("memory/contexts/")) {
    return "context";
  }

  return null;
}

function targetNames(entry: VaultIndexEntry): string[] {
  return [
    entry.id ?? "",
    ...(entry.aliases ?? []),
    displayNameFromPath(entry.path),
    stripMemoryPrefix(entry.path).replace(/\.md$/i, "")
  ]
    .flatMap((name) => [name, normalizeName(name)])
    .filter(Boolean);
}

function tokenMatchesName(term: string, name: string): boolean {
  const normalizedName = normalizeName(name);
  const tokens = normalizedName.split(/\s+/);

  return tokens.includes(term) || normalizedName === term;
}

function dedupeTargets(targets: RetrievalTarget[]): RetrievalTarget[] {
  const byPath = new Map<string, RetrievalTarget>();

  for (const target of targets) {
    const existing = byPath.get(target.path);

    if (!existing || target.score > existing.score) {
      byPath.set(target.path, target);
    }
  }

  return [...byPath.values()];
}

function sortTargets(left: RetrievalTarget, right: RetrievalTarget): number {
  return right.score - left.score || left.path.localeCompare(right.path);
}

function isLinkedPage(
  page: LoadedRetrievalPage,
  pagePaths: Set<string>,
  pageIds: Set<string>,
  pageEventIds: Set<string>,
  pageClaimIds: Set<string>
): boolean {
  const text = `${frontmatterText(page.frontmatter)}\n${page.body}`;
  const links = parseWikilinks(text).map(normalizeResolvablePath);
  const affectedFiles = stringArrayValue(page.frontmatter.affected_files).map(stripMemoryPrefix);
  const related = stringArrayValue(page.frontmatter.related);
  const sourceEvents = stringArrayValue(page.frontmatter.source_events);

  return (
    links.some((link) => pagePaths.has(stripMemoryPrefix(`${link}.md`)) || pageIds.has(link)) ||
    affectedFiles.some((file) => pagePaths.has(stripMemoryPrefix(file))) ||
    related.some((id) => pageIds.has(id)) ||
    sourceEvents.some((eventId) => pageEventIds.has(eventId)) ||
    [...pageClaimIds].some((claimId) => text.includes(claimId))
  );
}

function shouldLoadEvents(pages: LoadedRetrievalPage[], query: string): boolean {
  const terms = queryTerms(query);

  if (terms.some((term) => evidenceTerms.has(term))) {
    return true;
  }

  if (terms.some((term) => temporalTerms.has(term))) {
    return true;
  }

  return pages.some(
    (page) =>
      page.claims.length <= 1 ||
      page.frontmatter.review_state === "contested" ||
      page.frontmatter.review_state === "staged" ||
      page.uncertainty_markers.length > 0 ||
      page.claims.some((claim) => highImpactClaim(claim))
  );
}

function highImpactClaim(claim: ParsedClaimBlockRecord): boolean {
  const statement = stringValue(claim.fields.statement)?.toLowerCase() ?? "";
  const kind = stringValue(claim.fields.claim_kind);

  return kind === "commitment" || [...highImpactTerms].some((term) => statement.includes(term));
}

function relationTermsInQuery(query: string): string[] {
  const normalized = normalizeName(query);
  const terms = queryTerms(query);
  const matches = new Set<string>();

  for (const term of terms) {
    if (relationIntentTerms.has(term)) {
      matches.add(term);
    }
  }

  if (/\breports?\s+to\b/.test(normalized)) {
    matches.add("reports");
  }

  if (/\bmanager\b/.test(normalized)) {
    matches.add("manager");
  }

  if (/\bowner\b|\bowns\b/.test(normalized)) {
    matches.add("owner");
  }

  if (/\brole\b|\btitle\b/.test(normalized)) {
    matches.add("role");
  }

  return [...matches];
}

function relationClaimMatches(
  claim: ParsedClaimBlockRecord,
  intentTerms: string[],
  restrictiveTerms: string[]
): boolean {
  const statement = stringValue(claim.fields.statement) ?? "";
  const claimId = stringValue(claim.fields.claim_id) ?? "";
  const text = normalizeName(`${claimId} ${statement} ${stringValue(claim.fields.scope) ?? ""}`);
  const matchesIntent = intentTerms.some((term) => relationTermMatchesClaim(term, text));

  if (!matchesIntent) {
    return false;
  }

  if (restrictiveTerms.length === 0) {
    return true;
  }

  return restrictiveTerms.some((term) => text.split(/\s+/).includes(term) || text.includes(term));
}

function relationTermMatchesClaim(term: string, normalizedClaimText: string): boolean {
  if (term === "manager" || term === "manages") {
    return /\bmanager\b|\bmanages\b/.test(normalizedClaimText);
  }

  if (term === "report" || term === "reports" || term === "reporting") {
    return /\breports?\s+to\b|\breporting\b/.test(normalizedClaimText);
  }

  if (term === "owner" || term === "owns" || term === "owned") {
    return /\bowner\b|\bowns\b|\bowned\b/.test(normalizedClaimText);
  }

  if (term === "role" || term === "title" || term === "cto" || term === "dba") {
    return /\brole\b|\btitle\b|\bcto\b|\bdba\b|\bengineer\b|\bdirector\b/.test(normalizedClaimText);
  }

  return normalizedClaimText.split(/\s+/).includes(term);
}

function isRetrievalPagePath(path: string): boolean {
  return (
    path.startsWith("memory/people/") ||
    path.startsWith("memory/topics/") ||
    path.startsWith("memory/contexts/")
  );
}

function isReviewLookupQuery(query: string): boolean {
  return queryTerms(query).some((term) => reviewLookupTerms.has(term));
}

function isDirectReviewLookupMatch(page: LoadedRetrievalPage, query: string): boolean {
  const terms = queryTerms(query);

  if (terms.length === 0 || !terms.some((term) => reviewLookupTerms.has(term))) {
    return false;
  }

  const restrictiveTerms = terms.filter((term) => !reviewLookupTerms.has(term));
  const text = normalizeName(`${frontmatterText(page.frontmatter)}\n${page.body}`);

  return restrictiveTerms.length === 0 || restrictiveTerms.some((term) => text.includes(term));
}

function referencedEventIds(page: LoadedRetrievalPage): string[] {
  const ids = new Set<string>();

  for (const eventId of stringArrayValue(page.frontmatter.source_events)) {
    ids.add(eventId);
  }

  for (const claim of page.claims) {
    for (const eventId of stringArrayValue(claim.fields.evidence)) {
      ids.add(eventId);
    }
  }

  return [...ids];
}

function summarizeMatchedPages(pages: LoadedRetrievalPage[], targets: RetrievalTarget[]): PackedPageSummary[] {
  const targetsByPath = new Map(targets.map((target) => [target.path, target]));

  return pages.map((page) => {
    const target = targetsByPath.get(page.path);

    return {
      path: page.path,
      id: stringValue(page.frontmatter.id),
      type: stringValue(page.frontmatter.type),
      name: displayNameFromPath(page.path),
      matchedTerms: target?.matched_terms ?? [],
      score: target?.score ?? 0,
      whyIncluded: target?.why_included ?? "loaded from exact target match",
      uncertaintyMarkers: page.uncertainty_markers
    };
  });
}

function collectPackedClaims(pages: LoadedRetrievalPage[], mode: "active" | "uncertain"): PackedClaim[] {
  const claims: PackedClaim[] = [];

  for (const page of pages) {
    for (const claim of page.claims) {
      const markers = claimUncertaintyMarkers(claim);
      const claimState = stringValue(claim.fields.claim_state) ?? "unknown";

      if (mode === "active" && claimState !== "active") {
        continue;
      }

      if (mode === "uncertain" && claimState === "active" && markers.length === 0) {
        continue;
      }

      claims.push(toPackedClaim(page, claim, markers));
    }
  }

  return claims;
}

function toPackedClaim(
  page: LoadedRetrievalPage,
  claim: ParsedClaimBlockRecord,
  markers = claimUncertaintyMarkers(claim)
): PackedClaim {
  const claimId = stringValue(claim.fields.claim_id) ?? "unknown";

  return {
    page_path: page.path,
    claim_id: claimId,
    statement: stringValue(claim.fields.statement) ?? "<missing statement>",
    claim_kind: stringValue(claim.fields.claim_kind) ?? "unknown",
    claim_state: stringValue(claim.fields.claim_state) ?? "unknown",
    scope: stringValue(claim.fields.scope) ?? null,
    scope_state: stringValue(claim.fields.scope_state) ?? "unknown",
    evidence: stringArrayValue(claim.fields.evidence),
    evidence_strength: stringValue(claim.fields.evidence_strength),
    why_included: `claim on retrieved page ${page.path}`,
    uncertainty_markers: markers
  };
}

function buildAnswerCandidates(supportingClaims: PackedClaim[]): PackedAnswerCandidate[] {
  return supportingClaims.map((claim) => ({
    claim_id: claim.claim_id,
    page_path: claim.page_path,
    statement: claim.statement,
    claim_kind: claim.claim_kind,
    scope: claim.scope,
    scope_state: claim.scope_state,
    evidence: claim.evidence,
    basis: "active_claim",
    why_included: claim.why_included
  }));
}

function summarizeMissingInformation(
  query: string,
  pages: LoadedRetrievalPage[],
  supportingClaims: PackedClaim[],
  events: LoadedRetrievalPage[]
): PackedMissingInformation[] {
  const missing: PackedMissingInformation[] = [];

  if (pages.length === 0) {
    if (events.length > 0) {
      missing.push({
        code: "no_active_claims",
        message: "No current Person, Topic, or Context page matched, but relevant Event evidence was loaded."
      });
    } else {
      missing.push({
        code: "no_match",
        message: "No deterministic memory page, claim ID, or relation claim matched the question."
      });
    }

    return missing;
  }

  if (supportingClaims.length === 0) {
    missing.push({
      code: "no_active_claims",
      message: "Matched pages did not contain active claims that can support an answer."
    });
  }

  if (queryTerms(query).some((term) => evidenceTerms.has(term)) && events.length === 0) {
    missing.push({
      code: "missing_evidence_events",
      message: "The question asks for evidence, but no cited Event page was loaded."
    });
  }

  return missing;
}

function summarizeLinkedItems(items: LoadedRetrievalPage[], query: string): PackedLinkedItem[] {
  return items.map((item) => summarizeLinkedItem(item, query));
}

function summarizeLinkedItem(page: LoadedRetrievalPage, query: string): PackedLinkedItem {
  const directMatch = isDirectReviewLookupMatch(page, query);

  return {
    path: page.path,
    id: stringValue(page.frontmatter.id),
    type: stringValue(page.frontmatter.type),
    review_state: stringValue(page.frontmatter.review_state),
    review_reason: stringValue(page.frontmatter.review_reason),
    followup_state: stringValue(page.frontmatter.followup_state),
    source_events: stringArrayValue(page.frontmatter.source_events),
    affected_files: stringArrayValue(page.frontmatter.affected_files),
    staged_claim_ids: page.claims
      .map((claim) => stringValue(claim.fields.claim_id))
      .filter((claimId): claimId is string => Boolean(claimId)),
    why_included: directMatch ? "review/follow-up query text matched this item" : "linked to retrieved page, Event, or claim",
    uncertainty_markers: page.uncertainty_markers
  };
}

function summarizeEvidenceEvents(
  events: LoadedRetrievalPage[],
  whyIncluded = "cited by retrieved claim evidence"
): PackedEvidenceEvent[] {
  return events.map((event) => ({
    path: event.path,
    id: stringValue(event.frontmatter.id),
    recorded_at: stringValue(event.frontmatter.recorded_at),
    observed_at: stringValue(event.frontmatter.observed_at),
    why_included: whyIncluded
  }));
}

function retrievalWarnings(
  query: string,
  pages: LoadedRetrievalPage[],
  uncertainClaims: PackedClaim[],
  events: LoadedRetrievalPage[]
): string[] {
  const warnings: string[] = [];

  if (pages.length === 0 && events.length === 0) {
    warnings.push(
      "No named people, topics, contexts, claim IDs, or deterministic relation claims matched; answer should say memory has no match."
    );
  }

  if (pages.length === 0 && events.length > 0) {
    warnings.push("No current page matched; recent Event evidence was loaded for manual review.");
  }

  if (uncertainClaims.length > 0) {
    warnings.push("Some retrieved claims are staged, partial, unknown-scope, superseded, rejected, or contested.");
  }

  if (queryTerms(query).some((term) => evidenceTerms.has(term)) && events.length === 0 && pages.length > 0) {
    warnings.push("The query asks for source evidence, but no cited Event page was loaded.");
  }

  return warnings;
}

function renderPlannedLookups(lookups: RetrievalPlannedLookup[]): string[] {
  if (lookups.length === 0) {
    return ["- planned_lookup: none"];
  }

  return lookups.map(
    (lookup) =>
      `- planned_lookup: ${lookup.kind}; result_state: ${lookup.result_state}; result_count: ${lookup.result_count}; terms: ${lookup.terms.join(", ") || "none"}; reason: ${lookup.reason}`
  );
}

function renderPackedPage(page: LoadedRetrievalPage, target?: RetrievalTarget): string[] {
  const activeClaims = page.claims.filter((claim) => claim.fields.claim_state === "active");
  const otherClaims = page.claims.filter((claim) => claim.fields.claim_state !== "active");
  const lines = [
    `### ${page.path}`,
    "",
    `- id: ${stringValue(page.frontmatter.id) ?? "unknown"}`,
    `- type: ${stringValue(page.frontmatter.type) ?? "unknown"}`,
    `- why_included: ${target?.why_included ?? "loaded from exact target match"}`
  ];

  if (page.uncertainty_markers.length > 0) {
    lines.push(`- uncertainty: ${page.uncertainty_markers.join("; ")}`);
  }

  lines.push("", "#### Active claims");

  if (activeClaims.length === 0) {
    lines.push("", "- None.");
  } else {
    lines.push("", ...activeClaims.map(renderClaimLine));
  }

  if (otherClaims.length > 0) {
    lines.push("", "#### Non-active or uncertain claims", "", ...otherClaims.map(renderClaimLine));
  }

  return lines;
}

function renderLinkedItem(page: LoadedRetrievalPage, query: string): string[] {
  const summary = summarizeLinkedItem(page, query);
  const lines = [
    `### ${page.path}`,
    "",
    `- id: ${summary.id ?? "unknown"}`,
    `- type: ${summary.type ?? "unknown"}`,
    `- review_state: ${summary.review_state ?? "unknown"}`,
    `- why_included: ${summary.why_included}`
  ];

  if (summary.review_reason) {
    lines.push(`- review_reason: ${summary.review_reason}`);
  }

  if (summary.followup_state) {
    lines.push(`- followup_state: ${summary.followup_state}`);
  }

  if (summary.source_events.length > 0) {
    lines.push(`- source_events: ${summary.source_events.join(", ")}`);
  }

  if (summary.affected_files.length > 0) {
    lines.push(`- affected_files: ${summary.affected_files.join(", ")}`);
  }

  if (summary.staged_claim_ids.length > 0) {
    lines.push(`- staged_claim_ids: ${summary.staged_claim_ids.join(", ")}`);
  }

  if (summary.uncertainty_markers.length > 0) {
    lines.push(`- uncertainty: ${summary.uncertainty_markers.join("; ")}`);
  }

  return lines;
}

function renderEvent(page: LoadedRetrievalPage): string[] {
  return [
    `### ${page.path}`,
    "",
    `- id: ${stringValue(page.frontmatter.id) ?? "unknown"}`,
    `- recorded_at: ${stringValue(page.frontmatter.recorded_at) ?? "unknown"}`,
    `- observed_at: ${stringValue(page.frontmatter.observed_at) ?? "unknown"}`,
    "- why_included: cited by retrieved claim evidence",
    "",
    firstSectionOrBody(page.body, "Raw text")
  ];
}

function renderClaimLine(claim: ParsedClaimBlockRecord): string {
  const statement = stringValue(claim.fields.statement) ?? "<missing statement>";
  const markers = claimUncertaintyMarkers(claim);
  const suffix = markers.length > 0 ? ` [uncertain: ${markers.join(", ")}]` : "";
  const claimId = stringValue(claim.fields.claim_id) ?? "unknown";
  const claimKind = stringValue(claim.fields.claim_kind) ?? "unknown";
  const claimState = stringValue(claim.fields.claim_state) ?? "unknown";
  const scope = stringValue(claim.fields.scope) ?? "null";
  const scopeState = stringValue(claim.fields.scope_state) ?? "unknown";
  const evidence = stringArrayValue(claim.fields.evidence).join(", ") || "none";

  return `- ${statement} (claim_id: ${claimId}; claim_kind: ${claimKind}; claim_state: ${claimState}; scope: ${scope}; scope_state: ${scopeState}; evidence: ${evidence})${suffix}`;
}

function uncertaintyMarkers(frontmatter: Frontmatter, claims: ParsedClaimBlockRecord[]): string[] {
  const markers = new Set<string>();

  if (frontmatter.review_state === "staged" || frontmatter.review_state === "contested") {
    markers.add(`page review_state is ${frontmatter.review_state}`);
  }

  for (const claim of claims) {
    for (const marker of claimUncertaintyMarkers(claim)) {
      markers.add(marker);
    }
  }

  return [...markers].sort();
}

function claimUncertaintyMarkers(claim: ParsedClaimBlockRecord): string[] {
  const markers: string[] = [];
  const claimState = stringValue(claim.fields.claim_state);
  const scopeState = stringValue(claim.fields.scope_state);

  if (claimState && claimState !== "active") {
    markers.push(`claim_state=${claimState}`);
  }

  if (scopeState === "unknown" || scopeState === "partial") {
    markers.push(`scope_state=${scopeState}`);
  }

  return markers;
}

function timestampForSort(page: LoadedRetrievalPage): string {
  return (
    stringValue(page.frontmatter.recorded_at) ??
    stringValue(page.frontmatter.observed_at) ??
    stringValue(page.frontmatter.created_at) ??
    ""
  );
}

function firstSectionOrBody(body: string, heading: string): string {
  const pattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "im");
  const match = pattern.exec(body);

  if (!match || match.index === undefined) {
    return body.trim().split("\n").slice(0, 6).join("\n");
  }

  const afterHeading = body.slice(match.index + match[0].length);
  const nextHeadingIndex = afterHeading.search(/^##\s+/m);
  const section = nextHeadingIndex === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIndex);

  return section.trim();
}

function queryTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2 && !stopWords.has(term))
    )
  ];
}

function displayNameFromPath(path: string): string {
  const baseName = stripMemoryPrefix(path)
    .replace(/\.md$/i, "")
    .split("/")
    .pop();

  return baseName ?? path;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/^per_/, "")
    .replace(/^top_/, "")
    .replace(/^ctx_/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeResolvablePath(path: string): string {
  return path
    .split("#")[0]!
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "")
    .replace(/^memory\//, "")
    .trim();
}

function stripMemoryPrefix(path: string): string {
  return normalizePath(path).replace(/^memory\//, "");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function frontmatterText(frontmatter: Frontmatter): string {
  return Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${frontmatterValueText(value)}`)
    .join("\n");
}

function frontmatterValueText(value: FrontmatterValue): string {
  if (Array.isArray(value)) {
    return value.map(frontmatterValueText).join("\n");
  }

  return String(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
