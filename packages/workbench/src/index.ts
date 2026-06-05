import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import {
  applyTransaction,
  buildActivationStatusResult,
  buildContextDashboardResult,
  buildContextOperatingRoomResult,
  buildContextOperatingRoomV3,
  buildContextTimelineResult,
  buildDailyQueueResult,
  buildCaptureInboxResult,
  buildDogfoodHomeResult,
  buildDogfoodControlRoomResult,
  buildEntityStewardshipResult,
  buildEntityStewardshipCommandCenter,
  buildSymbolicIndex,
  buildImportAssistantResult,
  buildMaintenancePlan,
  buildPortableContextPack,
  clearMaintenanceRuns,
  listMaintenanceRuns,
  readMaintenanceRun,
  runMaintenance,
  stageMaintenanceFinding,
  buildSourceCaptureHub,
  buildReviewAccelerationQueue,
  buildReviewAutopilotResult,
  buildReviewThroughputResult,
  buildUseAssistoTomorrowResult,
  buildWorkdayModeResult,
  readDailySession,
  runPersonalDogfoodEval,
  checkMemoryHealth,
  buildSessionBrief,
  buildTodayWorkbenchResult,
  createCaptureNote,
  createCaptureFeedback,
  createFrictionLog,
  createDogfoodFeedback,
  createHealthReviewTransaction,
  createImportNotes,
  createImportTriage,
  createSeedKit,
  createSourceAdapterImport,
  createSourceInboxSessionFromPreview,
  createSourceInboxEvents,
  triageSourceInboxSession,
  listSourceInboxSessions,
  readSourceInboxSession,
  searchSourceInboxUnits,
  createWorkdayCapture,
  createContextNoteTransaction,
  createEntityAliasTransaction,
  createEntityContextTransaction,
  createEntityIdentityReviewTransaction,
  createEntityOwnershipTransaction,
  createEntityReportingTransaction,
  createEntityRoleTransaction,
  createOpenAiExtractionProvider,
  createReviewApplyTransaction,
  createReviewStateTransaction,
  listSessionBriefTargets,
  listWorkdayCapturePresets,
  listEntities,
  listMarkdownFiles,
  listReviewItems,
  parseClaimBlockRecords,
  parseMarkdownFile,
  parseTransactionMarkdown,
  readMarkdownPage,
  rejectTransaction,
  reprocessEvent,
  showReviewItem,
  getEntityDetail,
  transactionFilePaths,
  previewCaptureNote,
  previewCaptureFeedback,
  previewEntityRepairActionV2,
  previewFrictionLog,
  previewDogfoodFeedbackTransaction,
  previewImportNotes,
  previewImportTriage,
  previewSeedKit,
  previewSourceAdapterImport,
  previewWorkdayCapture,
  updateDailySession,
  previewAnswerDraft,
  retrieveCitedAnswerContract,
  retrieveCitedAnswerContractV3,
  retrieveCitedAnswerContractV4,
  retrieveContextForAnswer,
  validateTransaction,
  type AnswerDraftResult,
  type ActivationStatusResult,
  type CaptureCreateResult,
  type CaptureFeedbackCreateResult,
  type CaptureFeedbackPreviewResult,
  type CaptureInboxResult,
  type CapturePreviewResult,
  type WorkdayCaptureCreate,
  type WorkdayCapturePreview,
  type ContextPackKind,
  type ContextPackResult,
  type CitedAnswerContractV3,
  type CitedAnswerContractV4,
  type ContextNoteResult,
  type DailyQueueResult,
  type DogfoodHomeResult,
  type PersonalDogfoodEvalResult,
  type ExtractionProvider,
  type EntityKind,
  type EntityRepairActionV2Kind,
  type EntityRepairActionV2Preview,
  type EntityClaimSummary,
  type EntityStewardshipPreview,
  type DogfoodFeedbackCreateResult,
  type DogfoodFeedbackPreviewResult,
  type FrictionLogCreateResult,
  type FrictionLogPreviewResult,
  type FrontmatterValue,
  type IngestNoteResult,
  type ImportCreateResult,
  type ImportPreviewResult,
  type ImportTriageCreateResult,
  type ImportTriagePreviewResult,
  type ImportTriageUnitInput,
  type HealthReviewTransactionResult,
  type MaintenanceMode,
  type MemoryHealthResult,
  type ParsedTransaction,
  type ReviewAccelerationItem,
  type ReviewAccelerationQueue,
  type ReviewActionState,
  type ReviewStateTransactionResult,
  type ReviewItemSummary,
  type SeedKitCreateResult,
  type SeedKitInput,
  type SeedKitPreviewResult,
  type SeedKitResult,
  type SessionBriefKind,
  type SessionBriefTarget,
  type SessionBriefTargetKind,
  type SourceAdapterCreateResult,
  type SourceAdapterKind,
  type SourceAdapterPreviewResult,
  type SourceSpan,
  type SourceTriageDecision,
  type SourceTriageDecisionAction,
  type SourceTriageDecisionUnitInput,
  type TodayWorkbenchResult,
  type ValidationResult
} from "@assisto/core";
import { createWorkbenchHttpServer } from "./server/http";
import { findRoute } from "./server/route-registry";
import { createAskRoute } from "./server/routes/ask";
import type { WorkbenchRouteRequest, WorkbenchRouteResponse } from "./shared/contracts";

export type { WorkbenchRouteRequest, WorkbenchRouteResponse } from "./shared/contracts";

export interface WorkbenchSnapshotOptions {
  query?: string;
  includeHealth?: boolean;
  now?: string;
}

export interface WorkbenchSnapshot {
  generated_at: string;
  review: WorkbenchReviewInbox;
  transactions: WorkbenchTransactionList;
  followups: WorkbenchFollowupList;
  health: WorkbenchHealthSummary | null;
  ask: ContextPackResult | null;
}

export type WorkbenchAskBasis = ContextPackResult | CitedAnswerContractV3 | CitedAnswerContractV4;

export interface WorkbenchAskSession {
  generated_at: string;
  query?: string;
  basis: WorkbenchAskBasis | null;
  pinned_questions: string[];
  citation_explorer: WorkbenchAskCitationExplorer;
  matched_page_previews: WorkbenchAskPagePreview[];
  source_event_previews: WorkbenchAskEventPreview[];
  missing_memory_actions: WorkbenchAskMissingMemoryAction[];
}

export interface WorkbenchAskCitationExplorer {
  claim_ids: string[];
  event_ids: string[];
  page_paths: string[];
  review_item_ids: string[];
  followup_ids: string[];
  proof_ids: string[];
}

export interface WorkbenchAskPagePreview {
  path: string;
  id?: string;
  name: string;
  type?: string;
  why_included: string;
  content_preview: string;
}

export interface WorkbenchAskEventPreview {
  path: string;
  id?: string;
  recorded_at?: string;
  observed_at?: string;
  why_included: string;
  raw_text_preview: string;
}

export interface WorkbenchAskMissingMemoryAction {
  action: "capture_note" | "log_retrieval_miss";
  label: string;
  endpoint: string;
  preview_endpoint: string;
  note: string;
}

export interface WorkbenchReviewInbox {
  items: WorkbenchReviewItem[];
  grouped_by_reason: WorkbenchReviewReasonGroup[];
}

export interface WorkbenchReviewReasonGroup {
  review_reason: string;
  count: number;
  item_ids: string[];
  suggested_action: string;
}

export interface WorkbenchReviewItem extends ReviewItemSummary {
  source_events: string[];
  affected_files: string[];
  linked_transaction?: string;
  staged_claim_ids: string[];
  suggested_action: string;
}

export type WorkbenchReviewLaneId =
  | "needs_ontology_review"
  | "safe_apply"
  | "needs_context"
  | "identity_ambiguity"
  | "conflict_or_change"
  | "stale_noop"
  | "other";

export interface WorkbenchReviewTurbo {
  generated_at: string;
  lanes: WorkbenchReviewLane[];
  items: WorkbenchReviewTurboItem[];
}

export interface WorkbenchReviewNext {
  generated_at: string;
  total: number;
  position: number;
  item: WorkbenchReviewTurboItem | null;
  previous_item_id: string | null;
  next_item_id: string | null;
}

export interface WorkbenchReviewThroughput {
  version: "review-throughput-v1";
  generated_at: string;
  total_items: number;
  ready_now_count: number;
  needs_input_count: number;
  risk_review_count: number;
  lanes: Array<{ lane_id: WorkbenchReviewLaneId; label: string; item_count: number; ready_count: number; blocked_count: number; required_inputs: string[]; action_checklist: string[]; item_ids: string[] }>;
  bottlenecks: Array<{ lane_id: WorkbenchReviewLaneId; label: string; item_count: number; ready_count: number; blocked_count: number; required_inputs: string[]; action_checklist: string[]; item_ids: string[] }>;
  next_action: { item_id: string; lane_id: WorkbenchReviewLaneId; label: string; endpoint: string; preview_endpoint: string; required_inputs: string[]; checklist: string[] } | null;
  batchApplyAllowed: false;
  warnings: string[];
}

export interface WorkbenchReviewAutopilot {
  version: "review-autopilot-v1";
  generated_at: string;
  total_items: number;
  batchApplyAllowed: false;
  next_item_id: string | null;
  lanes: WorkbenchReviewAutopilotLane[];
  items: WorkbenchReviewAutopilotItem[];
  warnings: string[];
}

export interface WorkbenchReviewAutopilotLane {
  lane_id: WorkbenchReviewLaneId;
  label: string;
  risk_rank: number;
  item_ids: string[];
  item_count: number;
  risk_factors: string[];
  suggested_action: string;
}

export interface WorkbenchReviewAutopilotItem {
  id: string;
  path: string;
  lane_id: WorkbenchReviewLaneId;
  lane_label: string;
  risk_rank: number;
  risk_factors: string[];
  grouped_intent: string;
  source_events: string[];
  affected_files: string[];
  staged_claim_ids: string[];
  claim_diffs: WorkbenchReviewStagedClaim[];
  proof_previews: WorkbenchReviewProofPreview[];
  target_choices: string[];
  context_choices: string[];
  allowed_next_actions: WorkbenchReviewPreviewAction[];
  suggested_action: string;
}

export interface WorkbenchReviewAutopilotPreview {
  action: "review_autopilot_preview";
  created: false;
  batchApplyAllowed: false;
  selected_item_ids: string[];
  grouped_intent: string[];
  allowed_next_actions: Array<WorkbenchReviewPreviewAction & { item_id: string }>;
  warnings: string[];
  items: WorkbenchReviewAutopilotItem[];
}

export interface WorkbenchReviewLane {
  lane_id: WorkbenchReviewLaneId;
  label: string;
  count: number;
  item_ids: string[];
  suggested_action: string;
}

export interface WorkbenchReviewTurboItem extends WorkbenchReviewItem {
  lane_id: WorkbenchReviewLaneId;
  lane_label: string;
  review_priority: number;
  evidence_summary: string[];
  target_suggestions: string[];
  context_suggestions: string[];
  preview_actions: WorkbenchReviewPreviewAction[];
  staged_claims: WorkbenchReviewStagedClaim[];
  proof_previews: WorkbenchReviewProofPreview[];
}

export interface WorkbenchReviewProofPreview {
  proof_id: string;
  rule?: string;
  source_claim_ids: string[];
  source_events: string[];
}

export interface WorkbenchReviewPreviewAction {
  label: string;
  endpoint: string;
  note: string;
}

export interface WorkbenchReviewStagedClaim {
  claim_id: string;
  statement: string;
  claim_kind?: string;
  claim_state?: string;
  evidence_strength?: string;
  scope?: string | null;
  scope_state?: string;
  evidence: string[];
}

export interface WorkbenchTransactionList {
  items: WorkbenchTransactionSummary[];
}

export interface WorkbenchTransactionSummary {
  id: string;
  path: string;
  transaction_state: string;
  created_at?: string;
  source_events: string[];
  operations: string[];
  affected_files: string[];
  risk_level?: string;
  requires_review?: boolean;
}

export interface WorkbenchTransactionDetail extends WorkbenchTransactionSummary {
  body: string;
  content: string;
  intent?: string;
  rollback_notes?: string;
  application_log?: string;
  proposed_file_writes: WorkbenchTransactionFileWrite[];
  validation: ValidationResult;
}

export interface WorkbenchTransactionFileWrite {
  path: string;
  content: string;
}

export interface WorkbenchTransactionActionResult {
  action: "apply_transaction" | "reject_transaction";
  created: boolean;
  transaction_id: string;
  transaction_path: string;
  transaction_state: string;
  operations: string[];
  affected_files: string[];
  source_events: string[];
  proposed_file_writes: string[];
  validation: ValidationResult;
  risk_level?: string;
  requires_review?: boolean;
  reason?: string;
}

export interface WorkbenchFollowupList {
  items: WorkbenchFollowupSummary[];
  warnings: WorkbenchReadWarning[];
}

export interface WorkbenchFollowupSummary {
  id: string;
  path: string;
  object_state: string;
  review_state: string;
  followup_state: string;
  owner?: string;
  due_at?: string;
  source_events: string[];
  related: string[];
}

export type WorkbenchHealthSummary = MemoryHealthResult;
export type WorkbenchToday = TodayWorkbenchResult;
export type WorkbenchDailyQueue = DailyQueueResult;
export type WorkbenchDogfoodHome = DogfoodHomeResult;
export type WorkbenchActivationStatus = ActivationStatusResult;
export type WorkbenchSeedKitResult = SeedKitResult;
export type WorkbenchCaptureInbox = CaptureInboxResult;

export type WorkbenchBriefTargetOption = SessionBriefTarget;

export interface WorkbenchBriefTargetsResponse {
  kind: SessionBriefTargetKind;
  targets: WorkbenchBriefTargetOption[];
}

export interface WorkbenchReadWarning {
  path: string;
  message: string;
}

export interface WorkbenchServerOptions {
  root: string;
  host?: string;
  port?: number;
}

export interface RunningWorkbenchServer {
  server: Server;
  host: string;
  port: number;
  url: string;
  close: () => Promise<void>;
}

interface WorkbenchTransactionRecord {
  path: string;
  content: string;
  transaction: ParsedTransaction;
}

export type WorkbenchReviewResolutionAction =
  | "apply_staged_claim"
  | "mark_review_item"
  | "reprocess_event"
  | "stage_health_review";

export interface ReviewResolutionPreview {
  action: WorkbenchReviewResolutionAction;
  created: boolean;
  transaction_id: string;
  transaction_path: string;
  transaction_state: string;
  operations: string[];
  affected_files: string[];
  source_events: string[];
  proposed_file_writes: string[];
  risk_level?: string;
  requires_review?: boolean;
  review_id?: string;
  review_path?: string;
  event_id?: string;
  event_path?: string;
}

export async function createWorkbenchSnapshot(
  root: string,
  options: WorkbenchSnapshotOptions = {}
): Promise<WorkbenchSnapshot> {
  const [review, transactions, followups, ask, health] = await Promise.all([
    collectReviewInbox(root),
    collectTransactions(root),
    collectFollowups(root),
    options.query ? retrieveContextForAnswer(root, options.query) : Promise.resolve(null),
    options.includeHealth === false ? Promise.resolve(null) : checkMemoryHealth(root, { now: options.now })
  ]);

  return {
    generated_at: options.now ?? new Date().toISOString(),
    review,
    transactions,
    followups,
    health,
    ask
  };
}

export async function startWorkbenchServer(options: WorkbenchServerOptions): Promise<RunningWorkbenchServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3721;
  const server = createWorkbenchHttpServer(options.root, handleWorkbenchRoute);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : port;

  return {
    server,
    host,
    port: resolvedPort,
    url: `http://${formatHostForUrl(host)}:${resolvedPort}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}

export async function handleWorkbenchRoute(
  root: string,
  request: WorkbenchRouteRequest
): Promise<WorkbenchRouteResponse> {
  const method = request.method ?? "GET";
  const requestUrl = new URL(request.url, "http://127.0.0.1");

  if (method === "POST") {
    return handleWorkbenchPostRoute(root, requestUrl.pathname, request);
  }

  if (method !== "GET" && method !== "HEAD") {
    return jsonRoute(405, { error: "Unsupported method." });
  }

  const registeredRoute = findRoute(workbenchRoutes(), method, requestUrl.pathname);
  if (registeredRoute !== null) {
    return registeredRoute.handler({ root, request, requestUrl });
  }

  if (requestUrl.pathname === "/") {
    return textRoute(200, workbenchHtml(), "text/html; charset=utf-8");
  }

  if (requestUrl.pathname === "/assets/workbench.css") {
    return textRoute(200, workbenchCss(), "text/css; charset=utf-8");
  }

  if (requestUrl.pathname === "/assets/workbench.js") {
    return textRoute(200, workbenchClientJs(), "text/javascript; charset=utf-8");
  }

  if (requestUrl.pathname === "/api/snapshot") {
    return jsonRoute(200, await createWorkbenchSnapshot(root, { query: optionalQuery(requestUrl), includeHealth: false }));
  }

  if (requestUrl.pathname === "/api/source-inbox") {
    return jsonRoute(200, await listSourceInboxSessions(root));
  }

  if (requestUrl.pathname === "/api/source-inbox/hub") {
    return jsonRoute(200, await buildSourceCaptureHub(root));
  }

  if (requestUrl.pathname === "/api/source-inbox/search") {
    return jsonRoute(200, await searchSourceInboxUnits(root, sourceInboxSearchInputFromUrl(requestUrl)));
  }

  if (requestUrl.pathname === "/api/source-inbox/session") {
    const sessionId = requestUrl.searchParams.get("id");

    if (!sessionId) {
      return jsonRoute(400, { error: "Source Inbox session id is required." });
    }

    return jsonRoute(200, await readSourceInboxSession(root, sessionId));
  }

  if (requestUrl.pathname === "/api/today") {
    return jsonRoute(200, await buildTodayWorkbenchResult(root));
  }

  if (requestUrl.pathname === "/api/daily/queue") {
    return jsonRoute(200, await buildDailyQueueResult(root));
  }

  if (requestUrl.pathname === "/api/daily/session") {
    return jsonRoute(200, await readDailySession(root));
  }

  if (requestUrl.pathname === "/api/modes/morning") {
    return jsonRoute(200, await buildWorkdayModeResult(root, "morning"));
  }

  if (requestUrl.pathname === "/api/modes/end-day") {
    return jsonRoute(200, await buildWorkdayModeResult(root, "end-day"));
  }

  if (requestUrl.pathname === "/api/modes/meeting" || requestUrl.pathname === "/api/modes/after-meeting") {
    const target = requestUrl.searchParams.get("id") ?? requestUrl.searchParams.get("target") ?? undefined;
    const mode = requestUrl.pathname === "/api/modes/meeting" ? "meeting" : "after-meeting";

    if (!target?.trim()) {
      return jsonRoute(400, { error: `Missing target id for ${mode} mode.` });
    }

    try {
      return jsonRoute(200, await buildWorkdayModeResult(root, mode, { target }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (/not found/i.test(message)) {
        return jsonRoute(404, { error: message });
      }

      return jsonRoute(400, { error: message });
    }
  }

  if (requestUrl.pathname === "/api/dogfood/home") {
    return jsonRoute(200, await buildDogfoodHomeResult(root));
  }

  if (requestUrl.pathname === "/api/dogfood/control-room") {
    return jsonRoute(200, await buildDogfoodControlRoomResult(root));
  }

  if (requestUrl.pathname === "/api/dogfood/eval") {
    return jsonRoute(200, await runPersonalDogfoodEval(root, { questionsPath: optionalQuestionsPath(root, requestUrl) }));
  }

  if (requestUrl.pathname === "/api/activation/status") {
    return jsonRoute(200, await buildActivationStatusResult(root));
  }

  if (requestUrl.pathname === "/api/use-tomorrow") {
    return jsonRoute(200, await buildUseAssistoTomorrowResult(root));
  }

  if (requestUrl.pathname === "/api/capture/inbox") {
    return jsonRoute(200, await buildCaptureInboxResult(root));
  }

  if (requestUrl.pathname === "/api/capture/presets") {
    return jsonRoute(200, await listWorkdayCapturePresets(root));
  }

  if (requestUrl.pathname === "/api/import/session") {
    const sessionId = requestUrl.searchParams.get("id")?.trim();

    if (!sessionId) {
      return jsonRoute(400, { error: "Missing required query parameter: id." });
    }

    return jsonRoute(200, await readImportSession(root, sessionId));
  }

  if (requestUrl.pathname === "/api/import/assistant") {
    return jsonRoute(200, await buildImportAssistantResult(root));
  }

  if (requestUrl.pathname === "/api/review") {
    return jsonRoute(200, await collectReviewInbox(root));
  }

  if (requestUrl.pathname === "/api/review/turbo") {
    return jsonRoute(200, await collectReviewTurbo(root));
  }

  if (requestUrl.pathname === "/api/review/acceleration") {
    return jsonRoute(200, await collectReviewAcceleration(root));
  }

  if (requestUrl.pathname === "/api/review/throughput") {
    return jsonRoute(200, await collectReviewThroughput(root));
  }

  if (requestUrl.pathname === "/api/review/autopilot") {
    return jsonRoute(200, await collectReviewAutopilot(root));
  }

  if (requestUrl.pathname === "/api/review/next") {
    return jsonRoute(200, await collectReviewNext(root));
  }

  if (requestUrl.pathname === "/api/transactions") {
    return jsonRoute(200, await collectTransactions(root));
  }

  if (requestUrl.pathname === "/api/transactions/detail") {
    const transactionId = optionalTarget(requestUrl);

    if (!transactionId) {
      return jsonRoute(400, { error: "Missing required query parameter: id." });
    }

    try {
      return jsonRoute(200, await getTransactionDetail(root, transactionId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /^Transaction not found:/.test(message) ? 404 : 400;
      return jsonRoute(status, { error: message });
    }
  }

  if (requestUrl.pathname === "/api/ask/answer-contract") {
    const query = optionalQuery(requestUrl);
    return query
      ? jsonRoute(200, await retrieveCitedAnswerContract(root, query))
      : jsonRoute(400, { error: "Missing required query parameter: q." });
  }

  if (requestUrl.pathname === "/api/ask/contract-v3" || requestUrl.pathname === "/api/ask/answer-contract-v3") {
    const query = optionalQuery(requestUrl);
    return query
      ? jsonRoute(200, await retrieveCitedAnswerContractV3(root, query))
      : jsonRoute(400, { error: "Missing required query parameter: q." });
  }

  if (requestUrl.pathname === "/api/ask/contract-v4" || requestUrl.pathname === "/api/ask/answer-contract-v4") {
    const query = optionalQuery(requestUrl);
    return query
      ? jsonRoute(200, await retrieveCitedAnswerContractV4(root, query))
      : jsonRoute(400, { error: "Missing required query parameter: q." });
  }

  if (requestUrl.pathname === "/api/context-packs/build") {
    const kind = optionalContextPackKind(requestUrl);
    const target = optionalTarget(requestUrl) ?? optionalQuery(requestUrl);
    if (!kind) {
      return jsonRoute(400, { error: "Missing required query parameter: kind=task|person|context|meeting|debugging|agent-handoff." });
    }
    if (!target) {
      return jsonRoute(400, { error: "Missing required query parameter: target or q." });
    }
    return jsonRoute(200, await buildPortableContextPack(root, { kind, target }));
  }

  if (requestUrl.pathname === "/api/ask/session") {
    return jsonRoute(200, await buildAskSession(root, optionalQuery(requestUrl)));
  }

  if (requestUrl.pathname === "/api/followups") {
    return jsonRoute(200, await collectFollowups(root));
  }

  if (requestUrl.pathname === "/api/entities") {
    const kind = optionalEntityKind(requestUrl);

    if (!kind) {
      return jsonRoute(400, { error: "Missing required query parameter: kind=person|topic|context." });
    }

    return jsonRoute(200, { kind, items: await listEntities(root, kind) });
  }

  if (requestUrl.pathname === "/api/entities/stewardship") {
    const kind = optionalEntityKind(requestUrl);

    if (!kind) {
      return jsonRoute(400, { error: "Missing required query parameter: kind=person|topic|context." });
    }

    return jsonRoute(200, await buildEntityStewardshipResult(root, kind));
  }

  if (requestUrl.pathname === "/api/entities/stewardship-v2" || requestUrl.pathname === "/api/entities/command-center") {
    const kind = optionalEntityKind(requestUrl);

    if (!kind) {
      return jsonRoute(400, { error: "Missing required query parameter: kind=person|topic|context." });
    }

    return jsonRoute(200, await buildEntityStewardshipCommandCenter(root, kind));
  }

  if (requestUrl.pathname === "/api/entities/stewardship/detail") {
    const target = optionalTarget(requestUrl);

    if (!target) {
      return jsonRoute(400, { error: "Missing required query parameter: id." });
    }

    try {
      return jsonRoute(200, await getEntityDetail(root, target));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /^Entity not found:/.test(message) ? 404 : 400;
      return jsonRoute(status, { error: message });
    }
  }

  if (requestUrl.pathname === "/api/entities/detail") {
    const target = optionalTarget(requestUrl);

    if (!target) {
      return jsonRoute(400, { error: "Missing required query parameter: id." });
    }

    try {
      return jsonRoute(200, await getEntityDetail(root, target));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /^Entity not found:/.test(message) ? 404 : 400;
      return jsonRoute(status, { error: message });
    }
  }

  if (requestUrl.pathname === "/api/contexts/dashboard") {
    const target = optionalTarget(requestUrl);

    if (!target) {
      return jsonRoute(400, { error: "Missing required query parameter: id." });
    }

    try {
      return jsonRoute(200, await buildContextDashboardResult(root, target));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /^Entity not found:/.test(message) ? 404 : 400;
      return jsonRoute(status, { error: message });
    }
  }

  if (requestUrl.pathname === "/api/contexts/operating-room") {
    const target = optionalTarget(requestUrl);

    if (!target) {
      return jsonRoute(400, { error: "Missing required query parameter: id." });
    }

    try {
      return jsonRoute(200, await buildContextOperatingRoomResult(root, target));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /^Entity not found:/.test(message) ? 404 : 400;
      return jsonRoute(status, { error: message });
    }
  }

  if (requestUrl.pathname === "/api/contexts/operating-room-v3") {
    const target = optionalTarget(requestUrl);

    if (!target) {
      return jsonRoute(400, { error: "Missing required query parameter: id." });
    }

    try {
      return jsonRoute(200, await buildWorkbenchContextOperatingRoomV3(root, target));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /^Entity not found:/.test(message) ? 404 : 400;
      return jsonRoute(status, { error: message });
    }
  }

  if (requestUrl.pathname === "/api/contexts/timeline") {
    const target = optionalTarget(requestUrl);

    if (!target) {
      return jsonRoute(400, { error: "Missing required query parameter: id." });
    }

    try {
      return jsonRoute(200, await buildContextTimelineResult(root, target));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /^Entity not found:/.test(message) ? 404 : 400;
      return jsonRoute(status, { error: message });
    }
  }

  if (requestUrl.pathname === "/api/health") {
    return jsonRoute(200, await checkMemoryHealth(root));
  }

  if (requestUrl.pathname === "/api/maintenance/plan") {
    return jsonRoute(200, await buildMaintenancePlan(root, maintenanceOptionsFromUrl(requestUrl)));
  }

  if (requestUrl.pathname === "/api/maintenance/runs") {
    return jsonRoute(200, { runs: await listMaintenanceRuns(root) });
  }

  if (requestUrl.pathname === "/api/maintenance/run") {
    const target = optionalTarget(requestUrl);
    return target ? jsonRoute(200, await readMaintenanceRun(root, target)) : jsonRoute(400, { error: "Missing required query parameter: id." });
  }

  if (requestUrl.pathname === "/api/brief/targets") {
    const parsedKind = parseBriefTargetKind(requestUrl);
    const kind = parsedKind.kind;

    if (!kind) {
      return jsonRoute(400, { error: parsedKind.error });
    }

    const response: WorkbenchBriefTargetsResponse = {
      kind,
      targets: await listSessionBriefTargets(root, kind)
    };

    return jsonRoute(200, response);
  }

  if (requestUrl.pathname === "/api/brief") {
    const kind = optionalBriefKind(requestUrl);

    if (!kind) {
      return jsonRoute(400, { error: "Missing required query parameter: kind." });
    }

    const targetKind = optionalBriefTargetKind(requestUrl);

    if (targetKind.error) {
      return jsonRoute(400, { error: targetKind.error });
    }

    return jsonRoute(200, await buildSessionBrief(root, { kind, targetKind: targetKind.kind, target: optionalTarget(requestUrl) }));
  }

  return jsonRoute(404, { error: "Not found." });
}

function workbenchRoutes() {
  return [
    createAskRoute({
      jsonRoute,
      optionalQuery,
      retrieveContextForAnswer
    })
  ];
}

async function handleWorkbenchPostRoute(
  root: string,
  pathname: string,
  request: WorkbenchRouteRequest
): Promise<WorkbenchRouteResponse> {
  let input: Record<string, unknown>;

  try {
    input = parseJsonBody(request.body);
  } catch (error) {
    return jsonRoute(400, { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    if (pathname === "/api/capture/quick/preview") {
      return jsonRoute(200, await createWorkdayCapturePreview(root, input, false));
    }

    if (pathname === "/api/capture/quick") {
      return jsonRoute(200, await createWorkdayCapturePreview(root, input, true));
    }

    if (pathname === "/api/capture/preview") {
      return jsonRoute(200, await createCapturePreview(root, input, false));
    }

    if (pathname === "/api/capture") {
      return jsonRoute(200, await createCapturePreview(root, input, true));
    }

    if (pathname === "/api/capture/feedback/preview") {
      return jsonRoute(200, await createCaptureFeedbackPreview(root, input, false));
    }

    if (pathname === "/api/capture/feedback") {
      return jsonRoute(200, await createCaptureFeedbackPreview(root, input, true));
    }

    if (pathname === "/api/seed/preview") {
      return jsonRoute(200, await createSeedPreview(root, input, false));
    }

    if (pathname === "/api/seed/create") {
      return jsonRoute(200, await createSeedPreview(root, input, true));
    }

    if (pathname === "/api/import/preview") {
      return jsonRoute(200, await createImportPreview(root, input, false));
    }

    if (pathname === "/api/import") {
      return jsonRoute(200, await createImportPreview(root, input, true));
    }

    if (pathname === "/api/import/triage/preview") {
      return jsonRoute(200, await createImportTriagePreview(root, input, false));
    }

    if (pathname === "/api/import/triage") {
      return jsonRoute(200, await createImportTriagePreview(root, input, true));
    }

    if (pathname === "/api/source-inbox/preview") {
      return jsonRoute(200, await createSourceInboxPreview(root, input));
    }

    if (pathname === "/api/source-inbox/triage") {
      return jsonRoute(200, await createSourceInboxTriage(root, input));
    }

    if (pathname === "/api/source-inbox/create-events") {
      return jsonRoute(200, await createSourceInboxEvents(root, { session_id: requiredStringInput(input, "sessionId", "session_id", "session", "id") }));
    }

    if (pathname === "/api/source/import/preview") {
      return jsonRoute(200, await createSourceAdapterPreview(root, input, false));
    }

    if (pathname === "/api/source/import") {
      return jsonRoute(200, await createSourceAdapterPreview(root, input, true));
    }

    if (pathname === "/api/review/apply-staged/preview") {
      return jsonRoute(200, await createReviewApplyPreview(root, input, false));
    }

    if (pathname === "/api/review/apply-staged") {
      return jsonRoute(200, await createReviewApplyPreview(root, input, true));
    }

    if (pathname === "/api/review/mark/preview") {
      return jsonRoute(200, await createReviewMarkPreview(root, input, false));
    }

    if (pathname === "/api/review/mark") {
      return jsonRoute(200, await createReviewMarkPreview(root, input, true));
    }

    if (pathname === "/api/review/autopilot/preview") {
      return jsonRoute(200, await createReviewAutopilotPreview(root, input));
    }

    if (pathname === "/api/events/reprocess/preview") {
      return jsonRoute(200, await createEventReprocessPreview(root, input, false));
    }

    if (pathname === "/api/events/reprocess") {
      return jsonRoute(200, await createEventReprocessPreview(root, input, true));
    }

    if (pathname === "/api/ask/draft/preview") {
      return jsonRoute(200, await createAskDraftPreview(root, input));
    }

    if (pathname === "/api/ask/pin") {
      return jsonRoute(200, await pinAskQuestion(root, input));
    }

    if (pathname === "/api/ask/missing-memory/preview") {
      return jsonRoute(200, await createAskMissingMemoryPreview(root, input));
    }

    if (pathname === "/api/friction/log/preview") {
      return jsonRoute(200, await createFrictionLogPreview(root, input, false));
    }

    if (pathname === "/api/friction/log") {
      return jsonRoute(200, await createFrictionLogPreview(root, input, true));
    }

    if (pathname === "/api/dogfood/feedback/preview") {
      return jsonRoute(200, await createDogfoodFeedbackPreview(root, input, false));
    }

    if (pathname === "/api/dogfood/feedback") {
      return jsonRoute(200, await createDogfoodFeedbackPreview(root, input, true));
    }

    if (pathname === "/api/dogfood/eval/run") {
      return jsonRoute(200, await createDogfoodEvalRun(root, input));
    }

    if (pathname === "/api/daily/session") {
      return jsonRoute(200, await updateDailySession(root, input));
    }

    if (pathname === "/api/entities/alias/preview") {
      return jsonRoute(200, await createEntityAliasPreview(root, input, false));
    }

    if (pathname === "/api/entities/alias/stage") {
      return jsonRoute(200, await createEntityAliasPreview(root, input, true));
    }

    if (pathname === "/api/entities/context/preview") {
      return jsonRoute(200, await createEntityContextPreview(root, input, false));
    }

    if (pathname === "/api/entities/context/stage") {
      return jsonRoute(200, await createEntityContextPreview(root, input, true));
    }

    if (pathname === "/api/entities/repair-v2/preview") {
      return jsonRoute(200, await createEntityRepairActionV2(root, input, false));
    }

    if (pathname === "/api/entities/repair-v2/stage") {
      const result = await createEntityRepairActionV2(root, input, true);
      return jsonRoute(result.allowed === false ? 400 : 200, result);
    }

    if (pathname === "/api/entities/role/preview") {
      return jsonRoute(200, await createEntityClaimRepairPreview(root, input, "role", false));
    }

    if (pathname === "/api/entities/role/stage") {
      return jsonRoute(200, await createEntityClaimRepairPreview(root, input, "role", true));
    }

    if (pathname === "/api/entities/reporting/preview") {
      return jsonRoute(200, await createEntityClaimRepairPreview(root, input, "reporting", false));
    }

    if (pathname === "/api/entities/reporting/stage") {
      return jsonRoute(200, await createEntityClaimRepairPreview(root, input, "reporting", true));
    }

    if (pathname === "/api/entities/ownership/preview") {
      return jsonRoute(200, await createEntityClaimRepairPreview(root, input, "ownership", false));
    }

    if (pathname === "/api/entities/ownership/stage") {
      return jsonRoute(200, await createEntityClaimRepairPreview(root, input, "ownership", true));
    }

    if (pathname === "/api/entities/identity-review/preview") {
      return jsonRoute(200, await createEntityIdentityReviewPreview(root, input, false));
    }

    if (pathname === "/api/entities/identity-review/stage") {
      return jsonRoute(200, await createEntityIdentityReviewPreview(root, input, true));
    }

    if (pathname === "/api/entities/context-note/preview") {
      return jsonRoute(200, await createContextNotePreview(root, input, false));
    }

    if (pathname === "/api/entities/context-note/stage") {
      return jsonRoute(200, await createContextNotePreview(root, input, true));
    }

    if (pathname === "/api/health/stage-review/preview") {
      return jsonRoute(200, await createHealthStagePreview(root, input, false));
    }

    if (pathname === "/api/health/stage-review") {
      return jsonRoute(200, await createHealthStagePreview(root, input, true));
    }

    if (pathname === "/api/health/stage-finding/preview") {
      return jsonRoute(200, await createHealthFindingStagePreview(root, input, false));
    }

    if (pathname === "/api/health/stage-finding") {
      return jsonRoute(200, await createHealthFindingStagePreview(root, input, true));
    }

    if (pathname === "/api/maintenance/run") {
      return jsonRoute(200, await runMaintenance(root, maintenanceOptionsFromInput(input)));
    }

    if (pathname === "/api/maintenance/clear") {
      return jsonRoute(200, await clearMaintenanceRuns(root));
    }

    if (pathname === "/api/maintenance/stage-finding/preview") {
      return jsonRoute(200, await createMaintenanceFindingStagePreview(root, input, false));
    }

    if (pathname === "/api/maintenance/stage-finding") {
      return jsonRoute(200, await createMaintenanceFindingStagePreview(root, input, true));
    }

    if (pathname === "/api/transactions/apply/preview") {
      return jsonRoute(200, await createTransactionApplyPreview(root, input, false));
    }

    if (pathname === "/api/transactions/apply") {
      return jsonRoute(200, await createTransactionApplyPreview(root, input, true));
    }

    if (pathname === "/api/transactions/reject/preview") {
      return jsonRoute(200, await createTransactionRejectPreview(root, input, false));
    }

    if (pathname === "/api/transactions/reject") {
      return jsonRoute(200, await createTransactionRejectPreview(root, input, true));
    }

    return jsonRoute(405, { error: "Unsupported workbench write route." });
  } catch (error) {
    return jsonRoute(400, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function createWorkdayCapturePreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<WorkdayCapturePreview | WorkdayCaptureCreate> {
  const providerName = optionalStringInput(input, "provider") ?? "rule";
  const workdayInput = {
    preset_id: optionalStringInput(input, "preset", "presetId", "preset_id") ?? undefined,
    note: requiredStringInput(input, "note"),
    observed_at: optionalStringInput(input, "observedAt", "observed_at") ?? undefined,
    source_label: optionalStringInput(input, "sourceLabel", "source_label") ?? undefined,
    context: optionalStringInput(input, "context") ?? undefined,
    provider: providerName === "openai" ? ("openai" as const) : ("rule" as const),
    extractionProvider: captureProvider(providerName)
  };

  return created ? createWorkdayCapture(root, workdayInput) : previewWorkdayCapture(root, workdayInput);
}

async function createCapturePreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<CapturePreviewResult | CaptureCreateResult> {
  const note = requiredStringInput(input, "note");
  const options = {
    observed_at: optionalStringInput(input, "observedAt", "observed_at") ?? undefined,
    source_label: optionalStringInput(input, "sourceLabel", "source_label") ?? undefined,
    context: optionalStringInput(input, "context") ?? undefined,
    provider: captureProvider(optionalStringInput(input, "provider") ?? "rule")
  };

  return created ? createCaptureNote(root, note, options) : previewCaptureNote(root, note, options);
}

async function createSeedPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<SeedKitPreviewResult | SeedKitCreateResult> {
  const seedInput: SeedKitInput = {
    my_role: optionalStringArrayInput(input, "myRole", "my_role"),
    manager_team: optionalStringArrayInput(input, "managerTeam", "manager_team"),
    current_projects: optionalStringArrayInput(input, "currentProjects", "current_projects"),
    important_people: optionalStringArrayInput(input, "importantPeople", "important_people"),
    systems_topics: optionalStringArrayInput(input, "systemsTopics", "systems_topics"),
    open_loops: optionalStringArrayInput(input, "openLoops", "open_loops"),
    things_i_keep_forgetting: optionalStringArrayInput(input, "thingsIKeepForgetting", "things_i_keep_forgetting")
  };

  return created ? createSeedKit(root, seedInput) : previewSeedKit(root, seedInput);
}

async function createImportPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<ImportPreviewResult | ImportCreateResult> {
  const text = optionalStringInput(input, "text");
  const sourcePath = optionalStringInput(input, "path");
  const options = {
    observed_at: optionalStringInput(input, "observedAt", "observed_at") ?? undefined,
    source_label: optionalStringInput(input, "sourceLabel", "source_label") ?? undefined,
    provider: captureProvider(optionalStringInput(input, "provider") ?? "rule"),
    limit: optionalPositiveIntegerInput(input, "limit")
  };
  const importInput = {
    text,
    path: sourcePath,
    glob: optionalStringInput(input, "glob") ?? undefined,
    cwd: root
  };

  return created ? createImportNotes(root, importInput, options) : previewImportNotes(root, importInput, options);
}

async function createImportTriagePreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<ImportTriagePreviewResult | ImportTriageCreateResult> {
  const text = optionalStringInput(input, "text");
  const sourcePath = optionalStringInput(input, "path");
  const options = {
    observed_at: optionalStringInput(input, "observedAt", "observed_at") ?? undefined,
    source_label: optionalStringInput(input, "sourceLabel", "source_label") ?? undefined,
    provider: captureProvider(optionalStringInput(input, "provider") ?? "rule"),
    limit: optionalPositiveIntegerInput(input, "limit")
  };
  const importInput = {
    text,
    path: sourcePath,
    glob: optionalStringInput(input, "glob") ?? undefined,
    cwd: root,
    units: importTriageUnitsInput(input)
  };

  const result = created ? await createImportTriage(root, importInput, options) : await previewImportTriage(root, importInput, options);
  const session = await writeImportSession(root, result);
  return { ...result, session_id: session.session_id };
}


function sourceInboxSearchInputFromUrl(requestUrl: URL) {
  return {
    query: requestUrl.searchParams.get("query") ?? requestUrl.searchParams.get("q") ?? undefined,
    session_id: requestUrl.searchParams.get("session") ?? requestUrl.searchParams.get("id") ?? undefined,
    adapter_kind: requestUrl.searchParams.get("kind") ?? undefined,
    import_status: sourceInboxImportStatusParam(requestUrl.searchParams.get("import_status") ?? requestUrl.searchParams.get("status")),
    triage_state: sourceInboxTriageStateParam(requestUrl.searchParams.get("triage_state") ?? requestUrl.searchParams.get("triage")),
    duplicate_state: sourceInboxDuplicateStateParam(requestUrl.searchParams.get("duplicate_state") ?? requestUrl.searchParams.get("duplicate")),
    context: requestUrl.searchParams.get("context") ?? undefined,
    source_label: requestUrl.searchParams.get("source_label") ?? requestUrl.searchParams.get("sourceLabel") ?? undefined,
    limit: positiveIntegerParam(requestUrl.searchParams.get("limit"), "limit")
  };
}

function sourceInboxImportStatusParam(value: string | null): "previewed" | "triaged" | "events_created" | undefined {
  if (!value) return undefined;
  if (value === "previewed" || value === "triaged" || value === "events_created") return value;
  throw new Error("Source Inbox import status must be previewed, triaged, or events_created.");
}

function sourceInboxTriageStateParam(value: string | null): "untriaged" | "keep" | "skip" | "split" | "merge" | undefined {
  if (!value) return undefined;
  if (value === "untriaged" || value === "keep" || value === "skip" || value === "split" || value === "merge") return value;
  throw new Error("Source Inbox triage state must be untriaged, keep, skip, split, or merge.");
}

function sourceInboxDuplicateStateParam(value: string | null): "new" | "duplicate" | undefined {
  if (!value) return undefined;
  if (value === "new" || value === "duplicate") return value;
  throw new Error("Source Inbox duplicate state must be new or duplicate.");
}

function positiveIntegerParam(value: string | null, name: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(name + " must be a positive integer.");
  }
  return parsed;
}

async function createSourceInboxPreview(
  root: string,
  input: Record<string, unknown>
): Promise<SourceAdapterPreviewResult & { source_inbox_session: Awaited<ReturnType<typeof createSourceInboxSessionFromPreview>> }> {
  const adapterInput = sourceAdapterInputFromWorkbench(root, input, true);
  const preview = await previewSourceAdapterImport(adapterInput);
  const sourceInboxSession = await createSourceInboxSessionFromPreview(root, preview, {
    source_path: adapterInput.path,
    source_label: adapterInput.source_label
  });

  return { ...preview, source_inbox_session: sourceInboxSession };
}


async function createSourceInboxTriage(root: string, input: Record<string, unknown>) {
  return triageSourceInboxSession(root, {
    session_id: requiredStringInput(input, "sessionId", "session_id", "session", "id"),
    decisions: sourceInboxTriageDecisionsInput(input)
  });
}

function sourceInboxTriageDecisionsInput(input: Record<string, unknown>): SourceTriageDecision[] {
  const decisions = input.decisions;

  if (!Array.isArray(decisions)) {
    throw new Error("Source Inbox triage requires decisions[].");
  }

  return decisions.map((decision, index) => {
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
      throw new Error(`Source Inbox triage decision ${index + 1} must be an object.`);
    }

    return sourceInboxTriageDecisionInput(decision as Record<string, unknown>, index);
  });
}

function sourceInboxTriageDecisionInput(input: Record<string, unknown>, index: number): SourceTriageDecision {
  const action = optionalStringInput(input, "action") ?? "keep";
  const normalizedAction = sourceTriageActionInput(action, index);

  return {
    unit_id: requiredStringInput(input, "unitId", "unit_id"),
    action: normalizedAction,
    raw_text: optionalStringInput(input, "rawText", "raw_text", "text") ?? undefined,
    source_label: optionalStringInput(input, "sourceLabel", "source_label") ?? undefined,
    observed_at: optionalStringInput(input, "observedAt", "observed_at") ?? undefined,
    contexts: optionalStringArrayInput(input, "contexts") ?? undefined,
    context: optionalStringInput(input, "context") ?? undefined,
    source_spans: sourceSpanInputs(input.source_spans ?? input.sourceSpans),
    metadata: optionalStringRecordInput(input.metadata),
    note: optionalStringInput(input, "note") ?? undefined,
    split_units: sourceTriageDecisionUnitInputs(input.split_units ?? input.splitUnits),
    merge_with_unit_id: optionalStringInput(input, "mergeWithUnitId", "merge_with_unit_id") ?? undefined
  };
}

function sourceTriageActionInput(value: string, index: number): SourceTriageDecisionAction {
  if (value === "keep" || value === "skip" || value === "split" || value === "merge" || value === "edit_metadata") {
    return value;
  }

  throw new Error(`Source Inbox triage decision ${index + 1} has unsupported action: ${value}.`);
}

function sourceTriageDecisionUnitInputs(value: unknown): SourceTriageDecisionUnitInput[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error("Source Inbox split_units must be an array.");
  }

  return value.map((unit, index) => {
    if (!unit || typeof unit !== "object" || Array.isArray(unit)) {
      throw new Error(`Source Inbox split unit ${index + 1} must be an object.`);
    }

    const record = unit as Record<string, unknown>;
    return {
      unit_id: optionalStringInput(record, "unitId", "unit_id") ?? undefined,
      raw_text: requiredStringInput(record, "rawText", "raw_text", "text"),
      source_label: optionalStringInput(record, "sourceLabel", "source_label") ?? undefined,
      observed_at: optionalStringInput(record, "observedAt", "observed_at") ?? undefined,
      contexts: optionalStringArrayInput(record, "contexts") ?? undefined,
      context: optionalStringInput(record, "context") ?? undefined,
      source_spans: sourceSpanInputs(record.source_spans ?? record.sourceSpans),
      metadata: optionalStringRecordInput(record.metadata),
      note: optionalStringInput(record, "note") ?? undefined
    };
  });
}

function sourceSpanInputs(value: unknown): SourceSpan[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error("source_spans must be an array.");
  }

  return value.map((span, index) => {
    if (!span || typeof span !== "object" || Array.isArray(span)) {
      throw new Error(`source_spans[${index}] must be an object.`);
    }

    const record = span as Record<string, unknown>;
    return {
      source_path: optionalStringInput(record, "sourcePath", "source_path") ?? undefined,
      start_line: optionalNumberInput(record, "startLine", "start_line"),
      end_line: optionalNumberInput(record, "endLine", "end_line"),
      start_offset: optionalNumberInput(record, "startOffset", "start_offset"),
      end_offset: optionalNumberInput(record, "endOffset", "end_offset"),
      label: optionalStringInput(record, "label") ?? undefined
    };
  });
}

function optionalStringRecordInput(value: unknown): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("metadata must be an object.");
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [key, typeof item === "string" ? item.trim() : String(item ?? "").trim()] as const)
    .filter(([, item]) => item.length > 0);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function optionalNumberQuery(requestUrl: URL, key: string): number | undefined {
  const value = requestUrl.searchParams.get(key);

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalNumberInput(input: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = input[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

async function createSourceAdapterPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<SourceAdapterPreviewResult | SourceAdapterCreateResult> {
  const adapterInput = sourceAdapterInputFromWorkbench(root, input, !created);

  return created ? createSourceAdapterImport(adapterInput) : previewSourceAdapterImport(adapterInput);
}

function sourceAdapterInputFromWorkbench(root: string, input: Record<string, unknown>, dryRun: boolean) {
  return {
    kind: sourceAdapterKindInput(input),
    root,
    text: undefined,
    path: optionalStringInput(input, "path") ?? undefined,
    rawText: optionalStringInput(input, "rawText", "raw_text", "text") ?? undefined,
    source_label: optionalStringInput(input, "sourceLabel", "source_label") ?? undefined,
    observed_at: optionalStringInput(input, "observedAt", "observed_at") ?? undefined,
    context: optionalStringInput(input, "context") ?? undefined,
    limit: optionalPositiveIntegerInput(input, "limit"),
    dryRun
  };
}

function sourceAdapterKindInput(input: Record<string, unknown>): SourceAdapterKind {
  const value = optionalStringInput(input, "kind");

  if (
    value === "markdown" ||
    value === "text" ||
    value === "email" ||
    value === "calendar" ||
    value === "chat" ||
    value === "eml" ||
    value === "mbox" ||
    value === "ics" ||
    value === "slack_json" ||
    value === "teams_json" ||
    value === "github_json" ||
    value === "tracker_csv" ||
    value === "repo_markdown" ||
    value === "web_clip_text" ||
    value === "browser_note" ||
    value === "local_snippet"
  ) {
    return value;
  }

  throw new Error("Source adapter import requires a supported source adapter kind.");
}

interface ImportSessionRecord {
  session_id: string;
  created_at: string;
  result: ImportTriagePreviewResult | ImportTriageCreateResult;
}

async function writeImportSession(
  root: string,
  result: ImportTriagePreviewResult | ImportTriageCreateResult
): Promise<ImportSessionRecord> {
  const sessionId = `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const record: ImportSessionRecord = {
    session_id: sessionId,
    created_at: new Date().toISOString(),
    result: { ...result, session_id: sessionId }
  };
  const sessionPath = importSessionPath(root, sessionId);
  await mkdir(path.dirname(sessionPath), { recursive: true });
  await writeFile(sessionPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}

async function readImportSession(root: string, sessionId: string): Promise<ImportSessionRecord> {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error("Import session id must be alphanumeric with dashes or underscores.");
  }

  return JSON.parse(await readFile(importSessionPath(root, sessionId), "utf8")) as ImportSessionRecord;
}

