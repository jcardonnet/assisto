import {
  parseClaimBlockRecords,
  parseMarkdownFile,
  serializeMarkdownFile,
  type Frontmatter,
  type FrontmatterValue,
  type ParsedClaimBlockRecord
} from "../markdown";
import { listMarkdownFiles, readMarkdownPage, writeMarkdownPageAtomic } from "../fs";
import {
  createTransactionDraft,
  serializeTransactionMarkdown,
  transactionFilePaths,
  validateTransaction,
  type ParsedTransaction,
  type TransactionFileWrite
} from "../transactions";
import { loadVaultIndex, type VaultIndex, type VaultIndexEntry } from "../vault";
import { slugify, stripMemoryPrefix } from "../ingest/candidates";

export type EntityKind = "person" | "topic" | "context";

export interface EntitySummary {
  id?: string;
  path: string;
  type: EntityKind;
  name: string;
  aliases: string[];
  object_state: string;
  review_state: string;
  active_claims: number;
  staged_claims: number;
  superseded_claims: number;
}

export interface EntityClaimSummary {
  page_path: string;
  claim_id: string;
  statement: string;
  claim_kind: string;
  claim_state: string;
  scope: string | null;
  scope_state: string;
  evidence: string[];
}

export interface EntityEvidenceEvent {
  id: string;
  path: string;
  recorded_at?: string;
  observed_at?: string;
  source_label?: string;
}

export interface EntityLinkedReviewItem {
  id: string;
  path: string;
  review_state: string;
  review_reason?: string;
  source_events: string[];
  affected_files: string[];
}

export interface EntityLinkedFollowUp {
  id: string;
  path: string;
  followup_state: string;
  review_state: string;
  source_events: string[];
  related: string[];
}

export interface EntityRelatedPage {
  id?: string;
  path: string;
  type?: string;
  name: string;
}

export interface EntityDetailResult extends EntitySummary {
  source_events: string[];
  related: string[];
  activeClaims: EntityClaimSummary[];
  stagedClaims: EntityClaimSummary[];
  supersededClaims: EntityClaimSummary[];
  evidenceEvents: EntityEvidenceEvent[];
  linkedReviewItems: EntityLinkedReviewItem[];
  linkedFollowUps: EntityLinkedFollowUp[];
  relatedPages: EntityRelatedPage[];
  warnings: string[];
}

export interface EntityStewardshipOptions {
  now?: string;
  note?: string;
}

export interface EntityStewardshipPreview {
  action: "stage_entity_alias" | "stage_entity_context";
  created: boolean;
  transaction_id: string;
  transaction_path: string;
  transaction_state: string;
  entity_id?: string;
  entity_path: string;
  validation: Awaited<ReturnType<typeof validateTransaction>>;
  operations: string[];
  affected_files: string[];
  source_events: string[];
  proposed_file_writes: TransactionFileWrite[];
  transaction: ParsedTransaction;
}

interface LoadedEntityPage {
  path: string;
  frontmatter: Frontmatter;
  body: string;
  claims: ParsedClaimBlockRecord[];
}

const defaultNow = "2026-05-24T12:00:00-03:00";

export async function listEntities(root: string, kind: EntityKind): Promise<EntitySummary[]> {
  const files = await listEntityFiles(root, kind);
  const entities: EntitySummary[] = [];

  for (const file of files) {
    try {
      const page = await loadEntityPage(root, file);

      if (stringValue(page.frontmatter.type) === kind) {
        entities.push(entitySummary(page));
      }
    } catch {
      // Health checks surface malformed pages; explorer stays read-only and skips unreadable pages.
    }
  }

  return entities.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
}

export async function getEntityDetail(root: string, idOrPath: string): Promise<EntityDetailResult> {
  const index = await loadIndexOrEmpty(root);
  const path = resolveEntityPath(index, idOrPath);

  if (!path) {
    throw new Error(`Entity not found: ${idOrPath}`);
  }

  const page = await loadEntityPage(root, path);
  const type = stringValue(page.frontmatter.type);

  if (!isEntityKind(type)) {
    throw new Error(`Entity not found: ${idOrPath}`);
  }

  const summary = entitySummary(page);
  const sourceEvents = stringArrayValue(page.frontmatter.source_events);
  const related = stringArrayValue(page.frontmatter.related);
  const activeClaims = claimsByState(page, "active");
  const stagedClaims = claimsByState(page, "staged");
  const supersededClaims = claimsByState(page, "superseded");
  const reviewItems = await linkedReviewItems(root, page);
  const followUps = await linkedFollowUps(root, page);
  const eventIds = new Set([
    ...sourceEvents,
    ...activeClaims.flatMap((claim) => claim.evidence),
    ...stagedClaims.flatMap((claim) => claim.evidence),
    ...supersededClaims.flatMap((claim) => claim.evidence),
    ...reviewItems.flatMap((item) => item.source_events),
    ...followUps.flatMap((item) => item.source_events)
  ]);

  return {
    ...summary,
    source_events: sourceEvents,
    related,
    activeClaims,
    stagedClaims,
    supersededClaims,
    evidenceEvents: await evidenceEvents(root, eventIds),
    linkedReviewItems: reviewItems,
    linkedFollowUps: followUps,
    relatedPages: relatedPages(index, related),
    warnings: ["Entity detail is derived from markdown; no canonical memory files were written."]
  };
}

