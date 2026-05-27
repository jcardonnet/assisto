import { listMarkdownFiles, readMarkdownPage } from "../fs";
import {
  parseClaimBlockRecords,
  parseMarkdownFile,
  type Frontmatter,
  type FrontmatterValue,
  type ParsedClaimBlockRecord
} from "../markdown";
import { loadVaultIndex, type VaultIndex } from "../vault";

export type SessionBriefKind = "today" | "person" | "context" | "review" | "followups";
export type SessionBriefTargetKind = Extract<SessionBriefKind, "person" | "context">;

export interface BuildSessionBriefOptions {
  kind: SessionBriefKind;
  target?: string;
  now?: string;
}

export interface SessionBriefTarget {
  id?: string;
  path: string;
  type?: string;
  name: string;
  aliases: string[];
}

export interface SessionBriefClaim {
  page_path: string;
  page_id?: string;
  claim_id: string;
  statement: string;
  claim_kind: string;
  claim_state: string;
  scope: string | null;
  scope_state: string;
  evidence: string[];
  evidence_strength?: string;
  uncertainty_markers: string[];
}

export interface SessionBriefFollowUp {
  id: string;
  path: string;
  followup_state: string;
  review_state: string;
  owner?: string;
  due_at?: string;
  source_events: string[];
  related: string[];
}

export interface SessionBriefReviewItem {
  id: string;
  path: string;
  review_state: string;
  review_reason?: string;
  source_events: string[];
  affected_files: string[];
  staged_claim_ids: string[];
}

export interface SessionBriefEvidenceEvent {
  id: string;
  path: string;
  recorded_at?: string;
  observed_at?: string;
}

export interface SessionBriefResult {
  kind: SessionBriefKind;
  generated_at: string;
  title: string;
  target?: SessionBriefTarget;
  activeClaims: SessionBriefClaim[];
  uncertainClaims: SessionBriefClaim[];
  openFollowUps: SessionBriefFollowUp[];
  reviewItems: SessionBriefReviewItem[];
  evidenceEvents: SessionBriefEvidenceEvent[];
  warnings: string[];
  contextPack: string;
}

interface LoadedBriefPage {
  path: string;
  frontmatter: Frontmatter;
  body: string;
  claims: ParsedClaimBlockRecord[];
}

export async function buildSessionBrief(
  root: string,
  options: BuildSessionBriefOptions
): Promise<SessionBriefResult> {
  const now = options.now ?? new Date().toISOString();
  const vaultIndex = await loadVaultIndexOrEmpty(root);
  const pages = await loadBriefPages(root);
  const events = pages.filter((page) => stringValue(page.frontmatter.type) === "event");
  const target = await resolveTarget(root, vaultIndex, options);
  const selectedPages = selectBriefPages(options.kind, pages, events, target, now);
  const activeClaims = dedupeClaims(
    selectedPages.flatMap((page) =>
      page.claims
        .filter((claim) => stringValue(claim.fields.claim_state) === "active")
        .map((claim) => toBriefClaim(page, claim))
    )
  );
  const uncertainClaims = dedupeClaims(
    selectedPages.flatMap((page) =>
      page.claims
        .filter((claim) => isUncertainClaim(page, claim))
        .map((claim) => toBriefClaim(page, claim))
    )
  );
  const openFollowUps = collectOpenFollowUps(pages, options.kind, target, selectedPages);
  const reviewItems = collectReviewItems(pages, options.kind, target, selectedPages);
  const evidenceEventIds = new Set<string>([
    ...activeClaims.flatMap((claim) => claim.evidence),
    ...uncertainClaims.flatMap((claim) => claim.evidence),
    ...openFollowUps.flatMap((followup) => followup.source_events),
    ...reviewItems.flatMap((item) => item.source_events)
  ]);
  const todayEventIds =
    options.kind === "today"
      ? new Set(events.filter((event) => isSameBriefDay(event, now)).map(eventId).filter(isPresentString))
      : null;

  if (todayEventIds) {
    for (const eventId of todayEventIds) {
      evidenceEventIds.add(eventId);
    }
  }

  const evidenceEvents = summarizeEvidenceEvents(events, evidenceEventIds);
  const warnings = [
    "Session brief is a derived view; generated explanations were not saved and no canonical memory files were written."
  ];
  const title = briefTitle(options.kind, target);
  const resultWithoutPack = {
    kind: options.kind,
    generated_at: now,
    title,
    target,
    activeClaims,
    uncertainClaims,
    openFollowUps,
    reviewItems,
    evidenceEvents,
    warnings
  };

  return {
    ...resultWithoutPack,
    contextPack: renderSessionBrief(resultWithoutPack)
  };
}

