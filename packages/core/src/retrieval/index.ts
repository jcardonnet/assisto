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
  targets: RetrievalTarget[];
  pages: LoadedRetrievalPage[];
  reviewItems: LoadedRetrievalPage[];
  events: LoadedRetrievalPage[];
  contextPack: string;
  matchedPages: PackedPageSummary[];
  activeClaims: PackedClaim[];
  uncertainClaims: PackedClaim[];
  linkedItems: PackedLinkedItem[];
  evidenceEvents: PackedEvidenceEvent[];
  warnings: string[];
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
const reviewLookupTerms = new Set(["review", "reviews", "reviewed", "followup", "followups", "follow-up", "follow-ups", "open"]);
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
  const pages = await loadExactPages(root, targets);
  const reviewItems = await loadLinkedReviewAndFollowupItems(root, pages, { query });
  const events = await loadLatestRelevantEvents(root, pages, { query });
  const matchedPages = summarizeMatchedPages(pages, targets);
  const activeClaims = collectPackedClaims(pages, "active");
  const uncertainClaims = collectPackedClaims(pages, "uncertain");
  const linkedItems = summarizeLinkedItems(reviewItems, query);
  const evidenceEvents = summarizeEvidenceEvents(events);
  const warnings = retrievalWarnings(query, pages, uncertainClaims, events);
  const contextPack = packContextForAnswer(query, pages, reviewItems, events, {
    targets,
    matchedPages,
    activeClaims,
    uncertainClaims,
    linkedItems,
    evidenceEvents,
    warnings
  });

  return {
    query,
    targets,
    pages,
    reviewItems,
    events,
    contextPack,
    matchedPages,
    activeClaims,
    uncertainClaims,
    linkedItems,
    evidenceEvents,
    warnings
  };
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

export function packContextForAnswer(
  query: string,
  pages: LoadedRetrievalPage[],
  reviewItems: LoadedRetrievalPage[],
  events: LoadedRetrievalPage[],
  options: {
    targets?: RetrievalTarget[];
    matchedPages?: PackedPageSummary[];
    activeClaims?: PackedClaim[];
    uncertainClaims?: PackedClaim[];
    linkedItems?: PackedLinkedItem[];
    evidenceEvents?: PackedEvidenceEvent[];
    warnings?: string[];
  } = {}
): string {
  const targetByPath = new Map((options.targets ?? []).map((target) => [target.path, target]));
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
  lines.push(`- active_claims: ${options.activeClaims?.length ?? collectPackedClaims(pages, "active").length}`);
  lines.push(
    `- uncertain_or_staged_claims: ${options.uncertainClaims?.length ?? collectPackedClaims(pages, "uncertain").length}`
  );
  lines.push(`- evidence_events: ${options.evidenceEvents?.length ?? events.length}`);
  lines.push("");

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

function summarizeEvidenceEvents(events: LoadedRetrievalPage[]): PackedEvidenceEvent[] {
  return events.map((event) => ({
    path: event.path,
    id: stringValue(event.frontmatter.id),
    recorded_at: stringValue(event.frontmatter.recorded_at),
    observed_at: stringValue(event.frontmatter.observed_at),
    why_included: "cited by retrieved claim evidence"
  }));
}

function retrievalWarnings(
  query: string,
  pages: LoadedRetrievalPage[],
  uncertainClaims: PackedClaim[],
  events: LoadedRetrievalPage[]
): string[] {
  const warnings: string[] = [];

  if (pages.length === 0) {
    warnings.push(
      "No named people, topics, contexts, claim IDs, or deterministic relation claims matched; answer should say memory has no match."
    );
  }

  if (uncertainClaims.length > 0) {
    warnings.push("Some retrieved claims are staged, partial, unknown-scope, superseded, rejected, or contested.");
  }

  if (queryTerms(query).some((term) => evidenceTerms.has(term)) && events.length === 0 && pages.length > 0) {
    warnings.push("The query asks for source evidence, but no cited Event page was loaded.");
  }

  return warnings;
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