export async function createEntityAliasTransaction(
  root: string,
  idOrPath: string,
  alias: string,
  options: EntityStewardshipOptions = {}
): Promise<EntityStewardshipPreview> {
  const now = options.now ?? defaultNow;
  const normalizedAlias = normalizeLabel(alias, "alias");
  const index = await loadIndexOrEmpty(root);
  const page = await loadResolvedEntity(root, index, idOrPath);
  const transactionId = nextTransactionId(now, index);
  const conflict = aliasConflict(index, page, normalizedAlias);
  const writes = conflict
    ? [renderStewardshipReviewWrite(page, transactionId, now, "alias_conflict", `Alias "${normalizedAlias}" already appears on ${conflict.path}.`, options.note)]
    : [renderAliasWrite(page, normalizedAlias, now)];

  return writeStewardshipTransaction(root, {
    action: "stage_entity_alias",
    entityPage: page,
    transactionId,
    now,
    writes,
    operations: conflict
      ? [{ operation: "STAGE_REVIEW" as const, description: `stage alias conflict for ${stripMemoryPrefix(page.path)}` }]
      : [{ operation: "UPSERT_CLAIM" as const, description: `stage alias update for ${stripMemoryPrefix(page.path)}` }],
    intent: conflict
      ? `Stage alias conflict review for ${entitySummary(page).name}.`
      : `Stage alias "${normalizedAlias}" for ${entitySummary(page).name}.`,
    risk: conflict ? "medium" : "low"
  });
}

export async function createEntityContextTransaction(
  root: string,
  idOrPath: string,
  contextIdOrPath: string,
  options: EntityStewardshipOptions = {}
): Promise<EntityStewardshipPreview> {
  const now = options.now ?? defaultNow;
  const contextTarget = normalizeLabel(contextIdOrPath, "context");
  const index = await loadIndexOrEmpty(root);
  const page = await loadResolvedEntity(root, index, idOrPath);
  const transactionId = nextTransactionId(now, index);
  const context = resolveContext(index, contextTarget);
  const contextResolutionMessage =
    context?.path === page.path
      ? `Context "${contextTarget}" resolves to the selected entity itself. Choose a different Context before linking it.`
      : `Context "${contextTarget}" did not resolve exactly. Choose an existing Context before linking it.`;
  const writes =
    context && context.path !== page.path
      ? [renderContextRelationWrite(page, context, now)]
      : [renderStewardshipReviewWrite(page, transactionId, now, "context_resolution", contextResolutionMessage, options.note)];

  return writeStewardshipTransaction(root, {
    action: "stage_entity_context",
    entityPage: page,
    transactionId,
    now,
    writes,
    operations: context && context.path !== page.path
      ? [{ operation: "UPSERT_CLAIM" as const, description: `stage context link for ${stripMemoryPrefix(page.path)}` }]
      : [{ operation: "STAGE_REVIEW" as const, description: `stage context resolution for ${stripMemoryPrefix(page.path)}` }],
    intent: context && context.path !== page.path
      ? `Stage Context link ${context.id ?? context.path} for ${entitySummary(page).name}.`
      : `Stage unresolved Context review for ${entitySummary(page).name}.`,
    risk: context && context.path !== page.path ? "low" : "medium"
  });
}