export async function listSessionBriefTargets(root: string, kind: SessionBriefTargetKind): Promise<SessionBriefTarget[]> {
  const folder = kind === "person" ? "memory/people/" : "memory/contexts/";
  const files = (await listFilesOrEmpty(root, "memory/**/*.md")).filter((file) => file.startsWith(folder));
  const targets: SessionBriefTarget[] = [];

  for (const file of files) {
    try {
      const parsed = parseMarkdownFile(await readMarkdownPage(root, file));
      const type = stringValue(parsed.frontmatter.type);
      const objectState = stringValue(parsed.frontmatter.object_state) ?? "active";

      if (type !== kind || objectState === "archived") {
        continue;
      }

      targets.push({
        id: stringValue(parsed.frontmatter.id),
        path: file,
        type,
        name: pageName(file, parsed.body),
        aliases: stringArrayValue(parsed.frontmatter.aliases).sort((left, right) => left.localeCompare(right))
      });
    } catch {
      // Health checks surface malformed pages; target lookup stays read-only and skips unreadable pages.
    }
  }

  return targets.sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      (left.id ?? "").localeCompare(right.id ?? "") ||
      left.path.localeCompare(right.path)
  );
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

async function loadBriefPages(root: string): Promise<LoadedBriefPage[]> {
  const files = await listFilesOrEmpty(root, "memory/**/*.md");
  const pages: LoadedBriefPage[] = [];

  for (const file of files) {
    try {
      const parsed = parseMarkdownFile(await readMarkdownPage(root, file));
      pages.push({
        path: file,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        claims: parseClaimBlockRecords(parsed.body)
      });
    } catch {
      // Validation and health checks surface malformed pages. Briefs skip unreadable derived input.
    }
  }

  return pages;
}

async function listFilesOrEmpty(root: string, globPattern: string): Promise<string[]> {
  try {
    return await listMarkdownFiles(root, globPattern);
  } catch {
    return [];
  }
}

async function resolveTarget(
  root: string,
  vaultIndex: VaultIndex,
  options: BuildSessionBriefOptions
): Promise<SessionBriefTarget | undefined> {
  if (options.kind !== "person" && options.kind !== "context") {
    return undefined;
  }

  if (!options.target) {
    throw new Error(`wm brief ${options.kind} requires an id or path target.`);
  }

  const targetPath = resolveTargetPath(vaultIndex, options.target);

  if (!targetPath) {
    throw new Error(`Brief target not found: ${options.target}`);
  }

  const parsed = parseMarkdownFile(await readMarkdownPage(root, targetPath));

  return {
    id: stringValue(parsed.frontmatter.id),
    path: targetPath,
    type: stringValue(parsed.frontmatter.type),
    name: pageName(targetPath, parsed.body),
    aliases: stringArrayValue(parsed.frontmatter.aliases).sort((left, right) => left.localeCompare(right))
  };
}

function resolveTargetPath(vaultIndex: VaultIndex, target: string): string | undefined {
  const normalized = normalizePath(target);

  if (normalized.startsWith("memory/") && normalized.endsWith(".md")) {
    return normalized;
  }

  if (normalized.endsWith(".md")) {
    return `memory/${normalized}`;
  }

  return vaultIndex.ids.get(target);
}

function selectBriefPages(
  kind: SessionBriefKind,
  pages: LoadedBriefPage[],
  events: LoadedBriefPage[],
  target: SessionBriefTarget | undefined,
  now: string
): LoadedBriefPage[] {
  if (kind === "review") {
    return pages.filter((page) => page.path.startsWith("memory/review/") && isActiveReviewItem(page));
  }

  if (kind === "followups") {
    return pages.filter((page) => page.path.startsWith("memory/followups/") && isOpenFollowUp(page));
  }

  if (kind === "today") {
    const todayEventIds = new Set(events.filter((event) => isSameBriefDay(event, now)).map(eventId).filter(Boolean));

    return pages.filter((page) => {
      if (stringValue(page.frontmatter.type) === "event") {
        return false;
      }

      return referencedEventIds(page).some((id) => todayEventIds.has(id));
    });
  }

  if (!target) {
    return [];
  }

  if (kind === "person") {
    return pages.filter((page) => page.path === target.path);
  }

  return pages.filter((page) => {
    if (!isCurrentPage(page)) {
      return false;
    }

    return (
      page.path === target.path ||
      stringArrayValue(page.frontmatter.related).includes(target.id ?? "") ||
      page.claims.some((claim) => stringValue(claim.fields.scope) === target.id)
    );
  });
}

