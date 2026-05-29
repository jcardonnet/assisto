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
import { createCaptureNote, type CaptureNoteOptions, type CaptureResult } from "../capture";

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
  recorded_at: string | null;
  observed_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
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

export interface ContextOperatingPage {
  context_id?: string;
  context_path: string;
  activeFacts: EntityClaimSummary[];
  decisionClaims: EntityClaimSummary[];
  openQuestionClaims: EntityClaimSummary[];
  ownerClaims: EntityClaimSummary[];
  roleClaims: EntityClaimSummary[];
  recentChanges: EntityClaimSummary[];
  relatedPeople: EntityRelatedPage[];
  relatedTopics: EntityRelatedPage[];
  openFollowUps: EntityLinkedFollowUp[];
  linkedReviewItems: EntityLinkedReviewItem[];
  evidenceEvents: EntityEvidenceEvent[];
  suggestedActions: string[];
}

export interface ContextDashboardResult {
  generated_at: string;
  context: {
    id?: string;
    path: string;
    type: "context";
    name: string;
    aliases: string[];
  };
  active_facts: EntityClaimSummary[];
  role_claims: EntityClaimSummary[];
  decision_claims: EntityClaimSummary[];
  open_question_claims: EntityClaimSummary[];
  owner_claims: EntityClaimSummary[];
  recent_changes: EntityClaimSummary[];
  stale_claims: EntityClaimSummary[];
  followups: EntityLinkedFollowUp[];
  review_items: EntityLinkedReviewItem[];
  evidence_events: EntityEvidenceEvent[];
  related_people: EntityRelatedPage[];
  related_topics: EntityRelatedPage[];
  quick_briefs: ContextDashboardQuickBrief[];
  suggested_actions: string[];
  citations: ContextDashboardCitations;
  warnings: string[];
}

export interface ContextDashboardQuickBrief {
  kind: "context" | "recent" | "review" | "followups";
  label: string;
  target_kind?: "context";
  target?: string;
}

export interface ContextDashboardCitations {
  claim_ids: string[];
  event_ids: string[];
  page_paths: string[];
  review_item_ids: string[];
  followup_ids: string[];
}

export interface ContextOperatingRoomResult {
  generated_at: string;
  context: ContextDashboardResult["context"];
  currentState: EntityClaimSummary[];
  owners: EntityClaimSummary[];
  systems: EntityClaimSummary[];
  decisions: EntityClaimSummary[];
  openQuestions: EntityClaimSummary[];
  risks: ContextOperatingRoomRisk[];
  recentChanges: EntityClaimSummary[];
  staleClaims: EntityClaimSummary[];
  reviewQueue: EntityLinkedReviewItem[];
  followupQueue: EntityLinkedFollowUp[];
  answerableQuestions: string[];
  missingMemoryPrompts: string[];
  quickActions: ContextOperatingRoomAction[];
  citations: ContextDashboardCitations;
  warnings: string[];
}

export interface ContextOperatingRoomRisk {
  risk_id: string;
  severity: "low" | "medium" | "high";
  message: string;
  evidence: string[];
}

export interface ContextOperatingRoomAction {
  action_id: string;
  label: string;
  kind: "capture" | "review" | "brief" | "health";
  target?: string;
}

export interface EntityDetailResult extends EntitySummary {
  source_events: string[];
  related: string[];
  activeClaims: EntityClaimSummary[];
  stagedClaims: EntityClaimSummary[];
  supersededClaims: EntityClaimSummary[];
  identityRisk: EntityRiskSummary;
  nearDuplicates: EntityNearDuplicate[];
  aliasConflicts: EntityAliasConflict[];
  roleChanges: EntityClaimSummary[];
  reportingChanges: EntityClaimSummary[];
  ownershipChanges: EntityClaimSummary[];
  staleClaims: EntityClaimSummary[];
  conflictingClaims: EntityClaimSummary[];
  recommendedReviewLane: EntityReviewLane;
  evidenceEvents: EntityEvidenceEvent[];
  linkedReviewItems: EntityLinkedReviewItem[];
  linkedFollowUps: EntityLinkedFollowUp[];
  relatedPages: EntityRelatedPage[];
  contextOperatingPage?: ContextOperatingPage;
  warnings: string[];
}

export type EntityReviewLane =
  | "low_risk"
  | "needs_context"
  | "identity_ambiguity"
  | "conflict_change"
  | "review_backlog";

export interface EntityRiskSummary {
  level: "low" | "medium" | "high";
  score: number;
  reasons: string[];
}

export interface EntityNearDuplicate {
  id?: string;
  path: string;
  type?: string;
  name: string;
  aliases: string[];
  reason: string;
}

export interface EntityAliasConflict {
  alias: string;
  conflicts_with: {
    id?: string;
    path: string;
    type?: string;
    name: string;
  };
}

export interface EntityRiskSignals {
  identityRisk: EntityRiskSummary;
  nearDuplicates: EntityNearDuplicate[];
  aliasConflicts: EntityAliasConflict[];
  roleChanges: EntityClaimSummary[];
  reportingChanges: EntityClaimSummary[];
  ownershipChanges: EntityClaimSummary[];
  staleClaims: EntityClaimSummary[];
  conflictingClaims: EntityClaimSummary[];
  recommendedReviewLane: EntityReviewLane;
}