function importSessionPath(root: string, sessionId: string): string {
  return path.join(root, ".assisto-local", "import-sessions", `${sessionId}.json`);
}

async function readPinnedQuestions(root: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(askQuestionsPath(root), "utf8")) as { questions?: unknown };
    return Array.isArray(parsed.questions)
      ? parsed.questions.filter((question): question is string => typeof question === "string" && question.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function askQuestionsPath(root: string): string {
  return path.join(root, ".assisto-local", "retrieval", "questions.json");
}

function buildCitationExplorer(basis: WorkbenchAskBasis): WorkbenchAskCitationExplorer {
  const claims = [
    ...(basis.answerCandidates ?? []).map((candidate) => candidate.claim_id),
    ...(basis.supportingClaims ?? []).map((claim) => claim.claim_id),
    ...(basis.uncertainClaims ?? []).map((claim) => claim.claim_id)
  ];
  const evidence = [
    ...(basis.evidenceEvents ?? []).map((event) => event.id),
    ...(basis.supportingClaims ?? []).flatMap((claim) => claim.evidence ?? []),
    ...(basis.answerCandidates ?? []).flatMap((candidate) => candidate.evidence ?? [])
  ];

  return {
    claim_ids: uniqueStrings(claims),
    event_ids: uniqueStrings(evidence.filter((value): value is string => typeof value === "string")),
    page_paths: uniqueStrings([
      ...(basis.matchedPages ?? []).map((page) => page.path),
      ...(basis.supportingClaims ?? []).map((claim) => claim.page_path),
      ...(basis.answerCandidates ?? []).map((candidate) => candidate.page_path)
    ]),
    review_item_ids: uniqueStrings((basis.linkedReviewItems ?? []).map((item) => item.id).filter((value): value is string => typeof value === "string")),
    followup_ids: uniqueStrings((basis.linkedFollowUps ?? []).map((item) => item.id).filter((value): value is string => typeof value === "string")),
    proof_ids: uniqueStrings((basis.directAnswers ?? []).flatMap((answer) => (answer as { proof_paths?: Array<{ proof_id: string }> }).proof_paths?.map((proof) => proof.proof_id) ?? []))
  };
}

function emptyCitationExplorer(): WorkbenchAskCitationExplorer {
  return {
    claim_ids: [],
    event_ids: [],
    page_paths: [],
    review_item_ids: [],
    followup_ids: [],
    proof_ids: []
  };
}

function matchedPagePreviews(basis: WorkbenchAskBasis): WorkbenchAskPagePreview[] {
  const loadedPages = "pages" in basis ? basis.pages ?? [] : [];
  return (basis.matchedPages ?? []).map((page) => {
    const loaded = loadedPages.find((candidate) => candidate.path === page.path);
    return {
      path: page.path,
      id: page.id,
      name: page.name,
      type: page.type,
      why_included: page.whyIncluded,
      content_preview: compactWorkbenchPreview(loaded?.body ?? loaded?.content ?? "")
    };
  });
}

async function sourceEventPreviews(root: string, basis: WorkbenchAskBasis): Promise<WorkbenchAskEventPreview[]> {
  const loadedEvents = "events" in basis ? basis.events ?? [] : [];
  return Promise.all(
    (basis.evidenceEvents ?? []).map(async (event) => {
      const loaded = loadedEvents.find((candidate) => candidate.path === event.path);
      let body = loaded?.body ?? "";

      if (!body) {
        try {
          body = parseMarkdownFile(await readMarkdownPage(root, event.path)).body;
        } catch {
          body = "";
        }
      }

      return {
        path: event.path,
        id: event.id,
        recorded_at: event.recorded_at,
        observed_at: event.observed_at,
        why_included: event.why_included,
        raw_text_preview: compactWorkbenchPreview(markdownSection(body, "Raw text") ?? body)
      };
    })
  );
}

function missingMemoryActions(basis: WorkbenchAskBasis): WorkbenchAskMissingMemoryAction[] {
  const actions = "manualActions" in basis ? basis.manualActions ?? [] : basis.repairActions ?? [];
  if (!(basis.missingInformation ?? []).length && !actions.some((action) => action.action === "log_friction")) {
    return [];
  }

  return [
    {
      action: "capture_note",
      label: "Capture missing memory",
      endpoint: "/api/capture",
      preview_endpoint: "/api/capture/preview",
      note: "Route a source-backed note through capture if this fact should become memory."
    },
    {
      action: "log_retrieval_miss",
      label: "Log retrieval miss",
      endpoint: "/api/friction/log",
      preview_endpoint: "/api/ask/missing-memory/preview",
      note: "Record the miss as Event evidence plus a pending NOOP Transaction."
    }
  ];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function compactWorkbenchPreview(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 320);
}

function markdownSection(body: string, heading: string): string | undefined {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const headingIndex = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`);

  if (headingIndex === -1) {
    return undefined;
  }

  const sectionLines: string[] = [];

  for (const line of lines.slice(headingIndex + 1)) {
    if (/^#{1,6}\s+/.test(line)) {
      break;
    }

    sectionLines.push(line);
  }

  return sectionLines.join("\n").trim();
}

function importTriageUnitsInput(input: Record<string, unknown>): ImportTriageUnitInput[] | undefined {
  const units = input.units;

  if (!Array.isArray(units)) {
    return undefined;
  }

  return units.map((unit, index) => {
    if (!unit || typeof unit !== "object" || Array.isArray(unit)) {
      throw new Error(`Import triage unit ${index + 1} must be an object.`);
    }

    const record = unit as Record<string, unknown>;

    const action = optionalStringInput(record, "action") === "skip" ? "skip" : "keep";

    return {
      unit_id: optionalStringInput(record, "unit_id", "unitId") ?? `unit_${index + 1}`,
      action,
      raw_text: requiredStringInput(record, "raw_text", "rawText", "text"),
      source_path: optionalStringInput(record, "source_path", "sourcePath") ?? undefined,
      source_label: optionalStringInput(record, "source_label", "sourceLabel") ?? undefined,
      observed_at: optionalStringInput(record, "observed_at", "observedAt") ?? undefined,
      context: optionalStringInput(record, "context") ?? undefined
    };
  });
}

function captureProvider(name: string): ExtractionProvider | undefined {
  if (name === "rule") {
    return undefined;
  }

  if (name === "openai") {
    return createOpenAiExtractionProvider();
  }

  throw new Error("Capture provider must be rule or openai.");
}

async function createReviewApplyPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<ReviewResolutionPreview> {
  const reviewId = requiredStringInput(input, "reviewId", "review_id", "id");
  const target = requiredStringInput(input, "target");
  const options = {
    target,
    context: optionalStringInput(input, "context"),
    createContext: optionalStringInput(input, "createContext", "create_context"),
    supersede: optionalStringInput(input, "supersede"),
    note: optionalStringInput(input, "note")
  };
  const result = created
    ? await createReviewApplyTransaction(root, reviewId, options)
    : await withPreviewRoot(root, (previewRoot) => createReviewApplyTransaction(previewRoot, reviewId, options));

  return reviewTransactionPreview("apply_staged_claim", result, created);
}

async function createReviewMarkPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<ReviewResolutionPreview> {
  const reviewId = requiredStringInput(input, "reviewId", "review_id", "id");
  const state = reviewActionStateInput(input);
  const note = optionalStringInput(input, "note");
  const result = created
    ? await createReviewStateTransaction(root, reviewId, state, { note })
    : await withPreviewRoot(root, (previewRoot) => createReviewStateTransaction(previewRoot, reviewId, state, { note }));

  return reviewTransactionPreview("mark_review_item", result, created);
}

async function createEventReprocessPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<ReviewResolutionPreview> {
  if (input.stageOnly !== true && input.stage_only !== true) {
    throw new Error("Event reprocess requires stageOnly true.");
  }

  const eventId = requiredStringInput(input, "eventId", "event_id", "id");
  const result = created
    ? await reprocessEvent(root, eventId)
    : await withPreviewRoot(root, (previewRoot) => reprocessEvent(previewRoot, eventId));

  return ingestTransactionPreview("reprocess_event", result, created);
}

async function createAskDraftPreview(root: string, input: Record<string, unknown>): Promise<AnswerDraftResult> {
  const question = requiredStringInput(input, "question", "q");
  return previewAnswerDraft(root, question);
}

async function buildAskSession(root: string, query?: string): Promise<WorkbenchAskSession> {
  const basis = query ? await retrieveCitedAnswerContractV3(root, query) : null;
  return {
    generated_at: new Date().toISOString(),
    query: basis?.query ?? query,
    basis,
    pinned_questions: await readPinnedQuestions(root),
    citation_explorer: basis ? buildCitationExplorer(basis) : emptyCitationExplorer(),
    matched_page_previews: basis ? matchedPagePreviews(basis) : [],
    source_event_previews: basis ? await sourceEventPreviews(root, basis) : [],
    missing_memory_actions: basis ? missingMemoryActions(basis) : []
  };
}

async function pinAskQuestion(root: string, input: Record<string, unknown>): Promise<{ pinned_questions: string[] }> {
  const question = requiredStringInput(input, "question", "q");
  const existing = await readPinnedQuestions(root);
  const pinned = [question, ...existing.filter((item) => item.toLowerCase() !== question.toLowerCase())].slice(0, 25);
  const filePath = askQuestionsPath(root);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ updated_at: new Date().toISOString(), questions: pinned }, null, 2)}\n`, "utf8");
  return { pinned_questions: pinned };
}

async function createAskMissingMemoryPreview(
  root: string,
  input: Record<string, unknown>
): Promise<FrictionLogPreviewResult> {
  const question = requiredStringInput(input, "question", "q");
  const note = optionalStringInput(input, "note") ?? `Memory could not answer: ${question}`;
  return previewFrictionLog(root, {
    kind: "retrieval_miss",
    question,
    note
  });
}

async function createFrictionLogPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<FrictionLogPreviewResult | FrictionLogCreateResult> {
  const frictionInput = {
    kind: requiredStringInput(input, "kind"),
    note: requiredStringInput(input, "note"),
    question: optionalStringInput(input, "question", "q") ?? undefined
  };

  return created ? createFrictionLog(root, frictionInput) : previewFrictionLog(root, frictionInput);
}

async function createDogfoodFeedbackPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<DogfoodFeedbackPreviewResult | DogfoodFeedbackCreateResult> {
  const feedbackInput = {
    kind: requiredStringInput(input, "kind"),
    note: requiredStringInput(input, "note"),
    question: optionalStringInput(input, "question", "q") ?? undefined
  };

  return created ? createDogfoodFeedback(root, feedbackInput) : previewDogfoodFeedbackTransaction(root, feedbackInput);
}

async function createCaptureFeedbackPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<CaptureFeedbackPreviewResult | CaptureFeedbackCreateResult> {
  const feedbackInput = {
    kind: requiredStringInput(input, "kind"),
    note: requiredStringInput(input, "note"),
    event: optionalStringInput(input, "event") ?? undefined,
    transaction: optionalStringInput(input, "transaction") ?? undefined
  };

  return created ? createCaptureFeedback(root, feedbackInput) : previewCaptureFeedback(root, feedbackInput);
}

async function createDogfoodEvalRun(root: string, input: Record<string, unknown>): Promise<PersonalDogfoodEvalResult> {
  const questionsPath = optionalStringInput(input, "questionsPath", "questions_path");
  return runPersonalDogfoodEval(root, {
    questionsPath: questionsPath ? path.resolve(root, questionsPath) : undefined
  });
}

async function buildWorkbenchContextOperatingRoomV3(root: string, target: string) {
  const room = await buildContextOperatingRoomResult(root, target);
  const symbolicIndex = await buildSymbolicIndex({ root });
  const claims = uniqueContextRoomClaims([
    ...room.currentState,
    ...room.decisions,
    ...room.openQuestions,
    ...room.staleClaims
  ]);
  const claimIds = new Set(claims.map((claim) => claim.claim_id));
  const symbolicFacts = symbolicIndex.derived_facts
    .filter((fact) => fact.source_claim_ids.some((claimId) => claimIds.has(claimId)) || fact.relation.includes("system"))
    .map((fact) => ({
      fact_id: fact.fact_id,
      relation: fact.relation,
      source_events: fact.source_events
    }));
  const result = buildContextOperatingRoomV3({
    context: {
      id: room.context.id ?? room.context.path,
      name: room.context.name
    },
    claims: claims.map((claim) => ({
      claim_id: claim.claim_id,
      text: claim.statement,
      source_events: claim.evidence
    })),
    symbolicFacts,
    reviewItems: room.reviewQueue,
    followUps: room.followupQueue
  });

  return {
    version: "context-operating-room-v3",
    generated_at: room.generated_at,
    ...result,
    citations: room.citations,
    warnings: uniqueStrings([
      ...room.warnings,
      "Context operating room v3 is derived from claims, reviews, follow-ups, and symbolic facts.",
      "No canonical memory files were written."
    ])
  };
}

function uniqueContextRoomClaims(claims: EntityClaimSummary[]): EntityClaimSummary[] {
  const seen = new Set<string>();
  const output: EntityClaimSummary[] = [];

  for (const claim of claims) {
    if (seen.has(claim.claim_id)) {
      continue;
    }

    seen.add(claim.claim_id);
    output.push(claim);
  }

  return output;
}

async function createEntityAliasPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<EntityStewardshipPreview> {
  const id = requiredStringInput(input, "id", "entityId", "entity_id");
  const alias = requiredStringInput(input, "alias");
  const note = optionalStringInput(input, "note");
  const result = created
    ? await createEntityAliasTransaction(root, id, alias, { note })
    : await withPreviewRoot(root, (previewRoot) => createEntityAliasTransaction(previewRoot, id, alias, { note }));

  return {
    ...result,
    created
  };
}

async function createEntityContextPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<EntityStewardshipPreview> {
  const id = requiredStringInput(input, "id", "entityId", "entity_id");
  const context = requiredStringInput(input, "context");
  const note = optionalStringInput(input, "note");
  const result = created
    ? await createEntityContextTransaction(root, id, context, { note })
    : await withPreviewRoot(root, (previewRoot) => createEntityContextTransaction(previewRoot, id, context, { note }));

  return {
    ...result,
    created
  };
}

