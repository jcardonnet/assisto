import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import {
  applyTransaction,
  buildActivationStatusResult,
  buildDailyQueueResult,
  buildCaptureInboxResult,
  buildDogfoodHomeResult,
  buildUseAssistoTomorrowResult,
  readDailySession,
  runPersonalDogfoodEval,
  checkMemoryHealth,
  buildSessionBrief,
  buildTodayWorkbenchResult,
  createCaptureNote,
  createFrictionLog,
  createHealthReviewTransaction,
  createImportNotes,
  createImportTriage,
  createSeedKit,
  createContextNoteTransaction,
  createEntityAliasTransaction,
  createEntityContextTransaction,
  createOpenAiExtractionProvider,
  createReviewApplyTransaction,
  createReviewStateTransaction,
  listSessionBriefTargets,
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
  previewFrictionLog,
  previewImportNotes,
  previewImportTriage,
  previewSeedKit,
  updateDailySession,
  previewAnswerDraft,
  retrieveContextForAnswer,
  validateTransaction,
  type AnswerDraftResult,
  type ActivationStatusResult,
  type CaptureCreateResult,
  type CaptureInboxResult,
  type CapturePreviewResult,
  type ContextPackResult,
  type ContextNoteResult,
  type DailyQueueResult,
  type DogfoodHomeResult,
  type PersonalDogfoodEvalResult,
  type ExtractionProvider,
  type EntityKind,
  type EntityStewardshipPreview,
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
  type MemoryHealthResult,
  type ParsedTransaction,
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
  type TodayWorkbenchResult,
  type ValidationResult
} from "@assisto/core";

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

export interface WorkbenchAskSession {
  generated_at: string;
  query?: string;
  basis: ContextPackResult | null;
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
  staged_claims: WorkbenchReviewStagedClaim[];
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

export interface WorkbenchRouteRequest {
  method?: string;
  url: string;
  body?: string;
}

export interface WorkbenchRouteResponse {
  status: number;
  content_type: string;
  body: string;
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
  const server = http.createServer((request, response) => {
    void handleRequest(options.root, request, response);
  });

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

async function handleRequest(root: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await readRequestBody(request);
    const route = await handleWorkbenchRoute(root, {
      method: request.method,
      url: request.url ?? "/",
      body
    });
    response.writeHead(route.status, {
      "content-type": route.content_type,
      "cache-control": "no-store"
    });
    response.end(request.method === "HEAD" ? "" : route.body);
  } catch (error) {
    const route = jsonRoute(500, { error: error instanceof Error ? error.message : String(error) });
    response.writeHead(route.status, {
      "content-type": route.content_type,
      "cache-control": "no-store"
    });
    response.end(route.body);
  }
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

  if (requestUrl.pathname === "/api/today") {
    return jsonRoute(200, await buildTodayWorkbenchResult(root));
  }

  if (requestUrl.pathname === "/api/daily/queue") {
    return jsonRoute(200, await buildDailyQueueResult(root));
  }

  if (requestUrl.pathname === "/api/daily/session") {
    return jsonRoute(200, await readDailySession(root));
  }