export interface EntityStewardshipItem extends EntitySummary, EntityRiskSignals {
  source_events: string[];
  related: string[];
  linked_review_items: EntityLinkedReviewItem[];
  linked_followups: EntityLinkedFollowUp[];
}

export interface EntityStewardshipResult {
  generated_at: string;
  kind: EntityKind;
  items: EntityStewardshipItem[];
  summary: {
    total: number;
    high_risk: number;
    medium_risk: number;
    low_risk: number;
    identity_ambiguity: number;
    conflict_change: number;
    needs_context: number;
    review_backlog: number;
  };
  warnings: string[];
}

export interface EntityStewardshipOptions {
  now?: string;
  note?: string;
}

export interface EntityClaimRepairOptions extends EntityStewardshipOptions {
  context?: string;
  supersedeClaimId?: string;
}

export interface EntityIdentityReviewOptions extends EntityStewardshipOptions {
  reason?: string;
}

export interface EntityStewardshipPreview {
  action:
    | "stage_entity_alias"
    | "stage_entity_context"
    | "stage_entity_role"
    | "stage_entity_reporting"
    | "stage_entity_ownership"
    | "stage_entity_identity_review";
  created: boolean;
  transaction_id: string;
  transaction_path: string;
  transaction_state: string;
  risk_level?: "low" | "medium" | "high";
  requires_review: boolean;
  entity_id?: string;
  entity_path: string;
  validation: Awaited<ReturnType<typeof validateTransaction>>;
  operations: string[];
  affected_files: string[];
  source_events: string[];
  proposed_file_writes: TransactionFileWrite[];
  transaction: ParsedTransaction;
}

export type ContextNoteType = "note" | "correction";

export interface ContextNoteOptions extends CaptureNoteOptions {
  noteType?: ContextNoteType;
}

export type ContextNoteResult = Omit<CaptureResult, "action"> & {
  action: "stage_context_note";
  context_id?: string;
  context_path: string;
  note_type: ContextNoteType;
};

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
  const peerPages = await loadAllEntityPages(root);
  const riskSignals = entityRiskSignals(page, peerPages, [...activeClaims, ...stagedClaims, ...supersededClaims], reviewItems);
  const contextOperatingPage = type === "context" ? await buildContextOperatingPage(root, index, page, reviewItems, followUps) : undefined;
  const eventIds = new Set([
    ...sourceEvents,
    ...activeClaims.flatMap((claim) => claim.evidence),
    ...stagedClaims.flatMap((claim) => claim.evidence),
    ...supersededClaims.flatMap((claim) => claim.evidence),
    ...(contextOperatingPage?.activeFacts.flatMap((claim) => claim.evidence) ?? []),
    ...(contextOperatingPage?.recentChanges.flatMap((claim) => claim.evidence) ?? []),
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
    ...riskSignals,
    evidenceEvents: await evidenceEvents(root, eventIds),
    linkedReviewItems: reviewItems,
    linkedFollowUps: followUps,
    relatedPages: relatedPages(index, related),
    contextOperatingPage,
    warnings: ["Entity detail is derived from markdown; no canonical memory files were written."]
  };
}

export async function buildContextDashboardResult(
  root: string,
  idOrPath: string,
  options: EntityStewardshipOptions = {}
): Promise<ContextDashboardResult> {
  const generatedAt = options.now ?? new Date().toISOString();
  const detail = await getEntityDetail(root, idOrPath);

  if (detail.type !== "context" || !detail.contextOperatingPage) {
    throw new Error(`Context dashboard target must be a Context: ${idOrPath}`);
  }

  const page = detail.contextOperatingPage;
  const target = detail.id ?? detail.path;
  const result: ContextDashboardResult = {
    generated_at: generatedAt,
    context: {
      id: detail.id,
      path: detail.path,
      type: "context",
      name: detail.name,
      aliases: detail.aliases
    },
    active_facts: page.activeFacts,
    role_claims: page.roleClaims,
    decision_claims: page.decisionClaims,
    open_question_claims: page.openQuestionClaims,
    owner_claims: page.ownerClaims,
    recent_changes: page.recentChanges,
    stale_claims: staleDashboardClaims(page.recentChanges, generatedAt),
    followups: page.openFollowUps,
    review_items: page.linkedReviewItems,
    evidence_events: page.evidenceEvents,
    related_people: page.relatedPeople,
    related_topics: page.relatedTopics,
    quick_briefs: [
      { kind: "context", label: "Context status brief", target_kind: "context", target },
      { kind: "recent", label: "Recent context changes", target_kind: "context", target },
      { kind: "review", label: "Review-risk brief" },
      { kind: "followups", label: "Follow-up review" }
    ],
    suggested_actions: [
      ...page.suggestedActions,
      "Use stage correction or capture context note actions for durable changes; this dashboard is read-only."
    ],
    citations: {
      claim_ids: [],
      event_ids: [],
      page_paths: [],
      review_item_ids: [],
      followup_ids: []
    },
    warnings: [
      "Context dashboard is a derived view; no canonical memory files were written.",
      "Generated summaries are disposable and must be routed through capture/review before becoming memory."
    ]
  };

  result.citations = contextDashboardCitations(result);
  return result;
}

