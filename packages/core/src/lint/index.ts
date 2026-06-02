import { listMarkdownFiles, readMarkdownPage, writeMarkdownPageAtomic } from "../fs";
import {
  getSection,
  parseClaimBlockRecords,
  parseMarkdownFile,
  parseWikilinks,
  serializeMarkdownFile,
  type Frontmatter,
  type FrontmatterValue,
  type ParsedClaimBlockRecord
} from "../markdown";

export type LintIssueCode =
  | "duplicate_people"
  | "duplicate_topics"
  | "unscoped_claim"
  | "stale_followup"
  | "contradiction"
  | "summary_drift"
  | "broken_link"
  | "orphan_page"
  | "review_backlog_growth"
  | "topic_bloat";

export interface LintIssue {
  code: LintIssueCode;
  message: string;
  severity: "low" | "medium" | "high";
  affected_files: string[];
  source_events: string[];
  details?: string;
}

export interface LintReviewItem {
  id: string;
  path: string;
  issue: LintIssue;
}

export interface LintResult {
  issues: LintIssue[];
  review_items: LintReviewItem[];
}

export interface LintVaultOptions {
  now?: string;
  staleFollowupDays?: number;
  reviewBacklogThreshold?: number;
}

interface LintPage {
  path: string;
  frontmatter: Frontmatter;
  body: string;
  claims: ParsedClaimBlockRecord[];
  wikilinks: string[];
}

interface ClaimRef {
  page: LintPage;
  claim: ParsedClaimBlockRecord;
}

interface ContradictionKey {
  key: string;
  polarity: "positive" | "negative";
}

const defaultNow = "2026-05-21T12:00:00-03:00";

export async function collectLintIssues(root: string, options: LintVaultOptions = {}): Promise<LintIssue[]> {
  const now = options.now ?? defaultNow;
  const pages = await loadLintPages(root);
  return dedupeIssues([
    ...checkDuplicateObjects(pages, "person", "duplicate_people"),
    ...checkDuplicateObjects(pages, "topic", "duplicate_topics"),
    ...checkUnscopedClaims(pages),
    ...checkStaleFollowups(pages, now, options.staleFollowupDays ?? 30),
    ...checkContradictions(pages),
    ...checkSummaryDrift(pages),
    ...checkBrokenLinks(pages),
    ...checkOrphanPages(pages),
    ...checkReviewBacklogGrowth(pages, options.reviewBacklogThreshold ?? 10),
    ...checkTopicBloat(pages)
  ]);
}

export async function lintVault(root: string, options: LintVaultOptions = {}): Promise<LintResult> {
  const now = options.now ?? defaultNow;
  const issues = await collectLintIssues(root, options);
  const reviewItems: LintReviewItem[] = [];

  for (const issue of issues) {
    const reviewItem = toReviewItem(issue);
    await writeMarkdownPageAtomic(root, reviewItem.path, renderReviewItem(reviewItem, now));
    reviewItems.push(reviewItem);
  }

  return {
    issues,
    review_items: reviewItems
  };
}

async function loadLintPages(root: string): Promise<LintPage[]> {
  let files: string[] = [];

  try {
    files = await listMarkdownFiles(root, "memory/**/*.md");
  } catch {
    return [];
  }

  const pages: LintPage[] = [];

  for (const file of files) {
    try {
      const content = await readMarkdownPage(root, file);
      const parsed = parseMarkdownFile(content);
      const frontmatterText = renderFrontmatterForSearch(parsed.frontmatter);

      pages.push({
        path: normalizePath(file),
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        claims: parseClaimBlockRecords(parsed.body),
        wikilinks: parseWikilinks(`${frontmatterText}\n${parsed.body}`)
      });
    } catch {
      // Lint and maintenance must not make derived views brittle when one page is malformed.
    }
  }

  return pages;
}

function checkDuplicateObjects(
  pages: LintPage[],
  type: "person" | "topic",
  code: Extract<LintIssueCode, "duplicate_people" | "duplicate_topics">
): LintIssue[] {
  const candidates = pages.filter((page) => page.frontmatter.type === type);
  const byName = new Map<string, LintPage[]>();

  for (const page of candidates) {
    for (const name of objectNames(page)) {
      const normalized = normalizeName(name);

      if (!normalized) {
        continue;
      }

      const existing = byName.get(normalized) ?? [];
      existing.push(page);
      byName.set(normalized, existing);
    }
  }

  const issues: LintIssue[] = [];
  const seenGroups = new Set<string>();

  for (const [name, group] of byName) {
    const uniquePages = uniqueByPath(group);

    if (uniquePages.length < 2) {
      continue;
    }

    const affectedFiles = uniquePages.map((page) => page.path).sort();
    const groupKey = affectedFiles.join("|");

    if (seenGroups.has(groupKey)) {
      continue;
    }

    seenGroups.add(groupKey);
    issues.push({
      code,
      severity: "high",
      affected_files: affectedFiles,
      source_events: sourceEvents(uniquePages),
      message: `Possible duplicate ${type} pages share name or alias "${name}".`,
      details: "Stage for human review. Do not auto-merge; false splits are safer than false merges."
    });
  }

  return issues;
}