  if (requestUrl.pathname === "/api/dogfood/home") {
    return jsonRoute(200, await buildDogfoodHomeResult(root));
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

  if (requestUrl.pathname === "/api/import/session") {
    const sessionId = requestUrl.searchParams.get("id")?.trim();

    if (!sessionId) {
      return jsonRoute(400, { error: "Missing required query parameter: id." });
    }

    return jsonRoute(200, await readImportSession(root, sessionId));
  }

  if (requestUrl.pathname === "/api/review") {
    return jsonRoute(200, await collectReviewInbox(root));
  }

  if (requestUrl.pathname === "/api/review/turbo") {
    return jsonRoute(200, await collectReviewTurbo(root));
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

  if (requestUrl.pathname === "/api/ask") {
    const query = optionalQuery(requestUrl);
    return query
      ? jsonRoute(200, await retrieveContextForAnswer(root, query))
      : jsonRoute(400, { error: "Missing required query parameter: q." });
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

  if (requestUrl.pathname === "/api/health") {
    return jsonRoute(200, await checkMemoryHealth(root));
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
    if (pathname === "/api/capture/preview") {
      return jsonRoute(200, await createCapturePreview(root, input, false));
    }

    if (pathname === "/api/capture") {
      return jsonRoute(200, await createCapturePreview(root, input, true));
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

function buildCitationExplorer(basis: ContextPackResult): WorkbenchAskCitationExplorer {
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
    followup_ids: uniqueStrings((basis.linkedFollowUps ?? []).map((item) => item.id).filter((value): value is string => typeof value === "string"))
  };
}

function emptyCitationExplorer(): WorkbenchAskCitationExplorer {
  return {
    claim_ids: [],
    event_ids: [],
    page_paths: [],
    review_item_ids: [],
    followup_ids: []
  };
}

function matchedPagePreviews(basis: ContextPackResult): WorkbenchAskPagePreview[] {
  return (basis.matchedPages ?? []).map((page) => {
    const loaded = (basis.pages ?? []).find((candidate) => candidate.path === page.path);
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

async function sourceEventPreviews(root: string, basis: ContextPackResult): Promise<WorkbenchAskEventPreview[]> {
  return Promise.all(
    (basis.evidenceEvents ?? []).map(async (event) => {
      const loaded = (basis.events ?? []).find((candidate) => candidate.path === event.path);
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

function missingMemoryActions(basis: ContextPackResult): WorkbenchAskMissingMemoryAction[] {
  if (!(basis.missingInformation ?? []).length && !(basis.manualActions ?? []).some((action) => action.action === "log_friction")) {
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
  const basis = query ? await retrieveContextForAnswer(root, query) : null;
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

async function createDogfoodEvalRun(root: string, input: Record<string, unknown>): Promise<PersonalDogfoodEvalResult> {
  const questionsPath = optionalStringInput(input, "questionsPath", "questions_path");
  return runPersonalDogfoodEval(root, {
    questionsPath: questionsPath ? path.resolve(root, questionsPath) : undefined
  });
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

  return {
    generated_at: new Date().toISOString(),
    lanes: reviewTurboLanes(items),
    items
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
    staged_claims: stagedClaims,
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

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > 1_000_000) {
      throw new Error("Workbench request body is too large.");
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
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
              <label class="field" for="quick-capture-observed-at"><span>Quick observed at</span><input id="quick-capture-observed-at" name="observedAt" placeholder="YYYY-MM-DD"></label>
              <label class="field" for="quick-capture-source-preset"><span>Source label preset</span><select id="quick-capture-source-preset" name="sourcePreset">
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
let dogfoodHome = null;
let dogfoodEvalResult = null;
let useTomorrow = null;
let dailyQueue = null;
let dailySession = null;
let dailyQueueIndex = 0;
let activationStatus = null;
let activeTab = "today";
let reviewReasonFilter = "all";
let reviewLaneFilter = "all";
let reviewTurbo = null;
let transactionStateFilter = "pending";
let transactionDetail = null;
let briefTargets = { person: null, context: null };
let pendingBriefRequest = null;
let entityKind = "person";
let entityList = null;
let entityDetail = null;
let importTriageUnits = [];
let captureInbox = null;

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
  await runQuickCapture(preview ? "/api/capture/preview" : "/api/capture", {
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
  return custom || form.elements.sourcePreset.value;
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
      useTomorrow = null;
      dailyQueue = null;
      dailyQueueIndex = 0;
      activationStatus = null;
      reviewTurbo = null;
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
      \${metricHtml("Missing-memory guidance", metrics.missing_memory_guidance_count)}
      \${metricHtml("Review/follow-up surfacing", metrics.review_followup_surfacing_count)}
      \${metricHtml("Generated persistence violations", metrics.generated_persistence_violations)}
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
    \${dogfoodEvalMissingHtml(question)}
  </article>\`;
}

function dogfoodEvalFoundHtml(label, items) {
  return items.length ? plainListHtml(label, items) : "";
}

function dogfoodEvalMissingHtml(question) {
  const missing = [
    ...missingExpected("Missing claims", question.expected_claim_ids, question.found_claim_ids),
    ...missingExpected("Missing Events", question.expected_event_ids, question.found_event_ids),
    ...missingExpected("Missing pages", question.expected_page_paths, question.found_page_paths),
    ...missingExpected("Missing ReviewItems", question.expected_review_ids, question.found_review_ids),
    ...missingExpected("Missing FollowUps", question.expected_followup_ids, question.found_followup_ids)
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
    \`missing_memory_guidance_count: \${metrics.missing_memory_guidance_count}\`,
    \`review_followup_surfacing_count: \${metrics.review_followup_surfacing_count}\`,
    \`generated_persistence_violations: \${metrics.generated_persistence_violations}\`,
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
  if (!dogfoodHome || !activationStatus || !dailyQueue || !dailySession || !useTomorrow) {
    view.innerHTML = '<article class="item"><h2>Loading Dogfood Home</h2><p class="meta">Reading local markdown memory.</p></article>';
    const [loadedHome, loadedActivationStatus, loadedDailyQueue, loadedDailySession, loadedUseTomorrow] = await Promise.all([
      fetchJson("/api/dogfood/home"),
      fetchJson("/api/activation/status"),
      fetchJson("/api/daily/queue"),
      fetchJson("/api/daily/session"),
      fetchJson("/api/use-tomorrow")
    ]);
    dogfoodHome = loadedHome;
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
  renderDogfoodHome(dogfoodHome, dailyQueue, useTomorrow, dailySession);
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

function renderDogfoodHome(result, queue, tomorrow, session) {
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
  \${todayPendingTransactionsHtml(result.pending_transactions)}
  \${todayReviewGroupsHtml(result.staged_review_groups)}
  \${todayStaleNoopsHtml(result.stale_noop_events)}
  \${todayFollowupsHtml(result.open_followups)}
  \${todayFrictionLogsHtml(result.recent_friction_logs ?? [])}
  \${todayEventsHtml(result.recent_events)}
  \${todayRecentTransactionsHtml(result.recent_transactions)}
  \${todayTextListSection("Health warnings", result.health_warnings, "No health warnings.")}
  \${todayTextListSection("Read warnings", result.warnings, "No read warnings.")}
  \${todayTextListSection("Suggested manual actions", result.suggested_manual_actions, "No suggested manual actions.")}
  <div id="today-action-output" class="action-output"></div>\`;
  bindTodayActions();
  bindBriefLinks();
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

function renderImport() {
  view.innerHTML = \`<article class="item">
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
        output.innerHTML = "";
      } else {
        output.innerHTML = renderImportResult(result);
      }
    } catch (error) {
      output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
    }
  });
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
      ["Estimated review units", String(result.estimated_review_load?.units_needing_review ?? 0)]
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
      ["Skipped", String(result.units_skipped)]
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
      ["Estimated review units", String(result.estimated_review_load?.units_needing_review ?? 0)]
    ])}
    \${plainListHtml("Duplicate groups", (result.duplicate_groups ?? []).map((group) => \`\${group.source_hash.slice(0, 12)}: \${group.unit_ids.join(", ")}\`))}
  </article>
  <section><h2>Triage units</h2><div class="grid">\${units || '<article class="item"><h3>Empty</h3><p class="meta">No triage units.</p></article>'}</div></section>\`;
}

async function renderEntities() {
  const requestedKind = entityKind;
  view.innerHTML = '<article class="item"><h2>Loading entities</h2><p class="meta">Reading People, Topics, and Contexts.</p></article>';
  const loadedEntities = await fetchJson(\`/api/entities?kind=\${encodeURIComponent(requestedKind)}\`);

  if (activeTab !== "entities" || requestedKind !== entityKind) {
    return;
  }

  entityList = loadedEntities;
  renderEntityExplorer();
}

function renderEntityExplorer() {
  const filters = ["person", "topic", "context"].map((kind) => \`<button type="button" class="reason-filter" data-entity-kind="\${kind}" aria-pressed="\${String(entityKind === kind)}">
    <strong>\${kind === "person" ? "People" : kind === "topic" ? "Topics" : "Contexts"}</strong>
    <span>Inspect evidence, reviews, follow-ups, and stage stewardship changes.</span>
  </button>\`).join("");
  const cards = (entityList?.items ?? []).map((item) => \`<article class="item">
    <h3>\${escapeHtml(item.name)}</h3>
    <p class="pill">\${escapeHtml(item.id ?? item.path)}</p>
    \${detailListHtml([
      ["Path", item.path],
      ["Aliases", item.aliases.join(", ") || "none"],
      ["Claims", \`active \${item.active_claims}, staged \${item.staged_claims}, superseded \${item.superseded_claims}\`]
    ])}
    <div class="action-row"><button type="button" class="secondary entity-detail-load" data-entity-id="\${escapeHtml(item.id ?? item.path)}">Open detail</button></div>
  </article>\`).join("");

  view.innerHTML = \`<section>
    <h2>People, Topics, Contexts</h2>
    <div class="summary-strip">\${filters}</div>
  </section>
  <section class="transaction-layout">
    <div class="grid">\${cards || '<article class="item"><h2>Empty</h2><p class="meta">No matching entities.</p></article>'}</div>
    <div id="entity-detail" class="detail-panel">\${entityDetail ? entityDetailHtml(entityDetail) : '<article class="item"><h2>Entity detail</h2><p class="meta">Select a Person, Topic, or Context to inspect claims and evidence.</p></article>'}</div>
  </section>
  <div id="entity-action-output" class="action-output"></div>\`;
  bindEntityActions();
  bindBriefLinks();
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
      \${entityContextNoteFormHtml(detail)}
    </div>
  </article>
  \${contextOperatingPageHtml(detail.contextOperatingPage)}
  \${entityClaimSectionHtml("Active claims", detail.activeClaims)}
  \${entityClaimSectionHtml("Staged claims", detail.stagedClaims)}
  \${entityClaimSectionHtml("Superseded claims", detail.supersededClaims)}
  \${entityListSectionHtml("Evidence Events", detail.evidenceEvents, (event) => \`\${event.id} · \${event.path}\`)}
  \${entityListSectionHtml("Linked ReviewItems", detail.linkedReviewItems, (item) => \`\${item.id} · \${item.review_reason ?? "review"} · \${item.path}\`)}
  \${entityListSectionHtml("Linked FollowUps", detail.linkedFollowUps, (item) => \`\${item.id} · \${item.followup_state} · \${item.path}\`)}
  \${entityListSectionHtml("Related pages", detail.relatedPages, (item) => \`\${item.id ?? item.path} · \${item.type ?? "page"} · \${item.path}\`)}\`;
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

  return \`<div class="action-row">
    \${briefLinkButtonHtml(detail.type, detail.type, target, label)}
    \${briefLinkButtonHtml("recent", detail.type, target, "Recent changes")}
  </div>\`;
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
  return entityListSectionHtml(label, claims, (claim) => \`\${claim.claim_id}: \${claim.statement} [events: \${claim.evidence.join(", ") || "none"}]\`);
}

function entityListSectionHtml(label, items, renderItem) {
  const body = items.length
    ? \`<ul class="plain-list">\${items.map((item) => \`<li>\${escapeHtml(renderItem(item))}</li>\`).join("")}</ul>\`
    : '<p class="meta">None.</p>';

  return \`<article class="item"><h3>\${escapeHtml(label)}</h3>\${body}</article>\`;
}

function bindEntityActions() {
  for (const button of document.querySelectorAll("[data-entity-kind]")) {
    button.addEventListener("click", () => {
      entityKind = button.dataset.entityKind;
      entityList = null;
      entityDetail = null;
      void renderEntities();
    });
  }

  for (const button of document.querySelectorAll(".entity-detail-load")) {
    button.addEventListener("click", async () => {
      const requestedId = button.dataset.entityId;
      const requestedKind = entityKind;
      const loadedDetail = await fetchJson(\`/api/entities/detail?id=\${encodeURIComponent(requestedId)}\`);

      if (activeTab !== "entities" || requestedKind !== entityKind || requestedId !== button.dataset.entityId) {
        return;
      }

      entityDetail = loadedDetail;
      renderEntityExplorer();
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
}

async function runEntityAction(path, body) {
  const output = document.querySelector("#entity-action-output");
  output.innerHTML = "<pre>Running</pre>";

  try {
    const result = await postJson(path, body);
    if (result.created) {
      snapshot = await fetchJson("/api/snapshot");
      dogfoodHome = null;
      useTomorrow = null;
      health = null;
      reviewTurbo = null;
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
    useTomorrow = null;
    reviewTurbo = null;
    transactionDetail = await fetchJson(\`/api/transactions/detail?id=\${encodeURIComponent(result.transaction_id)}\`).catch(() => null);
    renderTransactions();
    document.querySelector("#transaction-action-output").innerHTML = renderActionResult(result);
  } catch (error) {
    output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
  }
}

async function renderReview() {
  if (!reviewTurbo) {
    view.innerHTML = '<article class="item"><h2>Loading review lanes</h2><p class="meta">Reading staged ReviewItems.</p></article>';
    reviewTurbo = await fetchJson("/api/review/turbo");

    if (activeTab !== "review") {
      return;
    }
  }

  renderReviewTurbo(reviewTurbo);
}

function renderReviewTurbo(turbo) {
  const items = turbo.items.filter((item) =>
    (reviewReasonFilter === "all" || item.review_reason === reviewReasonFilter) &&
    (reviewLaneFilter === "all" || item.lane_id === reviewLaneFilter)
  );
  const cards = items.length
    ? items.map((item) => reviewCardHtml(item)).join("")
    : '<article class="item"><h2>Empty</h2><p class="meta">No matching memory objects.</p></article>';

  view.innerHTML = \`\${reviewLaneSummaryHtml(turbo)}
  \${reviewSummaryHtml(snapshot.review)}
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
  bindReviewActions();
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

function bindReviewFilters() {
  for (const button of document.querySelectorAll("[data-review-lane]")) {
    button.addEventListener("click", () => {
      reviewLaneFilter = button.dataset.reviewLane ?? "all";
      renderReviewTurbo(reviewTurbo);
    });
  }

  for (const button of document.querySelectorAll("[data-review-reason]")) {
    button.addEventListener("click", () => {
      reviewReasonFilter = button.dataset.reviewReason ?? "all";
      renderReviewTurbo(reviewTurbo);
    });
  }
}

function reviewCardHtml(item) {
  const defaultTarget = item.affected_files[0] ? memoryPath(item.affected_files[0]) : "";
  const details = [
    ["Review path", item.path],
    ["Source Events", item.source_events.join(", ") || "none"],
    ["Affected files", item.affected_files.join(", ") || "none"],
    ["Linked transaction", item.linked_transaction ?? "none"],
    ["Staged claims", item.staged_claim_ids.join(", ") || "none"],
    ["Suggested action", item.suggested_action]
  ];

  return \`<article class="item">
    <h2>\${escapeHtml(item.id)}</h2>
    <p class="pill">\${escapeHtml(item.lane_label ? \`\${item.lane_label} · \` : "")}\${escapeHtml(item.review_reason)} · \${escapeHtml(item.review_state)}</p>
    \${detailListHtml(details)}
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

function reviewClaimDiffCardsHtml(claims) {
  if (!claims.length) {
    return '<p class="meta">No staged claim block found. Mark, contest, archive, or inspect the source ReviewItem manually.</p>';
  }

  return \`<section class="claim-diff-list">
    <h3>Staged claim summary</h3>
    \${claims.map((claim) => \`<div class="claim-diff-card">
      <p><strong>\${escapeHtml(claim.claim_id)}</strong></p>
      <p>\${escapeHtml(claim.statement || "No statement text.")}</p>
      <p class="meta">claim_kind: \${escapeHtml(claim.claim_kind ?? "unknown")} · claim_state: \${escapeHtml(claim.claim_state ?? "unknown")} · evidence_strength: \${escapeHtml(claim.evidence_strength ?? "unknown")}</p>
      <p class="meta">scope: \${escapeHtml(claim.scope ?? "none")} · scope_state: \${escapeHtml(claim.scope_state ?? "unknown")} · evidence: \${escapeHtml(claim.evidence.join(", ") || "none")}</p>
    </div>\`).join("")}
  </section>\`;
}

function bindReviewActions() {
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
  useTomorrow = null;
  reviewTurbo = null;
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
  const cannotConfirm = [
    ...(result.missingInformation ?? []).map((item) => ({
      title: item.code,
      badge: "missing information",
      body: item.message,
      details: []
    })),
    ...(result.warnings ?? []).map((warning) => ({
      title: "warning",
      badge: "retrieval warning",
      body: warning,
      details: []
    }))
  ];
  const sections = [
    pinnedQuestionsHtml(session ?? { query: result.query, pinned_questions: [] }),
    retrievalPlanHtml(result),
    askSectionHtml("Answer candidates", result.answerCandidates ?? [], answerCandidateHtml, "No active answer candidates found."),
    askSectionHtml("Supporting claims", result.supportingClaims ?? [], claimHtml, "No active supporting claims were loaded."),
    citationExplorerHtml(session?.citation_explorer ?? citationExplorerFromBasis(result)),
    askSectionHtml("Matched page preview", session?.matched_page_previews ?? [], matchedPagePreviewHtml, "No matched page previews."),
    askSectionHtml("Source Event preview", session?.source_event_previews ?? [], sourceEventPreviewHtml, "No source Event previews."),
    askSectionHtml("What memory cannot confirm", cannotConfirm, missingInfoHtml, "No missing information detected for loaded active claims."),
    askSectionHtml("Uncertainty", result.uncertainClaims ?? [], uncertainClaimHtml, "No staged, partial, superseded, rejected, or contested claims were loaded."),
    askSectionHtml("Evidence Events", result.evidenceEvents ?? [], eventHtml, "No cited Event pages were loaded."),
    askSectionHtml("Linked ReviewItems", result.linkedReviewItems ?? [], linkedItemHtml, "No linked ReviewItems."),
    askSectionHtml("Linked FollowUps", result.linkedFollowUps ?? [], linkedItemHtml, "No linked FollowUps."),
    askSectionHtml("Suggested manual actions", result.manualActions ?? [], manualActionHtml, "No suggested manual actions."),
    missingMemoryActionHtml(result, session),
    askFrictionLogHtml(result),
    askSectionHtml("Suggested next questions", (result.suggestedNextQuestions ?? []).map((question) => ({ question })), nextQuestionHtml, "No suggested next questions."),
    askSectionHtml("Matched pages", result.matchedPages ?? [], pageSummaryHtml, "No matched people, topics, or contexts."),
    contextPackHtml(result.contextPack)
  ];

  document.querySelector("#ask-result").innerHTML = sections.join("");
  bindCopyControls();
  bindAskPinQuestion(session ?? { query: result.query, pinned_questions: [] });
  bindAskMissingMemory(result);
  bindAskFrictionLog(result);
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
  const claimIds = [
    ...(result.answerCandidates ?? []).map((candidate) => candidate.claim_id),
    ...(result.supportingClaims ?? []).map((claim) => claim.claim_id),
    ...(result.uncertainClaims ?? []).map((claim) => claim.claim_id)
  ];
  const eventIds = [
    ...(result.evidenceEvents ?? []).map((event) => event.id),
    ...(result.answerCandidates ?? []).flatMap((candidate) => candidate.evidence ?? []),
    ...(result.supportingClaims ?? []).flatMap((claim) => claim.evidence ?? [])
  ];

  return {
    claim_ids: uniqueClientStrings(claimIds),
    event_ids: uniqueClientStrings(eventIds),
    page_paths: uniqueClientStrings([
      ...(result.matchedPages ?? []).map((page) => page.path),
      ...(result.answerCandidates ?? []).map((candidate) => candidate.page_path),
      ...(result.supportingClaims ?? []).map((claim) => claim.page_path)
    ]),
    review_item_ids: uniqueClientStrings((result.linkedReviewItems ?? []).map((item) => item.id)),
    followup_ids: uniqueClientStrings((result.linkedFollowUps ?? []).map((item) => item.id))
  };
}

function citationExplorerHtml(explorer) {
  const rows = [
    ["Claim IDs", explorer.claim_ids ?? []],
    ["Event IDs", explorer.event_ids ?? []],
    ["Page paths", explorer.page_paths ?? []],
    ["ReviewItems", explorer.review_item_ids ?? []],
    ["FollowUps", explorer.followup_ids ?? []]
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
    <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(lines.join("; "))}">Copy citation</button>
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
  return \`<article class="item ask-card">
    <h3>\${escapeHtml(item.title)}</h3>
    <p class="pill">\${escapeHtml(item.badge)}</p>
    <p>\${escapeHtml(item.body)}</p>
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
        useTomorrow = null;
        reviewTurbo = null;
      }

      output.innerHTML = renderActionResult(action);
    } catch (error) {
      output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
    }
  });
}

function nextQuestionHtml(item) {
  return \`<article class="item ask-card">
    <h3>Suggested question</h3>
    <p>\${escapeHtml(item.question)}</p>
  </article>\`;
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
  if (!health) {
    view.innerHTML = '<article class="item"><h2>Loading health</h2><p class="meta">Reading markdown state.</p></article>';
    const loadedHealth = await fetchJson("/api/health");
    health = loadedHealth;

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
  \${countCards}
  <section><h2>Findings</h2>\${findingCards}</section>
  <div id="action-output" class="action-output"></div>\`;
  bindHealthActions();
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