async function writeStewardshipTransaction(
  root: string,
  input: {
    action: EntityStewardshipPreview["action"];
    entityPage: LoadedEntityPage;
    transactionId: string;
    now: string;
    writes: TransactionFileWrite[];
    operations: Array<{ operation: "UPSERT_CLAIM" | "STAGE_REVIEW"; description: string }>;
    intent: string;
    risk: "low" | "medium";
  }
): Promise<EntityStewardshipPreview> {
  const sourceEvents = stringArrayValue(input.entityPage.frontmatter.source_events);
  const transaction = createTransactionDraft({
    id: input.transactionId,
    created_at: input.now,
    source_events: sourceEvents,
    operations: input.operations,
    affected_files: input.writes.map((write) => stripMemoryPrefix(write.path)),
    risk_level: input.risk,
    requires_review: input.operations.some((operation) => operation.operation === "STAGE_REVIEW"),
    rollback_notes:
      "If this stewardship change is wrong, reject this pending transaction or create a new stewardship transaction with the corrected metadata.",
    intent: input.intent,
    proposed_file_writes: input.writes
  });
  const validation = await validateTransaction(root, transaction);

  if (!validation.passed) {
    throw new Error(
      `Entity stewardship transaction validation failed: ${validation.errors.map((error) => error.code).join(", ")}`
    );
  }

  await writeMarkdownPageAtomic(root, transactionFilePaths.pending(input.transactionId), serializeTransactionMarkdown(transaction));

  return {
    action: input.action,
    created: true,
    transaction_id: input.transactionId,
    transaction_path: transactionFilePaths.pending(input.transactionId),
    transaction_state: transaction.transaction_state,
    entity_id: stringValue(input.entityPage.frontmatter.id),
    entity_path: input.entityPage.path,
    validation,
    operations: transaction.operations.map((operation) => operation.operation),
    affected_files: transaction.affected_files,
    source_events: transaction.source_events,
    proposed_file_writes: transaction.proposed_file_writes,
    transaction
  };
}

function renderAliasWrite(page: LoadedEntityPage, alias: string, now: string): TransactionFileWrite {
  const aliases = uniqueSorted([...stringArrayValue(page.frontmatter.aliases), alias]);
  const frontmatter: Frontmatter = {
    ...page.frontmatter,
    aliases,
    updated_at: now
  };

  return {
    path: page.path,
    content: serializeMarkdownFile(frontmatter, page.body)
  };
}

function renderContextRelationWrite(
  page: LoadedEntityPage,
  context: Pick<VaultIndexEntry, "id" | "path">,
  now: string
): TransactionFileWrite {
  const related = uniqueSorted([...stringArrayValue(page.frontmatter.related), context.id ?? stripMemoryPrefix(context.path)]);
  const frontmatter: Frontmatter = {
    ...page.frontmatter,
    related,
    updated_at: now
  };

  return {
    path: page.path,
    content: serializeMarkdownFile(frontmatter, page.body)
  };
}

function renderStewardshipReviewWrite(
  page: LoadedEntityPage,
  transactionId: string,
  now: string,
  reason: string,
  message: string,
  note: string | undefined
): TransactionFileWrite {
  const id = `rev_entity_${reason}_${stableHash(`${page.path}:${message}`)}`;
  const frontmatter: Frontmatter = {
    id,
    type: "review_item",
    object_state: "active",
    review_state: "staged",
    review_reason: reason,
    created_at: now,
    source_events: stringArrayValue(page.frontmatter.source_events),
    affected_files: [stripMemoryPrefix(page.path)],
    linked_transaction: transactionId
  };
  const body = [
    `# Review: ${reason}`,
    "",
    "## Issue",
    "",
    message,
    "",
    "## Affected entity",
    "",
    `- ${stringValue(page.frontmatter.id) ?? page.path}`,
    "",
    "## Policy",
    "",
    "- Stewardship actions are pending Transactions only.",
    "- Ambiguous aliases and Context links stay staged.",
    "- Entity merge, split, delete, and autonomous identity resolution are not implemented.",
    ...(note?.trim() ? ["", "## Review notes", "", `- ${now}: ${note.trim()}`] : [])
  ].join("\n");

  return {
    path: `memory/review/${id}.md`,
    content: serializeMarkdownFile(frontmatter, body)
  };
}

function entitySummary(page: LoadedEntityPage): EntitySummary {
  const active = page.claims.filter((claim) => claim.fields.claim_state === "active").length;
  const staged = page.claims.filter((claim) => claim.fields.claim_state === "staged").length;
  const superseded = page.claims.filter((claim) => claim.fields.claim_state === "superseded").length;

  return {
    id: stringValue(page.frontmatter.id),
    path: page.path,
    type: stringValue(page.frontmatter.type) as EntityKind,
    name: pageName(page.path, page.body),
    aliases: stringArrayValue(page.frontmatter.aliases),
    object_state: stringValue(page.frontmatter.object_state) ?? "active",
    review_state: stringValue(page.frontmatter.review_state) ?? "none",
    active_claims: active,
    staged_claims: staged,
    superseded_claims: superseded
  };
}