export async function buildContextOperatingRoomResult(
  root: string,
  idOrPath: string,
  options: EntityStewardshipOptions = {}
): Promise<ContextOperatingRoomResult> {
  const dashboard = await buildContextDashboardResult(root, idOrPath, options);
  const target = dashboard.context.id ?? dashboard.context.path;
  const systems = dashboard.active_facts.filter((claim) => matchesSystemIntent(claim.statement));
  const risks = contextOperatingRoomRisks(dashboard);

  return {
    generated_at: dashboard.generated_at,
    context: dashboard.context,
    currentState: dashboard.active_facts,
    owners: dashboard.owner_claims,
    systems,
    decisions: dashboard.decision_claims,
    openQuestions: dashboard.open_question_claims,
    risks,
    recentChanges: dashboard.recent_changes,
    staleClaims: dashboard.stale_claims,
    reviewQueue: dashboard.review_items,
    followupQueue: dashboard.followups,
    answerableQuestions: contextAnswerableQuestions(dashboard),
    missingMemoryPrompts: contextMissingMemoryPrompts(dashboard, systems),
    quickActions: [
      { action_id: "capture_context_note", label: "Capture context note", kind: "capture", target },
      { action_id: "stage_context_correction", label: "Stage context correction", kind: "review", target },
      { action_id: "context_status_brief", label: "Generate context status brief", kind: "brief", target },
      { action_id: "review_risks", label: "Inspect review risks", kind: "review", target }
    ],
    citations: dashboard.citations,
    warnings: [
      "Context operating room is a derived view; no canonical memory files were written.",
      "Durable changes must route through capture or pending Transactions."
    ]
  };
}