function collectOpenFollowUps(
  pages: LoadedBriefPage[],
  kind: SessionBriefKind,
  target: SessionBriefTarget | undefined,
  selectedPages: LoadedBriefPage[]
): SessionBriefFollowUp[] {
  const selectedIds = new Set(selectedPages.map((page) => stringValue(page.frontmatter.id)).filter((id): id is string => Boolean(id)));
  const selectedPaths = new Set(selectedPages.map((page) => stripMemoryPrefix(page.path)));
  const selectedEvents = new Set(selectedPages.flatMap(referencedEventIds));
  const followUps: SessionBriefFollowUp[] = [];

  for (const page of pages) {
    if (!page.path.startsWith("memory/followups/") || !isOpenFollowUp(page)) {
      continue;
    }

    if (kind !== "followups" && kind !== "today" && !isLinkedToBrief(page, target, selectedIds, selectedPaths, selectedEvents)) {
      continue;
    }

    if (kind === "today" && !referencedEventIds(page).some((id) => selectedEvents.has(id))) {
      continue;
    }

    followUps.push({
      id: stringValue(page.frontmatter.id) ?? page.path,
      path: page.path,
      followup_state: stringValue(page.frontmatter.followup_state) ?? "open",
      review_state: stringValue(page.frontmatter.review_state) ?? "none",
      owner: stringValue(page.frontmatter.owner),
      due_at: stringValue(page.frontmatter.due_at),
      source_events: stringArrayValue(page.frontmatter.source_events),
      related: stringArrayValue(page.frontmatter.related)
    });
  }

  return followUps.sort((left, right) => left.path.localeCompare(right.path));
}

function collectReviewItems(
  pages: LoadedBriefPage[],
  kind: SessionBriefKind,
  target: SessionBriefTarget | undefined,
  selectedPages: LoadedBriefPage[]
): SessionBriefReviewItem[] {
  const selectedIds = new Set(selectedPages.map((page) => stringValue(page.frontmatter.id)).filter((id): id is string => Boolean(id)));
  const selectedPaths = new Set(selectedPages.map((page) => stripMemoryPrefix(page.path)));
  const selectedEvents = new Set(selectedPages.flatMap(referencedEventIds));
  const reviewItems: SessionBriefReviewItem[] = [];

  for (const page of pages) {
    if (!page.path.startsWith("memory/review/") || !isActiveReviewItem(page)) {
      continue;
    }

    if (kind !== "review" && kind !== "today" && !isLinkedToBrief(page, target, selectedIds, selectedPaths, selectedEvents)) {
      continue;
    }

    if (kind === "today" && !referencedEventIds(page).some((id) => selectedEvents.has(id))) {
      continue;
    }

    reviewItems.push({
      id: stringValue(page.frontmatter.id) ?? page.path,
      path: page.path,
      review_state: stringValue(page.frontmatter.review_state) ?? "staged",
      review_reason: stringValue(page.frontmatter.review_reason),
      source_events: stringArrayValue(page.frontmatter.source_events),
      affected_files: stringArrayValue(page.frontmatter.affected_files),
      staged_claim_ids: page.claims
        .map((claim) => stringValue(claim.fields.claim_id))
        .filter((claimId): claimId is string => Boolean(claimId))
    });
  }

  return reviewItems.sort((left, right) => left.path.localeCompare(right.path));
}