function claimsByState(page: LoadedEntityPage, state: string): EntityClaimSummary[] {
  return page.claims
    .filter((claim) => claim.fields.claim_state === state)
    .map((claim) => ({
      page_path: page.path,
      claim_id: stringValue(claim.fields.claim_id) ?? "unknown",
      statement: stringValue(claim.fields.statement) ?? "",
      claim_kind: stringValue(claim.fields.claim_kind) ?? "fact",
      claim_state: stringValue(claim.fields.claim_state) ?? "active",
      scope: nullableStringValue(claim.fields.scope),
      scope_state: stringValue(claim.fields.scope_state) ?? "unknown",
      evidence: stringArrayValue(claim.fields.evidence)
    }));
}

async function loadResolvedEntity(root: string, index: VaultIndex, idOrPath: string): Promise<LoadedEntityPage> {
  const path = resolveEntityPath(index, idOrPath);

  if (!path) {
    throw new Error(`Entity not found: ${idOrPath}`);
  }

  const page = await loadEntityPage(root, path);

  if (!isEntityKind(stringValue(page.frontmatter.type))) {
    throw new Error(`Entity not found: ${idOrPath}`);
  }

  return page;
}

async function loadEntityPage(root: string, path: string): Promise<LoadedEntityPage> {
  const parsed = parseMarkdownFile(await readMarkdownPage(root, path));

  return {
    path,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    claims: parseClaimBlockRecords(parsed.body)
  };
}

async function listEntityFiles(root: string, kind: EntityKind): Promise<string[]> {
  const folder = kind === "person" ? "people" : `${kind}s`;

  return uniqueSorted([
    ...(await listFilesOrEmpty(root, `memory/${folder}/*.md`)),
    ...(await listFilesOrEmpty(root, `memory/${folder}/**/*.md`))
  ]);
}

function resolveEntityPath(index: VaultIndex, idOrPath: string): string | undefined {
  const normalized = normalizePath(idOrPath);
  const withoutMemory = stripMemoryPrefix(normalized);
  const asMemoryPath = withoutMemory.startsWith("people/") || withoutMemory.startsWith("topics/") || withoutMemory.startsWith("contexts/")
    ? `memory/${withoutMemory}`
    : normalized;

  return index.ids.get(idOrPath) ?? index.ids.get(withoutMemory) ?? (index.paths.has(asMemoryPath) ? asMemoryPath : undefined);
}

function resolveContext(index: VaultIndex, value: string): VaultIndexEntry | undefined {
  const path = resolveEntityPath(index, value);

  if (path) {
    const entry = index.entries.find((candidate) => candidate.path === path && candidate.type === "context");

    if (entry) {
      return entry;
    }
  }

  const normalized = normalizeComparable(value);
  const matches = index.entries.filter(
    (entry) =>
      entry.type === "context" &&
      (normalizeComparable(entry.id ?? "") === normalized ||
        normalizeComparable(pageName(entry.path, "")) === normalized ||
        entry.aliases.some((alias) => normalizeComparable(alias) === normalized))
  );

  return matches.length === 1 ? matches[0] : undefined;
}

function aliasConflict(index: VaultIndex, page: LoadedEntityPage, alias: string): VaultIndexEntry | undefined {
  const normalized = normalizeComparable(alias);
  const pageId = stringValue(page.frontmatter.id);

  return index.entries.find((entry) => {
    if (entry.path === page.path || (pageId && entry.id === pageId)) {
      return false;
    }

    return (
      normalizeComparable(entry.id ?? "") === normalized ||
      normalizeComparable(pageName(entry.path, "")) === normalized ||
      entry.aliases.some((item) => normalizeComparable(item) === normalized)
    );
  });
}

async function linkedReviewItems(root: string, page: LoadedEntityPage): Promise<EntityLinkedReviewItem[]> {
  const files = uniqueSorted([
    ...(await listFilesOrEmpty(root, "memory/review/*.md")),
    ...(await listFilesOrEmpty(root, "memory/review/**/*.md"))
  ]);
  const id = stringValue(page.frontmatter.id);
  const path = stripMemoryPrefix(page.path);
  const items: EntityLinkedReviewItem[] = [];

  for (const file of files) {
    let parsed: ReturnType<typeof parseMarkdownFile>;

    try {
      parsed = parseMarkdownFile(await readMarkdownPage(root, file));
    } catch {
      continue;
    }

    const affected = stringArrayValue(parsed.frontmatter.affected_files);
    const body = parsed.body;

    if (!affected.includes(path) && (!id || !body.includes(id))) {
      continue;
    }

    items.push({
      id: stringValue(parsed.frontmatter.id) ?? file,
      path: file,
      review_state: stringValue(parsed.frontmatter.review_state) ?? "none",
      review_reason: stringValue(parsed.frontmatter.review_reason),
      source_events: stringArrayValue(parsed.frontmatter.source_events),
      affected_files: affected
    });
  }

  return items.sort((left, right) => left.path.localeCompare(right.path));
}