function checkUnscopedClaims(pages: LintPage[]): LintIssue[] {
  const issues: LintIssue[] = [];

  for (const page of pages) {
    if (!isCanonicalClaimPage(page)) {
      continue;
    }

    const unscoped = page.claims.filter((claim) => isUnscopedClaim(claim));

    if (unscoped.length === 0) {
      continue;
    }

    issues.push({
      code: "unscoped_claim",
      severity: "medium",
      affected_files: [page.path],
      source_events: claimEventIds(unscoped),
      message: `${page.path} contains ${unscoped.length} unscoped or unknown-scope claim(s).`,
      details: unscoped.map((claim) => claimLabel(claim)).join("\n")
    });
  }

  return issues;
}

function checkStaleFollowups(pages: LintPage[], now: string, staleDays: number): LintIssue[] {
  const issues: LintIssue[] = [];
  const nowMs = Date.parse(now);

  for (const page of pages) {
    if (page.frontmatter.type !== "followup") {
      continue;
    }

    const state = stringValue(page.frontmatter.followup_state);

    if (state === "closed" || state === "rejected") {
      continue;
    }

    const dueAt = stringValue(page.frontmatter.due_at);
    const updatedAt = stringValue(page.frontmatter.updated_at) ?? stringValue(page.frontmatter.created_at);
    const dueAtMs = dueAt ? Date.parse(dueAt) : Number.NaN;
    const updatedAtMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;
    const staleByDueDate = Number.isFinite(dueAtMs) && dueAtMs < nowMs;
    const staleByAge =
      Number.isFinite(updatedAtMs) && nowMs - updatedAtMs > staleDays * 24 * 60 * 60 * 1000;

    if (!staleByDueDate && !staleByAge) {
      continue;
    }

    issues.push({
      code: "stale_followup",
      severity: "medium",
      affected_files: [page.path],
      source_events: stringArrayValue(page.frontmatter.source_events),
      message: `${page.path} has a stale open follow-up.`,
      details: `followup_state=${state ?? "unknown"} due_at=${dueAt ?? "null"} updated_at=${updatedAt ?? "null"}`
    });
  }

  return issues;
}

function checkContradictions(pages: LintPage[]): LintIssue[] {
  const byKey = new Map<string, ClaimRef[]>();

  for (const page of pages) {
    for (const claim of page.claims) {
      if (claim.fields.claim_state !== "active") {
        continue;
      }

      const key = contradictionKey(claim);

      if (!key) {
        continue;
      }

      const scopedKey = `${stringValue(claim.fields.scope) ?? "null"}::${key.key}`;
      const claims = byKey.get(scopedKey) ?? [];
      claims.push({ page, claim });
      byKey.set(scopedKey, claims);
    }
  }

  const issues: LintIssue[] = [];

  for (const refs of byKey.values()) {
    const polarities = new Set(refs.map((ref) => contradictionKey(ref.claim)?.polarity));

    if (!polarities.has("positive") || !polarities.has("negative")) {
      continue;
    }

    issues.push({
      code: "contradiction",
      severity: "high",
      affected_files: uniqueStrings(refs.map((ref) => ref.page.path)).sort(),
      source_events: claimEventIds(refs.map((ref) => ref.claim)),
      message: "Contradictory active claims exist in the same scope.",
      details: refs.map((ref) => `${ref.page.path}: ${claimLabel(ref.claim)}`).join("\n")
    });
  }

  return issues;
}

function checkSummaryDrift(pages: LintPage[]): LintIssue[] {
  const issues: LintIssue[] = [];

  for (const page of pages) {
    if (!isCanonicalClaimPage(page)) {
      continue;
    }

    const summary = getSection(page.body, "Current summary");

    if (!summary) {
      continue;
    }

    const activeClaimIds = new Set(
      page.claims
        .filter((claim) => claim.fields.claim_state === "active")
        .map((claim) => stringValue(claim.fields.claim_id))
        .filter((claimId): claimId is string => Boolean(claimId))
    );
    const basis = stringArrayValue(page.frontmatter.summary_generated_from);
    const hasMissingBasis = basis.length === 0 || basis.some((claimId) => !activeClaimIds.has(claimId));

    if (!hasMissingBasis) {
      continue;
    }

    issues.push({
      code: "summary_drift",
      severity: "medium",
      affected_files: [page.path],
      source_events: sourceEvents([page]),
      message: `${page.path} summary is not fully backed by active claims.`,
      details: `summary_generated_from=${basis.join(", ") || "[]"}.`
    });
  }

  return issues;
}

