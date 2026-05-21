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
  "should",
  "the",
  "this",
  "that",
  "what",
  "when",
  "where",
  "with"
]);

const temporalTerms = new Set(["today", "yesterday", "recent", "recently", "latest", "current", "when"]);
const highImpactTerms = new Set(["role", "owner", "decision", "deadline", "commitment", "manager", "dba"]);

export async function retrieveContextForAnswer(root: string, query: string): Promise<ContextPackResult> {
  const vaultIndex = await loadVaultIndexOrEmpty(root);
  const targets = identifyNamedTargets(query, vaultIndex);
  const pages = await loadExactPages(root, targets);
  const reviewItems = await loadLinkedReviewAndFollowupItems(root, pages);
  const events = await loadLatestRelevantEvents(root, pages, { query });
  const contextPack = packContextForAnswer(query, pages, reviewItems, events);

  return {
    query,
    targets,
    pages,
    reviewItems,
    events,
    contextPack
  };
}

export function identifyNamedTargets(query: string, vaultIndex: VaultIndex): RetrievalTarget[] {
  const terms = queryTerms(query);
  const targets: RetrievalTarget[] = [];

  for (const entry of vaultIndex.entries) {
    const kind = targetKind(entry);

    if (!kind) {
      continue;
    }

    const names = targetNames(entry);
    const matchedTerms = terms.filter((term) => names.some((name) => tokenMatchesName(term, name)));

    if (matchedTerms.length === 0) {
      continue;
    }

    targets.push({
      kind,
      path: normalizePath(entry.path),
      id: entry.id,
      name: displayNameFromPath(entry.path),
      matched_terms: matchedTerms,
      score: matchedTerms.length * 10 + (entry.id ? 1 : 0)
    });
  }

  return dedupeTargets(targets).sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
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
  pages: LoadedRetrievalPage[]
): Promise<LoadedRetrievalPage[]> {
  if (pages.length === 0) {
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
  const files = await listFilesOrEmpty(root, "memory/**/*.md");

  for (const file of files) {
    if (!file.startsWith("memory/review/") && !file.startsWith("memory/followups/")) {
      continue;
    }

    const page = await loadPage(root, file);

    if (isLinkedPage(page, pagePaths, pageIds, pageEventIds, pageClaimIds)) {
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
  events: LoadedRetrievalPage[]
): string {
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
      lines.push(...renderPackedPage(page), "");
    }
  }

  lines.push("## Linked review and follow-up items", "");

  if (reviewItems.length === 0) {
    lines.push("No linked staged review or follow-up items found.", "");
  } else {
    for (const item of reviewItems) {
      lines.push(...renderLinkedItem(item), "");
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

function renderPackedPage(page: LoadedRetrievalPage): string[] {
  const activeClaims = page.claims.filter((claim) => claim.fields.claim_state === "active");
  const otherClaims = page.claims.filter((claim) => claim.fields.claim_state !== "active");
  const lines = [
    `### ${page.path}`,
    "",
    `- id: ${stringValue(page.frontmatter.id) ?? "unknown"}`,
    `- type: ${stringValue(page.frontmatter.type) ?? "unknown"}`
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

function renderLinkedItem(page: LoadedRetrievalPage): string[] {
  const lines = [
    `### ${page.path}`,
    "",
    `- id: ${stringValue(page.frontmatter.id) ?? "unknown"}`,
    `- type: ${stringValue(page.frontmatter.type) ?? "unknown"}`,
    `- review_state: ${stringValue(page.frontmatter.review_state) ?? "unknown"}`
  ];

  if (page.frontmatter.followup_state) {
    lines.push(`- followup_state: ${String(page.frontmatter.followup_state)}`);
  }

  if (page.uncertainty_markers.length > 0) {
    lines.push(`- uncertainty: ${page.uncertainty_markers.join("; ")}`);
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
    "",
    firstSectionOrBody(page.body, "Raw text")
  ];
}

function renderClaimLine(claim: ParsedClaimBlockRecord): string {
  const statement = stringValue(claim.fields.statement) ?? "<missing statement>";
  const markers = claimUncertaintyMarkers(claim);
  const suffix = markers.length > 0 ? ` [uncertain: ${markers.join(", ")}]` : "";

  return `- ${statement}${suffix}`;
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
