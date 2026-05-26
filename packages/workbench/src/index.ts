import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import {
  applyTransaction,
  checkMemoryHealth,
  buildSessionBrief,
  createHealthReviewTransaction,
  createReviewApplyTransaction,
  createReviewStateTransaction,
  listMarkdownFiles,
  listReviewItems,
  parseClaimBlockRecords,
  parseMarkdownFile,
  parseTransactionMarkdown,
  readMarkdownPage,
  rejectTransaction,
  reprocessEvent,
  showReviewItem,
  transactionFilePaths,
  retrieveContextForAnswer,
  validateTransaction,
  type ContextPackResult,
  type FrontmatterValue,
  type IngestNoteResult,
  type HealthReviewTransactionResult,
  type MemoryHealthResult,
  type ParsedTransaction,
  type ReviewActionState,
  type ReviewStateTransactionResult,
  type ReviewItemSummary,
  type SessionBriefKind,
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

  if (requestUrl.pathname === "/api/review") {
    return jsonRoute(200, await collectReviewInbox(root));
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

  if (requestUrl.pathname === "/api/followups") {
    return jsonRoute(200, await collectFollowups(root));
  }

  if (requestUrl.pathname === "/api/health") {
    return jsonRoute(200, await checkMemoryHealth(root));
  }

  if (requestUrl.pathname === "/api/brief") {
    const kind = optionalBriefKind(requestUrl);

    if (!kind) {
      return jsonRoute(400, { error: "Missing required query parameter: kind." });
    }

    return jsonRoute(200, await buildSessionBrief(root, { kind, target: optionalTarget(requestUrl) }));
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

    if (pathname === "/api/health/stage-review/preview") {
      return jsonRoute(200, await createHealthStagePreview(root, input, false));
    }

    if (pathname === "/api/health/stage-review") {
      return jsonRoute(200, await createHealthStagePreview(root, input, true));
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

async function enrichReviewItem(root: string, summary: ReviewItemSummary): Promise<WorkbenchReviewItem> {
  try {
    const detail = await showReviewItem(root, summary.id);

    return {
      ...summary,
      source_events: stringArrayValue(detail.parsed.frontmatter.source_events),
      affected_files: stringArrayValue(detail.parsed.frontmatter.affected_files),
      linked_transaction: stringValue(detail.parsed.frontmatter.linked_transaction),
      staged_claim_ids: parseClaimBlockRecords(detail.parsed.body)
        .map((claim) => stringValue(claim.fields.claim_id))
        .filter((claimId): claimId is string => Boolean(claimId)),
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

function optionalBriefKind(requestUrl: URL): SessionBriefKind | undefined {
  const kind = requestUrl.searchParams.get("kind")?.trim();

  if (kind === "today" || kind === "person" || kind === "context" || kind === "review" || kind === "followups") {
    return kind;
  }

  return undefined;
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
        <output id="status" class="status">Loading</output>
      </header>
      <nav class="tabs" aria-label="Workbench">
        <button type="button" data-tab="review" aria-pressed="true">Review</button>
        <button type="button" data-tab="transactions" aria-pressed="false">Transactions</button>
        <button type="button" data-tab="ask" aria-pressed="false">Ask</button>
        <button type="button" data-tab="health" aria-pressed="false">Health</button>
        <button type="button" data-tab="briefs" aria-pressed="false">Briefs</button>
      </nav>
      <section id="view" class="view" aria-live="polite"></section>
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
select {
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

.toolbar,
.action-row {
  align-items: center;
  display: flex;
  gap: 8px;
}

.toolbar input,
.action-row input,
.action-row select {
  border: 1px solid var(--line);
  border-radius: 6px;
  flex: 1;
  min-height: 38px;
  padding: 8px 10px;
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

.action-row button.secondary {
  background: transparent;
  color: var(--accent);
}

.action-stack {
  border-top: 1px solid var(--line);
  display: grid;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
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

  .transaction-layout {
    grid-template-columns: 1fr;
  }
}
`;
}

function workbenchClientJs(): string {
  return `const view = document.querySelector("#view");
const status = document.querySelector("#status");
let snapshot = null;
let health = null;
let activeTab = "review";
let reviewReasonFilter = "all";
let transactionStateFilter = "pending";
let transactionDetail = null;

for (const button of document.querySelectorAll("[data-tab]")) {
  button.addEventListener("click", () => {
    activeTab = button.dataset.tab;
    for (const tab of document.querySelectorAll("[data-tab]")) {
      tab.setAttribute("aria-pressed", String(tab === button));
    }
    render();
  });
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

  if (activeTab === "review") {
    renderReview();
    return;
  }

  if (activeTab === "transactions") {
    renderTransactions();
    return;
  }

  if (activeTab === "ask") {
    view.innerHTML = \`<form class="toolbar" id="ask-form">
      <input id="ask-input" name="q" value="Who is my manager?">
      <button type="submit">Ask</button>
    </form>
    <div id="ask-result" class="ask-result"></div>
    <output id="copy-output" class="copy-output" aria-live="polite"></output>\`;
    document.querySelector("#ask-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const question = document.querySelector("#ask-input").value.trim();

      if (!question) {
        document.querySelector("#ask-result").innerHTML = '<article class="item"><h2>Ask</h2><p class="meta">Enter a question to retrieve deterministic memory context.</p></article>';
        return;
      }

      document.querySelector("#ask-result").innerHTML = '<article class="item"><h2>Loading</h2><p class="meta">Reading markdown memory.</p></article>';

      try {
        const result = await fetchJson(\`/api/ask?q=\${encodeURIComponent(question)}\`);
        renderAnswerBasis(result);
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
    transactionDetail = await fetchJson(\`/api/transactions/detail?id=\${encodeURIComponent(result.transaction_id)}\`).catch(() => null);
    renderTransactions();
    document.querySelector("#transaction-action-output").innerHTML = renderActionResult(result);
  } catch (error) {
    output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
  }
}

function renderReview() {
  const items = reviewReasonFilter === "all"
    ? snapshot.review.items
    : snapshot.review.items.filter((item) => item.review_reason === reviewReasonFilter);
  const cards = items.length
    ? items.map((item) => reviewCardHtml(item)).join("")
    : '<article class="item"><h2>Empty</h2><p class="meta">No matching memory objects.</p></article>';

  view.innerHTML = \`\${reviewSummaryHtml(snapshot.review)}
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
  for (const button of document.querySelectorAll("[data-review-reason]")) {
    button.addEventListener("click", () => {
      reviewReasonFilter = button.dataset.reviewReason ?? "all";
      renderReview();
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
    <p class="pill">\${escapeHtml(item.review_reason)} · \${escapeHtml(item.review_state)}</p>
    \${detailListHtml(details)}
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
    snapshot = await fetchJson("/api/snapshot");
    health = null;
    render();
    document.querySelector("#action-output").innerHTML = renderActionResult(result);
  } catch (error) {
    output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
  }
}

function renderActionResult(result) {
  const mode = actionModeLabel(result);
  const summary = [
    ["Action", formatAction(result.action)],
    ["Mode", mode],
    ["Transaction", result.transaction_id],
    ["Transaction path", result.transaction_path],
    ["State", result.transaction_state],
    ["Risk", result.risk_level ?? "unspecified"],
    ["Requires review", String(Boolean(result.requires_review))]
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
    \${plainListHtml("Proposed file writes", result.proposed_file_writes)}
  </article>\`;
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
  renderAskResult(result);
}

function renderAskResult(result) {
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
    askSectionHtml("Answer candidates", result.answerCandidates ?? [], answerCandidateHtml, "No active answer candidates found."),
    askSectionHtml("Supporting claims", result.supportingClaims ?? [], claimHtml, "No active supporting claims were loaded."),
    askSectionHtml("What memory cannot confirm", cannotConfirm, missingInfoHtml, "No missing information detected for loaded active claims."),
    askSectionHtml("Uncertainty", result.uncertainClaims ?? [], uncertainClaimHtml, "No staged, partial, superseded, rejected, or contested claims were loaded."),
    askSectionHtml("Evidence Events", result.evidenceEvents ?? [], eventHtml, "No cited Event pages were loaded."),
    askSectionHtml("Linked ReviewItems", result.linkedReviewItems ?? [], linkedItemHtml, "No linked ReviewItems."),
    askSectionHtml("Linked FollowUps", result.linkedFollowUps ?? [], linkedItemHtml, "No linked FollowUps."),
    askSectionHtml("Matched pages", result.matchedPages ?? [], pageSummaryHtml, "No matched people, topics, or contexts."),
    contextPackHtml(result.contextPack)
  ];

  document.querySelector("#ask-result").innerHTML = sections.join("");
  bindCopyControls();
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
  return \`<article class="item ask-card">
    <h3>\${escapeHtml(page.name)}</h3>
    <p class="pill">\${escapeHtml(page.type ?? "page")} · score \${escapeHtml(page.score ?? 0)}</p>
    \${citationLinesHtml(lines)}
    \${plainListHtml("Matched terms", page.matchedTerms ?? [])}
    \${plainListHtml("Uncertainty markers", page.uncertaintyMarkers ?? [])}
    <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(lines.join("; "))}">Copy citation</button>
  </article>\`;
}

function missingInfoHtml(item) {
  return \`<article class="item ask-card">
    <h3>\${escapeHtml(item.title)}</h3>
    <p class="pill">\${escapeHtml(item.badge)}</p>
    <p>\${escapeHtml(item.body)}</p>
  </article>\`;
}

function contextPackHtml(contextPack) {
  const text = contextPack ?? "";
  return \`<section data-ask-section="context-pack"><h2>Context pack</h2>
    <details class="context-pack">
      <summary>Show raw compatibility pack</summary>
      <pre>\${escapeHtml(text)}</pre>
    </details>
    <button type="button" class="copy-derived-text" data-copy-text="\${escapeHtml(text)}">Copy context pack</button>
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
      await copyDerivedText(button.dataset.copyText ?? "");
    });
  }
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

function renderBriefs() {
  view.innerHTML = \`<form class="toolbar" id="brief-form">
    <select id="brief-kind" name="kind">
      <option value="today">today</option>
      <option value="person">person</option>
      <option value="context">context</option>
      <option value="review">review</option>
      <option value="followups">followups</option>
    </select>
    <input id="brief-target" name="target" placeholder="Person or Context id/path">
    <button type="submit">Build</button>
  </form><div id="brief-result" class="grid"></div>\`;
  document.querySelector("#brief-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const kind = document.querySelector("#brief-kind").value;
    const target = document.querySelector("#brief-target").value.trim();
    const query = new URLSearchParams({ kind });

    if (target) {
      query.set("target", target);
    }

    const result = await fetchJson(\`/api/brief?\${query.toString()}\`);
    renderBrief(result);
  });
}

function renderBrief(result) {
  const sections = [
    sectionHtml(
      "Active claims",
      result.activeClaims,
      (claim) => claim.claim_id,
      (claim) => claim.statement,
      (claim) => [claim.page_path, claim.evidence.join(", "), claim.scope_state]
    ),
    sectionHtml(
      "Uncertainty and review",
      [...result.uncertainClaims, ...result.reviewItems],
      (item) => item.claim_id ?? item.id,
      (item) => item.statement ?? item.review_reason ?? item.review_state,
      (item) => item.page_path ? [item.page_path, item.uncertainty_markers.join(", ")] : [item.path, item.source_events.join(", ")]
    ),
    sectionHtml(
      "Open follow-ups",
      result.openFollowUps,
      (followup) => followup.id,
      (followup) => followup.followup_state,
      (followup) => [followup.path, followup.owner, followup.source_events.join(", ")]
    ),
    sectionHtml(
      "Source Events",
      result.evidenceEvents,
      (event) => event.id,
      (event) => event.path,
      (event) => [event.recorded_at, event.observed_at]
    )
  ];

  document.querySelector("#brief-result").innerHTML = \`<article class="item">
    <h2>\${escapeHtml(result.title)}</h2>
    <p class="pill">\${escapeHtml(result.kind)}</p>
    \${result.warnings.map((warning) => \`<p class="meta">\${escapeHtml(warning)}</p>\`).join("")}
  </article>\${sections.join("")}\`;
}

function sectionHtml(label, items, title, badge, details) {
  return \`<section><h2>\${escapeHtml(label)}</h2>\${cardsHtml(items, title, badge, details)}</section>\`;
}

function memoryPath(file) {
  return file.startsWith("memory/") ? file : \`memory/\${file}\`;
}

async function renderHealth() {
  if (!health) {
    view.innerHTML = '<article class="item"><h2>Loading health</h2><p class="meta">Reading markdown state.</p></article>';
    health = await fetchJson("/api/health");
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
  const findingCards = cardsHtml(
    result.findings,
    (finding) => finding.code.replaceAll("_", " "),
    (finding) => finding.severity,
    (finding) => [finding.message, finding.affected_files.join(", "), finding.source_events.join(", "), finding.suggested_action]
  );

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
  document.querySelector("#health-stage-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = event.submitter;
    const preview = submitter?.value === "preview";
    await runAction(preview ? "/api/health/stage-review/preview" : "/api/health/stage-review", {
      note: form.elements.note.value
    });
  });
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