function checkBrokenLinks(pages: LintPage[]): LintIssue[] {
  const resolvable = new Set<string>();

  for (const page of pages) {
    const id = stringValue(page.frontmatter.id);
    resolvable.add(normalizeResolvablePath(page.path));

    if (id) {
      resolvable.add(id);
    }
  }

  const issues: LintIssue[] = [];

  for (const page of pages) {
    const brokenLinks = page.wikilinks.filter((link) => !resolvable.has(normalizeResolvablePath(link)));

    if (brokenLinks.length === 0) {
      continue;
    }

    issues.push({
      code: "broken_link",
      severity: "medium",
      affected_files: [page.path],
      source_events: sourceEvents([page]),
      message: `${page.path} contains unresolved wikilink(s).`,
      details: brokenLinks.map((link) => `[[${link}]]`).join("\n")
    });
  }

  return issues;
}

function checkOrphanPages(pages: LintPage[]): LintIssue[] {
  const inbound = new Map<string, number>();

  for (const page of pages) {
    for (const link of page.wikilinks) {
      const normalized = normalizeResolvablePath(link);
      inbound.set(normalized, (inbound.get(normalized) ?? 0) + 1);
    }
  }

  const issues: LintIssue[] = [];

  for (const page of pages) {
    if (!isCanonicalClaimPage(page)) {
      continue;
    }

    const hasSourceEvents = stringArrayValue(page.frontmatter.source_events).length > 0;
    const hasInboundLinks = (inbound.get(normalizeResolvablePath(page.path)) ?? 0) > 0;

    if (hasSourceEvents || hasInboundLinks) {
      continue;
    }

    issues.push({
      code: "orphan_page",
      severity: "low",
      affected_files: [page.path],
      source_events: [],
      message: `${page.path} has no source_events and no inbound wikilinks.`,
      details: "Stage for review; lint does not archive or delete orphan pages."
    });
  }

  return issues;
}

function checkReviewBacklogGrowth(pages: LintPage[], threshold: number): LintIssue[] {
  const stagedReviewItems = pages.filter(
    (page) => page.frontmatter.type === "review_item" && page.frontmatter.review_state === "staged"
  );

  if (stagedReviewItems.length <= threshold) {
    return [];
  }

  return [
    {
      code: "review_backlog_growth",
      severity: "medium",
      affected_files: stagedReviewItems.map((page) => page.path).sort(),
      source_events: sourceEvents(stagedReviewItems),
      message: `Review backlog has ${stagedReviewItems.length} staged item(s), above threshold ${threshold}.`,
      details: "Manual cadence only. No autonomous background linting is scheduled."
    }
  ];
}

function checkTopicBloat(pages: LintPage[]): LintIssue[] {
  const issues: LintIssue[] = [];

  for (const page of pages) {
    if (page.frontmatter.type !== "topic") {
      continue;
    }

    const activeClaimCount = page.claims.filter((claim) => claim.fields.claim_state === "active").length;
    const relatedLinkCount = stringArrayValue(page.frontmatter.related).length + page.wikilinks.length;

    if (activeClaimCount <= 7 && relatedLinkCount <= 10) {
      continue;
    }

    issues.push({
      code: "topic_bloat",
      severity: "medium",
      affected_files: [page.path],
      source_events: sourceEvents([page]),
      message: `${page.path} may be too broad (${activeClaimCount} active claims, ${relatedLinkCount} related link(s)).`,
      details: "Stage for topic split review. Lint must not split or merge topics automatically."
    });
  }

  return issues;
}

function toReviewItem(issue: LintIssue): LintReviewItem {
  const stableKey = `${issue.code}:${issue.affected_files.join("|")}:${issue.message}`;
  const hash = stableHash(stableKey);
  const id = `rev_lint_${issue.code}_${hash}`;

  return {
    id,
    path: `memory/review/lint-${issue.code}-${hash}.md`,
    issue
  };
}