async function linkedFollowUps(root: string, page: LoadedEntityPage): Promise<EntityLinkedFollowUp[]> {
  const files = uniqueSorted([
    ...(await listFilesOrEmpty(root, "memory/followups/*.md")),
    ...(await listFilesOrEmpty(root, "memory/followups/**/*.md"))
  ]);
  const id = stringValue(page.frontmatter.id);
  const path = stripMemoryPrefix(page.path);
  const items: EntityLinkedFollowUp[] = [];

  for (const file of files) {
    let parsed: ReturnType<typeof parseMarkdownFile>;

    try {
      parsed = parseMarkdownFile(await readMarkdownPage(root, file));
    } catch {
      continue;
    }

    const related = stringArrayValue(parsed.frontmatter.related);

    if (!related.includes(path) && (!id || !related.includes(id))) {
      continue;
    }

    items.push({
      id: stringValue(parsed.frontmatter.id) ?? file,
      path: file,
      followup_state: stringValue(parsed.frontmatter.followup_state) ?? "unknown",
      review_state: stringValue(parsed.frontmatter.review_state) ?? "none",
      source_events: stringArrayValue(parsed.frontmatter.source_events),
      related
    });
  }

  return items.sort((left, right) => left.path.localeCompare(right.path));
}

async function evidenceEvents(root: string, ids: Set<string>): Promise<EntityEvidenceEvent[]> {
  if (ids.size === 0) {
    return [];
  }

  const files = await listFilesOrEmpty(root, "memory/events/**/*.md");
  const events: EntityEvidenceEvent[] = [];

  for (const file of files) {
    let parsed: ReturnType<typeof parseMarkdownFile>;

    try {
      parsed = parseMarkdownFile(await readMarkdownPage(root, file));
    } catch {
      continue;
    }

    const id = stringValue(parsed.frontmatter.id);

    if (!id || !ids.has(id)) {
      continue;
    }

    events.push({
      id,
      path: file,
      recorded_at: stringValue(parsed.frontmatter.recorded_at),
      observed_at: stringValue(parsed.frontmatter.observed_at),
      source_label: stringValue(parsed.frontmatter.source_label)
    });
  }

  return events.sort((left, right) => left.id.localeCompare(right.id));
}

function relatedPages(index: VaultIndex, related: string[]): EntityRelatedPage[] {
  const pages: EntityRelatedPage[] = [];

  for (const idOrPath of related) {
    const path = index.ids.get(idOrPath) ?? (index.paths.has(`memory/${stripMemoryPrefix(idOrPath)}`) ? `memory/${stripMemoryPrefix(idOrPath)}` : undefined);

    if (!path) {
      continue;
    }

    const entry = index.entries.find((item) => item.path === path);
    const page: EntityRelatedPage = {
      path,
      name: pageName(path, "")
    };

    if (entry?.id) {
      page.id = entry.id;
    }

    if (entry?.type) {
      page.type = entry.type;
    }

    pages.push(page);
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

async function loadIndexOrEmpty(root: string): Promise<VaultIndex> {
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

function nextTransactionId(now: string, index: VaultIndex): string {
  const dateIdPart = now.slice(0, 10).replace(/-/g, "_");
  return `tx_${dateIdPart}_${nextSequence(dateIdPart, index)}`;
}

function nextSequence(dateIdPart: string, index: VaultIndex): string {
  const used = [...index.eventIds, ...index.transactionIds]
    .map((id) => new RegExp(`^(?:ev|tx)_${dateIdPart}_(\\d{3})$`).exec(id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10));
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;

  return String(next).padStart(3, "0");
}

function pageName(path: string, body: string): string {
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();

  if (heading) {
    return heading;
  }

  return stripMemoryPrefix(path)
    .replace(/\.md$/i, "")
    .split("/")
    .pop()!
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeLabel(value: string, label: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    throw new Error(`Entity ${label} must not be empty.`);
  }

  return normalized;
}

function stableHash(value: string): string {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function normalizeComparable(value: string): string {
  return slugify(value).replace(/-/g, "_");
}

function isEntityKind(value: string | undefined): value is EntityKind {
  return value === "person" || value === "topic" || value === "context";
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nullableStringValue(value: FrontmatterValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