function isLinkedToBrief(
  page: LoadedBriefPage,
  target: SessionBriefTarget | undefined,
  selectedIds: Set<string>,
  selectedPaths: Set<string>,
  selectedEvents: Set<string>
): boolean {
  const related = stringArrayValue(page.frontmatter.related);
  const affectedFiles = stringArrayValue(page.frontmatter.affected_files).map(stripMemoryPrefix);
  const sourceEvents = stringArrayValue(page.frontmatter.source_events);

  return (
    Boolean(target && related.includes(target.id ?? "")) ||
    Boolean(target && affectedFiles.includes(stripMemoryPrefix(target.path))) ||
    related.some((id) => selectedIds.has(id)) ||
    affectedFiles.some((file) => selectedPaths.has(file)) ||
    sourceEvents.some((id) => selectedEvents.has(id))
  );
}

function toBriefClaim(page: LoadedBriefPage, claim: ParsedClaimBlockRecord): SessionBriefClaim {
  return {
    page_path: page.path,
    page_id: stringValue(page.frontmatter.id),
    claim_id: stringValue(claim.fields.claim_id) ?? "unknown",
    statement: stringValue(claim.fields.statement) ?? "<missing statement>",
    claim_kind: stringValue(claim.fields.claim_kind) ?? "unknown",
    claim_state: stringValue(claim.fields.claim_state) ?? "unknown",
    scope: stringValue(claim.fields.scope) ?? null,
    scope_state: stringValue(claim.fields.scope_state) ?? "unknown",
    evidence: stringArrayValue(claim.fields.evidence),
    evidence_strength: stringValue(claim.fields.evidence_strength),
    uncertainty_markers: claimUncertaintyMarkers(page, claim)
  };
}

function isUncertainClaim(page: LoadedBriefPage, claim: ParsedClaimBlockRecord): boolean {
  return claimUncertaintyMarkers(page, claim).length > 0;
}

function claimUncertaintyMarkers(page: LoadedBriefPage, claim: ParsedClaimBlockRecord): string[] {
  const markers: string[] = [];
  const pageReviewState = stringValue(page.frontmatter.review_state);
  const claimState = stringValue(claim.fields.claim_state);
  const scopeState = stringValue(claim.fields.scope_state);

  if (pageReviewState === "staged" || pageReviewState === "contested") {
    markers.push(`page_review_state:${pageReviewState}`);
  }

  if (claimState && claimState !== "active") {
    markers.push(`claim_state:${claimState}`);
  }

  if (scopeState === "partial" || scopeState === "unknown") {
    markers.push(`scope_state:${scopeState}`);
  }

  return markers;
}