function renderReviewItem(item: LintReviewItem, now: string): string {
  const frontmatter: Frontmatter = {
    id: item.id,
    type: "review_item",
    object_state: "active",
    review_state: "staged",
    review_reason: item.issue.code,
    created_at: now,
    source_events: item.issue.source_events,
    affected_files: item.issue.affected_files
  };
  const body = [
    `# Review: ${item.issue.code}`,
    "",
    "## Issue",
    "",
    item.issue.message,
    "",
    "## Severity",
    "",
    item.issue.severity,
    "",
    "## Affected files",
    "",
    ...item.issue.affected_files.map((file) => `- ${file}`),
    "",
    "## Notes",
    "",
    item.issue.details ?? "Stage for human review.",
    "",
    "## Lint policy",
    "",
    "- No auto-merge.",
    "- No auto-resolve.",
    "- No delete or archive.",
    "- Manual cadence only; no autonomous background linting."
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

function objectNames(page: LintPage): string[] {
  const aliases = stringArrayValue(page.frontmatter.aliases);
  const preferredName = stringValue(page.frontmatter.preferred_name);

  return [displayNameFromPath(page.path), preferredName ?? "", ...aliases].filter(Boolean);
}

function isCanonicalClaimPage(page: LintPage): boolean {
  return page.frontmatter.type === "person" || page.frontmatter.type === "topic" || page.frontmatter.type === "context";
}

function isUnscopedClaim(claim: ParsedClaimBlockRecord): boolean {
  const scope = stringValue(claim.fields.scope);
  const scopeState = stringValue(claim.fields.scope_state);

  return scopeState === "unknown" || !scope || scope === "null";
}

function contradictionKey(claim: ParsedClaimBlockRecord): ContradictionKey | null {
  const statement = normalizeSentence(stringValue(claim.fields.statement) ?? "");

  if (!statement) {
    return null;
  }

  let match = /^(.*?)\s+(?:does not|do not|doesn't|don't)\s+use\s+(.*?)$/.exec(statement);

  if (match) {
    return {
      key: `${match[1]} use ${match[2]}`,
      polarity: "negative"
    };
  }

  match = /^(.*?)\s+use\s+(.*?)$/.exec(statement);

  if (match) {
    return {
      key: `${match[1]} use ${match[2]}`,
      polarity: "positive"
    };
  }

  match = /^(.*?)\s+is\s+not\s+(.*?)$/.exec(statement);

  if (match) {
    return {
      key: `${match[1]} is ${match[2]}`,
      polarity: "negative"
    };
  }

  match = /^(.*?)\s+is\s+(.*?)$/.exec(statement);

  if (match) {
    return {
      key: `${match[1]} is ${match[2]}`,
      polarity: "positive"
    };
  }

  return null;
}

function claimLabel(claim: ParsedClaimBlockRecord): string {
  return `${stringValue(claim.fields.claim_id) ?? "unknown"}: ${stringValue(claim.fields.statement) ?? ""}`;
}

function claimEventIds(claims: ParsedClaimBlockRecord[]): string[] {
  return uniqueStrings(claims.flatMap((claim) => stringArrayValue(claim.fields.evidence))).sort();
}

function sourceEvents(pages: LintPage[]): string[] {
  return uniqueStrings(pages.flatMap((page) => stringArrayValue(page.frontmatter.source_events))).sort();
}

function uniqueByPath(pages: LintPage[]): LintPage[] {
  const byPath = new Map<string, LintPage>();

  for (const page of pages) {
    byPath.set(page.path, page);
  }

  return [...byPath.values()];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function dedupeIssues(issues: LintIssue[]): LintIssue[] {
  const byKey = new Map<string, LintIssue>();

  for (const issue of issues) {
    const key = `${issue.code}:${issue.affected_files.join("|")}:${issue.message}`;
    byKey.set(key, issue);
  }

  return [...byKey.values()].sort(
    (left, right) => left.code.localeCompare(right.code) || left.affected_files.join("|").localeCompare(right.affected_files.join("|"))
  );
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

function normalizeSentence(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.?!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeResolvablePath(path: string): string {
  return normalizePath(path)
    .split("#")[0]!
    .replace(/\.md$/i, "")
    .replace(/^memory\//, "")
    .trim();
}

function displayNameFromPath(path: string): string {
  return normalizePath(path)
    .replace(/\.md$/i, "")
    .split("/")
    .pop() ?? path;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function renderFrontmatterForSearch(frontmatter: Frontmatter): string {
  return Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${frontmatterValueToString(value)}`)
    .join("\n");
}

function frontmatterValueToString(value: FrontmatterValue): string {
  if (Array.isArray(value)) {
    return value.map(frontmatterValueToString).join("\n");
  }

  return String(value);
}

function stableHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}