export async function buildEntityStewardshipResult(
  root: string,
  kind: EntityKind,
  options: EntityStewardshipOptions = {}
): Promise<EntityStewardshipResult> {
  const generatedAt = options.now ?? new Date().toISOString();
  const pages = await loadAllEntityPages(root);
  const items: EntityStewardshipItem[] = [];

  for (const page of pages.filter((item) => stringValue(item.frontmatter.type) === kind)) {
    const summary = entitySummary(page);
    const sourceEvents = stringArrayValue(page.frontmatter.source_events);
    const related = stringArrayValue(page.frontmatter.related);
    const claims = page.claims.map((claim) => claimSummary(page, claim));
    const reviewItems = await linkedReviewItems(root, page);
    const followUps = await linkedFollowUps(root, page);
    const riskSignals = entityRiskSignals(page, pages, claims, reviewItems);

    items.push({
      ...summary,
      source_events: sourceEvents,
      related,
      linked_review_items: reviewItems,
      linked_followups: followUps,
      ...riskSignals
    });
  }

  items.sort(
    (left, right) =>
      riskLevelRank(right.identityRisk.level) - riskLevelRank(left.identityRisk.level) ||
      right.identityRisk.score - left.identityRisk.score ||
      left.name.localeCompare(right.name) ||
      left.path.localeCompare(right.path)
  );

  return {
    generated_at: generatedAt,
    kind,
    items,
    summary: {
      total: items.length,
      high_risk: items.filter((item) => item.identityRisk.level === "high").length,
      medium_risk: items.filter((item) => item.identityRisk.level === "medium").length,
      low_risk: items.filter((item) => item.identityRisk.level === "low").length,
      identity_ambiguity: items.filter((item) => item.recommendedReviewLane === "identity_ambiguity").length,
      conflict_change: items.filter((item) => item.recommendedReviewLane === "conflict_change").length,
      needs_context: items.filter((item) => item.recommendedReviewLane === "needs_context").length,
      review_backlog: items.filter((item) => item.recommendedReviewLane === "review_backlog").length
    },
    warnings: [
      "Entity stewardship risk is a derived deterministic view; no canonical memory files were written.",
      "Merge, split, delete, and autonomous identity resolution remain out of scope."
    ]
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

export async function createEntityRoleTransaction(
  root: string,
  idOrPath: string,
  statement: string,
  options: EntityClaimRepairOptions = {}
): Promise<EntityStewardshipPreview> {
  return createEntityClaimRepairTransaction(root, idOrPath, "role", statement, options);
}

export async function createEntityReportingTransaction(
  root: string,
  idOrPath: string,
  statement: string,
  options: EntityClaimRepairOptions = {}
): Promise<EntityStewardshipPreview> {
  return createEntityClaimRepairTransaction(root, idOrPath, "reporting", statement, options);
}

export async function createEntityOwnershipTransaction(
  root: string,
  idOrPath: string,
  statement: string,
  options: EntityClaimRepairOptions = {}
): Promise<EntityStewardshipPreview> {
  return createEntityClaimRepairTransaction(root, idOrPath, "ownership", statement, options);
}

export async function createEntityIdentityReviewTransaction(
  root: string,
  idOrPath: string,
  options: EntityIdentityReviewOptions = {}
): Promise<EntityStewardshipPreview> {
  const now = options.now ?? defaultNow;
  const index = await loadIndexOrEmpty(root);
  const page = await loadResolvedEntity(root, index, idOrPath);
  const transactionId = nextTransactionId(now, index);
  const summary = entitySummary(page);
  const reason = normalizeLabel(options.reason ?? options.note ?? "Needs identity review.", "identity review reason");

  return writeStewardshipTransaction(root, {
    action: "stage_entity_identity_review",
    entityPage: page,
    transactionId,
    now,
    writes: [
      renderStewardshipReviewWrite(
        page,
        transactionId,
        now,
        "identity_review",
        `Identity review requested for ${summary.name}: ${reason}`,
        options.note
      )
    ],
    operations: [{ operation: "STAGE_REVIEW" as const, description: `stage identity review for ${stripMemoryPrefix(page.path)}` }],
    intent: `Stage identity review for ${summary.name}.`,
    risk: "high",
    requiresReview: true
  });
}

export async function createContextNoteTransaction(
  root: string,
  idOrPath: string,
  note: string,
  options: ContextNoteOptions = {}
): Promise<ContextNoteResult> {
  const index = await loadIndexOrEmpty(root);
  const page = await loadResolvedEntity(root, index, idOrPath);

  if (stringValue(page.frontmatter.type) !== "context") {
    throw new Error("Context note actions require a Context entity.");
  }

  const noteType = normalizeContextNoteType(options.noteType);
  const contextId = stringValue(page.frontmatter.id);
  const contextRef = contextId ?? page.path;
  const sourceLabel = options.source_label ?? `context_${noteType}:${contextRef}`;
  const capture = await createCaptureNote(root, note, {
    ...options,
    context: contextRef,
    source_label: sourceLabel
  });

  return {
    ...capture,
    action: "stage_context_note",
    context_id: contextId,
    context_path: page.path,
    note_type: noteType
  };
}

async function createEntityClaimRepairTransaction(
  root: string,
  idOrPath: string,
  repairKind: "role" | "reporting" | "ownership",
  statement: string,
  options: EntityClaimRepairOptions
): Promise<EntityStewardshipPreview> {
  const now = options.now ?? defaultNow;
  const normalizedStatement = normalizeLabel(statement, `${repairKind} correction statement`);
  const index = await loadIndexOrEmpty(root);
  const page = await loadResolvedEntity(root, index, idOrPath);
  const transactionId = nextTransactionId(now, index);
  const write = renderClaimRepairWrite(page, repairKind, normalizedStatement, now, options);
  const operations = [
    ...(options.supersedeClaimId
      ? [
          {
            operation: "SUPERSEDE_CLAIM" as const,
            description: `supersede ${options.supersedeClaimId} on ${stripMemoryPrefix(page.path)}`
          }
        ]
      : []),
    {
      operation: "UPSERT_CLAIM" as const,
      description: `stage ${repairKind} correction claim for ${stripMemoryPrefix(page.path)}`
    }
  ];

  return writeStewardshipTransaction(root, {
    action: `stage_entity_${repairKind}` as EntityStewardshipPreview["action"],
    entityPage: page,
    transactionId,
    now,
    writes: [write],
    operations,
    intent: `Stage ${repairKind} correction for ${entitySummary(page).name}.`,
    risk: options.supersedeClaimId ? "high" : "medium",
    requiresReview: true
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
    operations: Array<{ operation: "UPSERT_CLAIM" | "STAGE_REVIEW" | "SUPERSEDE_CLAIM"; description: string }>;
    intent: string;
    risk: "low" | "medium" | "high";
    requiresReview?: boolean;
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
    requires_review: input.requiresReview ?? input.operations.some((operation) => operation.operation === "STAGE_REVIEW"),
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
    risk_level: transaction.risk_level,
    requires_review: Boolean(transaction.requires_review),
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

function renderClaimRepairWrite(
  page: LoadedEntityPage,
  repairKind: "role" | "reporting" | "ownership",
  statement: string,
  now: string,
  options: EntityClaimRepairOptions
): TransactionFileWrite {
  const sourceEvents = stringArrayValue(page.frontmatter.source_events);
  const claimId = `clm_${slugify(pageName(page.path, page.body))}_${repairKind}_${stableHash(`${page.path}:${repairKind}:${statement}`)}`;
  const bodyWithSupersede = options.supersedeClaimId
    ? supersedeClaimInBody(page.body, options.supersedeClaimId)
    : page.body;
  const body = appendStagedClaim(
    bodyWithSupersede,
    renderStagedRepairClaim({
      claimId,
      statement,
      repairKind,
      sourceEvents,
      now,
      context: options.context
    })
  );
  const frontmatter: Frontmatter = {
    ...page.frontmatter,
    updated_at: now
  };

  return {
    path: page.path,
    content: serializeMarkdownFile(frontmatter, body)
  };
}

function renderStagedRepairClaim(input: {
  claimId: string;
  statement: string;
  repairKind: "role" | "reporting" | "ownership";
  sourceEvents: string[];
  now: string;
  context?: string;
}): string {
  const scope = input.context?.trim() ? input.context.trim() : "null";
  const scopeState = input.context?.trim() ? "complete" : "unknown";

  return [
    `- claim_id: ${input.claimId}`,
    `  statement: ${input.statement}`,
    "  claim_kind: fact",
    "  claim_state: staged",
    "  evidence_strength: explicit",
    `  scope: ${scope}`,
    `  scope_state: ${scopeState}`,
    `  evidence: [${input.sourceEvents.join(", ")}]`,
    `  recorded_at: ${input.now}`,
    "  observed_at: null",
    "  valid_from: null",
    "  valid_to: null"
  ].join("\n");
}

function appendStagedClaim(body: string, claimBlock: string): string {
  const lines = body.trimEnd().split("\n");
  const sectionIndex = lines.findIndex((line) => /^##\s+Staged claims\s*$/i.test(line.trim()));

  if (sectionIndex === -1) {
    return `${body.trimEnd()}\n\n## Staged claims\n\n${claimBlock}\n`;
  }

  const nextSectionIndex = lines.findIndex((line, index) => index > sectionIndex && /^##\s+/.test(line.trim()));
  const insertAt = nextSectionIndex === -1 ? lines.length : nextSectionIndex;
  const before = lines.slice(0, insertAt).join("\n").trimEnd();
  const after = lines.slice(insertAt).join("\n").trimStart();

  return `${before}\n\n${claimBlock}\n${after ? `\n${after}` : ""}`;
}

function supersedeClaimInBody(body: string, claimId: string): string {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => new RegExp(`^-\\s+claim_id:\\s*${escapeRegExp(claimId)}\\s*$`).test(line.trim()));

  if (start === -1) {
    throw new Error(`Supersede claim_id not found on entity page: ${claimId}`);
  }

  let end = lines.length;

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (/^#{1,6}\s+/.test(line) || /^-\s+claim_id:\s*/.test(line.trim())) {
      end = index;
      break;
    }
  }

  let stateUpdated = false;

  for (let index = start + 1; index < end; index += 1) {
    if (/^\s+claim_state:\s*/.test(lines[index] ?? "")) {
      lines[index] = "  claim_state: superseded";
      stateUpdated = true;
      break;
    }
  }

  if (!stateUpdated) {
    lines.splice(start + 1, 0, "  claim_state: superseded");
  }

  return lines.join("\n");
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
    .map((claim) => claimSummary(page, claim));
}

function claimSummary(page: LoadedEntityPage, claim: ParsedClaimBlockRecord): EntityClaimSummary {
  return {
    page_path: page.path,
    claim_id: stringValue(claim.fields.claim_id) ?? "unknown",
    statement: stringValue(claim.fields.statement) ?? "",
    claim_kind: stringValue(claim.fields.claim_kind) ?? "fact",
    claim_state: stringValue(claim.fields.claim_state) ?? "active",
    scope: nullableStringValue(claim.fields.scope),
    scope_state: stringValue(claim.fields.scope_state) ?? "unknown",
    evidence: stringArrayValue(claim.fields.evidence),
    recorded_at: nullableStringValue(claim.fields.recorded_at),
    observed_at: nullableStringValue(claim.fields.observed_at),
    valid_from: nullableStringValue(claim.fields.valid_from),
    valid_to: nullableStringValue(claim.fields.valid_to)
  };
}

async function buildContextOperatingPage(
  root: string,
  index: VaultIndex,
  contextPage: LoadedEntityPage,
  reviewItems: EntityLinkedReviewItem[],
  followUps: EntityLinkedFollowUp[]
): Promise<ContextOperatingPage> {
  const scopedClaims = await claimsScopedToContext(root, contextPage);
  const activeFacts = scopedClaims.filter((claim) => claim.claim_state === "active");
  const recentChanges = [...scopedClaims]
    .sort((left, right) => claimTime(right).localeCompare(claimTime(left)) || left.claim_id.localeCompare(right.claim_id))
    .slice(0, 8);
  const related = uniqueSorted([
    ...stringArrayValue(contextPage.frontmatter.related),
    ...scopedClaims
      .map((claim) => claim.page_path)
      .filter((path) => path !== contextPage.path)
  ]);
  const pages = relatedPages(index, related);
  const eventIds = new Set([
    ...scopedClaims.flatMap((claim) => claim.evidence),
    ...reviewItems.flatMap((item) => item.source_events),
    ...followUps.flatMap((item) => item.source_events)
  ]);

  return {
    context_id: stringValue(contextPage.frontmatter.id),
    context_path: contextPage.path,
    activeFacts,
    decisionClaims: activeFacts.filter((claim) => matchesDecisionIntent(claim.statement)),
    openQuestionClaims: activeFacts.filter((claim) => matchesOpenQuestionIntent(claim.statement)),
    ownerClaims: activeFacts.filter((claim) => matchesOwnerIntent(claim.statement)),
    roleClaims: activeFacts.filter((claim) => matchesRoleIntent(claim.statement)),
    recentChanges,
    relatedPeople: pages.filter((page) => page.type === "person"),
    relatedTopics: pages.filter((page) => page.type === "topic"),
    openFollowUps: followUps.filter((followup) => followup.followup_state === "open"),
    linkedReviewItems: reviewItems,
    evidenceEvents: await evidenceEvents(root, eventIds),
    suggestedActions: [
      "Review open questions before relying on the Context as complete.",
      "Stage corrections through pending Transactions; do not edit Context pages directly."
    ]
  };
}

async function claimsScopedToContext(root: string, contextPage: LoadedEntityPage): Promise<EntityClaimSummary[]> {
  const files = uniqueSorted([
    ...(await listEntityFiles(root, "person")),
    ...(await listEntityFiles(root, "topic")),
    ...(await listEntityFiles(root, "context"))
  ]);
  const claims: EntityClaimSummary[] = [];

  for (const file of files) {
    let page: LoadedEntityPage;

    try {
      page = await loadEntityPage(root, file);
    } catch {
      continue;
    }

    for (const claim of page.claims) {
      const summary = claimSummary(page, claim);

      if (page.path === contextPage.path || scopeMatchesContext(summary.scope, contextPage)) {
        claims.push(summary);
      }
    }
  }

  return claims.sort((left, right) => left.page_path.localeCompare(right.page_path) || left.claim_id.localeCompare(right.claim_id));
}

function scopeMatchesContext(scope: string | null, contextPage: LoadedEntityPage): boolean {
  if (!scope) {
    return false;
  }

  const contextId = stringValue(contextPage.frontmatter.id);
  const allowed = new Set([contextPage.path, stripMemoryPrefix(contextPage.path), ...(contextId ? [contextId] : [])]);

  return allowed.has(scope);
}

function claimTime(claim: EntityClaimSummary): string {
  return claim.observed_at ?? claim.recorded_at ?? claim.valid_from ?? "";
}

function matchesDecisionIntent(statement: string): boolean {
  return /\b(decision|decided|agreed|chose|chosen|selected|will keep|will use|standardized|standardised)\b/i.test(statement);
}

function matchesOpenQuestionIntent(statement: string): boolean {
  return /\b(open question|unknown|unclear|need to confirm|needs to confirm|needs to understand|whether)\b/i.test(statement) || statement.includes("?");
}

function matchesOwnerIntent(statement: string): boolean {
  return /\b(owner|owns|responsible|responsibility|dri|accountable)\b/i.test(statement);
}

function matchesSystemIntent(statement: string): boolean {
  return /\b(system|systems|service|services|database|db|mysql|postgres|postgresql|redis|solr|search|api|pipeline|platform|tool|tools|queue|warehouse|reporting|dashboard)\b/i.test(
    statement
  );
}

function matchesRoleIntent(statement: string): boolean {
  return /\b(role|manager|reports to|owner|owns|lead|cto|dba|responsible)\b/i.test(statement);
}

function entityRiskSignals(
  page: LoadedEntityPage,
  allPages: LoadedEntityPage[],
  claims: EntityClaimSummary[],
  reviewItems: EntityLinkedReviewItem[]
): EntityRiskSignals {
  const nearDuplicates = nearDuplicateEntities(page, allPages);
  const aliasConflicts = aliasConflictSignals(page, allPages);
  const roleChanges = claims.filter((claim) => matchesRoleIntent(claim.statement));
  const reportingChanges = claims.filter((claim) => matchesReportingIntent(claim.statement));
  const ownershipChanges = claims.filter((claim) => matchesOwnerIntent(claim.statement));
  const staleClaims = claims.filter(isStaleEntityClaim);
  const conflictingClaims = claims.filter(isConflictingEntityClaim);
  const reasons = [
    nearDuplicates.length > 0 ? "near duplicate entity names or aliases need identity review" : "",
    aliasConflicts.length > 0 ? "aliases conflict with another entity" : "",
    reviewItems.length > 0 ? "linked ReviewItems are open or staged" : "",
    reportingChanges.length > 1 ? "multiple manager/reporting claims may describe a change" : "",
    ownershipChanges.length > 1 ? "multiple ownership claims may describe a change" : "",
    staleClaims.length > 0 ? "stale, superseded, rejected, or ended claims are present" : "",
    conflictingClaims.length > 0 ? "staged, unknown-scope, contested, or non-active claims need review" : ""
  ].filter(Boolean);
  const score =
    nearDuplicates.length * 3 +
    aliasConflicts.length * 4 +
    reviewItems.length * 2 +
    conflictingClaims.length * 2 +
    staleClaims.length +
    Math.max(0, reportingChanges.length - 1) +
    Math.max(0, ownershipChanges.length - 1);
  const recommendedReviewLane = recommendedLane({
    nearDuplicates,
    aliasConflicts,
    reviewItems,
    conflictingClaims,
    staleClaims,
    claims,
    reportingChanges,
    ownershipChanges,
    score
  });
  const level = nearDuplicates.length > 0 || aliasConflicts.length > 0 ? "high" : score >= 1 ? "medium" : "low";

  return {
    identityRisk: {
      level,
      score,
      reasons: reasons.length ? reasons : ["no deterministic stewardship risks detected"]
    },
    nearDuplicates,
    aliasConflicts,
    roleChanges,
    reportingChanges,
    ownershipChanges,
    staleClaims,
    conflictingClaims,
    recommendedReviewLane
  };
}

function matchesReportingIntent(statement: string): boolean {
  return /\b(manager|reports to|reporting to|direct report|org chart)\b/i.test(statement);
}

function isStaleEntityClaim(claim: EntityClaimSummary): boolean {
  return claim.claim_state === "superseded" || claim.claim_state === "rejected" || Boolean(claim.valid_to);
}

function isConflictingEntityClaim(claim: EntityClaimSummary): boolean {
  return claim.claim_state !== "active" || claim.scope_state === "unknown" || claim.scope_state === "partial";
}

function recommendedLane(input: {
  nearDuplicates: EntityNearDuplicate[];
  aliasConflicts: EntityAliasConflict[];
  reviewItems: EntityLinkedReviewItem[];
  conflictingClaims: EntityClaimSummary[];
  staleClaims: EntityClaimSummary[];
  claims: EntityClaimSummary[];
  reportingChanges: EntityClaimSummary[];
  ownershipChanges: EntityClaimSummary[];
  score: number;
}): EntityReviewLane {
  if (input.nearDuplicates.length > 0 || input.aliasConflicts.length > 0) {
    return "identity_ambiguity";
  }

  if (
    input.staleClaims.length > 0 ||
    input.reportingChanges.length > 1 ||
    input.ownershipChanges.length > 1 ||
    input.conflictingClaims.some((claim) => claim.claim_state === "superseded" || claim.claim_state === "rejected")
  ) {
    return "conflict_change";
  }

  if (input.claims.some((claim) => claim.scope_state === "unknown" || claim.scope_state === "partial")) {
    return "needs_context";
  }

  if (input.reviewItems.length > 0 || input.conflictingClaims.length > 0 || input.score > 0) {
    return "review_backlog";
  }

  return "low_risk";
}

function nearDuplicateEntities(page: LoadedEntityPage, allPages: LoadedEntityPage[]): EntityNearDuplicate[] {
  const current = entityComparableNames(page);
  const duplicates: EntityNearDuplicate[] = [];

  for (const candidate of allPages) {
    if (candidate.path === page.path || stringValue(candidate.frontmatter.type) !== stringValue(page.frontmatter.type)) {
      continue;
    }

    const candidateNames = entityComparableNames(candidate);
    const overlapping = current.find((name) => candidateNames.includes(name));
    const similar = overlapping ?? current.find((name) => candidateNames.some((candidateName) => namesAreNear(name, candidateName)));

    if (!similar) {
      continue;
    }

    duplicates.push({
      id: stringValue(candidate.frontmatter.id),
      path: candidate.path,
      type: stringValue(candidate.frontmatter.type),
      name: pageName(candidate.path, candidate.body),
      aliases: stringArrayValue(candidate.frontmatter.aliases),
      reason: overlapping ? `shared normalized name or alias "${similar}"` : `near normalized name or alias "${similar}"`
    });
  }

  return duplicates.sort((left, right) => left.path.localeCompare(right.path));
}

function aliasConflictSignals(page: LoadedEntityPage, allPages: LoadedEntityPage[]): EntityAliasConflict[] {
  const aliases = stringArrayValue(page.frontmatter.aliases);
  const conflicts: EntityAliasConflict[] = [];

  for (const alias of aliases) {
    const normalizedAlias = normalizeComparable(alias);
    const conflict = allPages.find((candidate) => {
      if (candidate.path === page.path || stringValue(candidate.frontmatter.type) !== stringValue(page.frontmatter.type)) {
        return false;
      }

      return entityComparableNames(candidate).includes(normalizedAlias);
    });

    if (!conflict) {
      continue;
    }

    conflicts.push({
      alias,
      conflicts_with: {
        id: stringValue(conflict.frontmatter.id),
        path: conflict.path,
        type: stringValue(conflict.frontmatter.type),
        name: pageName(conflict.path, conflict.body)
      }
    });
  }

  return conflicts.sort((left, right) => left.alias.localeCompare(right.alias));
}

function entityComparableNames(page: LoadedEntityPage): string[] {
  return uniqueSorted([
    normalizeComparable(pageName(page.path, page.body)),
    normalizeComparable(stringValue(page.frontmatter.id) ?? ""),
    ...stringArrayValue(page.frontmatter.aliases).map((alias) => normalizeComparable(alias))
  ]);
}

function namesAreNear(left: string, right: string): boolean {
  if (!left || !right || left === right) {
    return false;
  }

  if (left.length < 4 || right.length < 4) {
    return false;
  }

  return left.startsWith(right) || right.startsWith(left);
}

function riskLevelRank(level: EntityRiskSummary["level"]): number {
  return level === "high" ? 3 : level === "medium" ? 2 : 1;
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

async function loadAllEntityPages(root: string): Promise<LoadedEntityPage[]> {
  const files = uniqueSorted([
    ...(await listEntityFiles(root, "person")),
    ...(await listEntityFiles(root, "topic")),
    ...(await listEntityFiles(root, "context"))
  ]);
  const pages: LoadedEntityPage[] = [];

  for (const file of files) {
    try {
      const page = await loadEntityPage(root, file);

      if (isEntityKind(stringValue(page.frontmatter.type))) {
        pages.push(page);
      }
    } catch {
      // Malformed pages are reported by health checks; stewardship skips unreadable pages.
    }
  }

  return pages.sort((left, right) => left.path.localeCompare(right.path));
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

function staleDashboardClaims(claims: EntityClaimSummary[], now: string): EntityClaimSummary[] {
  const currentDate = now.slice(0, 10);

  return claims.filter((claim) => {
    if (claim.claim_state === "superseded" || claim.claim_state === "rejected") {
      return true;
    }

    return typeof claim.valid_to === "string" && claim.valid_to.length > 0 && claim.valid_to <= currentDate;
  });
}

function contextOperatingRoomRisks(result: ContextDashboardResult): ContextOperatingRoomRisk[] {
  const risks: ContextOperatingRoomRisk[] = [];

  if (result.review_items.length > 0) {
    risks.push({
      risk_id: "review_queue",
      severity: "high",
      message: `${result.review_items.length} review item(s) need human attention.`,
      evidence: result.review_items.map((item) => item.id)
    });
  }

  if (result.stale_claims.length > 0) {
    risks.push({
      risk_id: "stale_claims",
      severity: "medium",
      message: `${result.stale_claims.length} stale or ended claim(s) may affect current state.`,
      evidence: result.stale_claims.map((claim) => claim.claim_id)
    });
  }

  if (result.open_question_claims.length > 0) {
    risks.push({
      risk_id: "open_questions",
      severity: "medium",
      message: `${result.open_question_claims.length} open question(s) are recorded for this Context.`,
      evidence: result.open_question_claims.map((claim) => claim.claim_id)
    });
  }

  if (result.followups.length > 0) {
    risks.push({
      risk_id: "open_followups",
      severity: "low",
      message: `${result.followups.length} open follow-up(s) are linked to this Context.`,
      evidence: result.followups.map((followup) => followup.id)
    });
  }

  if (risks.length === 0) {
    risks.push({
      risk_id: "no_known_risks",
      severity: "low",
      message: "No deterministic review, stale-claim, open-question, or follow-up risks found.",
      evidence: []
    });
  }

  return risks;
}

function contextAnswerableQuestions(result: ContextDashboardResult): string[] {
  const name = result.context.name;
  const questions = [
    `What is the current state of ${name}?`,
    `Who owns ${name}?`,
    `What decisions are recorded for ${name}?`,
    `What open questions exist for ${name}?`,
    `What follow-ups are open for ${name}?`,
    `What changed recently for ${name}?`
  ];

  return uniqueSorted(questions);
}

function contextMissingMemoryPrompts(result: ContextDashboardResult, systems: EntityClaimSummary[]): string[] {
  const name = result.context.name;
  const prompts: string[] = [];

  if (result.owner_claims.length === 0) {
    prompts.push(`Capture who owns ${name}.`);
  }

  if (systems.length === 0) {
    prompts.push(`Capture systems or tools used by ${name}.`);
  }

  if (result.decision_claims.length === 0) {
    prompts.push(`Capture key decisions for ${name}.`);
  }

  if (result.open_question_claims.length === 0) {
    prompts.push(`Capture known open questions for ${name}.`);
  }

  if (result.evidence_events.length === 0) {
    prompts.push(`Capture source Events that support ${name}.`);
  }

  return prompts;
}

function contextDashboardCitations(result: ContextDashboardResult): ContextDashboardCitations {
  const claimGroups = [
    result.active_facts,
    result.role_claims,
    result.decision_claims,
    result.open_question_claims,
    result.owner_claims,
    result.recent_changes,
    result.stale_claims
  ];
  const claims = claimGroups.flat();

  return {
    claim_ids: uniqueSorted(claims.map((claim) => claim.claim_id)),
    event_ids: uniqueSorted([
      ...claims.flatMap((claim) => claim.evidence),
      ...result.followups.flatMap((followup) => followup.source_events),
      ...result.review_items.flatMap((item) => item.source_events),
      ...result.evidence_events.map((event) => event.id)
    ]),
    page_paths: uniqueSorted([
      result.context.path,
      ...claims.map((claim) => claim.page_path),
      ...result.followups.map((followup) => followup.path),
      ...result.review_items.map((item) => item.path),
      ...result.evidence_events.map((event) => event.path),
      ...result.related_people.map((page) => page.path),
      ...result.related_topics.map((page) => page.path)
    ]),
    review_item_ids: uniqueSorted(result.review_items.map((item) => item.id)),
    followup_ids: uniqueSorted(result.followups.map((followup) => followup.id))
  };
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

function normalizeContextNoteType(value: ContextNoteType | undefined): ContextNoteType {
  if (!value || value === "note") {
    return "note";
  }

  if (value === "correction") {
    return "correction";
  }

  throw new Error("Context note type must be note or correction.");
}

function stableHash(value: string): string {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