function dedupeClaims(claims: SessionBriefClaim[]): SessionBriefClaim[] {
  const seen = new Set<string>();
  const deduped: SessionBriefClaim[] = [];

  for (const claim of claims) {
    const key = `${claim.page_path}:${claim.claim_id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(claim);
  }

  return deduped.sort((left, right) => left.page_path.localeCompare(right.page_path) || left.claim_id.localeCompare(right.claim_id));
}

function summarizeEvidenceEvents(
  events: LoadedBriefPage[],
  evidenceEventIds: Set<string>
): SessionBriefEvidenceEvent[] {
  return events
    .filter((event) => {
      const id = eventId(event);
      return Boolean(id && evidenceEventIds.has(id));
    })
    .map((event) => ({
      id: eventId(event) ?? event.path,
      path: event.path,
      recorded_at: stringValue(event.frontmatter.recorded_at),
      observed_at: stringValue(event.frontmatter.observed_at)
    }))
    .sort((left, right) => (right.recorded_at ?? "").localeCompare(left.recorded_at ?? "") || left.path.localeCompare(right.path));
}

function renderSessionBrief(result: Omit<SessionBriefResult, "contextPack">): string {
  const lines = [
    `# Session brief: ${result.title}`,
    "",
    "## Policy",
    "",
    "- Derived from canonical markdown memory.",
    "- GPT was not called.",
    "- Generated explanations were not saved.",
    "- No canonical memory files were written.",
    "",
    "## Active claims",
    ""
  ];

  if (result.activeClaims.length === 0) {
    lines.push("- None.", "");
  } else {
    for (const claim of result.activeClaims) {
      lines.push(
        `- ${claim.statement} (claim_id: ${claim.claim_id}; page: ${claim.page_path}; scope: ${claim.scope ?? "null"}; scope_state: ${claim.scope_state}; evidence: ${claim.evidence.join(", ") || "none"})`
      );
    }

    lines.push("");
  }

  lines.push("## Uncertainty and review", "");

  if (result.uncertainClaims.length === 0 && result.reviewItems.length === 0) {
    lines.push("- None.", "");
  } else {
    for (const claim of result.uncertainClaims) {
      lines.push(
        `- ${claim.statement} (claim_id: ${claim.claim_id}; page: ${claim.page_path}; markers: ${claim.uncertainty_markers.join(", ") || "none"}; evidence: ${claim.evidence.join(", ") || "none"})`
      );
    }

    for (const item of result.reviewItems) {
      lines.push(
        `- ${item.id} (${item.review_reason ?? "review"}; state: ${item.review_state}; affected: ${item.affected_files.join(", ") || "none"}; source_events: ${item.source_events.join(", ") || "none"})`
      );
    }

    lines.push("");
  }

  lines.push("## Open follow-ups", "");

  if (result.openFollowUps.length === 0) {
    lines.push("- None.", "");
  } else {
    for (const followup of result.openFollowUps) {
      lines.push(
        `- ${followup.id} (${followup.followup_state}; owner: ${followup.owner ?? "unknown"}; due: ${followup.due_at ?? "none"}; source_events: ${followup.source_events.join(", ") || "none"})`
      );
    }

    lines.push("");
  }

  lines.push("## Source Events", "");

  if (result.evidenceEvents.length === 0) {
    lines.push("- None.", "");
  } else {
    for (const event of result.evidenceEvents) {
      lines.push(`- ${event.id} (${event.path}; recorded_at: ${event.recorded_at ?? "unknown"}; observed_at: ${event.observed_at ?? "unknown"})`);
    }

    lines.push("");
  }

  lines.push("## Warnings", "");
  for (const warning of result.warnings) {
    lines.push(`- ${warning}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function briefTitle(kind: SessionBriefKind, target: SessionBriefTarget | undefined): string {
  if (target) {
    return target.name;
  }

  if (kind === "today") {
    return "Today";
  }

  if (kind === "followups") {
    return "Follow-ups";
  }

  if (kind === "review") {
    return "Review risk";
  }

  return kind;
}

function referencedEventIds(page: LoadedBriefPage): string[] {
  const ids = new Set<string>(stringArrayValue(page.frontmatter.source_events));

  for (const claim of page.claims) {
    for (const eventId of stringArrayValue(claim.fields.evidence)) {
      ids.add(eventId);
    }
  }

  return [...ids];
}

function isOpenFollowUp(page: LoadedBriefPage): boolean {
  if (stringValue(page.frontmatter.type) !== "followup") {
    return false;
  }

  const objectState = stringValue(page.frontmatter.object_state) ?? "active";
  const followupState = stringValue(page.frontmatter.followup_state) ?? "open";

  return objectState === "active" && followupState !== "closed" && followupState !== "rejected";
}

function isActiveReviewItem(page: LoadedBriefPage): boolean {
  if (stringValue(page.frontmatter.type) !== "review_item") {
    return false;
  }

  const objectState = stringValue(page.frontmatter.object_state) ?? "active";
  const reviewState = stringValue(page.frontmatter.review_state) ?? "staged";

  return objectState === "active" && (reviewState === "staged" || reviewState === "contested");
}

function isCurrentPage(page: LoadedBriefPage): boolean {
  const type = stringValue(page.frontmatter.type);
  return type === "person" || type === "topic" || type === "context";
}

function isSameBriefDay(event: LoadedBriefPage, now: string): boolean {
  const nowDate = datePart(now);
  const observed = stringValue(event.frontmatter.observed_at);
  const recorded = stringValue(event.frontmatter.recorded_at);

  return Boolean(nowDate && (datePart(observed) === nowDate || datePart(recorded) === nowDate));
}

function datePart(value: string | undefined): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value ?? "");
  return match?.[1];
}

function eventId(page: LoadedBriefPage): string | undefined {
  return stringValue(page.frontmatter.id);
}

function pageName(path: string, body: string): string {
  const heading = /^#\s+(.+?)\s*$/m.exec(body)?.[1]?.trim();

  if (heading) {
    return heading;
  }

  const filename = path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
  return filename
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function stripMemoryPrefix(path: string): string {
  return normalizePath(path).replace(/^memory\//, "");
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isPresentString(value: string | undefined): value is string {
  return Boolean(value);
}