async function createEntityRepairActionV2(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<EntityRepairActionV2Preview | (EntityRepairActionV2Preview & { created: true; staged: EntityStewardshipPreview })> {
  const kind = requiredEntityRepairActionV2Kind(input);
  const id = requiredStringInput(input, "id", "entityId", "entity_id");
  const note = optionalStringInput(input, "note") ?? undefined;
  const newTargetId = optionalStringInput(input, "newTargetId", "new_target_id", "target") ?? undefined;
  const alias = optionalStringInput(input, "alias") ?? undefined;
  const statement = optionalStringInput(input, "statement") ?? undefined;
  const supersedeClaimId = optionalStringInput(input, "supersede", "supersedeClaimId", "supersede_claim_id") ?? undefined;
  const preview = previewEntityRepairActionV2({
    kind,
    entityId: id,
    newTargetId,
    statement,
    alias,
    supersedeClaimId,
    note
  });

  if (!created || !preview.allowed) {
    return preview;
  }

  const staged = await stageEntityRepairActionV2(root, input, kind, id, { alias, statement, newTargetId, note, supersedeClaimId });
  return {
    ...preview,
    created: true,
    staged
  };
}

function requiredEntityRepairActionV2Kind(input: Record<string, unknown>): EntityRepairActionV2Kind {
  const kind = requiredStringInput(input, "kind");
  if (kind === "alias" || kind === "role" || kind === "reporting" || kind === "ownership" || kind === "identity_review") {
    return kind;
  }

  throw new Error("Repair action kind must be alias, role, reporting, ownership, or identity_review.");
}

async function stageEntityRepairActionV2(
  root: string,
  input: Record<string, unknown>,
  kind: EntityRepairActionV2Kind,
  id: string,
  values: { alias?: string; statement?: string; newTargetId?: string; note?: string; supersedeClaimId?: string }
): Promise<EntityStewardshipPreview> {
  if (kind === "alias") {
    return createEntityAliasPreview(root, {
      ...input,
      id,
      alias: values.alias ?? values.newTargetId,
      note: values.note
    }, true);
  }

  if (kind === "identity_review") {
    return createEntityIdentityReviewPreview(root, {
      ...input,
      id,
      note: values.note,
      reason: values.note ?? "Needs identity review."
    }, true);
  }

  return createEntityClaimRepairPreview(root, {
    ...input,
    id,
    statement: values.statement ?? entityRepairActionV2Statement(kind, id, values.newTargetId),
    note: values.note,
    supersedeClaimId: values.supersedeClaimId
  }, kind, true);
}

function entityRepairActionV2Statement(kind: Exclude<EntityRepairActionV2Kind, "alias" | "identity_review">, id: string, target?: string): string {
  const normalizedTarget = target ?? "the selected target";
  if (kind === "reporting") {
    return id + " reports to " + normalizedTarget + ".";
  }

  if (kind === "ownership") {
    return id + " owns " + normalizedTarget + ".";
  }

  return id + " role is " + normalizedTarget + ".";
}

async function createEntityClaimRepairPreview(
  root: string,
  input: Record<string, unknown>,
  kind: "role" | "reporting" | "ownership",
  created: boolean
): Promise<EntityStewardshipPreview> {
  const id = requiredStringInput(input, "id", "entityId", "entity_id");
  const statement = requiredStringInput(input, "statement");
  const note = optionalStringInput(input, "note");
  const context = optionalStringInput(input, "context") ?? undefined;
  const supersedeClaimId = optionalStringInput(input, "supersede", "supersedeClaimId", "supersede_claim_id") ?? undefined;
  const options = { note, context, supersedeClaimId };
  const createRepair =
    kind === "role"
      ? createEntityRoleTransaction
      : kind === "reporting"
        ? createEntityReportingTransaction
        : createEntityOwnershipTransaction;
  const result = created
    ? await createRepair(root, id, statement, options)
    : await withPreviewRoot(root, (previewRoot) => createRepair(previewRoot, id, statement, options));

  return {
    ...result,
    created
  };
}

async function createEntityIdentityReviewPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<EntityStewardshipPreview> {
  const id = requiredStringInput(input, "id", "entityId", "entity_id");
  const note = optionalStringInput(input, "note");
  const reason = optionalStringInput(input, "reason") ?? note ?? "Needs identity review.";
  const result = created
    ? await createEntityIdentityReviewTransaction(root, id, { reason, note })
    : await withPreviewRoot(root, (previewRoot) => createEntityIdentityReviewTransaction(previewRoot, id, { reason, note }));

  return {
    ...result,
    created
  };
}

async function createContextNotePreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<ContextNoteResult> {
  const id = requiredStringInput(input, "id", "entityId", "entity_id");
  const note = requiredStringInput(input, "note");
  const noteType = optionalContextNoteType(input);
  const result = created
    ? await createContextNoteTransaction(root, id, note, { noteType })
    : await withPreviewRoot(root, (previewRoot) => createContextNoteTransaction(previewRoot, id, note, { noteType }));

  return {
    ...result,
    created
  };
}

function maintenanceOptionsFromUrl(requestUrl: URL) {
  const mode = requestUrl.searchParams.get("mode") ?? "full";
  return {
    mode: isMaintenanceMode(mode) ? mode : "full",
    seed: requestUrl.searchParams.get("seed") ?? undefined,
    topic: requestUrl.searchParams.get("topic") ?? undefined,
    limit: optionalNumberQuery(requestUrl, "limit")
  };
}

function maintenanceOptionsFromInput(input: Record<string, unknown>) {
  const mode = optionalStringInput(input, "mode") ?? "full";
  return {
    mode: isMaintenanceMode(mode) ? mode : "full",
    seed: optionalStringInput(input, "seed") ?? undefined,
    topic: optionalStringInput(input, "topic") ?? undefined,
    limit: optionalNumberInput(input, "limit")
  };
}

function isMaintenanceMode(value: string): value is MaintenanceMode {
  return value === "changed" || value === "random" || value === "topic" || value === "full";
}

async function createMaintenanceFindingStagePreview(root: string, input: Record<string, unknown>, created: boolean) {
  const findingId = requiredStringInput(input, "findingId", "finding_id", "id");
  const note = optionalStringInput(input, "note");
  const createOne = async (targetRoot: string) => stageMaintenanceFinding(targetRoot, findingId, { note });
  const result = created ? await createOne(root) : await withPreviewRoot(root, (previewRoot) => createOne(previewRoot));
  return { ...result, created };
}
async function createHealthStagePreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<ReviewResolutionPreview> {
  const note = optionalStringInput(input, "note");
  const result = created
    ? await createHealthReviewTransaction(root, await checkMemoryHealth(root), { note })
    : await withPreviewRoot(root, async (previewRoot) =>
        createHealthReviewTransaction(previewRoot, await checkMemoryHealth(previewRoot), { note })
      );

  return healthTransactionPreview("stage_health_review", result, created);
}

async function createHealthFindingStagePreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<ReviewResolutionPreview> {
  const findingId = requiredStringInput(input, "findingId", "finding_id", "id");
  const note = optionalStringInput(input, "note");
  const createOneFindingTransaction = async (targetRoot: string) => {
    const health = await checkMemoryHealth(targetRoot);
    return createHealthReviewTransaction(targetRoot, healthForOneFinding(health, findingId), { note });
  };
  const result = created
    ? await createOneFindingTransaction(root)
    : await withPreviewRoot(root, (previewRoot) => createOneFindingTransaction(previewRoot));

  return healthTransactionPreview("stage_health_review", result, created);
}

function healthForOneFinding(health: MemoryHealthResult, findingId: string): MemoryHealthResult {
  const finding = health.findings.find((item) => item.finding_id === findingId);

  if (!finding) {
    throw new Error(`Health finding not found: ${findingId}`);
  }

  return {
    ...health,
    findings: [finding],
    affected_files: [...new Set(finding.affected_files)].sort(),
    source_events: [...new Set(finding.source_events)].sort(),
    suggested_actions: [finding.suggested_action]
  };
}

async function createTransactionApplyPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<WorkbenchTransactionActionResult> {
  const record = await findTransaction(root, requiredStringInput(input, "id", "transactionId", "transaction_id", "path"));
  ensurePendingTransaction(record.transaction);
  const validation = await validateTransaction(root, record.transaction);

  if (created) {
    if (!validation.passed) {
      throw new Error(`Transaction validation failed with ${validation.errors.length} error(s).`);
    }

    await applyTransaction(root, record.transaction.id);
    return transactionActionResult(
      "apply_transaction",
      await readTransactionAt(root, transactionFilePaths.applied(record.transaction.id)),
      true,
      validation
    );
  }

  return transactionActionResult("apply_transaction", record, false, validation);
}

async function createTransactionRejectPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<WorkbenchTransactionActionResult> {
  const record = await findTransaction(root, requiredStringInput(input, "id", "transactionId", "transaction_id", "path"));
  ensurePendingTransaction(record.transaction);
  const reason = requiredStringInput(input, "reason", "note");
  const validation = await validateTransaction(root, record.transaction);

  if (created) {
    await rejectTransaction(root, record.transaction.id, reason);
    return transactionActionResult(
      "reject_transaction",
      await readTransactionAt(root, transactionFilePaths.rejected(record.transaction.id)),
      true,
      validation,
      reason
    );
  }

  return transactionActionResult("reject_transaction", record, false, validation, reason);
}

function reviewTransactionPreview(
  action: WorkbenchReviewResolutionAction,
  result: ReviewStateTransactionResult,
  created: boolean
): ReviewResolutionPreview {
  return {
    ...transactionPreviewFields(action, result.transaction, result.transaction_path, created),
    review_id: result.review_id,
    review_path: result.review_path
  };
}

function ingestTransactionPreview(
  action: WorkbenchReviewResolutionAction,
  result: IngestNoteResult,
  created: boolean
): ReviewResolutionPreview {
  return {
    ...transactionPreviewFields(action, result.transaction, result.transaction_path, created),
    event_id: result.event_id,
    event_path: result.event_path
  };
}

function healthTransactionPreview(
  action: WorkbenchReviewResolutionAction,
  result: HealthReviewTransactionResult,
  created: boolean
): ReviewResolutionPreview {
  return transactionPreviewFields(action, result.transaction, result.transaction_path, created);
}

function transactionPreviewFields(
  action: WorkbenchReviewResolutionAction,
  transaction: ParsedTransaction,
  transactionPath: string,
  created: boolean
): ReviewResolutionPreview {
  return {
    action,
    created,
    transaction_id: transaction.id,
    transaction_path: transactionPath,
    transaction_state: transaction.transaction_state,
    operations: transaction.operations.map((operation) => operation.operation),
    affected_files: transaction.affected_files,
    source_events: transaction.source_events,
    proposed_file_writes: transaction.proposed_file_writes.map((write) => write.path),
    risk_level: transaction.risk_level,
    requires_review: transaction.requires_review
  };
}

function transactionActionResult(
  action: WorkbenchTransactionActionResult["action"],
  record: WorkbenchTransactionRecord,
  created: boolean,
  validation: ValidationResult,
  reason?: string
): WorkbenchTransactionActionResult {
  return {
    action,
    created,
    transaction_id: record.transaction.id,
    transaction_path: record.path,
    transaction_state: record.transaction.transaction_state,
    operations: record.transaction.operations.map((operation) => operation.operation),
    affected_files: record.transaction.affected_files,
    source_events: record.transaction.source_events,
    proposed_file_writes: record.transaction.proposed_file_writes.map((write) => write.path),
    validation,
    risk_level: record.transaction.risk_level,
    requires_review: record.transaction.requires_review,
    reason
  };
}

async function withPreviewRoot<T>(root: string, action: (previewRoot: string) => Promise<T>): Promise<T> {
  const previewRoot = await mkdtemp(path.join(previewTempParent(), "assisto-workbench-preview-"));

  try {
    await copyMemoryTree(root, previewRoot);
    return await action(previewRoot);
  } finally {
    await rm(previewRoot, { recursive: true, force: true });
  }
}

async function copyMemoryTree(root: string, previewRoot: string): Promise<void> {
  const source = path.join(root, "memory");
  const destination = path.join(previewRoot, "memory");

  try {
    await cp(source, destination, { recursive: true, verbatimSymlinks: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      await mkdir(destination, { recursive: true });
      return;
    }

    throw error;
  }
}

async function collectReviewInbox(root: string): Promise<WorkbenchReviewInbox> {
  const summaries = await listReviewItems(root);
  const items: WorkbenchReviewItem[] = [];

  for (const summary of summaries) {
    items.push(await enrichReviewItem(root, summary));
  }

  return {
    items,
    grouped_by_reason: groupReviewReasons(items)
  };
}

async function collectReviewTurbo(root: string): Promise<WorkbenchReviewTurbo> {
  const summaries = await listReviewItems(root);
  const items: WorkbenchReviewTurboItem[] = [];

  for (const summary of summaries) {
    const item = await enrichReviewTurboItem(root, summary);
    items.push(item);
  }

  const acceleration = await collectReviewAccelerationForTurbo(root, items);
  const accelerationById = new Map(acceleration.items.map((item) => [item.id, item]));

  for (const item of items) {
    const accelerated = accelerationById.get(item.id);

    if (!accelerated) {
      continue;
    }

    item.proof_previews = accelerated.proof_previews.map((proof) => ({
      proof_id: proof.proof_id,
      rule: proof.rule,
      source_claim_ids: proof.source_claim_ids ?? [],
      source_events: proof.source_events ?? proof.source_event_ids ?? []
    }));
  }

  items.sort(compareReviewTurboItems);

  return {
    generated_at: new Date().toISOString(),
    lanes: reviewTurboLanes(items),
    items
  };
}

async function collectReviewAcceleration(root: string): Promise<ReviewAccelerationQueue> {
  const turbo = await collectReviewTurbo(root);
  return collectReviewAccelerationForTurbo(root, turbo.items);
}

async function collectReviewThroughput(root: string): Promise<WorkbenchReviewThroughput> {
  const turbo = await collectReviewTurbo(root);
  const acceleration = await collectReviewAccelerationForTurbo(root, turbo.items);
  const throughput = buildReviewThroughputResult(acceleration);

  return {
    ...throughput,
    generated_at: turbo.generated_at
  };
}

async function collectReviewAutopilot(root: string): Promise<WorkbenchReviewAutopilot> {
  const turbo = await collectReviewTurbo(root);
  const acceleration = await collectReviewAccelerationForTurbo(root, turbo.items);
  const core = buildReviewAutopilotResult(acceleration);
  const turboById = new Map(turbo.items.map((item) => [item.id, item]));

  return {
    version: core.version,
    generated_at: turbo.generated_at,
    total_items: core.total_items,
    batchApplyAllowed: false,
    next_item_id: core.next_item_id,
    lanes: core.lanes,
    items: acceleration.items.map((accelerated) => reviewAutopilotItem(accelerated, turboById.get(accelerated.id))),
    warnings: core.warnings
  };
}

async function createReviewAutopilotPreview(
  root: string,
  input: Record<string, unknown>
): Promise<WorkbenchReviewAutopilotPreview> {
  const autopilot = await collectReviewAutopilot(root);
  const itemIds = optionalStringArrayInput(input, "itemIds", "item_ids", "ids");
  const laneId = optionalStringInput(input, "laneId", "lane_id");
  const selected = autopilot.items.filter((item) => {
    if (itemIds) {
      return itemIds.includes(item.id);
    }

    if (laneId) {
      return item.lane_id === laneId;
    }

    return item.id === autopilot.next_item_id;
  });

  return {
    action: "review_autopilot_preview",
    created: false,
    batchApplyAllowed: false,
    selected_item_ids: selected.map((item) => item.id),
    grouped_intent: selected.map((item) => item.grouped_intent),
    allowed_next_actions: selected.flatMap((item) => item.allowed_next_actions.map((action) => ({ ...action, item_id: item.id }))),
    warnings: [
      "Preview only: Autopilot does not apply, reject, reprocess, supersede, or batch mutate memory.",
      ...autopilot.warnings
    ],
    items: selected
  };
}

function reviewAutopilotItem(
  accelerated: ReviewAccelerationItem,
  turboItem: WorkbenchReviewTurboItem | undefined
): WorkbenchReviewAutopilotItem {
  const item: WorkbenchReviewTurboItem = turboItem ?? {
    id: accelerated.id,
    path: accelerated.path ?? accelerated.id,
    review_reason: accelerated.review_reason,
    review_state: "staged",
    object_state: "active",
    source_events: accelerated.source_events,
    affected_files: [],
    linked_transaction: undefined,
    staged_claim_ids: accelerated.staged_claim_ids ?? [],
    suggested_action: accelerated.suggested_action,
    lane_id: accelerated.lane_id,
    lane_label: accelerated.lane_id,
    review_priority: accelerated.review_priority,
    evidence_summary: accelerated.source_events.map((eventId) => `source Event ${eventId}`),
    target_suggestions: [],
    context_suggestions: [],
    preview_actions: [],
    staged_claims: [],
    proof_previews: accelerated.proof_previews.map((proof) => ({
      proof_id: proof.proof_id,
      rule: proof.rule,
      source_claim_ids: proof.source_claim_ids ?? [],
      source_events: proof.source_events ?? proof.source_event_ids ?? []
    }))
  };

  return {
    id: item.id,
    path: item.path,
    lane_id: item.lane_id,
    lane_label: item.lane_label,
    risk_rank: accelerated.review_priority,
    risk_factors: reviewAutopilotRiskFactors(item),
    grouped_intent: reviewAutopilotIntent(item),
    source_events: item.source_events,
    affected_files: item.affected_files,
    staged_claim_ids: item.staged_claim_ids,
    claim_diffs: item.staged_claims,
    proof_previews: item.proof_previews,
    target_choices: item.target_suggestions,
    context_choices: item.context_suggestions,
    allowed_next_actions: item.preview_actions,
    suggested_action: item.suggested_action
  };
}

function reviewAutopilotIntent(item: WorkbenchReviewTurboItem): string {
  const claims = item.staged_claim_ids.length > 0 ? item.staged_claim_ids.join(", ") : "no staged claim block";
  return `${item.lane_label}: ${item.id} (${item.review_reason}) -> ${claims}; next action must use preview-first one-item controls.`;
}

function reviewAutopilotRiskFactors(item: WorkbenchReviewTurboItem): string[] {
  const factors = [item.review_reason, item.lane_id];

  if (item.staged_claims.some((claim) => claim.scope_state === "unknown")) {
    factors.push("unknown_scope");
  }

  if (item.proof_previews.length > 0) {
    factors.push("proof_backed_source_context");
  }

  if (item.review_reason.includes("change") || item.review_reason.includes("conflict")) {
    factors.push("explicit_supersession_required");
  }

  return Array.from(new Set(factors)).sort();
}

async function collectReviewAccelerationForTurbo(
  root: string,
  items: WorkbenchReviewTurboItem[]
): Promise<ReviewAccelerationQueue> {
  const symbolic = await buildSymbolicIndex({ root }).catch(() => ({ proofs: [] }));

  return buildReviewAccelerationQueue({
    reviewItems: items.map((item) => ({
      id: item.id,
      path: item.path,
      review_reason: item.review_reason,
      source_events: item.source_events,
      staged_claim_ids: item.staged_claim_ids
    })),
    proofPaths: symbolic.proofs
  });
}

async function collectReviewNext(root: string): Promise<WorkbenchReviewNext> {
  const turbo = await collectReviewTurbo(root);
  const item = turbo.items[0] ?? null;

  return {
    generated_at: turbo.generated_at,
    total: turbo.items.length,
    position: item ? 1 : 0,
    item,
    previous_item_id: null,
    next_item_id: turbo.items[1]?.id ?? null
  };
}

async function enrichReviewItem(root: string, summary: ReviewItemSummary): Promise<WorkbenchReviewItem> {
  try {
    const detail = await showReviewItem(root, summary.id);
    const stagedClaims = stagedClaimSummaries(detail.parsed.body);

    return {
      ...summary,
      source_events: stringArrayValue(detail.parsed.frontmatter.source_events),
      affected_files: stringArrayValue(detail.parsed.frontmatter.affected_files),
      linked_transaction: stringValue(detail.parsed.frontmatter.linked_transaction),
      staged_claim_ids: stagedClaims.map((claim) => claim.claim_id),
      suggested_action: suggestedReviewAction(summary.review_reason)
    };
  } catch {
    return {
      ...summary,
      source_events: [],
      affected_files: [],
      staged_claim_ids: [],
      suggested_action: suggestedReviewAction(summary.review_reason)
    };
  }
}

async function enrichReviewTurboItem(root: string, summary: ReviewItemSummary): Promise<WorkbenchReviewTurboItem> {
  let base: WorkbenchReviewItem;
  let stagedClaims: WorkbenchReviewStagedClaim[] = [];

  try {
    const detail = await showReviewItem(root, summary.id);
    stagedClaims = stagedClaimSummaries(detail.parsed.body);
    base = {
      ...summary,
      source_events: stringArrayValue(detail.parsed.frontmatter.source_events),
      affected_files: stringArrayValue(detail.parsed.frontmatter.affected_files),
      linked_transaction: stringValue(detail.parsed.frontmatter.linked_transaction),
      staged_claim_ids: stagedClaims.map((claim) => claim.claim_id),
      suggested_action: suggestedReviewAction(summary.review_reason)
    };
  } catch {
    base = {
      ...summary,
      source_events: [],
      affected_files: [],
      staged_claim_ids: [],
      suggested_action: suggestedReviewAction(summary.review_reason)
    };
  }

  const lane = reviewTurboLaneFor(base, stagedClaims);

  return {
    ...base,
    lane_id: lane.lane_id,
    lane_label: lane.label,
    review_priority: reviewPriorityFor(lane.lane_id),
    evidence_summary: reviewEvidenceSummary(base, stagedClaims),
    target_suggestions: reviewTargetSuggestions(base),
    context_suggestions: reviewContextSuggestions(base, stagedClaims),
    preview_actions: reviewPreviewActions(lane.lane_id),
    staged_claims: stagedClaims,
    proof_previews: [],
    suggested_action: lane.suggested_action
  };
}

async function collectTransactions(root: string): Promise<WorkbenchTransactionList> {
  const files = await listFilesOrEmpty(root, "memory/transactions/**/*.md");
  const items: WorkbenchTransactionSummary[] = [];

  for (const file of files) {
    try {
      const transaction = parseTransactionMarkdown(await readMarkdownPage(root, file));
      items.push({
        id: transaction.id,
        path: file,
        transaction_state: transaction.transaction_state,
        created_at: transaction.created_at,
        source_events: transaction.source_events,
        operations: transaction.operations.map((operation) => operation.operation),
        affected_files: transaction.affected_files,
        risk_level: transaction.risk_level,
        requires_review: transaction.requires_review
      });
    } catch {
      // Broken transaction pages are surfaced by validation; the read-only workbench skips them.
    }
  }

  items.sort((left, right) => left.path.localeCompare(right.path));

  return { items };
}

async function getTransactionDetail(root: string, idOrPath: string): Promise<WorkbenchTransactionDetail> {
  const record = await findTransaction(root, idOrPath);
  const parsed = parseMarkdownFile(record.content);

  return {
    ...transactionSummaryFromRecord(record),
    body: parsed.body,
    content: record.content,
    intent: record.transaction.intent,
    rollback_notes: record.transaction.rollback_notes,
    application_log: record.transaction.application_log,
    proposed_file_writes: record.transaction.proposed_file_writes.map((write) => ({
      path: write.path,
      content: write.content
    })),
    validation: await validateTransaction(root, record.transaction)
  };
}

async function findTransaction(root: string, idOrPath: string): Promise<WorkbenchTransactionRecord> {
  const normalized = normalizeWorkbenchPath(idOrPath);

  if (normalized.startsWith("memory/transactions/") && normalized.endsWith(".md")) {
    return readTransactionAt(root, normalized);
  }

  const files = await listFilesOrEmpty(root, "memory/transactions/**/*.md");

  for (const file of files) {
    let record: WorkbenchTransactionRecord;

    try {
      record = await readTransactionAt(root, file);
    } catch {
      continue;
    }

    if (record.transaction.id === idOrPath || record.path === normalized) {
      return record;
    }
  }

  throw new Error(`Transaction not found: ${idOrPath}`);
}

async function readTransactionAt(root: string, file: string): Promise<WorkbenchTransactionRecord> {
  const content = await readMarkdownPage(root, file);
  return {
    path: file,
    content,
    transaction: parseTransactionMarkdown(content)
  };
}

function transactionSummaryFromRecord(record: WorkbenchTransactionRecord): WorkbenchTransactionSummary {
  return {
    id: record.transaction.id,
    path: record.path,
    transaction_state: record.transaction.transaction_state,
    created_at: record.transaction.created_at,
    source_events: record.transaction.source_events,
    operations: record.transaction.operations.map((operation) => operation.operation),
    affected_files: record.transaction.affected_files,
    risk_level: record.transaction.risk_level,
    requires_review: record.transaction.requires_review
  };
}

function ensurePendingTransaction(transaction: ParsedTransaction): void {
  if (transaction.transaction_state !== "pending") {
    throw new Error(`Only pending transactions can be changed from the Workbench: ${transaction.id}.`);
  }
}

async function collectFollowups(root: string): Promise<WorkbenchFollowupList> {
  const files = await uniqueSorted([
    ...(await listFilesOrEmpty(root, "memory/followups/*.md")),
    ...(await listFilesOrEmpty(root, "memory/followups/**/*.md"))
  ]);
  const items: WorkbenchFollowupSummary[] = [];
  const warnings: WorkbenchReadWarning[] = [];

  for (const file of files) {
    let parsed: ReturnType<typeof parseMarkdownFile>;

    try {
      parsed = parseMarkdownFile(await readMarkdownPage(root, file));
    } catch (error) {
      warnings.push(readWarning(file, error));
      continue;
    }

    if (parsed.frontmatter.type !== "followup") {
      continue;
    }

    items.push({
      id: stringValue(parsed.frontmatter.id) ?? file,
      path: file,
      object_state: stringValue(parsed.frontmatter.object_state) ?? "active",
      review_state: stringValue(parsed.frontmatter.review_state) ?? "none",
      followup_state: stringValue(parsed.frontmatter.followup_state) ?? "open",
      owner: stringValue(parsed.frontmatter.owner),
      due_at: stringValue(parsed.frontmatter.due_at),
      source_events: stringArrayValue(parsed.frontmatter.source_events),
      related: stringArrayValue(parsed.frontmatter.related)
    });
  }

  items.sort((left, right) => left.path.localeCompare(right.path));

  return { items, warnings };
}

function readWarning(path: string, error: unknown): WorkbenchReadWarning {
  return {
    path,
    message: error instanceof Error ? error.message : String(error)
  };
}

function groupReviewReasons(items: WorkbenchReviewItem[]): WorkbenchReviewReasonGroup[] {
  const groups = new Map<string, WorkbenchReviewReasonGroup>();

  for (const item of items) {
    const group =
      groups.get(item.review_reason) ??
      {
        review_reason: item.review_reason,
        count: 0,
        item_ids: [],
        suggested_action: item.suggested_action
      };

    group.count += 1;
    group.item_ids.push(item.id);
    groups.set(item.review_reason, group);
  }

  return [...groups.values()].sort((left, right) => left.review_reason.localeCompare(right.review_reason));
}

const reviewLaneDefinitions: Array<Omit<WorkbenchReviewLane, "count" | "item_ids">> = [
  {
    lane_id: "needs_ontology_review",
    label: "Needs ontology review",
    suggested_action: "Inspect ontology or frame validation evidence before staging a correction."
  },
  {
    lane_id: "safe_apply",
    label: "Safe apply",
    suggested_action: "Preview apply one item, then create the pending Transaction only if validation passes."
  },
  {
    lane_id: "needs_context",
    label: "Needs context",
    suggested_action: "Select an existing Context or create a Context through review before applying."
  },
  {
    lane_id: "identity_ambiguity",
    label: "Identity ambiguity",
    suggested_action: "Inspect matching entities; stage aliases or context only after human confirmation."
  },
  {
    lane_id: "conflict_or_change",
    label: "Conflict/change",
    suggested_action: "Compare current and staged claims; supersede only when explicitly confirmed."
  },
  {
    lane_id: "stale_noop",
    label: "Stale NOOP",
    suggested_action: "Reprocess the source Event with stage-only semantics."
  },
  {
    lane_id: "other",
    label: "Other",
    suggested_action: "Inspect the ReviewItem, then apply staged, mark, or leave staged."
  }
];

function reviewTurboLanes(items: WorkbenchReviewTurboItem[]): WorkbenchReviewLane[] {
  return reviewLaneDefinitions.map((definition) => {
    const laneItems = items.filter((item) => item.lane_id === definition.lane_id);

    return {
      ...definition,
      count: laneItems.length,
      item_ids: laneItems.map((item) => item.id)
    };
  });
}

function reviewTurboLaneFor(
  item: WorkbenchReviewItem,
  stagedClaims: WorkbenchReviewStagedClaim[]
): Omit<WorkbenchReviewLane, "count" | "item_ids"> {
  const reason = item.review_reason.toLowerCase();

  if (reason === "ontology_violation" || reason.includes("ontology") || reason.includes("frame_validation")) {
    return reviewLaneDefinition("needs_ontology_review");
  }

  if (reason === "stale_noop_event" || reason.includes("stale_noop")) {
    return reviewLaneDefinition("stale_noop");
  }

  if (reason === "unscoped_claim" || stagedClaims.some((claim) => claim.scope_state === "unknown")) {
    return reviewLaneDefinition("needs_context");
  }

  if (reason.includes("ambiguous") || reason.includes("near_match") || reason.includes("identity")) {
    return reviewLaneDefinition("identity_ambiguity");
  }

  if (reason === "role_change" || reason === "reporting_change" || reason === "claim_id_conflict" || reason.includes("change") || reason.includes("conflict")) {
    return reviewLaneDefinition("conflict_or_change");
  }

  if (
    stagedClaims.length > 0 &&
    stagedClaims.every((claim) => claim.claim_state === "staged" && claim.scope_state === "complete")
  ) {
    return reviewLaneDefinition("safe_apply");
  }

  return reviewLaneDefinition("other");
}

function reviewLaneDefinition(laneId: WorkbenchReviewLaneId): Omit<WorkbenchReviewLane, "count" | "item_ids"> {
  const lane = reviewLaneDefinitions.find((definition) => definition.lane_id === laneId);

  if (!lane) {
    return reviewLaneDefinitions[reviewLaneDefinitions.length - 1]!;
  }

  return lane;
}

function compareReviewTurboItems(left: WorkbenchReviewTurboItem, right: WorkbenchReviewTurboItem): number {
  return (
    left.review_priority - right.review_priority ||
    left.path.localeCompare(right.path) ||
    left.id.localeCompare(right.id)
  );
}

function reviewPriorityFor(laneId: WorkbenchReviewLaneId): number {
  switch (laneId) {
    case "needs_ontology_review":
      return 5;
    case "safe_apply":
      return 10;
    case "needs_context":
      return 20;
    case "conflict_or_change":
      return 30;
    case "identity_ambiguity":
      return 40;
    case "stale_noop":
      return 50;
    case "other":
      return 60;
  }
}

function reviewEvidenceSummary(
  item: WorkbenchReviewItem,
  stagedClaims: WorkbenchReviewStagedClaim[]
): string[] {
  const evidence = uniqueSorted([
    ...item.source_events,
    ...stagedClaims.flatMap((claim) => claim.evidence)
  ]);

  if (!evidence.length) {
    return ["No source Event evidence found on this ReviewItem."];
  }

  return evidence.map((eventId) => `Evidence Event: ${eventId}`);
}

function reviewTargetSuggestions(item: WorkbenchReviewItem): string[] {
  return uniqueSorted(item.affected_files.map(memoryFileSuggestion));
}

function reviewContextSuggestions(
  item: WorkbenchReviewItem,
  stagedClaims: WorkbenchReviewStagedClaim[]
): string[] {
  const claimScopes = stagedClaims
    .filter((claim) => claim.scope_state === "complete" && claim.scope)
    .map((claim) => claim.scope as string);
  const contextPaths = item.affected_files
    .map(memoryFileSuggestion)
    .filter((file) => file.startsWith("memory/contexts/"));

  return uniqueSorted([...claimScopes, ...contextPaths]);
}

function reviewPreviewActions(laneId: WorkbenchReviewLaneId): WorkbenchReviewPreviewAction[] {
  const actions: WorkbenchReviewPreviewAction[] = [
    {
      label: "Preview staged apply",
      endpoint: "/api/review/apply-staged/preview",
      note:
        laneId === "needs_context"
          ? "Requires an explicit Context or created Context before a pending Transaction is created."
          : "Shows the pending review-apply Transaction before writing it."
    },
    {
      label: "Preview mark reviewed",
      endpoint: "/api/review/mark/preview",
      note: "Shows the mark-reviewed Transaction before writing it."
    },
    {
      label: "Preview mark contested",
      endpoint: "/api/review/mark/preview",
      note: "Shows the mark-contested Transaction before writing it."
    }
  ];

  if (laneId === "conflict_or_change") {
    actions[0] = {
      ...actions[0],
      note: "Requires explicit supersession when replacing an old role/reporting claim."
    };
  }

  if (laneId === "stale_noop") {
    actions.unshift({
      label: "Preview Event reprocess",
      endpoint: "/api/events/reprocess/preview",
      note: "Reuses the original Event evidence and stages only a pending Transaction."
    });
  }

  return actions;
}

function memoryFileSuggestion(file: string): string {
  const normalized = normalizeWorkbenchPath(file);
  return normalized.startsWith("memory/") ? normalized : `memory/${normalized}`;
}

function stagedClaimSummaries(body: string): WorkbenchReviewStagedClaim[] {
  return parseClaimBlockRecords(body)
    .map((claim) => ({
      claim_id: stringValue(claim.fields.claim_id) ?? `line_${claim.line}`,
      statement: stringValue(claim.fields.statement) ?? "",
      claim_kind: stringValue(claim.fields.claim_kind),
      claim_state: stringValue(claim.fields.claim_state),
      evidence_strength: stringValue(claim.fields.evidence_strength),
      scope: stringValue(claim.fields.scope) ?? null,
      scope_state: stringValue(claim.fields.scope_state),
      evidence: stringArrayValue(claim.fields.evidence)
    }))
    .filter((claim) => claim.claim_state === "staged" || claim.claim_id);
}

function suggestedReviewAction(reviewReason: string): string {
  switch (reviewReason) {
    case "unscoped_claim":
      return "Apply staged claim with an explicit Context, create Context through review, or mark contested.";
    case "role_change":
      return "Apply with explicit supersession only after confirming the role change.";
    case "reporting_change":
      return "Apply with explicit supersession only after confirming the reporting change.";
    case "claim_id_conflict":
      return "Inspect the staged claim and target page before applying; do not auto-merge.";
    default:
      return "Inspect the ReviewItem, then apply staged, mark, or leave staged.";
  }
}

async function listFilesOrEmpty(root: string, globPattern: string): Promise<string[]> {
  try {
    return await listMarkdownFiles(root, globPattern);
  } catch {
    return [];
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizeWorkbenchPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "").trim();
}

function optionalQuery(requestUrl: URL): string | undefined {
  const query = requestUrl.searchParams.get("q") ?? requestUrl.searchParams.get("query");
  const trimmed = query?.trim();

  return trimmed ? trimmed : undefined;
}

function optionalTarget(requestUrl: URL): string | undefined {
  const target = requestUrl.searchParams.get("target") ?? requestUrl.searchParams.get("id") ?? requestUrl.searchParams.get("path");
  const trimmed = target?.trim();

  return trimmed ? trimmed : undefined;
}

function optionalQuestionsPath(root: string, requestUrl: URL): string | undefined {
  const questionsPath = requestUrl.searchParams.get("questions") ?? requestUrl.searchParams.get("questionsPath");
  const trimmed = questionsPath?.trim();

  return trimmed ? path.resolve(root, trimmed) : undefined;
}

function optionalBriefKind(requestUrl: URL): SessionBriefKind | undefined {
  const kind = requestUrl.searchParams.get("kind")?.trim();

  if (kind === "today" || kind === "person" || kind === "context" || kind === "review" || kind === "followups" || kind === "recent") {
    return kind;
  }

  return undefined;
}

function optionalBriefTargetKind(requestUrl: URL): { kind?: SessionBriefTargetKind; error?: string } {
  const kind = requestUrl.searchParams.get("targetKind")?.trim();

  if (!kind) {
    return {};
  }

  if (kind === "person" || kind === "context") {
    return { kind };
  }

  return { error: "Invalid query parameter targetKind; expected person|context." };
}

function optionalContextPackKind(requestUrl: URL): ContextPackKind | undefined {
  const value = requestUrl.searchParams.get("kind") ?? undefined;
  return value === "task" ||
    value === "person" ||
    value === "context" ||
    value === "meeting" ||
    value === "debugging" ||
    value === "agent-handoff"
    ? value
    : undefined;
}

function optionalEntityKind(requestUrl: URL): EntityKind | undefined {
  const kind = requestUrl.searchParams.get("kind")?.trim();

  if (kind === "person" || kind === "topic" || kind === "context") {
    return kind;
  }

  return undefined;
}

function parseBriefTargetKind(requestUrl: URL): { kind: SessionBriefTargetKind; error?: never } | { kind?: never; error: string } {
  const kind = requestUrl.searchParams.get("kind")?.trim();

  if (!kind) {
    return { error: "Missing required query parameter: kind=person|context." };
  }

  if (kind === "person" || kind === "context") {
    return { kind };
  }

  return { error: "Invalid query parameter kind; expected person|context." };
}

function parseJsonBody(body: string | undefined): Record<string, unknown> {
  if (!body?.trim()) {
    return {};
  }

  const parsed: unknown = JSON.parse(body);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function requiredStringInput(input: Record<string, unknown>, ...keys: string[]): string {
  const value = optionalStringInput(input, ...keys);

  if (!value) {
    throw new Error(`Missing required field: ${keys[0]}.`);
  }

  return value;
}

function optionalStringInput(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function optionalStringArrayInput(input: Record<string, unknown>, ...keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = input[key];

    if (Array.isArray(value)) {
      const items = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
      return items.length > 0 ? items : undefined;
    }

    if (typeof value === "string" && value.trim()) {
      return value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    }
  }

  return undefined;
}

function optionalPositiveIntegerInput(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${key} must be a positive integer.`);
  }

  return parsed;
}

function optionalContextNoteType(input: Record<string, unknown>): "note" | "correction" {
  const value = optionalStringInput(input, "noteType", "note_type") ?? "note";

  if (value === "note" || value === "correction") {
    return value;
  }

  throw new Error("Context note type must be note or correction.");
}

function reviewActionStateInput(input: Record<string, unknown>): ReviewActionState {
  const value = requiredStringInput(input, "state");

  if (value === "reviewed" || value === "contested" || value === "archived") {
    return value;
  }

  throw new Error("Review state must be reviewed, contested, or archived.");
}

function previewTempParent(): string {
  if (process.env.TMPDIR?.trim()) {
    return process.env.TMPDIR.trim();
  }

  return process.platform === "win32" ? os.tmpdir() : "/tmp";
}

function jsonRoute(status: number, body: unknown): WorkbenchRouteResponse {
  return textRoute(status, `${JSON.stringify(body, null, 2)}\n`, "application/json; charset=utf-8");
}

function textRoute(status: number, body: string, contentType: string): WorkbenchRouteResponse {
  return {
    status,
    content_type: contentType,
    body
  };
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function formatHostForUrl(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

function workbenchHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Assisto Workbench</title>
    <link rel="stylesheet" href="/assets/workbench.css">
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Assisto</p>
          <h1>Memory Workbench</h1>
        </div>
        <div class="topbar-actions">
          <button type="button" id="quick-capture-open" class="quick-capture-open">Quick capture</button>
          <output id="status" class="status">Loading</output>
        </div>
      </header>
      <nav class="tabs" aria-label="Workbench">
        <button type="button" data-tab="today" aria-pressed="true">Today</button>
        <button type="button" data-tab="dogfood-eval" aria-pressed="false">Dogfood Eval</button>
        <button type="button" data-tab="capture" aria-pressed="false">Capture</button>
        <button type="button" data-tab="import" aria-pressed="false">Import</button>
        <button type="button" data-tab="source-inbox" aria-pressed="false">Source Inbox</button>
        <button type="button" data-tab="entities" aria-pressed="false">People/Topics/Contexts</button>
        <button type="button" data-tab="review" aria-pressed="false">Review</button>
        <button type="button" data-tab="transactions" aria-pressed="false">Transactions</button>
        <button type="button" data-tab="ask" aria-pressed="false">Ask</button>
        <button type="button" data-tab="health" aria-pressed="false">Health</button>
        <button type="button" data-tab="briefs" aria-pressed="false">Briefs</button>
      </nav>
      <section id="activation-wizard" class="activation-wizard" aria-live="polite"></section>
      <section id="view" class="view" aria-live="polite"></section>
      <dialog id="quick-capture-dialog" class="quick-capture-dialog" aria-labelledby="quick-capture-title">
        <article class="quick-capture-panel">
          <header class="dialog-header">
            <div>
              <p class="eyebrow">Capture</p>
              <h2 id="quick-capture-title">Quick capture</h2>
            </div>
            <button type="button" id="quick-capture-close" class="secondary">Close</button>
          </header>
          <form id="quick-capture-form" class="capture-form">
            <label class="field" for="quick-capture-note"><span>Quick capture note</span><textarea id="quick-capture-note" name="note" rows="6" placeholder="Capture a short work note"></textarea></label>
            <div class="action-row">
              <label class="field" for="quick-capture-preset"><span>Preset</span><select id="quick-capture-preset" name="preset">
                <option value="quick-note">quick note</option>
                <option value="meeting-note">meeting note</option>
                <option value="person-fact">person fact</option>
                <option value="project-context">project context</option>
                <option value="follow-up">follow-up</option>
                <option value="retrieval-miss">retrieval miss</option>
                <option value="correction">correction</option>
                <option value="decision-as-claim">decision</option>
                <option value="open-question-as-claim">open question</option>
              </select></label>
              <label class="field" for="quick-capture-observed-at"><span>Quick observed at</span><input id="quick-capture-observed-at" name="observedAt" placeholder="YYYY-MM-DD"></label>
              <label class="field" for="quick-capture-source-preset"><span>Source label override</span><select id="quick-capture-source-preset" name="sourcePreset">
                <option value="">use preset label</option>
                <option value="daily note">daily note</option>
                <option value="meeting note">meeting note</option>
                <option value="correction">correction</option>
                <option value="follow-up note">follow-up note</option>
                <option value="import note">import note</option>
              </select></label>
            </div>
            <div class="action-row">
              <label class="field" for="quick-capture-custom-source"><span>Custom source label</span><input id="quick-capture-custom-source" name="customSourceLabel" placeholder="Optional override"></label>
              <label class="field" for="quick-capture-context"><span>Quick context</span><input id="quick-capture-context" name="context" list="quick-capture-context-options" placeholder="Context id, path, or name"></label>
              <datalist id="quick-capture-context-options"></datalist>
            </div>
            <div class="action-row">
              <label class="field" for="quick-capture-provider"><span>Quick provider</span><select id="quick-capture-provider" name="provider"><option value="rule">rule</option><option value="openai">openai</option></select></label>
              <button type="submit" name="mode" value="preview" class="secondary">Preview quick capture</button>
              <button type="submit" name="mode" value="create">Create quick capture</button>
            </div>
          </form>
          <div id="quick-capture-output" class="action-output"></div>
        </article>
      </dialog>
    </main>
    <script type="module" src="/assets/workbench.js"></script>
  </body>
</html>
`;
}

function workbenchCss(): string {
  return `:root {
  color-scheme: light;
  --bg: #f6f7f4;
  --panel: #ffffff;
  --ink: #1d2428;
  --muted: #68757d;
  --line: #d9ded8;
  --accent: #20746b;
  --accent-2: #9b4d27;
  --soft: #edf4f2;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
}

button,
input,
select,
textarea {
  font: inherit;
}

.shell {
  width: min(1180px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 24px 0 40px;
}

.topbar {
  align-items: end;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding-bottom: 16px;
}

.topbar-actions {
  align-items: center;
  display: flex;
  gap: 10px;
}

.quick-capture-open {
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 6px;
  color: white;
  cursor: pointer;
  min-height: 38px;
  padding: 8px 14px;
}

.eyebrow {
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  margin: 0 0 4px;
  text-transform: uppercase;
}

h1 {
  font-size: 28px;
  line-height: 1.1;
  margin: 0;
}

.status {
  color: var(--muted);
  font-size: 13px;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 0;
}

.tabs button {
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink);
  cursor: pointer;
  min-height: 36px;
  padding: 7px 12px;
}

.tabs button[aria-pressed="true"] {
  background: var(--soft);
  border-color: var(--accent);
  color: var(--accent);
}

.view {
  display: grid;
  gap: 12px;
}

.metrics {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.metric {
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 8px;
  display: grid;
  gap: 4px;
  padding: 10px;
}

.metric span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.metric strong {
  color: var(--ink);
  font-size: 20px;
}

.activation-wizard {
  display: grid;
  gap: 12px;
}

.activation-wizard:empty {
  display: none;
}

.activation-card {
  border-color: #b8d7d0;
  background: #f8fbfa;
}

.activation-steps {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding-left: 18px;
}

.activation-step {
  align-items: baseline;
  display: grid;
  gap: 4px;
  grid-template-columns: auto minmax(140px, 0.4fr) minmax(200px, 1fr);
}

.toolbar,
.action-row {
  align-items: center;
  display: flex;
  gap: 8px;
}

.toolbar input,
.toolbar textarea,
.action-row input,
.action-row select,
.action-row textarea {
  border: 1px solid var(--line);
  border-radius: 6px;
  flex: 1;
  min-height: 38px;
  padding: 8px 10px;
}

textarea {
  resize: vertical;
}

.field {
  display: grid;
  gap: 5px;
}

.field span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.capture-form {
  display: grid;
  gap: 10px;
}

.toolbar button,
.action-row button {
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 6px;
  color: white;
  cursor: pointer;
  min-height: 38px;
  padding: 8px 14px;
}

.toolbar button.secondary,
.action-row button.secondary {
  background: transparent;
  color: var(--accent);
}

.quick-capture-dialog {
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 24px 80px rgb(29 36 40 / 22%);
  color: var(--ink);
  max-width: min(760px, calc(100vw - 32px));
  padding: 0;
  width: 100%;
}

.quick-capture-dialog::backdrop {
  background: rgb(29 36 40 / 36%);
}

.quick-capture-panel {
  background: var(--panel);
  padding: 18px;
}

.dialog-header {
  align-items: start;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 14px;
  padding-bottom: 12px;
}

.dialog-header h2 {
  font-size: 20px;
  line-height: 1.2;
  margin: 0;
}

.action-stack {
  border-top: 1px solid var(--line);
  display: grid;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
}

.claim-diff-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.claim-diff-card {
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 8px;
  display: grid;
  gap: 5px;
  padding: 10px;
}

.claim-diff-card p {
  margin: 0;
  overflow-wrap: anywhere;
}

.review-queue-navigator {
  align-items: center;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  margin: 12px 0;
  padding: 10px 12px;
}

.review-queue-navigator p {
  margin: 0;
}

.review-queue-card[data-review-selected="true"] {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgb(45 108 223 / 16%);
}

.review-suggestion-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.ask-result {
  display: grid;
  gap: 14px;
}

.ask-result section {
  display: grid;
  gap: 8px;
}

.ask-result section h2 {
  font-size: 16px;
  margin: 0;
}

.ask-card {
  display: grid;
  gap: 8px;
}

.ask-card p {
  margin: 0;
}

.citation-list {
  display: grid;
  gap: 2px;
}

.copy-derived-text {
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--accent);
  cursor: pointer;
  justify-self: start;
  min-height: 34px;
  padding: 7px 10px;
}

.copy-output {
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink);
  display: block;
  min-height: 0;
  overflow-wrap: anywhere;
  padding: 10px 12px;
  white-space: pre-wrap;
}

.copy-output:empty {
  display: none;
}

.context-pack {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
}

.context-pack summary {
  cursor: pointer;
  font-weight: 700;
}

.summary-strip {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.reason-filter {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink);
  cursor: pointer;
  min-height: 72px;
  padding: 12px;
  text-align: left;
}

.reason-filter[aria-pressed="true"] {
  background: var(--soft);
  border-color: var(--accent);
}

.reason-filter strong {
  display: block;
  font-size: 15px;
  margin-bottom: 4px;
}

.reason-filter span {
  color: var(--muted);
  display: block;
  font-size: 12px;
  line-height: 1.35;
}

.action-output {
  margin-top: 12px;
}

.action-result {
  display: grid;
  gap: 10px;
}

.detail-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
}

.detail-list div {
  border-top: 1px solid var(--line);
  display: grid;
  gap: 4px;
  padding-top: 8px;
}

.detail-list dt {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  margin: 0;
}

.detail-list dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.plain-list {
  margin: 4px 0 0;
  padding-left: 18px;
}

.plain-list li {
  margin: 3px 0;
  overflow-wrap: anywhere;
}

.grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.transaction-layout {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(280px, 0.9fr) minmax(320px, 1.1fr);
}

.transaction-layout > .grid {
  align-content: start;
  grid-template-columns: 1fr;
}

.detail-panel {
  min-width: 0;
}

.item {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px;
}

.item h2,
.item h3 {
  font-size: 15px;
  line-height: 1.25;
  margin: 0 0 8px;
}

.meta {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  margin: 0;
  overflow-wrap: anywhere;
}

.pill {
  color: var(--accent-2);
  font-size: 12px;
  font-weight: 700;
}

pre {
  background: #172023;
  border-radius: 8px;
  color: #e8eeee;
  overflow: auto;
  padding: 12px;
}

.write-detail {
  border-top: 1px solid var(--line);
  padding: 8px 0;
}

.write-detail summary {
  cursor: pointer;
  font-weight: 700;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .shell {
    width: min(100vw - 20px, 1180px);
    padding-top: 16px;
  }

  .topbar,
  .toolbar,
  .action-row {
    align-items: stretch;
    flex-direction: column;
  }

  .topbar-actions,
  .dialog-header {
    align-items: stretch;
    flex-direction: column;
  }

  .transaction-layout {
    grid-template-columns: 1fr;
  }
}
`;
}

function workbenchClientJs(): string {
  return `const view = document.querySelector("#view");
const activationWizard = document.querySelector("#activation-wizard");
const status = document.querySelector("#status");
const quickCaptureDialog = document.querySelector("#quick-capture-dialog");
const quickCaptureOpen = document.querySelector("#quick-capture-open");
const quickCaptureClose = document.querySelector("#quick-capture-close");
const quickCaptureForm = document.querySelector("#quick-capture-form");
let snapshot = null;
let health = null;
let maintenancePlan = null;
let dogfoodHome = null;
let dogfoodControlRoom = null;
let dogfoodEvalResult = null;
let useTomorrow = null;
let dailyQueue = null;
let dailySession = null;
let dailyQueueIndex = 0;
let activationStatus = null;
let activeTab = "today";
let reviewReasonFilter = "all";
let reviewLaneFilter = "all";
let reviewQueueIndex = 0;
let reviewTurbo = null;
let reviewAutopilot = null;
let reviewThroughput = null;
let transactionStateFilter = "pending";
let transactionDetail = null;
let briefTargets = { person: null, context: null };
let pendingBriefRequest = null;
let entityKind = "person";
let entityReviewLaneFilter = "all";
let entityList = null;
let entityCommandCenter = null;
let entityDetail = null;
let importTriageUnits = [];
let captureInbox = null;
let sourceInboxList = null;
let sourceInboxHub = null;
let sourceInboxSession = null;
let sourceInboxSearchResult = null;

for (const button of document.querySelectorAll("[data-tab]")) {
  button.addEventListener("click", () => {
    selectWorkbenchTab(button.dataset.tab);
    render();
  });
}

quickCaptureOpen?.addEventListener("click", () => {
  void openQuickCapture();
});

quickCaptureClose?.addEventListener("click", () => {
  closeQuickCapture();
});

quickCaptureForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const preview = event.submitter?.value === "preview";
  await runQuickCapture(preview ? "/api/capture/quick/preview" : "/api/capture/quick", {
    preset_id: form.elements.preset.value,
    note: form.elements.note.value,
    observedAt: form.elements.observedAt.value,
    sourceLabel: quickCaptureSourceLabel(form),
    context: form.elements.context.value,
    provider: form.elements.provider.value
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "c" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return;
  }

  const active = document.activeElement;
  if (active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)) {
    return;
  }

  event.preventDefault();
  void openQuickCapture();
});

document.addEventListener("keydown", (event) => {
  if (activeTab !== "today" || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
    return;
  }

  const active = document.activeElement;
  if (active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)) {
    return;
  }

  if (!dailyQueue?.items?.length) {
    return;
  }

  event.preventDefault();
  dailyQueueIndex =
    event.key === "ArrowRight"
      ? Math.min(dailyQueueIndex + 1, dailyQueue.items.length - 1)
      : Math.max(dailyQueueIndex - 1, 0);
  renderDogfoodHome(dogfoodHome, dailyQueue, useTomorrow, dailySession);
});

document.addEventListener("keydown", (event) => {
  if (activeTab !== "review" || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    return;
  }

  const active = document.activeElement;
  if (active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)) {
    return;
  }

  const items = filteredReviewItems();
  if (!items.length) {
    return;
  }

  event.preventDefault();
  reviewQueueIndex =
    event.key === "ArrowDown" || event.key === "ArrowRight"
      ? Math.min(reviewQueueIndex + 1, items.length - 1)
      : Math.max(reviewQueueIndex - 1, 0);
  renderReviewTurbo(reviewTurbo);
});

async function openQuickCapture() {
  await loadQuickCaptureContextOptions();
  document.querySelector("#quick-capture-output").innerHTML = "";

  if (typeof quickCaptureDialog.showModal === "function") {
    quickCaptureDialog.showModal();
  } else {
    quickCaptureDialog.setAttribute("open", "");
  }

  document.querySelector("#quick-capture-note")?.focus();
}

function closeQuickCapture() {
  if (typeof quickCaptureDialog.close === "function") {
    quickCaptureDialog.close();
  } else {
    quickCaptureDialog.removeAttribute("open");
  }
}

async function loadQuickCaptureContextOptions() {
  const datalist = document.querySelector("#quick-capture-context-options");

  if (!datalist || datalist.dataset.loaded === "true") {
    return;
  }

  try {
    const result = await fetchJson("/api/brief/targets?kind=context");
    datalist.innerHTML = result.targets.map((target) => \`<option value="\${escapeHtml(target.id ?? target.path)}">\${escapeHtml(target.name)} · \${escapeHtml(target.path)}</option>\`).join("");
    datalist.dataset.loaded = "true";
  } catch {
    datalist.dataset.loaded = "true";
  }
}

function quickCaptureSourceLabel(form) {
  const custom = form.elements.customSourceLabel.value.trim();
  const preset = form.elements.sourcePreset.value;
  return custom || preset || undefined;
}

async function runQuickCapture(path, body) {
  const output = document.querySelector("#quick-capture-output");
  output.innerHTML = "<pre>Running</pre>";

  try {
    const result = await postJson(path, body);
    if (result.created) {
      snapshot = await fetchJson("/api/snapshot");
      health = null;
      dogfoodHome = null;
      dogfoodControlRoom = null;
      useTomorrow = null;
      dailyQueue = null;
      dailyQueueIndex = 0;
      activationStatus = null;
      reviewTurbo = null;
      reviewAutopilot = null;
      reviewThroughput = null;
      captureInbox = null;
    }
    output.innerHTML = renderActionResult(result);
  } catch (error) {
    output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
  }
}

function selectWorkbenchTab(tabName) {
  activeTab = tabName;
  for (const tab of document.querySelectorAll("[data-tab]")) {
    tab.setAttribute("aria-pressed", String(tab.dataset.tab === tabName));
  }
}

async function loadSnapshot() {
  snapshot = await fetchJson("/api/snapshot");
  status.value = "Ready";
  render();
}

async function fetchJson(path) {
  const response = await fetch(path);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }

  return payload;
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }

  return payload;
}

function render() {
  if (!snapshot) {
    view.innerHTML = "";
    return;
  }

  if (activeTab === "today") {
    void renderToday();
    return;
  }

  activationWizard.innerHTML = "";

  if (activeTab === "dogfood-eval") {
    void renderDogfoodEval();
    return;
  }

  if (activeTab === "capture") {
    void renderCapture();
    return;
  }

  if (activeTab === "import") {
    renderImport();
    return;
  }

  if (activeTab === "source-inbox") {
    void renderSourceInbox();
    return;
  }

  if (activeTab === "entities") {
    void renderEntities();
    return;
  }

  if (activeTab === "review") {
    void renderReview();
    return;
  }

  if (activeTab === "transactions") {
    renderTransactions();
    return;
  }

  if (activeTab === "ask") {
    view.innerHTML = \`<form class="toolbar" id="ask-form">
      <input id="ask-input" name="q" value="Who is my manager?">
      <button type="submit" name="mode" value="ask">Ask</button>
      <button type="submit" name="mode" value="draft" class="secondary">Draft answer</button>
    </form>
    <div id="ask-result" class="ask-result"></div>
    <output id="copy-output" class="copy-output" aria-live="polite"></output>\`;
    document.querySelector("#ask-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      clearCopyOutput();
      const question = document.querySelector("#ask-input").value.trim();

      if (!question) {
        document.querySelector("#ask-result").innerHTML = '<article class="item"><h2>Ask</h2><p class="meta">Enter a question to retrieve deterministic memory context.</p></article>';
        return;
      }

      const draft = event.submitter?.value === "draft";
      document.querySelector("#ask-result").innerHTML = draft
        ? '<article class="item"><h2>Drafting</h2><p class="meta">Reading deterministic memory basis before asking the optional provider.</p></article>'
        : '<article class="item"><h2>Loading</h2><p class="meta">Reading markdown memory.</p></article>';

      try {
        if (draft) {
          renderAnswerDraft(await postJson("/api/ask/draft/preview", { question }));
        } else {
          const session = await fetchJson(\`/api/ask/session?q=\${encodeURIComponent(question)}\`);
          renderAskSession(session);
        }
      } catch (error) {
        document.querySelector("#ask-result").innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
      }
    });
    return;
  }

  if (activeTab === "health") {
    void renderHealth();
    return;
  }

  renderBriefs();
}

async function renderDogfoodEval() {
  if (!dogfoodEvalResult) {
    view.innerHTML = '<article class="item"><h2>Loading Dogfood Eval</h2><p class="meta">Reading local question set and deterministic answer basis.</p></article>';
    dogfoodEvalResult = await fetchJson("/api/dogfood/eval");

    if (activeTab !== "dogfood-eval") {
      return;
    }
  }

  renderDogfoodEvalView(dogfoodEvalResult);
}

function renderDogfoodEvalView(result, message = "") {
  view.innerHTML = \`<header class="view-header">
    <div>
      <p class="eyebrow">Dogfood</p>
      <h1>Dogfood Eval</h1>
      <p class="meta">Local questions from \${escapeHtml(result.questions_path)}. Derived only; nothing is saved to memory.</p>
    </div>
    <div class="action-row">
      <button type="button" id="dogfood-eval-run">Run eval</button>
      <button type="button" class="secondary copy-derived-text" data-copy-target="#dogfood-eval-export">Copy eval report</button>
    </div>
  </header>
  <output id="dogfood-eval-output" class="copy-output" aria-live="polite">\${escapeHtml(message)}</output>
  <output id="copy-output" class="copy-output" aria-live="polite"></output>
  \${dogfoodEvalMetricsHtml(result)}
  \${dogfoodEvalWarningsHtml(result.warnings ?? [])}
  <section data-dogfood-eval-section="questions">
    <h2>Questions</h2>
    \${result.questions.length ? \`<div class="grid">\${result.questions.map(dogfoodEvalQuestionHtml).join("")}</div>\` : '<article class="item"><h3>No local questions</h3><p class="meta">Create .assisto-local/eval/questions.json to score real work questions.</p></article>'}
  </section>
  <section data-dogfood-eval-section="export">
    <h2>Derived export</h2>
    <pre id="dogfood-eval-export" class="derived-export">\${escapeHtml(dogfoodEvalExportText(result))}</pre>
  </section>\`;

  document.querySelector("#dogfood-eval-run")?.addEventListener("click", async () => {
    dogfoodEvalResult = await postJson("/api/dogfood/eval/run", {});
    renderDogfoodEvalView(dogfoodEvalResult, "Dogfood eval refreshed");
  });
  bindCopyControls();
}

function dogfoodEvalMetricsHtml(result) {
  const metrics = result.metrics;
  return \`<section data-dogfood-eval-section="metrics">
    <h2>Scores</h2>
    <div class="metrics">
      \${metricHtml("Questions", metrics.total_questions)}
      \${metricHtml("Answerability", percentText(metrics.answerability))}
      \${metricHtml("Citation coverage", percentText(metrics.citation_coverage))}
      \${metricHtml("Irrelevant inclusions", metrics.irrelevant_inclusion_count)}
      \${metricHtml("Cannot-confirm quality", percentText(metrics.cannot_confirm_quality))}
      \${metricHtml("Repair precision", percentText(metrics.repair_action_precision))}
      \${metricHtml("Missing-memory guidance", metrics.missing_memory_guidance_count)}
      \${metricHtml("Review/follow-up surfacing", metrics.review_followup_surfacing_count)}
      \${metricHtml("Generated persistence violations", metrics.generated_persistence_violations)}
      \${metricHtml("Regression since last run", metrics.regression_since_last_run)}
    </div>
  </section>\`;
}

function dogfoodEvalWarningsHtml(warnings) {
  return warnings.length
    ? \`<section data-dogfood-eval-section="warnings"><h2>Warnings</h2>\${plainListHtml("Warnings", warnings)}</section>\`
    : "";
}

function dogfoodEvalQuestionHtml(question) {
  return \`<article class="item dogfood-eval-card">
    <h3>\${escapeHtml(question.question)}</h3>
    <p class="pill">\${question.answerable ? "answerable" : "needs memory"}</p>
    <p class="meta">expected \${question.found_expected_items}/\${question.expected_items}; irrelevant inclusions \${question.irrelevant_inclusion_count}</p>
    \${question.missing_memory_guidance ? '<p class="meta">missing-memory guidance surfaced</p>' : ""}
    \${dogfoodEvalFoundHtml("Found claims", question.found_claim_ids)}
    \${dogfoodEvalFoundHtml("Found Events", question.found_event_ids)}
    \${dogfoodEvalFoundHtml("Found pages", question.found_page_paths)}
    \${dogfoodEvalFoundHtml("Found ReviewItems", question.found_review_ids)}
    \${dogfoodEvalFoundHtml("Found FollowUps", question.found_followup_ids)}
    \${dogfoodEvalFoundHtml("Cannot confirm", question.found_cannot_confirm ?? [])}
    \${dogfoodEvalFoundHtml("Repair actions", question.found_repair_actions ?? [])}
    \${dogfoodEvalRepairSuggestionsHtml(question.repair_suggestions ?? [])}
    \${dogfoodEvalMissingHtml(question)}
  </article>\`;
}

function dogfoodEvalFoundHtml(label, items) {
  return items.length ? plainListHtml(label, items) : "";
}

function dogfoodEvalRepairSuggestionsHtml(suggestions) {
  if (!suggestions.length) {
    return "";
  }

  return plainListHtml("Repair suggestions", suggestions.map((suggestion) => suggestion.label + (suggestion.endpoint ? " · " + suggestion.endpoint : "")));
}

function dogfoodEvalMissingHtml(question) {
  const missing = [
    ...missingExpected("Missing claims", question.expected_claim_ids, question.found_claim_ids),
    ...missingExpected("Missing Events", question.expected_event_ids, question.found_event_ids),
    ...missingExpected("Missing pages", question.expected_page_paths, question.found_page_paths),
    ...missingExpected("Missing ReviewItems", question.expected_review_ids, question.found_review_ids),
    ...missingExpected("Missing FollowUps", question.expected_followup_ids, question.found_followup_ids),
    ...missingExpected("Missing cannot-confirm", question.expected_cannot_confirm ?? [], question.found_cannot_confirm ?? []),
    ...missingExpected("Missing repair actions", question.expected_repair_actions ?? [], question.found_repair_actions ?? [])
  ];

  return missing.length ? \`<div class="warning-list">\${plainListHtml("Failing expectations", missing)}</div>\` : "";
}

function metricHtml(label, value) {
  return \`<article class="metric"><span>\${escapeHtml(label)}</span><strong>\${escapeHtml(String(value))}</strong></article>\`;
}

function missingExpected(label, expected, found) {
  const foundSet = new Set(found);
  return expected.filter((item) => !foundSet.has(item)).map((item) => \`\${label}: \${item}\`);
}

function dogfoodEvalExportText(result) {
  const metrics = result.metrics;
  const lines = [
    "# Dogfood Eval",
    \`generated_at: \${result.generated_at}\`,
    \`questions_path: \${result.questions_path}\`,
    \`questions: \${metrics.total_questions}\`,
    \`answerability: \${percentText(metrics.answerability)}\`,
    \`citation_coverage: \${percentText(metrics.citation_coverage)}\`,
    \`irrelevant_inclusion_count: \${metrics.irrelevant_inclusion_count}\`,
    \`cannot_confirm_quality: \${percentText(metrics.cannot_confirm_quality)}\`,
    \`repair_action_precision: \${percentText(metrics.repair_action_precision)}\`,
    \`missing_memory_guidance_count: \${metrics.missing_memory_guidance_count}\`,
    \`review_followup_surfacing_count: \${metrics.review_followup_surfacing_count}\`,
    \`generated_persistence_violations: \${metrics.generated_persistence_violations}\`,
    \`regression_since_last_run: \${metrics.regression_since_last_run}\`,
    "",
    "## Questions"
  ];

  for (const question of result.questions) {
    lines.push(\`- \${question.question}: \${question.found_expected_items}/\${question.expected_items} expected items found\`);
  }

  return lines.join("\\n");
}

function percentText(value) {
  return \`\${Math.round((value ?? 0) * 100)}%\`;
}

async function renderToday() {
  if (!dogfoodHome || !dogfoodControlRoom || !activationStatus || !dailyQueue || !dailySession || !useTomorrow) {
    view.innerHTML = '<article class="item"><h2>Loading Dogfood Home</h2><p class="meta">Reading local markdown memory.</p></article>';
    const [loadedHome, loadedControlRoom, loadedActivationStatus, loadedDailyQueue, loadedDailySession, loadedUseTomorrow] = await Promise.all([
      fetchJson("/api/dogfood/home"),
      fetchJson("/api/dogfood/control-room"),
      fetchJson("/api/activation/status"),
      fetchJson("/api/daily/queue"),
      fetchJson("/api/daily/session"),
      fetchJson("/api/use-tomorrow")
    ]);
    dogfoodHome = loadedHome;
    dogfoodControlRoom = loadedControlRoom;
    activationStatus = loadedActivationStatus;
    dailyQueue = loadedDailyQueue;
    dailySession = loadedDailySession;
    useTomorrow = loadedUseTomorrow;
    dailyQueueIndex = Math.min(dailyQueueIndex, Math.max((dailyQueue.items?.length ?? 1) - 1, 0));

    if (activeTab !== "today") {
      return;
    }
  }

  if (activeTab !== "today") {
    return;
  }

  renderActivationWizard(activationStatus);
  renderDogfoodHome(dogfoodHome, dailyQueue, useTomorrow, dailySession, dogfoodControlRoom);
}

function renderActivationWizard(result) {
  if (!result || (result.activated && result.next_wizard_step?.step_id === "run_health" && result.next_wizard_step?.state === "complete")) {
    activationWizard.innerHTML = "";
    return;
  }

  const steps = (result.wizard_steps ?? []).map((step) => \`<li class="activation-step \${escapeHtml(step.state)}">
    <span class="pill">\${escapeHtml(step.state)}</span>
    <strong>\${escapeHtml(step.label)}</strong>
    <span class="meta">\${escapeHtml(step.detail)}</span>
  </li>\`).join("");

  activationWizard.innerHTML = \`<article class="item activation-card">
    <div>
      <p class="eyebrow">Activation wizard</p>
      <h2>First-run activation</h2>
      <p class="meta">State: \${escapeHtml(result.memory_state)} · next: \${escapeHtml(result.next_wizard_step.label)}</p>
    </div>
    <p class="meta">\${escapeHtml(result.suggested_next_action)}</p>
    <div class="action-row">
      <button type="button" data-tab-jump="capture" class="secondary">Go to Capture</button>
      <button type="button" data-tab-jump="transactions" class="secondary">Go to Transactions</button>
      <button type="button" data-tab-jump="ask" class="secondary">Go to Ask</button>
      <button type="button" data-tab-jump="briefs" class="secondary">Go to Briefs</button>
      <button type="button" data-tab-jump="health" class="secondary">Go to Health</button>
    </div>
    <ol class="activation-steps">\${steps}</ol>
  </article>\`;

  for (const button of activationWizard.querySelectorAll("[data-tab-jump]")) {
    button.addEventListener("click", () => {
      selectWorkbenchTab(button.dataset.tabJump);
      render();
    });
  }
}

function renderDogfoodHome(result, queue, tomorrow, session, controlRoom = dogfoodControlRoom) {
  const countCards = Object.keys(result.counts).map((key) => \`<article class="item">
    <h3>\${escapeHtml(key.replaceAll("_", " "))}</h3>
    <p class="pill">\${escapeHtml(result.counts[key])}</p>
  </article>\`).join("");

  view.innerHTML = \`<article class="item">
    <h2>Dogfood Home</h2>
    <p class="pill">\${result.today.daily_review_complete ? "daily review complete" : "needs attention"}</p>
    <p class="meta">Triage \${result.today.triage_complete ? "complete" : "needs decisions"}</p>
    <p class="meta">Generated \${escapeHtml(result.generated_at)}</p>
    <dl class="detail-list">
      <div>
        <dt>next recommended action</dt>
        <dd><strong>\${escapeHtml(result.next_recommended_action.label)}</strong>\${result.next_recommended_action.target_id ? \` · \${escapeHtml(result.next_recommended_action.target_id)}\` : ""}</dd>
      </div>
      <div>
        <dt>daily progress</dt>
        <dd>\${escapeHtml(result.daily_progress.completed_steps)} of \${escapeHtml(result.daily_progress.total_steps)} clear · \${escapeHtml(result.daily_progress.open_items)} open decision item\${result.daily_progress.open_items === 1 ? "" : "s"}</dd>
      </div>
      <div>
        <dt>capture prompt</dt>
        <dd>\${escapeHtml(result.capture_prompt.prompt)}</dd>
      </div>
    </dl>
  </article>
  \${renderUseTomorrow(tomorrow)}
  \${renderDailySession(session)}
  \${renderDailyQueue(queue)}
  <section><h2>Daily loop</h2><div class="grid">\${countCards}</div></section>
  <section><h2>Brief shortcuts</h2><div class="action-row">
    \${briefLinkButtonHtml("today", "", "", "Daily brief")}
    \${briefLinkButtonHtml("recent", "", "", "What changed recently")}
    \${briefLinkButtonHtml("followups", "", "", "Follow-up review")}
    \${briefLinkButtonHtml("review", "", "", "Review-risk brief")}
  </div></section>
  <section><h2>Workday modes</h2>
    <div class="action-row">
      <button type="button" class="secondary workday-mode-button" data-mode-route="/api/modes/morning">Morning</button>
      <button type="button" class="secondary workday-mode-button" data-mode-route="/api/modes/end-day">End of day</button>
    </div>
    <div class="form-grid">
      <label>Person or Context id/path <input id="workday-mode-target" type="text" placeholder="per_jeff or ctx_inventory_project" /></label>
      <div class="action-row">
        <button type="button" class="secondary workday-mode-button" data-mode-route="/api/modes/meeting" data-needs-target="true">Meeting</button>
        <button type="button" class="secondary workday-mode-button" data-mode-route="/api/modes/after-meeting" data-needs-target="true">After meeting</button>
      </div>
    </div>
    <div id="workday-mode-output" class="action-output"></div>
  </section>
  \${todayPendingTransactionsHtml(result.pending_transactions)}
  \${todayReviewGroupsHtml(result.staged_review_groups)}
  \${todayStaleNoopsHtml(result.stale_noop_events)}
  \${todayFollowupsHtml(result.open_followups)}
  \${todayFrictionLogsHtml(result.recent_friction_logs ?? [])}
  \${todayCaptureFeedbackHtml(result.recent_capture_feedback ?? [])}
  \${todayEventsHtml(result.recent_events)}
  \${todayRecentTransactionsHtml(result.recent_transactions)}
  \${todayTextListSection("Health warnings", result.health_warnings, "No health warnings.")}
  \${todayTextListSection("Read warnings", result.warnings, "No read warnings.")}
  \${todayTextListSection("Suggested manual actions", result.suggested_manual_actions, "No suggested manual actions.")}
  <div id="today-action-output" class="action-output"></div>\`;
  bindTodayActions();
  bindWorkdayModes();
  bindBriefLinks();
}

function renderControlRoom(result) {
  if (!result) {
    return "";
  }

  const warnings = (result.stale_or_missing_source_warnings ?? []).slice(0, 4).map((warning) => "<li>" + escapeHtml(warning) + "</li>").join("");
  const bottlenecks = (result.review_bottlenecks ?? []).slice(0, 4).map((item) => "<li><strong>" + escapeHtml(item.review_reason) + "</strong> · " + escapeHtml(item.count) + " · " + escapeHtml(item.severity) + "</li>").join("");

  return '<section><h2>Source-to-answer control room</h2>' +
    '<div class="grid">' +
      '<article class="item"><h3>Source Inbox</h3><p class="pill">' + escapeHtml(result.source_inbox_backlog.untriaged_units) + ' untriaged</p><p class="meta">' + escapeHtml(result.source_inbox_backlog.units_total) + ' source unit(s)</p></article>' +
      '<article class="item"><h3>Dogfood questions</h3><p class="pill">' + escapeHtml(result.top_unanswered_questions.length) + ' unanswered</p><p class="meta">Missing-memory feedback stays noncanonical.</p></article>' +
      '<article class="item"><h3>Proof coverage</h3><p class="pill">' + escapeHtml(result.proof_coverage.facts_with_event_citations) + '/' + escapeHtml(result.proof_coverage.fact_count) + '</p><p class="meta">facts cite Events</p></article>' +
      '<article class="item"><h3>Import load</h3><p class="pill">' + escapeHtml(result.import_progress.review_load_level) + '</p><p class="meta">next batch: ' + escapeHtml(result.import_progress.suggested_next_batch_size) + '</p></article>' +
    '</div>' +
    '<article class="item"><h3>One next action</h3><p><strong>' + escapeHtml(result.next_recommended_action.label) + '</strong></p><p class="meta">' + escapeHtml(result.next_recommended_action.detail) + '</p></article>' +
    '<div class="grid">' +
      '<article class="item"><h3>Review bottlenecks</h3><ul>' + (bottlenecks || '<li>No review bottlenecks.</li>') + '</ul></article>' +
      '<article class="item"><h3>Source warnings</h3><ul>' + (warnings || '<li>No source warnings.</li>') + '</ul></article>' +
    '</div>' +
  '</section>';
}

function bindWorkdayModes() {
  for (const button of document.querySelectorAll(".workday-mode-button")) {
    button.addEventListener("click", async () => {
      const output = document.querySelector("#workday-mode-output");
      output.innerHTML = "<pre>Loading</pre>";

      try {
        const targetInput = document.querySelector("#workday-mode-target");
        const target = targetInput?.value?.trim() ?? "";
        const route = button.dataset.needsTarget === "true"
          ? button.dataset.modeRoute + "?id=" + encodeURIComponent(target)
          : button.dataset.modeRoute;
        output.innerHTML = renderWorkdayMode(await fetchJson(route));
      } catch (error) {
        output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
      }
    });
  }
}

function renderWorkdayMode(result) {
  return \`<article class="item">
    <h3>\${escapeHtml(result.title)}</h3>
    \${result.target ? \`<p class="meta">Target: \${escapeHtml(result.target.name)}</p>\` : ""}
    <p class="meta">\${escapeHtml(result.summary)}</p>
    <p class="meta">Next queue item: \${escapeHtml(result.next_queue_item?.label ?? "none")}</p>
    <p class="meta">Pinned questions: \${escapeHtml(result.pinned_questions.length)} · open follow-ups: \${escapeHtml(result.open_followups.length)} · logged misses: \${escapeHtml(result.logged_misses.length)}</p>
    \${plainListHtml("Suggested captures", result.suggested_captures ?? [])}
    \${plainListHtml("Missing-memory prompts", result.missing_memory_prompts ?? [])}
    \${plainListHtml("After-meeting prompts", result.after_meeting_prompts ?? [])}
    \${plainListHtml("Follow-up checks", result.suggested_followup_checks ?? [])}
    <p class="meta">\${escapeHtml(result.disclaimer)}</p>
  </article>\`;
}

function renderDailySession(result) {
  if (!result) {
    return "";
  }

  return \`<section data-daily-session>
    <article class="item">
      <h2>Local daily session</h2>
      <p class="pill">\${result.exists ? "saved locally" : "empty"}</p>
      <p class="meta">\${escapeHtml(result.path)} is noncanonical UI state and can be deleted without corrupting memory.</p>
      <dl class="detail-list">
        <div><dt>dismissed prompts</dt><dd>\${escapeHtml(result.state.dismissed_prompts.length)}</dd></div>
        <div><dt>pinned daily questions</dt><dd>\${escapeHtml(result.state.pinned_daily_questions.length)}</dd></div>
        <div><dt>last selected mode</dt><dd>\${escapeHtml(result.state.last_selected_mode ?? "none")}</dd></div>
        <div><dt>last completed derived step</dt><dd>\${escapeHtml(result.state.last_completed_derived_step ?? "none")}</dd></div>
      </dl>
    </article>
  </section>\`;
}

function renderUseTomorrow(result) {
  if (!result) {
    return "";
  }

  const steps = (result.steps ?? []).map((step) => \`<li class="activation-step \${escapeHtml(step.state)}">
    <span class="pill">\${escapeHtml(step.state)}</span>
    <strong>\${escapeHtml(step.label)}</strong>
    <span class="meta">\${escapeHtml(step.detail)}</span>
  </li>\`).join("");
  const actions = result.suggested_actions?.length
    ? plainListHtml("Suggested actions", result.suggested_actions)
    : '<p class="meta">No ready next actions. Capture new work memory when something changes.</p>';

  return \`<section data-use-tomorrow>
    <article class="item activation-card">
      <div>
        <p class="eyebrow">First day loop</p>
        <h2>Use Assisto Tomorrow</h2>
        <p class="meta">State: \${escapeHtml(result.memory_state)} · next: \${escapeHtml(result.next_step.label)}</p>
      </div>
      <p class="meta">\${escapeHtml(result.next_step.detail)}</p>
      <div class="action-row">
        <button type="button" data-tab-jump="capture" class="secondary">Seed or Capture</button>
        <button type="button" data-tab-jump="transactions" class="secondary">Review</button>
        <button type="button" data-tab-jump="ask" class="secondary">Ask or Pin</button>
        <button type="button" data-tab-jump="briefs" class="secondary">Brief</button>
        <button type="button" data-tab-jump="health" class="secondary">Health</button>
      </div>
      <ol class="activation-steps">\${steps}</ol>
      \${actions}
    </article>
  </section>\`;
}

function renderDailyQueue(queue) {
  if (!queue) {
    return '<section><h2>Daily queue</h2><article class="item"><h3>Loading</h3><p class="meta">Reading queue state.</p></article></section>';
  }

  if (!queue.items.length) {
    return \`<section><h2>Daily queue</h2><article class="item">
      <h3>Queue clear</h3>
      <p class="meta">No pending daily review items. Capture what changed when there is new work memory.</p>
    </article></section>\`;
  }

  dailyQueueIndex = Math.min(dailyQueueIndex, queue.items.length - 1);
  const item = queue.items[dailyQueueIndex] ?? queue.current_item;
  const countSummary = Object.keys(queue.counts)
    .map((key) => \`\${escapeHtml(key.replaceAll("_", " "))}: \${escapeHtml(queue.counts[key])}\`)
    .join(" · ");
  const list = queue.items.map((queueItem, index) => \`<li class="\${index === dailyQueueIndex ? "active" : ""}">
    <button type="button" class="link-button daily-queue-select" data-index="\${escapeHtml(index)}" aria-label="\${escapeHtml(queueItem.label)}">
      \${escapeHtml(index + 1)}. \${escapeHtml(queueItem.item_type.replaceAll("_", " "))}
    </button>
  </li>\`).join("");

  return \`<section data-today-section="daily-queue">
    <h2>Daily queue</h2>
    <article class="item daily-queue-card">
      <div class="split">
        <div>
          <p class="eyebrow">Focused daily review</p>
          <h3>\${escapeHtml(item.label)}</h3>
          <p class="pill">\${escapeHtml(item.item_type.replaceAll("_", " "))} · \${escapeHtml(item.target_id)}</p>
          <p class="meta">\${escapeHtml(item.detail)}</p>
        </div>
        <div class="action-row">
          <button type="button" class="secondary daily-queue-prev" \${dailyQueueIndex === 0 ? "disabled" : ""}>Previous</button>
          <button type="button" class="secondary daily-queue-next" \${dailyQueueIndex >= queue.items.length - 1 ? "disabled" : ""}>Next</button>
        </div>
      </div>
      \${detailListHtml([
        ["Suggested action", item.suggested_action],
        ["Affected files", item.affected_files.join(", ") || "none"],
        ["Source Events", item.source_events.join(", ") || "none"],
        ["Route", item.route_hint],
        ["Counts", countSummary]
      ])}
      \${dailyQueueItemActionHtml(item)}
      <ol class="compact-list">\${list}</ol>
    </article>
  </section>\`;
}

function dailyQueueItemActionHtml(item) {
  if (item.item_type === "pending_transaction") {
    return \`<div class="action-stack">
      <form class="today-transaction-apply-form" data-transaction-id="\${escapeHtml(item.target_id)}">
        <div class="action-row">
          <button type="submit" name="mode" value="preview" class="secondary">Preview apply</button>
          <button type="submit" name="mode" value="apply">Apply transaction</button>
        </div>
      </form>
      <form class="today-transaction-reject-form" data-transaction-id="\${escapeHtml(item.target_id)}">
        <div class="action-row">
          <input name="reason" placeholder="Rejection reason">
          <button type="submit" name="mode" value="preview" class="secondary">Preview reject</button>
          <button type="submit" name="mode" value="apply">Reject transaction</button>
        </div>
      </form>
    </div>\`;
  }

  if (item.item_type === "stale_noop_event") {
    return \`<form class="today-stale-reprocess-form" data-event-id="\${escapeHtml(item.target_id)}">
      <div class="action-row">
        <button type="submit" name="mode" value="preview" class="secondary">Preview reprocess</button>
        <button type="submit" name="mode" value="apply">Stage reprocess</button>
      </div>
    </form>\`;
  }

  if (item.item_type === "health_finding") {
    return \`<form class="daily-health-finding-form" data-finding-id="\${escapeHtml(item.target_id)}">
      <div class="action-row">
        <input name="note" placeholder="Finding note">
        <button type="submit" name="mode" value="preview" class="secondary">Preview finding</button>
        <button type="submit" name="mode" value="apply">Stage finding</button>
      </div>
    </form>\`;
  }

  if (item.item_type === "review_item") {
    return \`<div class="action-row">
      <button type="button" class="secondary daily-open-review-item" data-review-id="\${escapeHtml(item.target_id)}">Open Review</button>
    </div>\`;
  }

  return \`<div class="action-row">
    <button type="button" class="secondary" data-tab-jump="briefs">Open Briefs</button>
  </div>\`;
}

function todayPendingTransactionsHtml(transactions) {
  return todaySectionHtml(
    "Pending Transactions",
    transactions,
    (transaction) => \`<article class="item">
      <h3>\${escapeHtml(transaction.id)}</h3>
      <p class="pill">\${escapeHtml(transaction.operations.join(", ") || "NOOP")} · \${escapeHtml(transaction.risk_level ?? "risk unknown")}</p>
      \${detailListHtml([
        ["Path", transaction.path],
        ["Source Events", transaction.source_events.join(", ") || "none"],
        ["Affected files", transaction.affected_files.join(", ") || "none"],
        ["Requires review", String(Boolean(transaction.requires_review))]
      ])}
      <div class="action-stack">
        <form class="today-transaction-apply-form" data-transaction-id="\${escapeHtml(transaction.id)}">
          <div class="action-row">
            <button type="submit" name="mode" value="preview" class="secondary">Preview apply</button>
            <button type="submit" name="mode" value="apply">Apply transaction</button>
          </div>
        </form>
        <form class="today-transaction-reject-form" data-transaction-id="\${escapeHtml(transaction.id)}">
          <div class="action-row">
            <input name="reason" placeholder="Rejection reason">
            <button type="submit" name="mode" value="preview" class="secondary">Preview reject</button>
            <button type="submit" name="mode" value="apply">Reject transaction</button>
          </div>
        </form>
      </div>
    </article>\`,
    "No pending Transactions."
  );
}

function todayReviewGroupsHtml(groups) {
  return todaySectionHtml(
    "Staged ReviewItems",
    groups,
    (group) => \`<article class="item">
      <h3>\${escapeHtml(group.review_reason.replaceAll("_", " "))}</h3>
      <p class="pill">\${escapeHtml(group.count)} item\${group.count === 1 ? "" : "s"}</p>
      \${detailListHtml([
        ["Suggested action", group.suggested_action],
        ["Items", group.items.map((item) => item.id).join(", ") || "none"]
      ])}
      <div class="action-row">
        <button type="button" class="secondary today-open-review" data-review-reason="\${escapeHtml(group.review_reason)}">Open Review</button>
      </div>
    </article>\`,
    "No staged ReviewItems."
  );
}

function todayStaleNoopsHtml(events) {
  return todaySectionHtml(
    "Stale NOOP Events",
    events,
    (event) => \`<article class="item">
      <h3>\${escapeHtml(event.event_id || event.finding_id)}</h3>
      <p class="pill">\${escapeHtml(event.transaction_id ?? "transaction unknown")}</p>
      \${detailListHtml([
        ["Finding", event.finding_id],
        ["Message", event.message],
        ["Affected files", event.affected_files.join(", ") || "none"],
        ["Suggested action", event.suggested_action]
      ])}
      \${event.event_id ? \`<form class="today-stale-reprocess-form" data-event-id="\${escapeHtml(event.event_id)}">
        <div class="action-row">
          <button type="submit" name="mode" value="preview" class="secondary">Preview reprocess</button>
          <button type="submit" name="mode" value="apply">Stage reprocess</button>
        </div>
      </form>\` : '<p class="meta">No source Event ID is available for reprocessing.</p>'}
    </article>\`,
    "No stale NOOP Events."
  );
}

function todayFollowupsHtml(followups) {
  return todaySectionHtml(
    "Open FollowUps",
    followups,
    (followup) => \`<article class="item">
      <h3>\${escapeHtml(followup.id)}</h3>
      <p class="pill">\${escapeHtml(followup.followup_state)} · \${escapeHtml(followup.review_state)}</p>
      \${detailListHtml([
        ["Path", followup.path],
        ["Owner", followup.owner ?? "unknown"],
        ["Due", followup.due_at ?? "none"],
        ["Source Events", followup.source_events.join(", ") || "none"],
        ["Related", followup.related.join(", ") || "none"]
      ])}
    </article>\`,
    "No open FollowUps."
  );
}

function todayEventsHtml(events) {
  return todaySectionHtml(
    "Recent Events",
    events,
    (event) => \`<article class="item">
      <h3>\${escapeHtml(event.id)}</h3>
      <p class="pill">\${escapeHtml(event.source_label ?? "event")}</p>
      \${detailListHtml([
        ["Path", event.path],
        ["Recorded", event.recorded_at ?? "unknown"],
        ["Observed", event.observed_at ?? "unknown"],
        ["Participants", event.participants.join(", ") || "none"],
        ["Topics", event.topics.join(", ") || "none"],
        ["Derived claims", event.derived_claims.join(", ") || "none"]
      ])}
    </article>\`,
    "No recent Events."
  );
}

function todayFrictionLogsHtml(logs) {
  return todaySectionHtml(
    "Recent friction logs",
    logs,
    (log) => \`<article class="item">
      <h3>\${escapeHtml(log.kind)}</h3>
      <p class="pill">\${escapeHtml(log.source_label ?? "friction")}</p>
      \${detailListHtml([
        ["Event", \`\${log.id} · \${log.path}\`],
        ["Recorded", log.recorded_at ?? "unknown"],
        ["Question", log.question ?? "none"],
        ["Note", log.note]
      ])}
    </article>\`,
    "No recent friction logs."
  );
}

function todayCaptureFeedbackHtml(items) {
  return todaySectionHtml(
    "Recent capture feedback",
    items,
    (item) => \`<article class="item">
      <h3>\${escapeHtml(item.kind)}</h3>
      <p class="pill">\${escapeHtml(item.source_label ?? "capture feedback")}</p>
      \${detailListHtml([
        ["Event", \`\${item.id} · \${item.path}\`],
        ["Recorded", item.recorded_at ?? "unknown"],
        ["Linked Event", item.linked_event ?? "none"],
        ["Linked Transaction", item.linked_transaction ?? "none"],
        ["Note", item.note]
      ])}
    </article>\`,
    "No recent capture feedback."
  );
}

function todayRecentTransactionsHtml(transactions) {
  return todaySectionHtml(
    "Recent Decisions",
    transactions,
    (transaction) => \`<article class="item">
      <h3>\${escapeHtml(transaction.id)}</h3>
      <p class="pill">\${escapeHtml(transaction.transaction_state)} · \${escapeHtml(transaction.operations.join(", ") || "NOOP")}</p>
      \${detailListHtml([
        ["Path", transaction.path],
        ["Created", transaction.created_at ?? "unknown"],
        ["Affected files", transaction.affected_files.join(", ") || "none"]
      ])}
    </article>\`,
    "No recent applied or rejected Transactions."
  );
}

function todayTextListSection(label, items, emptyText) {
  return todaySectionHtml(
    label,
    items,
    (item) => \`<article class="item"><p class="meta">\${escapeHtml(item)}</p></article>\`,
    emptyText
  );
}

function todaySectionHtml(label, items, renderItem, emptyText) {
  const body = items.length
    ? \`<div class="grid">\${items.map(renderItem).join("")}</div>\`
    : \`<article class="item"><h3>Empty</h3><p class="meta">\${escapeHtml(emptyText)}</p></article>\`;

  return \`<section data-today-section="\${escapeHtml(sectionSlug(label))}"><h2>\${escapeHtml(label)}</h2>\${body}</section>\`;
}

function bindTodayActions() {
  for (const button of document.querySelectorAll(".daily-queue-prev")) {
    button.addEventListener("click", () => {
      dailyQueueIndex = Math.max(dailyQueueIndex - 1, 0);
      renderDogfoodHome(dogfoodHome, dailyQueue, useTomorrow, dailySession);
    });
  }

  for (const button of document.querySelectorAll(".daily-queue-next")) {
    button.addEventListener("click", () => {
      dailyQueueIndex = Math.min(dailyQueueIndex + 1, (dailyQueue?.items?.length ?? 1) - 1);
      renderDogfoodHome(dogfoodHome, dailyQueue, useTomorrow, dailySession);
    });
  }

  for (const button of document.querySelectorAll(".daily-queue-select")) {
    button.addEventListener("click", () => {
      dailyQueueIndex = Number(button.dataset.index ?? 0);
      renderDogfoodHome(dogfoodHome, dailyQueue, useTomorrow, dailySession);
    });
  }

  for (const button of document.querySelectorAll(".daily-open-review-item")) {
    button.addEventListener("click", () => {
      reviewReasonFilter = "all";
      activateTab("review");
    });
  }

  for (const button of view.querySelectorAll("[data-tab-jump]")) {
    button.addEventListener("click", () => {
      selectWorkbenchTab(button.dataset.tabJump);
      render();
    });
  }

  for (const button of document.querySelectorAll(".today-open-review")) {
    button.addEventListener("click", () => {
      reviewReasonFilter = button.dataset.reviewReason ?? "all";
      activateTab("review");
    });
  }

  for (const form of document.querySelectorAll(".today-stale-reprocess-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const preview = submitter?.value === "preview";
      await runTodayAction(preview ? "/api/events/reprocess/preview" : "/api/events/reprocess", {
        eventId: form.dataset.eventId,
        stageOnly: true
      });
    });
  }

  for (const form of document.querySelectorAll(".today-transaction-apply-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const preview = submitter?.value === "preview";
      await runTodayAction(preview ? "/api/transactions/apply/preview" : "/api/transactions/apply", {
        id: form.dataset.transactionId
      });
    });
  }

  for (const form of document.querySelectorAll(".today-transaction-reject-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const preview = submitter?.value === "preview";
      await runTodayAction(preview ? "/api/transactions/reject/preview" : "/api/transactions/reject", {
        id: form.dataset.transactionId,
        reason: form.elements.reason.value
      });
    });
  }

  for (const form of document.querySelectorAll(".daily-health-finding-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const preview = submitter?.value === "preview";
      await runTodayAction(preview ? "/api/health/stage-finding/preview" : "/api/health/stage-finding", {
        findingId: form.dataset.findingId,
        note: form.elements.note.value
      });
    });
  }
}

async function runTodayAction(path, body) {
  const output = document.querySelector("#today-action-output");
  output.innerHTML = "<pre>Running</pre>";

  try {
    const result = await postJson(path, body);
    const actionResult = renderActionResult(result);
    if (result.created) {
      await refreshTodayAfterAction();
    }
    const actionOutput = document.querySelector("#today-action-output");
    if (actionOutput) {
      actionOutput.innerHTML = actionResult;
    }
  } catch (error) {
    output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
  }
}

async function refreshTodayAfterAction() {
  snapshot = await fetchJson("/api/snapshot");
  health = null;
  dogfoodHome = await fetchJson("/api/dogfood/home");
  dailyQueue = await fetchJson("/api/daily/queue");
  dailySession = await fetchJson("/api/daily/session");
  useTomorrow = await fetchJson("/api/use-tomorrow");
  dailyQueueIndex = 0;
  reviewTurbo = null;
    reviewAutopilot = null;

  if (activeTab === "today") {
    renderDogfoodHome(dogfoodHome, dailyQueue, useTomorrow, dailySession);
  }
}

function activateTab(name) {
  activeTab = name;
  for (const tab of document.querySelectorAll("[data-tab]")) {
    tab.setAttribute("aria-pressed", String(tab.dataset.tab === name));
  }
  render();
}

async function renderCapture() {
  if (!captureInbox) {
    view.innerHTML = '<article class="item"><h2>Loading Capture</h2><p class="meta">Reading recent Events and pending capture Transactions.</p></article>';
    captureInbox = await fetchJson("/api/capture/inbox");

    if (activeTab !== "capture") {
      return;
    }
  }

  view.innerHTML = \`\${renderCaptureInbox(captureInbox)}
  <article class="item">
    <h2>Capture note</h2>
    <form id="capture-form" class="capture-form">
      <label class="field" for="capture-note"><span>Note</span><textarea id="capture-note" name="note" rows="7" placeholder="Paste a short work note"></textarea></label>
      \${captureTemplatesHtml(captureInbox)}
      <div class="action-row">
        <label class="field" for="capture-observed-at"><span>Observed at</span><input id="capture-observed-at" name="observedAt" placeholder="YYYY-MM-DD"></label>
        <label class="field" for="capture-source-label"><span>Source label</span><input id="capture-source-label" name="sourceLabel" list="capture-source-label-presets" placeholder="standup, slack, meeting note"></label>
      </div>
      \${captureObservedAtShortcutsHtml(captureInbox)}
      <div class="action-row">
        <label class="field" for="capture-context"><span>Context</span><input id="capture-context" name="context" list="capture-context-options" placeholder="Context id, path, or name"></label>
        <label class="field" for="capture-provider"><span>Provider</span><select id="capture-provider" name="provider"><option value="rule">rule</option><option value="openai">openai</option></select></label>
      </div>
      <datalist id="capture-source-label-presets">\${captureInbox.source_label_presets.map((preset) => \`<option value="\${escapeHtml(preset.source_label)}">\${escapeHtml(preset.label)}</option>\`).join("")}</datalist>
      <datalist id="capture-context-options">\${captureInbox.context_suggestions.map((context) => \`<option value="\${escapeHtml(context.id)}">\${escapeHtml(context.name)} · \${escapeHtml(context.path)}</option>\`).join("")}</datalist>
      <div class="action-row">
        <button type="submit" name="mode" value="preview" class="secondary">Preview capture</button>
        <button type="submit" name="mode" value="create">Create pending transaction</button>
      </div>
    </form>
  </article>
  <article class="item">
    <h2>Capture feedback</h2>
    <form id="capture-feedback-form" class="capture-form">
      <label class="field" for="capture-feedback-kind"><span>Feedback kind</span><select id="capture-feedback-kind" name="kind">
        <option value="wrong_person">wrong person</option>
        <option value="missing_context">missing context</option>
        <option value="bad_followup">bad follow-up</option>
        <option value="bad_role_reporting">bad role/reporting</option>
        <option value="other_extraction_issue">other extraction issue</option>
      </select></label>
      <label class="field" for="capture-feedback-note"><span>Feedback note</span><textarea id="capture-feedback-note" name="note" rows="4" placeholder="What did capture or extraction get wrong?"></textarea></label>
      <div class="action-row">
        <label class="field" for="capture-feedback-event"><span>Linked Event</span><input id="capture-feedback-event" name="event" placeholder="ev_..." /></label>
        <label class="field" for="capture-feedback-transaction"><span>Linked Transaction</span><input id="capture-feedback-transaction" name="transaction" placeholder="tx_..." /></label>
      </div>
      <div class="action-row">
        <button type="submit" name="mode" value="preview" class="secondary">Preview feedback</button>
        <button type="submit" name="mode" value="create">Log feedback</button>
      </div>
    </form>
  </article>
  <article class="item">
    <h2>Personal Seed Kit</h2>
    <form id="seed-kit-form" class="capture-form">
      <label class="field" for="seed-my-role"><span>My role</span><textarea id="seed-my-role" name="myRole" rows="3" placeholder="I am an AI Engineer at SmartEquip."></textarea></label>
      <label class="field" for="seed-manager-team"><span>Manager and team</span><textarea id="seed-manager-team" name="managerTeam" rows="3" placeholder="Jeff is my manager. Kuastav reports to Jeff."></textarea></label>
      <label class="field" for="seed-current-projects"><span>Current projects and contexts</span><textarea id="seed-current-projects" name="currentProjects" rows="3" placeholder="Inventory Project uses MySQL."></textarea></label>
      <label class="field" for="seed-important-people"><span>Important people</span><textarea id="seed-important-people" name="importantPeople" rows="3" placeholder="Priya owns the API migration."></textarea></label>
      <label class="field" for="seed-systems-topics"><span>Systems and topics</span><textarea id="seed-systems-topics" name="systemsTopics" rows="3" placeholder="Solr powers product search."></textarea></label>
      <label class="field" for="seed-open-loops"><span>Open loops</span><textarea id="seed-open-loops" name="openLoops" rows="3" placeholder="I need to ask Jeff about onboarding."></textarea></label>
      <label class="field" for="seed-memory-gaps"><span>Things I keep forgetting</span><textarea id="seed-memory-gaps" name="thingsIKeepForgetting" rows="3" placeholder="I keep forgetting who owns reporting."></textarea></label>
      <div class="action-row">
        <button type="submit" name="mode" value="preview" class="secondary">Preview seed kit</button>
        <button type="submit" name="mode" value="create">Create seed kit</button>
      </div>
    </form>
  </article>
  <div id="action-output" class="action-output"></div>\`;
  document.querySelector("#capture-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = event.submitter;
    const preview = submitter?.value === "preview";
    await runAction(preview ? "/api/capture/preview" : "/api/capture", {
      note: form.elements.note.value,
      observedAt: form.elements.observedAt.value,
      sourceLabel: form.elements.sourceLabel.value,
      context: form.elements.context.value,
      provider: form.elements.provider.value
    });
  });
  bindCaptureInboxActions(captureInbox);
  document.querySelector("#capture-feedback-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = event.submitter;
    const preview = submitter?.value === "preview";
    await runAction(preview ? "/api/capture/feedback/preview" : "/api/capture/feedback", {
      kind: form.elements.kind.value,
      note: form.elements.note.value,
      event: form.elements.event.value,
      transaction: form.elements.transaction.value
    });
  });
  document.querySelector("#seed-kit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = event.submitter;
    const preview = submitter?.value === "preview";
    await runAction(preview ? "/api/seed/preview" : "/api/seed/create", {
      myRole: form.elements.myRole.value,
      managerTeam: form.elements.managerTeam.value,
      currentProjects: form.elements.currentProjects.value,
      importantPeople: form.elements.importantPeople.value,
      systemsTopics: form.elements.systemsTopics.value,
      openLoops: form.elements.openLoops.value,
      thingsIKeepForgetting: form.elements.thingsIKeepForgetting.value
    });
  });
}

function renderCaptureInbox(inbox) {
  const pending = inbox.pending_capture_transactions.length
    ? inbox.pending_capture_transactions.map((transaction) => \`<article class="item">
      <h3>\${escapeHtml(transaction.transaction_id)}</h3>
      <p class="pill">\${escapeHtml(transaction.operations.join(", ") || "NOOP")} · \${transaction.requires_review ? "review needed" : "ready"}</p>
      \${detailListHtml([
        ["Path", transaction.path],
        ["Source labels", transaction.source_labels.join(", ") || "none"],
        ["Affected files", transaction.affected_files.join(", ") || "none"],
        ["Likely next action", transaction.likely_next_review_action]
      ])}
      \${plainListHtml("Why staged", transaction.why_staged)}
    </article>\`).join("")
    : '<article class="item"><h3>No pending capture Transactions</h3><p class="meta">New captures will appear here after creation.</p></article>';
  const events = inbox.recent_events.length
    ? inbox.recent_events.map((event) => \`<article class="item">
      <h3>\${escapeHtml(event.event_id)}</h3>
      <p class="pill">\${escapeHtml(event.source_label ?? "event")}</p>
      \${detailListHtml([
        ["Recorded", event.recorded_at ?? "unknown"],
        ["Observed", event.observed_at ?? "unknown"],
        ["Contexts", event.contexts.join(", ") || "none"],
        ["Raw excerpt", event.raw_excerpt || "none"]
      ])}
    </article>\`).join("")
    : '<article class="item"><h3>No recent Events</h3><p class="meta">Capture a note to create the first Event.</p></article>';

  return \`<section id="capture-inbox">
    <h2>Capture inbox</h2>
    <div class="grid">\${pending}</div>
    <h3>Recent Events</h3>
    <div class="grid">\${events}</div>
  </section>\`;
}

function captureTemplatesHtml(inbox) {
  if (!inbox.capture_templates.length) {
    return "";
  }

  return \`<div class="action-row">\${inbox.capture_templates.map((template) => \`<button type="button" class="secondary capture-template" data-template-id="\${escapeHtml(template.template_id)}">\${escapeHtml(template.label)}</button>\`).join("")}</div>\`;
}

function captureObservedAtShortcutsHtml(inbox) {
  if (!inbox.observed_at_shortcuts.length) {
    return "";
  }

  return \`<div class="action-row">\${inbox.observed_at_shortcuts.map((shortcut) => \`<button type="button" class="secondary capture-observed-shortcut" data-date="\${escapeHtml(shortcut.date)}">\${escapeHtml(shortcut.label)}</button>\`).join("")}</div>\`;
}

function bindCaptureInboxActions(inbox) {
  for (const button of document.querySelectorAll(".capture-template")) {
    button.addEventListener("click", () => {
      const template = inbox.capture_templates.find((item) => item.template_id === button.dataset.templateId);

      if (!template) {
        return;
      }

      document.querySelector("#capture-note").value = template.note;
      document.querySelector("#capture-source-label").value = template.source_label;
      document.querySelector("#capture-note").focus();
    });
  }

  for (const button of document.querySelectorAll(".capture-observed-shortcut")) {
    button.addEventListener("click", () => {
      document.querySelector("#capture-observed-at").value = button.dataset.date ?? "";
    });
  }
}

async function renderSourceInbox() {
  if (!sourceInboxList || !sourceInboxHub) {
    view.innerHTML = '<article class="item"><h2>Loading Source Inbox</h2><p class="meta">Reading local noncanonical source sessions.</p></article>';
    const [nextList, nextHub] = await Promise.all([
      sourceInboxList ? Promise.resolve(sourceInboxList) : fetchJson('/api/source-inbox'),
      sourceInboxHub ? Promise.resolve(sourceInboxHub) : fetchJson('/api/source-inbox/hub')
    ]);
    sourceInboxList = nextList;
    sourceInboxHub = nextHub;

    if (activeTab !== 'source-inbox') {
      return;
    }
  }

  view.innerHTML = \`<article class="item">
    <h2>Source Inbox</h2>
    <p class="meta">Inspect local export sessions before any Event or pending Transaction is created.</p>
    <div class="metrics">
      <div class="metric"><span>Sessions</span><strong>\${escapeHtml(sourceInboxHub.totals.sessions)}</strong></div>
      <div class="metric"><span>Units</span><strong>\${escapeHtml(sourceInboxHub.totals.units)}</strong></div>
      <div class="metric"><span>Untriaged</span><strong>\${escapeHtml(sourceInboxHub.totals.untriaged_units)}</strong></div>
      <div class="metric"><span>Duplicate units</span><strong>\${escapeHtml(sourceInboxHub.totals.duplicates)}</strong></div>
    </div>
  </article>
  \${renderSourceCaptureHub(sourceInboxHub)}
  \${renderSourceInboxSearchPanel(sourceInboxSearchResult)}
  <section class="transaction-layout">
    <div class="grid">
      \${renderSourceInboxSessionList(sourceInboxList)}
    </div>
    <div id="source-inbox-detail" class="detail-panel">
      \${sourceInboxSession ? renderSourceInboxSession(sourceInboxSession) : '<article class="item"><h2>No session selected</h2><p class="meta">Open a session to inspect source units, spans, metadata, and duplicate state.</p></article>'}
    </div>
  </section>
  <article class="item">
    <h2>Preview source export</h2>
    <form id="source-inbox-preview-form" class="capture-form">
      <div class="action-row">
        <label class="field" for="source-inbox-kind"><span>Adapter kind</span><select id="source-inbox-kind" name="kind">
          <option value="eml">eml</option>
          <option value="mbox">mbox</option>
          <option value="ics">ics</option>
          <option value="slack_json">slack_json</option>
          <option value="teams_json">teams_json</option>
          <option value="github_json">github_json</option>
          <option value="tracker_csv">tracker_csv</option>
          <option value="repo_markdown">repo_markdown</option>
          <option value="web_clip_text">web_clip_text</option>
          <option value="browser_note">browser_note</option>
          <option value="local_snippet">local_snippet</option>
          <option value="markdown">markdown</option>
          <option value="text">text</option>
          <option value="email">email</option>
          <option value="calendar">calendar</option>
          <option value="chat">chat</option>
        </select></label>
        <label class="field" for="source-inbox-source-label"><span>Source label</span><input id="source-inbox-source-label" name="sourceLabel" placeholder="github export, slack export, calendar export"></label>
      </div>
      <label class="field" for="source-inbox-raw-text"><span>Raw source export</span><textarea id="source-inbox-raw-text" name="rawText" rows="8" placeholder="Paste a local export snippet for preview"></textarea></label>
      <div class="action-row">
        <label class="field" for="source-inbox-path"><span>Path</span><input id="source-inbox-path" name="path" placeholder="Optional local export path"></label>
        <label class="field" for="source-inbox-observed-at"><span>Observed at</span><input id="source-inbox-observed-at" name="observedAt" placeholder="YYYY-MM-DD"></label>
        <label class="field" for="source-inbox-context"><span>Context</span><input id="source-inbox-context" name="context" placeholder="Optional context id"></label>
        <label class="field" for="source-inbox-limit"><span>Limit</span><input id="source-inbox-limit" name="limit" inputmode="numeric" placeholder="Optional"></label>
      </div>
      <div class="action-row">
        <button type="submit" class="secondary">Preview source export</button>
      </div>
    </form>
  </article>
  <div id="source-inbox-output" class="action-output"></div>\`;
  bindSourceInboxActions();
  bindSourceInboxSessionControls();
}



function renderSourceCaptureHub(hub) {
  if (!hub) {
    return '';
  }

  const duplicateGroups = (hub.duplicate_groups ?? []).map((group) => group.source_hash + ' · ' + group.unit_count + ' unit(s)');

  return '<section class="grid">' +
    '<article class="item"><h2>Next source action</h2><p class="pill">' + escapeHtml(hub.next_recommended_action.action) + '</p><p class="meta">' + escapeHtml(hub.next_recommended_action.label) + '</p>' + (hub.next_recommended_action.session_id ? detailListHtml([['Session', hub.next_recommended_action.session_id]]) : '') + '</article>' +
    '<article class="item"><h2>Review load forecast</h2>' + detailListHtml([
      ['Total units', String(hub.review_load_forecast.total_units)],
      ['Likely safe', String(hub.review_load_forecast.likely_safe)],
      ['Likely staged', String(hub.review_load_forecast.likely_staged)],
      ['Likely conflicts', String(hub.review_load_forecast.likely_conflict)],
      ['Duplicates', String(hub.review_load_forecast.duplicates)]
    ]) + '</article>' +
    '<article class="item"><h2>Adapter counts</h2>' + plainListHtml('Adapters', Object.entries(hub.adapter_counts).map(([key, value]) => key + ': ' + value)) + '</article>' +
    '<article class="item"><h2>Duplicate groups</h2>' + plainListHtml('Groups', duplicateGroups) + '</article>' +
  '</section>';
}

function renderSourceInboxSearchPanel(result) {
  return '<article class="item">' +
    '<h2>Search source units</h2>' +
    '<form id="source-inbox-search-form" class="capture-form">' +
      '<div class="action-row">' +
        '<label class="field" for="source-inbox-search-query"><span>Query</span><input id="source-inbox-search-query" name="query" placeholder="person, system, source text"></label>' +
        '<label class="field" for="source-inbox-search-kind"><span>Kind</span><input id="source-inbox-search-kind" name="kind" placeholder="Optional adapter kind"></label>' +
        '<label class="field" for="source-inbox-search-triage"><span>Triage</span><select id="source-inbox-search-triage" name="triage"><option value="">any</option><option value="untriaged">untriaged</option><option value="keep">keep</option><option value="skip">skip</option><option value="split">split</option><option value="merge">merge</option></select></label>' +
        '<label class="field" for="source-inbox-search-duplicate"><span>Duplicate</span><select id="source-inbox-search-duplicate" name="duplicate"><option value="">any</option><option value="new">new</option><option value="duplicate">duplicate</option></select></label>' +
      '</div>' +
      '<div class="action-row"><button type="submit" class="secondary">Search sources</button></div>' +
    '</form>' +
    '<div id="source-inbox-search-results">' + (result ? renderSourceInboxSearchResult(result) : '<p class="meta">Search local Source Inbox units without creating Events.</p>') + '</div>' +
  '</article>';
}

function renderSourceInboxSearchResult(result) {
  const cards = (result.matches ?? []).map((match) => '<article class="item"><h3>' + escapeHtml(match.unit_id) + '</h3><p class="pill">' + escapeHtml(match.adapter_kind) + ' · ' + escapeHtml(match.triage_state) + ' · ' + escapeHtml(match.duplicate_state) + '</p>' + detailListHtml([
    ['Session', match.session_id],
    ['Source label', match.source_label],
    ['Observed', match.observed_at ?? 'unknown'],
    ['Contexts', (match.contexts ?? []).join(', ') || 'none'],
    ['Source hash', match.source_hash],
    ['Raw excerpt', match.raw_excerpt || 'none']
  ]) + '</article>').join('');
  return '<section><h3>Matches: ' + escapeHtml(String(result.match_count)) + '</h3><div class="grid">' + (cards || '<article class="item"><h3>No matches</h3><p class="meta">Try another source query or filter.</p></article>') + '</div></section>';
}

function renderSourceInboxSessionList(result) {
  if (!result.sessions.length) {
    return '<article class="item"><h2>No source sessions</h2><p class="meta">Preview a local export to create a noncanonical Source Inbox session.</p></article>';
  }

  return result.sessions.map((session) => \`<article class="item">
    <h2>\${escapeHtml(session.session_id)}</h2>
    <p class="pill">\${escapeHtml(session.adapter_kind)} · \${escapeHtml(session.import_status)}</p>
    \${detailListHtml([
      ['Source label', session.source_label ?? 'none'],
      ['Source path', session.source_path ?? 'none'],
      ['Updated', session.updated_at],
      ['Units', String(session.unit_count)],
      ['New units', String(session.new_units)],
      ['Duplicate units', String(session.duplicate_units)],
      ['Source hashes', session.source_hashes.slice(0, 3).join(', ') || 'none']
    ])}
    \${plainListHtml('Warnings', session.warnings)}
    <div class="action-row"><button type="button" class="secondary source-inbox-open" data-session-id="\${escapeHtml(session.session_id)}">Open session</button></div>
  </article>\`).join('');
}

function bindSourceInboxActions() {
  for (const button of document.querySelectorAll('.source-inbox-open')) {
    button.addEventListener('click', async () => {
      const detail = document.querySelector('#source-inbox-detail');
      detail.innerHTML = '<article class="item"><h2>Loading session</h2></article>';

      try {
        sourceInboxSession = await fetchJson(\`/api/source-inbox/session?id=\${encodeURIComponent(button.dataset.sessionId ?? '')}\`);
        detail.innerHTML = renderSourceInboxSession(sourceInboxSession);
        bindSourceInboxSessionControls();
      } catch (error) {
        detail.innerHTML = \`<article class="item"><h2>Session error</h2><pre>\${escapeHtml(error.message)}</pre></article>\`;
      }
    });
  }

  document.querySelector('#source-inbox-search-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const output = document.querySelector('#source-inbox-search-results');
    const params = new URLSearchParams();
    for (const key of ['query', 'kind', 'triage', 'duplicate']) {
      const value = form.elements[key]?.value?.trim();
      if (value) {
        params.set(key, value);
      }
    }
    output.innerHTML = '<pre>Searching</pre>';

    try {
      sourceInboxSearchResult = await fetchJson('/api/source-inbox/search?' + params.toString());
      output.innerHTML = renderSourceInboxSearchResult(sourceInboxSearchResult);
    } catch (error) {
      output.innerHTML = '<pre>' + escapeHtml(error.message) + '</pre>';
    }
  });

  document.querySelector('#source-inbox-preview-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const output = document.querySelector('#source-inbox-output');
    output.innerHTML = '<pre>Running</pre>';

    try {
      const result = await postJson('/api/source-inbox/preview', {
        kind: form.elements.kind.value,
        rawText: form.elements.rawText.value,
        path: form.elements.path.value,
        sourceLabel: form.elements.sourceLabel.value,
        observedAt: form.elements.observedAt.value,
        context: form.elements.context.value,
        limit: form.elements.limit.value
      });
      sourceInboxList = await fetchJson('/api/source-inbox');
      sourceInboxHub = await fetchJson('/api/source-inbox/hub');
      sourceInboxSession = result.source_inbox_session;
      await renderSourceInbox();
      document.querySelector('#source-inbox-output').innerHTML = renderSourceInboxPreviewResult(result);
    } catch (error) {
      output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
    }
  });
}

function bindSourceInboxSessionControls() {
  const form = document.querySelector('#source-inbox-triage-form');
  const output = document.querySelector('#source-inbox-output');
  const detail = document.querySelector('#source-inbox-detail');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!sourceInboxSession) {
      return;
    }

    output.innerHTML = '<pre>Saving triage</pre>';
    const decisions = sourceInboxSession.units.map((unit) => ({
      unitId: unit.unit_id,
      action: form.elements.action.value,
      sourceLabel: form.elements.sourceLabel.value,
      observedAt: form.elements.observedAt.value,
      context: form.elements.context.value,
      note: form.elements.note.value
    }));

    try {
      sourceInboxSession = await postJson('/api/source-inbox/triage', { sessionId: sourceInboxSession.session_id, decisions });
      sourceInboxList = await fetchJson('/api/source-inbox');
      sourceInboxHub = await fetchJson('/api/source-inbox/hub');
      detail.innerHTML = renderSourceInboxSession(sourceInboxSession);
      bindSourceInboxSessionControls();
      output.innerHTML = \`<pre>\${escapeHtml(JSON.stringify({ session_id: sourceInboxSession.session_id, import_status: sourceInboxSession.import_status, triage_counts: sourceInboxSession.triage_counts }, null, 2))}</pre>\`;
    } catch (error) {
      output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
    }
  });

  document.querySelector('#source-inbox-create-events')?.addEventListener('click', async () => {
    if (!sourceInboxSession) {
      return;
    }

    output.innerHTML = '<pre>Creating Events and pending Transactions</pre>';

    try {
      const result = await postJson('/api/source-inbox/create-events', { sessionId: sourceInboxSession.session_id });
      sourceInboxList = await fetchJson('/api/source-inbox');
      sourceInboxHub = await fetchJson('/api/source-inbox/hub');
      sourceInboxSession = await fetchJson(\`/api/source-inbox/session?id=\${encodeURIComponent(sourceInboxSession.session_id)}\`);
      detail.innerHTML = renderSourceInboxSession(sourceInboxSession);
      bindSourceInboxSessionControls();
      output.innerHTML = renderSourceInboxCreateEventsResult(result);
    } catch (error) {
      output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
    }
  });
}

function renderSourceInboxSession(session) {
  return \`<article class="item">
    <h2>Session \${escapeHtml(session.session_id)}</h2>
    <p class="pill">\${escapeHtml(session.adapter_kind)} · \${escapeHtml(session.import_status)}</p>
    \${detailListHtml([
      ['Source label', session.source_label ?? 'none'],
      ['Source path', session.source_path ?? 'none'],
      ['Created', session.created_at],
      ['Updated', session.updated_at],
      ['Units', String(session.unit_count)],
      ['Review forecast', sourceInboxReviewForecastLabel(session.review_load_forecast)]
    ])}
    \${plainListHtml('Warnings', session.warnings)}
    \${renderSourceInboxTriageControls(session)}
    <section>
      <h3>Source units</h3>
      <div class="grid">\${session.units.map(renderSourceInboxUnit).join('')}</div>
    </section>
  </article>\`;
}

function renderSourceInboxTriageControls(session) {
  return \`<form id="source-inbox-triage-form" class="capture-form" data-session-id="\${escapeHtml(session.session_id)}">
    <h3>Triage create flow</h3>
    <div class="action-row">
      <label class="field" for="source-inbox-triage-action"><span>Decision</span><select id="source-inbox-triage-action" name="action"><option value="keep">keep all visible units</option><option value="skip">skip all visible units</option><option value="edit_metadata">edit metadata and keep</option></select></label>
      <label class="field" for="source-inbox-triage-label"><span>Source label</span><input id="source-inbox-triage-label" name="sourceLabel" placeholder="Optional label override"></label>
      <label class="field" for="source-inbox-triage-observed"><span>Observed at</span><input id="source-inbox-triage-observed" name="observedAt" placeholder="YYYY-MM-DD"></label>
      <label class="field" for="source-inbox-triage-context"><span>Context</span><input id="source-inbox-triage-context" name="context" placeholder="Optional context id"></label>
    </div>
    <label class="field" for="source-inbox-triage-note"><span>Triage note</span><input id="source-inbox-triage-note" name="note" placeholder="Optional note"></label>
    <div class="action-row"><button type="submit" class="secondary">Save triage decisions</button><button type="button" id="source-inbox-create-events">Create Events + pending Transactions</button></div>
  </form>\`;
}

function renderSourceInboxCreateEventsResult(result) {
  return \`<article class="item"><h2>Source create-events result</h2>
    \${detailListHtml([
      ['Session', result.session_id],
      ['Created', String(result.units_created ?? 0)],
      ['Skipped', String(result.units_skipped ?? 0)],
      ['Provider', result.provider_name ?? 'rule-based'],
      ['Canonical writes', String(result.canonical_writes?.length ?? 0)]
    ])}
    <div class="grid">\${(result.units ?? []).map((unit) => \`<article class="item"><h3>\${escapeHtml(unit.unit_id)}</h3>\${detailListHtml([
      ['Created', String(Boolean(unit.created))],
      ['Skipped', String(Boolean(unit.skipped))],
      ['Skip reason', unit.skip_reason ?? 'none'],
      ['Event', unit.event_id ? unit.event_id + ' (' + unit.event_path + ')' : 'none'],
      ['Transaction', unit.transaction_id ? unit.transaction_id + ' (' + unit.transaction_path + ')' : 'none'],
      ['Validation', unit.validation?.passed ? 'passed' : unit.validation ? 'failed' : 'none']
    ])}</article>\`).join('')}</div>
  </article>\`;
}

function renderSourceInboxPreviewResult(result) {
  return \`<article class="item">
    <h2>Source preview saved</h2>
    <p class="pill">\${escapeHtml(result.adapter_kind)}</p>
    \${detailListHtml([
      ['Session', result.source_inbox_session?.session_id ?? 'none'],
      ['Units', String(result.units?.length ?? 0)],
      ['Likely safe', String(result.review_load_forecast?.likely_safe ?? 0)],
      ['Likely staged', String(result.review_load_forecast?.likely_staged ?? 0)],
      ['Likely conflicts', String(result.review_load_forecast?.likely_conflict ?? 0)],
      ['Duplicates', String(result.review_load_forecast?.duplicates ?? 0)],
      ['Canonical writes', String(result.canonical_writes?.length ?? 0)]
    ])}
    \${plainListHtml('Warnings', result.warnings)}
    <section>
      <h3>Previewed units</h3>
      <div class="grid">\${(result.units ?? []).map(renderSourceInboxUnit).join('')}</div>
    </section>
  </article>\`;
}

function renderSourceInboxUnit(unit) {
  const excerpt = (unit.raw_text ?? '').slice(0, 260);

  return \`<article class="item">
    <h3>\${escapeHtml(unit.unit_id)}</h3>
    <p class="pill">\${escapeHtml(unit.duplicate_state ?? 'new')}\${unit.skip_reason ? \` · \${escapeHtml(unit.skip_reason)}\` : ''}</p>
    \${detailListHtml([
      ['Adapter', unit.adapter_kind ?? 'unknown'],
      ['Source label', unit.source_label ?? 'none'],
      ['Observed', unit.observed_at ?? 'unknown'],
      ['Contexts', (unit.contexts ?? []).join(', ') || 'none'],
      ['Triage state', unit.triage_state ?? 'untriaged'],
      ['Source hash', unit.source_hash ?? 'none'],
      ['Raw excerpt', excerpt || 'none']
    ])}
    \${plainListHtml('Source spans', (unit.source_spans ?? []).map(sourceInboxSpanLabel))}
    \${plainListHtml('Metadata', Object.entries(unit.metadata ?? {}).map(([key, value]) => \`\${key}: \${value}\`))}
  </article>\`;
}

function sourceInboxSpanLabel(span) {
  const path = span.source_path ?? 'source';
  const range = span.start_line && span.end_line
    ? \`:\${span.start_line}-\${span.end_line}\`
    : span.start_line
      ? \`:\${span.start_line}\`
      : '';
  const offsets = span.start_offset !== undefined && span.end_offset !== undefined ? \` offsets \${span.start_offset}-\${span.end_offset}\` : '';
  return \`\${span.label ? \`\${span.label}: \` : ''}\${path}\${range}\${offsets}\`;
}

function sourceInboxReviewForecastLabel(forecast) {
  if (!forecast) {
    return 'none';
  }

  return \`\${forecast.total_units} units · \${forecast.likely_safe} safe · \${forecast.likely_staged} staged · \${forecast.likely_conflict} conflicts · \${forecast.duplicates} duplicates\`;
}

function renderImport() {
  view.innerHTML = \`<section id="import-assistant-section">
    <article class="item"><h2>Import assistant</h2><p class="meta">Loading import guidance.</p></article>
  </section>
  <article class="item">
    <h2>Import notes</h2>
    <form id="import-form" class="capture-form">
      <label class="field" for="import-text"><span>Batch text</span><textarea id="import-text" name="text" rows="8" placeholder="Paste Markdown or text notes. Put --- on its own line between notes."></textarea></label>
      <div class="action-row">
        <label class="field" for="import-path"><span>Path</span><input id="import-path" name="path" placeholder="Optional local file or directory path"></label>
        <label class="field" for="import-glob"><span>Glob</span><input id="import-glob" name="glob" value="*.md,*.txt"></label>
      </div>
      <div class="action-row">
        <label class="field" for="import-observed-at"><span>Observed at</span><input id="import-observed-at" name="observedAt" placeholder="YYYY-MM-DD"></label>
        <label class="field" for="import-source-label"><span>Source label</span><input id="import-source-label" name="sourceLabel" placeholder="curated notes, journal, project archive"></label>
      </div>
      <div class="action-row">
        <label class="field" for="import-provider"><span>Provider</span><select id="import-provider" name="provider"><option value="rule">rule</option><option value="openai">openai</option></select></label>
        <label class="field" for="import-limit"><span>Limit</span><input id="import-limit" name="limit" inputmode="numeric" placeholder="Optional"></label>
      </div>
      <div class="action-row">
        <button type="submit" name="mode" value="preview" class="secondary">Preview import</button>
        <button type="submit" name="mode" value="create">Create pending imports</button>
        <button type="submit" name="mode" value="triage" class="secondary">Prepare triage</button>
      </div>
    </form>
  </article>
  <section id="import-triage-section"></section>
  <div id="import-output" class="action-output"></div>\`;
  void loadImportAssistant();
  document.querySelector("#import-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = event.submitter;
    const mode = submitter?.value ?? "preview";
    const preview = submitter?.value === "preview";
    const output = document.querySelector("#import-output");
    output.innerHTML = "<pre>Running</pre>";

    try {
      const body = {
        text: form.elements.text.value,
        path: form.elements.path.value,
        glob: form.elements.glob.value,
        observedAt: form.elements.observedAt.value,
        sourceLabel: form.elements.sourceLabel.value,
        provider: form.elements.provider.value,
        limit: form.elements.limit.value
      };
      const result = await postJson(mode === "triage" ? "/api/import/triage/preview" : preview ? "/api/import/preview" : "/api/import", body);

      if (mode === "triage") {
        importTriageUnits = triageUnitsFromResult(result);
        renderImportTriageEditor(result);
        void loadImportAssistant();
        output.innerHTML = "";
      } else {
        output.innerHTML = renderImportResult(result);
      }
    } catch (error) {
      output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
    }
  });
}

async function loadImportAssistant() {
  const section = document.querySelector("#import-assistant-section");

  if (!section) {
    return;
  }

  try {
    renderImportAssistant(await fetchJson("/api/import/assistant"));
  } catch (error) {
    section.innerHTML = \`<article class="item"><h2>Import assistant</h2><pre>\${escapeHtml(error.message)}</pre></article>\`;
  }
}

function renderImportAssistant(result) {
  const section = document.querySelector("#import-assistant-section");

  if (!section) {
    return;
  }

  section.innerHTML = \`<article class="item">
    <h2>Import assistant</h2>
    <p class="pill">\${escapeHtml(result.recipe?.title ?? "Import 10 curated notes")}</p>
    \${detailListHtml([
      ["Suggested next batch size", String(result.suggested_next_batch_size ?? 10)],
      ["Local sessions", String(result.session_count ?? 0)],
      ["Review load", result.review_load_forecast?.level ?? "empty"],
      ["Review load message", result.review_load_forecast?.message ?? "No import sessions yet."],
      ["Estimated review minutes", String(result.review_load_forecast?.estimated_review_minutes ?? 0)],
      ["Likely safe", String(result.likely_counts?.safe ?? 0)],
      ["Likely staged", String(result.likely_counts?.staged ?? 0)],
      ["Likely conflicts", String(result.likely_counts?.conflicts ?? 0)],
      ["Duplicates", String(result.likely_counts?.duplicates ?? 0)]
    ])}
    \${plainListHtml("Recipe", result.recipe?.steps ?? [])}
    \${plainListHtml("Suggested actions", result.suggested_actions ?? [])}
    \${plainListHtml("Duplicate groups", (result.duplicate_groups ?? []).map((group) => \`\${group.source_hash.slice(0, 12)}: \${group.unit_ids.join(", ")}\`))}
    \${plainListHtml("Warnings", result.warnings ?? [])}
  </article>\`;
}

function triageUnitsFromResult(result) {
  return (result.units ?? []).map((unit, index) => ({
    unit_id: unit.unit_id ?? \`unit_\${index + 1}\`,
    action: unit.triage_action ?? (unit.skipped ? "skip" : "keep"),
    raw_text: unit.event_raw_text ?? "",
    source_path: unit.source_path ?? "",
    source_label: unit.source_label ?? "",
    observed_at: unit.observed_at ?? "",
    context: unit.context ?? ""
  }));
}

function renderImportTriageEditor(result = null) {
  const section = document.querySelector("#import-triage-section");

  if (!section) {
    return;
  }

  const cards = importTriageUnits.map((unit, index) => importTriageUnitHtml(unit, index)).join("");
  section.innerHTML = \`<article class="item">
    <h2>Import triage</h2>
    <p class="meta">Edit, split, merge, or skip curated Markdown/text units before creating Event plus pending Transaction records.</p>
    \${result ? detailListHtml([
      ["Session", result.session_id ?? "none"],
      ["Units", String(result.units_total ?? importTriageUnits.length)],
      ["Kept", String(result.units_kept ?? result.units_imported ?? 0)],
      ["Skipped", String(result.units_skipped ?? 0)],
      ["Likely safe", String(result.likely_counts?.safe ?? 0)],
      ["Likely staged", String(result.likely_counts?.staged ?? 0)],
      ["Duplicates", String(result.likely_counts?.duplicates ?? 0)],
      ["Estimated review units", String(result.estimated_review_load?.units_needing_review ?? 0)],
      ["Canonical writes", String(result.canonical_writes?.length ?? 0)]
    ]) : ""}
    \${result?.session_id ? \`<div class="action-row"><button type="button" class="secondary import-session-load" data-session-id="\${escapeHtml(result.session_id)}">Reload import session</button></div>\` : ""}
    <form id="import-triage-form" class="action-stack">
      <div id="import-triage-units" class="grid">\${cards || '<article class="item"><h3>Empty</h3><p class="meta">No triage units.</p></article>'}</div>
      <div class="action-row">
        <button type="submit" name="mode" value="preview" class="secondary">Preview triage</button>
        <button type="submit" name="mode" value="create">Create triage</button>
      </div>
    </form>
  </article>\`;
  bindImportTriageActions();
}

function importTriageUnitHtml(unit, index) {
  const number = index + 1;
  const action = unit.action === "skip" ? "skip" : "keep";

  return \`<article class="item import-triage-unit" data-unit-index="\${index}">
    <h3>Unit \${number}</h3>
    <label class="field" for="import-triage-text-\${index}"><span>Unit \${number} text</span><textarea id="import-triage-text-\${index}" name="rawText" rows="5">\${escapeHtml(unit.raw_text)}</textarea></label>
    <div class="action-row">
      <label class="field" for="import-triage-action-\${index}"><span>Unit \${number} action</span><select id="import-triage-action-\${index}" name="action"><option value="keep"\${action === "keep" ? " selected" : ""}>keep</option><option value="skip"\${action === "skip" ? " selected" : ""}>skip</option></select></label>
      <label class="field" for="import-triage-source-\${index}"><span>Unit \${number} source label</span><input id="import-triage-source-\${index}" name="sourceLabel" value="\${escapeHtml(unit.source_label)}"></label>
    </div>
    <div class="action-row">
      <label class="field" for="import-triage-observed-\${index}"><span>Unit \${number} observed at</span><input id="import-triage-observed-\${index}" name="observedAt" value="\${escapeHtml(unit.observed_at)}"></label>
      <label class="field" for="import-triage-context-\${index}"><span>Unit \${number} context</span><input id="import-triage-context-\${index}" name="context" value="\${escapeHtml(unit.context)}"></label>
    </div>
    <div class="action-row">
      <button type="button" class="secondary import-triage-split">Split unit</button>
      <button type="button" class="secondary import-triage-merge">Merge next</button>
    </div>
  </article>\`;
}

function bindImportTriageActions() {
  for (const card of document.querySelectorAll(".import-triage-unit")) {
    card.querySelector(".import-triage-split")?.addEventListener("click", () => {
      updateImportTriageUnitsFromDom();
      splitImportTriageUnit(Number(card.dataset.unitIndex));
      renderImportTriageEditor();
    });
    card.querySelector(".import-triage-merge")?.addEventListener("click", () => {
      updateImportTriageUnitsFromDom();
      mergeImportTriageUnit(Number(card.dataset.unitIndex));
      renderImportTriageEditor();
    });
  }

  document.querySelector("#import-triage-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    updateImportTriageUnitsFromDom();
    const preview = event.submitter?.value === "preview";
    const output = document.querySelector("#import-output");
    output.innerHTML = "<pre>Running</pre>";

    try {
      const result = await postJson(preview ? "/api/import/triage/preview" : "/api/import/triage", {
        units: importTriageUnits
      });
      importTriageUnits = triageUnitsFromResult(result);
      renderImportTriageEditor(result);
      void loadImportAssistant();
      output.innerHTML = renderImportTriageResult(result);
    } catch (error) {
      output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
    }
  });

  for (const button of document.querySelectorAll(".import-session-load")) {
    button.addEventListener("click", async () => {
      const output = document.querySelector("#import-output");
      output.innerHTML = "<pre>Loading session</pre>";
      try {
        const session = await fetchJson(\`/api/import/session?id=\${encodeURIComponent(button.dataset.sessionId ?? "")}\`);
        importTriageUnits = triageUnitsFromResult(session.result);
        renderImportTriageEditor(session.result);
        void loadImportAssistant();
        output.innerHTML = renderImportTriageResult(session.result);
      } catch (error) {
        output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
      }
    });
  }
}

function updateImportTriageUnitsFromDom() {
  importTriageUnits = [...document.querySelectorAll(".import-triage-unit")].map((card, index) => ({
    unit_id: \`unit_\${index + 1}\`,
    action: card.querySelector("[name='action']").value,
    raw_text: card.querySelector("[name='rawText']").value,
    source_label: card.querySelector("[name='sourceLabel']").value,
    observed_at: card.querySelector("[name='observedAt']").value,
    context: card.querySelector("[name='context']").value
  }));
}

function splitImportTriageUnit(index) {
  const unit = importTriageUnits[index];

  if (!unit) {
    return;
  }

  const parts = unit.raw_text.split(/\\n\\s*\\n/);

  if (parts.length < 2) {
    return;
  }

  const first = parts.shift().trim();
  const second = parts.join("\\n\\n").trim();
  importTriageUnits.splice(index, 1, { ...unit, raw_text: first }, { ...unit, raw_text: second });
}

function mergeImportTriageUnit(index) {
  const current = importTriageUnits[index];
  const next = importTriageUnits[index + 1];

  if (!current || !next) {
    return;
  }

  importTriageUnits.splice(index, 2, {
    ...current,
    raw_text: [current.raw_text, next.raw_text].filter(Boolean).join("\\n\\n")
  });
}

function renderImportResult(result) {
  const units = (result.units ?? []).map((unit) => \`<article class="item">
    <h3>\${escapeHtml(unit.skipped ? "Skipped duplicate" : unit.event_id)}</h3>
    <p class="pill">\${escapeHtml(unit.skipped ? unit.skip_reason : unit.transaction_id)}</p>
    \${detailListHtml([
      ["Source", unit.source_path ?? unit.source_label ?? "pasted import"],
      ["Source hash", unit.source_hash],
      ["Event", unit.event_path ? \`\${unit.event_id} · \${unit.event_path}\` : unit.existing_event_path ?? "none"],
      ["Transaction", unit.transaction_path ? \`\${unit.transaction_id} · \${unit.transaction_path}\` : "none"],
      ["Validation", unit.validation ? (unit.validation.passed ? "passed" : "failed") : "not run"]
    ])}
    \${plainListHtml("Operations", unit.operations ?? [])}
    \${plainListHtml("Proposed file writes", (unit.proposed_file_writes ?? []).map((write) => write.path ?? write))}
  </article>\`).join("");

  return \`<article class="item action-result">
    <h2>\${result.created ? "Import transactions created" : "Preview import"}</h2>
    <p class="pill">\${escapeHtml(result.provider_name)}</p>
    \${detailListHtml([
      ["Units", String(result.units_total)],
      ["Imported", String(result.units_imported)],
      ["Skipped", String(result.units_skipped)],
      ["Canonical writes", String(result.canonical_writes?.length ?? 0)]
    ])}
  </article>
  <section><h2>Import units</h2><div class="grid">\${units || '<article class="item"><h3>Empty</h3><p class="meta">No import units.</p></article>'}</div></section>\`;
}

function renderImportTriageResult(result) {
  const units = (result.units ?? []).map((unit) => \`<article class="item">
    <h3>\${escapeHtml(unit.skipped ? "Skipped triage unit" : unit.event_id)}</h3>
    <p class="pill">\${escapeHtml(unit.skipped ? unit.skip_reason : unit.transaction_id)}</p>
    \${detailListHtml([
      ["Unit", unit.unit_id],
      ["Action", unit.triage_action],
      ["Source", unit.source_path ?? unit.source_label ?? "pasted import"],
      ["Observed", unit.observed_at ?? "none"],
      ["Context", unit.context ?? "none"],
      ["Source hash", unit.source_hash],
      ["Likely outcome", unit.extraction_summary?.likely_outcome ?? "unknown"],
      ["Claims", String(unit.extraction_summary?.claim_count ?? 0)],
      ["Staged reviews", String(unit.extraction_summary?.staged_review_count ?? 0)],
      ["FollowUps", String(unit.extraction_summary?.followup_count ?? 0)],
      ["Event", unit.event_path ? \`\${unit.event_id} · \${unit.event_path}\` : unit.existing_event_path ?? "none"],
      ["Transaction", unit.transaction_path ? \`\${unit.transaction_id} · \${unit.transaction_path}\` : "none"],
      ["Validation", unit.validation ? (unit.validation.passed ? "passed" : "failed") : "not run"]
    ])}
    \${plainListHtml("Operations", unit.operations ?? [])}
    \${plainListHtml("Proposed file writes", (unit.proposed_file_writes ?? []).map((write) => write.path ?? write))}
  </article>\`).join("");

  return \`<article class="item action-result">
    <h2>\${result.created ? "Triage imports created" : "Preview triage"}</h2>
    <p class="pill">\${escapeHtml(result.provider_name)}</p>
    \${detailListHtml([
      ["Session", result.session_id ?? "none"],
      ["Units", String(result.units_total)],
      ["Kept", String(result.units_kept)],
      ["Skipped", String(result.units_skipped)],
      ["Likely safe", String(result.likely_counts?.safe ?? 0)],
      ["Likely staged", String(result.likely_counts?.staged ?? 0)],
      ["Likely conflicts", String(result.likely_counts?.conflicts ?? 0)],
      ["Duplicates", String(result.likely_counts?.duplicates ?? 0)],
      ["Estimated review units", String(result.estimated_review_load?.units_needing_review ?? 0)],
      ["Canonical writes", String(result.canonical_writes?.length ?? 0)]
    ])}
    \${plainListHtml("Duplicate groups", (result.duplicate_groups ?? []).map((group) => \`\${group.source_hash.slice(0, 12)}: \${group.unit_ids.join(", ")}\`))}
  </article>
  <section><h2>Triage units</h2><div class="grid">\${units || '<article class="item"><h3>Empty</h3><p class="meta">No triage units.</p></article>'}</div></section>\`;
}

async function renderEntities() {
  const requestedKind = entityKind;
  view.innerHTML = '<article class="item"><h2>Loading stewardship console</h2><p class="meta">Reading risk lanes, symbolic facts, evidence, reviews, and follow-ups.</p></article>';
  const [loadedEntities, loadedCommandCenter] = await Promise.all([
    fetchJson("/api/entities/stewardship?kind=" + encodeURIComponent(requestedKind)),
    fetchJson("/api/entities/stewardship-v2?kind=" + encodeURIComponent(requestedKind))
  ]);

  if (activeTab !== "entities" || requestedKind !== entityKind) {
    return;
  }

  entityList = loadedEntities;
  entityCommandCenter = loadedCommandCenter;
  renderEntityExplorer();
}
async function loadEntityDetailWithRoom(id) {
  const detail = await fetchJson(\`/api/entities/stewardship/detail?id=\${encodeURIComponent(id)}\`);

  if (detail.type === "context") {
    try {
      const target = detail.id ?? detail.path;
      const [room, timeline] = await Promise.all([
        fetchJson(\`/api/contexts/operating-room?id=\${encodeURIComponent(target)}\`),
        fetchJson(\`/api/contexts/timeline?id=\${encodeURIComponent(target)}\`)
      ]);
      detail.contextOperatingRoom = room;
      detail.contextTimeline = timeline;
    } catch (error) {
      detail.contextOperatingRoomError = error.message;
    }
  }

  return detail;
}

function renderEntityExplorer() {
  const kindFilters = ["person", "topic", "context"].map((kind) => \`<button type="button" class="reason-filter" data-entity-kind="\${kind}" aria-pressed="\${String(entityKind === kind)}">
    <strong>\${kind === "person" ? "People" : kind === "topic" ? "Topics" : "Contexts"}</strong>
    <span>Inspect risk lanes, evidence, reviews, follow-ups, and stage stewardship changes.</span>
  </button>\`).join("");
  const laneFilters = entityReviewLaneOptions().map((lane) => {
    const count = lane.id === "all" ? entityList?.summary?.total ?? 0 : entityList?.summary?.[lane.id] ?? 0;
    return \`<button type="button" class="reason-filter" data-entity-lane="\${lane.id}" aria-pressed="\${String(entityReviewLaneFilter === lane.id)}">
      <strong>\${escapeHtml(lane.label)} · \${String(count)}</strong>
      <span>\${escapeHtml(lane.description)}</span>
    </button>\`;
  }).join("");
  const items = (entityList?.items ?? []).filter(
    (item) => entityReviewLaneFilter === "all" || item.recommendedReviewLane === entityReviewLaneFilter
  );
  const cards = items.map(entityStewardshipCardHtml).join("");

  view.innerHTML = \`<section>
    <h2>Entity stewardship</h2>
    <p class="meta">Risk lanes are deterministic and read-only. Durable corrections still require explicit preview/stage actions.</p>
    <div class="summary-strip">\${kindFilters}</div>
  </section>
  <section>
    <h2>Risk lanes</h2>
    <div class="summary-strip">\${laneFilters}</div>
  </section>
  \${entityCommandCenterHtml(entityCommandCenter)}
  <section class="transaction-layout">
    <div class="grid">\${cards || '<article class="item"><h2>Empty</h2><p class="meta">No matching entities.</p></article>'}</div>
    <div id="entity-detail" class="detail-panel">\${entityDetail ? entityDetailHtml(entityDetail) : '<article class="item"><h2>Entity detail</h2><p class="meta">Select a Person, Topic, or Context to inspect claims and evidence.</p></article>'}</div>
  </section>
  <div id="entity-action-output" class="action-output"></div>\`;
  bindEntityActions();
  bindBriefLinks();
}

function entityCommandCenterHtml(commandCenter) {
  if (!commandCenter) {
    return '<section><h2>Symbolic stewardship lanes</h2><article class="item"><p class="meta">Loading symbolic-risk lanes.</p></article></section>';
  }

  const summary = commandCenter.summary ?? {};
  const laneCards = [
    ["Safe", summary.safe ?? 0],
    ["Identity risk", summary.identity_risk ?? 0],
    ["Role change", summary.role_change ?? 0],
    ["Reporting change", summary.reporting_change ?? 0],
    ["Ownership change", summary.ownership_change ?? 0],
    ["Stale", summary.stale ?? 0],
    ["Conflict", summary.conflict ?? 0],
    ["With symbolic facts", summary.with_symbolic_facts ?? 0]
  ].map(([label, count]) => '<article class="item"><h3>' + escapeHtml(label) + '</h3><p class="metric">' + String(count) + '</p></article>').join("");
  const riskyItems = (commandCenter.items ?? [])
    .filter((item) => item.recommendedReviewLane !== "safe" || (item.symbolicFactIds ?? []).length > 0)
    .slice(0, 8)
    .map((item) => '<li>' + escapeHtml(item.name) + ' · lane ' + escapeHtml(item.recommendedReviewLane) + ' · risk ' + escapeHtml(item.identityRisk) + ' · symbolic facts ' + String((item.symbolicFactIds ?? []).length) + ' · reviews ' + String(item.linked_review_items_count ?? 0) + '</li>')
    .join("");

  return '<section class="entity-command-center">' +
    '<h2>Symbolic stewardship lanes</h2>' +
    '<p class="meta">Derived v2 risk model over claims, symbolic facts, aliases, reviews, and follow-ups. It is read-only and cannot merge, supersede, or edit memory.</p>' +
    '<div class="grid compact">' + laneCards + '</div>' +
    '<article class="item"><h3>Top symbolic risks</h3>' + (riskyItems ? '<ul class="plain-list">' + riskyItems + '</ul>' : '<p class="meta">No symbolic-risk items for this collection.</p>') + '</article>' +
    plainListHtml("Warnings", commandCenter.warnings ?? []) +
  '</section>';
}
function entityStewardshipCardHtml(item) {
  return \`<article class="item entity-risk-card">
    <h3>\${escapeHtml(item.name)}</h3>
    <p class="pill">\${escapeHtml(item.id ?? item.path)}</p>
    \${detailListHtml([
      ["Path", item.path],
      ["Aliases", item.aliases.join(", ") || "none"],
      ["Identity risk", \`\${item.identityRisk?.level ?? "low"} (\${String(item.identityRisk?.score ?? 0)})\`],
      ["Review lane", entityReviewLaneLabel(item.recommendedReviewLane)],
      ["Risk reasons", (item.identityRisk?.reasons ?? []).join("; ") || "none"],
      ["Duplicate warnings", String((item.nearDuplicates ?? []).length)],
      ["Alias conflicts", String((item.aliasConflicts ?? []).length)],
      ["Role/reporting changes", \`\${(item.roleChanges ?? []).length}/\${(item.reportingChanges ?? []).length}\`],
      ["Linked reviews", String((item.linked_review_items ?? []).length)],
      ["Linked follow-ups", String((item.linked_followups ?? []).length)]
    ])}
    <div class="action-row"><button type="button" class="secondary entity-detail-load" data-entity-id="\${escapeHtml(item.id ?? item.path)}">Open detail</button></div>
  </article>\`;
}

function entityDetailHtml(detail) {
  return \`<article class="item">
    <h2>\${escapeHtml(detail.name)}</h2>
    <p class="pill">\${escapeHtml(detail.type)} · \${escapeHtml(detail.id ?? detail.path)}</p>
    \${detailListHtml([
      ["Path", detail.path],
      ["Aliases", detail.aliases.join(", ") || "none"],
      ["Source Events", detail.source_events.join(", ") || "none"],
      ["Related", detail.related.join(", ") || "none"]
    ])}
    <div class="action-stack">
      \${entityBriefLinksHtml(detail)}
      <form class="entity-alias-form" data-entity-id="\${escapeHtml(detail.id ?? detail.path)}">
        <label class="field"><span>Alias</span><input name="alias" placeholder="New alias"></label>
        <div class="action-row">
          <button type="submit" name="mode" value="preview" class="secondary">Preview alias</button>
          <button type="submit" name="mode" value="stage">Stage alias</button>
        </div>
      </form>
      <form class="entity-context-form" data-entity-id="\${escapeHtml(detail.id ?? detail.path)}">
        <label class="field"><span>Context</span><input name="context" placeholder="Context id, path, name, or alias"></label>
        <div class="action-row">
          <button type="submit" name="mode" value="preview" class="secondary">Preview context</button>
          <button type="submit" name="mode" value="stage">Stage context</button>
        </div>
      </form>
      \${entityRepairFormHtml(detail, "role", "Role correction", "Jeff is the platform DBA.")}
      \${entityRepairFormHtml(detail, "reporting", "Reporting correction", "Jeff reports to Dana.")}
      \${entityIdentityReviewFormHtml(detail)}
      \${entityContextNoteFormHtml(detail)}
    </div>
  </article>
  \${entityRiskCommandCenterHtml(detail)}
  \${contextOperatingRoomHtml(detail.contextOperatingRoom, detail.contextOperatingRoomError)}
  \${contextTimelineHtml(detail.contextTimeline)}
  \${contextOperatingPageHtml(detail.contextOperatingPage)}
  \${entityClaimSectionHtml("Active claims", detail.activeClaims)}
  \${entityClaimSectionHtml("Staged claims", detail.stagedClaims)}
  \${entityClaimSectionHtml("Superseded claims", detail.supersededClaims)}
  \${entityClaimSectionHtml("Role history", detail.roleChanges)}
  \${entityClaimSectionHtml("Reporting history", detail.reportingChanges)}
  \${entityClaimSectionHtml("Ownership history", detail.ownershipChanges)}
  \${entityClaimSectionHtml("Stale claims", detail.staleClaims)}
  \${entityClaimSectionHtml("Conflicting claims", detail.conflictingClaims)}
  \${entityListSectionHtml("Evidence Events", detail.evidenceEvents, (event) => \`\${event.id} · \${event.path}\`)}
  \${entityListSectionHtml("Linked ReviewItems", detail.linkedReviewItems, (item) => \`\${item.id} · \${item.review_reason ?? "review"} · \${item.path}\`)}
  \${entityListSectionHtml("Linked FollowUps", detail.linkedFollowUps, (item) => \`\${item.id} · \${item.followup_state} · \${item.path}\`)}
  \${entityListSectionHtml("Related pages", detail.relatedPages, (item) => \`\${item.id ?? item.path} · \${item.type ?? "page"} · \${item.path}\`)}\`;
}

function entityRiskCommandCenterHtml(detail) {
  const risk = detail.identityRisk ?? { level: "low", score: 0, reasons: [] };
  return \`<article class="item">
    <h3>Stewardship risk</h3>
    \${detailListHtml([
      ["Identity risk", \`\${risk.level} (\${String(risk.score)})\`],
      ["Recommended lane", entityReviewLaneLabel(detail.recommendedReviewLane)],
      ["Risk reasons", (risk.reasons ?? []).join("; ") || "none"],
      ["Suggested allowed action", entityAllowedAction(detail.recommendedReviewLane)]
    ])}
    \${plainListHtml("Near duplicates", (detail.nearDuplicates ?? []).map((item) => \`\${item.name} · \${item.id ?? item.path} · \${item.reason}\`))}
    \${plainListHtml("Alias conflicts", (detail.aliasConflicts ?? []).map((item) => \`\${item.alias} also appears on \${item.conflicts_with.name} · \${item.conflicts_with.id ?? item.conflicts_with.path}\`))}
    <p class="meta">Identity ambiguity remains staged; this console does not merge, split, delete, or autonomously resolve people/topics/contexts.</p>
  </article>\`;
}

function entityRepairFormHtml(detail, kind, label, placeholder) {
  return \`<form class="entity-repair-form" data-entity-id="\${escapeHtml(detail.id ?? detail.path)}" data-repair-kind="\${escapeHtml(kind)}">
    <label class="field"><span>\${escapeHtml(label)}</span><textarea name="statement" rows="3" placeholder="\${escapeHtml(placeholder)}"></textarea></label>
    <div class="action-row">
      <input name="context" placeholder="Optional Context id or path">
      <input name="supersede" placeholder="Optional claim_id to supersede">
    </div>
    <label class="field"><span>Repair note</span><input name="note" placeholder="Optional human note"></label>
    <div class="action-row">
      <button type="submit" name="mode" value="preview" class="secondary">Preview \${escapeHtml(kind)}</button>
      <button type="submit" name="mode" value="stage">Stage \${escapeHtml(kind)}</button>
    </div>
  </form>\`;
}

function entityIdentityReviewFormHtml(detail) {
  return \`<form class="entity-identity-review-form" data-entity-id="\${escapeHtml(detail.id ?? detail.path)}">
    <label class="field"><span>Identity review reason</span><input name="reason" placeholder="Why this entity needs identity review"></label>
    <label class="field"><span>Review note</span><input name="note" placeholder="Optional human note"></label>
    <div class="action-row">
      <button type="submit" name="mode" value="preview" class="secondary">Preview identity review</button>
      <button type="submit" name="mode" value="stage">Stage identity review</button>
    </div>
  </form>\`;
}

function entityContextNoteFormHtml(detail) {
  if (detail.type !== "context") {
    return "";
  }

  return \`<form class="entity-context-note-form" data-entity-id="\${escapeHtml(detail.id ?? detail.path)}">
    <label class="field"><span>Context note or correction</span><textarea name="note" rows="4" placeholder="Capture a project note, correction, decision, or open question"></textarea></label>
    <label class="field"><span>Note type</span><select name="noteType"><option value="note">note</option><option value="correction">correction</option></select></label>
    <div class="action-row">
      <button type="submit" name="mode" value="preview" class="secondary">Preview context note</button>
      <button type="submit" name="mode" value="stage">Stage context note</button>
    </div>
  </form>\`;
}

function entityBriefLinksHtml(detail) {
  if (detail.type !== "person" && detail.type !== "context") {
    return "";
  }

  const target = detail.id ?? detail.path;
  const label = detail.type === "person" ? "Before meeting brief" : "Context status brief";
  const contextButtons = detail.type === "context"
    ? \`<button type="button" class="secondary context-room-load" data-context-id="\${escapeHtml(target)}">Context room</button>
      <button type="button" class="secondary context-dashboard-load" data-context-id="\${escapeHtml(target)}">Open context dashboard</button>\`
    : "";

  return \`<div class="action-row">
    \${briefLinkButtonHtml(detail.type, detail.type, target, label)}
    \${briefLinkButtonHtml("recent", detail.type, target, "Recent changes")}
    \${contextButtons}
  </div>\`;
}

function contextDashboardHtml(dashboard) {
  if (!dashboard) {
    return "";
  }

  return \`<article class="item">
    <h3>Context dashboard</h3>
    \${detailListHtml([
      ["Context", dashboard.context.id ?? dashboard.context.path],
      ["Active facts", String(dashboard.active_facts?.length ?? 0)],
      ["Review items", String(dashboard.review_items?.length ?? 0)],
      ["Evidence Events", String(dashboard.evidence_events?.length ?? 0)]
    ])}
    \${plainListHtml("Quick briefs", (dashboard.quick_briefs ?? []).map((brief) => brief.label))}
    \${plainListHtml("Suggested manual actions", dashboard.suggested_actions ?? [])}
  </article>
  \${entityClaimSectionHtml("Dashboard active facts", dashboard.active_facts ?? [])}
  \${entityClaimSectionHtml("Dashboard roles", dashboard.role_claims ?? [])}
  \${entityClaimSectionHtml("Dashboard decisions", dashboard.decision_claims ?? [])}
  \${entityClaimSectionHtml("Dashboard open questions", dashboard.open_question_claims ?? [])}
  \${entityClaimSectionHtml("Dashboard stale claims", dashboard.stale_claims ?? [])}
  \${entityListSectionHtml("Dashboard FollowUps", dashboard.followups ?? [], (item) => \`\${item.id} · \${item.followup_state} · \${item.path}\`)}
  \${entityListSectionHtml("Dashboard ReviewItems", dashboard.review_items ?? [], (item) => \`\${item.id} · \${item.review_reason ?? "review"} · \${item.path}\`)}
  \${entityListSectionHtml("Dashboard source Events", dashboard.evidence_events ?? [], (event) => \`\${event.id} · \${event.path}\`)}\`;
}

function contextOperatingRoomHtml(room, errorMessage = "") {
  if (errorMessage) {
    return \`<article class="item"><h3>Context operating room</h3><p class="meta">\${escapeHtml(errorMessage)}</p></article>\`;
  }

  if (!room) {
    return "";
  }

  const target = room.context?.id ?? room.context?.path ?? "";
  const ownerRoleClaims = uniqueClaims([
    ...(room.owners ?? []),
    ...(room.currentState ?? []).filter((claim) => /\\b(role|manager|reports to|owner|owns|lead|cto|dba|responsible)\\b/i.test(claim.statement ?? ""))
  ]);
  const sourceTimeline = [
    ...(room.citations?.event_ids ?? []).map((id) => \`Event: \${id}\`),
    ...(room.citations?.review_item_ids ?? []).map((id) => \`ReviewItem: \${id}\`),
    ...(room.citations?.followup_ids ?? []).map((id) => \`FollowUp: \${id}\`)
  ];
  const briefActions = \`<div class="action-row">
    \${briefLinkButtonHtml("context", "context", target, "Context status brief")}
    \${briefLinkButtonHtml("recent", "context", target, "Recent changes")}
    \${briefLinkButtonHtml("review", "context", target, "Review-risk brief")}
    \${briefLinkButtonHtml("followups", "context", target, "Follow-up brief")}
  </div>\`;
  const quickActions = (room.quickActions ?? []).map((action) => {
    if (action.action_id === "capture_context_note") {
      return \`<button type="button" class="secondary focus-context-note">Capture context note</button>\`;
    }

    if (action.action_id === "stage_context_correction") {
      return \`<button type="button" class="secondary focus-context-correction">Stage context correction</button>\`;
    }

    if (action.action_id === "context_status_brief") {
      return briefLinkButtonHtml("context", "context", target, action.label);
    }

    return \`<button type="button" class="secondary context-room-review-risks">\${escapeHtml(action.label)}</button>\`;
  }).join("");

  return \`<article class="item context-room">
    <h3>Context operating room</h3>
    \${detailListHtml([
      ["Context", target],
      ["Current facts", String(room.currentState?.length ?? 0)],
      ["Owners", String(room.owners?.length ?? 0)],
      ["Systems", String(room.systems?.length ?? 0)],
      ["Decisions", String(room.decisions?.length ?? 0)],
      ["Open questions", String(room.openQuestions?.length ?? 0)],
      ["Review risks", String(room.risks?.length ?? 0)]
    ])}
    <div class="action-row">\${quickActions}</div>
    \${plainListHtml("Missing memory prompts", room.missingMemoryPrompts ?? [])}
    \${plainListHtml("Answerable questions", room.answerableQuestions ?? [])}
    \${plainListHtml("Warnings", room.warnings ?? [])}
  </article>
  \${entityClaimSectionHtml("Current state", room.currentState ?? [])}
  \${entityListSectionHtml("Owners and roles", ownerRoleClaims, (claim) => \`\${claim.claim_id}: \${claim.statement} [events: \${claim.evidence.join(", ") || "none"}]\`)}
  \${entityClaimSectionHtml("Systems", room.systems ?? [])}
  \${entityClaimSectionHtml("Decisions", room.decisions ?? [])}
  \${entityClaimSectionHtml("Open questions", room.openQuestions ?? [])}
  \${entityListSectionHtml("Review risks", room.risks ?? [], (risk) => \`\${risk.severity}: \${risk.message} [\${(risk.evidence ?? []).join(", ") || "no evidence"}]\`)}
  \${entityListSectionHtml("Follow-up queue", room.followupQueue ?? [], (item) => \`\${item.id} · \${item.followup_state} · \${item.path}\`)}
  \${entityListSectionHtml("Review queue", room.reviewQueue ?? [], (item) => \`\${item.id} · \${item.review_reason ?? "review"} · \${item.path}\`)}
  \${entityListSectionHtml("Source timeline", sourceTimeline, (item) => item)}
  <article class="item"><h3>Cited briefs</h3>\${briefActions}</article>\`;
}

function contextTimelineHtml(timeline) {
  if (!timeline) {
    return "";
  }

  const items = (timeline.items ?? []).slice(0, 24);
  return \`<article class="item context-timeline">
    <h3>Context timeline</h3>
    \${detailListHtml([
      ["Context", timeline.context?.id ?? timeline.context?.path ?? "unknown"],
      ["Timeline items", String(timeline.items?.length ?? 0)],
      ["Event citations", String(timeline.citations?.event_ids?.length ?? 0)],
      ["Claim citations", String(timeline.citations?.claim_ids?.length ?? 0)]
    ])}
    \${plainListHtml("Warnings", timeline.warnings ?? [])}
  </article>
  \${entityListSectionHtml("Timeline items", items, contextTimelineItemLine)}\`;
}

function contextTimelineItemLine(item) {
  const when = item.occurred_at ?? "unknown time";
  const citations = [
    ...(item.claim_ids ?? []),
    ...(item.source_events ?? [])
  ].join(", ") || "no citations";
  return \`\${when} (\${item.time_basis}) · \${item.item_type} · \${item.title} · state: \${item.state ?? "none"} · changes: \${(item.change_kinds ?? []).join(", ") || "none"} · citations: \${citations}\`;
}

function contextOperatingPageHtml(page) {
  if (!page) {
    return "";
  }

  return \`<article class="item">
    <h3>Context operating page</h3>
    \${detailListHtml([
      ["Context", page.context_id ?? page.context_path],
      ["Active facts", String(page.activeFacts?.length ?? 0)],
      ["Open follow-ups", String(page.openFollowUps?.length ?? 0)]
    ])}
    \${plainListHtml("Suggested manual actions", page.suggestedActions ?? [])}
  </article>
  \${entityClaimSectionHtml("Context active facts", page.activeFacts ?? [])}
  \${entityClaimSectionHtml("Decisions as claims", page.decisionClaims ?? [])}
  \${entityClaimSectionHtml("Open questions as claims", page.openQuestionClaims ?? [])}
  \${entityClaimSectionHtml("Owner claims", page.ownerClaims ?? [])}
  \${entityClaimSectionHtml("Role claims", page.roleClaims ?? [])}
  \${entityClaimSectionHtml("Recent context changes", page.recentChanges ?? [])}
  \${entityListSectionHtml("Related people", page.relatedPeople ?? [], (item) => \`\${item.id ?? item.path} · \${item.type ?? "page"} · \${item.path}\`)}
  \${entityListSectionHtml("Related topics", page.relatedTopics ?? [], (item) => \`\${item.id ?? item.path} · \${item.type ?? "page"} · \${item.path}\`)}
  \${entityListSectionHtml("Open FollowUps", page.openFollowUps ?? [], (item) => \`\${item.id} · \${item.followup_state} · \${item.path}\`)}
  \${entityListSectionHtml("Context ReviewItems", page.linkedReviewItems ?? [], (item) => \`\${item.id} · \${item.review_reason ?? "review"} · \${item.path}\`)}
  \${entityListSectionHtml("Context source Events", page.evidenceEvents ?? [], (event) => \`\${event.id} · \${event.path}\`)}\`;
}

function entityClaimSectionHtml(label, claims) {
  return entityListSectionHtml(
    label,
    claims,
    (claim) =>
      \`\${claim.claim_id}: \${claim.statement} [kind: \${claim.claim_kind ?? "unknown"}; state: \${claim.claim_state ?? "unknown"}; scope: \${claim.scope ?? "none"}; events: \${claim.evidence.join(", ") || "none"}]\`
  );
}

function entityListSectionHtml(label, items, renderItem) {
  return \`<article class="item"><h3>\${escapeHtml(label)}</h3>\${entityListSectionBody(items, renderItem)}</article>\`;
}

function entityListSectionBody(items, renderItem) {
  const body = items.length
    ? \`<ul class="plain-list">\${items.map((item) => \`<li>\${escapeHtml(renderItem(item))}</li>\`).join("")}</ul>\`
    : '<p class="meta">None.</p>';

  return body;
}

function uniqueClaims(claims) {
  const seen = new Set();
  const result = [];

  for (const claim of claims) {
    const key = claim.claim_id ?? \`\${claim.page_path}:\${claim.statement}\`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(claim);
  }

  return result;
}

function entityReviewLaneOptions() {
  return [
    { id: "all", label: "All", description: "Every entity in the selected collection." },
    { id: "identity_ambiguity", label: "Identity ambiguity", description: "Near duplicates or aliases that could cause false merges." },
    { id: "conflict_change", label: "Conflict/change", description: "Role, reporting, ownership, stale, or conflicting claim signals." },
    { id: "needs_context", label: "Needs context", description: "Claims or reviews that need explicit scoping before promotion." },
    { id: "review_backlog", label: "Review backlog", description: "Linked ReviewItems that still need a human decision." },
    { id: "low_risk", label: "Low risk", description: "No current high-priority stewardship warnings." }
  ];
}

function entityReviewLaneLabel(lane) {
  return entityReviewLaneOptions().find((item) => item.id === lane)?.label ?? lane ?? "unknown";
}

function entityAllowedAction(lane) {
  switch (lane) {
    case "identity_ambiguity":
      return "Inspect duplicates/aliases and stage alias or identity review only after human confirmation.";
    case "conflict_change":
      return "Inspect claim history and stage a correction only with explicit evidence.";
    case "needs_context":
      return "Select an existing Context or stage unresolved context review.";
    case "review_backlog":
      return "Open linked ReviewItems and use one-at-a-time preview/apply flows.";
    default:
      return "Preview alias or context updates before staging a pending Transaction.";
  }
}

function bindEntityActions() {
  for (const button of document.querySelectorAll("[data-entity-kind]")) {
    button.addEventListener("click", () => {
      entityKind = button.dataset.entityKind;
      entityReviewLaneFilter = "all";
      entityList = null;
      entityCommandCenter = null;
      entityDetail = null;
      void renderEntities();
    });
  }

  for (const button of document.querySelectorAll("[data-entity-lane]")) {
    button.addEventListener("click", () => {
      entityReviewLaneFilter = button.dataset.entityLane;
      renderEntityExplorer();
    });
  }

  for (const button of document.querySelectorAll(".entity-detail-load")) {
    button.addEventListener("click", async () => {
      const requestedId = button.dataset.entityId;
      const requestedKind = entityKind;
      const loadedDetail = await loadEntityDetailWithRoom(requestedId);

      if (activeTab !== "entities" || requestedKind !== entityKind || requestedId !== button.dataset.entityId) {
        return;
      }

      entityDetail = loadedDetail;
      renderEntityExplorer();
    });
  }

  for (const button of document.querySelectorAll(".context-room-load")) {
    button.addEventListener("click", async () => {
      const output = document.querySelector("#entity-action-output");
      output.innerHTML = "<pre>Loading context room</pre>";

      try {
        const room = await fetchJson(\`/api/contexts/operating-room?id=\${encodeURIComponent(button.dataset.contextId)}\`);
        output.innerHTML = contextOperatingRoomHtml(room);
        bindBriefLinks();
        bindContextRoomShortcuts();
      } catch (error) {
        output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
      }
    });
  }

  for (const button of document.querySelectorAll(".context-dashboard-load")) {
    button.addEventListener("click", async () => {
      const output = document.querySelector("#entity-action-output");
      output.innerHTML = "<pre>Loading context dashboard</pre>";

      try {
        const dashboard = await fetchJson(\`/api/contexts/dashboard?id=\${encodeURIComponent(button.dataset.contextId)}\`);
        output.innerHTML = contextDashboardHtml(dashboard);
        bindBriefLinks();
      } catch (error) {
        output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
      }
    });
  }

  for (const form of document.querySelectorAll(".entity-alias-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const preview = event.submitter?.value === "preview";
      await runEntityAction(preview ? "/api/entities/alias/preview" : "/api/entities/alias/stage", {
        id: form.dataset.entityId,
        alias: form.elements.alias.value
      });
    });
  }

  for (const form of document.querySelectorAll(".entity-context-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const preview = event.submitter?.value === "preview";
      await runEntityAction(preview ? "/api/entities/context/preview" : "/api/entities/context/stage", {
        id: form.dataset.entityId,
        context: form.elements.context.value
      });
    });
  }

  for (const form of document.querySelectorAll(".entity-repair-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const preview = event.submitter?.value === "preview";
      const repairKind = form.dataset.repairKind;
      await runEntityAction(preview ? \`/api/entities/\${repairKind}/preview\` : \`/api/entities/\${repairKind}/stage\`, {
        id: form.dataset.entityId,
        statement: form.elements.statement.value,
        context: form.elements.context.value,
        supersede: form.elements.supersede.value,
        note: form.elements.note.value
      });
    });
  }

  for (const form of document.querySelectorAll(".entity-identity-review-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const preview = event.submitter?.value === "preview";
      await runEntityAction(preview ? "/api/entities/identity-review/preview" : "/api/entities/identity-review/stage", {
        id: form.dataset.entityId,
        reason: form.elements.reason.value,
        note: form.elements.note.value
      });
    });
  }

  for (const form of document.querySelectorAll(".entity-context-note-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const preview = event.submitter?.value === "preview";
      await runEntityAction(preview ? "/api/entities/context-note/preview" : "/api/entities/context-note/stage", {
        id: form.dataset.entityId,
        note: form.elements.note.value,
        noteType: form.elements.noteType.value
      });
    });
  }

  bindContextRoomShortcuts();
}

function bindContextRoomShortcuts() {
  for (const button of document.querySelectorAll(".focus-context-note, .focus-context-correction")) {
    button.addEventListener("click", () => {
      const form = document.querySelector(".entity-context-note-form");

      if (!form) {
        return;
      }

      if (button.classList.contains("focus-context-correction")) {
        form.elements.noteType.value = "correction";
      }

      form.elements.note.focus();
      form.scrollIntoView({ block: "center" });
    });
  }
}

async function runEntityAction(path, body) {
  const output = document.querySelector("#entity-action-output");
  output.innerHTML = "<pre>Running</pre>";

  try {
    const result = await postJson(path, body);
    if (result.created) {
      snapshot = await fetchJson("/api/snapshot");
      dogfoodHome = null;
      dogfoodControlRoom = null;
      useTomorrow = null;
      health = null;
      reviewTurbo = null;
    reviewAutopilot = null;
    }
    output.innerHTML = renderActionResult(result);
  } catch (error) {
    output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
  }
}

function renderTransactions() {
  const items = transactionStateFilter === "all"
    ? snapshot.transactions.items
    : snapshot.transactions.items.filter((item) => item.transaction_state === transactionStateFilter);
  const filters = ["pending", "applied", "rejected", "failed", "all"];
  const filterButtons = filters.map((state) => \`<button type="button" class="reason-filter" data-transaction-state="\${escapeHtml(state)}" aria-pressed="\${String(transactionStateFilter === state)}">
    <strong>\${escapeHtml(state)}</strong>
    <span>\${escapeHtml(String(countTransactions(state)))} transaction\${countTransactions(state) === 1 ? "" : "s"}</span>
    <span>\${state === "pending" ? "Preview before applying or rejecting." : "Inspect transaction history."}</span>
  </button>\`).join("");
  const cards = items.length
    ? items.map((item) => transactionCardHtml(item)).join("")
    : '<article class="item"><h2>Empty</h2><p class="meta">No matching transactions.</p></article>';

  view.innerHTML = \`<section>
    <h2>Transaction summary</h2>
    <div class="summary-strip">\${filterButtons}</div>
  </section>
  <section class="transaction-layout">
    <div class="grid">\${cards}</div>
    <div id="transaction-detail" class="detail-panel">\${transactionDetail ? transactionDetailHtml(transactionDetail) : '<article class="item"><h2>Transaction detail</h2><p class="meta">Select a transaction to inspect proposed writes, validation, and action notes.</p></article>'}</div>
  </section>
  <div id="transaction-action-output" class="action-output"></div>\`;
  bindTransactionActions();
}

function countTransactions(state) {
  if (state === "all") {
    return snapshot.transactions.items.length;
  }

  return snapshot.transactions.items.filter((item) => item.transaction_state === state).length;
}

function transactionCardHtml(item) {
  return \`<article class="item">
    <h2>\${escapeHtml(item.id)}</h2>
    <p class="pill">\${escapeHtml(item.transaction_state)} · \${escapeHtml(item.operations.join(", ") || "NOOP")}</p>
    \${detailListHtml([
      ["Path", item.path],
      ["Source Events", item.source_events.join(", ") || "none"],
      ["Affected files", item.affected_files.join(", ") || "none"]
    ])}
    <div class="action-row">
      <button type="button" class="secondary transaction-detail-button" data-transaction-id="\${escapeHtml(item.id)}">Details</button>
    </div>
  </article>\`;
}

function transactionDetailHtml(detail) {
  const validationLabel = detail.validation?.passed ? "passed" : "failed";
  const validationMessages = [
    ...(detail.validation?.errors ?? []).map((error) => \`\${error.code}: \${error.message}\`),
    ...(detail.validation?.warnings ?? []).map((warning) => \`\${warning.code}: \${warning.message}\`)
  ];

  return \`<article class="item transaction-detail-card">
    <h2>\${escapeHtml(detail.id)}</h2>
    <p class="pill">\${escapeHtml(detail.transaction_state)} · validation \${escapeHtml(validationLabel)}</p>
    \${detailListHtml([
      ["Path", detail.path],
      ["Created", detail.created_at ?? "unknown"],
      ["Risk", detail.risk_level ?? "unspecified"],
      ["Requires review", String(Boolean(detail.requires_review))],
      ["Intent", detail.intent ?? "none"],
      ["Rollback / repair notes", detail.rollback_notes ?? "none"],
      ["Application / rejection notes", detail.application_log ?? "none"]
    ])}
    \${plainListHtml("Operations", detail.operations)}
    \${plainListHtml("Affected files", detail.affected_files)}
    \${plainListHtml("Source Events", detail.source_events)}
    \${plainListHtml("Validation notes", validationMessages)}
    \${proposedWritesHtml(detail.proposed_file_writes)}
    \${detail.transaction_state === "pending" ? transactionActionFormsHtml(detail.id) : ""}
  </article>\`;
}

function proposedWritesHtml(writes) {
  const values = writes ?? [];

  if (!values.length) {
    return '<section><h3>Proposed file writes</h3><p class="meta">No explicit proposed writes.</p></section>';
  }

  return \`<section><h3>Proposed file writes</h3>\${values.map((write) => \`<details class="write-detail">
    <summary>\${escapeHtml(write.path)}</summary>
    <pre>\${escapeHtml(write.content)}</pre>
  </details>\`).join("")}</section>\`;
}

function transactionActionFormsHtml(transactionId) {
  return \`<div class="action-stack">
    <form class="transaction-apply-form" data-transaction-id="\${escapeHtml(transactionId)}">
      <div class="action-row">
        <button type="submit" name="mode" value="preview" class="secondary">Preview apply</button>
        <button type="submit" name="mode" value="apply">Apply transaction</button>
      </div>
    </form>
    <form class="transaction-reject-form" data-transaction-id="\${escapeHtml(transactionId)}">
      <div class="action-row">
        <input name="reason" placeholder="Rejection reason">
        <button type="submit" name="mode" value="preview" class="secondary">Preview reject</button>
        <button type="submit" name="mode" value="apply">Reject transaction</button>
      </div>
    </form>
  </div>\`;
}

function bindTransactionActions() {
  for (const button of document.querySelectorAll("[data-transaction-state]")) {
    button.addEventListener("click", () => {
      transactionStateFilter = button.dataset.transactionState ?? "pending";
      renderTransactions();
    });
  }

  for (const button of document.querySelectorAll(".transaction-detail-button")) {
    button.addEventListener("click", async () => {
      await loadTransactionDetail(button.dataset.transactionId);
    });
  }

  for (const form of document.querySelectorAll(".transaction-apply-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const preview = submitter?.value === "preview";
      await runTransactionAction(preview ? "/api/transactions/apply/preview" : "/api/transactions/apply", {
        id: form.dataset.transactionId
      });
    });
  }

  for (const form of document.querySelectorAll(".transaction-reject-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const preview = submitter?.value === "preview";
      await runTransactionAction(preview ? "/api/transactions/reject/preview" : "/api/transactions/reject", {
        id: form.dataset.transactionId,
        reason: form.elements.reason.value
      });
    });
  }
}

async function loadTransactionDetail(transactionId) {
  const output = document.querySelector("#transaction-action-output");

  try {
    transactionDetail = await fetchJson(\`/api/transactions/detail?id=\${encodeURIComponent(transactionId)}\`);
    renderTransactions();
  } catch (error) {
    if (output) {
      output.innerHTML = \`<pre>Failed to load transaction detail: \${escapeHtml(error.message)}</pre>\`;
    }
  }
}

async function runTransactionAction(path, body) {
  const output = document.querySelector("#transaction-action-output");
  output.innerHTML = "<pre>Running</pre>";

  try {
    const result = await postJson(path, body);
    snapshot = await fetchJson("/api/snapshot");
    health = null;
    dogfoodHome = null;
      dogfoodControlRoom = null;
    useTomorrow = null;
    reviewTurbo = null;
    reviewAutopilot = null;
    transactionDetail = await fetchJson(\`/api/transactions/detail?id=\${encodeURIComponent(result.transaction_id)}\`).catch(() => null);
    renderTransactions();
    document.querySelector("#transaction-action-output").innerHTML = renderActionResult(result);
  } catch (error) {
    output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
  }
}

async function renderReview() {
  if (!reviewTurbo || !reviewAutopilot || !reviewThroughput) {
    view.innerHTML = '<article class="item"><h2>Loading review lanes</h2><p class="meta">Reading staged ReviewItems.</p></article>';
    [reviewTurbo, reviewAutopilot, reviewThroughput] = await Promise.all([
      fetchJson("/api/review/turbo"),
      fetchJson("/api/review/autopilot"),
      fetchJson("/api/review/throughput")
    ]);

    if (activeTab !== "review") {
      return;
    }
  }

  renderReviewTurbo(reviewTurbo);
}

function renderReviewTurbo(turbo) {
  const items = filteredReviewItems();
  reviewQueueIndex = Math.min(reviewQueueIndex, Math.max(items.length - 1, 0));
  const cards = items.length
    ? items.map((item, index) => reviewCardHtml(item, index)).join("")
    : '<article class="item"><h2>Empty</h2><p class="meta">No matching memory objects.</p></article>';

  view.innerHTML = \`\${reviewAutopilotHtml(reviewAutopilot)}
  \${renderReviewThroughput(reviewThroughput)}
  \${reviewLaneSummaryHtml(turbo)}
  \${reviewSummaryHtml(snapshot.review)}
  \${reviewQueueNavigatorHtml(items)}
  <article class="item">
    <h2>Event reprocess</h2>
    <form id="event-reprocess-form" class="action-row">
      <input name="eventId" placeholder="Event id or path">
      <button type="submit" name="mode" value="preview" class="secondary">Preview</button>
      <button type="submit" name="mode" value="apply">Stage</button>
    </form>
  </article>
  <div class="grid">\${cards}</div>
  <div id="action-output" class="action-output"></div>\`;
  bindReviewFilters();
  bindReviewAutopilotActions();
  bindReviewActions();
}

function filteredReviewItems() {
  return (reviewTurbo?.items ?? []).filter((item) =>
    (reviewReasonFilter === "all" || item.review_reason === reviewReasonFilter) &&
    (reviewLaneFilter === "all" || item.lane_id === reviewLaneFilter)
  );
}

function reviewQueueNavigatorHtml(items) {
  if (!items.length) {
    return \`<section class="review-queue-navigator" data-next-endpoint="/api/review/next">
      <p><strong>Review queue</strong></p>
      <p class="meta">0 / 0</p>
    </section>\`;
  }

  const item = items[reviewQueueIndex] ?? items[0];

  return \`<section class="review-queue-navigator" data-next-endpoint="/api/review/next">
    <div>
      <p><strong>Review queue</strong></p>
      <p class="meta">\${escapeHtml(String(reviewQueueIndex + 1))} / \${escapeHtml(String(items.length))} · next up: \${escapeHtml(item.id)}</p>
    </div>
    <div class="action-row">
      <button type="button" class="secondary review-queue-prev" \${reviewQueueIndex <= 0 ? "disabled" : ""}>Previous</button>
      <button type="button" class="secondary review-queue-next" \${reviewQueueIndex >= items.length - 1 ? "disabled" : ""}>Next</button>
    </div>
  </section>\`;
}

function reviewAutopilotHtml(autopilot) {
  if (!autopilot) {
    return "";
  }

  const laneCards = (autopilot.lanes ?? []).map((lane) => \`<button type="button" class="reason-filter review-autopilot-preview" data-autopilot-lane="\${escapeHtml(lane.lane_id)}">
    <strong>\${escapeHtml(lane.label)}</strong>
    <span>\${escapeHtml(String(lane.item_count))} item\${lane.item_count === 1 ? "" : "s"}</span>
    <span>risk \${escapeHtml(String(lane.risk_rank))} · \${escapeHtml((lane.risk_factors ?? []).join(", ") || "manual review")}</span>
  </button>\`).join("");
  const next = autopilot.next_item_id ?? "none";

  return \`<section class="review-autopilot-console">
    <h2>Review Autopilot</h2>
    <p class="meta">Preview-only grouping for review risk, source/proof context, and one-at-a-time allowed actions.</p>
    <div class="summary-strip">
      <button type="button" class="reason-filter review-autopilot-preview" data-autopilot-item="\${escapeHtml(next)}">
        <strong>Next recommended</strong>
        <span>\${escapeHtml(next)}</span>
        <span>No batch apply. Preview grouped intent only.</span>
      </button>
      \${laneCards}
    </div>
    \${plainListHtml("Autopilot warnings", autopilot.warnings ?? [])}
  </section>\`;
}


function renderReviewThroughput(throughput) {
  if (!throughput) {
    return '';
  }

  const laneCards = (throughput.bottlenecks ?? []).map((lane) => '<article class="item"><h3>' + escapeHtml(lane.label) + '</h3>' + detailListHtml([
    ['Items', String(lane.item_count)],
    ['Ready', String(lane.ready_count)],
    ['Blocked', String(lane.blocked_count)],
    ['Required inputs', lane.required_inputs.join(', ') || 'none']
  ]) + plainListHtml('Checklist', lane.action_checklist ?? []) + '</article>').join('');
  const next = throughput.next_action;

  return '<section class="review-throughput-panel">' +
    '<h2>Review throughput</h2>' +
    '<p class="meta">One recommended item, one preview, one explicit action. Batch apply disabled.</p>' +
    '<div class="metrics">' +
      '<div class="metric"><span>Total</span><strong>' + escapeHtml(String(throughput.total_items)) + '</strong></div>' +
      '<div class="metric"><span>Ready now</span><strong>' + escapeHtml(String(throughput.ready_now_count)) + '</strong></div>' +
      '<div class="metric"><span>Needs input</span><strong>' + escapeHtml(String(throughput.needs_input_count)) + '</strong></div>' +
      '<div class="metric"><span>Risk review</span><strong>' + escapeHtml(String(throughput.risk_review_count)) + '</strong></div>' +
    '</div>' +
    (next ? '<article class="item"><h3>Next throughput action</h3>' + detailListHtml([
      ['Item', next.item_id],
      ['Lane', next.lane_id],
      ['Preview endpoint', next.preview_endpoint],
      ['Required inputs', next.required_inputs.join(', ') || 'none']
    ]) + plainListHtml('Checklist', next.checklist ?? []) + '</article>' : '<article class="item"><h3>Next throughput action</h3><p class="meta">No staged review item is waiting.</p></article>') +
    '<div class="grid">' + (laneCards || '<article class="item"><h3>No bottlenecks</h3><p class="meta">Review queue is clear.</p></article>') + '</div>' +
    plainListHtml('Throughput warnings', throughput.warnings ?? []) +
  '</section>';
}
function reviewLaneSummaryHtml(turbo) {
  const total = turbo.items.length;
  const laneButtons = turbo.lanes.map((lane) => \`<button type="button" class="reason-filter" data-review-lane="\${escapeHtml(lane.lane_id)}" aria-pressed="\${String(reviewLaneFilter === lane.lane_id)}">
    <strong>\${escapeHtml(lane.label)}</strong>
    <span>\${escapeHtml(String(lane.count))} item\${lane.count === 1 ? "" : "s"}</span>
    <span>\${escapeHtml(lane.suggested_action)}</span>
  </button>\`).join("");

  return \`<section>
    <h2>Review lanes</h2>
    <div class="summary-strip">
      <button type="button" class="reason-filter" data-review-lane="all" aria-pressed="\${String(reviewLaneFilter === "all")}">
        <strong>All lanes</strong>
        <span>\${escapeHtml(String(total))} item\${total === 1 ? "" : "s"}</span>
        <span>Review one staged memory decision at a time.</span>
      </button>
      \${laneButtons}
    </div>
  </section>\`;
}

function reviewSummaryHtml(review) {
  const total = review.items.length;
  const groups = review.grouped_by_reason ?? [];
  const groupButtons = groups.map((group) => \`<button type="button" class="reason-filter" data-review-reason="\${escapeHtml(group.review_reason)}" aria-pressed="\${String(reviewReasonFilter === group.review_reason)}">
    <strong>\${escapeHtml(group.review_reason.replaceAll("_", " "))}</strong>
    <span>\${escapeHtml(String(group.count))} item\${group.count === 1 ? "" : "s"}</span>
    <span>\${escapeHtml(group.suggested_action)}</span>
  </button>\`).join("");

  return \`<section>
    <h2>Review summary</h2>
    <div class="summary-strip">
      <button type="button" class="reason-filter" data-review-reason="all" aria-pressed="\${String(reviewReasonFilter === "all")}">
        <strong>All review</strong>
        <span>\${escapeHtml(String(total))} item\${total === 1 ? "" : "s"}</span>
        <span>Inspect staged memory before applying changes.</span>
      </button>
      \${groupButtons}
    </div>
  </section>\`;
}

function bindReviewAutopilotActions() {
  for (const button of document.querySelectorAll(".review-autopilot-preview")) {
    button.addEventListener("click", async () => {
      const laneId = button.dataset.autopilotLane;
      const itemId = button.dataset.autopilotItem;
      const body = laneId ? { laneId } : { itemIds: itemId && itemId !== "none" ? [itemId] : [] };
      await runAction("/api/review/autopilot/preview", body);
    });
  }
}

function bindReviewFilters() {
  for (const button of document.querySelectorAll("[data-review-lane]")) {
    button.addEventListener("click", () => {
      reviewLaneFilter = button.dataset.reviewLane ?? "all";
      reviewQueueIndex = 0;
      renderReviewTurbo(reviewTurbo);
    });
  }

  for (const button of document.querySelectorAll("[data-review-reason]")) {
    button.addEventListener("click", () => {
      reviewReasonFilter = button.dataset.reviewReason ?? "all";
      reviewQueueIndex = 0;
      renderReviewTurbo(reviewTurbo);
    });
  }
}

function reviewCardHtml(item, index) {
  const defaultTarget = item.affected_files[0] ? memoryPath(item.affected_files[0]) : "";
  const details = [
    ["Priority", String(item.review_priority ?? "unknown")],
    ["Review path", item.path],
    ["Source Events", item.source_events.join(", ") || "none"],
    ["Affected files", item.affected_files.join(", ") || "none"],
    ["Linked transaction", item.linked_transaction ?? "none"],
    ["Staged claims", item.staged_claim_ids.join(", ") || "none"],
    ["Suggested action", item.suggested_action]
  ];
  const selected = index === reviewQueueIndex;

  return \`<article class="item review-queue-card" data-review-index="\${escapeHtml(String(index))}" data-review-selected="\${String(selected)}">
    <h2>\${escapeHtml(item.id)}</h2>
    <p class="pill">\${escapeHtml(item.lane_label ? \`\${item.lane_label} · \` : "")}\${escapeHtml(item.review_reason)} · \${escapeHtml(item.review_state)}</p>
    \${detailListHtml(details)}
    \${reviewSuggestionsHtml(item)}
    \${reviewClaimDiffCardsHtml(item.staged_claims ?? [])}
    <div class="action-stack">
      <form class="review-apply-form" data-review-id="\${escapeHtml(item.id)}">
        <div class="action-row">
          <input name="target" value="\${escapeHtml(defaultTarget)}" placeholder="Target page">
          <input name="context" placeholder="Context id or path">
        </div>
        <div class="action-row">
          <input name="createContext" placeholder="Create context">
          <input name="supersede" placeholder="Supersede claim">
        </div>
        <div class="action-row">
          <input name="note" placeholder="Note">
          <button type="submit" name="mode" value="preview" class="secondary">Preview</button>
          <button type="submit" name="mode" value="apply">Apply</button>
        </div>
      </form>
      <form class="review-mark-form" data-review-id="\${escapeHtml(item.id)}">
        <div class="action-row">
          <select name="state">
            <option value="reviewed">reviewed</option>
            <option value="contested">contested</option>
            <option value="archived">archived</option>
          </select>
          <input name="note" placeholder="Note">
          <button type="submit" name="mode" value="preview" class="secondary">Preview</button>
          <button type="submit" name="mode" value="apply">Mark</button>
        </div>
      </form>
    </div>
  </article>\`;
}

function reviewSuggestionsHtml(item) {
  return \`<section class="review-suggestion-list">
    \${plainListHtml("Target suggestions", item.target_suggestions ?? [])}
    \${plainListHtml("Context suggestions", item.context_suggestions ?? [])}
    \${plainListHtml("Evidence summary", item.evidence_summary ?? [])}
    \${plainListHtml("Proof previews", (item.proof_previews ?? []).map((proof) => \`\${proof.proof_id}: \${proof.rule ?? "proof"} via \${(proof.source_events ?? []).join(", ") || "no source events"}\`))}
    \${plainListHtml("Preview-first actions", (item.preview_actions ?? []).map((action) => \`\${action.label}: \${action.endpoint} - \${action.note}\`))}
  </section>\`;
}

function reviewClaimDiffCardsHtml(claims) {
  if (!claims.length) {
    return '<p class="meta">No staged claim block found. Mark, contest, archive, or inspect the source ReviewItem manually.</p>';
  }

  return \`<section class="claim-diff-list">
    <h3>Staged claim diff</h3>
    <p class="meta">Applying, superseding, or assigning context remains an explicit human action.</p>
    \${claims.map((claim) => \`<div class="claim-diff-card">
      <p><strong>\${escapeHtml(claim.claim_id)}</strong></p>
      <p>\${escapeHtml(claim.statement || "No statement text.")}</p>
      <p class="meta">claim_kind: \${escapeHtml(claim.claim_kind ?? "unknown")} · claim_state: \${escapeHtml(claim.claim_state ?? "unknown")} · evidence_strength: \${escapeHtml(claim.evidence_strength ?? "unknown")}</p>
      <p class="meta">scope: \${escapeHtml(claim.scope ?? "none")} · scope_state: \${escapeHtml(claim.scope_state ?? "unknown")} · evidence: \${escapeHtml(claim.evidence.join(", ") || "none")}</p>
    </div>\`).join("")}
  </section>\`;
}

function bindReviewActions() {
  document.querySelector(".review-queue-prev")?.addEventListener("click", () => {
    reviewQueueIndex = Math.max(reviewQueueIndex - 1, 0);
    renderReviewTurbo(reviewTurbo);
  });

  document.querySelector(".review-queue-next")?.addEventListener("click", () => {
    const items = filteredReviewItems();
    reviewQueueIndex = Math.min(reviewQueueIndex + 1, Math.max(items.length - 1, 0));
    renderReviewTurbo(reviewTurbo);
  });

  document.querySelector("#event-reprocess-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = event.submitter;
    const preview = submitter?.value === "preview";
    await runAction(preview ? "/api/events/reprocess/preview" : "/api/events/reprocess", {
      eventId: form.elements.eventId.value,
      stageOnly: true
    });
  });

  for (const form of document.querySelectorAll(".review-apply-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const preview = submitter?.value === "preview";
      await runAction(preview ? "/api/review/apply-staged/preview" : "/api/review/apply-staged", {
        reviewId: form.dataset.reviewId,
        target: form.elements.target.value,
        context: form.elements.context.value,
        createContext: form.elements.createContext.value,
        supersede: form.elements.supersede.value,
        note: form.elements.note.value
      });
    });
  }

  for (const form of document.querySelectorAll(".review-mark-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const preview = submitter?.value === "preview";
      await runAction(preview ? "/api/review/mark/preview" : "/api/review/mark", {
        reviewId: form.dataset.reviewId,
        state: form.elements.state.value,
        note: form.elements.note.value
      });
    });
  }
}

async function runAction(path, body) {
  const output = document.querySelector("#action-output");
  output.innerHTML = "<pre>Running</pre>";

  try {
    const result = await postJson(path, body);
    const actionResult = renderActionResult(result);
    if (result.created) {
      await refreshAfterAction();
    }
    document.querySelector("#action-output").innerHTML = actionResult;
  } catch (error) {
    output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
  }
}

async function refreshAfterAction() {
  snapshot = await fetchJson("/api/snapshot");
  health = null;
  dogfoodHome = null;
      dogfoodControlRoom = null;
  useTomorrow = null;
  reviewTurbo = null;
    reviewAutopilot = null;
  captureInbox = null;

  if (activeTab === "health") {
    health = await fetchJson("/api/health");
    renderHealthCenter(health);
    return;
  }

  if (activeTab === "capture") {
    captureInbox = await fetchJson("/api/capture/inbox");
    await renderCapture();
    return;
  }

  render();
}

function renderActionResult(result) {
  const mode = actionModeLabel(result);
  const proposedFileWrites = (result.proposed_file_writes ?? []).map((write) =>
    typeof write === "string" ? write : write.path
  );
  const summary = [
    ["Action", formatAction(result.action)],
    ["Mode", mode],
    ["Transaction", result.transaction_id],
    ["Transaction path", result.transaction_path],
    ["State", result.transaction_state],
    ["Risk", result.risk_level ?? "unspecified"],
    ["Requires review", String(Boolean(result.requires_review))],
    ["Needs context", String(Boolean(result.needs_context))]
  ];

  if (result.validation) {
    summary.push(["Validation", result.validation.passed ? "passed" : "failed"]);
  }

  if (result.reason) {
    summary.push(["Reason", result.reason]);
  }

  if (result.review_id) {
    summary.push(["Review", result.review_path ? \`\${result.review_id} · \${result.review_path}\` : result.review_id]);
  }

  if (result.event_id) {
    summary.push(["Event", result.event_path ? \`\${result.event_id} · \${result.event_path}\` : result.event_id]);
  }

  return \`<article class="item action-result">
    <h2>\${escapeHtml(mode)}</h2>
    <p class="pill">\${escapeHtml(formatAction(result.action))}</p>
    \${detailListHtml(summary)}
    \${plainListHtml("Operations", result.operations)}
    \${plainListHtml("Affected files", result.affected_files)}
    \${plainListHtml("Source Events", result.source_events)}
    \${plainListHtml("Why staged", result.why_staged)}
    \${result.likely_next_review_action ? \`<section><h3>Likely next review action</h3><p class="meta">\${escapeHtml(result.likely_next_review_action)}</p></section>\` : ""}
    \${plainListHtml("Proposed file writes", proposedFileWrites)}
    \${seedUnitsHtml(result.units)}
  </article>\`;
}

function seedUnitsHtml(units) {
  if (!Array.isArray(units) || units.length === 0) {
    return "";
  }

  return \`<section><h3>Seed units</h3><div class="grid">\${units.map((unit) => \`<article class="item">
    <h4>\${escapeHtml(unit.section_label ?? unit.section_id)}</h4>
    <p class="pill">\${escapeHtml(unit.source_label)}</p>
    \${detailListHtml([
      ["Event", unit.event_id ? \`\${unit.event_id} · \${unit.event_path}\` : "none"],
      ["Transaction", unit.transaction_id ? \`\${unit.transaction_id} · \${unit.transaction_path}\` : "none"],
      ["Validation", unit.validation?.passed ? "passed" : "failed"]
    ])}
  </article>\`).join("")}</div></section>\`;
}

function actionModeLabel(result) {
  if (result.action === "apply_transaction") {
    return result.created ? "Transaction applied" : "Preview only";
  }

  if (result.action === "reject_transaction") {
    return result.created ? "Transaction rejected" : "Preview only";
  }

  return result.created ? "Pending transaction created" : "Preview only";
}

function formatAction(action) {
  return String(action ?? "action").replaceAll("_", " ");
}

function detailListHtml(items) {
  return \`<dl class="detail-list">\${items.map(([label, value]) => \`<div><dt>\${escapeHtml(label)}</dt><dd>\${escapeHtml(value)}</dd></div>\`).join("")}</dl>\`;
}

function plainListHtml(label, items) {
  const values = (items ?? []).filter(Boolean);

  if (!values.length) {
    return "";
  }

  return \`<section><h3>\${escapeHtml(label)}</h3><ul class="plain-list">\${values.map((item) => \`<li>\${escapeHtml(item)}</li>\`).join("")}</ul></section>\`;
}

function renderAnswerBasis(result) {
  renderAskSession({
    query: result.query,
    basis: result,
    pinned_questions: [],
    citation_explorer: citationExplorerFromBasis(result),
    matched_page_previews: [],
    source_event_previews: [],
    missing_memory_actions: []
  });
}

function renderAskSession(session) {
  if (session.basis) {
    renderAskResult(session.basis, session);
    return;
  }

  clearCopyOutput();
  document.querySelector("#ask-result").innerHTML = pinnedQuestionsHtml(session);
  bindAskPinQuestion(session);
}

function renderAnswerDraft(result) {
  if (result.basis) {
    renderAskResult(result.basis);
    document.querySelector("#ask-result").insertAdjacentHTML("afterbegin", answerDraftHtml(result));
  } else {
    clearCopyOutput();
    document.querySelector("#ask-result").innerHTML = answerDraftHtml(result);
  }

  bindCopyControls();
}

function answerDraftHtml(result) {
  const answerText = result.answer_text || "Draft unavailable.";
  const citationLines = (result.citations ?? []).map((citation) => \`citation: \${citation}\`);
  const copyButton = result.answer_text
    ? \`<button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(result.answer_text)}">Copy draft</button>\`
    : "";

  return \`<section data-ask-section="draft-answer">
    <h2>Draft answer</h2>
    <article class="item ask-card">
      <h3>\${escapeHtml(result.provider_name ?? "provider")}</h3>
      <p>\${escapeHtml(answerText)}</p>
      <p class="pill">generated \${escapeHtml(result.generated_at ?? "unknown")} · \${escapeHtml(result.provider_model ?? "model unspecified")}</p>
      \${citationLinesHtml(citationLines)}
      \${plainListHtml("What memory cannot confirm", result.cannot_confirm ?? [])}
      \${plainListHtml("Warnings", result.warnings ?? [])}
      <p class="meta">Draft text is derived and not saved to memory.</p>
      \${copyButton}
    </article>
  </section>\`;
}

function renderAskResult(result, session = null) {
  clearCopyOutput();
  const cannotConfirm = answerCannotConfirmItems(result);
  const conflictOrStaleItems = [
    ...(result.conflicts ?? []).map((item) => ({ ...item, item_type: "conflict" })),
    ...(result.staleSignals ?? []).map((item) => ({ ...item, item_type: "stale" }))
  ];
  const repairActions = result.repairActions ?? result.manualActions ?? [];
  const sections = [
    pinnedQuestionsHtml(session ?? { query: result.query, pinned_questions: [] }),
    retrievalPlanHtml(result),
    askSectionHtml("What memory can say", result.directAnswers ?? [], directAnswerHtml, "No direct answers found in active memory."),
    askSectionHtml("Supporting claims", result.supportingClaims ?? [], claimHtml, "No active supporting claims were loaded."),
    citationExplorerHtml(session?.citation_explorer ?? citationExplorerFromBasis(result)),
    askSectionHtml("Matched page preview", session?.matched_page_previews ?? [], matchedPagePreviewHtml, "No matched page previews."),
    askSectionHtml("Source Event preview", session?.source_event_previews ?? [], sourceEventPreviewHtml, "No source Event previews."),
    askSectionHtml("What memory cannot confirm", cannotConfirm, missingInfoHtml, "No missing information detected for loaded active claims."),
    askSectionHtml("Conflicts or stale facts", conflictOrStaleItems, conflictOrStaleHtml, "No conflicts or stale facts surfaced."),
    askSectionHtml("Proof paths", proofPathItems(result), proofPathHtml, "No symbolic proof paths available."),
    askSectionHtml("Uncertainty", result.uncertainClaims ?? [], uncertainClaimHtml, "No staged, partial, superseded, rejected, or contested claims were loaded."),
    askSectionHtml("Evidence Events", result.evidenceEvents ?? [], eventHtml, "No cited Event pages were loaded."),
    askSectionHtml("Linked ReviewItems", result.linkedReviewItems ?? [], linkedItemHtml, "No linked ReviewItems."),
    askSectionHtml("Linked FollowUps", result.linkedFollowUps ?? [], linkedItemHtml, "No linked FollowUps."),
    askSectionHtml("Repair actions", repairActions, manualActionHtml, "No repair actions suggested."),
    missingMemoryActionHtml(result, session),
    askFrictionLogHtml(result),
    askSectionHtml("Suggested next questions", (result.suggestedNextQuestions ?? []).map((question) => ({ question })), nextQuestionHtml, "No suggested next questions."),
    askSectionHtml("Matched pages", result.matchedPages ?? [], pageSummaryHtml, "No matched people, topics, or contexts."),
    answerContractExportHtml(result),
    contextPackHtml(result.contextPack)
  ];

  document.querySelector("#ask-result").innerHTML = sections.join("");
  bindCopyControls();
  bindAskPinQuestion(session ?? { query: result.query, pinned_questions: [] });
  bindAskMissingMemory(result);
  bindAskFrictionLog(result);
  bindAskRepairActions();
  bindBriefLinks();
}

function pinnedQuestionsHtml(session) {
  const query = session?.query ?? "";
  const pinned = session?.pinned_questions ?? [];
  const pinButton = query
    ? \`<div class="action-row"><button type="button" class="secondary" id="ask-pin-current" data-question="\${escapeHtml(query)}">Pin question</button></div>\`
    : "";

  return \`<section data-ask-section="pinned-questions">
    <h2>Pinned questions</h2>
    \${pinButton}
    <div id="ask-pinned-output">\${pinnedQuestionsBodyHtml(pinned)}</div>
  </section>\`;
}

function pinnedQuestionsBodyHtml(pinned) {
  return pinned.length
    ? \`<div class="grid">\${pinned.map((question) => \`<article class="item ask-card"><h3>Pinned question</h3><p>\${escapeHtml(question)}</p><button type="button" class="secondary ask-run-pinned" data-question="\${escapeHtml(question)}">Ask pinned</button></article>\`).join("")}</div>\`
    : '<article class="item"><h3>Empty</h3><p class="meta">No pinned local questions.</p></article>';
}

function citationExplorerFromBasis(result) {
  const citationMap = result.citationMap ?? {};
  const claimIds = [
    ...Object.keys(citationMap.claims ?? {}),
    ...(result.answerCandidates ?? []).map((candidate) => candidate.claim_id),
    ...(result.directAnswers ?? []).flatMap((answer) => citationValues(answer.citations, "claim")),
    ...(result.supportingClaims ?? []).map((claim) => claim.claim_id),
    ...(result.uncertainClaims ?? []).map((claim) => claim.claim_id)
  ];
  const eventIds = [
    ...Object.keys(citationMap.events ?? {}),
    ...(result.evidenceEvents ?? []).map((event) => event.id),
    ...(result.directAnswers ?? []).flatMap((answer) => citationValues(answer.citations, "event")),
    ...(result.answerCandidates ?? []).flatMap((candidate) => candidate.evidence ?? []),
    ...(result.supportingClaims ?? []).flatMap((claim) => claim.evidence ?? [])
  ];

  return {
    claim_ids: uniqueClientStrings(claimIds),
    event_ids: uniqueClientStrings(eventIds),
    page_paths: uniqueClientStrings([
      ...Object.keys(citationMap.pages ?? {}),
      ...(result.matchedPages ?? []).map((page) => page.path),
      ...(result.directAnswers ?? []).flatMap((answer) => citationValues(answer.citations, "page")),
      ...(result.answerCandidates ?? []).map((candidate) => candidate.page_path),
      ...(result.supportingClaims ?? []).map((claim) => claim.page_path)
    ]),
    review_item_ids: uniqueClientStrings((result.linkedReviewItems ?? []).map((item) => item.id)),
    followup_ids: uniqueClientStrings((result.linkedFollowUps ?? []).map((item) => item.id)),
    proof_ids: uniqueClientStrings((result.directAnswers ?? []).flatMap((answer) => (answer.proof_paths ?? []).map((proof) => proof.proof_id)))
  };
}

function citationValues(citations, kind) {
  if (Array.isArray(citations)) {
    return citations
      .filter((citation) => citation.kind === kind)
      .map((citation) => citation.claim_id ?? citation.event_id ?? citation.page_path ?? citation.path ?? citation.id)
      .filter(Boolean);
  }

  if (!citations) {
    return [];
  }

  if (kind === "claim") {
    return citations.claim_ids ?? [];
  }

  if (kind === "event") {
    return citations.event_ids ?? [];
  }

  return citations.page_paths ?? [];
}

function citationExplorerHtml(explorer) {
  const rows = [
    ["Claim IDs", explorer.claim_ids ?? []],
    ["Event IDs", explorer.event_ids ?? []],
    ["Page paths", explorer.page_paths ?? []],
    ["ReviewItems", explorer.review_item_ids ?? []],
    ["FollowUps", explorer.followup_ids ?? []],
    ["Proof IDs", explorer.proof_ids ?? []]
  ];

  return \`<section data-ask-section="citation-explorer">
    <h2>Citation explorer</h2>
    <article class="item ask-card">
      \${rows.map(([label, values]) => plainListHtml(label, values.length ? values : ["none"])).join("")}
      <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(rows.flatMap(([, values]) => values).join("; "))}">Copy citations</button>
    </article>
  </section>\`;
}

function matchedPagePreviewHtml(preview) {
  const lines = [
    \`page: \${preview.path}\`,
    \`id: \${preview.id ?? "unknown"}\`,
    \`why: \${preview.why_included ?? "loaded from deterministic match"}\`
  ];
  return \`<article class="item ask-card">
    <h3>\${escapeHtml(preview.name ?? preview.path)}</h3>
    <p class="pill">\${escapeHtml(preview.type ?? "page")}</p>
    \${detailListHtml([
      ["Path", preview.path],
      ["Why included", preview.why_included ?? "loaded from deterministic match"]
    ])}
    <p>\${escapeHtml(preview.content_preview ?? "")}</p>
    <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(lines.join("; "))}">Copy citation</button>
  </article>\`;
}

function sourceEventPreviewHtml(preview) {
  const lines = [
    \`event: \${preview.id ?? "unknown"}\`,
    \`path: \${preview.path}\`,
    \`recorded: \${preview.recorded_at ?? "unknown"}\`
  ];
  return \`<article class="item ask-card">
    <h3>\${escapeHtml(preview.id ?? preview.path)}</h3>
    <p class="pill">source Event preview</p>
    \${detailListHtml([
      ["Path", preview.path],
      ["Observed", preview.observed_at ?? "unknown"],
      ["Why included", preview.why_included ?? "cited by retrieved claim"]
    ])}
    <p>\${escapeHtml(preview.raw_text_preview ?? "")}</p>
    <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(lines.join("; "))}">Copy citation</button>
  </article>\`;
}

function missingMemoryActionHtml(result, session = null) {
  const actions = session?.missing_memory_actions ?? [];
  const shouldShow = actions.length || (result.missingInformation ?? []).length || (result.manualActions ?? []).some((action) => action.action === "log_friction");

  if (!shouldShow) {
    return "";
  }

  return \`<section data-ask-section="missing-memory-action">
    <h2>Missing-memory action</h2>
    <article class="item ask-card">
      <h3>Preview a source-backed feedback action</h3>
      <p class="meta">Preview creates no files. Use capture or friction logging when this missing memory should become evidence.</p>
      \${plainListHtml("Allowed routes", actions.map((action) => \`\${action.label}: \${action.preview_endpoint}\`))}
      <form id="ask-missing-memory-form" class="action-stack">
        <label class="field" for="ask-missing-memory-note"><span>Missing-memory note</span><textarea id="ask-missing-memory-note" name="note" rows="4" placeholder="What should be captured or reviewed?"></textarea></label>
        <div class="action-row"><button type="submit" class="secondary">Preview missing-memory action</button></div>
      </form>
      <div id="ask-missing-memory-output" class="action-output"></div>
    </article>
  </section>\`;
}

function bindAskPinQuestion(session) {
  document.querySelector("#ask-pin-current")?.addEventListener("click", async (event) => {
    const output = document.querySelector("#ask-pinned-output");
    output.innerHTML = "<pre>Pinning</pre>";

    try {
      const result = await postJson("/api/ask/pin", { question: event.currentTarget.dataset.question });
      output.innerHTML = pinnedQuestionsBodyHtml(result.pinned_questions);
      for (const button of output.querySelectorAll(".ask-run-pinned")) {
        bindPinnedQuestionButton(button);
      }
    } catch (error) {
      output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
    }
  });

  for (const button of document.querySelectorAll(".ask-run-pinned")) {
    bindPinnedQuestionButton(button);
  }
}

function bindPinnedQuestionButton(button) {
  button.addEventListener("click", async () => {
    const input = document.querySelector("#ask-input");
    input.value = button.dataset.question ?? "";
    document.querySelector("#ask-form").requestSubmit();
  });
}

function bindAskMissingMemory(result) {
  const form = document.querySelector("#ask-missing-memory-form");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const output = document.querySelector("#ask-missing-memory-output");
    output.innerHTML = "<pre>Previewing</pre>";

    try {
      const action = await postJson("/api/ask/missing-memory/preview", {
        question: result.query,
        note: form.elements.note.value
      });
      output.innerHTML = renderActionResult(action);
    } catch (error) {
      output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
    }
  });
}

function uniqueClientStrings(values) {
  return [...new Set((values ?? []).filter(Boolean))].sort();
}

function retrievalPlanHtml(result) {
  const intent = result.queryIntent ?? { primary: "general", intents: ["general"], matched_terms: [], summary: "General deterministic lookup." };
  const lookups = result.plannedLookups ?? [];
  const lookupBody = lookups.length
    ? \`<div class="grid">\${lookups.map(plannedLookupHtml).join("")}</div>\`
    : '<article class="item"><h3>Empty</h3><p class="meta">No planned lookups.</p></article>';

  return \`<section data-ask-section="retrieval-plan">
    <h2>Retrieval plan</h2>
    <article class="item ask-card">
      <h3>\${escapeHtml(intent.primary)}</h3>
      <p>\${escapeHtml(intent.summary)}</p>
      \${detailListHtml([
        ["Intents", (intent.intents ?? []).join(", ") || "none"],
        ["Matched terms", (intent.matched_terms ?? []).join(", ") || "none"]
      ])}
    </article>
    \${lookupBody}
  </section>\`;
}

function plannedLookupHtml(lookup) {
  return \`<article class="item ask-card">
    <h3>\${escapeHtml(lookup.kind)}</h3>
    <p class="pill">\${escapeHtml(lookup.result_state)} · \${escapeHtml(lookup.result_count ?? 0)} result\${lookup.result_count === 1 ? "" : "s"}</p>
    \${detailListHtml([
      ["Reason", lookup.reason],
      ["Terms", (lookup.terms ?? []).join(", ") || "none"],
      ["Targets", (lookup.target_paths ?? []).join(", ") || "none"]
    ])}
  </article>\`;
}

function askSectionHtml(label, items, renderItem, emptyText) {
  const body = items.length
    ? \`<div class="grid">\${items.map(renderItem).join("")}</div>\`
    : \`<article class="item"><h3>Empty</h3><p class="meta">\${escapeHtml(emptyText)}</p></article>\`;
  return \`<section data-ask-section="\${escapeHtml(sectionSlug(label))}"><h2>\${escapeHtml(label)}</h2>\${body}</section>\`;
}

function proofPathItems(result) {
  return (result.directAnswers ?? []).flatMap((answer) =>
    (answer.proof_paths ?? []).map((proof) => ({
      answer_id: answer.answer_id ?? answer.claim_id,
      claim_id: answer.claim_id,
      proof
    }))
  );
}

function proofPathHtml(item) {
  const proof = item.proof ?? {};
  const lines = [
    "proof_id: " + (proof.proof_id ?? "unknown"),
    "answer: " + (item.answer_id ?? "unknown"),
    "rule: " + (proof.rule ?? "unknown"),
    "claim_ids: " + ((proof.source_claim_ids ?? []).join(", ") || "none"),
    "event_ids: " + ((proof.source_events ?? []).join(", ") || "none"),
    "source_fact_ids: " + ((proof.source_fact_ids ?? []).join(", ") || "none")
  ];

  return \`<article class="item ask-card">
    <h3>\${escapeHtml(proof.proof_id ?? item.answer_id ?? "proof")}</h3>
    <p class="pill">\${escapeHtml(proof.rule ?? "symbolic proof")}</p>
    \${citationLinesHtml(lines)}
    <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(lines.join("; "))}">Copy proof path</button>
  </article>\`;
}

function answerCannotConfirmItems(result) {
  if ((result.cannotConfirm ?? []).length) {
    return result.cannotConfirm.map((item) => ({
      title: item.code,
      badge: "cannot confirm",
      body: item.message,
      citations: item.citations
    }));
  }

  return [
    ...(result.missingInformation ?? []).map((item) => ({
      title: item.code,
      badge: "missing information",
      body: item.message,
      citations: null
    })),
    ...(result.warnings ?? []).map((warning) => ({
      title: "warning",
      badge: "retrieval warning",
      body: warning,
      citations: null
    }))
  ];
}

function directAnswerHtml(answer) {
  const lines = answerCitationLines(answer);
  const entityKind = entityKindForPagePath(answer.page_path);
  const entityButton = entityKind
    ? \`<button type="button" class="secondary ask-open-entity" data-entity-kind="\${escapeHtml(entityKind)}" data-entity-target="\${escapeHtml(answer.page_path)}">Open \${entityKind === "person" ? "Person" : "Context"} page</button>\`
    : "";

  return \`<article class="item ask-card">
    <h3>\${escapeHtml(answer.answer_id ?? answer.claim_id)}</h3>
    <p>\${escapeHtml(answer.answer ?? answer.statement)}</p>
    <p class="pill">\${escapeHtml(answer.basis ?? "active_claim")} · \${escapeHtml(answer.scope_state ?? "unknown")}</p>
    \${citationLinesHtml(lines)}
    <div class="action-row">
      <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(lines.join("; "))}">Copy cited basis</button>
      \${entityButton}
    </div>
  </article>\`;
}

function answerCandidateHtml(candidate) {
  const lines = claimCitationLines(candidate);
  return \`<article class="item ask-card">
    <h3>\${escapeHtml(candidate.claim_id)}</h3>
    <p>\${escapeHtml(candidate.statement)}</p>
    <p class="pill">\${escapeHtml(candidate.basis)} · \${escapeHtml(candidate.scope_state)}</p>
    \${citationLinesHtml(lines)}
    <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(lines.join("; "))}">Copy citation</button>
  </article>\`;
}

function claimHtml(claim) {
  const lines = claimCitationLines(claim);
  return \`<article class="item ask-card">
    <h3>\${escapeHtml(claim.claim_id)}</h3>
    <p>\${escapeHtml(claim.statement)}</p>
    <p class="pill">\${escapeHtml(claim.claim_state)} · \${escapeHtml(claim.claim_kind)} · \${escapeHtml(claim.scope_state)}</p>
    \${citationLinesHtml(lines)}
    <p class="meta">\${escapeHtml(claim.why_included ?? "")}</p>
    <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(lines.join("; "))}">Copy citation</button>
  </article>\`;
}

function uncertainClaimHtml(claim) {
  const lines = claimCitationLines(claim);
  return \`<article class="item ask-card">
    <h3>\${escapeHtml(claim.claim_id)}</h3>
    <p>\${escapeHtml(claim.statement)}</p>
    <p class="pill">\${escapeHtml(claim.claim_state)} · \${escapeHtml(claim.scope_state)}</p>
    \${citationLinesHtml(lines)}
    \${plainListHtml("Uncertainty markers", claim.uncertainty_markers ?? [])}
    <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(lines.join("; "))}">Copy citation</button>
  </article>\`;
}

function eventHtml(event) {
  const lines = [
    \`event: \${event.id ?? "unknown"}\`,
    \`path: \${event.path}\`,
    \`recorded: \${event.recorded_at ?? "unknown"}\`,
    \`observed: \${event.observed_at ?? "unknown"}\`
  ];
  return \`<article class="item ask-card">
    <h3>\${escapeHtml(event.id ?? event.path)}</h3>
    <p class="pill">source Event</p>
    \${citationLinesHtml(lines)}
    <p class="meta">\${escapeHtml(event.why_included ?? "")}</p>
    <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(lines.join("; "))}">Copy citation</button>
  </article>\`;
}

function linkedItemHtml(item) {
  const sourceEvents = (item.source_events ?? []).join(", ") || "none";
  const affectedFiles = (item.affected_files ?? []).join(", ") || "none";
  const stagedClaims = (item.staged_claim_ids ?? []).join(", ") || "none";
  const lines = [
    \`id: \${item.id ?? "unknown"}\`,
    \`path: \${item.path}\`,
    \`events: \${sourceEvents}\`
  ];
  return \`<article class="item ask-card">
    <h3>\${escapeHtml(item.id ?? item.path)}</h3>
    <p class="pill">\${escapeHtml(item.type ?? "linked item")} · \${escapeHtml(item.review_state ?? item.followup_state ?? "unknown")}</p>
    \${detailListHtml([
      ["Path", item.path],
      ["Source Events", sourceEvents],
      ["Affected files", affectedFiles],
      ["Staged claims", stagedClaims],
      ["Why included", item.why_included ?? "linked to retrieved memory"]
    ])}
    <div class="action-row">
      <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(lines.join("; "))}">Copy citation</button>
      \${linkedItemActionButtonHtml(item)}
    </div>
  </article>\`;
}

function pageSummaryHtml(page) {
  const lines = [
    \`page: \${page.path}\`,
    \`id: \${page.id ?? "unknown"}\`,
    \`why: \${page.whyIncluded ?? "loaded from deterministic match"}\`
  ];
  const targetType = page.type === "person" || page.type === "context" ? page.type : "";
  const briefLinks = targetType
    ? \`<div class="action-row">
      \${briefLinkButtonHtml(targetType, targetType, page.id ?? page.path, targetType === "person" ? "Before meeting brief" : "Context status brief")}
      \${briefLinkButtonHtml("recent", targetType, page.id ?? page.path, "Recent changes")}
      \${targetType === "context" ? \`<button type="button" class="secondary ask-open-entity" data-entity-kind="context" data-entity-target="\${escapeHtml(page.id ?? page.path)}">Open context room</button>\` : ""}
    </div>\`
    : "";
  return \`<article class="item ask-card">
    <h3>\${escapeHtml(page.name)}</h3>
    <p class="pill">\${escapeHtml(page.type ?? "page")} · score \${escapeHtml(page.score ?? 0)}</p>
    \${citationLinesHtml(lines)}
    \${plainListHtml("Matched terms", page.matchedTerms ?? [])}
    \${plainListHtml("Uncertainty markers", page.uncertaintyMarkers ?? [])}
    <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(lines.join("; "))}">Copy citation</button>
    \${briefLinks}
  </article>\`;
}

function missingInfoHtml(item) {
  const lines = item.citations ? citationSetLines(item.citations) : [];
  return \`<article class="item ask-card">
    <h3>\${escapeHtml(item.title)}</h3>
    <p class="pill">\${escapeHtml(item.badge)}</p>
    <p>\${escapeHtml(item.body)}</p>
    \${citationLinesHtml(lines)}
  </article>\`;
}

function manualActionHtml(action) {
  return \`<article class="item ask-card">
    <h3>\${escapeHtml(action.label)}</h3>
    <p class="pill">\${escapeHtml(action.action)}</p>
    \${detailListHtml([
      ["Reason", action.reason],
      ["Target", action.target ?? "none"]
    ])}
    \${manualActionButtonHtml(action)}
  </article>\`;
}

function conflictOrStaleHtml(item) {
  const lines = citationSetLines(item.citations ?? {
    claim_ids: item.claim_id ? [item.claim_id] : [],
    event_ids: item.evidence ?? [],
    page_paths: item.page_path ? [item.page_path] : []
  });

  return \`<article class="item ask-card">
    <h3>\${escapeHtml(item.claim_id ?? item.code)}</h3>
    <p>\${escapeHtml(item.statement ?? item.message)}</p>
    <p class="pill">\${escapeHtml(item.item_type)} · \${escapeHtml(item.claim_state ?? item.code)} · \${escapeHtml(item.scope_state ?? "scope unknown")}</p>
    <p class="meta">\${escapeHtml(item.message ?? "")}</p>
    \${citationLinesHtml(lines)}
    <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(lines.join("; "))}">Copy cited basis</button>
  </article>\`;
}

function askFrictionLogHtml(result) {
  const shouldShow = (result.manualActions ?? []).some((action) => action.action === "log_friction") ||
    (result.missingInformation ?? []).some((item) => item.code === "no_match");

  if (!shouldShow) {
    return "";
  }

  return \`<section data-ask-section="log-retrieval-miss">
    <h2>Log retrieval miss</h2>
    <article class="item ask-card">
      <h3>Feedback capture</h3>
      <p class="meta">Creates an Event and pending NOOP Transaction only; no answer text or generated explanation is saved.</p>
      <form id="ask-friction-log-form" class="action-stack">
        <label class="field" for="ask-friction-note"><span>Friction note</span><textarea id="ask-friction-note" name="note" rows="4" placeholder="What should Assisto remember about this miss?"></textarea></label>
        <div class="action-row">
          <button type="submit" name="mode" value="preview" class="secondary">Preview log</button>
          <button type="submit" name="mode" value="create">Log miss</button>
        </div>
      </form>
      <div id="ask-friction-output" class="action-output"></div>
    </article>
  </section>\`;
}

function bindAskFrictionLog(result) {
  const form = document.querySelector("#ask-friction-log-form");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const preview = event.submitter?.value === "preview";
    const output = document.querySelector("#ask-friction-output");
    output.innerHTML = "<pre>Running</pre>";

    try {
      const action = await postJson(preview ? "/api/friction/log/preview" : "/api/friction/log", {
        kind: "retrieval_miss",
        question: result.query,
        note: form.elements.note.value
      });

      if (action.created) {
        snapshot = await fetchJson("/api/snapshot");
        health = null;
        dogfoodHome = null;
      dogfoodControlRoom = null;
        useTomorrow = null;
        reviewTurbo = null;
    reviewAutopilot = null;
      }

      output.innerHTML = renderActionResult(action);
    } catch (error) {
      output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
    }
  });
}

function bindAskRepairActions() {
  for (const button of document.querySelectorAll(".ask-open-entity")) {
    button.addEventListener("click", async () => {
      const requestedKind = button.dataset.entityKind;
      const requestedTarget = button.dataset.entityTarget;
      if (!requestedKind || !requestedTarget) {
        return;
      }

      entityKind = requestedKind;
      entityList = null;
      entityDetail = null;
      selectWorkbenchTab("entities");
      view.innerHTML = '<article class="item"><h2>Loading entity</h2><p class="meta">Opening cited memory page.</p></article>';

      try {
        const [loadedEntities, loadedDetail] = await Promise.all([
          fetchJson(\`/api/entities/stewardship?kind=\${encodeURIComponent(requestedKind)}\`),
          loadEntityDetailWithRoom(requestedTarget)
        ]);

        if (activeTab !== "entities" || entityKind !== requestedKind) {
          return;
        }

        entityList = loadedEntities;
        entityDetail = loadedDetail;
        renderEntityExplorer();
      } catch (error) {
        view.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
      }
    });
  }

  for (const button of document.querySelectorAll(".ask-repair-action")) {
    button.addEventListener("click", () => {
      const action = button.dataset.action;

      if (action === "capture_note") {
        void openQuickCapture();
        return;
      }

      if (action === "log_friction") {
        const field = document.querySelector("#ask-friction-note");
        field?.focus();
        field?.scrollIntoView({ block: "center" });
        return;
      }

      if (action === "review_item") {
        activateTab("review");
        return;
      }

      if (action === "open_followups" || action === "open_today") {
        activateTab("today");
        return;
      }

      if (action === "inspect_entity") {
        activateTab("entities");
        return;
      }

      if (action === "run_health_check") {
        activateTab("health");
      }
    });
  }
}

function nextQuestionHtml(item) {
  return \`<article class="item ask-card">
    <h3>Suggested question</h3>
    <p>\${escapeHtml(item.question)}</p>
  </article>\`;
}

function answerContractExportHtml(result) {
  const text = answerContractExportText(result);
  return \`<section data-ask-section="cited-answer-export">
    <h2>Cited answer export</h2>
    <details class="context-pack">
      <summary>Show derived answer basis</summary>
      <pre id="answer-contract-export-text">\${escapeHtml(text)}</pre>
    </details>
    <button type="button" class="copy-derived-text" data-copy-target="#answer-contract-export-text">Copy cited answer basis</button>
  </section>\`;
}

function answerContractExportText(result) {
  const lines = [
    "# Cited answer basis",
    \`Question: \${result.query ?? ""}\`,
    "",
    "## What memory can say",
    ...listOrEmpty((result.directAnswers ?? []).map((answer) => {
      const citations = answerCitationLines(answer).join("; ");
      return \`- \${answer.answer ?? answer.statement} [\${citations}]\`;
    })),
    "",
    "## What memory cannot confirm",
    ...listOrEmpty((result.cannotConfirm ?? []).map((item) => \`- \${item.code}: \${item.message}\`)),
    "",
    "## Conflicts or stale facts",
    ...listOrEmpty([
      ...(result.conflicts ?? []).map((item) => \`- conflict \${item.claim_id}: \${item.message}\`),
      ...(result.staleSignals ?? []).map((item) => \`- stale \${item.claim_id}: \${item.message}\`)
    ]),
    "",
    "## Proof paths",
    ...listOrEmpty(proofPathItems(result).map((item) => {
      const proof = item.proof ?? {};
      const claimIds = (proof.source_claim_ids ?? []).join(", " );
      const eventIds = (proof.source_events ?? []).join(", " );
      return "- "
        + (proof.proof_id ?? item.answer_id ?? "proof")
        + ": "
        + (proof.rule ?? "symbolic proof")
        + "; claim_ids "
        + (claimIds.length ? claimIds : "none")
        + "; event_ids "
        + (eventIds.length ? eventIds : "none");
    })),
    "",
    "## Repair actions",
    ...listOrEmpty((result.repairActions ?? result.manualActions ?? []).map((action) => \`- \${action.label}: \${action.reason}\`))
  ];

  return lines.join("\\n");
}

function listOrEmpty(items) {
  return items.length ? items : ["- none"];
}

function contextPackHtml(contextPack) {
  const text = contextPack ?? "";
  return \`<section data-ask-section="context-pack"><h2>Context pack</h2>
    <details class="context-pack">
      <summary>Show raw compatibility pack</summary>
      <pre id="context-pack-text">\${escapeHtml(text)}</pre>
    </details>
    <button type="button" class="copy-derived-text" data-copy-target="#context-pack-text">Copy context pack</button>
  </section>\`;
}

function claimCitationLines(claim) {
  return [
    \`claim_id: \${claim.claim_id}\`,
    \`page: \${claim.page_path}\`,
    \`events: \${(claim.evidence ?? []).join(", ") || "none"}\`,
    \`scope: \${claim.scope ?? "null"}\`,
    \`scope_state: \${claim.scope_state ?? "unknown"}\`
  ];
}

function answerCitationLines(answer) {
  const citationLines = Array.isArray(answer.citations)
    ? [
      "claim_id: " + (answer.claim_id || citationValues(answer.citations, "claim").join(", ") || "unknown"),
      "page: " + (answer.page_path || citationValues(answer.citations, "page").join(", ") || "unknown"),
      "events: " + (citationValues(answer.citations, "event").join(", ") || "none")
    ]
    : [
      "claim_id: " + (answer.claim_id ?? "unknown"),
      "page: " + (answer.page_path ?? "unknown"),
      "events: " + ((answer.citations?.event_ids ?? []).join(", ") || "none")
    ];

  return [
    ...citationLines,
    "scope: " + (answer.scope ?? "null"),
    "scope_state: " + (answer.scope_state ?? "unknown"),
    ...(answer.inference_paths?.length ? ["inference_paths: " + answer.inference_paths.join(", ")] : [])
  ];
}

function citationSetLines(citations) {
  if (!citations) {
    return [];
  }

  if (Array.isArray(citations)) {
    return citations.map((citation) => citationLine(citation));
  }

  return [
    "claims: " + ((citations.claim_ids ?? []).join(", ") || "none"),
    "events: " + ((citations.event_ids ?? []).join(", ") || "none"),
    "pages: " + ((citations.page_paths ?? []).join(", ") || "none")
  ];
}

function citationLine(citation) {
  const id = citation.claim_id ?? citation.event_id ?? citation.page_path ?? citation.id ?? "unknown";
  const path = citation.path && citation.path !== id ? " (" + citation.path + ")" : "";
  return (citation.kind ?? "citation") + ": " + id + path;
}

function entityKindForPagePath(pagePath) {
  if (/^memory\\/people\\//.test(pagePath ?? "")) {
    return "person";
  }

  if (/^memory\\/contexts\\//.test(pagePath ?? "")) {
    return "context";
  }

  return "";
}

function linkedItemActionButtonHtml(item) {
  if (item.type === "review_item") {
    return '<button type="button" class="secondary ask-repair-action" data-action="review_item">Open Review</button>';
  }

  if (item.type === "followup") {
    return '<button type="button" class="secondary ask-repair-action" data-action="open_followups">Open FollowUps</button>';
  }

  return "";
}

function manualActionButtonHtml(action) {
  const labels = {
    capture_note: "Capture missing memory",
    inspect_entity: "Open entities",
    review_item: "Open Review",
    open_followups: "Open FollowUps",
    open_today: "Open Today",
    run_health_check: "Open Health",
    log_friction: "Log retrieval miss"
  };
  const label = labels[action.action];

  if (!label) {
    return "";
  }

  return \`<button type="button" class="secondary ask-repair-action" data-action="\${escapeHtml(action.action)}">\${escapeHtml(label)}</button>\`;
}

function sectionSlug(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function citationLinesHtml(lines) {
  return \`<div class="citation-list">\${lines.map((line) => \`<p class="meta">\${escapeHtml(line)}</p>\`).join("")}</div>\`;
}

function bindCopyControls() {
  for (const button of document.querySelectorAll(".copy-derived-text")) {
    button.addEventListener("click", async () => {
      await copyDerivedText(copyTextForButton(button));
    });
  }
}

function copyTextForButton(button) {
  const target = button.dataset.copyTarget;

  if (target) {
    return document.querySelector(target)?.textContent ?? "";
  }

  return button.dataset.copyText ?? "";
}

async function copyDerivedText(text) {
  let prefix = "Derived text only; not saved.";

  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      prefix = "Copied. Derived text only; not saved.";
    }
  } catch {
    prefix = "Derived text only; not saved.";
  }

  const output = document.querySelector("#copy-output");

  if (output) {
    output.textContent = \`\${prefix}\\n\${text}\`;
  }
}

function clearCopyOutput() {
  const output = document.querySelector("#copy-output");

  if (output) {
    output.textContent = "";
  }
}

function briefLinkButtonHtml(kind, targetKind, target, label) {
  return \`<button type="button" class="secondary open-brief-link" data-brief-kind="\${escapeHtml(kind)}" data-brief-target-kind="\${escapeHtml(targetKind ?? "")}" data-brief-target="\${escapeHtml(target ?? "")}">\${escapeHtml(label)}</button>\`;
}

function bindBriefLinks() {
  for (const button of document.querySelectorAll(".open-brief-link")) {
    button.addEventListener("click", () => {
      pendingBriefRequest = {
        kind: button.dataset.briefKind,
        targetKind: button.dataset.briefTargetKind,
        target: button.dataset.briefTarget
      };
      selectWorkbenchTab("briefs");
      render();
    });
  }
}

function renderBriefs() {
  const requestedBrief = pendingBriefRequest;
  pendingBriefRequest = null;
  view.innerHTML = \`<form class="toolbar" id="brief-form">
    <select id="brief-kind" name="kind">
      <option value="today">Today</option>
      <option value="person">Before meeting with Person</option>
      <option value="context">Project/Context status</option>
      <option value="followups">Follow-up review</option>
      <option value="review">Review-risk brief</option>
      <option value="recent">What changed recently</option>
    </select>
    <select id="brief-target-kind" name="targetKind" hidden disabled>
      <option value="">All recent memory</option>
      <option value="person">Person</option>
      <option value="context">Context</option>
    </select>
    <select id="brief-target-select" name="targetSelect" hidden disabled></select>
    <input id="brief-target" name="target" placeholder="Optional id/path override" hidden>
    <button type="submit">Build</button>
  </form><div id="brief-result" class="brief-result"></div>
  <output id="copy-output" class="copy-output" aria-live="polite"></output>\`;
  const form = document.querySelector("#brief-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const kind = document.querySelector("#brief-kind").value;
    const targetKind = briefTargetKindValue();
    const target = briefTargetValue();
    const query = new URLSearchParams({ kind });

    if (targetKind) {
      query.set("targetKind", targetKind);
    }

    if (target) {
      query.set("target", target);
    }

    document.querySelector("#brief-result").innerHTML = '<article class="item"><h2>Loading brief</h2><p class="meta">Reading canonical markdown.</p></article>';

    try {
      const result = await fetchJson(\`/api/brief?\${query.toString()}\`);
      renderBrief(result);
    } catch (error) {
      document.querySelector("#brief-result").innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
    }
  });
  document.querySelector("#brief-kind").addEventListener("change", () => {
    clearCopyOutput();
    void updateBriefTargetControls();
  });
  document.querySelector("#brief-target-kind").addEventListener("change", () => {
    clearCopyOutput();
    void updateBriefTargetControls();
  });
  void initializeBriefForm(requestedBrief);
}

function renderBrief(result) {
  clearCopyOutput();
  const sections = [
    briefSectionHtml(
      "Active claims",
      result.activeClaims,
      briefClaimHtml,
      "No active claims for this brief."
    ),
    briefSectionHtml(
      "Uncertainty and review",
      [...result.uncertainClaims, ...result.reviewItems],
      briefUncertaintyHtml,
      "No uncertain claims or linked review items."
    ),
    briefSectionHtml(
      "Open follow-ups",
      result.openFollowUps,
      briefFollowUpHtml,
      "No open follow-ups for this brief."
    ),
    briefSectionHtml(
      "Source Events",
      result.evidenceEvents,
      briefEventHtml,
      "No source events were cited."
    ),
    briefSectionHtml(
      "Warnings",
      result.warnings ?? [],
      briefWarningHtml,
      "No warnings."
    )
  ];

  document.querySelector("#brief-result").innerHTML = \`<article class="item">
    <h2>\${escapeHtml(result.title)}</h2>
    <p class="pill">\${escapeHtml(result.kind)}</p>
    \${result.target ? detailListHtml([
      ["Target", result.target.id ?? result.target.path],
      ["Path", result.target.path],
      ["Aliases", (result.target.aliases ?? []).join(", ") || "none"]
    ]) : ""}
  </article>\${sections.join("")}\${briefExportHtml(result.contextPack)}\`;
  bindCopyControls();
}

async function updateBriefTargetControls() {
  const kind = document.querySelector("#brief-kind")?.value;
  const targetKindSelect = document.querySelector("#brief-target-kind");
  const select = document.querySelector("#brief-target-select");
  const manual = document.querySelector("#brief-target");

  if (!targetKindSelect || !select || !manual) {
    return;
  }

  if (kind === "recent") {
    targetKindSelect.hidden = false;
    targetKindSelect.disabled = false;
  } else {
    targetKindSelect.hidden = true;
    targetKindSelect.disabled = true;
    targetKindSelect.value = "";
  }

  const lookupKind = briefTargetKindValue();

  if (!lookupKind) {
    select.hidden = true;
    select.disabled = true;
    manual.hidden = true;
    manual.value = "";
    select.innerHTML = "";
    return;
  }

  select.hidden = false;
  select.disabled = false;
  manual.hidden = false;
  select.innerHTML = '<option value="">Loading targets...</option>';

  try {
    const response = await briefTargetsFor(lookupKind);
    select.innerHTML = [
      \`<option value="">Select \${escapeHtml(lookupKind)}</option>\`,
      ...response.targets.map((target) => briefTargetOptionHtml(target))
    ].join("");
  } catch (error) {
    select.innerHTML = \`<option value="">\${escapeHtml(error.message)}</option>\`;
  }
}

async function initializeBriefForm(requestedBrief) {
  if (requestedBrief?.kind) {
    document.querySelector("#brief-kind").value = requestedBrief.kind;
  }

  if (requestedBrief?.targetKind) {
    document.querySelector("#brief-target-kind").value = requestedBrief.targetKind;
  }

  await updateBriefTargetControls();

  if (requestedBrief?.target) {
    applyBriefTargetValue(requestedBrief.target);
  }

  if (requestedBrief) {
    document.querySelector("#brief-form").requestSubmit();
  }
}

function applyBriefTargetValue(target) {
  const select = document.querySelector("#brief-target-select");
  const manual = document.querySelector("#brief-target");
  const matchingOption = [...select.options].some((option) => option.value === target);

  if (matchingOption) {
    select.value = target;
    manual.value = "";
    return;
  }

  manual.value = target;
}

async function briefTargetsFor(kind) {
  if (!briefTargets[kind]) {
    briefTargets[kind] = await fetchJson(\`/api/brief/targets?kind=\${encodeURIComponent(kind)}\`);
  }

  return briefTargets[kind];
}

function briefTargetOptionHtml(target) {
  const value = target.id ?? target.path;
  const aliases = (target.aliases ?? []).join(", ");
  const label = aliases ? \`\${target.name} · \${aliases}\` : target.name;

  return \`<option value="\${escapeHtml(value)}">\${escapeHtml(label)}</option>\`;
}

function briefTargetValue() {
  const kind = document.querySelector("#brief-kind").value;

  if (briefTargetKindValue()) {
    return document.querySelector("#brief-target-select").value || document.querySelector("#brief-target").value.trim();
  }

  return "";
}

function briefTargetKindValue() {
  const kind = document.querySelector("#brief-kind").value;

  if (kind === "person" || kind === "context") {
    return kind;
  }

  if (kind === "recent") {
    return document.querySelector("#brief-target-kind").value;
  }

  return "";
}

function briefSectionHtml(label, items, renderItem, emptyText) {
  const body = items.length
    ? \`<div class="grid">\${items.map(renderItem).join("")}</div>\`
    : \`<article class="item"><h3>Empty</h3><p class="meta">\${escapeHtml(emptyText)}</p></article>\`;

  return \`<section><h2>\${escapeHtml(label)}</h2>\${body}</section>\`;
}

function briefClaimHtml(claim) {
  return \`<article class="item">
    <h3>\${escapeHtml(claim.claim_id)}</h3>
    <p>\${escapeHtml(claim.statement)}</p>
    <p class="pill">\${escapeHtml(claim.claim_state)} · \${escapeHtml(claim.claim_kind)} · \${escapeHtml(claim.scope_state)}</p>
    \${detailListHtml([
      ["Page", claim.page_path],
      ["Scope", claim.scope ?? "null"],
      ["Evidence", claim.evidence.join(", ") || "none"]
    ])}
    \${plainListHtml("Uncertainty markers", claim.uncertainty_markers ?? [])}
  </article>\`;
}

function briefUncertaintyHtml(item) {
  if (item.claim_id) {
    return briefClaimHtml(item);
  }

  return \`<article class="item">
    <h3>\${escapeHtml(item.id ?? item.path)}</h3>
    <p class="pill">\${escapeHtml(item.review_reason ?? "review")} · \${escapeHtml(item.review_state ?? "unknown")}</p>
    \${detailListHtml([
      ["Path", item.path],
      ["Affected files", (item.affected_files ?? []).join(", ") || "none"],
      ["Source Events", (item.source_events ?? []).join(", ") || "none"],
      ["Staged claims", (item.staged_claim_ids ?? []).join(", ") || "none"]
    ])}
  </article>\`;
}

function briefFollowUpHtml(followup) {
  return \`<article class="item">
    <h3>\${escapeHtml(followup.id)}</h3>
    <p class="pill">\${escapeHtml(followup.followup_state)} · \${escapeHtml(followup.review_state)}</p>
    \${detailListHtml([
      ["Path", followup.path],
      ["Owner", followup.owner ?? "unknown"],
      ["Due", followup.due_at ?? "none"],
      ["Source Events", followup.source_events.join(", ") || "none"],
      ["Related", followup.related.join(", ") || "none"]
    ])}
  </article>\`;
}

function briefEventHtml(event) {
  return \`<article class="item">
    <h3>\${escapeHtml(event.id)}</h3>
    <p class="pill">Source event</p>
    \${detailListHtml([
      ["Path", event.path],
      ["Recorded", event.recorded_at ?? "unknown"],
      ["Observed", event.observed_at ?? "unknown"]
    ])}
  </article>\`;
}

function briefWarningHtml(warning) {
  return \`<article class="item">
    <h3>Warning</h3>
    <p class="meta">\${escapeHtml(warning)}</p>
  </article>\`;
}

function briefExportHtml(contextPack) {
  return \`<section><h2>Compact export</h2>
    <article class="item">
      <pre id="brief-export-text">\${escapeHtml(contextPack ?? "")}</pre>
      <button type="button" class="copy-derived-text" data-copy-target="#brief-export-text">Copy brief</button>
    </article>
  </section>\`;
}

function memoryPath(file) {
  return file.startsWith("memory/") ? file : \`memory/\${file}\`;
}

async function renderHealth() {
  if (!health || !maintenancePlan) {
    view.innerHTML = '<article class="item"><h2>Loading health</h2><p class="meta">Reading markdown and maintenance signals.</p></article>';
    const [loadedHealth, loadedMaintenance] = await Promise.all([
      fetchJson("/api/health"),
      fetchJson("/api/maintenance/plan?mode=changed&seed=workbench")
    ]);
    health = loadedHealth;
    maintenancePlan = loadedMaintenance;

    if (activeTab !== "health") {
      return;
    }
  }

  if (activeTab !== "health") {
    return;
  }

  renderHealthCenter(health);
}

function renderHealthCenter(result) {
  const counts = result.counts;
  const countCards = cardsHtml(
    Object.keys(counts).map((key) => ({ key, count: counts[key] })),
    (item) => item.key.replaceAll("_", " "),
    (item) => String(item.count),
    () => result.warnings
  );
  const findingCards = healthFindingCardsHtml(result.findings);

  view.innerHTML = \`<article class="item">
    <h2>Stage health review</h2>
    <form id="health-stage-form" class="action-row">
      <input name="note" placeholder="Note">
      <button type="submit" name="mode" value="preview" class="secondary">Preview</button>
      <button type="submit" name="mode" value="apply">Stage</button>
    </form>
  </article>
  \${maintenancePanelHtml(maintenancePlan)}
  \${countCards}
  <section><h2>Findings</h2>\${findingCards}</section>
  <div id="action-output" class="action-output"></div>\`;
  bindHealthActions();
}

function maintenancePanelHtml(plan) {
  if (!plan) {
    return '<article class="item"><h2>Maintenance Dream Cycle</h2><p class="meta">Loading maintenance plan.</p></article>';
  }
  const topFindings = (plan.findings ?? []).slice(0, 6).map((finding) => {
    const actions = finding.stageable
      ? '<form class="maintenance-finding-form action-row" data-finding-id="' + escapeHtml(finding.finding_id) + '"><input name="note" placeholder="Maintenance note"><button type="submit" name="mode" value="preview" class="secondary">Preview maintenance finding</button><button type="submit" name="mode" value="apply">Stage maintenance finding</button></form>'
      : '<p class="meta">Read-only signal in v1.</p>';
    return '<article class="item"><h3>' + escapeHtml(finding.code) + '</h3><p class="pill">' + escapeHtml(finding.severity) + ' · ' + escapeHtml(finding.finding_id) + '</p><p>' + escapeHtml(finding.message) + '</p>' + actions + '</article>';
  }).join("");
  return '<section class="maintenance-panel"><h2>Maintenance Dream Cycle</h2>' +
    '<article class="item"><h3>Plan summary</h3>' + detailListHtml([
      ["Mode", plan.mode],
      ["Findings", String(plan.summary?.total_findings ?? 0)],
      ["Stageable", String(plan.summary?.stageable ?? 0)],
      ["Sources", "health " + String(plan.summary?.health ?? 0) + ", lint " + String(plan.summary?.lint ?? 0) + ", review " + String(plan.summary?.review_throughput ?? 0)]
    ]) + '<form id="maintenance-run-form" class="action-row"><button type="submit" class="secondary">Save local maintenance run</button></form></article>' +
    '<div class="grid">' + (topFindings || '<article class="item"><h3>No findings</h3><p class="meta">Maintenance plan is clear.</p></article>') + '</div>' +
    plainListHtml("Warnings", plan.warnings ?? []) +
  '</section>';
}
function healthFindingCardsHtml(findings) {
  if (!findings.length) {
    return '<article class="item"><h2>Empty</h2><p class="meta">No health findings.</p></article>';
  }

  return \`<div class="grid">\${findings.map((finding) => \`<article class="item" data-finding-id="\${escapeHtml(finding.finding_id)}">
    <h2>\${escapeHtml(finding.code.replaceAll("_", " "))}</h2>
    <p class="pill">\${escapeHtml(finding.severity)} · \${escapeHtml(finding.finding_id)}</p>
    \${detailListHtml([
      ["Message", finding.message],
      ["Affected files", finding.affected_files.join(", ") || "none"],
      ["Source Events", finding.source_events.join(", ") || "none"],
      ["Suggested action", finding.suggested_action]
    ])}
    \${plainListHtml("Evidence", finding.evidence)}
    <form class="health-finding-form action-stack" data-finding-id="\${escapeHtml(finding.finding_id)}">
      <div class="action-row">
        <input name="note" placeholder="Finding note">
        <button type="submit" name="mode" value="preview" class="secondary">Preview finding</button>
        <button type="submit" name="mode" value="apply">Stage finding</button>
      </div>
    </form>
  </article>\`).join("")}</div>\`;
}

function bindHealthActions() {
  document.querySelector("#health-stage-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = event.submitter;
    const preview = submitter?.value === "preview";
    await runAction(preview ? "/api/health/stage-review/preview" : "/api/health/stage-review", {
      note: form.elements.note.value
    });
  });

  document.querySelector("#maintenance-run-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runAction("/api/maintenance/run", { mode: maintenancePlan?.mode ?? "changed", seed: maintenancePlan?.seed ?? "workbench" });
    maintenancePlan = null;
  });

  for (const form of document.querySelectorAll(".maintenance-finding-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const preview = submitter?.value === "preview";
      await runAction(preview ? "/api/maintenance/stage-finding/preview" : "/api/maintenance/stage-finding", {
        findingId: form.dataset.findingId,
        note: form.elements.note.value
      });
    });
  }

  for (const form of document.querySelectorAll(".health-finding-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const preview = submitter?.value === "preview";
      await runAction(preview ? "/api/health/stage-finding/preview" : "/api/health/stage-finding", {
        findingId: form.dataset.findingId,
        note: form.elements.note.value
      });
    });
  }
}

function renderCards(items, title, badge, details) {
  view.innerHTML = cardsHtml(items, title, badge, details);
}

function cardsHtml(items, title, badge, details) {
  if (!items.length) {
    return '<article class="item"><h2>Empty</h2><p class="meta">No matching memory objects.</p></article>';
  }

  return \`<div class="grid">\${items.map((item) => \`<article class="item">
    <h2>\${escapeHtml(title(item))}</h2>
    <p class="pill">\${escapeHtml(badge(item))}</p>
    \${details(item).filter(Boolean).map((line) => \`<p class="meta">\${escapeHtml(line)}</p>\`).join("")}
  </article>\`).join("")}</div>\`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

loadSnapshot().catch((error) => {
  status.value = "Error";
  view.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
});
`;
}
